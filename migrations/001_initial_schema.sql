-- 001_initial_schema.sql
-- Foundation phase schema for the prompt-running infrastructure.
-- Mirrors docs/database-schema.md.

BEGIN;

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    framing_question TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE models (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    display_name TEXT NOT NULL,
    model_identifier TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT
);

CREATE TABLE prompts (
    id SERIAL PRIMARY KEY,
    category_id INT NOT NULL REFERENCES categories(id),
    layer TEXT NOT NULL CHECK (layer IN ('named', 'unnamed')),
    position INT NOT NULL,
    dimension TEXT NOT NULL,
    template TEXT NOT NULL,
    version TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deprecated_at TIMESTAMPTZ,
    retirement_reason TEXT,
    notes TEXT
);

CREATE UNIQUE INDEX idx_active_prompts
    ON prompts (category_id, layer, position)
    WHERE active = TRUE;

CREATE TABLE subjects (
    id SERIAL PRIMARY KEY,
    category_id INT NOT NULL REFERENCES categories(id),
    name TEXT NOT NULL,
    setup_inputs JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT
);

CREATE INDEX idx_subjects_category ON subjects (category_id);

CREATE TABLE refresh_runs (
    id SERIAL PRIMARY KEY,
    subject_id INT NOT NULL REFERENCES subjects(id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'failed', 'partial')),
    total_queries INT,
    successful_queries INT,
    total_cost_usd NUMERIC(10, 4),
    error_message TEXT,
    notes TEXT
);

CREATE INDEX idx_refresh_runs_subject ON refresh_runs (subject_id, started_at DESC);

CREATE TABLE model_responses (
    id SERIAL PRIMARY KEY,
    refresh_run_id INT NOT NULL REFERENCES refresh_runs(id),
    subject_id INT NOT NULL REFERENCES subjects(id),
    prompt_id INT NOT NULL REFERENCES prompts(id),
    model_id INT NOT NULL REFERENCES models(id),

    rendered_prompt TEXT NOT NULL,
    request_params JSONB,

    response_text TEXT,
    response_metadata JSONB,

    success BOOLEAN NOT NULL,
    error_message TEXT,
    latency_ms INT,
    cost_usd NUMERIC(10, 6),

    prompt_version TEXT NOT NULL,
    model_identifier TEXT NOT NULL,

    queried_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_responses_subject ON model_responses (subject_id, queried_at DESC);
CREATE INDEX idx_responses_run ON model_responses (refresh_run_id);
CREATE INDEX idx_responses_prompt ON model_responses (prompt_id, queried_at DESC);

COMMIT;
