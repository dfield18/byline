# byline — project state

> A pulse-check of where the project sits **as of 2026-05-09 (late evening)**,
> on commit `d311001`. Read this first if you're a fresh Claude Code session
> picking up work. Update when state shifts meaningfully.

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

The **v1.2 methodology pass is complete and refined**. The Person category
prompt set has been compacted to a **5+5 layout (10 active prompts total)**.
The foundation layer — prompts → providers → engine → DB — is stable and
validated across 5 subjects and 13 refresh runs (332 raw responses).

Next major phase: **the analysis layer**. The **schema is landed** as of
commit `d311001` (migration 010) — three tables (`analysis_runs`,
`response_extractions`, `refresh_analyses`) plus a `source_types` lookup
vocabulary. Methodology version is `analysis-1.0.0`. Schema design lives
in the migration file's header comment.

Next sub-phase: **implement the extractors** (`app/analyzer.py` or
similar new module). Suggested first extractor is **descriptors** — see
"Suggested entry points" below.

---

## Architecture

### Code layout

```
app/
├── db.py                    # Sync psycopg connection helpers (DATABASE_URL)
├── seed.py                  # CLI: seed categories+models or load a YAML
├── prompt_loader.py         # YAML validate + upsert; supports type=generated,
│                              active:false deactivation, gap-allowed positions
├── prompt_generator.py      # Meta-LLM (Gemini Flash) for type=generated prompts
├── query_engine.py          # async run_refresh — concurrent fan-out via
│                              psycopg AsyncConnectionPool + Semaphore.
│                              Pre-renders generated prompts before fan-out.
├── refresh.py               # CLI: python -m app.refresh "Name"
│                              Includes Option C (interactive prompt for
│                              missing required setup_inputs) and weekly
│                              recent_news cache management.
└── providers/
    ├── base.py              # Provider abstract + ProviderResponse dataclass
    ├── openai_provider.py   # AsyncOpenAI; Responses API (web_search tool)
    ├── gemini_provider.py   # google-genai; .aio.* + GoogleSearch tool
    ├── _retry.py            # Exponential-backoff retry helper
    └── __init__.py          # PROVIDERS registry: 'openai' | 'google'

prompts/                     # All five category YAMLs; person at v1.2 (5+5)
migrations/                  # 4 applied (001-003 foundation + 010 analysis
                               layer schema)
sql/                         # Hand-written analysis queries
scripts/                     # Diagnostics (test_providers, test_freshness)
findings/                    # gitignored — local-only response dumps
docs/                        # Spec docs (read-only inputs)
```

### Conceptual layers

1. **Prompts are data, not code.** Authored in `prompts/*.yaml`, seeded
   into the `prompts` DB table, queried at refresh time. Templates use
   `{placeholder}` substitution from a subject's `setup_inputs` JSONB.

2. **Two prompt types** (`prompts.type` column):
   - **`fixed`** — template is a literal string with placeholders.
   - **`generated`** — template is a meta-LLM generation instruction; at
     refresh time, Gemini Flash produces a natural question from it. Used
     for recent-news prompts where consistency-over-time is intentionally
     relaxed.

3. **Categories are data.** 5 categories: person, organization, policy,
   issue, event. Adding a 6th later is row inserts + new YAML.

4. **Models are configuration.** 2 active rows in `models`:
   `chatgpt` (gpt-5-mini), `gemini` (gemini-2.5-flash). Brand-level slugs.

5. **Provenance is captured per response.** Every `model_responses` row
   stores: rendered prompt, prompt_version, model_identifier, full
   `response_metadata` as JSONB. Historical responses resolve correctly
   to the prompt version they used, even after edits.

6. **Analysis layer is downstream and immutable-friendly.** The four
   analysis tables (`source_types`, `analysis_runs`, `response_extractions`,
   `refresh_analyses`) READ from `model_responses` and never write to it.
   Every extraction row is tagged with `methodology_version`, so re-running
   a smarter extractor produces a new `analysis_run` and a new set of rows
   — old rows stay intact for historical comparison. Per-response findings
   (descriptors, sources, entities, terminology, scores, narrative themes,
   mention detection) live as JSONB blobs on a single
   `response_extractions` row per (run, response). Cross-response findings
   (asymmetry, narrative drift, share of voice, top quotes, etc.) live in
   `refresh_analyses` keyed by `analysis_type`.

---

## Live data state (commit `d311001`)

| | Count |
|---|---|
| categories | 5 |
| models | 2 (chatgpt = gpt-5-mini, gemini = gemini-2.5-flash) |
| subjects | 5 (Bernie, McConnell, AOC, Cotton, Vance) |
| refresh_runs | 13 |
| model_responses | **332** |
| active prompts (all categories) | 62 |
| active prompts (person) | **10** |
| deprecated prompts (all) | 29 |
| source_types (seeded) | 10 |
| analysis_runs / response_extractions / refresh_analyses | 0 (schema only) |

