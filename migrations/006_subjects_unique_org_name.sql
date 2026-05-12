-- 006_subjects_unique_org_name.sql
--
-- Backstop for the (org_id, name) uniqueness rule that create_subject in
-- dashboard/lib/queries.py already tries to enforce via SELECT-then-INSERT.
-- Without a DB-level constraint, two simultaneous POST /api/subjects
-- requests from the same user can both pass the SELECT and both INSERT,
-- yielding two rows with the same (org_id, name). This index makes the
-- second INSERT raise a unique-violation that create_subject catches as
-- ValueError and the API surfaces as 400.
--
-- Why partial (WHERE org_id IS NOT NULL):
--
-- 1. The 11 seed subjects all have org_id = NULL (internal / unowned).
--    Their names happen to be globally unique already, but the
--    multi-tenancy contract says NULL-org rows are "operator-only" and
--    shouldn't share name-space with customer rows. The partial index
--    leaves them untouched.
--
-- 2. PostgreSQL treats NULLs in unique indexes as distinct by default,
--    so unrestricted (org_id, name) would already allow multiple NULL-
--    org subjects with the same name. Being explicit with WHERE org_id
--    IS NOT NULL documents the intent.

BEGIN;

CREATE UNIQUE INDEX idx_subjects_unique_org_id_name
    ON subjects (org_id, name)
    WHERE org_id IS NOT NULL;

COMMIT;
