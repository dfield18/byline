# byline — project state

> A pulse-check of where the project sits **as of 2026-05-11 (after Phase A2:
> Clerk auth + Phase B: async job pattern shipped)**. Read this first if
> you're a fresh Claude Code session picking up work. Update when state
> shifts meaningfully.

---

## When you come back — quick resume

The active branch is **`main`**. The `fastapi-scaffold` branch was merged
and deleted (locally and on `origin`). To resume:

1. `git pull origin main` (sync any other session's changes)
2. Start the API:
   - Dev (mock user): `BYLINE_AUTH=disabled uvicorn app.api.main:app --reload --port 8000`
   - Real Clerk: `uvicorn app.api.main:app --reload --port 8000` (requires `CLERK_ISSUER` in `.env`)
3. Start the worker (Phase B): `python -m app.worker` — long-running
   process that picks queued jobs off the `jobs` table and runs the
   refresh + analyzer + cross_analyzer chain.
4. Start the web app: `cd web && npm run dev` → http://localhost:3000
   - Signed-out users get redirected to the Clerk-hosted sign-in.
5. (Optional) Start the operator dashboard: `streamlit run dashboard/Home.py`

**Next-priority items, in order:**

1. **Scheduled refreshes (Phase B)** — APScheduler or cron so
   `narrative_drift` findings accumulate weekly without manual
   triggers. With Phase B's job queue in place, this is just a
   scheduled `INSERT INTO jobs (subject_id, kind) VALUES (?, 'refresh')`
   per subject per week. ~half a day.

2. **Recommendation engine (Phase C)** — the spec's main value-add
   layer. The biggest remaining gap between "viewer of findings" and
   "actionable tool." Several days.

3. **Frontend drill-down pages (Phase D)** — per-refresh findings page
   + response detail page in `web/`, mirroring what the internal
   Streamlit dashboard already shows. This is the **customer-facing**
   findings UI; today customers can trigger a refresh but have nowhere
   in the product to see what was found.

   **Open structural questions to settle before building** (deferred
   pending product input, 2026-05-11):
   - **Top-level orientation on a subject's findings page.** Latest
     snapshot? Drift vs prior? Per-model side-by-side? Action items
     (depends on Phase C)?
   - **URL shape.** `/subjects/13/refresh/23` (operator-style,
     refresh-as-page) vs `/subjects/13/findings` (product-style,
     refresh-as-filter with a timeline).
   - **Density.** One big page (everything visible like Streamlit) vs
     tabs per finding type (Asymmetry / Quotes / SoV / Drift) vs
     narrative summary card on top + sections.
   - **Per-response drill-down.** Streamlit has one; customer-facing
     might keep it as-is, hide behind a "raw responses" toggle, or
     cut. The data is there either way.
   - **Reference points:** the operator Streamlit dashboard
     (`streamlit run dashboard/Home.py`) renders all this data
     operator-style — fire it up first to see what's there before
     designing the customer-facing shape.

Migration ordering note: 005 is the next free number for prompt-side
concerns; 011 is next free for analysis-layer concerns. Phase B's
`jobs` table fits the 005 slot.

**Phase A2 (Clerk) — shipped this session:**
- `app/api/auth.py` now validates Clerk JWTs against the JWKS at
  `${CLERK_ISSUER}/.well-known/jwks.json`. In-memory cache with TTL
  + refetch on unknown `kid` (handles rotation). Fails fast at module
  load if `CLERK_ISSUER` is missing and `BYLINE_AUTH` isn't `disabled`.
- `web/proxy.ts` (Next.js 16 renamed `middleware.ts` → `proxy.ts`) runs
  `clerkMiddleware()` and redirects signed-out users to the Clerk-
  hosted sign-in (`<app>.accounts.dev/sign-in`).
- `web/app/layout.tsx` wrapped with `<ClerkProvider>`; header shows
  `<SignInButton>`/`<SignUpButton>` for signed-out, `<UserButton>`
  for signed-in (uses Clerk v7's `<Show when="...">` pattern, not the
  old `<SignedIn>`/`<SignedOut>` components).
- `web/lib/api.ts` reads the session JWT via `auth().getToken()` from
  `@clerk/nextjs/server` and forwards it to the FastAPI. Falls back to
  `BYLINE_API_TOKEN` env var if set (used when backend runs with
  `BYLINE_AUTH=disabled`).
- Env vars: backend uses `CLERK_ISSUER` (+ optional `CLERK_AUDIENCE`);
  frontend uses `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
  `CLERK_SECRET_KEY`. Both `.env` and `.env.local` are gitignored.
- Smoke-tested: backend correctly 401s no-token / bad-token / forged-
  kid requests; frontend correctly 307-redirects signed-out users to
  the Clerk hosted sign-in URL.
- **End-to-end confirmed** (2026-05-11): real Gmail sign-up → org
  creation in Clerk's hosted UI → home page → subject create form →
  POST /api/subjects → subject 13 ("Barack Obama") landed in DB with
  the user's real Clerk `org_id`.

**Phase B (async job pattern) — shipped this session:**
- Migration `005_jobs.sql` adds the `jobs` table: `(id, subject_id,
  org_id, kind, status, enqueued_at, started_at, completed_at, error,
  refresh_run_id, result JSONB)`. Kind: only `'refresh'` today.
  Status state machine: queued → running → succeeded | failed.
  Partial index on `(enqueued_at) WHERE status='queued'` drives the
  worker's claim query.
- `POST /api/subjects/{id}/refresh` enqueues a `refresh` job, returns
  `{id, status, enqueued_at, …}` immediately. Org-scoped via the
  existing `_require_org`.
- `GET /api/jobs/{job_id}` returns the current status. 404s on cross-
  org access to avoid leaking ID existence.
- `app/worker.py` is a long-running process started with
  `python -m app.worker`. Polls every 1s, claims one job at a time
  via `SELECT … FOR UPDATE SKIP LOCKED` so multiple worker processes
  coexist safely. On claim, runs in-process:
  `_ensure_recent_news_fresh` → `run_refresh` → `run_analysis` (full
  6-extractor stack) → `run_cross_analysis` (full 4-analyzer stack).
  Uses `asyncio.to_thread(...)` for the two sync chain steps that
  internally call `asyncio.run()` — avoids the "cannot call
  asyncio.run() from a running event loop" collision with the
  worker's outer loop.
- `app/api/routes/subjects.py` and `app/api/routes/jobs.py` carry the
  endpoints; `web/lib/api.ts` carries `triggerRefresh` / `getJob`;
  `web/app/subjects/[id]/refresh-button.tsx` is the client component
  that triggers + polls + revalidates the subject page on success.
- `web/app/api/jobs/[id]/route.ts` is a Next-side proxy route the
  client uses to poll while authenticated via the Clerk session.
- **Cost/timing budgets observed:** job 2 ran in ~66s wall time at
  $0.0131 cost for a partial refresh (4/20 successful responses).
  A full 20/20 person refresh runs ~$0.11 end-to-end (refresh ~$0.06
  + analyzer ~$0.04 + cross-analyzer ~$0.011) in roughly 60-90s.
- **Timing gotcha caught + fixed:** Postgres `NOW()` returns the
  transaction start time, not wall-clock time. On a long-lived
  worker connection, two consecutive UPDATE … SET ts=NOW() statements
  recorded the same time even when 60s apart in real life. Switched
  to `clock_timestamp()` for `started_at` / `completed_at`. Lesson
  to carry forward: use `clock_timestamp()` whenever you actually
  want wall-clock time in a long-lived connection.
- **Failure-path UX confirmed:** job 1 (the first click, with the
  asyncio.run bug pre-fix) flipped status='failed' and the button
  surfaced the error text inline — proves the client polling +
  error surfacing works end-to-end.
- **Architectural caveat (not yet relevant):** the worker is
  unsupervised. If it crashes mid-job, the row stays
  `status='running'` forever (no stuck-job reaper). Acceptable for
  dev; add a reaper or per-job timeout before any real traffic.

**Schema-driven new-subject form — shipped this session:**
- `GET /api/categories/{slug}/setup-inputs` (in
  `app/api/routes/categories.py`) reads `prompts/{slug}.yaml` and
  returns the setup_inputs schema as JSON (key, label, description,
  required, example, type). Filters out `type: generated` fields
  (e.g., `recent_news`, which is fetched server-side at refresh time
  via web search, not by the user).
- `web/app/subjects/new/page.tsx` is now a Server Component that
  pre-fetches all five category schemas in parallel and hands them
  to a Client Component, `new-subject-form.tsx`. No per-category
  round trip in the browser; the form changes shape instantly when
  the user picks a category.
- Required fields get a red asterisk; helpers come from the YAML
  `description`; placeholders come from the YAML `example`. Boolean
  fields (today only `presidential_candidate_2028`) render as
  Yes/No selects.
- The Server Action (`actions.ts`) was refactored to return a
  discriminated `{ok: true, id} | {ok: false, error}` and is called
  from JS — not from `<form action={…}>` — which sidesteps the
  Next.js 16 / React 19 void-action constraint and lets the client
  surface validation errors inline.
- Backfilled subject 13 (Barack Obama) with full person setup_inputs
  so the next refresh can hit 20/20.

**Live e2e Phase B confirmation (2026-05-11, this session):**
- Subject 13 (Barack Obama, org_3DaL42EuU4M4hN9OGLznf9L2Syi)
- Job #1: failed — caught the worker's nested `asyncio.run()` bug
  (now fixed). Failure surfaced inline on the button.
- Job #2: succeeded — partial refresh (4/20 — Obama's setup_inputs
  were incomplete pre-backfill). refresh_run 22, analysis_run 98,
  cross_analysis_run 99. Cost $0.0131, ~66s wall time.
- Job #3: succeeded — full refresh (20/20) after SQL backfill of
  Obama's setup_inputs. refresh_run 23, ~$0.06, ~60s. All four
  cross-analyzer findings populated for refresh 23.
- The "completed" green status row in `web/app/subjects/[id]/page.tsx`
  was rendering correctly the whole time; we'd just only ever
  rendered "partial" before.
- **Clerk JWT claim format gotcha:** modern Clerk (v7 SDK / v2 token
  format) nests org info under a top-level `o` object — `o.id`,
  `o.rol`, `o.slg`. Older Clerk versions used a flat top-level
  `org_id`. `app/api/auth.py` accepts either, but be aware: if you
  see "This endpoint requires an organization-scoped user" 403s, the
  cause is usually that `o.id` is missing because the user doesn't
  have an active org session (vs. the JWT claim name being wrong).

---

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
responses)**. Event v1.2 layout validated end-to-end — first Event
subject (Sam Altman firing) created at subject 11 / refresh 21 with the
descriptive↔interpretive asymmetry surfacing the signature drift
finding the layout was designed around.

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
- **sources** v1.1 — pure-Python (no LLM), maps citation domains against
  the `source_types` vocabulary using a curated dict + TLD heuristics
  (`.gov` → government, `.edu` → academic). Reads from
  `model_responses.response_metadata.citations` (already populated by
  the providers at refresh time). Writes `sources` JSONB plus
  `total_sources_cited` int and **`cited_own_site` bool** (v1.1
  addition). **~72% of citations classify across the full
  3016-citation corpus** (28% land in `unknown` after Track C's
  dict expansion — added ~50 high-frequency domains spanning news,
  think tanks, advocacy, and campaign categories). v1.1 adds
  `cited_own_site` matching: if `subjects.setup_inputs.canonical_url`
  is set for a subject, the extractor checks each citation's hostname
  against the canonical hostname (matching exact + subdomain). Stored
  per-source on each citation as `is_own_site`, plus a row-level
  `cited_own_site` bool aggregating across the row.
  `subjects.setup_inputs.canonical_url` is the convention rather than
  a new column on `subjects` — keeps with the existing per-subject-
  config pattern (no migration needed). NULL when canonical_url isn't
  configured for the subject. Heritage Foundation backfilled (`https://www.heritage.org`)
  as the v1.1 proof-of-concept; first run surfaced a clean methodology
  signal — AIs cite heritage.org heavily on `named/1` (descriptive
  baseline) and `named/2` (track record) but ZERO own-site citations
  on `named/3` (criticism), confirming AIs don't go to the org's own
  materials when prompted for critique.
- **entities** v1.3 — gemini-2.5-flash-lite with structured JSON
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
  shared head noun across every conjunct) → v1.3 retry-on-parse-
  failure: flash-lite occasionally produced truncated structured-
  JSON output on long responses (~5% incidence on responses >3K
  chars; one occurrence in run 33). v1.3 retries the call once on
  `JSONDecodeError`. Net effect: truncation failure rate drops from
  ~5% to roughly its square (~0.25%) at a cost of ~$0.0005 extra per
  failed response.
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
  per-refresh findings. Three analyzers shipped at `cross-analysis-1.0.0`:

  - **AsymmetryAnalyzer v1.0.0** — pure Python, no LLM call. For each
    category's prompt pair, computes per-model gaps on length /
    descriptor count / citation count / sentiment /
    criticism_severity / directional_lean, plus a templated summary.
    Outputs keyed by `analysis_type='asymmetry'` and
    `analysis_key=<pair_key>`. Pair definitions per category in
    `_ASYMMETRY_PAIRS`. First production run on Rubio (analysis_run
    34) surfaced a real methodology finding: ChatGPT and Gemini
    criticize Rubio with comparable severity but from OPPOSITE
    directional_lean (ChatGPT +0.30 right-shifted; Gemini -0.70
    left-shifted). Cost: $0.

  - **TopQuotesAnalyzer v1.0.0** — Gemini Flash, one LLM call per
    refresh that picks 3-5 verbatim quotes across all 20 responses
    with categorization (characterization / criticism / praise /
    factual_claim / narrative_frame / model_difference) + rationale.
    Writes one global (model_id=NULL) refresh_analyses row per
    refresh. Cost: ~$0.006 per refresh.

  - **ShareOfVoiceAnalyzer v1.0.0** — pure Python, no LLM call.
    Reads Track C's MentionDetectionExtractor v1.0 columns
    (`subject_mentioned`, `mention_rank`, `mention_strength`,
    `competitors_mentioned`) on the unnamed-layer responses. Per
    model, reports mention rate, average rank, rank distribution,
    strength distribution (`primary` / `listed` / `aside` /
    `not_mentioned`), the top 10 competing entities aggregated by
    appearance count + average rank, and a per-response detail list
    for traceability. Skips responses whose mention columns are NULL
    and surfaces coverage in `responses_evaluated`. First full
    Rubio finding (analysis_run 39, both models populated): a real
    model-difference signal — **Gemini surfaces Rubio in 80% of its
    unnamed responses (avg rank 3.0); ChatGPT in only 40% (avg rank
    2.0)**. Gemini gives broader organic visibility; ChatGPT gives
    tighter focus when it surfaces him. The competitive landscapes
    also differ — ChatGPT names a wider cabinet field (Hegseth,
    Vance, Gabbard, Waltz); Gemini stays anchored to a Trump–Rubio–
    Hegseth triangle. Cost: $0.

  - **NarrativeDriftAnalyzer v1.0.0** — Gemini Flash, one LLM call
    for the natural-language summary; everything else is pure-Python
    aggregation. Compares the current refresh against the most
    recent fully-completed prior refresh of the same subject (skips
    `partial` priors when a `completed` one is available — partial
    refreshes have missing model coverage that would skew aggregate
    deltas). Surfaces score deltas (sentiment / criticism_severity
    / directional_lean / certainty), theme turnover (added /
    dropped / stable), descriptor turnover, entity turnover, and
    per-model mention-rate trajectory. First production run on
    Rubio (refresh 18 → refresh 20, 0.68 days apart, analysis_run
    44): all four score deltas under |0.03| — characterization is
    stable on a half-day interval, but framing-language shifts
    visible (descriptors dropped: `neoconservative hawk`,
    `spineless`, `pro-sanctions`; descriptors added: `establishment
    hawk`, `inauthentic`, `interventionist`). One LLM-generated
    summary paragraph captures the drift; the structured deltas
    underneath provide the audit trail. Cost: ~$0.005 per refresh.
    Returns no rows when no prior refresh exists. Methodology
    caveat: free-form theme labels fragment across runs ("national
    security focus" vs "national security surveillance" surface as
    separate themes), so theme turnover overstates real drift; a
    `narrative_themes` v1.2 with constrained taxonomy will tighten
    this up.

  CLI: `python -m app.cross_analyzer <refresh_run_id>
  [--use-analysis-run N]`. Picks the latest per-response
  analysis_run for the refresh by default (filters by
  `methodology_version LIKE 'analysis-%'` to avoid feeding a
  cross-analysis run back into itself).

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
- **mention_detection** v1.0 — gemini-2.5-flash-lite, structured-
  object JSON output. **Runs on unnamed-layer responses only** (no-op
  for named-layer, where the subject is in the prompt and detection
  is meaningless). Populates the six previously-NULL columns on
  `response_extractions`: `subject_mentioned` (bool),
  `mention_rank` (int positional order across all named entities in
  the response — the subject's slot is reserved in the competitor
  numbering, so a rank-7 subject implies competitors at ranks 1-6
  and 8+), `mention_strength` (`'primary'` | `'listed'` | `'aside'`),
  `mention_excerpt`, `disambiguation_confidence` (0..1, primarily
  guarding against same-name collisions), and `competitors_mentioned`
  JSONB (every other named entity in the response, each with
  positional rank and a `type` of `'person'` | `'organization'` |
  `'position'` | `'other'`). Smoke test on Rubio's run 18 (6
  unnamed-layer responses, analysis_run 36) validated the design —
  including a NOT-mentioned response correctly classifying its 5
  positional competitors as `type='position'` plus 1 `'person'`
  reference (Henry Kissinger). **Backfill across the existing 288
  unnamed-layer rows on prior analysis_runs was deferred** — the
  six columns there remain NULL until either someone backfills or a
  fresh refresh is run. New refreshes pick up mention detection
  automatically since the extractor is in the default extractors
  list. Cost: ~$0.0015 per unnamed-layer response.

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
│                              Extractor ABC + 6 production extractors at
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
│                                - MentionDetectionExtractor v1.0
│                                  (flash-LITE, JSON object; runs on
│                                  unnamed-layer responses only — no-op
│                                  for named-layer)
│                              Per 20-response refresh: ~$0.040 (mention
│                              detection adds ~$0.005 over the previous
│                              5-extractor stack at ~$0.035; was ~$0.106
│                              on all-flash). Runner fans out per
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
dashboard/                   # Streamlit internal dashboard (read-only)
├── Home.py                  #   entry — subject list + headline metrics
├── pages/01_subject.py      #   one subject's findings + drill-down
├── pages/02_response.py     #   one model_response, all extractors inline
└── lib/queries.py           #   shared read-only query layer
                             # Run: `streamlit run dashboard/Home.py`

