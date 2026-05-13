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
    source_analysis_run_id: int | None  # latest per-response analysis_run id (or pinned override) for audit; data is aggregated across all per-response runs unless pinned
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
        if lr == 0:
            pieces.append(f"the {right_slot[0]}/{right_slot[1]} response is empty")
        elif lr < 0.7:
            pieces.append(f"the {right_slot[0]}/{right_slot[1]} response is {1/lr:.1f}× shorter than the {left_slot[0]}/{left_slot[1]} response")
        elif lr > 1.4:
            pieces.append(f"the {right_slot[0]}/{right_slot[1]} response is {lr:.1f}× longer")
        else:
            pieces.append(f"both responses are similar length")

    # Citations
    cr = gaps.get("citation_ratio_r_over_l")
    if cr is not None:
        if cr == 0:
            pieces.append(f"with no citations on the {right_slot[0]}/{right_slot[1]} side (left has {left['citation_count']})")
        elif cr < 0.6:
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
    version = "1.0.1"  # patch: handle zero-length / zero-citation summary edges

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


# ─── narrative drift analyzer ──────────────────────────────────────────
#
# Compares the current refresh's per-response extractions against the most
# recent prior refresh of the same subject. Surfaces what changed:
#   - score deltas (sentiment, criticism_severity, directional_lean, certainty)
#   - theme turnover (added / dropped / stable dominant_themes)
#   - descriptor turnover (added / dropped / stable canonical descriptor words)
#   - entity turnover (added / dropped / stable canonical entity names)
#   - per-model mention-rate trajectory (organic visibility shift)
# Plus one Gemini Flash call that synthesizes the deltas into a short
# natural-language summary — the user-facing "what changed?" answer.
#
# Returns nothing (empty list) if there's no prior refresh — drift requires
# a prior state to diff against.


@dataclass
class RefreshAggregate:
    """Aggregated cross-response signals for a single refresh, used as the
    unit of comparison for narrative_drift."""

    refresh_run_id: int
    started_at: Any
    n_responses: int
    n_named: int
    n_unnamed: int
    # Averaged across responses
    avg_scores: dict[str, float]            # 4 keys: sentiment, lean, certainty, criticism
    # Sets of canonical labels
    descriptor_words: set[str]              # lowercased, deduped
    entity_names: set[str]                  # canonicalized, deduped
    dominant_themes: list[str]              # one per response (preserves duplicates)
    # Per-model mention rate over unnamed-layer responses where mention data exists
    mention_rates: dict[int, dict[str, Any]]  # {model_id: {slug, rate, mentioned, evaluated}}


def _latest_per_column(col: str) -> str:
    """Return a SQL fragment for a correlated subquery that picks the most
    recent non-null value of `col` from `response_extractions` for the
    current model_response_id (relative to the outer query's `mr.id`).

    Why this exists: response_extractions has one row per (analysis_run,
    model_response). Different analysis_runs populate different columns
    (e.g., a `--only-extractor mention_detection` backfill creates a row
    with ONLY mention columns; the original v1.3 descriptor backfill is
    on a separate row with only descriptors). Picking the "latest"
    analysis_run wholesale loses data — the correct semantics are
    "latest non-null per column independently."
    """
    return (
        f"(SELECT {col} FROM response_extractions "
        f"WHERE model_response_id = mr.id AND {col} IS NOT NULL "
        f"ORDER BY analysis_run_id DESC LIMIT 1)"
    )


