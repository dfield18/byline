-- 003_add_prompt_type.sql
-- Adds a type column to prompts to distinguish:
--   'fixed'     — the template field is a literal string with {placeholders}
--                 substituted from the subject's setup_inputs (existing behavior).
--   'generated' — the template field is a meta-LLM generation instruction.
--                 At refresh time, the engine renders the instruction with
--                 setup_inputs, sends it to a small LLM, and uses the LLM's
--                 output as the actual question sent to measurement providers.
-- Methodology consistency is relaxed for 'generated' prompts — the rendered
-- question varies per refresh. Cross-run comparison requires inspecting the
-- per-row generated question captured in model_responses.rendered_prompt and
-- response_metadata.

BEGIN;

ALTER TABLE prompts
    ADD COLUMN type TEXT NOT NULL DEFAULT 'fixed'
        CHECK (type IN ('fixed', 'generated'));

COMMIT;