### Person category — current 5+5 layout

| Slot | Dimension | Type | Variables used |
|---|---|---|---|
| named/1 | descriptive baseline | fixed | `{name}`, `{pronoun_be}`, `{pronoun_subject}` |
| named/2 | substantive record | fixed | `{name}`, `{primary_domain}` |
| named/3 | adversarial defense test | fixed | `{name}` (was named/7) |
| named/4 | recent-event reaction | **generated** | `{name}`, `{recent_news}` (was named/9) |
| named/5 | narrative consistency | **generated** | `{name}`, `{pronoun_possessive}`, `{recent_news}`, `{role}`, `{primary_domain}` (was named/10) |
| unnamed/1 | top-of-mind | fixed | `{contextual_domain}` |
| unnamed/2 | domain leadership | fixed | `{role_category}`, `{primary_domain}` |
| unnamed/3 | adjacent position | fixed | `{role_category}`, `{adjacent_position}` (was unnamed/5) |
| unnamed/4 | recent-event leadership | **generated** | `{role_category}`, `{recent_news}` (was unnamed/7) |
| unnamed/5 | recent-event leadership (alt) | **generated** | `{role_category}`, `{recent_news}` (was unnamed/8) |

10 active × 2 models = **20 measurement queries per Person refresh**. Plus
4 meta-LLM pre-render calls (one per generated slot) and 1 web-fetch for
recent_news (cached 7 days). Wall time ~18s, cost ~$0.06 per refresh.

### Notes on the renumbering

The 5+5 compact layout was achieved on **2026-05-09 (commit `5498995`)** by:
- Dropping 6 prompts (perception framing, currency check, secondary record,
  recommendation framing, authority framing, secondary leadership)
- Renumbering 6 remaining prompts to compact positions

Pre-renumber DB rows for the moved/dropped slots are deactivated with
`retirement_reason="Renumbered to compact 1-5 / 1-5 positions..."`.
Historical `model_responses` from earlier runs still resolve to their
original prompt rows correctly. **Position numbers are not stable across
the renumber — analyses spanning the renumber boundary should join by
`prompt_id` or filter by dimension/template, not by raw position.**

### Other categories

Organization, policy, issue, event each have **13 active prompts at v1.1.0**
(unchanged from earlier work). They have not been compacted to 5+5 yet —
that's a future methodology pass if/when those categories get used.

---

## Subjects in the DB

| id | name | primary_domain | role_category | last refresh run |
|---|---|---|---|---|
| 1 | Bernie Sanders | (still in old `domain`) | senators | 11 |
| 2 | Mitch McConnell | (still in old `domain`) | senators | 7 |
| 3 | Alexandria Ocasio-Cortez | (still in old `domain`) | representatives | 8 |
| 4 | Tom Cotton | (still in old `domain`) | senators | 9 |
| 5 | J.D. Vance | conservative populism | Trump administration officials | **13** ← latest |

**Subjects 1–4** still have the old `domain` field as orphan data. Their
`primary_domain` is missing. On their next refresh, Option C will prompt
for `primary_domain` and `pronoun_possessive`.

**Subject 5 (Vance)** is fully on v1.2 setup_inputs as of run 13. His
`secondary_domain` still has multi-item legacy content but no current
active template references `{secondary_domain}`, so it's effectively
orphan too.

---

## Methodology highlights

1. **Two layers per category:**
   - **Named layer** — subject mentioned by name. Measures characterization.
   - **Unnamed layer** — subject NOT mentioned. Measures organic visibility
     (does the subject surface when asked about the topic area?).

2. **`recent_news` flow:**
   - Fetched via Gemini Flash + Google Search at subject creation.
   - Cached 7 days. Re-fetched lazily on any refresh older than 7 days.
   - Used by named/4, named/5 (named layer — characterization with name)
     AND unnamed/4, unnamed/5 (unnamed layer — visibility on a current
     topic without naming the subject).
   - Stored as `recent_news` + `recent_news_fetched_at` in setup_inputs JSONB.

3. **Pair coordination across generated prompts:**
   - named/4 + unnamed/4 both target the SINGLE most prominent event from
     `recent_news` (different lenses on the same event: characterization
     vs. organic visibility).
   - named/5 + unnamed/5 each pick a DIFFERENT event from the most
     prominent one. They may pick the same secondary event or different
     ones; in run 13 they picked different (Iran vs. H1B).

4. **Methodology consistency:**
   - The 6 fixed prompts honor "same prompts over time" strictly.
   - The 4 generated prompts deliberately relax this — recent_news varies,
     so rendered questions vary. Cross-run comparison on those slots
     requires inspecting the per-row generated text in
     `response_metadata.generation_instruction_rendered`, not assuming
     the question stayed the same.

5. **Grounding on by default; reasoning off by default.** OpenAI uses
   `effort="low"` when grounded, `"minimal"` when not. Gemini Flash uses
   `thinking_budget=0`. Captured per row.

