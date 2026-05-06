# Claude Code — Getting Started

> Instructions for kicking off the build with Claude Code. This document is meant to be read by Claude Code (or you, when working with Claude Code) to scaffold the foundation of the prompt-running infrastructure.

---

## Context

You are helping build the foundational layer of an AI search visibility tool focused on the public affairs / political market. The full product specification is in `product-spec.md` and should be read first as background. This document covers only the v1-of-v1 build — the prompt-running infrastructure, before any UI, auth, analysis layer, or dashboard.

Before writing code, read these documents in order:

1. `product-spec.md` — the full product spec
2. `database-schema.md` — the schema for the prompt-running infrastructure
3. `prompts-config-format.md` — the YAML format for prompt definitions

---

## Goal of v1-of-v1

A working command-line tool that:

1. Takes a subject name and category as input
2. Looks up the active prompts for that category in the database
3. Renders each prompt template by substituting the subject's setup inputs
4. Queries each active model with each rendered prompt
5. Stores every raw response in the database with full provenance

**The build is "done" when the following command works end-to-end without errors:**

```bash
python -m app.refresh "Bernie Sanders"
```

After running this command, the database should contain:
- 1 row in `subjects` (Bernie Sanders, category=person)
- 1 row in `refresh_runs` (status=completed)
- 26 rows in `model_responses` (13 prompts × 2 models, ChatGPT and Gemini)

That's it. No web UI, no authentication, no analysis layer, no dashboard. Just a working data pipeline.

---

## Tech stack

- **Language:** Python 3.11+
- **Database:** Postgres (local for dev, Railway for deployment later)
- **DB driver:** `psycopg` (v3) or `asyncpg` if going async
- **API clients:** `openai` for ChatGPT, `google-generativeai` for Gemini
- **Config loader:** `pyyaml`
- **CLI:** `click` or `typer` (typer preferred for type hints)
- **Environment:** `python-dotenv` for local .env loading
- **Migrations:** Alembic (or hand-rolled SQL files — either is fine for v1)

Do not add a web framework yet. Do not add Docker yet. Do not add async unless it makes the code clearer (sequential is fine for v1).

---

## Project structure

Suggested directory layout:

```
ai-search-visibility/
├── app/
│   ├── __init__.py
│   ├── refresh.py              # CLI entry point: run a refresh on a subject
│   ├── seed.py                 # CLI entry point: seed/update prompts from YAML
│   ├── db.py                   # Database connection + helpers
│   ├── models.py               # Data classes / typed dicts for domain objects
│   ├── query_engine.py         # Category-agnostic prompt runner
│   ├── providers/
│   │   ├── __init__.py
│   │   ├── base.py             # Abstract provider interface
│   │   ├── openai_provider.py  # ChatGPT implementation
│   │   └── gemini_provider.py  # Gemini implementation
│   └── prompt_loader.py        # Reads YAML prompt configs, validates, seeds DB
├── prompts/
│   └── person.yaml             # The 13 person-category prompts
├── migrations/
│   └── 001_initial_schema.sql  # The schema from database-schema.md
├── tests/
│   └── (start sparse — test happy-path end-to-end first, expand later)
├── .env.example                # Template for required env vars
├── .gitignore
├── pyproject.toml              # Or requirements.txt — your call
└── README.md
```

---

## Build steps, in order

Build these in sequence. Don't move to the next step until the current one works end-to-end on its own.

### Step 1: Database setup

1. Write the schema as a single SQL file in `migrations/001_initial_schema.sql`. Mirror the schema in `database-schema.md` exactly.
2. Set up a local Postgres database. Write a `db.py` module that handles connection from environment variables.
3. Run the migration. Verify all tables exist.

**Done when:** `psql` shows all six tables (`categories`, `models`, `prompts`, `subjects`, `refresh_runs`, `model_responses`) with the right schema.

### Step 2: Seed categories and models

1. Write a `seed.py` script that idempotently inserts the five categories and the two initial models (ChatGPT, Gemini).
2. Use `INSERT ... ON CONFLICT (slug) DO UPDATE` so re-running the seed is safe.

**Done when:** Running `python -m app.seed` populates `categories` (5 rows) and `models` (2 rows). Re-running it doesn't create duplicates.

### Step 3: Prompt YAML loader

1. Implement the YAML format described in `prompts-config-format.md`.
2. Write `prompt_loader.py` that reads a YAML file, validates it against the rules in that doc, and inserts/updates rows in the `prompts` table.
3. Validation rules to enforce:
   - All `{variable}` references in templates must exist in `setup_inputs`
   - Prompt positions are sequential and start at 1
   - Versions follow semver format
4. Update logic: if a prompt with the same (category, layer, position) but a different version exists, mark the old one inactive and insert the new one (in a transaction).

**Done when:** Running `python -m app.seed prompts/person.yaml` populates 13 rows in the `prompts` table for the person category. Re-running it without YAML changes is a no-op. Editing the YAML and re-running it correctly versions the change.

### Step 4: Provider abstractions

1. Define an abstract `Provider` interface in `providers/base.py` with a method like:
   ```python
   def query(self, prompt: str, params: dict) -> ProviderResponse:
       ...
   ```
   where `ProviderResponse` is a dataclass containing: `text`, `metadata` (dict), `success` (bool), `error` (Optional[str]), `latency_ms` (int), `cost_usd` (Decimal).

2. Implement `OpenAIProvider` and `GeminiProvider` against this interface. Use the latest stable model identifiers for each.

