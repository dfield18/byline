-- 012_drop_null_org_subjects.sql
--
-- Drops the 11 legacy NULL-org subject rows (and all their downstream
-- analysis/response data) and then enforces subjects.org_id NOT NULL.
-- After this migration, the existing partial unique index from 006
-- (idx_subjects_unique_org_id_name WHERE org_id IS NOT NULL) covers
-- the whole table — no row can sneak past it via NULL anymore.
--
-- Background
-- ----------
-- Multi-tenancy arrived in 004_subjects_org_id.sql, but the column was
-- added nullable so seed data wouldn't break. The CLI (app/refresh.py)
-- then went on creating subjects without setting org_id for several
-- weeks, accumulating 11 NULL-org rows. Those rows are invisible to the
-- customer-facing API (every read path goes through `_require_org`,
-- which 400s without a real org), but they:
--
--   1. Share name-space with real-org subjects — `_find_subject_by_name`
--      was returning NULL-org rows when the operator meant the real-org
--      ones, silently writing refreshes into the wrong tenant
--      (see d7427b2 for the CLI-side fix).
--   2. Block adding `org_id NOT NULL`, leaving the schema's tenancy
--      contract permanently soft.
--
-- The 11 rows are seed/test data; the operator confirmed they have no
-- audience and elected to drop them rather than re-home them to an
-- ops org.
--
-- Row counts deleted (as observed pre-migration, May 25):
--    response_extractions:  1868
--    refresh_analyses:       186
--    analysis_runs:          132
--    model_responses:        652
--    refresh_runs:            29
--    jobs:                     8   (drop via subjects→jobs CASCADE)
--    subjects:                11

BEGIN;

-- Pin the target set once so every step deletes from the same snapshot
-- of "NULL-org subject ids". A temp table is the simplest correct way
-- to do this — re-running `WHERE subject_id IN (SELECT id FROM subjects
-- WHERE org_id IS NULL)` at every step would still work but reads as
-- if the set could shift mid-transaction (it can't, but the temp table
-- makes the invariant load-bearing in the syntax).
CREATE TEMP TABLE _null_org_subject_ids ON COMMIT DROP AS
    SELECT id FROM subjects WHERE org_id IS NULL;

-- Reverse-dependency-order deletes. Every FK into the affected tables
-- is NO ACTION (see pg_constraint dump), so leaf rows must go first.
-- response_extractions sits at two depths (subject_id direct AND
-- model_response_id / analysis_run_id chains); deleting by the direct
-- subject_id covers the whole subset in one shot.
DELETE FROM response_extractions WHERE subject_id IN (SELECT id FROM _null_org_subject_ids);
DELETE FROM refresh_analyses     WHERE subject_id IN (SELECT id FROM _null_org_subject_ids);
DELETE FROM analysis_runs        WHERE subject_id IN (SELECT id FROM _null_org_subject_ids);
DELETE FROM model_responses      WHERE subject_id IN (SELECT id FROM _null_org_subject_ids);
DELETE FROM refresh_runs         WHERE subject_id IN (SELECT id FROM _null_org_subject_ids);

-- subjects → jobs is ON DELETE CASCADE, so jobs cleans up automatically
-- when we drop the parent rows below.
DELETE FROM subjects WHERE id IN (SELECT id FROM _null_org_subject_ids);

-- Backstop the contract at the schema level. Going forward, the CLI's
-- patched `_resolve_org_id` raises before reaching the DB, and the API
-- never inserts NULL org_id (it requires the auth dep). NOT NULL makes
-- "subjects without an org" structurally impossible.
ALTER TABLE subjects ALTER COLUMN org_id SET NOT NULL;

COMMIT;
