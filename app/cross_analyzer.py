"""app/cross_analyzer.py — Cross-response findings layer.

Reads per-response extractions (response_extractions, model_responses) and
produces findings ACROSS a whole refresh — asymmetry between paired prompts,
top quotes, share-of-voice (when mention detection is populated), narrative
drift (when multi-refresh history exists).

Distinct from app/analyzer.py:
- analyzer.py: unit of work is one model_response; writes response_extractions.
- cross_analyzer.py: unit of work is one refresh_run; writes refresh_analyses.

CLI:
    python -m app.cross_analyzer <refresh_run_id>
        [--use-analysis-run N]   # which analysis_run's extractions to use
                                  # (default: latest completed for this refresh)
"""
from __future__ import annotations

import argparse
import json
import os
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

import psycopg
from dotenv import load_dotenv
from google import genai
from google.genai import types
from psycopg.types.json import Json

from app.db import get_database_url


load_dotenv()

CROSS_METHODOLOGY_VERSION = "cross-analysis-1.0.0"

# Per-1M-token pricing for the Gemini models we use in cross-analysis.
# Mirrors app/analyzer.py — keep in sync if pricing tiers change.
_PRICING: dict[str, dict[str, Decimal]] = {
    "gemini-2.5-flash":      {"input": Decimal("0.30"), "output": Decimal("2.50")},
    "gemini-2.5-flash-lite": {"input": Decimal("0.075"), "output": Decimal("0.30")},
}
_PER_TOKEN = Decimal(1_000_000)


# ─── data shapes ───────────────────────────────────────────────────────


@dataclass
class CrossAnalysisResult:
    """One refresh_analyses row to be written."""

    analysis_type: str           # 'asymmetry' | 'top_quotes' | 'share_of_voice' | 'narrative_drift'
    analysis_key: str | None     # sub-key — e.g., 'favorable_vs_adversarial'
    model_id: int | None         # NULL for global (cross-model) findings
    findings: dict[str, Any]     # JSONB payload
    source_response_ids: list[int]
    summary: str | None = None
    confidence: float | None = None
    cost_usd: Decimal = Decimal(0)
    latency_ms: int = 0
    error: str | None = None


@dataclass
class ResponseRow:
    """One row from the join of model_responses + prompts + models +
    response_extractions. Loaded once per refresh and shared across all
    CrossAnalyzer subclasses.
    """

    model_response_id: int
    refresh_run_id: int
    subject_id: int
    model_id: int
    model_slug: str
    prompt_id: int
    layer: str
    position: int
    dimension: str
    response_text: str
    response_metadata: dict
    # extraction outputs (may be None if a particular extractor didn't run)
    descriptors: list | None
    entities: list | None
    sources: list | None
    total_sources_cited: int | None
    scores: dict | None
    narrative_themes: list | None
    dominant_theme: str | None
    # mention_detection columns — only populated for unnamed-layer responses
    # after Track C's MentionDetectionExtractor v1.0 has run on them
    subject_mentioned: bool | None
    mention_rank: int | None
    mention_strength: str | None      # 'primary' | 'listed' | 'aside'
    mention_excerpt: str | None
    competitors_mentioned: list | None
    disambiguation_confidence: float | None


@dataclass
class RefreshContext:
    """Everything a CrossAnalyzer needs to operate on a refresh."""

    refresh_run_id: int
    subject_id: int
    subject_name: str
    subject_category_slug: str
    setup_inputs: dict
    source_analysis_run_id: int  # which analysis_run's extractions we read
    responses: list[ResponseRow]


# ─── analyzer ABC ──────────────────────────────────────────────────────


class CrossAnalyzer(ABC):
    """One cross-response analysis pass over a refresh.

    Subclasses produce one or more CrossAnalysisResult rows. Pure-Python
    implementations are encouraged for analyzers that compare existing
    per-response extractions (asymmetry, share-of-voice). LLM calls are
    appropriate for top-quotes selection or narrative-drift summaries.
    """

    name: str
    version: str

    @abstractmethod
    def analyze(self, ctx: RefreshContext) -> list[CrossAnalysisResult]: ...


# ─── asymmetry analyzer ────────────────────────────────────────────────
#
# Each category has prompt pair(s) where the methodology is built around
# comparing the two responses. Asymmetry computes the gap on multiple
# dimensions and writes one finding per (model, pair).
#
# Pair selection per category:
#   - person       : named/2 (substantive record)        ↔ named/3 (adversarial defense)
#   - organization : named/2 (substantive track record)  ↔ named/3 (criticism)
#   - issue        : named/3 (case for position_a)       ↔ named/4 (case for position_b)
#   - policy       : named/2 (favorable)                 ↔ named/3 (adversarial)
#   - event        : named/1 (descriptive baseline)      ↔ named/3 (interpretive framing)

