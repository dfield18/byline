# byline — project state

> A pulse-check of where the project sits **as of 2026-05-09**, on commit
> `8206b7f`. Read this first if you're a fresh Claude Code session picking
> up work. Update when state shifts meaningfully.

---

## What this product is

byline is an **AI search visibility tool for political and public-affairs
work**. It runs a deliberate set of prompts about a tracked subject (a
person, organization, policy, issue, or event) against multiple AI models,
captures every raw response with full provenance, and produces structured
data downstream for narrative-audit and visibility-tracking workflows.

The full vision lives in **`docs/product-spec.md`** — read it before making
any methodology decisions. Schema rationale is in
**`docs/database-schema.md`**. YAML conventions for prompt definitions are
in **`docs/prompts-config-format.md`**.

---

## Current phase

The **v1.2 methodology pass is complete and committed**. The foundation
layer — prompts → providers → engine → DB — is stable and validated across
5 subjects and 12 refresh runs. There are 312 raw `model_responses` rows
in the local Postgres DB.

Next major phase: **the analysis layer**. Extract structured findings from
raw responses (descriptors, sources cited, sentiment/lean, named entities,
framing devices, etc.) and store them in new tables for downstream
visualization. This is what the parallel Claude Code session is starting
on.

---

## Architecture

### Code layout

```
app/
├── db.py                    # Sync psycopg connection helpers (DATABASE_URL)
├── seed.py                  # CLI: seed categories+models or load a YAML
├── prompt_loader.py         # YAML validate + upsert; handles version bumps
│                              and `active: false` deactivations
├── prompt_generator.py      # Meta-LLM for type=generated prompts
├── query_engine.py          # async run_refresh — concurrent fan-out via
│                              psycopg AsyncConnectionPool + Semaphore
├── refresh.py               # CLI: python -m app.refresh "Name"
└── providers/
    ├── base.py              # Provider abstract + ProviderResponse dataclass
    ├── openai_provider.py   # AsyncOpenAI; Responses API (web_search tool)
    ├── gemini_provider.py   # google-genai; .aio.* + GoogleSearch tool
    ├── _retry.py            # Exponential-backoff retry helper
    └── __init__.py          # PROVIDERS registry: 'openai' | 'google'

prompts/                     # All five category YAMLs (person at v1.2)
migrations/                  # 003 migrations applied (initial, grounding, type)
sql/                         # Hand-written analysis queries
scripts/                     # One-off diagnostics (test_providers, test_freshness)
findings/                    # gitignored — local-only response dumps
docs/                        # Spec docs (read-only inputs)
```

### Conceptual layers

1. **Prompts are data, not code.** Authored in `prompts/*.yaml`,
   seeded into the `prompts` DB table, queried at refresh time. Templates
   use `{placeholder}` substitution from a subject's `setup_inputs` JSONB.

2. **Two prompt types** (column `prompts.type`):
   - **`fixed`** — template is a literal string with placeholders.
   - **`generated`** — template is a meta-LLM generation instruction; at
     refresh time, Gemini Flash produces a natural question from it.

3. **Categories are data.** 5 categories: person, organization, policy,
   issue, event. Adding a 6th later is row inserts + new YAML, no code
   changes.

4. **Models are configuration.** Currently 2 active rows in `models`:
   `chatgpt` (gpt-5-mini), `gemini` (gemini-2.5-flash). Brand-level slugs
   so the version-specific identifier can change without renaming the
   row.

5. **Provenance is captured per response.** Every `model_responses` row
   stores: rendered prompt, prompt_version, model_identifier (the actual
   API string), full response_metadata as JSONB. Historical responses
   resolve correctly to the prompt version they used, even after edits.

---

## Live data state (commit `8206b7f`)

| | Count |
|---|---|
| categories | 5 |
| models | 2 (chatgpt, gemini) |
| subjects | 5 (Bernie, McConnell, AOC, Cotton, Vance) |
| refresh_runs | 12 |
| model_responses | **312** |
| active prompts | 64 (across all 5 categories) |
| deprecated prompts | 14 (history of version bumps + 3 active:false) |

Person category active prompt slots (the most evolved category):
- **named/1, /2, /4, /7, /8** — `fixed` (the original methodology dimensions
  minus the three retired)
- **named/9, /10** — `generated` (recent-event reaction, narrative
  consistency)
- **unnamed/1–5** — `fixed`
- **named/3, /5, /6 are deactivated** (active:false in YAML; rows preserved
  in DB for historical responses)

12 active prompts × 2 models = **24 queries per Person refresh**.

---

## Subjects in the DB

| id | name | role_category | has_v1.2_fields? |
|---|---|---|---|
| 1 | Bernie Sanders | senators | partial — needs primary_domain + pronoun_possessive |
| 2 | Mitch McConnell | senators | partial — same |
| 3 | Alexandria Ocasio-Cortez | representatives | partial — same |
| 4 | Tom Cotton | senators | partial — same |
| 5 | J.D. Vance | Trump administration officials | **complete (created at v1.2)** |

For 1–4, their next refresh will trigger Option C and prompt for
`primary_domain` and `pronoun_possessive`. For 5, runs cleanly.