def _load_refresh_aggregate(refresh_run_id: int) -> RefreshAggregate | None:
    """Build a RefreshAggregate by aggregating the LATEST NON-NULL value
    per column across all per-response analysis_runs for this refresh.

    See `_latest_per_column` for why we aggregate column-by-column rather
    than picking a single analysis_run wholesale. Returns None if no
    successful model_responses exist for this refresh.
    """
    with psycopg.connect(get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT subject_id, started_at FROM refresh_runs WHERE id = %s",
                (refresh_run_id,),
            )
            row = cur.fetchone()
            if not row:
                return None
            _, started_at = row

            cur.execute(
                f"""
                SELECT
                    p.layer, m.id, m.slug,
                    {_latest_per_column('descriptors')} AS descriptors,
                    {_latest_per_column('entities')} AS entities,
                    {_latest_per_column('scores')} AS scores,
                    {_latest_per_column('dominant_theme')} AS dominant_theme,
                    {_latest_per_column('subject_mentioned')} AS subject_mentioned,
                    {_latest_per_column('mention_rank')} AS mention_rank
                FROM model_responses mr
                JOIN prompts p ON p.id = mr.prompt_id
                JOIN models m ON m.id = mr.model_id
                WHERE mr.refresh_run_id = %s AND mr.success = TRUE
                """,
                (refresh_run_id,),
            )
            rows = cur.fetchall()
            if not rows:
                return None

    descriptor_words: set[str] = set()
    entity_names: set[str] = set()
    dominant_themes: list[str] = []
    score_sums = {"sentiment": 0.0, "directional_lean": 0.0, "certainty": 0.0, "criticism_severity": 0.0}
    score_n = 0
    n_named = n_unnamed = 0
    # mention rates per model — only counts unnamed-layer rows with populated mention data
    mention_acc: dict[int, dict[str, Any]] = {}

    for layer, model_id, model_slug, descs, ents, scores, dom_theme, subj_mentioned, mention_rank in rows:
        if layer == "named":
            n_named += 1
        else:
            n_unnamed += 1

        # Descriptors — collect canonical words (lowercased)
        if descs:
            arr = descs if isinstance(descs, list) else json.loads(descs)
            for d in arr:
                if isinstance(d, dict) and d.get("word"):
                    descriptor_words.add(d["word"].strip().lower())

        # Entities — collect canonical names
        if ents:
            arr = ents if isinstance(ents, list) else json.loads(ents)
            for e in arr:
                if isinstance(e, dict) and e.get("name"):
                    entity_names.add(e["name"].strip())

        # Themes
        if dom_theme:
            dominant_themes.append(dom_theme.strip())

        # Scores
        if scores:
            s = scores if isinstance(scores, dict) else json.loads(scores)
            for k in score_sums:
                v = s.get(k)
                if v is not None:
                    try:
                        score_sums[k] += float(v)
                    except Exception:
                        pass
            score_n += 1

        # Mention rates — only unnamed-layer rows with populated mention column
        if layer == "unnamed" and subj_mentioned is not None:
            acc = mention_acc.setdefault(
                model_id,
                {"slug": model_slug, "evaluated": 0, "mentioned": 0},
            )
            acc["evaluated"] += 1
            if subj_mentioned:
                acc["mentioned"] += 1

    avg_scores = {k: (v / score_n) if score_n else 0.0 for k, v in score_sums.items()}
    mention_rates = {
        mid: {
            "slug": acc["slug"],
            "evaluated": acc["evaluated"],
            "mentioned": acc["mentioned"],
            "rate": (acc["mentioned"] / acc["evaluated"]) if acc["evaluated"] else None,
        }
        for mid, acc in mention_acc.items()
    }

    return RefreshAggregate(
        refresh_run_id=refresh_run_id,
        started_at=started_at,
        n_responses=len(rows),
        n_named=n_named,
        n_unnamed=n_unnamed,
        avg_scores=avg_scores,
        descriptor_words=descriptor_words,
        entity_names=entity_names,
        dominant_themes=dominant_themes,
        mention_rates=mention_rates,
    )


