-- 007_refresh_runs_historical.sql
--
-- Historical-estimate refresh support. A "historical" refresh re-runs the
-- 6 fixed prompts (generated prompts skipped — they depend on recent_news)
-- with web search grounded, but with a prompt-side instruction to filter
-- queries to `before:{as_of_date}` so results reflect pre-date sources.
--
-- This measures "what would AI search have returned on {as_of_date}?" and
-- is intentionally distinct from live refreshes:
--   - is_historical_estimate=TRUE marks the row.
--   - historical_as_of carries the target date.
--   - Trajectory views in the customer UI render these alongside live
--     refreshes but with an "estimated retrospective" label and visual
--     differentiator.
--   - NarrativeDriftAnalyzer's prior-refresh lookup MUST filter these
--     out — comparing a live refresh to a parametric retrospective
--     measures methodology change, not narrative change.
--
-- The actual retrospective prompt prefix is stamped on each
-- model_responses.response_metadata.historical_prompt_prefix_version so
-- we can iterate the prefix wording later without losing audit trail.

BEGIN;

ALTER TABLE refresh_runs
    ADD COLUMN is_historical_estimate BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN historical_as_of DATE;

ALTER TABLE refresh_runs
    ADD CONSTRAINT historical_runs_have_date
    CHECK (
        (NOT is_historical_estimate AND historical_as_of IS NULL)
        OR (is_historical_estimate AND historical_as_of IS NOT NULL)
    );

CREATE INDEX idx_refresh_runs_historical
    ON refresh_runs (subject_id, historical_as_of DESC)
    WHERE is_historical_estimate = TRUE;

COMMENT ON COLUMN refresh_runs.is_historical_estimate IS
    'TRUE for retrospective parametric+date-filtered refreshes; FALSE for '
    'normal live refreshes. Trajectory views render both but the customer '
    'UI labels historical rows clearly as estimates.';

COMMENT ON COLUMN refresh_runs.historical_as_of IS
    'For historical estimates: the target date the AI search was simulated '
    'as-of. NULL on live refreshes.';

COMMIT;