The four older subjects' multi-item `domain` (and Vance's old
`secondary_domain`) values still sit in JSONB as orphan data after the
domain restructure. Optional cleanup query exists.

---

## Methodology highlights worth knowing

1. **Two layers per category:**
   - **Named layer** — subject mentioned by name. Measures characterization.
   - **Unnamed layer** — subject NOT mentioned. Measures organic visibility
     (does the subject surface when asked about the topic area?).

2. **Methodology consistency rule**: same prompts asked over time. The
   `fixed` prompts honor this strictly. The `generated` prompts (named/9,
   named/10) deliberately relax it because their content depends on
   weekly-refreshed `recent_news`. Their generation_instruction is
   version-controlled; the rendered text varies per refresh.

3. **Recent_news is web-grounded and 7-day-cached.** Auto-fetched via
   Gemini Flash + Google Search at subject creation, refreshed lazily on
   any refresh older than 7 days. Stored as `recent_news` and
   `recent_news_fetched_at` in setup_inputs JSONB.

4. **Grounding is on by default; reasoning is off by default.** OpenAI
   uses `effort="low"` when grounded (the lowest level compatible with
   `web_search`); `effort="minimal"` when ungrounded. Gemini Flash uses
   `thinking_budget=0` when reasoning_enabled=False. Both captured per row.

5. **Concurrency**: `max_concurrency=26` by default — enough for every
   query in a refresh to fire at once. Wall time floor ≈ slowest single
   call (~18s for a typical run).

---

## Conventions for editing

- **Migrations** are sequential in `migrations/NNN_*.sql`. The next
  available number is **004**.
- **Prompt content changes** require a `version:` bump in YAML. Loader
  refuses content changes without a bump.
- **Removing a prompt** uses `active: false` in YAML — does not require a
  version bump; the loader deactivates the matching DB row.
- **Setup_input additions** are non-breaking (templates can be unchanged).
  New required fields auto-prompt existing subjects via Option C
  (`_ensure_setup_inputs_complete` in `app/refresh.py`).
- **Provider abstraction**: any new model goes through `Provider` ABC
  (`app/providers/base.py`) and registers in `app/providers/__init__.py`.
  Engine is provider-agnostic.

---

## Active work coordination

**The other Claude Code session is iterating on prompt generation** —
likely touching `prompts/*.yaml`, `app/prompt_loader.py`,
`app/query_engine.py`, `app/refresh.py`, `app/prompt_generator.py`.

To avoid conflicts, **the analysis-layer session should**:

1. **Use a feature branch.** Suggested name: `analysis-layer`. Run
   `git checkout -b analysis-layer` before doing any work.
2. **Avoid editing the files the other session owns** unless absolutely
   necessary. Prefer creating new files (e.g., `app/analyzer.py`,
   `app/analysis/`) over modifying existing ones.
3. **Coordinate migration numbers.** The other session may add `004`. If
   you need migrations, plan to use **`010`–`019`** to leave room for
   their work, or check in with the user before picking a number.
4. **Read** from `model_responses` freely — that's the input to analysis.
   **Don't write** to `model_responses`, `prompts`, `subjects`, or
   `refresh_runs` (the engine owns those).
5. **Add new tables** for analysis output. Don't modify existing schema.

---

## Suggested first moves for the analysis-layer session

1. Read **`docs/product-spec.md`** sections on the analysis layer and
   recommendation engine.
2. Read **`docs/database-schema.md`** "Future tables" section — describes
   `analysis_outputs`, `extracted_sources`, `extracted_descriptors`,
   `recommendations`. Treat as a starting point but you can refine.
3. Inspect a few rows from `model_responses` to ground the schema in real
   data:
   ```bash
   psql byline -c "SELECT response_text FROM model_responses WHERE refresh_run_id = 12 LIMIT 3;"
   ```
4. Propose a schema (don't run migrations yet) — bring it back for review.
5. Implement extractors as a separate `app/analyzer.py` module that
   reads `model_responses` and writes new tables.
6. Suggested first extractor: **descriptors** (adjectives attached to the
   subject). Visible high-priority extraction target per the spec; cleanly
   testable on the existing 312 rows.

---

## Things deliberately NOT yet built

- A web UI / dashboard (visualization is the eventual end-goal but not
  this session's scope).
- The **recommendation engine** (sources to engage, framings to test,
  counter-narratives to build). Spec'd; deferred until analysis layer
  produces real data.
- An **auth / users / orgs / billing** layer.
- **Alert configurations** for narrative shifts.
- **Per-prompt model overrides** (currently every prompt runs against
  every active model).
- **Scheduled refreshes / cron jobs.** Manual `python -m app.refresh` only.
- **Cross-category subject linking** (events linked to subjects, etc.).
- **Stress-test prompts** (deliberately leading prompts) — deferred to
  v1.5+.

---

## Useful commands quick reference

```bash
# Run a refresh on a subject
.venv/bin/python -m app.refresh "Subject Name"

# Re-seed a category YAML
.venv/bin/python -m app.seed prompts/person.yaml

# Browse the DB
psql byline

# Check the current commit
git log --oneline -5
```