app/api/                     # FastAPI public API for the customer-facing web app
├── main.py                  #   FastAPI app + CORS middleware
├── auth.py                  #   auth dep (placeholder; Clerk JWT TODO)
└── routes/
    ├── subjects.py          #   /api/subjects, /api/subjects/{id}
    ├── refreshes.py         #   /api/refreshes/{id}/responses + findings
    ├── responses.py         #   /api/responses/{id}
    └── categories.py        #   /api/categories/{slug}/slots
                             # Run: `BYLINE_AUTH=disabled uvicorn app.api.main:app --reload --port 8000`

web/                         # Customer-facing Next.js app (App Router, TS, Tailwind)
├── app/page.tsx             #   subject list — calls FastAPI server-side
├── app/subjects/[id]/page.tsx     #   subject profile + refresh history
├── app/subjects/new/page.tsx      #   create-subject form (Phase A)
├── app/subjects/new/actions.ts    #   Server Action wrapping POST /api/subjects
├── lib/api.ts               #   typed fetch client (incl. createSubject)
└── .env.example             #   BYLINE_API_URL + BYLINE_API_TOKEN
                             # Run: `cd web && npm run dev` (after API is up)

migrations/                  # 5 applied: 001-003 + 010 (analysis) + 004 (org_id)
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
| subjects | **11** (7 person + 1 organization + 1 issue + 1 policy + 1 event) |
| refresh_runs | **21** (Rubio at 18+20 with partial 19 in between; Event subject at 21) |
| model_responses | **492** |
| active prompts (all categories) | **50** (10 per category × 5 categories — uniform 5+5) |
| active prompts (person / organization / issue / policy / event) | 10 / 10 / 10 / 10 / 10 |
| deprecated prompts (all) | **81** |
| source_types (seeded) | 10 |
| analysis_runs | **90** (per-response at `analysis-1.0.0` + cross-analysis at `cross-analysis-1.0.0`; rich set after QA-cleanup pass) |
| response_extractions | **1386** |
| refresh_analyses | **100** (4 cross-analyzer types × 11 subjects on their latest refresh; 4 of those subjects also have narrative_drift findings against prior refreshes) |

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
| 10 | Marco Rubio | person | **18 + 20** (refresh 19 = partial quota outage; first subject with multiple full refreshes — unblocks narrative_drift) |
| 11 | the November 2023 firing of Sam Altman by the OpenAI board | event | **21** ← first Event subject ever; validates v1.2.0 Event YAML end-to-end. Asymmetry on the descriptive↔interpretive pair surfaced clean methodology signal: ChatGPT's `named/1` 0% criticism / sentiment 0 → `named/3` 70% criticism / -0.40 sentiment. The AI's *current memory* of the event is more critical than its *description of what happened* — exactly the narrative-drift dynamic the Event 5+5 layout was built around. |

