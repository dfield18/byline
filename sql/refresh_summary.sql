SELECT
    p.layer,
    p.position,
    p.dimension,
    m.display_name AS model,
    LENGTH(r.response_text) AS chars,
    r.success,
    r.latency_ms,
    r.cost_usd
FROM model_responses r
JOIN prompts p ON r.prompt_id = p.id
JOIN models m ON r.model_id = m.id
WHERE r.refresh_run_id = :run_id
ORDER BY p.layer, p.position, m.display_name;
