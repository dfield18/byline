# byline — project state

> A pulse-check of where the project sits **as of 2026-05-09 (late evening,
> after the v1.2 5+5 compaction across all categories + provider US bias +
> descriptor extractor backfill)**. Read this first if you're a fresh Claude
> Code session picking up work. Update when state shifts meaningfully.

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

The **v1.2 methodology pass is complete across all five categories**. Every
category now uses the same **5+5 layout (10 active prompts: 5 named + 5
unnamed)**: person, organization, issue, policy, and event. Total active
prompts: **50** (down from 62). The foundation layer — prompts → providers
→ engine → DB — is stable and validated across **9 subjects in 4 categories
(person, organization, issue, policy)** and **17 refresh runs (411 raw
responses)**. Event has a v1.2 layout in YAML/DB but no Event subject has
been tested yet.

**Provider US bias landed (commit `0c64cab`).** Both providers now hardcode
a US-focused system instruction on every query so model responses default
to US context for political/policy subjects. OpenAI also passes
`web_search.user_location.country=US` to bias search results. Each response
in `model_responses` since the change carries `us_focused=true` (and
`search_user_location_country=US` for OpenAI) in `response_metadata` for
audit. **Methodology caveat:** runs 1–17 measured "AI's default behavior";
runs 18+ measure "AI given a US bias." Cross-run comparisons spanning the
change should account for the discontinuity. The `us_focused` flag in
metadata identifies which rows have it.

The **analysis layer has all five planned extractors live**. Schema is
in place (commit `d311001`, migration 010). `app/analyzer.py` holds the
runner plus five Extractor subclasses, all under methodology_version
`analysis-1.0.0`:

