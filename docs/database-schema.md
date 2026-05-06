# Database Schema — Foundation Phase

> Postgres schema for the prompt-running infrastructure. This is the v1-of-v1 schema — only what's needed to run prompts end-to-end and store raw responses. Auth, dashboards, analysis layer, recommendation engine all come later and add their own tables.

---

## Design principles

1. **Raw responses are sacred.** Stored in full, never overwritten, never derived-then-discarded.
2. **Everything is versioned.** Prompts, methodology, configurations — all trackable over time.
3. **Categories and prompts are data, not code.** The query engine reads from these tables; it doesn't have hardcoded knowledge of categories.
4. **Models are configurable.** Adding Claude, Perplexity, or others later is a row insert, not a refactor.
5. **Future tables are anticipated but not built.** The schema below leaves room for the analysis layer, recommendation engine, and dashboard to extend without breaking changes.

---

## Tables

### `categories`

The five subject categories. Stored as data so adding a sixth later is a row insert.

```sql
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,           -- 'person', 'organization', etc.
    name TEXT NOT NULL,                  -- Human-readable name
    framing_question TEXT NOT NULL,      -- The category's defining question
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    active BOOLEAN NOT NULL DEFAULT TRUE
);
```

Seeded with: person, organization, policy, issue, event.

---

### `models`

The AI models that get queried. Configuration table — adding Claude or Perplexity later is a row insert.

```sql
CREATE TABLE models (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,           -- 'gpt-4o', 'gemini-1.5-pro', etc.
    provider TEXT NOT NULL,              -- 'openai', 'google', 'anthropic'
    display_name TEXT NOT NULL,          -- 'ChatGPT (GPT-4o)'
    model_identifier TEXT NOT NULL,      -- The actual API model string
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT                           -- Free-text for human reference
);
```

Initially seeded with two rows: one for ChatGPT (OpenAI), one for Gemini (Google). Set `active = TRUE` on both. When you add Claude later, insert a new row with `active = TRUE`. The query engine reads all `active = TRUE` rows and queries each.

---

### `prompts`

The core prompt templates, versioned. The query engine looks up active prompts here.

```sql
CREATE TABLE prompts (
    id SERIAL PRIMARY KEY,
    category_id INT NOT NULL REFERENCES categories(id),
    layer TEXT NOT NULL CHECK (layer IN ('named', 'unnamed')),
    position INT NOT NULL,               -- 1-8 for named, 1-5 for unnamed
    dimension TEXT NOT NULL,             -- 'descriptive baseline', 'criticism', etc.
    template TEXT NOT NULL,              -- Prompt text with {variable} placeholders
    version TEXT NOT NULL,               -- Semver, e.g., '1.0.0'
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deprecated_at TIMESTAMPTZ,           -- NULL if active
    retirement_reason TEXT,              -- Why this version was retired
    notes TEXT                           -- Free-text for human reference
);

-- Only one active prompt per (category, layer, position) at a time
CREATE UNIQUE INDEX idx_active_prompts
    ON prompts (category_id, layer, position)
    WHERE active = TRUE;
```

The unique partial index enforces that exactly one prompt is active per slot. To update a prompt: insert a new row with the new template and `active = TRUE`, then update the old row to `active = FALSE` and set `deprecated_at` and `retirement_reason`. Wrap both in a transaction.

---

### `subjects`

The things being tracked. A subject belongs to one category and has category-specific setup inputs stored as JSON.

```sql
CREATE TABLE subjects (
    id SERIAL PRIMARY KEY,
    category_id INT NOT NULL REFERENCES categories(id),
    name TEXT NOT NULL,                  -- The subject's primary name
    setup_inputs JSONB NOT NULL,         -- Category-specific variables
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT                           -- Free-text for human reference
);

CREATE INDEX idx_subjects_category ON subjects (category_id);
```

`setup_inputs` is JSONB rather than a normalized table because category-specific inputs vary too much in shape (the Person category has `role`, `audience`, etc.; the Issue category has an array of `positions`). JSONB gives flexibility now without committing to a schema, and you can normalize later if needed.

Example for a Person subject:

```json
{
    "name": "Bernie Sanders",
    "role": "US Senator from Vermont",
    "domain": "progressive economic policy",
    "audience": "the political left",
    "contextual_domain": "progressive politicians in the US Senate",
    "adjacent_position": "corporate influence in American politics"
}
```

Example for an Issue subject:

```json
{
    "name": "AI regulation in the United States",
    "positions": [
        "strict government regulation of AI development",
        "a light-touch, innovation-first approach to AI"
    ],
    "domain": "technology policy and AI governance",
    "contextual_domain": "major debates in US technology policy",
    "geography_or_scope": "the United States"
}
```

---

### `refresh_runs`

A "refresh run" is one complete execution of all prompts × all models for one subject. Tracking these as their own entity gives you a useful unit for queries like "show me the latest data for this subject" and a place to track run-level metadata (cost, errors, duration).