**Subjects 7–9 are pilot tests of non-Person categories.** Each was
created and refreshed *after* its category's 5+5 v1.2.0 compaction, so
each refresh produced exactly 10 prompts × 2 models = **20 successful
responses** (the expected count, not gated). Heritage Foundation tested
the organization compaction; AI regulation tested issue; IRA tested
policy. The Event subject (Sam Altman firing, subject 11) was added
later — first Event refresh ran on refresh_run 21 and surfaced the
designed descriptive↔interpretive asymmetry signal cleanly.

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

### Track A — Cross-response findings (`cross-analyzer` branch — fully shipped, ready to merge)

The "editor" layer: reads per-response extractions and produces findings
*across* a whole refresh. **All 4 deliverables shipped:**

| deliverable | status | notes |
|---|---|---|
| asymmetry | ✓ shipped — `AsymmetryAnalyzer v1.0.1`, pure Python, $0 | per-model gap analysis on category prompt pairs (v1.0.1 patch handles zero-citation edge case in templated summary) |
| top_quotes | ✓ shipped — `TopQuotesAnalyzer v1.0.0`, Gemini Flash, ~$0.006 | one global row per refresh, 3-5 verbatim quotes with categorization |
| share_of_voice | ✓ shipped — `ShareOfVoiceAnalyzer v1.0.0`, pure Python, $0 | per-model mention rate / rank / strength / top competitors. Reads Track C's MentionDetectionExtractor v1.0 columns. |
| narrative_drift | ✓ shipped — `NarrativeDriftAnalyzer v1.0.0`, Gemini Flash, ~$0.005 | compares current refresh vs. most recent fully-completed prior. Score deltas, theme/descriptor/entity turnover, mention-rate trajectory, plus an LLM summary. Returns no rows when no prior exists. First Rubio drift run (refresh 18 → 20) clean. |