_ASYMMETRY_PAIRS: dict[str, list[tuple[tuple[str, int], tuple[str, int], str]]] = {
    "person":       [(("named", 2), ("named", 3), "substantive_vs_adversarial")],
    "organization": [(("named", 2), ("named", 3), "track_record_vs_criticism")],
    "issue":        [(("named", 3), ("named", 4), "position_a_vs_position_b")],
    "policy":       [(("named", 2), ("named", 3), "favorable_vs_adversarial")],
    "event":        [(("named", 1), ("named", 3), "descriptive_vs_interpretive")],
}


def _side_summary(row: ResponseRow) -> dict[str, Any]:
    """The numeric snapshot of one response that goes into the asymmetry
    finding. Source-type breakdown is a Counter-shaped dict."""
    from collections import Counter
    sources = row.sources or []
    src_breakdown = Counter(
        s.get("source_type_slug", "unknown") for s in sources if isinstance(s, dict)
    )
    citations = (row.response_metadata or {}).get("citations") or []
    return {
        "model_response_id": row.model_response_id,
        "response_length_chars": len(row.response_text or ""),
        "descriptor_count":      len(row.descriptors or []),
        "entity_count":          len(row.entities or []),
        "citation_count":        len(citations),
        "sources_classified":    row.total_sources_cited or 0,
        "source_type_breakdown": dict(src_breakdown),
        "scores":                row.scores or {},
        "dominant_theme":        row.dominant_theme,
    }


def _compute_gaps(left: dict, right: dict) -> dict[str, Any]:
    """The per-dimension delta from left to right.

    Sign convention: gap = right - left. Positive sentiment_gap means right
    is more positive than left. Positive criticism_severity_gap means right
    is more critical than left (which is the EXPECTED direction for
    descriptive→adversarial pairs — the gap quantifies how much).
    """
    def safe_score(d: dict, k: str) -> float:
        v = (d.get("scores") or {}).get(k)
        try:
            return float(v) if v is not None else 0.0
        except Exception:
            return 0.0

    left_len = left["response_length_chars"]
    right_len = right["response_length_chars"]
    left_cites = left["citation_count"]
    right_cites = right["citation_count"]

    return {
        # length / volume
        "length_diff_chars":  right_len - left_len,
        "length_ratio_r_over_l": (right_len / left_len) if left_len else None,
        "descriptor_count_diff": right["descriptor_count"] - left["descriptor_count"],
        "entity_count_diff":     right["entity_count"] - left["entity_count"],
        # sourcing
        "citation_count_diff":      right_cites - left_cites,
        "citation_ratio_r_over_l":  (right_cites / left_cites) if left_cites else None,
        # scores
        "sentiment_gap":          safe_score(right, "sentiment") - safe_score(left, "sentiment"),
        "directional_lean_gap":   safe_score(right, "directional_lean") - safe_score(left, "directional_lean"),
        "certainty_gap":          safe_score(right, "certainty") - safe_score(left, "certainty"),
        "criticism_severity_gap": safe_score(right, "criticism_severity") - safe_score(left, "criticism_severity"),
    }


def _summarize_asymmetry(
    left: dict, right: dict, gaps: dict,
    left_slot: tuple[str, int], right_slot: tuple[str, int],
    model_slug: str,
) -> str:
    """Templated one-paragraph summary. No LLM call."""
    pieces = []

    # Length
    lr = gaps.get("length_ratio_r_over_l")
    if lr is not None:
        if lr < 0.7:
            pieces.append(f"the {right_slot[0]}/{right_slot[1]} response is {1/lr:.1f}× shorter than the {left_slot[0]}/{left_slot[1]} response")
        elif lr > 1.4:
            pieces.append(f"the {right_slot[0]}/{right_slot[1]} response is {lr:.1f}× longer")
        else:
            pieces.append(f"both responses are similar length")

    # Citations
    cr = gaps.get("citation_ratio_r_over_l")
    if cr is not None:
        if cr < 0.6:
            pieces.append(f"with {1/cr:.1f}× fewer citations")
        elif cr > 1.7:
            pieces.append(f"with {cr:.1f}× more citations")

    # Criticism gap (the methodology-critical dimension)
    cg = gaps.get("criticism_severity_gap", 0)
    if abs(cg) >= 0.5:
        direction = "more critical" if cg > 0 else "less critical"
        pieces.append(f"and {abs(cg):.2f} {direction} ({left['scores'].get('criticism_severity', 0):.2f} → {right['scores'].get('criticism_severity', 0):.2f})")
    elif abs(cg) >= 0.2:
        pieces.append(f"with mild criticism gap ({cg:+.2f})")

    # Sentiment gap
    sg = gaps.get("sentiment_gap", 0)
    if abs(sg) >= 0.4:
        direction = "more positive" if sg > 0 else "more negative"
        pieces.append(f"and notably {direction} sentiment ({sg:+.2f})")

    # Directional lean
    lg = gaps.get("directional_lean_gap", 0)
    if abs(lg) >= 0.3:
        direction = "right-shifted" if lg > 0 else "left-shifted"
        pieces.append(f"and a {direction} framing ({lg:+.2f})")

    head = f"On {model_slug}, comparing {left_slot[0]}/{left_slot[1]} vs. {right_slot[0]}/{right_slot[1]}: "
    return head + "; ".join(pieces) + "." if pieces else head + "no meaningful gap."


