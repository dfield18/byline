# Database Schema

> Postgres schema for byline. The **foundation layer** (categories, models, prompts, subjects, refresh_runs, model_responses) runs prompts end-to-end and stores raw responses. The **analysis layer** (source_types, analysis_runs, response_extractions, refresh_analyses) holds structured findings extracted from raw responses. Auth, dashboards, and the recommendation engine come later and add their own tables.

---

## Design principles

1. **Raw responses are sacred.** Stored in full, never overwritten, never derived-then-discarded.
2. **Everything is versioned.** Prompts, methodology, configurations — all trackable over time.
3. **Categories and prompts are data, not code.** The query engine reads from these tables; it doesn't have hardcoded knowledge of categories.
4. **Models are configurable.** Adding Claude, Perplexity, or others later is a row insert, not a refactor.
5. **Analysis is downstream of raw, never the other way around.** The analysis layer reads from `model_responses` but never modifies it. Re-running an analyzer with a smarter methodology produces a new `analysis_run` and a new set of rows; old rows stay valid for historical comparison.
6. **Future tables are anticipated but not built.** The schema below leaves room for auth, billing, alerts, and the recommendation engine to extend without breaking changes.

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

## Analysis layer

Migration `010_analysis_layer.sql` introduces four tables that hold structured findings extracted from `model_responses`. The analysis layer **reads from `model_responses` and never writes to it** — the raw layer stays immutable. Every output row is tagged with a `methodology_version` (currently `analysis-1.0.0`) so re-running a smarter extractor produces a new set of rows under a new version, while old rows stay valid for historical comparison.

### Design choices specific to the analysis layer

1. **Two grains, two output tables.** Per-response findings (descriptors, sources, entities, scores, etc.) live in `response_extractions` — one row per analyzed `model_response`. Cross-response findings (asymmetry between paired prompts, narrative drift, share of voice) live in `refresh_analyses` — one row per cross-response finding. Different row counts per refresh, different table.

2. **JSONB blobs over normalized children.** Each per-response extraction (descriptors, sources, entities, terminology, scores, narrative themes) is stored as a JSONB list on a single `response_extractions` row, not as rows in a children table. This keeps the per-response shape collapsed to one row and simpler to write. The trade-off is that "top descriptor across many responses" queries require `jsonb_array_elements` instead of a plain `GROUP BY` — acceptable for the query patterns we expect.

3. **Hot foreign keys denormalized.** `response_extractions` carries `subject_id`, `model_id`, `prompt_id`, and `layer` directly (rather than just `model_response_id`) because filtering by those is the hot analytical path. Same logic for `refresh_analyses`.

4. **Methodology version on every row.** Lets you flag dashboard timeline regions where comparisons are valid vs. require an asterisk (per the spec's commitment to public methodology versioning).

5. **Re-analysis is a first-class flow.** Each extraction row points to an `analysis_run_id`. Re-running the analyzer over the same `refresh_run` creates a new `analysis_run` and a new set of extraction rows; old rows stay intact. Queries default to "latest analysis_run per refresh."

6. **Controlled vocabularies live in lookup tables.** `source_types` is a small lookup table whose `slug` values populate the `type` field inside source objects. Postgres can't FK-enforce values inside JSONB, so validation happens at the extractor layer; the table's role is to be the canonical reference.

---

### `source_types`

Canonical vocabulary for classifying cited sources (news, reference, campaign, government, etc.). Seeded with 10 rows.

```sql
CREATE TABLE source_types (
    id          SERIAL PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Seeded slugs: `news`, `reference`, `campaign`, `government`, `think_tank`, `academic`, `advocacy`, `social_media`, `personal`, `unknown`.

The extractor looks up the slug when it categorizes a source. If it can't classify confidently, it falls back to `unknown` — no row in the JSONB should ever carry a slug that isn't in this table. Adding a new category later (e.g., `polling_firm`) is a one-line `INSERT`.

---

### `analysis_runs`

A "analysis run" is one complete execution of the analyzers over a `refresh_run`. Parallel concept to `refresh_runs` — same kind of bookkeeping table, one level downstream.

```sql
CREATE TABLE analysis_runs (
    id                     SERIAL PRIMARY KEY,
    refresh_run_id         INT NOT NULL REFERENCES refresh_runs(id),
    subject_id             INT NOT NULL REFERENCES subjects(id),
    started_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at           TIMESTAMPTZ,
    status                 TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'failed', 'partial')),
    methodology_version    TEXT NOT NULL,
    extractor_versions     JSONB,                -- per-extractor pinning, e.g. {descriptors: '1.0', sources: '1.0'}
    total_responses        INT,
    successful_extractions INT,
    total_cost_usd         NUMERIC(10, 4),
    error_message          TEXT,
    notes                  TEXT
);