| | |
|---|---|
| **Owns these files** | `app/cross_analyzer.py` (existing — additive only when adding new analyzers; no edits to existing CrossAnalyzer subclasses without version bump) |
| **Reads** | `response_extractions`, `model_responses`, `prompts`, `analysis_runs`, `refresh_runs` (read-only). Filters per-response analysis_runs by `methodology_version LIKE 'analysis-%'` to avoid picking a cross-analysis run as the source. |
| **Writes (DB)** | `refresh_analyses` + a new `analysis_runs` row per cross-analyzer invocation |
| **Touches `app/analyzer.py`?** | NO — Track C's territory |
| **Migration numbers** | none expected (schema landed in migration 010) |
| **STATE.md section** | this Track A subsection + the "Cross-analysis layer" bullets under "Current phase" |
| **Status** | `cross-analyzer` branch is ahead of `main` with all 4 deliverables. Ready to merge to `main`. Per-refresh cross-analysis cost: ~$0.011 (top_quotes + narrative_drift LLM calls; asymmetry + share_of_voice are free). |

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
| **Shipped** | ✓ `MentionDetectionExtractor v1.0` — `gemini-2.5-flash-lite` extractor populating the six previously-NULL mention columns on unnamed-layer responses (`subject_mentioned`, `mention_rank`, `mention_strength`, `mention_excerpt`, `disambiguation_confidence`, `competitors_mentioned`). Validated on Rubio's run 18; backfill of older refreshes deferred (288 unnamed-layer rows still NULL on prior analysis_runs). |
| **Recently shipped (this session)** | ✓ Event subject end-to-end test (subject 11) · ✓ Sources dict expansion (~50 domains; unknown 34% → 28% across the full 3016-citation corpus) · ✓ Entities v1.3 retry-on-parse-failure · ✓ Sources v1.1 with `cited_own_site` (stored as `subjects.setup_inputs.canonical_url`, no migration needed) · ✓ Mention-detection backfill on all 17 historical refreshes via new `--only-extractor` analyzer flag ($0.06 total — vs the ~$0.7 of running full analyzer on each) · ✓ Mention_detection v1.1 retry-on-parse-failure (mirrors entities v1.3) · ✓ QA-cleanup pass closed Issues 1–3: cross-analyzer aggregates latest-non-null per column (Issue 1); full per-response extraction on the 8 partial subjects' latest refreshes ($0.43, Issue 2); cross-analyzer invoked on all 11 subjects ($0.06, Issue 3). Every subject now has full asymmetry / top_quotes / share_of_voice findings; 4 subjects also have narrative_drift (the ones with multiple completed refreshes). |
| **Recently shipped (Track C polish, continued)** | ✓ canonical_url backfilled on 7 subjects (Bernie, McConnell, AOC, Cotton, Newsom, Vance, Rubio) — official Senate/House/Governor/State Department sites. `cited_own_site` re-extracted via `--only-extractor sources`; $0 cost (pure Python). Heritage now joined by all person subjects. Issues / events / IRA intentionally left NULL (no canonical site applies). First findings: Heritage cites own site in 8 of 20 responses (21 citations total — most aggressive self-citation); Newsom 4 of 20 (11 cites); Cotton 5 of 26; Vance 0 (AI cites whitehouse.gov for VP role, not his old Senate site — a real finding about how the methodology measures "current officeholder" self-citation). |
| **Remaining pickable items** | backfill full extraction on older refreshes for richer narrative_drift histories (today only the latest refresh per subject has full extraction; older refreshes have descriptors + mention_detection only). |

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
- **All 4 deliverables shipped** (asymmetry, top_quotes,
  share_of_voice, narrative_drift). Track A's original mandate is
  complete. See the Cross-analysis layer bullets under "Current
  phase" for production details.
