-- 011_recommended_actions_unique.sql
-- Defense-in-depth for the Recommended Actions cache: a partial
-- unique index that guarantees at most one row per
-- (refresh_run_id, analysis_type) for the `recommended_actions_*`
-- family of analysis types.
--
-- Why partial and not table-wide:
--   Other analyzers writing to `refresh_analyses` use different
--   patterns — `asymmetry` and `share_of_voice` write multiple rows
--   per refresh (one per model_id). A table-wide unique index on
--   (refresh_run_id, analysis_type) would break those writers. The
--   partial index applies ONLY to the Recommended Actions cache,
--   which is the only writer that needs strict one-row-per-refresh.
--
-- Why a LIKE-prefix and not the specific version (e.g. 'recommended_actions_v4'):
--   The cache version is bumped over time (v1 → v2 → ... → v4 today).
--   Using a prefix predicate means the constraint covers every future
--   version automatically, no migration needed when the version
--   string changes.
--
-- Why not relying on the application advisory lock alone:
--   `pg_advisory_xact_lock` in `_compute_recommended_actions`
--   serializes concurrent writers and is the primary defense. This
--   index is belt-and-suspenders: if a future code path forgets to
--   take the lock, if the DB layer fails partway through, or if a
--   manual SQL write happens, the unique constraint still prevents
--   duplicate rows from accumulating.
--
-- Idempotency: CREATE UNIQUE INDEX IF NOT EXISTS is used so the
-- migration is safe to re-run (e.g. after a partial apply failure).
-- CONCURRENTLY isn't used because this is a small table and
-- migrations run in transactions; concurrent index creation would
-- need to be run outside a transaction block.

CREATE UNIQUE INDEX IF NOT EXISTS idx_recommended_actions_unique
  ON refresh_analyses (refresh_run_id, analysis_type)
  WHERE analysis_type LIKE 'recommended_actions_%';
