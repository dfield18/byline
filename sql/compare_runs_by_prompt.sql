-- sql/compare_runs_by_prompt.sql
-- Compare two refresh runs for the same subject, prompt by prompt
SELECT
    p.layer || '/' || p.position AS prompt,
    p.dimension,
    r.model_identifier,
    rr.id AS run_id,
    LENGTH(r.response_text) AS chars,
    r.cost_usd,
    r.latency_ms
FROM model_responses r
JOIN refresh_runs rr ON r.refresh_run_id = rr.id
JOIN prompts p ON r.prompt_id = p.id
WHERE rr.subject_id = (SELECT id FROM subjects WHERE name = :subject)
  AND rr.id IN (:run_a, :run_b)
ORDER BY p.layer, p.position, r.model_identifier, rr.id;