- **Picking up new work:** follow the existing `CrossAnalyzer` ABC
  pattern in `app/cross_analyzer.py` — subclass + register in
  `_cli_main()`. New analysis types should pick a fresh
  `analysis_type` string for `refresh_analyses` and use
  `analysis_key` for any sub-keying.
- **v1.x backlog** (none of these are blocking; promote when the
  data motivates it):
  - **`narrative_themes` v1.2 with constrained taxonomy** —
    cluster all v1.0 free-form theme labels, derive a stable
    vocabulary, bump the per-response extractor to v1.2 with the
    closed-vocab schema. This would tighten `narrative_drift`'s
    theme turnover signal (today free-form fragmentation overstates
    real drift, e.g., "national security focus" vs "national
    security surveillance").
  - **Per-model `top_quotes`** (~30 lines): add an `analysis_key`
    variant alongside the global one for "ChatGPT's 3 best" vs
    "Gemini's 3 best".
  - **LLM-polished asymmetry summaries**: add an optional
    `polish=True` flag that runs the templated string through
    Gemini Flash for natural phrasing.
  - **Multi-refresh trend analysis**: once any subject has ≥3
    refreshes, build trajectory views (mention-rank trajectory,
    sentiment trajectory, etc.). Goes beyond drift (one delta) to
    trend (slope across N points).
- Re-runnable: a new cross-analyzer methodology version creates a
  new `analysis_run` and new `refresh_analyses` rows; old rows stay
  intact for historical comparison.
- Don't touch `app/analyzer.py` (Track C's file). Don't touch
  prompt YAMLs or refresh.py.