class AsymmetryAnalyzer(CrossAnalyzer):
    """For each prompt pair in the subject's category, compute the gap
    between the two responses on length, descriptors, sources, and scores.
    Pure Python — no LLM call.

    Output: one refresh_analyses row per (model, pair). For a typical 2-model
    refresh in a category with one pair, that's 2 rows. Per-model rows let
    downstream analysis surface model-difference findings cleanly.
    """

    name = "asymmetry"
    version = "1.0.0"

    def analyze(self, ctx: RefreshContext) -> list[CrossAnalysisResult]:
        start = time.perf_counter()
        pairs = _ASYMMETRY_PAIRS.get(ctx.subject_category_slug, [])
        if not pairs:
            return []

        # Index responses by (model_id, layer, position)
        by_slot: dict[tuple[int, str, int], ResponseRow] = {
            (r.model_id, r.layer, r.position): r for r in ctx.responses
        }
        model_ids = sorted({r.model_id for r in ctx.responses})

        results: list[CrossAnalysisResult] = []
        for left_slot, right_slot, pair_key in pairs:
            for model_id in model_ids:
                left = by_slot.get((model_id, *left_slot))
                right = by_slot.get((model_id, *right_slot))
                if left is None or right is None:
                    continue  # one side missing — skip

                left_summary = _side_summary(left)
                right_summary = _side_summary(right)
                gaps = _compute_gaps(left_summary, right_summary)
                summary = _summarize_asymmetry(
                    left_summary, right_summary, gaps,
                    left_slot, right_slot, left.model_slug,
                )

                findings = {
                    "pair": {
                        "left":  {"layer": left_slot[0], "position": left_slot[1], "dimension": left.dimension},
                        "right": {"layer": right_slot[0], "position": right_slot[1], "dimension": right.dimension},
                        "key":   pair_key,
                    },
                    "left":  left_summary,
                    "right": right_summary,
                    "gaps":  gaps,
                }
                results.append(CrossAnalysisResult(
                    analysis_type="asymmetry",
                    analysis_key=pair_key,
                    model_id=model_id,
                    findings=findings,
                    source_response_ids=[left.model_response_id, right.model_response_id],
                    summary=summary,
                    cost_usd=Decimal(0),
                    latency_ms=int((time.perf_counter() - start) * 1000),
                ))

        return results


# ─── top quotes analyzer ───────────────────────────────────────────────
#
# One LLM call per refresh that picks 3-5 representative/extreme quotes
# from the 20 responses. The LLM sees every response (annotated with its
# model_response_id, model_slug, and slot), and returns verbatim
# sentences with categorization + rationale.
#
# Cost: ~$0.005-0.01 per refresh (Gemini Flash, ~15K input tokens for a
# 20-response set, ~500 output tokens). The whole refresh's quotes
# distill to one refresh_analyses row.