def _find_prior_refresh(current_refresh_id: int, subject_id: int) -> int | None:
    """The most recent prior refresh_run of the same subject, before the
    current one. Prefers fully-completed refreshes — partial refreshes have
    missing responses that would skew aggregate comparisons (e.g., a
    gemini-only partial refresh would look like "all chatgpt content
    appeared this run" when compared against a full prior). Falls back to
    partial only if no completed prior exists.

    Returns None if no prior of either status exists.
    """
    with psycopg.connect(get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id FROM refresh_runs
                WHERE subject_id = %s
                  AND id < %s
                  AND status = 'completed'
                ORDER BY id DESC LIMIT 1
                """,
                (subject_id, current_refresh_id),
            )
            row = cur.fetchone()
            if row:
                return row[0]
            # Fallback: partial is better than nothing if completed is unavailable
            cur.execute(
                """
                SELECT id FROM refresh_runs
                WHERE subject_id = %s
                  AND id < %s
                  AND status = 'partial'
                ORDER BY id DESC LIMIT 1
                """,
                (subject_id, current_refresh_id),
            )
            row = cur.fetchone()
            return row[0] if row else None


_DRIFT_PROMPT = """\
You are summarizing how AI-assistant characterization of {subject_name} \
changed between two refreshes of the same subject.

Refresh interval: {interval_days} day(s) apart.

QUANTITATIVE DELTAS:
- Avg sentiment shift:          {sent_delta:+.2f}  ({sent_prior:+.2f} → {sent_curr:+.2f})
- Avg criticism_severity shift: {crit_delta:+.2f}  ({crit_prior:.2f}  → {crit_curr:.2f})
- Avg directional_lean shift:   {lean_delta:+.2f}  ({lean_prior:+.2f} → {lean_curr:+.2f})
- Avg certainty shift:          {cert_delta:+.2f}  ({cert_prior:.2f}  → {cert_curr:.2f})

THEMES (dominant_theme labels):
- Stable (in both):  {themes_stable}
- Added this run:    {themes_added}
- Dropped this run:  {themes_dropped}

DESCRIPTORS (adjectives attached to the subject):
- Stable:  {descs_stable}
- Added:   {descs_added}
- Dropped: {descs_dropped}

ENTITIES (other named people/orgs/policies in the responses):
- Stable:  {ents_stable}
- Added:   {ents_added}
- Dropped: {ents_dropped}

MENTION-RATE TRAJECTORY (organic visibility in unnamed-layer responses):
{mention_rates_block}

Write a 2-3 sentence summary of the drift. Focus on the most meaningful \
changes — sharp shifts in sentiment or criticism, new or dropped themes, \
notable entity changes, mention-rate moves. Skip noise (small score \
deltas, single-response theme variation).

If nothing meaningful changed, say so plainly.

Output JSON: {{"summary": "<2-3 sentences>"}}
"""

_DRIFT_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "summary": {"type": "STRING"},
    },
    "required": ["summary"],
}


def _format_set(s: set[str] | list[str], cap: int = 10) -> str:
    items = sorted(s) if isinstance(s, set) else list(s)
    if not items:
        return "(none)"
    if len(items) > cap:
        return ", ".join(items[:cap]) + f", ... (+{len(items) - cap} more)"
    return ", ".join(items)


def _format_mention_block(curr: RefreshAggregate, prior: RefreshAggregate) -> str:
    lines = []
    all_mids = set(curr.mention_rates.keys()) | set(prior.mention_rates.keys())
    for mid in sorted(all_mids):
        c = curr.mention_rates.get(mid)
        p = prior.mention_rates.get(mid)
        slug = (c or p)["slug"]
        if c and p and c["rate"] is not None and p["rate"] is not None:
            lines.append(
                f"- {slug}: {p['rate']:.0%} → {c['rate']:.0%}  "
                f"({p['mentioned']}/{p['evaluated']} → {c['mentioned']}/{c['evaluated']})"
            )
        elif c and c["rate"] is not None:
            lines.append(f"- {slug}: {c['rate']:.0%} ({c['mentioned']}/{c['evaluated']}) — no prior data")
        elif p and p["rate"] is not None:
            lines.append(f"- {slug}: prior {p['rate']:.0%} ({p['mentioned']}/{p['evaluated']}) — no current data")
    return "\n".join(lines) if lines else "(no mention data on either run)"


class NarrativeDriftAnalyzer(CrossAnalyzer):
    """Compares the current refresh against the most recent prior refresh of
    the same subject, surfacing what changed in framing, scores, themes,
    entities, descriptors, and organic visibility.

    One global (model_id=NULL) refresh_analyses row per refresh, when a
    prior exists. Returns nothing if no prior refresh exists.

    Cost: ~$0.005 per run (one Gemini Flash call for the natural-language
    summary; everything else is pure-Python aggregation).
    """

    name = "narrative_drift"
    version = "1.0.0"
    model_identifier = "gemini-2.5-flash"

    def __init__(self) -> None:
        self._client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

    def analyze(self, ctx: RefreshContext) -> list[CrossAnalysisResult]:
        start = time.perf_counter()

        prior_id = _find_prior_refresh(ctx.refresh_run_id, ctx.subject_id)
        if prior_id is None:
            return []  # no prior to diff against — drift not computable

        curr = _load_refresh_aggregate(ctx.refresh_run_id)
        prior = _load_refresh_aggregate(prior_id)
        if curr is None or prior is None:
            return []

        # Quantitative deltas
        score_deltas = {
            f"{k}_delta": curr.avg_scores[k] - prior.avg_scores[k]
            for k in curr.avg_scores
        }

        # Theme turnover (operate on unique sets within each refresh)
        curr_themes = set(curr.dominant_themes)
        prior_themes = set(prior.dominant_themes)
        themes_stable = sorted(curr_themes & prior_themes)
        themes_added = sorted(curr_themes - prior_themes)
        themes_dropped = sorted(prior_themes - curr_themes)

        # Descriptor turnover
        descs_stable = sorted(curr.descriptor_words & prior.descriptor_words)
        descs_added = sorted(curr.descriptor_words - prior.descriptor_words)
        descs_dropped = sorted(prior.descriptor_words - curr.descriptor_words)

        # Entity turnover
        ents_stable = sorted(curr.entity_names & prior.entity_names)
        ents_added = sorted(curr.entity_names - prior.entity_names)
        ents_dropped = sorted(prior.entity_names - curr.entity_names)

        # Mention-rate trajectory
        mention_rate_block = _format_mention_block(curr, prior)

        # Compute interval in days
        interval_days = max(
            (curr.started_at - prior.started_at).total_seconds() / 86400.0,
            0.0,
        )

        # LLM summary
        prompt = _DRIFT_PROMPT.format(
            subject_name=ctx.subject_name,
            interval_days=f"{interval_days:.1f}",
            sent_delta=score_deltas["sentiment_delta"],
            sent_prior=prior.avg_scores["sentiment"],
            sent_curr=curr.avg_scores["sentiment"],
            crit_delta=score_deltas["criticism_severity_delta"],
            crit_prior=prior.avg_scores["criticism_severity"],
            crit_curr=curr.avg_scores["criticism_severity"],
            lean_delta=score_deltas["directional_lean_delta"],
            lean_prior=prior.avg_scores["directional_lean"],
            lean_curr=curr.avg_scores["directional_lean"],
            cert_delta=score_deltas["certainty_delta"],
            cert_prior=prior.avg_scores["certainty"],
            cert_curr=curr.avg_scores["certainty"],
            themes_stable=_format_set(themes_stable),
            themes_added=_format_set(themes_added),
            themes_dropped=_format_set(themes_dropped),
            descs_stable=_format_set(descs_stable, cap=15),
            descs_added=_format_set(descs_added),
            descs_dropped=_format_set(descs_dropped),
            ents_stable=_format_set(ents_stable, cap=15),
            ents_added=_format_set(ents_added),
            ents_dropped=_format_set(ents_dropped),
            mention_rates_block=mention_rate_block,
        )
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_DRIFT_SCHEMA,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        )

        cost = Decimal(0)
        summary_text: str | None = None
        error: str | None = None
        try:
            api_response = self._client.models.generate_content(
                model=self.model_identifier,
                contents=prompt,
                config=config,
            )
            usage = getattr(api_response, "usage_metadata", None)
            input_tokens = getattr(usage, "prompt_token_count", 0) or 0
            output_tokens = getattr(usage, "candidates_token_count", 0) or 0
            prices = _PRICING[self.model_identifier]
            cost = (
                Decimal(input_tokens) * prices["input"] / _PER_TOKEN
                + Decimal(output_tokens) * prices["output"] / _PER_TOKEN
            )
            parsed = json.loads(api_response.text or "{}")
            if isinstance(parsed, dict):
                summary_text = parsed.get("summary")
        except Exception as e:
            error = f"{type(e).__name__}: {e}"

        findings = {
            "current_refresh_id": ctx.refresh_run_id,
            "prior_refresh_id":   prior_id,
            "interval_days":      round(interval_days, 2),
            "current_started_at": curr.started_at.isoformat(),
            "prior_started_at":   prior.started_at.isoformat(),
            "score_deltas":       {k: round(v, 3) for k, v in score_deltas.items()},
            "current_avg_scores": {k: round(v, 3) for k, v in curr.avg_scores.items()},
            "prior_avg_scores":   {k: round(v, 3) for k, v in prior.avg_scores.items()},
            "themes": {
                "stable": themes_stable,
                "added": themes_added,
                "dropped": themes_dropped,
            },
            "descriptors": {
                "stable": descs_stable,
                "added": descs_added,
                "dropped": descs_dropped,
            },
            "entities": {
                "stable": ents_stable,
                "added": ents_added,
                "dropped": ents_dropped,
            },
            "mention_rates": {
                "current": curr.mention_rates,
                "prior":   prior.mention_rates,
            },
            "llm_summary": summary_text,
        }

        return [CrossAnalysisResult(
            analysis_type="narrative_drift",
            analysis_key=str(prior_id),  # makes (current_run, prior_run) the key
            model_id=None,
            findings=findings,
            source_response_ids=[],  # cross-refresh; no single set of source rows
            summary=summary_text,
            cost_usd=cost,
            latency_ms=int((time.perf_counter() - start) * 1000),
            error=error,
        )]


# ─── runner ────────────────────────────────────────────────────────────


def _resolve_source_analysis_run(
    cur: psycopg.Cursor, refresh_run_id: int, override: int | None,
) -> int | None:
    """Resolve the value to record in `RefreshContext.source_analysis_run_id`
    for audit. Returns the override if pinned, the most recent per-response
    analysis_run id otherwise, or None if no per-response analysis_run
    exists yet for the refresh.

    Note: data loading no longer pins to a single analysis_run by default.
    This value is recorded for audit traceability only; the actual
    extraction columns are aggregated across all analysis_runs (latest
    non-null per column) by `_load_context`.
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
        WHERE refresh_run_id = %s
          AND status IN ('completed', 'partial')
          AND methodology_version LIKE 'analysis-%%'
        ORDER BY id DESC LIMIT 1
        """,
        (refresh_run_id,),
    )
    row = cur.fetchone()
    return row[0] if row else None


def _load_context(refresh_run_id: int, source_analysis_run: int | None) -> RefreshContext:
    """Build RefreshContext for a refresh by aggregating extractor outputs
    across ALL per-response analysis_runs (latest non-null per column).

    Why aggregate: response_extractions has one row per (analysis_run,
    model_response). Different analysis_runs populate different columns
    (e.g., `--only-extractor mention_detection` backfills produce rows
    with only mention columns; the historical v1.3 descriptor backfill
    populated only descriptors). Pinning to a single analysis_run
    silently drops data that exists on earlier rows.

    `--use-analysis-run N` (passed as `source_analysis_run`) overrides
    this aggregate behavior and pins everything to that single run —
    useful for reproducing historical state. Without the override
    (the default), the cross-analyzer reads the latest non-null value
    per column per response.
    """
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

            if source_analysis_run is not None:
                # Pinned mode: read from a single analysis_run wholesale.
                # Used by `--use-analysis-run` for historical reproduction.
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
                    (source_analysis_run, refresh_run_id),
                )
            else:
                # Default mode: aggregate latest non-null per column across
                # all analysis_runs.
                cur.execute(
                    f"""
                    SELECT
                        mr.id, mr.refresh_run_id, mr.subject_id,
                        mr.model_id, m.slug,
                        p.id, p.layer, p.position, p.dimension,
                        mr.response_text, mr.response_metadata,
                        {_latest_per_column('descriptors')} AS descriptors,
                        {_latest_per_column('entities')} AS entities,
                        {_latest_per_column('sources')} AS sources,
                        {_latest_per_column('total_sources_cited')} AS total_sources_cited,
                        {_latest_per_column('scores')} AS scores,
                        {_latest_per_column('narrative_themes')} AS narrative_themes,
                        {_latest_per_column('dominant_theme')} AS dominant_theme,
                        {_latest_per_column('subject_mentioned')} AS subject_mentioned,
                        {_latest_per_column('mention_rank')} AS mention_rank,
                        {_latest_per_column('mention_strength')} AS mention_strength,
                        {_latest_per_column('mention_excerpt')} AS mention_excerpt,
                        {_latest_per_column('competitors_mentioned')} AS competitors_mentioned,
                        {_latest_per_column('disambiguation_confidence')} AS disambiguation_confidence
                    FROM model_responses mr
                    JOIN prompts p ON p.id = mr.prompt_id
                    JOIN models m ON m.id = mr.model_id
                    WHERE mr.refresh_run_id = %s AND mr.success = TRUE
                    ORDER BY p.layer, p.position, m.slug
                    """,
                    (refresh_run_id,),
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


# ─── narrative cluster analyzer (Phase 3b) ─────────────────────────────
#
# Aggregates per-response narrative_themes into 3-5 named narrative
# buckets per refresh. Powers the "Dominant narrative" panel in the
# customer-facing dashboard ("Progressive Reformer 42% / Consumer
# Advocate 24% / Polarizing Figure 19% / Policy Expert 15%" for Warren).
#
# Why an LLM call rather than a closed taxonomy: subjects vary too much
# for a single fixed taxonomy to fit ("Polarizing Figure" works for a
# senator, not for an event subject like the Sam Altman firing). Per-
# refresh LLM clustering produces subject-aware named buckets ad hoc.
# Cost: ~$0.005/refresh via gemini-2.5-flash. Cluster names won't be
# stable across refreshes — fine for the snapshot view; a future
# stability pass can normalize across refreshes if trajectory views
# need it.
#
# Inputs: each response's narrative_themes (1-3 free-form labels with
# weights and excerpts) + dominant_theme. Outputs: one global
# refresh_analyses row with findings={"clusters": [...]} where each
# cluster has name / description / response_ids / sample_labels / share.

_NARRATIVE_CLUSTERS_PROMPT = """\
You are reviewing how AI assistants are characterizing {subject_name} (a \
{subject_category}). Below are the narrative themes that AI extracted from \
each response (1-3 free-form labels per response, with weights and \
excerpts).

Your task: cluster these per-response themes into 3 to 5 named narrative \
buckets that capture how AI frames the subject across this refresh.

For each cluster return:
- name: a short, professional, 2-4 word label suitable for an executive \
dashboard (e.g. "Progressive Reformer", "Elder Statesman", "Polarizing \
Figure"). Title Case. Subject-aware (use language a public-affairs \
analyst would use about THIS subject).
- description: one sentence explaining what this narrative captures and \
how it shows up in the responses.
- response_ids: list of model_response_id values whose dominant theme \
falls under this cluster. Each id should appear in exactly ONE cluster.
- sample_labels: 3-5 original free-form theme labels from the input that \
contributed to this cluster.

Rules:
- Each response_id from the input goes into exactly one cluster, based on \
its dominant theme.
- Pick 3 to 5 clusters total. Don't force 5 if 3 capture the structure \
cleanly. Skip clusters with fewer than 2 responses.
- Cluster names should differentiate cleanly — avoid two clusters that \
mean nearly the same thing.

INPUT — each block is one response with its themes:

{themes_block}
"""

_NARRATIVE_CLUSTERS_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "clusters": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "name":          {"type": "STRING"},
                    "description":   {"type": "STRING"},
                    "response_ids":  {"type": "ARRAY", "items": {"type": "INTEGER"}},
                    "sample_labels": {"type": "ARRAY", "items": {"type": "STRING"}},
                },
                "required": ["name", "description", "response_ids", "sample_labels"],
            },
        },
    },
    "required": ["clusters"],
}


def _format_themes_block(responses: list[ResponseRow]) -> str:
    """Build the prompt input — one block per response with its theme
    list, dominant_theme, and a short context line so the LLM can
    cluster meaningfully."""
    parts = []
    for r in responses:
        if not r.narrative_themes:
            continue
        themes_lines = []
        for t in r.narrative_themes:
            if not isinstance(t, dict):
                continue
            label = t.get("label", "?")
            weight = t.get("weight", "?")
            excerpt = (t.get("excerpt") or "").strip()
            if excerpt and len(excerpt) > 180:
                excerpt = excerpt[:177] + "..."
            themes_lines.append(
                f"  - {label} (weight {weight}): {excerpt}"
                if excerpt else f"  - {label} (weight {weight})"
            )
        header = (
            f"[mr_id={r.model_response_id} | model={r.model_slug} | "
            f"slot={r.layer}/{r.position} ({r.dimension})]"
        )
        dom = (
            f"  dominant theme: {r.dominant_theme}"
            if r.dominant_theme else "  dominant theme: (none)"
        )
        parts.append(header + "\n" + dom + "\n" + "\n".join(themes_lines))
    return "\n\n".join(parts)


class NarrativeClusterAnalyzer(CrossAnalyzer):
    """Cluster the refresh's per-response narrative_themes into 3-5
    named narrative buckets. Outputs a single global (model_id=NULL)
    row keyed by analysis_type='narrative_clusters'.
    """

    name = "narrative_clusters"
    version = "1.0.0"
    model_identifier = "gemini-2.5-flash"

    def __init__(self) -> None:
        self._client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

    def analyze(self, ctx: RefreshContext) -> list[CrossAnalysisResult]:
        start = time.perf_counter()

        # Only cluster responses with narrative_themes data
        clusterable = [
            r for r in ctx.responses
            if r.narrative_themes
        ]
        if len(clusterable) < 3:
            return [CrossAnalysisResult(
                analysis_type="narrative_clusters",
                analysis_key=None,
                model_id=None,
                findings={"clusters": [], "skipped": True},
                source_response_ids=[],
                summary=(
                    f"Skipped — only {len(clusterable)} response(s) have "
                    f"narrative_themes data (need ≥3 to cluster)."
                ),
                latency_ms=int((time.perf_counter() - start) * 1000),
            )]

        themes_block = _format_themes_block(clusterable)
        prompt = _NARRATIVE_CLUSTERS_PROMPT.format(
            subject_name=ctx.subject_name,
            subject_category=ctx.subject_category_slug,
            themes_block=themes_block,
        )
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_NARRATIVE_CLUSTERS_SCHEMA,
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
                analysis_type="narrative_clusters",
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
                analysis_type="narrative_clusters",
                analysis_key=None,
                model_id=None,
                findings={},
                source_response_ids=[],
                cost_usd=cost,
                error=f"JSON parse failed: {e}",
                latency_ms=elapsed_ms,
            )]

        clusters_raw = parsed.get("clusters", []) if isinstance(parsed, dict) else []
        valid_ids = {r.model_response_id for r in clusterable}

        # Validate + enrich clusters: filter response_ids to those that
        # actually exist in this refresh; drop empty clusters.
        clean_clusters: list[dict[str, Any]] = []
        seen_response_ids: set[int] = set()
        for c in clusters_raw:
            if not isinstance(c, dict):
                continue
            name = (c.get("name") or "").strip()
            if not name:
                continue
            valid_for_cluster = [
                int(rid) for rid in c.get("response_ids", [])
                if isinstance(rid, (int, float)) and int(rid) in valid_ids
            ]
            # Deduplicate against responses already claimed by a prior
            # cluster — keep first-seen assignment, drop duplicates
            valid_for_cluster = [
                rid for rid in valid_for_cluster if rid not in seen_response_ids
            ]
            if not valid_for_cluster:
                continue
            seen_response_ids.update(valid_for_cluster)
            clean_clusters.append({
                "name": name,
                "description": (c.get("description") or "").strip(),
                "response_ids": valid_for_cluster,
                "sample_labels": [
                    str(s) for s in c.get("sample_labels", [])
                    if isinstance(s, str)
                ][:5],
                "n_responses": len(valid_for_cluster),
                # share computed against clusterable responses, not the
                # raw refresh size — that's the meaningful denominator
                # ("of responses where AI surfaced a theme, X% landed in
                # cluster Y")
                "share": len(valid_for_cluster) / len(clusterable),
            })

        # Sort by share desc so the UI can render in rank order
        clean_clusters.sort(key=lambda c: -c["share"])

        summary = (
            f"{len(clean_clusters)} narrative cluster(s) across "
            f"{len(clusterable)} response(s) with themes: "
            + ", ".join(
                f"{c['name']} {round(c['share'] * 100)}%"
                for c in clean_clusters
            )
        )

        return [CrossAnalysisResult(
            analysis_type="narrative_clusters",
            analysis_key=None,
            model_id=None,
            findings={
                "clusters": clean_clusters,
                "n_clusterable_responses": len(clusterable),
                "n_assigned": len(seen_response_ids),
            },
            source_response_ids=sorted(seen_response_ids),
            summary=summary,
            cost_usd=cost,
            latency_ms=elapsed_ms,
        )]


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
        NarrativeDriftAnalyzer(),
        NarrativeClusterAnalyzer(),
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