### If you're the Track C session resuming work:
- This section is your context plus the per-extractor version table
  in "Current phase" above (descriptors v1.3, sources v1.0,
  entities v1.2, scores v1.2, narrative_themes v1.1, **mention_detection
  v1.0**).
- **What just shipped:** `MentionDetectionExtractor v1.0` — populates
  the six mention columns on unnamed-layer responses. New refreshes
  pick it up automatically; **288 unnamed-layer rows on existing
  analysis_runs still have NULL columns**. Backfilling those is the
  highest-leverage remaining item because it unblocks Track A's
  share-of-voice deliverable. Two paths: (a) re-run all extractors
  via `python -m app.analyzer <id>` per refresh (~$0.04 per refresh,
  redundant work but simple), or (b) write a mention-only mode that
  UPDATEs the existing rows on a chosen analysis_run (small additive
  function in `app/analyzer.py`; cheaper but new code).
- **Other pickable items, all independent:**
  - ~~Test Event subject end-to-end~~ — DONE (subject 11, refresh 21,
    Sam Altman firing — full pipeline including cross-analyzer ran
    clean; asymmetry on the descriptive↔interpretive pair produced
    the designed criticism-gap signal).
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

- ~~The cross-response findings layer~~ — **(Track A: SHIPPED, all
  4 deliverables in production)** — asymmetry + top_quotes +
  share_of_voice + narrative_drift now run end-to-end on
  `python -m app.cross_analyzer <refresh_run_id>`. Per-refresh cost
  ~$0.011.
