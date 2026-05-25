"""Single source of truth for the byline refresh pipeline.

Both the async job worker (`app/worker.py`) and the operator CLI
(`app/refresh.py`) drive a subject through five steps:

    1. _ensure_recent_news_fresh(subject_id, name)   — refresh cached news
    2. run_refresh(subject_id, …)                    — query providers
    3. run_analysis(refresh_run_id, extractors)      — per-response extraction
    4. run_cross_analysis(refresh_run_id, analyzers) — cross-response synthesis
    5. get_subject_overview(subject_id)              — precompute recommended actions

Before this module existed, the worker ran all five steps but the CLI's
`main()` only ran step 2 — so any subject refreshed via CLI (including
every historical backfill, since `--historical-as-of` is CLI-only) shipped
with empty analyzer / cross-analyzer / recommended-actions data, breaking
the dashboard's Narrative / Sources / Recommendations tabs for that
subject's snapshots until an operator hand-stitched the rest of the chain.

The two callers diverge only in inputs / output framing, so the
canonical chain lives here and they share it:

  - worker calls `run_full_refresh_pipeline(subject_id, subject_name)`
    (always live; result dict goes back into the `jobs` row);
  - CLI calls it with `historical_as_of=<date>` for backfills, where
    steps 1 and 5 are skipped because they're "latest-snapshot"
    operations that backfills don't change.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import date
from typing import Any

from app.analyzer import (
    DescriptorExtractor,
    EntitiesExtractor,
    Extractor,
    MentionDetectionExtractor,
    NarrativeThemesExtractor,
    ScoresExtractor,
    SourcesExtractor,
    _fetch_source_type_ids,
    run_analysis,
)
from app.cross_analyzer import (
    AsymmetryAnalyzer,
    NarrativeClusterAnalyzer,
    NarrativeDriftAnalyzer,
    ShareOfVoiceAnalyzer,
    TopQuotesAnalyzer,
    run_cross_analysis,
)
from app.query_engine import run_refresh
from app.refresh import _ensure_recent_news_fresh
from dashboard.lib.queries import get_subject_overview

logger = logging.getLogger("app.pipeline")


def default_extractors() -> list[Extractor]:
    """Canonical extractor list, used by the worker, the CLI, and the
    analyzer CLI's non-combined mode. Adding a new extractor here makes
    every refresh path pick it up."""
    source_type_ids = _fetch_source_type_ids()
    return [
        DescriptorExtractor(),
        SourcesExtractor(source_type_ids),
        EntitiesExtractor(),
        ScoresExtractor(),
        NarrativeThemesExtractor(),
        MentionDetectionExtractor(),
    ]


def default_cross_analyzers() -> list[Any]:
    """Canonical cross-analyzer list. Order mirrors the worker's
    historical ordering (asymmetry → top quotes → SoV → drift →
    clusters) so downstream consumers reading by index stay stable."""
    return [
        AsymmetryAnalyzer(),
        TopQuotesAnalyzer(),
        ShareOfVoiceAnalyzer(),
        NarrativeDriftAnalyzer(),
        NarrativeClusterAnalyzer(),
    ]


async def run_full_refresh_pipeline(
    subject_id: int,
    subject_name: str,
    *,
    max_concurrency: int = 26,
    historical_as_of: date | None = None,
) -> dict[str, Any]:
    """Run the full 5-step refresh pipeline for one subject. Returns a
    result dict mirroring what the worker writes to `jobs.result`.

    Historical mode (`historical_as_of` set) skips two steps that are
    semantically tied to "what's the latest snapshot":
      - step 1 (recent_news refresh): generated prompts are already
        skipped by `run_refresh` in historical mode, so the cached
        recent_news value isn't read at all;
      - step 5 (recommended-actions precompute): `get_subject_overview`
        reads the subject's latest live refresh, which a backfill
        doesn't change. Running it would burn a Gemini call per
        backfill without producing a different cached row.
    """
    is_historical = historical_as_of is not None

    # 1. Recent news. Skip for historical backfills (see docstring).
    # _ensure_recent_news_fresh is sync but uses asyncio.run() inside
    # for the web fetch — push to a thread so it doesn't collide with
    # the caller's running event loop. Non-fatal on failure.
    if not is_historical:
        await asyncio.to_thread(_ensure_recent_news_fresh, subject_id, subject_name)

    # 2. Query the providers.
    logger.info("[subject %s] starting refresh", subject_id)
    refresh_run_id = await run_refresh(
        subject_id,
        max_concurrency=max_concurrency,
        historical_as_of=historical_as_of,
    )
    logger.info("[subject %s] refresh_run_id=%s", subject_id, refresh_run_id)

    # 3. Per-response analysis.
    extractors = default_extractors()
    logger.info(
        "[refresh %s] running %d extractor(s)", refresh_run_id, len(extractors)
    )
    analysis_run_id = await run_analysis(refresh_run_id, extractors)
    logger.info("[refresh %s] analysis_run_id=%s", refresh_run_id, analysis_run_id)

    # 4. Cross-response analysis. `run_cross_analysis` is sync and may
    # internally invoke asyncio.run() for its LLM-backed analyzers —
    # same to_thread pattern as step 1.
    cross_analyzers = default_cross_analyzers()
    logger.info(
        "[refresh %s] running %d cross-analyzer(s)",
        refresh_run_id,
        len(cross_analyzers),
    )
    cross_analysis_run_id = await asyncio.to_thread(
        run_cross_analysis, refresh_run_id, cross_analyzers
    )
    logger.info(
        "[refresh %s] cross_analysis_run_id=%s",
        refresh_run_id,
        cross_analysis_run_id,
    )

    # 5. Precompute the dashboard's Recommended Actions (LLM-driven,
    # 5-15s Gemini call). Skipped for historical backfills (see
    # docstring). For live refreshes, failure is logged at WARNING
    # and swallowed — the dashboard render path falls back to firing
    # the LLM call on demand, same as the pre-precompute behavior.
    if not is_historical:
        try:
            logger.info(
                "[refresh %s] precomputing recommended actions",
                refresh_run_id,
            )
            await asyncio.to_thread(get_subject_overview, subject_id)
            logger.info(
                "[refresh %s] recommended actions precomputed",
                refresh_run_id,
            )
        except Exception as e:
            logger.warning(
                "[refresh %s] recommended actions precompute failed: %s",
                refresh_run_id,
                e,
            )

    return {
        "refresh_run_id": refresh_run_id,
        "analysis_run_id": analysis_run_id,
        "cross_analysis_run_id": cross_analysis_run_id,
    }