_TOP_QUOTES_PROMPT_HEAD = """\
You are reviewing AI-assistant responses about {subject_name} (a \
{subject_category}). Your task: pick the 3 to 5 quotes that BEST capture \
how AI assistants are characterizing the subject across this refresh.

Selection criteria:
1. DIVERSITY — quotes should represent different facets (sharpest \
criticism, most distinctive characterization, strongest framing, notable \
factual claim, model-difference moment). Don't pick five of the same kind.
2. DISTINCTIVENESS — favor quotes that capture something notable, \
opinionated, or surprising. Skip boilerplate ("X is a Senator from Y").
3. VERBATIM — pull the EXACT sentence(s) from the response. Do NOT \
paraphrase, summarize, or stitch together fragments. The text field must \
appear unchanged in the source response.
4. LENGTH — single sentences preferred. Two-sentence quotes are fine if \
splitting loses meaning. Avoid quotes longer than 60 words.

For each quote return:
- text: the verbatim sentence(s) from the response
- type: one of "characterization" | "criticism" | "praise" | \
"factual_claim" | "narrative_frame" | "model_difference"
- model_response_id: integer; MUST exactly match one of the IDs in the \
input below
- rationale: ≤25 words on why this quote made the cut

Pick 3 to 5 quotes total. Quality over quantity — don't force 5 if 3 are \
clearly the strongest.

INPUT — each response is preceded by `[mr_id=N | model=X | slot=Y]`:

{responses_block}
"""

_TOP_QUOTES_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "quotes": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "text":              {"type": "STRING"},
                    "type": {
                        "type": "STRING",
                        "enum": [
                            "characterization", "criticism", "praise",
                            "factual_claim", "narrative_frame", "model_difference",
                        ],
                    },
                    "model_response_id": {"type": "INTEGER"},
                    "rationale":         {"type": "STRING"},
                },
                "required": ["text", "type", "model_response_id", "rationale"],
            },
        },
    },
    "required": ["quotes"],
}


def _format_responses_block(responses: list[ResponseRow]) -> str:
    parts = []
    for r in responses:
        header = f"[mr_id={r.model_response_id} | model={r.model_slug} | slot={r.layer}/{r.position} ({r.dimension})]"
        parts.append(f"{header}\n{r.response_text}")
    return "\n\n".join(parts)


class TopQuotesAnalyzer(CrossAnalyzer):
    """Pick 3-5 representative quotes across the refresh.

    One LLM call sees all 20 responses; returns verbatim sentences with
    categorization + rationale. Outputs a single global (model_id=NULL)
    refresh_analyses row per refresh — top quotes is a cross-model
    finding, not a per-model one.
    """

    name = "top_quotes"
    version = "1.0.0"
    model_identifier = "gemini-2.5-flash"

    def __init__(self) -> None:
        self._client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

    def analyze(self, ctx: RefreshContext) -> list[CrossAnalysisResult]:
        start = time.perf_counter()
        if not ctx.responses:
            return []

        prompt = _TOP_QUOTES_PROMPT_HEAD.format(
            subject_name=ctx.subject_name,
            subject_category=ctx.subject_category_slug,
            responses_block=_format_responses_block(ctx.responses),
        )
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_TOP_QUOTES_SCHEMA,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        )

        try:
            api_response = self._client.models.generate_content(
                model=self.model_identifier,
                contents=prompt,
                config=config,
            )
        except Exception as e:
            return [CrossAnalysisResult(
                analysis_type="top_quotes",
                analysis_key=None,
                model_id=None,
                findings={},
                source_response_ids=[],
                error=f"{type(e).__name__}: {e}",
                latency_ms=int((time.perf_counter() - start) * 1000),
            )]

        elapsed_ms = int((time.perf_counter() - start) * 1000)

        usage = getattr(api_response, "usage_metadata", None)
        input_tokens = getattr(usage, "prompt_token_count", 0) or 0
        output_tokens = getattr(usage, "candidates_token_count", 0) or 0
        prices = _PRICING.get(
            self.model_identifier,
            {"input": Decimal("0.30"), "output": Decimal("2.50")},
        )
        cost = (
            Decimal(input_tokens) * prices["input"] / _PER_TOKEN
            + Decimal(output_tokens) * prices["output"] / _PER_TOKEN
        )

        try:
            parsed = json.loads(api_response.text or "{}")
        except Exception as e:
            return [CrossAnalysisResult(
                analysis_type="top_quotes",
                analysis_key=None,
                model_id=None,
                findings={},
                source_response_ids=[],
                cost_usd=cost,
                error=f"JSON parse failed: {e}",
                latency_ms=elapsed_ms,
            )]

        quotes = parsed.get("quotes", []) if isinstance(parsed, dict) else []

        # Annotate each quote with source-response context (model + slot)
        # and verify the model_response_id is valid for this refresh.
        by_id = {r.model_response_id: r for r in ctx.responses}
        valid_quotes = []
        invalid_count = 0
        for q in quotes:
            mr_id = q.get("model_response_id")
            src = by_id.get(mr_id)
            if src is None:
                invalid_count += 1
                continue
            q["model_slug"] = src.model_slug
            q["slot"] = f"{src.layer}/{src.position}"
            q["dimension"] = src.dimension
            valid_quotes.append(q)

        source_ids = sorted({q["model_response_id"] for q in valid_quotes})
        type_counts: dict[str, int] = {}
        for q in valid_quotes:
            type_counts[q.get("type", "?")] = type_counts.get(q.get("type", "?"), 0) + 1
        summary = (
            f"{len(valid_quotes)} top quote(s) across {len(source_ids)} response(s): "
            + ", ".join(f"{n} {t}" for t, n in sorted(type_counts.items()))
        )
        if invalid_count:
            summary += f" ({invalid_count} dropped — bad model_response_id)"

        return [CrossAnalysisResult(
            analysis_type="top_quotes",
            analysis_key=None,
            model_id=None,
            findings={"quotes": valid_quotes},
            source_response_ids=source_ids,
            summary=summary,
            cost_usd=cost,
            latency_ms=elapsed_ms,
        )]