- **descriptors** v1.3 — gemini-2.5-flash with verbatim+grammatical-
  attachment rules. ~46% of responses produce ≥1 descriptor on backfill;
  the rate is lower (~25%) on responses that characterize via actions
  rather than directly (e.g., a Gemini response saying "Rubio advocates
  for an assertive role" produces 0, while ChatGPT saying "Rubio is
  hawkish" produces hits — a real model-difference finding).
- **sources** v1.0 — pure-Python (no LLM), maps citation domains against
  the `source_types` vocabulary using a curated dict + TLD heuristics
  (`.gov` → government, `.edu` → academic). Reads from
  `model_responses.response_metadata.citations` (already populated by
  the providers at refresh time). Writes `sources` JSONB plus
  `total_sources_cited` int. ~73% of citations classify into a known
  source_type today; the rest land in `unknown`. Long-tail unknowns can
  be added to the dict as they appear (`_DOMAIN_TO_SOURCE_TYPE` in
  `app/analyzer.py`).
- **entities** v1.2 — gemini-2.5-flash-lite with structured JSON
  output. Extracts named people / organizations / policies / events /
  locations *other than the subject*, each with type,
  role-relative-to-subject, contextual valence, and excerpt. ~10
  entities per response on average; valence distribution is bimodal
  (~57% neutral factual mentions, ~43% non-zero, skewing negative for
  foreign-policy subjects who name adversarial regimes). Version
  history: v1.0 flash → v1.1 flash-lite (4× cheaper, equal-or-better
  quality on side-by-side) → v1.2 added a DISTRIBUTIVE MODIFIERS rule
  to the prompt (`"Departments of A, B, C"` was producing one entity
  `"Departments of A"` plus bare `"B"` and `"C"`; v1.2 expands the
  shared head noun across every conjunct). Known quirk: ~5% of
  responses produce occasional truncated structured-JSON output on
  flash-lite (single response in run 33). A retry-on-parse-failure
  fallback would mitigate; tracked but not yet built.
- **scores** v1.2 — gemini-2.5-flash, single-object JSON output. Four
  response-level numeric scores plus a short rationale: `sentiment`
  (-1..+1, toward subject), `directional_lean` (-1..+1, left/right
  framing of the subject — works for any category), `certainty`
  (0..+1, low when hedged with "some say" / "critics argue"),
  `criticism_severity` (0..+1, harshness of criticism). All four apply
  to every response; read in context downstream (e.g.,
  `criticism_severity` near 0 on a `named/3` adversarial-defense slot
  is itself a finding). On Rubio's run 18, `criticism_severity` lands
  ~0.90 on `named/3` for both models; ~0 elsewhere — the asymmetry
  methodology surfacing cleanly in numeric form. **v1.1 was a
  flash-lite trial that was reverted**: calibration drift was
  meaningful (criticism_severity weakened from 0.90 → 0.70 on the
  adversarial-defense slots, certainty drifted by up to -0.50 on
  individual responses). v1.2 is functionally identical to v1.0; kept
  the version monotonic.
- **Cross-analysis layer is live (Track A — `cross-analyzer` branch).**
  `app/cross_analyzer.py` holds the runner + a CrossAnalyzer ABC for
  per-refresh findings. First analyzer shipped: **AsymmetryAnalyzer
  v1.0.0** — pure Python, no LLM call. For each category's prompt
  pair, computes per-model gaps on length / descriptor count / citation
  count / sentiment / criticism_severity / directional_lean, plus a
  templated summary. Outputs land in `refresh_analyses` keyed by
  `analysis_type='asymmetry'` and `analysis_key=<pair_key>`,
  methodology_version `cross-analysis-1.0.0`. Pair definitions per
  category live in `_ASYMMETRY_PAIRS`. CLI: `python -m
  app.cross_analyzer <refresh_run_id> [--use-analysis-run N]`.
  First production run on Rubio (analysis_run 34) surfaced a real
  methodology finding: ChatGPT and Gemini criticize Rubio with
  comparable severity but from OPPOSITE directional_lean
  (ChatGPT +0.30 right-shifted; Gemini -0.70 left-shifted). Cost: $0.

- **narrative_themes** v1.1 — gemini-2.5-flash-lite. 1-3 free-form
  theme labels per response (`label`, `weight`, `excerpt`) plus a
  single `dominant_theme` text column. Free-form is intentional
  because we don't yet know what themes to pre-define; tradeoff is
  that labels won't aggregate cleanly across runs (e.g., "foreign
  policy hawkishness" / "hawkish foreign policy" / "foreign policy
  leadership" surface as distinct labels for what's plausibly one
  theme). A future v1.2 with constrained taxonomy via post-hoc
  clustering is the natural next iteration. **v1.1 moved this
  extractor to flash-lite**: the side-by-side showed only 30%
  dominant_theme verbatim agreement vs. flash, but free-form themes
  were already noisy by design at that floor (the agreement rate
  reflects label-fragmentation noise, not a genuine quality
  regression), so the cost saving was kept.

Next sub-phase: **add more extractors** to `app/analyzer.py` — natural
candidates per the spec are sources, entities, scores, narrative_themes.
Each adds ~50 lines (one Extractor subclass + one prompt + schema) and
slots into the existing runner. See "Suggested entry points" below.

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
├── analyzer.py              # CLI: python -m app.analyzer <refresh_run_id>
│                              Extractor ABC + 5 production extractors at
│                              a mixed gemini-flash / flash-lite stack
│                              (cost-tuned per side-by-side testing):
│                                - DescriptorExtractor v1.3 (flash, JSON)
│                                - SourcesExtractor v1.0 (pure Python)
│                                - EntitiesExtractor v1.1 (flash-LITE)
│                                - ScoresExtractor v1.2 (flash, JSON
│                                  object — 4 numeric scores + rationale.
│                                  v1.1 tested flash-lite and was
│                                  reverted: calibration drift on
│                                  criticism_severity was meaningful.)
│                                - NarrativeThemesExtractor v1.1
│                                  (flash-LITE, free-form labels)
│                              Per 20-response refresh: ~$0.035 (was
│                              ~$0.106 on all-flash). Runner fans out per
│                              response, writes response_extractions.
│                              ExtractionResult supports extra_columns for
│                              extractors that span multiple columns
│                              (sources writes both `sources` JSONB and
│                              `total_sources_cited` int;
│                              narrative_themes writes both
│                              `narrative_themes` JSONB and
│                              `dominant_theme` text). Add new extractors
│                              as new Extractor subclasses.
└── providers/
    ├── base.py              # Provider abstract + ProviderResponse dataclass
    ├── openai_provider.py   # AsyncOpenAI; Responses API (web_search tool).
    │                          Hardcoded US system instruction +
    │                          web_search.user_location.country=US.
    ├── gemini_provider.py   # google-genai; .aio.* + GoogleSearch tool.
    │                          Hardcoded US system_instruction (only lever —
    │                          GoogleSearch has no country parameter).
    ├── _retry.py            # Exponential-backoff retry helper
    └── __init__.py          # PROVIDERS registry: 'openai' | 'google'

