-- sql/show_responses_for_run.sql
-- Pretty-print all responses from a refresh run for human reading
SELECT
    p.layer || '/' || p.position || ' (' || p.dimension || ')' AS prompt_label,
    r.model_identifier,
    r.response_text
FROM model_responses r
JOIN prompts p ON r.prompt_id = p.id
WHERE r.refresh_run_id = :run_id
ORDER BY p.layer, p.position, r.model_identifier;
