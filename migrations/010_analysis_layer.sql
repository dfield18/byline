-- 010_analysis_layer.sql
-- Analysis layer schema. Reads from model_responses (immutable raw layer);
-- never writes to it. All rows tagged with methodology_version so historical
-- analyses survive extractor changes.
--
-- Tables:
--   1. analysis_runs        — one row per execution of the analyzer
--   2. response_extractions — one row per analyzed model_response
--   3. refresh_analyses     — one row per cross-response finding (asymmetry,
--                              narrative drift, share of voice, etc.)
--   4. source_types         — canonical vocabulary for the `type` field on
--                              source objects in response_extractions.sources.
--                              Enforced at the extractor layer, not by the DB
--                              (Postgres can't FK-check JSONB content).

BEGIN;

CREATE TABLE source_types (
    id          SERIAL PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO source_types (slug, name, description) VALUES
    ('news',         'News',          'Mainstream news outlets (NYT, WaPo, Fox News, Politico, AP)'),
    ('reference',    'Reference',     'Encyclopedic and reference sources (Wikipedia, Britannica, Ballotpedia)'),
    ('campaign',     'Campaign',      'Official candidate or campaign websites'),
    ('government',   'Government',    '.gov sites, congress.gov, agency reports, CRS, CBO'),
    ('think_tank',   'Think Tank',    'Policy research organizations (Brookings, Heritage, CAP, AEI)'),
    ('academic',     'Academic',      'University presses, academic journals, scholarly research'),
    ('advocacy',     'Advocacy',      'NGOs and advocacy organizations (ACLU, Sierra Club, NRA, Heritage Action)'),
    ('social_media', 'Social Media',  'Social media posts and platforms; podcasts'),
    ('personal',     'Personal',      'Individual blogs, Substacks, personal op-eds'),
    ('unknown',      'Unknown',       'Extractor could not classify the source');

CREATE TABLE analysis_runs (
    id                     SERIAL PRIMARY KEY,
    refresh_run_id         INT NOT NULL REFERENCES refresh_runs(id),
    subject_id             INT NOT NULL REFERENCES subjects(id),
    started_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at           TIMESTAMPTZ,
    status                 TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'failed', 'partial')),
    methodology_version    TEXT NOT NULL,
    extractor_versions     JSONB,
    total_responses        INT,
    successful_extractions INT,
    total_cost_usd         NUMERIC(10, 4),
    error_message          TEXT,
    notes                  TEXT
);

CREATE INDEX idx_analysis_runs_subject ON analysis_runs (subject_id, started_at DESC);
CREATE INDEX idx_analysis_runs_refresh ON analysis_runs (refresh_run_id);

CREATE TABLE response_extractions (
    id                  SERIAL PRIMARY KEY,
    analysis_run_id     INT NOT NULL REFERENCES analysis_runs(id),
    model_response_id   INT NOT NULL REFERENCES model_responses(id),
    subject_id          INT NOT NULL REFERENCES subjects(id),
    model_id            INT NOT NULL REFERENCES models(id),
    prompt_id           INT NOT NULL REFERENCES prompts(id),
    layer               TEXT NOT NULL CHECK (layer IN ('named', 'unnamed')),

    descriptors         JSONB,
    sources             JSONB,
    total_sources_cited INT,
    cited_own_site      BOOLEAN,
    entities            JSONB,
    terminology         JSONB,
    scores              JSONB,
    narrative_themes    JSONB,
    dominant_theme      TEXT,

    subject_mentioned         BOOLEAN,
    mention_rank              INT,
    mention_strength          TEXT CHECK (mention_strength IN ('primary', 'listed', 'aside')),
    mention_excerpt           TEXT,
    disambiguation_confidence NUMERIC(3, 2),
    competitors_mentioned     JSONB,

    extraction_errors     JSONB,
    extraction_cost_usd   NUMERIC(10, 6),
    extraction_latency_ms INT,

    methodology_version TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (analysis_run_id, model_response_id)
);

CREATE INDEX idx_extractions_subject_time ON response_extractions (subject_id, created_at DESC);
CREATE INDEX idx_extractions_response ON response_extractions (model_response_id);
CREATE INDEX idx_extractions_run ON response_extractions (analysis_run_id);
CREATE INDEX idx_extractions_subject_model_time ON response_extractions (subject_id, model_id, created_at DESC);
CREATE INDEX idx_extractions_prompt_time ON response_extractions (prompt_id, created_at DESC);

CREATE TABLE refresh_analyses (
    id                  SERIAL PRIMARY KEY,
    analysis_run_id     INT NOT NULL REFERENCES analysis_runs(id),
    refresh_run_id      INT NOT NULL REFERENCES refresh_runs(id),
    subject_id          INT NOT NULL REFERENCES subjects(id),
    model_id            INT REFERENCES models(id),

    analysis_type       TEXT NOT NULL,
    analysis_key        TEXT,
    findings            JSONB NOT NULL,
    source_response_ids JSONB,
    summary             TEXT,
    confidence          NUMERIC(3, 2),

    extraction_errors     JSONB,
    extraction_cost_usd   NUMERIC(10, 6),
    extraction_latency_ms INT,

    methodology_version TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (analysis_run_id, model_id, analysis_type, analysis_key)
);

CREATE INDEX idx_refresh_analyses_subject ON refresh_analyses (subject_id, analysis_type, created_at DESC);
CREATE INDEX idx_refresh_analyses_run ON refresh_analyses (refresh_run_id);

COMMIT;