```sql
CREATE TABLE refresh_runs (
    id SERIAL PRIMARY KEY,
    subject_id INT NOT NULL REFERENCES subjects(id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,            -- NULL if in progress or failed
    status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'failed', 'partial')),
    total_queries INT,                   -- How many prompt-model pairs were attempted
    successful_queries INT,              -- How many succeeded
    total_cost_usd NUMERIC(10, 4),       -- Aggregate cost of this run
    error_message TEXT,                  -- Populated if status = 'failed'
    notes TEXT
);

CREATE INDEX idx_refresh_runs_subject ON refresh_runs (subject_id, started_at DESC);
```

`status = 'partial'` means some queries succeeded and some failed. This is a real outcome (one model API was down) and worth distinguishing from total failure.

---

### `model_responses`

The most important table — every raw model response, in full, never overwritten.

```sql
CREATE TABLE model_responses (
    id SERIAL PRIMARY KEY,
    refresh_run_id INT NOT NULL REFERENCES refresh_runs(id),
    subject_id INT NOT NULL REFERENCES subjects(id),
    prompt_id INT NOT NULL REFERENCES prompts(id),
    model_id INT NOT NULL REFERENCES models(id),

    -- The exact request that was sent
    rendered_prompt TEXT NOT NULL,       -- Template with variables substituted
    request_params JSONB,                -- Temperature, max_tokens, etc.

    -- The response
    response_text TEXT,                  -- The model's response, full text
    response_metadata JSONB,             -- Raw metadata from the API (token counts, finish reasons, etc.)

    -- Outcomes
    success BOOLEAN NOT NULL,
    error_message TEXT,                  -- Populated if success = FALSE
    latency_ms INT,                      -- Round-trip time
    cost_usd NUMERIC(10, 6),             -- Cost of this single query

    -- Provenance — captured at query time so historical data survives later changes
    prompt_version TEXT NOT NULL,        -- The version of the prompt at query time
    model_identifier TEXT NOT NULL,      -- The exact model string used (e.g., 'gpt-4o-2024-08-06')

    queried_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_responses_subject ON model_responses (subject_id, queried_at DESC);
CREATE INDEX idx_responses_run ON model_responses (refresh_run_id);
CREATE INDEX idx_responses_prompt ON model_responses (prompt_id, queried_at DESC);
```

A few notes on this table:

- **`rendered_prompt` is stored** even though it can be derived from `prompt_id` + `subject.setup_inputs`. The reason: prompts and setup inputs can both change over time. Storing the rendered prompt at query time means you can always know exactly what was asked, regardless of later edits. Storage is cheap; debuggability is priceless.

- **`response_metadata` as JSONB** captures whatever the provider returns. Different providers return different fields (OpenAI gives finish_reason and usage; Gemini gives safety_ratings; Perplexity will give citations). Storing as JSONB means you don't need to design a schema that fits all of them.

- **`prompt_version` and `model_identifier` are stored** even though they're FKs to other tables. Same reason as `rendered_prompt`: provenance survives later changes. If you update a prompt or a model identifier, this table still tells you exactly what was used at query time.

- **`success` is separate from `error_message`** because success is the primary filter for analytical queries ("show me successful responses for this subject") while error_message is for debugging.

---

## Future tables (anticipated, not built yet)

These don't get created in v1-of-v1 but are worth knowing about so the current schema doesn't paint into a corner:

- `analysis_outputs` — structured findings extracted from `model_responses`. Will reference `model_responses` and a `methodology_version`. The analysis layer's main output table.
- `extracted_sources` — sources cited or paraphrased in responses, with attribution and frequency tracking.
- `extracted_descriptors` — adjectives and characterizing language attached to subjects, tracked over time.
- `recommendations` — generated recommendations per subject per refresh, with rule provenance.
- `users`, `organizations`, `subscriptions` — for when auth and billing exist.
- `alerts` — alert configurations and history.

The schema above doesn't preclude any of these. The key design choice — making `model_responses` the immutable raw layer — means everything downstream can be built and rebuilt without touching the foundation.

---

## Initial seed data

When the database is first created, run a seed script to populate:

1. **`categories`** — one row per category (person, organization, policy, issue, event)
2. **`models`** — two rows: ChatGPT and Gemini, both `active = TRUE`. Use the latest stable model identifier for each. Plan to add Claude and Perplexity later.
3. **`prompts`** — for v1-of-v1, just the Person category prompts (8 named + 5 unnamed). Other categories get added as you build.

The seed script should read prompts from a YAML config file (see `prompts-config-format.md`) and idempotently insert them. Re-running the seed on an already-populated database should not create duplicates (use ON CONFLICT or check before insert).

---

## Configuration that lives outside this schema

Some things are NOT in the database — they live in environment variables or config files:

- API keys for OpenAI, Google (and later Anthropic, Perplexity)
- Postgres connection string
- Default request parameters per provider (temperature, max_tokens) — though these could move into the database later if you want runtime control

Use a `.env` file for local dev and Railway environment variables for deployment.
