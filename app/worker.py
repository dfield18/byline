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

from app.db import get_database_url  # noqa: E402
from app.pipeline import run_full_refresh_pipeline  # noqa: E402

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
    Uses FOR UPDATE SKIP LOCKED so multiple workers don't fight.

    Also returns subjects.org_id alongside the job's recorded org_id
    so the caller can defense-in-depth-assert they match before
    executing — see _assert_job_tenancy below. The check belongs at
    claim time, not at enqueue time, because a tenancy mismatch
    introduced by a future bug in the enqueue path would otherwise
    silently process a cross-org refresh."""
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
                RETURNING id, subject_id, org_id, kind,
                    (SELECT org_id FROM subjects WHERE id = jobs.subject_id) AS subject_org_id
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
        "subject_org_id": row[4],
    }


def _assert_job_tenancy(job: dict[str, Any]) -> str | None:
    """Returns an error string when the claimed job's org_id doesn't
    match the subject's org_id (tenancy mismatch — should never
    happen under any current enqueue path, but checked here as a
    backstop so a future enqueue bug can't leak a refresh across
    orgs). Returns None when the job is consistent."""
    if job.get("subject_org_id") is None:
        # Subject vanished between enqueue and claim. Treat as
        # tenancy-fail so we don't run the chain against a deleted
        # subject.
        return (
            f"tenancy: subject {job['subject_id']} not found "
            f"(deleted between enqueue and claim?)"
        )
    if job["org_id"] != job["subject_org_id"]:
        return (
            f"tenancy mismatch: job.org_id={job['org_id']!r} but "
            f"subject {job['subject_id']}.org_id={job['subject_org_id']!r}. "
            f"Refusing to execute — would have leaked across tenants."
        )
    return None


def _mark_succeeded(
    job_id: int,
    refresh_run_id: int | None,
    result: dict[str, Any],
) -> None:
    # `WHERE id = %s AND status = 'running'` guards against a race
    # with `reap_stale_jobs`: if the reaper flipped this row to
    # 'failed' while the pipeline was still finishing, the late
    # `_mark_succeeded` would otherwise silently resurrect the row
    # to 'succeeded' and the reaper's "kill" would be undone. With
    # the guard, the UPDATE matches zero rows and the late finish
    # is logged as a no-op.
    with psycopg.connect(get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE jobs
                SET status = 'succeeded',
                    completed_at = clock_timestamp(),
                    refresh_run_id = %s,
                    result = %s
                WHERE id = %s AND status = 'running'
                """,
                (refresh_run_id, Json(result), job_id),
            )
            updated = cur.rowcount
        conn.commit()
    if updated == 0:
        logger.warning(
            "Job %s late-succeeded but row was no longer in 'running' "
            "state (likely reaped). Leaving the reaper's status as-is; "
            "pipeline output (refresh_run_id=%s) is still in DB but the "
            "jobs row reflects the kill.",
            job_id,
            refresh_run_id,
        )


def _mark_failed(job_id: int, err: str) -> None:
    # Truncate error text; psycopg handles long text fine, but the UI
    # doesn't need 10KB stack traces. Same `status='running'` guard
    # as _mark_succeeded — once the reaper has flipped this row to
    # 'failed', a late pipeline-side _mark_failed shouldn't overwrite
    # the reaper's error string with a less-informative one.
    err = err[:2000]
    try:
        with psycopg.connect(get_database_url()) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE jobs
                    SET status = 'failed', completed_at = clock_timestamp(), error = %s
                    WHERE id = %s AND status = 'running'
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


# ─── stale-job reaper ────────────────────────────────────────────────
#
# When the worker process is SIGKILL'd mid-job (OOM, host crash,
# platform-grace-window expiry, manual `kill -9`), `_mark_failed`
# never runs — the job row stays `status='running'` and the
# refresh_runs row stays `status='in_progress'` forever. That's bad
# beyond looking ugly: the per-subject cooldown query in
# `app/api/routes/subjects.py` counts `running` jobs against the
# limit, so a single stuck row permanently blocks every future
# refresh attempt for that subject until an operator opens psql.
#
# The reaper is the safety net. On each poll iteration (and at
# worker startup, before the loop begins) it sweeps both tables for
# rows that have been `running` / `in_progress` longer than a
# threshold and flips them to `failed`. The threshold is generous
# (default 10 minutes) — a real refresh-pipeline run is ~2-5 min
# end-to-end, so 10 min leaves plenty of headroom while still
# clearing the runway in single-digit minutes after a crash.
#
# Why no heartbeat: a heartbeat-updated `last_heartbeat_at` column
# would let us reap faster (e.g., 90s after last beat) without
# false positives on long jobs. But that needs a schema change and
# a heartbeat coroutine inside the pipeline; for v1, a fixed
# threshold is good enough and zero-config.


def _reap_threshold_minutes() -> int:
    """How long a row can sit in running/in_progress before being
    considered stuck. Configurable via env so an operator on a
    slower environment (or running unusually long jobs) can extend
    it without code changes."""
    try:
        return max(1, int(os.environ.get("BYLINE_REAP_THRESHOLD_MINUTES", "10")))
    except ValueError:
        logger.warning(
            "Invalid BYLINE_REAP_THRESHOLD_MINUTES; falling back to 10."
        )
        return 10