prompts/                     # All five category YAMLs at v1.2 5+5 layout
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

## Live data state

| | Count |
|---|---|
| categories | 5 |
| models | 2 (chatgpt = gpt-5-mini, gemini = gemini-2.5-flash) |
| subjects | **10** (7 person + 1 organization + 1 issue + 1 policy + 0 event) |
| refresh_runs | **18** |
| model_responses | **432** (431 successful, 20 of which are Rubio's run 18 with `us_focused=true`) |
| active prompts (all categories) | **50** (10 per category × 5 categories — uniform 5+5) |
| active prompts (person / organization / issue / policy / event) | 10 / 10 / 10 / 10 / 10 |
| deprecated prompts (all) | **81** (grew with the org/issue/policy/event v1.2 compactions) |
| source_types (seeded) | 10 |
| analysis_runs | **34** (16 v1.3 descriptor backfill + iteration + repeated Rubio runs + analysis_run 34 is the first cross-analyzer run) |
| response_extractions | **629** |
| refresh_analyses | **2** (Rubio asymmetry v1.0.0, one row per model on the named/2 ↔ named/3 pair) |

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

### Other categories — also at 5+5 v1.2.0

All four other categories were compacted to 5+5 in this same v1.2 pass
(commits `33647c5` org, `c7c237f` issue, `4f087aa` policy, `fd4a4a7`
event). The shapes are parallel to Person but the keepers reflect each
category's distinctive methodology hook:

| Category | Named (5) | Unnamed (5) |
|---|---|---|
| **organization** | descriptive · substantive track record · adversarial · 2× generated (recent-event reaction + narrative consistency) | top-of-mind · domain leadership · adjacent visibility · 2× generated |
| **issue** | descriptive · perspective mapping · case for position_a · case for position_b · 1 generated (recent-event framing) | top-of-mind · pressing-debate · public-concern · 2× generated |
| **policy** | descriptive · favorable · adversarial · coalition · 1 generated (recent-event framing) | top-of-mind in domain · problem-driven · effectiveness · 2× generated |
| **event** | descriptive · responsibility · interpretive · criticism · 1 generated (recent-development reframing) | top-of-mind · domain-shaping · authority · 2× generated |

Generated-prompt counts vary by category: person/organization have 2
generated in named (4 generated total per refresh); issue/policy/event
have 1 in named (3 generated total). The named layer's fixed-prompt
density tracks each category's core methodology hook (favorable/adversarial
pair for issue/policy; descriptive/interpretive pair for event;
substantive-track-record for person/org).

All four categories now have a `recent_news` setup_input (auto-fetched
via web search at subject creation, refreshed weekly) feeding the
generated slots. Event added `recent_news` in the v1.2 compaction —
captures resurfacing developments (anniversaries, lawsuits, follow-up
reporting) that bring past events back into current discourse.

---

## Subjects in the DB

