"""app/worker.py — async job worker.

Long-running process that polls the `jobs` table for queued rows and
executes them in-process. Run alongside the FastAPI server:

    python -m app.worker

Per kind, the worker calls the existing chain that the CLI runs:

  refresh:
    1. _ensure_recent_news_fresh(subject_id, name)
    2. run_refresh(subject_id) → refresh_run_id
    3. run_analysis(refresh_run_id, [default extractors]) → analysis_run_id
    4. run_cross_analysis(refresh_run_id, [default cross-analyzers])
       → cross_analysis_run_id

Concurrency: one job at a time per worker, with `SELECT … FOR UPDATE
SKIP LOCKED` claiming the row so multiple worker processes coexist
safely.

Failure handling for v1: failed jobs stay failed; the user can
re-trigger from the UI. No retries, no stuck-job reaper. Add when
real traffic justifies it.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import signal
import sys
from typing import Any

from dotenv import load_dotenv

load_dotenv()

from app.analyzer import (  # noqa: E402
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
from app.cross_analyzer import (  # noqa: E402
    AsymmetryAnalyzer,
    NarrativeClusterAnalyzer,
    NarrativeDriftAnalyzer,
    ShareOfVoiceAnalyzer,
    TopQuotesAnalyzer,
    run_cross_analysis,
)
from app.db import get_database_url  # noqa: E402
from app.query_engine import run_refresh  # noqa: E402
from app.refresh import _ensure_recent_news_fresh  # noqa: E402
from dashboard.lib.queries import get_subject_overview  # noqa: E402

import psycopg  # noqa: E402
from psycopg.types.json import Json  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("app.worker")


# ─── job claim / status helpers ──────────────────────────────────────
#
# Each helper opens a fresh psycopg connection. Earlier versions held
# one connection across the whole polling iteration including the
# multi-minute chain — managed Postgres providers (Neon, RDS, etc.)
# silently close idle connections after ~5 min, so by the time we got
# to _mark_succeeded the connection was dead. Status updates failed
# silently and jobs stayed `running` forever.
#
# clock_timestamp() (vs NOW()) is still important: NOW() returns the
# transaction start time, and even short-lived connections will report
# the same value across rapid successive commits.


def _claim_next_job() -> dict[str, Any] | None:
    """Atomically claim the oldest queued job and flip it to running.
    Uses FOR UPDATE SKIP LOCKED so multiple workers don't fight."""
    with psycopg.connect(get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE jobs
                SET status = 'running', started_at = clock_timestamp()
                WHERE id = (
                    SELECT id
                    FROM jobs
                    WHERE status = 'queued'
                    ORDER BY enqueued_at
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                )
                RETURNING id, subject_id, org_id, kind
                """
            )
            row = cur.fetchone()
        conn.commit()
    if not row:
        return None
    return {
        "id": row[0],
        "subject_id": row[1],
        "org_id": row[2],
        "kind": row[3],
    }


def _mark_succeeded(
    job_id: int,
    refresh_run_id: int | None,
    result: dict[str, Any],
) -> None:
    with psycopg.connect(get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE jobs
                SET status = 'succeeded',
                    completed_at = clock_timestamp(),
                    refresh_run_id = %s,
                    result = %s
                WHERE id = %s
                """,
                (refresh_run_id, Json(result), job_id),
            )
        conn.commit()