def reap_stale_jobs(threshold_minutes: int | None = None) -> dict[str, int]:
    """Mark stuck jobs/refresh_runs as failed. Returns a count dict
    suitable for logging. Safe to call concurrently from multiple
    workers — the WHERE clause is naturally idempotent (a row already
    flipped to 'failed' won't match `status='running'` on the next
    call). Exposed as a public name (no underscore prefix) so an
    operator can invoke it ad-hoc:
        python -c 'from app.worker import reap_stale_jobs; \\
                   print(reap_stale_jobs())'
    """
    threshold = threshold_minutes if threshold_minutes is not None else _reap_threshold_minutes()
    reaped: dict[str, int] = {"jobs": 0, "refresh_runs": 0}
    try:
        with psycopg.connect(get_database_url()) as conn:
            with conn.cursor() as cur:
                # `jobs.status='running'` with a stale started_at →
                # mark failed with a reaper-attributable error string
                # so the UI / monitoring can distinguish reaper kills
                # from in-pipeline failures. Subject_id + age go to
                # logs below for operator visibility.
                cur.execute(
                    """
                    UPDATE jobs
                    SET status = 'failed',
                        completed_at = clock_timestamp(),
                        error = format(
                            'reaped: job in running state for >%s min (likely worker SIGKILL or crash)',
                            %s
                        )
                    WHERE status = 'running'
                      AND started_at < clock_timestamp() - (INTERVAL '1 minute' * %s)
                    RETURNING id, subject_id,
                        EXTRACT(EPOCH FROM (clock_timestamp() - started_at))::int
                    """,
                    (threshold, threshold, threshold),
                )
                job_rows = cur.fetchall()
                # `refresh_runs.status='in_progress'` covers BOTH the
                # worker-orchestrated path AND CLI-direct runs (a
                # SIGKILL'd `python -m app.refresh` leaves a refresh_runs
                # orphan but no jobs row). Reaping this table
                # independently catches both cases.
                cur.execute(
                    """
                    UPDATE refresh_runs
                    SET status = 'failed',
                        completed_at = clock_timestamp()
                    WHERE status = 'in_progress'
                      AND started_at < clock_timestamp() - (INTERVAL '1 minute' * %s)
                    RETURNING id, subject_id,
                        EXTRACT(EPOCH FROM (clock_timestamp() - started_at))::int
                    """,
                    (threshold,),
                )
                rr_rows = cur.fetchall()
            conn.commit()
        for jid, sid, age in job_rows:
            logger.warning(
                "Reaped stale job %s (subject_id=%s, age=%ds, threshold=%dmin)",
                jid, sid, age, threshold,
            )
        for rid, sid, age in rr_rows:
            logger.warning(
                "Reaped stale refresh_run %s (subject_id=%s, age=%ds, threshold=%dmin)",
                rid, sid, age, threshold,
            )
        reaped["jobs"] = len(job_rows)
        reaped["refresh_runs"] = len(rr_rows)
    except psycopg.Error:
        # The reaper itself failing is non-fatal — the loop's next
        # iteration retries. Log loudly so monitoring sees it.
        logger.exception("Reaper failed (will retry on next poll cycle)")
    return reaped


# ─── job kinds ───────────────────────────────────────────────────────


async def _execute_refresh_job(
    subject_id: int, subject_name: str
) -> dict[str, Any]:
    """Worker entry point — delegates to the shared pipeline so the
    worker and the CLI run the exact same 5-step chain. Result dict
    flows back into `jobs.result`."""
    return await run_full_refresh_pipeline(subject_id, subject_name)


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
    threshold = _reap_threshold_minutes()
    logger.info(
        "Worker started. Polling every %.1fs, stale-job threshold=%dmin.",
        poll_seconds, threshold,
    )

    # Startup reap — clears any orphans the previous worker (or a
    # SIGKILL'd CLI run) left behind. Without this, subjects with
    # stuck rows would stay blocked until the next normal poll cycle
    # tripped the reaper anyway, but doing it eagerly at startup
    # makes "restart the worker" the obvious recovery action.
    startup_reaped = reap_stale_jobs(threshold)
    if startup_reaped["jobs"] or startup_reaped["refresh_runs"]:
        logger.warning(
            "Startup reaper cleared %d job(s) and %d refresh_run(s).",
            startup_reaped["jobs"], startup_reaped["refresh_runs"],
        )

    while not _should_stop:
        # Per-iteration reap. Cheap when the tables are clean (two
        # UPDATEs matching zero rows); essential when another worker
        # process or a CLI run has died mid-job and left orphans.
        # Runs BEFORE _claim_next_job so a freshly-reaped subject's
        # cooldown counter is correct by the time the next enqueue
        # request lands.
        reap_stale_jobs(threshold)

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

        # Defense in depth: a future bug in any enqueue path that wrote
        # `jobs.org_id` ≠ `subjects.org_id` would silently process a
        # cross-org refresh today. Catch it at execution time and fail
        # the job loudly so monitoring sees it.
        tenancy_err = _assert_job_tenancy(job)
        if tenancy_err is not None:
            logger.error("Job %s rejected: %s", job["id"], tenancy_err)
            _mark_failed(job["id"], tenancy_err)
            continue

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