| id | name | category | last refresh run |
|---|---|---|---|
| 1 | Bernie Sanders | person | 11 |
| 2 | Mitch McConnell | person | 7 |
| 3 | Alexandria Ocasio-Cortez | person | 8 |
| 4 | Tom Cotton | person | 9 |
| 5 | J.D. Vance | person | 13 |
| 6 | Gavin Newsom | person | 14 |
| 7 | Heritage Foundation | organization | 15 |
| 8 | AI regulation in the United States | issue | 16 |
| 9 | the Inflation Reduction Act | policy | 17 |
| 10 | Marco Rubio | person | **18** ← latest (only subject with `us_focused=true` metadata; bias landed at run 18) |

**Subjects 7–9 are pilot tests of non-Person categories.** Each was
created and refreshed *after* its category's 5+5 v1.2.0 compaction, so
each refresh produced exactly 10 prompts × 2 models = **20 successful
responses** (the expected count, not gated). Heritage Foundation tested
the organization compaction; AI regulation tested issue; IRA tested
policy. **No Event subject has been tested yet** — the event 5+5 layout
landed in commit `fd4a4a7` after the other compactions.

**Subjects 1–4** still have the old `domain` field as orphan data. Their
`primary_domain` is missing. On their next refresh, Option C will prompt
for `primary_domain` and `pronoun_possessive`.

**Subjects 5 (Vance) and 6 (Newsom)** are fully on v1.2 setup_inputs.
Vance's `secondary_domain` still has multi-item legacy content but no
current active template references `{secondary_domain}`, so it's
effectively orphan too. Newsom was created cleanly with single-item
primary/secondary/tertiary domains.

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
   - Fixed prompts honor "same prompts over time" strictly. Generated
     prompts deliberately relax this — recent_news varies, so rendered
     questions vary. Cross-run comparison on generated slots requires
     inspecting per-row generated text in
     `response_metadata.generation_instruction_rendered`, not assuming
     the question stayed the same.
   - Per-category fixed/generated split: **person, organization** have
     6 fixed + 4 generated (2 generated in named, 2 in unnamed). **Issue,
     policy, event** have 7 fixed + 3 generated (1 in named, 2 in
     unnamed). The denser-fixed-named layouts in issue/policy/event
     reflect a stronger methodology hook there: a paired
     favorable/adversarial probe (issue/policy) or descriptive/interpretive
     pair (event) that can't be relaxed without losing the central
     finding.

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

**Two parallel Claude Code sessions, one feature branch each.** The
prompts-iteration + analysis-layer split that ran earlier in the
project has wrapped (both delivered). The current parallel split is
**Track A** (cross-response findings) and **Track C** (ops hardening),
running concurrently on separate branches. Each track owns a
non-overlapping slice of the codebase so the two sessions can ship
work independently without merge conflicts.

### Track A — Cross-response findings (`cross-analyzer` branch)

The "editor" layer: reads the per-response extractions and produces
findings *across* a whole refresh — asymmetry between paired prompts,
share-of-voice across the unnamed layer, top quotes, narrative drift.
Greenfield code; nothing here exists yet.