6. **Concurrency:** `max_concurrency=26` — every query in a refresh fires
   at once. Wall-time floor ≈ slowest single call (~18s typical).

---

## Conventions for editing

- **Migrations** are sequential in `migrations/NNN_*.sql`. **004** is the
  next available number for prompt-iteration concerns; **011** is the next
  available for analysis-layer concerns (010 is taken by the analysis
  schema).
- **Prompt content changes** require a `version:` bump in YAML. Loader
  refuses content changes without a bump.
- **Removing a prompt** has two paths:
  - Mark `active: false` in YAML (keeps audit trail in YAML).
  - Remove from YAML entirely (loader's position-uniqueness rule allows
    gaps; rows persist in DB unless explicitly deactivated).
- **Position numbers** are not stable identifiers. If you need a stable
  reference to a prompt, use `prompt_id` or `(layer, dimension, version)`.
- **Setup_input additions** are non-breaking. New required fields auto-
  prompt existing subjects via Option C
  (`_ensure_setup_inputs_complete` in `app/refresh.py`).
- **Provider abstraction**: any new model goes through `Provider` ABC
  (`app/providers/base.py`) and registers in `app/providers/__init__.py`.

---

## Active work coordination

**Two parallel Claude Code sessions** sharing the same checkout directory.
The `analysis-layer` feature branch has been merged into `main` (as of
commit `d311001`); both sessions now work directly on `main` until either
needs a new feature branch.

- **Prompts-iteration session** — touches prompts YAMLs,
  `app/prompt_loader.py`, `app/query_engine.py`, `app/refresh.py`,
  `app/prompt_generator.py`.
- **Analysis-layer session** — touches `migrations/011+`, will create
  `app/analyzer.py` (or similar) and write to the new analysis tables.

Coordination notes:

1. **Cut a feature branch when starting non-trivial work**, then merge
   back to main when done — same flow that landed `010`.
2. **Migration numbers**: prompts work uses 004–009. Analysis-layer
   uses 011+ (010 is taken).
3. **DB tables**: prompts session reads/writes `categories`, `models`,
   `prompts`, `subjects`, `refresh_runs`, `model_responses`. Analysis-
   layer should READ those (especially `model_responses`) but only WRITE
   to `analysis_runs`, `response_extractions`, `refresh_analyses`, and
   (rarely) `source_types`.
4. **STATE.md** lives on `main`; it should be updated by whichever session
   makes a meaningful state change. If you're on a feature branch, sync
   `main` in (or wait until merge) before editing it.

---

## Suggested entry points for new sessions

### If you're the prompts-iteration session resuming work:
- Read this file's "Person category — current 5+5 layout" table.
- Check `git log --oneline -5` to see what's on main since the last
  commit on this branch.
- The next natural prompt-iteration concerns: improve engine to skip-on-
  missing-optional setup_inputs (so prompts referencing optional fields
  don't fail render); apply 5+5 compaction to other categories; iterate
  on generated-prompt instruction language.

### If you're the analysis-layer session resuming work:
- Schema is in place — read **`migrations/010_analysis_layer.sql`** for
  the table shapes and the documented JSONB blob structures.
- Read **`docs/product-spec.md`** sections on the analysis layer and
  recommendation engine for the methodology context.
- Note: **`docs/database-schema.md` does not yet document the analysis
  tables** — it still lists them under "Future tables." Updating that
  doc is a good next chore.
- Inspect a few rows from `model_responses` to ground extractor design
  in real data:
  ```bash
  psql byline -c "SELECT response_text FROM model_responses WHERE refresh_run_id = 13 LIMIT 3;"
  ```
- Suggested first extractor: **descriptors** (adjectives attached to the
  subject) — high-signal extraction target per the spec; cleanly testable
  on the existing 332 rows. Writes to `response_extractions.descriptors`
  JSONB. Methodology version `analysis-1.0.0`.

---

## Things deliberately NOT yet built

- A web UI / dashboard for visualization.
- The recommendation engine (sources to engage, framings to test, etc.).
- Auth / users / orgs / billing.
- Alert configurations for narrative shifts.
- Per-prompt model overrides.
- Scheduled refreshes / cron jobs (manual `python -m app.refresh` only).
- Cross-category subject linking (events ↔ people, etc.).
- Stress-test prompts (deliberately leading) — deferred to v1.5+.
- 5+5 compaction for organization/policy/issue/event categories.
- Engine support for skip-on-missing-optional setup_inputs (currently a
  KeyError causes a partial-status row).

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

# Show active prompts for person
psql byline -c "
  SELECT p.layer || '/' || p.position AS slot, p.dimension, p.type, p.version
  FROM prompts p JOIN categories c ON p.category_id = c.id
  WHERE c.slug = 'person' AND p.active
  ORDER BY p.layer DESC, p.position;"
```