# ─── share-of-voice analyzer ───────────────────────────────────────────
#
# For each model, count how often the subject surfaced ORGANICALLY in the
# unnamed-layer responses (i.e., responses to prompts that didn't name the
# subject). Reads response_extractions.subject_mentioned / mention_rank /
# mention_strength / competitors_mentioned — populated by Track C's
# MentionDetectionExtractor v1.0. Pure Python — no LLM call.
#
# One row per model per refresh. Each row carries:
#   - mention_rate (0..1): % of unnamed responses that named the subject
#   - average_rank (or null): mean positional rank when mentioned
#   - rank_distribution: how often the subject was 1st, 2nd, 3rd, ...
#   - strength_distribution: primary / listed / aside / not_mentioned
#   - top_competitors: aggregated competitor frequency + avg rank
#   - per_response: traceable list of which responses landed where
#
# Skips rows whose mention_detection column is NULL — those responses
# haven't been processed by MentionDetectionExtractor yet. The
# `responses_evaluated` field surfaces coverage so partial backfills are
# legible (e.g., "5 of 5 unnamed responses" vs. "3 of 5").

_LOW_DISAMBIG_THRESHOLD = 0.6  # below this, mention_rank is treated as flagged


def _aggregate_competitors(rows: list[ResponseRow]) -> list[dict[str, Any]]:
    """Across the model's unnamed responses, count competitor mentions and
    average their ranks. Returns a list sorted by frequency desc, then
    avg_rank asc.

    A competitor that appears in multiple responses gets one entry summing
    its presence; a competitor appearing twice in the same response counts
    once for that response (we dedup by canonical name within a response).
    """
    from collections import defaultdict

    # name → {response_count, rank_total, type_votes}
    accum: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"response_count": 0, "rank_sum": 0.0, "rank_n": 0, "type_votes": defaultdict(int)}
    )
    for row in rows:
        comps = row.competitors_mentioned or []
        seen_in_response: set[str] = set()
        for c in comps:
            if not isinstance(c, dict):
                continue
            name = (c.get("name") or "").strip()
            if not name or name in seen_in_response:
                continue
            seen_in_response.add(name)
            entry = accum[name]
            entry["response_count"] += 1
            r = c.get("rank")
            if r is not None:
                entry["rank_sum"] += float(r)
                entry["rank_n"] += 1
            t = c.get("type") or "other"
            entry["type_votes"][t] += 1

    out = []
    for name, e in accum.items():
        avg_rank = (e["rank_sum"] / e["rank_n"]) if e["rank_n"] else None
        # Pick the most common type as the canonical type for this competitor
        if e["type_votes"]:
            top_type = max(e["type_votes"].items(), key=lambda kv: kv[1])[0]
        else:
            top_type = "other"
        out.append({
            "name":              name,
            "type":              top_type,
            "appears_in_responses": e["response_count"],
            "avg_rank":          round(avg_rank, 2) if avg_rank is not None else None,
        })
    out.sort(key=lambda x: (-x["appears_in_responses"], x["avg_rank"] if x["avg_rank"] is not None else 999))
    return out