CREATE INDEX idx_analysis_runs_subject ON analysis_runs (subject_id, started_at DESC);
CREATE INDEX idx_analysis_runs_refresh ON analysis_runs (refresh_run_id);
```

`extractor_versions` lets individual extractors carry their own version pin independent of the umbrella `methodology_version` — useful when only one extractor changes.

---

### `response_extractions`

The largest table in the analysis layer. **One row per analyzed `model_response`** — everything pulled out of a single response lives in this row.

```sql
CREATE TABLE response_extractions (
    id                  SERIAL PRIMARY KEY,
    analysis_run_id     INT NOT NULL REFERENCES analysis_runs(id),
    model_response_id   INT NOT NULL REFERENCES model_responses(id),
    subject_id          INT NOT NULL REFERENCES subjects(id),
    model_id            INT NOT NULL REFERENCES models(id),
    prompt_id           INT NOT NULL REFERENCES prompts(id),
    layer               TEXT NOT NULL CHECK (layer IN ('named', 'unnamed')),

    -- Per-response extractions (JSONB lists; see shape examples below)
    descriptors         JSONB,
    sources             JSONB,
    total_sources_cited INT,
    cited_own_site      BOOLEAN,
    entities            JSONB,
    terminology         JSONB,
    scores              JSONB,
    narrative_themes    JSONB,
    dominant_theme      TEXT,                    -- denormalized from narrative_themes for fast GROUP BY

    -- Mention detection (populated for unnamed-layer responses; NULL for named-layer)
    subject_mentioned         BOOLEAN,
    mention_rank              INT,
    mention_strength          TEXT CHECK (mention_strength IN ('primary', 'listed', 'aside')),
    mention_excerpt           TEXT,
    disambiguation_confidence NUMERIC(3, 2),
    competitors_mentioned     JSONB,

    -- Operational
    extraction_errors     JSONB,                 -- per-extractor failure tracking
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
```

#### JSONB shapes

`descriptors` — adjectives and characterizing labels attached to the subject:
```json
[{"word": "progressive", "valence": 0.2, "confidence": 0.9, "excerpt": "..."}]
```

`sources` — cited or paraphrased sources. The `type` field must be a slug from `source_types`:
```json
[{"name": "The New York Times", "url": "...", "type": "news", "excerpt": "..."}]
```

`entities` — named people / orgs / policies that appeared, with role and sentiment:
```json
[{"name": "Elizabeth Warren", "type": "person", "role": "ally",
  "sentiment": "positive", "excerpt": "..."}]
```
Role values: `ally | opponent | supporter | critic | comparator | mentioned`.
Sentiment values: `positive | neutral | negative | mixed`.

`terminology` — what name/label the AI used for the subject (e.g., "Inflation Reduction Act" vs. "Biden's spending bill"):
```json
[{"term": "the climate and healthcare law", "term_normalized": "ira",
  "occurrence_count": 3, "is_primary_term": true}]
```

`scores` — response-level dimensional ratings. One entry per `score.type`:
```json
[{"type": "sentiment",         "value": -0.2, "label": "mildly negative", "rationale": "..."},
 {"type": "directional_lean",  "value":  0.3, "label": "left-leaning",    "rationale": "..."},
 {"type": "criticism_severity","value":  0.7, "label": "harsh",           "rationale": "..."},
 {"type": "certainty",         "value":  0.7, "label": "hedging",         "rationale": "uses 'reportedly' three times"}]
```

`narrative_themes` — frames the response embodies (the dominant one is also denormalized into the `dominant_theme` column):
```json
[{"theme": "anti-establishment crusader", "confidence": 0.8, "excerpt": "..."},
 {"theme": "economic populist",           "confidence": 0.7, "excerpt": "..."}]
```

`competitors_mentioned` — for unnamed-layer responses, other names that surfaced when probing the subject's neighborhood:
```json
[{"name": "Elizabeth Warren", "sentiment": "positive", "excerpt": "..."}]
```

`extraction_errors` — `null` if all extractors succeeded; otherwise a per-extractor map:
```json
{"sources": "API timeout", "entities": null, "descriptors": null}
```

#### Notes on this table

- **`UNIQUE (analysis_run_id, model_response_id)`** guarantees one extraction row per response per run. Re-running the analyzer creates a *new* `analysis_run`, which produces a *new* set of extraction rows; old rows stay intact.

- **`dominant_theme` is denormalized from `narrative_themes`** for clean `GROUP BY` queries on dashboard ("how has the dominant theme shifted for Bernie over time?"). Same denormalization pattern as `subject_id` and `model_id`.

- **`total_sources_cited` is denormalized** so source-density queries don't need to unpack the JSONB. The extractor populates it as `jsonb_array_length(sources)` at write time.

- **`cited_own_site` is the subject's own-site flag.** `TRUE` if any source matched the subject's known own sites (e.g., berniesanders.com, sanders.senate.gov for Bernie). `NULL` if no sources were cited. The list of own-sites is expected to live in `subjects.setup_inputs.own_sites` once the extractor is built.

- **The mention-detection block (`subject_mentioned` through `competitors_mentioned`) is only meaningful for unnamed-layer responses.** For named-layer responses, the subject is the explicit topic of the prompt and ranking doesn't apply — those columns will be NULL.

- **`extraction_errors` exists to distinguish "no findings because there were none" from "extractor crashed."** Without it, an empty `sources` list looks identical to a failed extraction.

---

### `refresh_analyses`

Cross-response findings — things that only make sense when you compare multiple responses (or all responses in a refresh). One row per (analysis_run, optional model, analysis_type, optional analysis_key).

```sql
CREATE TABLE refresh_analyses (
    id                  SERIAL PRIMARY KEY,
    analysis_run_id     INT NOT NULL REFERENCES analysis_runs(id),
    refresh_run_id      INT NOT NULL REFERENCES refresh_runs(id),
    subject_id          INT NOT NULL REFERENCES subjects(id),
    model_id            INT REFERENCES models(id),    -- NULL = cross-model aggregate

    analysis_type       TEXT NOT NULL,
    analysis_key        TEXT,                          -- disambiguator (e.g., position name for issue category)
    findings            JSONB NOT NULL,
    source_response_ids JSONB,                         -- e.g. [312, 318] — which model_responses fed this finding
    summary             TEXT,                          -- one-line plain-English headline
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
```

#### `analysis_type` vocabulary (open-ended)

No CHECK constraint on `analysis_type` — the vocabulary is expected to grow as new cross-response findings are identified. Once it stabilizes, this could be promoted to an `analysis_types` lookup table on the `source_types` pattern.

| `analysis_type` | When it fires | Example `findings` shape |
|---|---|---|
| `asymmetry_for_vs_against` | Policy (#2 vs. #3), Issue (position pairs) | `{"for_lean": 0.6, "against_lean": -0.4, "delta": 1.0, "dominant_side": "for"}` |
| `narrative_drift` | Event (#1 descriptive vs. #6 interpretive) | `{"descriptive_frame": "...", "interpretive_frame": "...", "drift_score": 0.7}` |
| `currency_check` | Person (#8) | `{"has_recent_events": true, "latest_event_referenced": "2026-04-15", "staleness_score": 0.2}` |
| `position_appearance` | Issue (#2 vs. user-defined positions) | `{"position": "strict regulation", "appeared": true, "framing_match": 0.8}` |
| `share_of_voice` | Aggregate of all unnamed-layer responses | `{"mention_rate": 0.6, "mentioned_in": 3, "total": 5, "avg_rank": 2.5}` |
| `top_quotes` | Every refresh | `{"quotes": [{"quote": "...", "source_response_id": 312, "rank": 1, "dimension": "criticism"}]}` |

#### Notes

- **`model_id` is nullable.** NULL means "cross-model aggregate" (a single finding combining ChatGPT and Gemini results). The unique constraint includes `model_id`, so you can store both per-model findings and a cross-model aggregate for the same `analysis_type`.

- **`source_response_ids` makes findings traceable.** Each row lists which `model_responses.id` values were used to compute the finding — without it, you'd need to know which prompts feed each `analysis_type`.

- **`analysis_key` is a free-form disambiguator** for cases where one `analysis_type` produces multiple rows per refresh (e.g., for the Issue category, `position_appearance` would have one row per user-defined position, with `analysis_key` set to the position name).

---

## Future tables (still anticipated, not yet built)

The analysis-layer foundation above is in place. These remain TBD:

- `recommendations` — generated recommendations per subject per refresh, with rule provenance and methodology versioning. Deferred until the analysis layer produces enough real data to design the recommendation engine against.
- `scoring_configs` — tunable parameters (descriptor whitelists, score thresholds) stored as data instead of code. Add when a parameter actually needs runtime tuning.
- `users`, `organizations`, `subscriptions` — for when auth and billing exist.
- `alerts` — alert configurations and history.
- `analysis_types` — promote `refresh_analyses.analysis_type` to a lookup table once the vocabulary stabilizes.

---

## Initial seed data

When the database is first created, run a seed script to populate:

1. **`categories`** — one row per category (person, organization, policy, issue, event)
2. **`models`** — two rows: ChatGPT and Gemini, both `active = TRUE`. Use the latest stable model identifier for each. Plan to add Claude and Perplexity later.
3. **`prompts`** — for v1-of-v1, just the Person category prompts (8 named + 5 unnamed). Other categories get added as you build.
4. **`source_types`** — seeded automatically by migration `010_analysis_layer.sql` with 10 canonical source categories (`news`, `reference`, `campaign`, `government`, `think_tank`, `academic`, `advocacy`, `social_media`, `personal`, `unknown`). Add new types as a row insert.

The seed script should read prompts from a YAML config file (see `prompts-config-format.md`) and idempotently insert them. Re-running the seed on an already-populated database should not create duplicates (use ON CONFLICT or check before insert).

---

## Configuration that lives outside this schema

Some things are NOT in the database — they live in environment variables or config files:

- API keys for OpenAI, Google (and later Anthropic, Perplexity)
- Postgres connection string
- Default request parameters per provider (temperature, max_tokens) — though these could move into the database later if you want runtime control

Use a `.env` file for local dev and Railway environment variables for deployment.
