-- 002_add_grounding_enabled.sql
-- Track whether each refresh run had web-search grounding enabled.

BEGIN;

ALTER TABLE refresh_runs
    ADD COLUMN grounding_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Existing rows predate grounding support; mark them accordingly so
-- historical runs aren't misrepresented as grounded.
UPDATE refresh_runs SET grounding_enabled = FALSE;

COMMIT;