def _share_of_voice_findings(rows: list[ResponseRow]) -> dict[str, Any] | None:
    """Compute per-model share-of-voice findings from a list of unnamed-layer
    responses. Returns None if no rows in the list have mention data."""
    # Filter to rows where mention_detection has run
    evaluated = [r for r in rows if r.subject_mentioned is not None]
    if not evaluated:
        return None

    n = len(evaluated)
    mentioned = [r for r in evaluated if r.subject_mentioned]

    # Strength distribution
    strength_dist = {"primary": 0, "listed": 0, "aside": 0, "not_mentioned": 0}
    for r in evaluated:
        if not r.subject_mentioned:
            strength_dist["not_mentioned"] += 1
        else:
            key = r.mention_strength or "listed"
            if key in strength_dist:
                strength_dist[key] += 1
            else:
                strength_dist[key] = strength_dist.get(key, 0) + 1

    # Rank statistics — over mentioned responses only
    ranks = [r.mention_rank for r in mentioned if r.mention_rank is not None]
    avg_rank = (sum(ranks) / len(ranks)) if ranks else None
    rank_dist: dict[int, int] = {}
    for r in ranks:
        rank_dist[r] = rank_dist.get(r, 0) + 1

    # Disambiguation flag
    low_disambig = sum(
        1 for r in mentioned
        if r.disambiguation_confidence is not None
        and r.disambiguation_confidence < _LOW_DISAMBIG_THRESHOLD
    )

    # Per-response detail (traceability)
    per_response = [
        {
            "model_response_id": r.model_response_id,
            "slot": f"{r.layer}/{r.position}",
            "dimension": r.dimension,
            "mentioned": bool(r.subject_mentioned),
            "rank": r.mention_rank,
            "strength": r.mention_strength,
            "excerpt": r.mention_excerpt,
            "disambiguation_confidence": r.disambiguation_confidence,
        }
        for r in evaluated
    ]

    competitors = _aggregate_competitors(evaluated)

    return {
        "responses_evaluated": n,
        "mentioned_count":     len(mentioned),
        "mention_rate":        round(len(mentioned) / n, 3) if n else 0.0,
        "average_rank":        round(avg_rank, 2) if avg_rank is not None else None,
        "rank_distribution":   {str(k): v for k, v in sorted(rank_dist.items())},
        "strength_distribution": strength_dist,
        "low_disambiguation_count": low_disambig,
        "top_competitors":     competitors[:10],   # cap at 10 — the long tail isn't useful
        "all_competitors_count": len(competitors),
        "per_response":        per_response,
    }


def _summarize_sov(findings: dict[str, Any], model_slug: str) -> str:
    n = findings["responses_evaluated"]
    m = findings["mentioned_count"]
    rate = findings["mention_rate"]
    avg = findings["average_rank"]

    parts = [
        f"On {model_slug}: subject surfaced in {m}/{n} unnamed-layer "
        f"responses ({rate*100:.0f}% mention rate)"
    ]
    if avg is not None:
        parts.append(f"average rank {avg:.1f}")
    elif m == 0:
        parts.append("no organic mentions")

    top = findings["top_competitors"][:3]
    if top:
        parts.append(
            "top competitors: "
            + ", ".join(
                f"{c['name']} ({c['appears_in_responses']}× resp"
                + (f", rank {c['avg_rank']}" if c['avg_rank'] is not None else "")
                + ")"
                for c in top
            )
        )

    if findings.get("low_disambiguation_count"):
        parts.append(
            f"{findings['low_disambiguation_count']} mention(s) flagged with "
            f"disambiguation_confidence<{_LOW_DISAMBIG_THRESHOLD}"
        )

    return ". ".join(parts) + "."


class ShareOfVoiceAnalyzer(CrossAnalyzer):
    """Per-model organic-visibility metrics over the unnamed-layer responses.

    Inputs come from Track C's MentionDetectionExtractor v1.0 columns on
    response_extractions. Skips responses whose mention_detection columns
    are NULL (extractor hasn't run on them yet) and reports coverage in
    `responses_evaluated`. One refresh_analyses row per model per refresh.
    Pure Python; cost = 0.
    """

    name = "share_of_voice"
    version = "1.0.0"

    def analyze(self, ctx: RefreshContext) -> list[CrossAnalysisResult]:
        start = time.perf_counter()

        # Only unnamed-layer responses are eligible — mention detection on
        # named-layer is meaningless (subject is in the prompt).
        unnamed = [r for r in ctx.responses if r.layer == "unnamed"]
        if not unnamed:
            return []

        # Group by model. Each model gets its own row.
        by_model: dict[int, list[ResponseRow]] = {}
        for r in unnamed:
            by_model.setdefault(r.model_id, []).append(r)

        results: list[CrossAnalysisResult] = []
        for model_id, rows in by_model.items():
            findings = _share_of_voice_findings(rows)
            if findings is None:
                continue  # no rows had mention_detection populated
            summary = _summarize_sov(findings, rows[0].model_slug)
            results.append(CrossAnalysisResult(
                analysis_type="share_of_voice",
                analysis_key=None,
                model_id=model_id,
                findings=findings,
                source_response_ids=[r.model_response_id for r in rows],
                summary=summary,
                cost_usd=Decimal(0),
                latency_ms=int((time.perf_counter() - start) * 1000),
            ))

        return results