3. Each provider should:
   - Handle its own API client setup (read keys from env)
   - Translate the abstract `params` dict to provider-specific request format
   - Return a `ProviderResponse` always — never raise on API errors; instead capture them in `error` and set `success = False`
   - Calculate cost from response token counts

**Done when:** A unit test or quick script can call each provider with a test prompt and get back a `ProviderResponse` with text content.

### Step 5: Query engine

1. Implement `query_engine.py` with a function like:
   ```python
   def run_refresh(subject_id: int) -> int:  # returns refresh_run_id
       ...
   ```

2. The function should:
   - Look up the subject and its category and setup_inputs
   - Look up all active prompts for that category
   - Look up all active models
   - Create a `refresh_runs` row with status='in_progress'
   - For each (prompt, model) pair:
     - Render the prompt template using the subject's setup_inputs
     - Call the model's provider
     - Insert a `model_responses` row with the result
   - Update the `refresh_runs` row with completion status, totals, and aggregate cost

3. Important: the function should be **category-agnostic**. It does not have any if-else logic based on category. It treats prompts as data, fetched from the database.

**Done when:** Calling `run_refresh()` on a manually-inserted Bernie Sanders subject populates 26 rows in `model_responses` (13 prompts × 2 models) and a completed `refresh_runs` row.

### Step 6: CLI for the refresh command

1. Build `refresh.py` as a CLI entry point. It should:
   - Accept a subject name as argument
   - Look up an existing subject by name, OR if not found, prompt the user to provide setup inputs interactively (or via additional flags) and create the subject
   - Call `run_refresh()`
   - Print a brief summary (e.g., "Completed refresh for Bernie Sanders: 26/26 successful, $0.43 total cost, 87 seconds")

2. For v1-of-v1, keep the interactive setup minimal — just prompt for the required inputs in sequence. LLM-auto-suggestion comes later.

**Done when:** Running `python -m app.refresh "Bernie Sanders"` works end-to-end. If the subject doesn't exist, it prompts you to enter setup inputs, then runs the refresh.

---

## Constraints and discipline

**Do not build:**
- A web UI of any kind
- User authentication or accounts
- The analysis layer (extracting findings from responses)
- Any other categories beyond Person (yet)
- Any models beyond ChatGPT and Gemini (yet)
- Async/parallel query execution (sequential is fine)
- Scheduled refresh / cron jobs
- The recommendation engine
- The dashboard
- The audit flow

**Do build:**
- Clean separation between provider implementations
- Clean separation between query engine and the prompts/categories it queries
- Robust error handling — provider failures should not crash the whole refresh
- Full provenance capture in every `model_responses` row (rendered prompt, prompt version, model identifier, all stored even though derivable)
- Idempotent seeding

**Defer aggressively.** If you're unsure whether to build something now or later, the answer is later. The goal of this phase is the smallest working loop, not a feature-complete system.

---

## Architectural commitments to honor

These are from the spec doc and apply throughout:

1. **Prompts are data, not code.** The query engine reads them from the database. It never has prompt strings hardcoded.
2. **Categories are data, not code.** Adding a category later should not require changes to `query_engine.py`.
3. **Models are configuration.** Adding Claude later should be: insert a row in `models`, write an `AnthropicProvider` class, register it. No changes to query engine logic.
4. **Raw responses are immutable.** Once written, never overwritten or deleted. Storage is cheap.
5. **Provenance is captured in full.** Every response row stores enough to reproduce the query exactly, regardless of later changes to prompts or model configs.

---

## Testing approach for v1-of-v1

Don't aim for high test coverage in v1. Aim for one critical test:

- **Integration test:** Spin up a test database, seed it with categories/models/prompts, insert a test subject, call `run_refresh()`, verify the expected rows are created. Mock the provider calls so the test doesn't actually hit external APIs.

This single test catches the vast majority of regressions that would matter early. Unit tests for individual components can come later as the code stabilizes.

---

## What success looks like at the end of this phase

You can run:

```bash
python -m app.refresh "Bernie Sanders"
python -m app.refresh "Elizabeth Warren"
python -m app.refresh "Mitch McConnell"
```

…and within a few minutes each, the database has fresh data. You can then write SQL queries to look at the responses:

```sql
SELECT
    s.name AS subject,
    p.dimension,
    m.display_name AS model,
    LEFT(r.response_text, 200) AS preview
FROM model_responses r
JOIN subjects s ON r.subject_id = s.id
JOIN prompts p ON r.prompt_id = p.id
JOIN models m ON r.model_id = m.id
WHERE s.name = 'Bernie Sanders'
ORDER BY p.layer, p.position, m.id;
```

This is the data you'll design the analysis layer against in the next phase. The foundation is now real.

---

## After this phase

Once v1-of-v1 works, the natural next steps (in approximate order):

1. **Add the other four categories.** Same pattern, just more YAML files. Should be a day each at most.
2. **Generate real example screenshots for the landing page.** Now that you can run prompts on demand, pick 2-3 issues and capture the actual model outputs for use in landing page section 2.
3. **Add Claude as a third model.** Write `AnthropicProvider`, insert a row in `models`. Should be an hour or two.
4. **Spec the analysis layer.** Now that real data exists, the analysis layer can be designed against actual model outputs rather than imagined ones. This conversation can happen with concrete examples in front of you.
5. **Build the analysis layer.** Likely takes substantial work — this is where most of the engineering value lives.

But don't think about any of those until v1-of-v1 actually works. Foundation first.
