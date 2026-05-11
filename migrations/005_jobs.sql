-- 005_jobs.sql
--
-- Async job queue for long-running operations triggered from the API.
--
-- The customer-facing UI's "Trigger refresh" button can't synchronously
-- call app.refresh (~30 seconds wall time, plus analyzer + cross_analyzer
-- on top). The API enqueues a row here, returns a job_id immediately,
-- and a worker process (`python -m app.worker`) picks queued rows up and
-- executes the chain. The frontend polls GET /api/jobs/{id} for status.
--
-- Decisions:
--
-- 1. `kind TEXT`. Only `'refresh'` is defined today (runs refresh →
--    analyzer → cross_analyzer). New kinds get new strings — no enum,
--    so we never need an ALTER TYPE migration.
--
-- 2. `status TEXT` with check constraint. queued → running → succeeded
--    OR queued → running → failed. No retry state machine yet —
--    failed jobs stay failed; the user can re-trigger.
--
-- 3. `org_id TEXT` denormalized from subjects.org_id at enqueue time.
--    Avoids a join on every status poll, and makes it trivial to
--    apply the multi-tenancy filter to GET /api/jobs/{id}. Worth the
--    redundancy.
--
-- 4. `refresh_run_id` populated when a refresh job succeeds. Lets the
--    frontend jump straight to the new refresh's findings.
--
-- 5. `result JSONB` for arbitrary success-side payload (cost, n_responses,
--    analysis_run_ids, etc.). Keeps the schema stable across whatever
--    new job kinds we add later.
--
-- 6. Index on (status, enqueued_at) drives the worker's claim query:
--    `SELECT … FROM jobs WHERE status = 'queued' ORDER BY enqueued_at
--    FOR UPDATE SKIP LOCKED LIMIT 1`. The partial index keeps it tiny
--    (queued is a small set; everything else is historical).
--
-- 7. Index on (subject_id, enqueued_at DESC) for the subject-page
--    "recent jobs for this subject" lookups.

BEGIN;

CREATE TABLE jobs (
    id              SERIAL PRIMARY KEY,
    subject_id      INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    org_id          TEXT,
    kind            TEXT NOT NULL CHECK (kind IN ('refresh')),
    status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
    enqueued_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    error           TEXT,
    refresh_run_id  INTEGER REFERENCES refresh_runs(id) ON DELETE SET NULL,
    result          JSONB
);

CREATE INDEX idx_jobs_queue_claim
    ON jobs (enqueued_at)
    WHERE status = 'queued';

CREATE INDEX idx_jobs_subject
    ON jobs (subject_id, enqueued_at DESC);

COMMENT ON TABLE jobs IS
    'Async job queue. Worker (app.worker) claims queued rows via '
    'SELECT … FOR UPDATE SKIP LOCKED, runs the matching kind in-process, '
    'and updates status. Frontend polls GET /api/jobs/{id}.';

COMMENT ON COLUMN jobs.org_id IS
    'Denormalized from subjects.org_id at enqueue time so the status '
    'endpoint can multi-tenancy-filter without a join.';

COMMIT;
