"""app/prompt_preview.py — shared run-and-score service for prompt preview.

Runs a single prompt against the selected models and scores each response
using the EXACT same scorer the scheduled pipeline uses — no parallel
scoring implementation, so a preview can't drift from a real run:

  - querying goes through the same `get_provider(...).query(...)` call the
    scheduler's `query_engine.run_refresh` makes;
  - sentiment comes from `analyzer.ScoresExtractor`, and the subject-mention
    signal from `analyzer.MentionDetectionExtractor` — the exact classes
    `pipeline.default_extractors()` → `run_analysis` runs on scheduled
    refreshes.

This function does NOT touch Postgres. The scheduler queries-then-persists;
preview queries-then-returns. Scores are returned raw (the scheduler stores
the raw extractor output too — no rounding either side).

Note on the scheduler also calling this: byline's scheduled path splits
query (welded to persistence in run_refresh) and scoring (a separate
run_analysis stage over stored rows), so there's no single per-prompt
run+score function in the scheduler to literally share. The drift-prone
unit is the scorer, and preview reuses those exact extractor classes — the
drift test pins that at the code level.
"""
from __future__ import annotations

import asyncio
from typing import Any

from pydantic import BaseModel

from app.analyzer import (
    MentionDetectionExtractor,
    ResponseToAnalyze,
    ScoresExtractor,
)
from app.db import get_cursor
from app.providers import get_provider


# Per-model wall-clock budget for the model call (scoring runs after, with
# its own internal retry bounds).
DEFAULT_TIMEOUT_S = 30.0


class ModelRunResult(BaseModel):
    """One model's preview result. `subject_mentioned` + `mention_rank` come
    straight from MentionDetectionExtractor (no invented visibility float)."""

    model: str
    response: str | None
    sentiment: float | None
    subject_mentioned: bool | None
    mention_rank: int | None
    grounded: bool
    error: str | None = None


def resolve_model_specs(slugs: list[str]) -> dict[str, tuple[str, str]]:
    """Map requested model slugs → (provider, model_identifier) from the
    `models` table. Slugs absent from the table are absent from the result,
    so callers can 422 unknowns.

    NB: deliberately NOT filtered on `active`. The `active` flag means
    "include in scheduled refreshes" — preview is a separate, on-demand
    surface, so it can offer any configured provider (e.g. claude/perplexity
    seeded inactive until their keys land) without forcing them into the
    scheduler's keyless-failure path.
    """
    if not slugs:
        return {}
    with get_cursor(commit=False) as cur:
        cur.execute(
            """
            SELECT slug, provider, model_identifier
            FROM models
            WHERE slug = ANY(%s)
            """,
            (list(slugs),),
        )
        return {slug: (provider, ident) for slug, provider, ident in cur.fetchall()}


def _score_inputs(response_text: str, subject: str) -> ResponseToAnalyze:
    # layer='unnamed' so MentionDetectionExtractor actually computes the
    # mention signal (it no-ops on 'named'). The preview's "did the model
    # surface the subject, and how prominently" is exactly the unnamed-layer
    # share-of-voice question.
    return ResponseToAnalyze(
        id=0,
        subject_id=0,
        subject_name=subject,
        subject_setup_inputs={},
        model_id=0,
        prompt_id=0,
        layer="unnamed",
        response_text=response_text,
        response_metadata={},
    )


async def _score(
    response_text: str, subject: str
) -> tuple[float | None, bool | None, int | None, str | None]:
    """Sentiment + mention signal via the exact scheduled-pipeline extractors.

    Returns (sentiment, subject_mentioned, mention_rank, error)."""
    scorer = ScoresExtractor()
    mentioner = MentionDetectionExtractor()
    resp = _score_inputs(response_text, subject)

    scores_res, mention_res = await asyncio.gather(
        scorer.extract(resp), mentioner.extract(resp)
    )

    sentiment: float | None = None
    if scores_res.output and isinstance(scores_res.output, dict):
        raw = scores_res.output.get("sentiment")
        sentiment = float(raw) if isinstance(raw, (int, float)) else None

    extra = mention_res.extra_columns or {}
    subject_mentioned = extra.get("subject_mentioned")
    mention_rank = extra.get("mention_rank")

    errs = [e for e in (scores_res.error, mention_res.error) if e]
    return sentiment, subject_mentioned, mention_rank, ("; ".join(errs) or None)


async def _run_one(
    slug: str,
    provider_slug: str,
    model_identifier: str,
    text: str,
    subject: str,
    grounded: bool,
    timeout_s: float,
) -> ModelRunResult:
    # Query the model (same provider.query the scheduler uses), bounded by a
    # per-model timeout. provider.query never raises (Provider contract), but
    # wait_for guards a hung call.
    try:
        provider = get_provider(provider_slug, model_identifier)
        pr = await asyncio.wait_for(
            provider.query(text, {}, enable_grounding=grounded),
            timeout=timeout_s,
        )
    except asyncio.TimeoutError:
        return ModelRunResult(
            model=slug, response=None, sentiment=None,
            subject_mentioned=None, mention_rank=None,
            grounded=grounded, error=f"timed out after {timeout_s:g}s",
        )
    except Exception as e:  # defensive — shouldn't happen
        return ModelRunResult(
            model=slug, response=None, sentiment=None,
            subject_mentioned=None, mention_rank=None,
            grounded=grounded, error=f"{type(e).__name__}: {e}",
        )

    if not pr.success or not pr.text:
        return ModelRunResult(
            model=slug, response=pr.text, sentiment=None,
            subject_mentioned=None, mention_rank=None,
            grounded=bool(pr.metadata.get("grounding_enabled", grounded)),
            error=pr.error or "model returned no text",
        )

    sentiment, mentioned, rank, score_err = await _score(pr.text, subject)
    return ModelRunResult(
        model=slug,
        response=pr.text,
        sentiment=sentiment,
        subject_mentioned=mentioned,
        mention_rank=rank,
        grounded=bool(pr.metadata.get("grounding_enabled", grounded)),
        error=score_err,
    )


async def run_prompt_against_models(
    text: str,
    models: list[str],
    subject: str,
    *,
    grounded: bool = True,
    timeout_s: float = DEFAULT_TIMEOUT_S,
) -> list[ModelRunResult]:
    """Run `text` against `models` (slugs) for `subject`, concurrently, and
    score each via the scheduled-pipeline scorer. Read-only — persists nothing.

    One model timing out or erroring never fails the others or the call: those
    come back as a ModelRunResult with `error` set and `response`/scores None.
    Results preserve the order of `models`.
    """
    specs = resolve_model_specs(models)

    async def dispatch(slug: str) -> ModelRunResult:
        spec = specs.get(slug)
        if spec is None:
            return ModelRunResult(
                model=slug, response=None, sentiment=None,
                subject_mentioned=None, mention_rank=None,
                grounded=grounded, error="unknown model",
            )
        provider_slug, model_identifier = spec
        return await _run_one(
            slug, provider_slug, model_identifier, text, subject, grounded, timeout_s
        )

    outcomes = await asyncio.gather(
        *[dispatch(m) for m in models], return_exceptions=True
    )

    results: list[ModelRunResult] = []
    for slug, outcome in zip(models, outcomes):
        if isinstance(outcome, ModelRunResult):
            results.append(outcome)
        else:  # a dispatch coroutine raised unexpectedly — capture, don't crash
            results.append(
                ModelRunResult(
                    model=slug, response=None, sentiment=None,
                    subject_mentioned=None, mention_rank=None,
                    grounded=grounded,
                    error=f"{type(outcome).__name__}: {outcome}",
                )
            )
    return results
