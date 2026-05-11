-- 004_subjects_org_id.sql
--
-- Multi-tenancy: each subject belongs to a Clerk-style organization.
--
-- Why this is needed: byline's customer-facing API ships next. Without
-- per-org scoping, customer A would be able to GET /api/subjects and see
-- customer B's data. This migration adds the org_id column so the FastAPI
-- query layer can filter by `WHERE org_id = <jwt-claim>`.
--
-- Decisions:
--
-- 1. `org_id TEXT` (not a foreign key). Clerk organization IDs are
--    externally-managed strings (e.g. "org_2abc123..."). We don't shadow
--    them in a local table — Clerk is the source of truth.
--
-- 2. NULLABLE. The 11 existing seed subjects predate multi-tenancy.
--    Setting them all to NULL preserves them as "internal / unowned"
--    rows visible to the operator (Streamlit dashboard) but invisible
--    to any specific customer (the API filters by org_id, so NULL is
--    excluded from customer queries).
--
-- 3. Index on (org_id, created_at). The customer-facing list-subjects
--    query is `WHERE org_id = ? ORDER BY created_at DESC`; this is the
--    natural index for that path.

BEGIN;

ALTER TABLE subjects
    ADD COLUMN org_id TEXT;

CREATE INDEX idx_subjects_org_id
    ON subjects (org_id, created_at DESC);

COMMENT ON COLUMN subjects.org_id IS
    'Clerk organization id that owns this subject. NULL = internal/unowned '
    '(visible to operator, invisible to customer-facing API). Set at subject '
    'creation from the requesting user''s JWT org claim.';

COMMIT;