| | |
|---|---|
| **Owns these files (new or exclusive)** | new `app/cross_analyzer.py`; new CLI entry `python -m app.cross_analyzer <refresh_run_id>` |
| **Reads** | `response_extractions`, `model_responses`, `prompts`, `analysis_runs` (read-only) |
| **Writes (DB)** | `refresh_analyses` ONLY (currently empty — no contention) |
| **Touches existing analyzer.py?** | NO — new file `cross_analyzer.py`, separate from `app/analyzer.py` |
| **Migration numbers** | none expected (schema landed in migration 010) |
| **STATE.md section** | this Track A subsection + a new "Cross-analysis layer" subsection added under "Architecture" when the runner exists |
| **Suggested deliverable order** | (1) asymmetry → (2) top quotes → (3) share-of-voice (depends on Track C's mention detection) → (4) narrative drift |

### Track C — Ops hardening (`ops-hardening` branch)

Surgical reliability + completeness work. Each item is small enough
to land independently. Pickable in any order; nothing here blocks
anything else in Track C.

| | |
|---|---|
| **Owns these files** | `app/analyzer.py` (additive — new extractors append; no edits to existing extractor classes), `app/refresh.py`, prompt YAMLs, scripts/, migrations/ |
| **Reads** | everything |
| **Writes (DB)** | `subjects` (new Event subject), `subjects.canonical_url` if added (migration), `response_extractions.subject_mentioned` / `mention_rank` / etc., `prompts` (none — categories already at v1.2.0) |
| **Touches existing cross_analyzer.py?** | NO — Track A's file |
| **Migration numbers** | 004+ (e.g., `004_subjects_canonical_url.sql` for sources v1.1's `cited_own_site`) |
| **STATE.md section** | this Track C subsection + edits to "Suggested next" / "Things not yet built" lists as items are picked off |
| **Pickable items** | Test an Event subject end-to-end · sources dict expansion (drop unknown rate from 27% → <15%) · MentionDetectionExtractor (populates the unpopulated mention_* columns; required input for Track A's share-of-voice) · entities v1.3 retry-on-parse-failure · sources v1.1 with `cited_own_site` (needs subjects.canonical_url migration) |

### Cross-track dependency to be aware of

**Track A's share-of-voice analysis** needs **Track C's mention
detection** to populate `response_extractions.subject_mentioned` /
`mention_rank` / `mention_strength`. Until Track C builds and runs
that extractor, those columns are NULL across the board, so Track A's
share-of-voice computation has nothing to count from. Mitigation: do
Track A's asymmetry + top-quotes deliverables first (no Track C
dependency); Track C can prioritize mention detection if Track A
gets to share-of-voice quickly. No other dependencies in either
direction.

### Coordination protocol

1. **Branch per track.** `cross-analyzer` and `ops-hardening`,
   branched off `main`. Both branches rebase on top of latest `main`
   before merging back. Each merge can go in either order — neither
   blocks the other.
2. **No shared files in active edits.** Track A only creates new files
   in `app/`. Track C edits existing files but appends to
   `app/analyzer.py` (no edits to existing Extractor subclasses).
   Provider files, prompt YAMLs, query_engine, prompt_loader,
   prompt_generator are quiet zones — neither track is expected to
   touch them.
3. **Migration numbering.** Track C owns 004+ for prompts/subject
   schema changes. Track A is not expected to need migrations.
4. **STATE.md edit protocol.** Each track edits ITS OWN subsection of
   "Active work coordination" (above) plus its own dedicated section
   when it lands code. The shared "Live data state" count table at
   the top is the only true shared surface; if both tracks update it
   in the same hour, the second to push rebases. Section-level
   conflicts resolve trivially.
5. **Production analyzer status updates.** Per-extractor version bumps
   in the "Current phase" prose belong to Track C since it owns
   `app/analyzer.py`. Cross-analyzer status updates belong to Track A.

---

## Suggested entry points for new sessions

### If you're the Track A session resuming work:
- This section + the per-category 5+5 layout tables are your context.
  Schema for cross-response findings landed in migration 010 — see
  `docs/database-schema.md` "Analysis layer" for the
  `refresh_analyses` table shape.
- Inputs available NOW: 33 analysis_runs, 629 response_extractions
  rows (all 5 per-response extractors populated), 432 model_responses,
  18 refresh_runs, 10 subjects across 4 categories. Rubio's run 18 is
  the freshest data with the full extractor stack.
- **Suggested first deliverable: `analysis_type='asymmetry'`** for
  the named-layer pair structure (e.g., person `named/2` substantive
  record vs. `named/3` adversarial defense; issue `named/3` position-A
  vs. `named/4` position-B; policy `named/2` favorable vs. `named/3`
  adversarial). Compare per-pair: response length, descriptor count,
  source mix, criticism_severity gap, sentiment gap. Outputs a single
  `refresh_analyses` row per refresh keyed by `analysis_type`.
- Cross-response findings need a different runner shape than the
  per-response extractor pattern: they operate on a whole refresh,
  not one row at a time. Don't reuse the `Extractor` ABC from
  `analyzer.py`; design fresh.
- Re-runnable: a new cross-analyzer methodology version creates a new
  `refresh_analyses` row; old rows stay intact for historical
  comparison.

### If you're the Track C session resuming work:
- This section is your context plus the per-extractor version table
  in "Current phase" above (entities at v1.2, scores at v1.2,
  narrative_themes at v1.1, descriptors at v1.3, sources at v1.0).
- **Highest-leverage Track C item:** MentionDetectionExtractor.
  Populates `response_extractions.subject_mentioned`,
  `mention_rank`, `mention_strength`, `mention_excerpt`,
  `disambiguation_confidence` — schema columns from migration 010
  that have been NULL since the table landed. Track A's
  share-of-voice analysis needs these populated.
- **Other pickable items, all independent:**
  - Test Event subject end-to-end (no Event subject exists yet —
    pick a real event, e.g., Sam Altman firing or Roe overturning,
    create the subject via `python -m app.refresh "<name>"`, then
    analyze. Validates the v1.2.0 Event YAML works in production.)
  - Sources dict expansion in `app/analyzer.py`
    `_DOMAIN_TO_SOURCE_TYPE` — drop unknown rate from 27% to <15%.
    Pure data entry from real-run data.
  - Entities v1.3 retry-on-parse-failure: occasional flash-lite
    truncated structured-JSON output on long responses (~5%
    incidence; one occurrence in run 33). Add a re-call on
    `JSONDecodeError` with the response text intact.
  - Sources v1.1 with `cited_own_site`: needs migration
    `004_subjects_canonical_url.sql` to add a
    `subjects.canonical_url` column, then sources extractor checks
    each citation domain against it.
- **To add another extractor**: subclass `Extractor` in
  `app/analyzer.py`, set `name`/`version`/`output_column`, write the
  prompt + JSON schema, add it to the `extractors` list in
  `_cli_main()`. Runner handles the rest. ~50 lines per extractor.
- **A `CombinedExtractor` exists** (one LLM call per response
  producing all four LLM-extractor outputs) but is NOT the default.
  Reachable via `python -m app.analyzer <run_id> --combined`.
  Side-by-side on Rubio's run 18 showed combined-on-flash was 2.3×
  MORE expensive than the mixed-model 4-call default ($0.082 vs.
  $0.035) AND mildly weakened criticism_severity on
  adversarial-defense slots (0.90 → 0.80). Kept in code for cases
  where consolidating API surface matters more than cost.
- **Re-running an extractor** (bumping a version) creates a new
  `analysis_run` with new rows; old rows stay intact for historical
  comparison. The runner backfills cleanly across all
  refresh_run_ids.

---

## Things deliberately NOT yet built

> Items marked **(Track A)** or **(Track C)** are claimed by an active
> session per "Active work coordination" above. Unmarked items are
> uncommitted backlog.

- The cross-response findings layer — **(Track A: asymmetry shipped;
  top quotes, share-of-voice, narrative drift remain)** —
  `refresh_analyses` is live. Asymmetry v1.0.0 is in production. Next
  Track A deliverables in priority order: top quotes, then
  share-of-voice (waits on Track C's mention detection), then
  narrative drift.
- Mention detection extractor — **(Track C — share-of-voice
  prerequisite)** — populates the unpopulated `subject_mentioned`,
  `mention_rank`, `mention_strength`, `mention_excerpt` columns.
- Event subject end-to-end test — **(Track C)** — v1.2.0 Event YAML
  is in place but no Event subject has been refreshed yet.
- A web UI / dashboard for visualization.
- The recommendation engine (sources to engage, framings to test, etc.).
- Auth / users / orgs / billing.
- Alert configurations for narrative shifts.
- Per-prompt model overrides.
- Scheduled refreshes / cron jobs (manual `python -m app.refresh` only).
- Cross-category subject linking (events ↔ people, etc.).
- Stress-test prompts (deliberately leading) — deferred to v1.5+.
- Per-subject US-bias override (`geography_or_scope` plumbed through the
  provider call). Currently the US bias is hardcoded at the provider
  layer and applies to every query system-wide.
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