- Mention detection backfill across the 288 unnamed-layer rows on
  prior analysis_runs — **(Track C — share-of-voice prerequisite)** —
  the `MentionDetectionExtractor v1.0` extractor itself shipped on
  `ops-hardening`; only the historical-data backfill is pending.
  New refreshes pick up mention detection automatically.
- ~~Event subject end-to-end test~~ — **(Track C: SHIPPED)** — Sam
  Altman firing event (subject 11) created and refreshed (run 21);
  full per-response analysis (run 45) and cross-analysis (run 46)
  ran clean. Asymmetry surfaced the designed descriptive↔
  interpretive criticism gap. v1.2.0 Event YAML validated end-to-end.
- ~~A web UI / dashboard for visualization~~ — **internal v0 shipped**
  (Streamlit, read-only). Lives in `dashboard/` at the repo root.
  Three pages: Home (subject list + headline metrics) · Subject detail
  (one subject's cross-analyzer findings + per-response drill-down) ·
  Response detail (one model_response with all six extractor outputs
  inline). Reads via `dashboard/lib/queries.py` which uses the same
  latest-non-null-per-column aggregation as cross_analyzer
  (post-Issue-1). Run: `streamlit run dashboard/Home.py`. v0 scope:
  no auth, no write paths, no charts — just tables/tabs/metrics over
  the local data. See `dashboard/README.md` for details.

- **Customer-facing web app (Next.js + FastAPI) — v0 scaffold + Phase A
  multi-tenancy/writes shipped.**
  The internal Streamlit dashboard is for the operator; customer-facing
  UI is a separate stack. Lives in `app/api/` (FastAPI backend) +
  `web/` (Next.js App Router + TS + Tailwind). Run locally:
  ```
  BYLINE_AUTH=disabled uvicorn app.api.main:app --reload --port 8000
  cd web && npm run dev   # http://localhost:3000
  ```

  **Phase A landed (this commit):**
  - Migration `004_subjects_org_id.sql` adds nullable `subjects.org_id`
    + index. The 11 seed subjects stay with NULL org_id (operator-only,
    invisible to customers). New customer subjects get the requesting
    user's Clerk-style org id.
  - `dashboard/lib/queries.py`:
    - `list_subjects(org_id=None)` and `get_subject(id, org_id=None)`
      take an optional org_id filter. When None → unscoped (Streamlit
      operator view); when set → only that org's subjects.
    - New `create_subject(org_id, category_slug, name, setup_inputs)`
      write helper. Rejects duplicate (org_id, name) pairs.
  - `app/api/auth.py`:
    - Mock user now has `org_id="org_internal"` (not None), so the
      seed 11 subjects are correctly invisible to dev API callers.
    - Two helper functions, `assert_refresh_in_org` and
      `assert_response_in_org`, used by the refreshes/responses
      routes to 404-not-403 when the underlying subject belongs to
      another org. Defensive checks against ID-guessing.
    - Clerk JWT validation is the explicit TODO — see the long
      docstring + `env vars` for what to plumb when you sign up for
      Clerk.
  - `app/api/routes/`:
    - `subjects.py`: `GET /api/subjects` and `GET /api/subjects/{id}`
      now scope to `user.org_id`. New `POST /api/subjects` accepts a
      `{name, category, setup_inputs}` payload, validates category,
      delegates to `create_subject`. Returns 201 + the created row.
    - `refreshes.py`, `responses.py`: both call `assert_*_in_org`
      before serving data.
  - `web/lib/api.ts`: new `createSubject({name, category, setup_inputs})`
    helper.
  - `web/app/subjects/new/` — Server Action + form to create a subject.
    Person-specific fields rendered inline; other categories accept the
    create call but require subsequent CLI refresh for missing required
    fields (interactive prompt fallback). Form fields prefixed `si__`
    collect into the `setup_inputs` payload.
  - `web/app/page.tsx`: empty-state UI when an org has no subjects yet
    (a fresh customer lands on "Create your first subject" instead of
    a blank table).

  **Phase A end-to-end validation:**
  ```
  GET  /api/subjects                            → []  (mock org_internal has no subjects)
  POST /api/subjects {name=Test, category=person, setup_inputs={…}}
                                                → 201 {id: 12, org_id: "org_internal"}
  GET  /api/subjects                            → [{id: 12, ...}]
  GET  /api/subjects/7  (Heritage, NULL org_id) → 404 "not found"  ← correctly invisible
  ```
  Test subject deleted after verification.

  **Still pending for "real" production (the bigger remaining gaps,
  in priority order):**

  1. **Clerk auth wiring (Phase A2)** — the placeholder accepts any
     bearer token. Per `app/api/auth.py` docstring, sign up for Clerk,
     populate `CLERK_ISSUER` env var, replace the TODO with JWKS
     validation. Frontend integration via `@clerk/nextjs` (Vercel
     Marketplace integration auto-provisions env vars). ~half a day.

  2. **Async job pattern (Phase B)** — `POST /api/subjects/{id}/refresh`
     can't synchronously call `app.refresh` (30+ second operation).
     Needs a `jobs` table migration + a small worker loop. Frontend
     polls `GET /api/jobs/{id}` for completion. ~1 day.

  3. **Scheduled refreshes (Phase B)** — APScheduler or cron wrapping
     `python -m app.refresh` so `narrative_drift` findings accumulate
     weekly without manual triggers. ~half a day.

  4. **Recommendation engine (Phase C)** — the spec's main value-add
     layer. "AI says X about you → here's what you should do." Several
     days; the difference between "viewer of findings" and "actionable
     tool customers pay for."

  5. **Frontend pages (Phase D)** — per-refresh findings drill-down,
     response detail view, category-aware setup_inputs forms. After
     Phase B's async jobs land, also wire a "Trigger refresh" button.
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