# ─── runner ────────────────────────────────────────────────────────────


def _resolve_source_analysis_run(
    cur: psycopg.Cursor, refresh_run_id: int, override: int | None,
) -> int:
    """Pick which analysis_run's extractions feed the cross-analyzer.

    Default: most recent completed analysis_run for the refresh, with the
    full per-response extractor set populated. Override via --use-analysis-run.
    """
    if override is not None:
        cur.execute(
            "SELECT id FROM analysis_runs WHERE id = %s AND refresh_run_id = %s",
            (override, refresh_run_id),
        )
        if not cur.fetchone():
            raise ValueError(
                f"--use-analysis-run {override} not found for refresh_run {refresh_run_id}"
            )
        return override

    cur.execute(
        """
        SELECT id FROM analysis_runs
        WHERE refresh_run_id = %s AND status IN ('completed', 'partial')
        ORDER BY id DESC LIMIT 1
        """,
        (refresh_run_id,),
    )
    row = cur.fetchone()
    if not row:
        raise ValueError(
            f"No completed analysis_run found for refresh_run {refresh_run_id}. "
            f"Run `python -m app.analyzer {refresh_run_id}` first."
        )
    return row[0]


def _load_context(refresh_run_id: int, source_analysis_run: int | None) -> RefreshContext:
    with psycopg.connect(get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT rr.subject_id, s.name, c.slug, s.setup_inputs
                FROM refresh_runs rr
                JOIN subjects s ON s.id = rr.subject_id
                JOIN categories c ON c.id = s.category_id
                WHERE rr.id = %s
                """,
                (refresh_run_id,),
            )
            row = cur.fetchone()
            if not row:
                raise ValueError(f"refresh_run_id {refresh_run_id} not found")
            subject_id, subject_name, category_slug, setup_inputs = row

            ar_id = _resolve_source_analysis_run(cur, refresh_run_id, source_analysis_run)

            cur.execute(
                """
                SELECT
                    mr.id, mr.refresh_run_id, mr.subject_id,
                    mr.model_id, m.slug,
                    p.id, p.layer, p.position, p.dimension,
                    mr.response_text, mr.response_metadata,
                    re.descriptors, re.entities, re.sources,
                    re.total_sources_cited, re.scores,
                    re.narrative_themes, re.dominant_theme,
                    re.subject_mentioned, re.mention_rank,
                    re.mention_strength, re.mention_excerpt,
                    re.competitors_mentioned, re.disambiguation_confidence
                FROM model_responses mr
                JOIN prompts p ON p.id = mr.prompt_id
                JOIN models m ON m.id = mr.model_id
                LEFT JOIN response_extractions re
                    ON re.model_response_id = mr.id
                    AND re.analysis_run_id = %s
                WHERE mr.refresh_run_id = %s AND mr.success = TRUE
                ORDER BY p.layer, p.position, m.slug
                """,
                (ar_id, refresh_run_id),
            )
            rows = cur.fetchall()

    responses = [
        ResponseRow(
            model_response_id=r[0], refresh_run_id=r[1], subject_id=r[2],
            model_id=r[3], model_slug=r[4],
            prompt_id=r[5], layer=r[6], position=r[7], dimension=r[8],
            response_text=r[9] or "", response_metadata=r[10] or {},
            descriptors=r[11], entities=r[12], sources=r[13],
            total_sources_cited=r[14], scores=r[15],
            narrative_themes=r[16], dominant_theme=r[17],
            subject_mentioned=r[18], mention_rank=r[19],
            mention_strength=r[20], mention_excerpt=r[21],
            competitors_mentioned=r[22],
            disambiguation_confidence=float(r[23]) if r[23] is not None else None,
        )
        for r in rows
    ]

    return RefreshContext(
        refresh_run_id=refresh_run_id,
        subject_id=subject_id,
        subject_name=subject_name,
        subject_category_slug=category_slug,
        setup_inputs=setup_inputs or {},
        source_analysis_run_id=ar_id,
        responses=responses,
    )


def _create_analysis_run(
    refresh_run_id: int, subject_id: int, analyzer_versions: dict, n_responses: int,
) -> int:
    with psycopg.connect(get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO analysis_runs (
                    refresh_run_id, subject_id, status,
                    methodology_version, extractor_versions, total_responses
                ) VALUES (%s, %s, 'in_progress', %s, %s, %s)
                RETURNING id
                """,
                (
                    refresh_run_id, subject_id,
                    CROSS_METHODOLOGY_VERSION,
                    Json(analyzer_versions),
                    n_responses,
                ),
            )
            (analysis_run_id,) = cur.fetchone()
        conn.commit()
    return analysis_run_id