def _mark_failed(job_id: int, err: str) -> None:
    # Truncate error text; psycopg handles long text fine, but the UI
    # doesn't need 10KB stack traces.
    err = err[:2000]
    try:
        with psycopg.connect(get_database_url()) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE jobs
                    SET status = 'failed', completed_at = clock_timestamp(), error = %s
                    WHERE id = %s
                    """,
                    (err, job_id),
                )
            conn.commit()
    except psycopg.Error:
        # The mark-failed itself can't fail silently — log loudly so an
        # operator notices a stuck `running` row.
        logger.exception(
            "Failed to mark job %s as failed; row will be left as `running` "
            "until a stuck-job reaper fixes it.", job_id,
        )


def _lookup_subject_name(subject_id: int) -> str | None:
    with psycopg.connect(get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT name FROM subjects WHERE id = %s", (subject_id,))
            row = cur.fetchone()
    return row[0] if row else None


# ─── job kinds ───────────────────────────────────────────────────────


def _default_extractors() -> list[Extractor]:
    """The same extractor list the analyzer CLI uses (non-combined mode)."""
    source_type_ids = _fetch_source_type_ids()
    return [
        DescriptorExtractor(),
        SourcesExtractor(source_type_ids),
        EntitiesExtractor(),
        ScoresExtractor(),
        NarrativeThemesExtractor(),
        MentionDetectionExtractor(),
    ]


async def _execute_refresh_job(
    subject_id: int, subject_name: str
) -> dict[str, Any]:
    """The refresh chain. Returns a dict suitable for jobs.result."""
    # 1. Recent news. `_ensure_recent_news_fresh` is sync but uses
    # asyncio.run() internally for the web fetch — pushing it to a
    # thread avoids the "cannot call asyncio.run() from a running event
    # loop" collision with our outer worker loop. Non-fatal on failure.
    await asyncio.to_thread(_ensure_recent_news_fresh, subject_id, subject_name)

    # 2. Query the providers.
    logger.info("[subject %s] starting refresh", subject_id)
    refresh_run_id = await run_refresh(subject_id)
    logger.info("[subject %s] refresh_run_id=%s", subject_id, refresh_run_id)

    # 3. Per-response analysis (descriptors / sources / entities / …).
    extractors = _default_extractors()
    logger.info(
        "[refresh %s] running %d extractor(s)", refresh_run_id, len(extractors)
    )
    analysis_run_id = await run_analysis(refresh_run_id, extractors)
    logger.info("[refresh %s] analysis_run_id=%s", refresh_run_id, analysis_run_id)

    # 4. Cross-response analysis. `run_cross_analysis` is sync and may
    # internally invoke asyncio.run() for its LLM-backed analyzers
    # (TopQuotes, NarrativeDrift). Same to_thread pattern as step 1.
    cross_analyzers = [
        AsymmetryAnalyzer(),
        TopQuotesAnalyzer(),
        ShareOfVoiceAnalyzer(),
        NarrativeDriftAnalyzer(),
        NarrativeClusterAnalyzer(),
    ]
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
    # 5-15s Gemini 2.5 Pro call) so the first dashboard load for this
    # subject is a pure cache hit instead of paying the full LLM
    # latency in the user-facing request path. Triggered as a side
    # effect of `get_subject_overview`, which calls
    # `_compute_recommended_actions` and writes the result to
    # `refresh_analyses` via the upsert + advisory-lock pattern.
    #
    # Failure handling: any exception here is logged at WARNING and
    # swallowed. The dashboard render path falls back to firing the
    # LLM call on demand the same way it did before this precompute
    # existed — worst case is the user waits the full 5-15s, same
    # as the pre-L11 behavior.
    #
    # Concurrency: if a user opens the dashboard for this subject
    # concurrently with the worker's precompute, the advisory lock
    # serializes them. Only one LLM call fires regardless of who
    # gets to it first.
    #
    # `get_subject_overview(subject_id)` (no org_id) runs in
    # operator/unscoped mode — appropriate for the worker, which
    # has no Clerk user context.
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


# ─── main loop ───────────────────────────────────────────────────────


_should_stop = False


def _install_signal_handlers() -> None:
    def _handler(signum, _frame):
        global _should_stop
        logger.info("Caught signal %s; stopping after current job.", signum)
        _should_stop = True

    signal.signal(signal.SIGINT, _handler)
    signal.signal(signal.SIGTERM, _handler)


async def _main(poll_seconds: float) -> None:
    _install_signal_handlers()
    logger.info("Worker started. Polling every %.1fs.", poll_seconds)

    while not _should_stop:
        try:
            job = _claim_next_job()
        except psycopg.Error as exc:
            logger.error(
                "DB error claiming next job: %s; sleeping then retrying", exc,
            )
            await asyncio.sleep(poll_seconds * 5)
            continue

        if job is None:
            await asyncio.sleep(poll_seconds)
            continue

        logger.info(
            "Claimed job %s (kind=%s, subject_id=%s, org_id=%s)",
            job["id"], job["kind"], job["subject_id"], job["org_id"],
        )

        try:
            if job["kind"] == "refresh":
                name = _lookup_subject_name(job["subject_id"])
                if not name:
                    raise RuntimeError(
                        f"subject {job['subject_id']} not found"
                    )
                result = await _execute_refresh_job(job["subject_id"], name)
                _mark_succeeded(
                    job["id"], result["refresh_run_id"], result
                )
                logger.info("Job %s succeeded: %s", job["id"], result)
            else:
                raise RuntimeError(f"unknown job kind: {job['kind']}")
        except Exception as exc:  # noqa: BLE001
            logger.exception("Job %s failed", job["id"])
            _mark_failed(job["id"], f"{type(exc).__name__}: {exc}")


def main() -> None:
    parser = argparse.ArgumentParser(description="byline async job worker")
    parser.add_argument(
        "--poll-seconds",
        type=float,
        default=1.0,
        help="Seconds between queue polls when idle (default 1.0).",
    )
    args = parser.parse_args()
    asyncio.run(_main(args.poll_seconds))


if __name__ == "__main__":
    main()