def _write_finding_rows(
    analysis_run_id: int,
    ctx: RefreshContext,
    results: list[CrossAnalysisResult],
) -> None:
    if not results:
        return
    with psycopg.connect(get_database_url()) as conn:
        with conn.cursor() as cur:
            for r in results:
                cur.execute(
                    """
                    INSERT INTO refresh_analyses (
                        analysis_run_id, refresh_run_id, subject_id, model_id,
                        analysis_type, analysis_key, findings,
                        source_response_ids, summary, confidence,
                        extraction_errors, extraction_cost_usd,
                        extraction_latency_ms, methodology_version
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        analysis_run_id, ctx.refresh_run_id, ctx.subject_id, r.model_id,
                        r.analysis_type, r.analysis_key, Json(r.findings),
                        Json(r.source_response_ids), r.summary, r.confidence,
                        Json({"error": r.error}) if r.error else None,
                        r.cost_usd, r.latency_ms,
                        CROSS_METHODOLOGY_VERSION,
                    ),
                )
            conn.commit()


def _update_analysis_run(
    analysis_run_id: int, status: str, n_findings: int,
    total_cost: Decimal, error_message: str | None = None,
) -> None:
    with psycopg.connect(get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE analysis_runs
                SET completed_at = NOW(), status = %s,
                    successful_extractions = %s, total_cost_usd = %s,
                    error_message = %s
                WHERE id = %s
                """,
                (status, n_findings, total_cost, error_message, analysis_run_id),
            )
        conn.commit()


def run_cross_analysis(
    refresh_run_id: int, analyzers: list[CrossAnalyzer],
    *, source_analysis_run: int | None = None,
) -> int:
    """Run all registered cross-analyzers over a refresh. Returns the new
    analysis_run_id."""
    ctx = _load_context(refresh_run_id, source_analysis_run)
    if not ctx.responses:
        raise ValueError(
            f"No successful model_responses joined to extractions for "
            f"refresh_run {refresh_run_id}"
        )

    analyzer_versions = {a.name: a.version for a in analyzers}
    analysis_run_id = _create_analysis_run(
        refresh_run_id, ctx.subject_id, analyzer_versions, len(ctx.responses),
    )

    all_results: list[CrossAnalysisResult] = []
    total_cost = Decimal(0)
    failure: str | None = None
    try:
        for a in analyzers:
            results = a.analyze(ctx)
            all_results.extend(results)
            for r in results:
                total_cost += r.cost_usd
        _write_finding_rows(analysis_run_id, ctx, all_results)
    except Exception as e:
        failure = f"{type(e).__name__}: {e}"

    if failure:
        status = "failed"
    elif all_results:
        status = "completed"
    else:
        status = "completed"  # zero findings is valid (e.g., no pair for category)

    _update_analysis_run(analysis_run_id, status, len(all_results), total_cost, failure)
    return analysis_run_id


# ─── cli ───────────────────────────────────────────────────────────────


def _cli_main() -> None:
    p = argparse.ArgumentParser(
        description="Run cross-response analysis over a refresh_run."
    )
    p.add_argument("refresh_run_id", type=int)
    p.add_argument(
        "--use-analysis-run", type=int, default=None,
        help="Specific analysis_run id whose extractions feed the cross-analyzer. "
             "Default: latest completed analysis_run for the refresh.",
    )
    args = p.parse_args()

    analyzers: list[CrossAnalyzer] = [
        AsymmetryAnalyzer(),
        TopQuotesAnalyzer(),
        ShareOfVoiceAnalyzer(),
    ]
    print(
        f"Running {len(analyzers)} cross-analyzer(s) "
        f"({', '.join(f'{a.name}@v{a.version}' for a in analyzers)}) "
        f"over refresh_run {args.refresh_run_id}..."
    )
    ar_id = run_cross_analysis(
        args.refresh_run_id, analyzers,
        source_analysis_run=args.use_analysis_run,
    )
    print(f"Done. analysis_run_id = {ar_id}")


if __name__ == "__main__":
    _cli_main()
