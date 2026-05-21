# byline — project state

> A pulse-check of where the project sits **as of 2026-05-21**
> — Visibility hub restructure day. The big themes:
>
> - **Visibility spoke fully rebuilt as a SaaS-style executive
>   dashboard.** Eight numbered sections — AI Visibility Briefing
>   → 01 Trend → 02 Platforms → 03 Topics → 04 Position → 05
>   Competitive (tabbed Overview / Co-Mentions / Ownership). Two
>   phase headers ("Where you stand now", "The competitive
>   landscape") group sections into a two-act story. Floating
>   right-rail SectionNav with IntersectionObserver scroll-spy
>   lets readers jump between sections; `xl:pr-44` on `<main>`
>   reserves a corridor so the nav doesn't overlap content.
> - **Major backend depth: seven new rollups on `SubjectOverview`.**
>   `subject_set_benchmarks` (cross-subject KPI averages for "vs
>   subject-set avg" annotations), `topic_leaderboard` (per-topic
>   leader + per-(topic, entity) mention/rank/first stats, plus
>   `subject_rank_buckets` for the Answer Position topic dropdown),
>   `co_mention_frequency`, `per_platform_entity_sov`, richer
>   5-bucket `rank_distribution` (including Not mentioned),
>   `per_topic.entities` for the Prominence topic-scope filter.
>   All in `dashboard/lib/queries.py`; same prompt → topic
>   resolution as `_topic_coverage_for_refresh` so labels align
>   across the page.
> - **Topic-scope dropdowns** on Answer Position and the Prominence
>   table — URL-driven (`?position_topic=…`, `?prominence_topic=…`)
>   so the page stays server-rendered and the scopes are
>   bookmarkable. Independent params; both can be set
>   simultaneously without colliding.
> - **Competitive section tabs** (Overview / Co-Mentions /
>   Ownership) fold three views into one section, URL-driven
>   (`?competitive_tab=…`). Saves ~1000px of vertical real estate
>   at the default tab; non-default tabs are one click away.
> - **Composite Competitive Index** in the Prominence table —
>   0-100 score = equal-weighted blend of SoV + first-mention
>   share + rank-position score (rank 1 = 1.0, rank 10+ = 0).
>   Table now sorts by Score; tooltip on the column header walks
>   through the formula.
> - **Briefing KPI strip** carries polarity hints (`↑ higher is
>   better` / `↓ lower is better`) and cross-subject benchmark
>   lines ("vs 70% subject-set avg, 12 subjects") under each tile.
>   All four KPIs colored by threshold (success / warning /
>   neutral) using polarity-aware semantics.
> - **Overview page**: TrajectoryStrip promoted from
>   bottom-of-page to right under the hero, with an "Open
>   Visibility deep-dive" cross-link in the SectionTitle right
>   slot. Reading flow: hero → trends → deeper sections.
> - **Misc fixes**: Clerk UserButton hydration mismatch fixed via
>   `next/dynamic({ ssr: false })`; Recharts `width(-1)/height(-1)`
>   warnings killed with numeric `height={N}` + `minWidth={1}`;
>   `CompetitorBarsFromData` SoV axis formatter multiplies by
>   100 (was rendering 0..1 raw as ".25%").
>
> Removed along the way: standalone Tone / Evidence Drawer /
> Prompt-Level Evidence / Cross-Platform Consistency / Topic
> Battleground sections; standalone Co-Mentions and Ownership
> sections (folded into Competitive tabs). `TopicTrends.tsx`
> deleted entirely.
>
> Builds on the 2026-05-17 Overview hero consolidation + Sources
> polish + hub-and-spokes wiring; 2026-05-16 dual QA passes;
> 2026-05-15 Recommended Actions LLM refactor.
>
> Read this first if you're a fresh Claude Code session picking up
> work. Update when state shifts meaningfully.

---

## Latest session (2026-05-21) — Visibility hub restructure

Shipped in commit **`a6aa0e8`** ("Visibility hub: SaaS-style
restructure + competitive depth + benchmarks"). 14 files,
3067 ins / 2498 del.

### Backend (`dashboard/lib/queries.py`)

Seven new keys on `SubjectOverview` returned by
`get_subject_overview()` (and matching empty shells in
`_empty_overview()`):

| Key | What it carries |
|---|---|
| `subject_set_benchmarks` | `{n_subjects, ai_mention_rate_avg, avg_mention_rank_avg, first_mention_rate_avg}` — cross-subject KPI averages computed in one bulk query over each subject's latest completed refresh. Powers the "vs subject-set avg" caption on the Briefing KPI tiles. |
| `topic_leaderboard[i]` | Per-topic leader + per-(topic, entity) prominence. Each row has `topic_label`, `n_responses`, `subject_rate`, `leader_name`, `leader_rate`, `subject_is_leader`, `gap_to_leader`, `top_competitors`, `entities[]` (full per-entity data: name, mentions, sov, avg_rank, first_mention_rate), and `subject_rank_buckets` (5-bucket distribution scoped to this topic — same shape as top-level `rank_distribution`). |
| `co_mention_frequency` | `{subject_mention_count, co_mentions: [{name, count, share}]}` — denominator is subject-mention responses, not all responses. Distinct from SoV. |
| `per_platform_entity_sov` | `{platforms, entities, cells}` — top-N entities × platforms grid with each entity's SoV per platform (subject always force-included in entities). |
| `rank_distribution` | **Shape changed**: now `{total_responses, n_mentioned, buckets: [Rank 1 / Ranks 2-3 / Ranks 4-5 / Rank 6+ / Not mentioned]}` (5 buckets, normalized to total responses). The old 4-bucket array (#1/#2/#3/#4+) is gone. |
| `topic_leaderboard[i].entities[j].avg_rank` etc. | The richer per-(topic, entity) shape inside topic_leaderboard powers both the Battleground (now removed) and the Prominence topic-scope dropdown. |

All seven derive from `response_extractions` data that already
exists — no ETL changes, no new tables. Reuses the same
prompt → topic resolution as `_topic_coverage_for_refresh`
(via `_topic_for_prompt`), so labels align across sections.

**Helpers added** (all in `dashboard/lib/queries.py`):
`_subject_set_benchmarks`, `_topic_leaderboard_for_refresh` (extended),
`_co_mention_frequency_for_refresh`, `_per_platform_entity_sov_for_refresh`,
and the rewritten `_rank_distribution_for_refresh`.

### Frontend (`web/app/subjects/[id]/visibility/`)

| File | Role |
|---|---|
| `page.tsx` | Server component. Reads `?compare`, `?prominence_topic`, `?position_topic`, `?competitive_tab` from `searchParams`. Renders Briefing + numbered sections. |
| `TrendOverTime.tsx` | Client. Simplified — generic `overlays` prop, no tabs. Subject + top-3 competitor overlay lines (distinct hues), custom multi-series tooltip. |
| `FilterBar.tsx` | Client. Now just the Compare-to dropdown (Platform/Topic filters removed when Prompt-Level Evidence section was cut). Non-sticky to avoid overlapping the page Header. |
| `SectionNav.tsx` | Client. Floating right-rail jump nav, xl+ only. Uses `IntersectionObserver` (rootMargin `-40% 0px -50% 0px`) for scroll-spy. Five entries: Trend / Platforms / Topics / Position / Competitive. |
| `CompetitiveScatter.tsx` | Client. Recharts `ScatterChart` for Position vs Share panel inside Competitive Visibility. X-axis (Avg Rank) reversed so "best position" sits left. |
| `CompetitiveTabs.tsx` | Client. Tab strip inside Competitive section. URL-driven `?competitive_tab=` (overview / co-mentions / ownership). |
| `TopicProminenceFilter.tsx` | Client. `<select>` that pushes `?prominence_topic=…`. Drives the topic-scoped Prominence table. |
| `TopicPositionFilter.tsx` | Client. Same pattern, pushes `?position_topic=…`. Drives the topic-scoped Answer Position histogram + Avg Rank callout. |

**Deleted**: `TopicTrends.tsx` (per-topic trend lines, replaced
by the consolidated Topic Visibility section's per-topic lists).

### URL state surface

The Visibility page now reads four independent query params:

```
?compare=<competitor name>          → Compare card under hero
?prominence_topic=<topic label>     → Scopes the Prominence table
?position_topic=<topic label>       → Scopes the Answer Position histogram
?competitive_tab=co-mentions|ownership   → Switches Competitive section tab
                                       (omitted = "overview" default)
```

All pushed via `router.replace(...){ scroll: false }` so changing
a filter doesn't yank the page to the top. Hub remains
bookmarkable; the page itself is server-rendered.

### Overview page (`web/app/subjects/[id]/page.tsx`)

`TrajectoryStrip` (the "Visibility Trends" section with three
mini-cards for AI Mention Rate / Average Tone / Citation Rate)
was promoted from the bottom of the page to right under the
hero. Its `SectionTitle.right` slot now carries an
**"Open Visibility deep-dive →"** button linking to
`/subjects/${subjectId}/visibility`. Reading flow now goes:
hero → trends → deeper sections.

### Misc bug fixes shipped in the same commit

- **Clerk `<UserButton>` hydration mismatch** (`Header.tsx`):
  imported via `next/dynamic(..., { ssr: false })` so the
  server emits an empty slot and the client mounts the button
  after hydration — eliminates the `data-clerk-component=UserButton`
  div diff that triggered the warning.
- **Recharts `width(-1)/height(-1)` warnings** (`TrendOverTime.tsx`
  and `CompetitiveScatter.tsx`): `ResponsiveContainer` now
  uses `height={N}` (numeric, e.g., 260) + `minWidth={1}` instead
  of `height="100%"`, so it doesn't depend on parent measurement
  at first mount.
- **CompetitorBarsFromData SoV axis** (`Charts.tsx`): added
  `tickFormatter={(v) => `${Math.round(v * 100)}%`}` — the bars
  use 0..1 share data but the `unit="%"` prop was just appending
  "%" to the raw decimals (".25%", ".5%"). Domain pinned to
  `[0, 1]` so the chart always shows the full pie.

### Behavior changes that may affect external callers

The `rank_distribution` field on `SubjectOverview` is **no
longer an array**. It's `{total_responses, n_mentioned, buckets:
[...]}`. Anything consuming `data.rank_distribution.map(...)`
will throw. Migrate to `data.rank_distribution.buckets.map(...)`.

If uvicorn `--reload` fails to pick up new fields on a
`SubjectOverview` shape change, kill and restart — `--reload`
sometimes caches module-level imports across reloads in this
codebase. Both this stretch and the prior big push (e164e61)
hit this; the live API only served the new fields after a
hard restart.

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

3. **Frontend drill-down pages (Phase D)** — the customer-facing
   findings UI. Today customers can trigger a refresh but have
   nowhere in the product to see what was found.

   **Resolved IA decisions** (2026-05-12, product input received):
   - **Hub-and-spokes**, not tabs. Each section is its own page with
     its own URL, its own layout, and its own data shape.
   - **Distinct URLs per spoke** (`/subjects/[id]/[section]`). The
     shareable-link workflow ("comms director DMs the Competition
     view to their CEO") is the deciding factor; tabs would force the
     recipient to click into the right tab themselves.
   - **Persistent shell** via Next.js App Router layout:
     `web/app/subjects/[id]/layout.tsx` holds the sidebar (section
     nav) and top bar (subject picker, date-range filter, Export,
     Generate Report). Each spoke is a `page.tsx`. Switching
     sections re-renders only the content area — feels tab-like to
     the user even though the URL changes.
   - **Refresh-as-filter, not refresh-as-page.** Top-bar date-range
     filter scopes every section to a window. `/subjects/[id]/refresh/[id]`
     can exist as a secondary view for power users who want to
     compare specific historical snapshots, but it isn't primary nav.
   - **Filter state in URL query strings** (e.g., `?range=30d`) so
     filters survive section switches and are deep-linkable.

   **Planned sidebar sections** (subject to refinement based on
   "which sections actually have data"):
   - Overview, Narrative, Visibility, Competition, Topics, Sources,
     Prompts, Reports, Settings. **Asymmetry** placement is open —
     could be its own section or folded into Narrative/Visibility.

   **Approximate file layout for the build:**
   ```
   web/app/subjects/[id]/
   ├── layout.tsx              ← persistent sidebar + top bar
   ├── page.tsx                ← Overview (currently the subject page)
   ├── narrative/page.tsx
   ├── visibility/page.tsx
   ├── competition/page.tsx
   ├── topics/page.tsx
   ├── sources/page.tsx
   ├── prompts/page.tsx
   ├── reports/page.tsx
   └── settings/page.tsx
   ```

   **Still open / pending product input:**
   - **Overview page content.** What goes in the headline summary,
     KPI tiles, "Key insights" cards. Customer to follow up with
     details. Mockup reviewed 2026-05-12 had a strong shape:
     bottom-line callout + 3 KPI tiles + dominant-narrative
     side card + "what stands out this period" cards.
   - **Per-response drill-down.** Whether to keep, hide behind a
     "raw responses" toggle, or cut. Defer to during-build decision.
   - **Sub-tabs within a spoke** (e.g., Sources broken into "by
     category" / "by domain") — defer to during-build per-section.
   - **Streamlit dashboard.** Stays alive as the operator surface
     (not migrated to `web/`). Two surfaces, two audiences.

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

**Historical retrospective methodology — shipped this session (2026-05-12):**
- The customer wants weekly trajectory data for each prompt. Real
  trajectories take weeks to accumulate via scheduled forward
  refreshes (Phase B-2, still pending). To cold-start the trajectory
  views, we now also support **retrospective historical refreshes**
  — a parametric+date-filtered alternate methodology.
- **Methodology** (validated via 3 rounds of Phase 0 testing):
  - Grounding stays **ON**. Pure parametric had a cutoff-drift problem
    — for target dates past the model's training cutoff, the
    "retrospective" answer is really "cutoff knowledge with a date
    sticker." So grounding is on, and the model is instructed to
    constrain its search queries with the `before:{as_of_date}`
    operator. Phase 0 round 3 confirmed both gpt-5-mini and
    gemini-2.5-flash emit `before:YYYY-MM-DD` on **every** search
    query they issue when this prefix is in place.
  - **Generated prompts skipped** (`type='generated'`). They depend
    on `recent_news` which is live-fetched at refresh time; there's
    no honest retrospective analog. Historical refreshes run only
    the 6 fixed prompts per category (per person × 2 models = 12
    queries vs the live 20).
  - **Same templates, same models, same setup_inputs** — only the
    rendered prompt is wrapped with the retrospective prefix.
    Downstream methodology comparisons stay valid because the
    prompt_id and prompt_version are unchanged.
- Migration `007_refresh_runs_historical.sql` adds two columns to
  `refresh_runs`: `is_historical_estimate BOOLEAN NOT NULL DEFAULT
  FALSE` and `historical_as_of DATE`. A CHECK constraint enforces
  `(is_historical → as_of NOT NULL)`. Partial index on
  `(subject_id, historical_as_of DESC) WHERE is_historical = TRUE`
  for trajectory queries.
- `app/query_engine.py` exposes `historical_as_of` param on
  `run_refresh`. New helper `_retrospective_prefix(date)` produces the
  v1 prefix verbatim from Phase 0 round 3. Constant
  `HISTORICAL_PROMPT_PREFIX_VERSION = "v1"` is stamped on each
  `response_metadata.historical_prompt_prefix_version` for audit.
- `app/refresh.py` CLI: `--historical-as-of YYYY-MM-DD`. Refuses to
  create new subjects in historical mode (subject must exist).
  Skips the `_ensure_setup_inputs_complete` interactive prompt and
  `_ensure_recent_news_fresh` (recent_news is unused — generated
  prompts are skipped).
- **Live data state:** 12 weekly historical refreshes seeded for
  Barack Obama (subject 13) — refresh_runs **24–35** spanning
  **2026-02-17 → 2026-05-05** at 7-day intervals. All 12/12
  successful. Per-response analysis run on all 12 (analysis_run
  103–114, full 6-extractor stack). Total cost ~$1.04 ($0.54
  refreshes + $0.50 analysis).
- **Audit guarantees:**
  - `refresh_runs.is_historical_estimate = TRUE` + `historical_as_of`
    set on every historical refresh row.
  - `model_responses.response_metadata` carries `historical_as_of` +
    `historical_prompt_prefix_version` on every historical row.
  - `model_responses.response_metadata.search_queries` shows the
    actual `before:YYYY-MM-DD` operators the model emitted (verified
    100% compliance on the validation refresh).
  - `model_responses.rendered_prompt` stores the full prefixed
    prompt the model received — complete reproducibility.
- **Data quality (Obama trajectory):**
  - Sentiment shows real model difference: Gemini avg 0.27, ChatGPT
    avg 0.07 across the 12 weeks. Both models mildly positive on
    Obama with criticism severity ~0.18.
  - Citation rate (obama.org appearance in responses) ramps from 0%
    at the oldest week to 17-25% at recent weeks — plausible
    trajectory.
  - No collapse to noise; week-over-week variation is real and
    coherent.
- **Deferred to Phase D:**
  - Cross-analyzer NOT run on historical refreshes —
    `NarrativeDriftAnalyzer` would pick a live refresh as the "prior"
    and produce a methodology-change comparison rather than a
    narrative-change comparison. The fix (filter
    `_find_prior_refresh` by `is_historical_estimate` matching) is
    small but properly belongs with the dashboard work.
  - UI labels and visual differentiation for historical vs live in
    trajectory views.
  - 7 seed-subject backfills — Obama is the customer-visible subject
    and is enough to validate Phase D. Seed subjects can be backfilled
    later (~$8 for the lot).
- **Worker support not yet wired** — historical refreshes today are
  triggered only via the CLI. The `jobs` table's `kind` column still
  only accepts `'refresh'`. Adding `'historical_refresh'` (or
  extending refresh with an `as_of_date` payload field) is a follow-
  up for when scheduled retrospective refreshes are wanted from the
  worker.

**Phase B hardening — shipped this session (2026-05-12):**
- Migration `006_subjects_unique_org_name.sql` adds a partial unique
  index `(org_id, name) WHERE org_id IS NOT NULL` on `subjects`. The
  SELECT-then-INSERT in `dashboard.lib.queries.create_subject` already
  rejected duplicates at the application layer, but two simultaneous
  POSTs could both pass the SELECT and both INSERT. The new index
  catches that race; `create_subject` now also catches
  `psycopg.errors.UniqueViolation` and converts it to the same
  `ValueError` the application-layer check produces, so the API
  surfaces a clean 400 in both paths.
- `app/worker.py` no longer holds one psycopg connection across a
  full refresh chain (which sat idle for 60+ seconds and would be
  reaped by Neon/RDS-style idle-conn timeouts). Each of
  `_claim_next_job`, `_mark_succeeded`, `_mark_failed`, and
  `_lookup_subject_name` opens its own short-lived connection. The
  outer try/except in `_main` also guards `_claim_next_job`'s DB
  errors so a brief Postgres blip doesn't crash the worker — it just
  sleeps and retries.
- `POST /api/subjects/{id}/refresh` is now rate-limited two ways:
  - **Per subject:** 1 enqueue per 5 minutes
    (`_REFRESH_PER_SUBJECT_COOLDOWN_MINUTES`). Returns 429 with a
    Retry-After header and a human-readable wait time.
  - **Per org:** 20 enqueues per rolling hour
    (`_REFRESH_PER_ORG_HOURLY_LIMIT`). Returns 429 with
    Retry-After: 3600.
  Failed jobs don't count toward either quota (so a customer whose
  first attempt errors can immediately retry). Both limits are
  constants at the top of `subjects.py` — easy to tune.

**Hero refactor + briefing polish — shipped this session (2026-05-14 / 2026-05-15):**

A long polish-and-restructure pass on the Overview page. The thesis
shift: stop showing three "everything is fine" KPIs (AI Mention Rate,
Average Tone, Risk Frame Rate) and instead lead with the **per-topic
recall gap** — the actionable signal that AI underweights certain
topics for a subject. Plus a credibility fix for Risk Frame Rate
naming, layout consolidation, and a host of smaller UI polish.

*Hero metric row — replaced Risk Frame Rate tile with Weakest Topic Recall:*
- Tile shows lowest topic-level mention rate in the snapshot, with the
  topic name as a subtitle below the value. Low-N badge ("LOW N" small
  warning chip) when `n_responses < 5` for the weakest topic.
- Color follows the same `getKpiValueColor("mention_rate", …)` ladder
  as AI Mention Rate (≥50% green, <20% orange).
- Delta line currently shows "No prior snapshot available" — per-topic
  historical data isn't in the API yet (see follow-ups below).
- Risk Frame Rate is dropped from the hero entirely. The
  `risk_frame_rate` field still ships in the API response and feeds
  the renamed UI elsewhere.

*New Topic Recall section between hero and Strategic Takeaways:*
- `TopicRecallChart` component — horizontal bar list, sorted strongest
  → weakest by mention rate. Lowest bar uses `bg-warning/70`; others
  `bg-primary/70`.
- One row per `data.topic_coverage[i]` with non-null `ai_recall`. Topic
  name (with `capitalizeFirst` applied), bar, percentage. Hover title
  on the topic label shows response count for transparency. The
  visual "LOW N" badge that briefly lived on each row was removed —
  reads cleaner without it; the data is still in the title attribute.

*Bottom Line refactored to lead with the gap:*
- New helper `buildGapBottomLine(subjectName, topics)` synthesizes the
  bottom line from `topic_coverage` instead of using the
  server-polished `data.bottom_line`. Falls back to the server text
  when fewer than 2 topics have non-null recall, or when all topics
  tie at the same rate.
- Template chosen by topic count:
  - 2 topics: `"AI underweights {subject} on {weakest} — {X}% mention rate vs {Y}% on {other_topic}."`
  - 3+ topics: `"AI underweights {subject} on {weakest} — {X}% mention rate vs {Y}% average across {N} other tracked topics."` (mean-of-others framing avoids thematic mismatches that picking a single "strongest" comparator was producing.)
- Per-topic phrasing uses the raw topic label as-is (no separate
  `display_phrase` field added — labels are already human-readable).
- `findStrongestTopic` is now an unused helper (orphaned by the
  comparator switch); leaving it for now in case a later tile needs it.

*Risk Frame Rate → "Unprompted Criticism Rate" (credibility fix):*
- The user flagged a real credibility issue: Rubio's snapshot showed
  Risk Frame Rate = 0% while the Evidence section had a damning
  drone-strikes / civilian-casualties / due-process quote attributed
  to ChatGPT. Investigation confirmed the methodology was technically
  correct (named-layer "what are the criticisms of X?" prompts are
  excluded from the metric — they would mechanically inflate it), but
  **the label oversold what the metric measured**.
- **Renamed** in two places: the Hero KPI tile (no longer in hero
  after subsequent refactor) and the Visibility Trends sparkline
  title. Backend field name (`risk_frame_rate`) unchanged to avoid
  breaking the API and SQL columns.
- **Tooltip rewritten** to make the exclusion explicit and pre-empt
  the contradiction: *"Share of AI answers about this subject's topic
  areas where the AI volunteered a critical framing (criticism severity
  > 0.5) without being asked. Responses to prompts that explicitly ask
  about criticism are excluded — counting them would mechanically reflect
  those prompts rather than AI's own framing. Quotes in the Evidence
  section below may include responses to direct criticism prompts;
  those don't count toward this metric."*
- **Added "SOLICITED PROMPT" eyebrow tag** to Evidence cards from the
  named layer (only). Small uppercase muted-foreground tag above the
  prompt text, with a hover title that explicitly cites the
  Unprompted Criticism Rate exclusion. Closes the visual loop:
  reader sees a damning quote + "Solicited prompt" tag, immediately
  understands why both can be true.
- Subsequent Hero refactor moved Risk Frame Rate out of the headline
  tiles entirely (replaced by Weakest Topic Recall), but the renamed
  metric still appears in `TrajectoryStrip` initially — then was also
  swapped out (see Citation Rate trajectory below).

*Visibility Trends — Citation Rate replaces Unprompted Criticism Rate:*
- Backend `_kpis_per_refresh_bulk` now computes 4 metrics instead of
  3 (added `citation_rate` via a third grouped query mirroring
  `_compute_kpis_for_refresh`'s singular version).
- `_trajectory_for_subject` returns `citation_rate: (number | null)[]`.
- `_empty_overview` populated with `citation_rate: []`.
- Frontend type `SubjectOverview["trajectory"]` extended.
- TrajectoryStrip third tile swapped to "Citation Rate"
  (`formatPct`). For subjects without a `canonical_url` configured,
  every snapshot returns `null` and the chart shows "Need more
  snapshots for a trend line".

*Visibility Trends conditional render:*
- Section is now hidden completely when fewer than 2 snapshots exist
  (was previously rendering a placeholder card with "trend will
  appear after the next snapshot"). The Snapshot History section
  below still communicates the snapshot count, so a missing Trends
  section here doesn't leave the user confused.
- When exactly 2 snapshots: section renders with description "Early
  trend — based on 2 snapshots. Open circles are retrospective
  estimates; filled circles are live snapshots."

*MiniSpark sparkline got a subtle Y-axis:*
- Min/max value labels rendered as **HTML overlays** (not SVG
  `<text>`) so they stay crisp and don't distort under the SVG's
  `preserveAspectRatio="none"` stretching.
- Two faint dashed gridlines at top/bottom of the plot area (`stroke-dasharray="2 3"`, `opacity={0.5}`).
- New `format` prop on `MiniSpark` so axis labels render in the
  metric's natural units (`75%` not `0.75`, `+12% positive` not
  `0.12`).
- Chart height bumped 60px → 120px so the line has vertical room to
  breathe; circle markers slightly enlarged (r=2 → 2.5, stroke
  1.2 → 1.4).

*KPI tile color logic — `getKpiValueColor`:*
- Replaced the always-orange `risk: true` flag (which painted Risk
  Frame Rate orange even at 0%) with per-metric thresholds:
  - `mention_rate` (higher = better): ≥50% success, <20% warning, else foreground
  - `avg_tone`: > +0.5% success, < -0.5% warning, else foreground
    (mirrors `formatTonePct`'s positive/negative/neutral labeling so
    the color matches the text — prior ±20% threshold left mild
    negatives like −13% reading as neutral-black while the change
    indicator already showed warning orange)
  - `risk_frame_rate`: ≤5% success, >20% warning, else foreground
- Restraint preserved — values stay neutral inside a wide middle
  band so colors don't overfire on noise.

*KpiTooltipIcon — added `align` prop to fix viewport clipping:*
- Tooltip used to center on the icon (`left-1/2 -translate-x-1/2`).
  For icons sitting at the right edge of a card (Hero KPI tooltips,
  Competitive Snapshot "First Mention" header), the tooltip extended
  ~112px past the icon and clipped past the viewport edge.
- New `align: "left" | "center" | "right"` prop. Right-aligned for
  all three Hero KPI tiles and the Competitive Snapshot "First
  Mention" header. Left/center variants stay available for callers
  that need them.

*Coverage section reframed as Analysis Scope (multi-step polish):*
- Eyebrow "Coverage" → "Analysis Scope".
- Title "What was included in this analysis" → "What this snapshot includes".
- Description added: "The topics, platforms, and caveats behind this AI narrative snapshot."
- Inner column headers: "By topic" → "Topics covered", "By AI platform" → "Platforms included".
- Subcolumn labels: "Share" → "Share of prompts", "Mention" → "Mention rate".
- Caveat copy rewritten to user-friendly: "Mention rate is measured
  only on prompts where the subject could reasonably appear. Prompts
  where the subject was not a valid answer are excluded. N/A means a
  platform was not included in this snapshot."
- **Layout fix**: switched the topics table from per-row independent
  CSS grids (which auto-sized columns to each row's content — header
  text vs. data values produced misalignment) to a **single grid
  container** with explicit fixed column widths
  `[1fr_132px_104px_64px]`. Header cells and data cells now share
  the same column dimensions, so headers sit directly above their
  data. Bottom border under the empty bar-column header was removed
  so the underline doesn't visually extend past "Mention rate" into
  the sparkline column.
- Row padding bumped `py-2.5` → `py-3` for breathing room.
- `Fragment` import added for the single-grid wrapping.

*Topic capitalization helper:*
- New `capitalizeFirst(s)` helper — uppercases the leading character
  only, preserves embedded acronyms ("US", "UK", etc.). Applied to
  topic labels at three standalone display points: Topic Recall
  chart row labels, Weakest Topic Recall tile subtitle, Analysis
  Scope topics table. Bottom Line template intentionally untouched
  (mid-sentence usage; "Post-presidency political influence" reads
  wrong as a proper noun mid-sentence).
- Underlying DB labels remain inconsistent (some sentence-cased,
  some lowercase). If the backend later canonicalizes labels at
  write time, these display-layer calls become no-ops — safe to
  leave.

*Strategic Takeaways — Recommended Action callout added then removed:*
- Briefly added a "Recommended Action" callout above the insight
  cards (sourced from `data.recommended_focus`, reframed via the
  eyebrow as imperative).
- User reverted: the same text was already rendering in the Hero's
  "Recommended Focus" block above, so the callout duplicated content
  on the same page.
- Section condition reverted to `strategic_takeaways.length > 0`.

*Header consolidation — removed global Clerk auth band:*
- Previously: thin global header in `app/layout.tsx` rendered just
  the `<UserButton>` at the top edge of every page.
- Now: that band is gone. `<ClerkProvider>` still wraps the app for
  auth state. The dashboard `Header.tsx` renders `<UserButton>`
  inline on the right side after the Take snapshot button (wrapped
  in `<span suppressHydrationWarning>` to silence Clerk's portal-
  mount mismatch).
- Net effect: ~50px less wasted vertical space at the top of every
  dashboard page. Only one chrome row instead of two.
- **Side effect**: pages that don't use the dashboard `Header`
  (landing `/`, `/subjects/new`) lose the visible UserButton.
  Auth still works (cookies + middleware); avatar UI just isn't
  shown. If you want it back on those pages, add inline UserButton
  per page.

*Snapshot button (`refresh-button.tsx`) styling fix:*
- Was wrapped in `flex flex-col items-end gap-2` with a "job #N → snapshot N"
  caption and any error text rendering as `<p>` siblings BELOW the
  button. When dropped into the Header's horizontal row, the caption
  pushed the row taller than `h-16` and visually broke out of the
  chrome row.
- Now: returns just the `<button>` directly. Job ID + error info
  surface via a `title=` tooltip on the button instead. Restyled to
  match the chrome (`border border-primary bg-primary text-primary-foreground px-3 py-1.5`,
  matching the height/padding rhythm of Export PNG and the subject
  picker).
- Pulsing dot indicator (`bg-primary-foreground/80 animate-pulse`)
  appears on the left of the label when `inFlight` so the user has
  a visual heartbeat during long snapshots.

*Sources Wikipedia merging:*
- Reported issue: `wikipedia.org` and `en.wikipedia.org` showed as
  separate entries in the Sources Shaping AI Answers section.
- New `_canonical_domain(domain)` helper in `dashboard/lib/queries.py`
  collapses subdomain variants:
  - `*.wikipedia.org` → `wikipedia.org`
  - `*.wikimedia.org` → `wikimedia.org`
- Other multi-subdomain sites (BBC, YouTube, etc.) intentionally NOT
  collapsed by default — generic public-suffix-aware merging would
  flatten distinctions that may matter (`news.bbc.co.uk` vs `bbc.com`).
  Extend the helper as more cases come up.
- `_top_sources_for_refresh` rewrite:
  - **Removed the SQL `LIMIT`** so subdomains that fall below the
    cutoff individually still contribute to the merged total. Previously,
    `wikipedia.org` at rank 8 with 2 citations would have been dropped
    before merge and the total miscounted.
  - Merge sums `n_citations` per canonical domain; takes
    `source_type` from the highest-citation variant (most
    representative classification).
  - Re-rank by aggregated count, take top `limit`, recompute the
    0–100 influence score against the new max.
- **No frontend change needed** — `data.sources[i].name` just
  contains `wikipedia.org` instead of two separate strings. Sources
  list, By-category stacked bar, and (any remaining) donut all
  benefit immediately on next page render. No DB migration; the
  collapse is read-time.

*Dominant Narrative — top 4 cap:*
- Capped clusters at the top 4 by share (was previously up to 5 for
  some subjects). Keeps the panel visually balanced with the hero's
  KPI strip below.

*Worker stale-process bug + Marco Rubio empty-Dominant-Narrative fix:*
- Root cause: worker process (PID 56826) was started **Tue May 12 10:41 AM**,
  ~27 hours BEFORE `NarrativeClusterAnalyzer` was added to
  `cross_analyzer.py` (Wed May 13 13:48). Python caches imported
  modules in `sys.modules`; the long-running worker kept executing
  the stale snapshot of `worker.py` that lacked the new analyzer in
  its registration list.
- Symptom: Rubio's last two snapshots (refreshes 38 and 40) had 4 of
  5 cross-analyzer outputs in `refresh_analyses` (`asymmetry`,
  `top_quotes`, `share_of_voice`, `narrative_drift`) but
  **`narrative_clusters` was missing** — so the dashboard's empty
  guard fired and the right-side panel showed the placeholder.
- **Fix**:
  1. `pkill -f "python -m app.worker"` — killed PID 56826.
  2. `nohup .venv/bin/python -m app.worker > /tmp/byline-worker.log 2>&1 &` — restarted with fresh code.
  3. `python -m app.cross_analyzer 40` — backfilled Rubio's
     refresh 40 (created `analysis_run_id=144` with all 5 analyzer
     outputs including `narrative_clusters`). Dashboard's
     `ORDER BY ar.id DESC LIMIT 1` picks the new run automatically.
- **Lesson**: any time `worker.py` (or anything it imports) gets a
  new analyzer or extractor added, restart the worker. Long-lived
  Python processes don't auto-pick up code changes even though
  `--reload` would for the API.
- Worker is now running detached via `nohup`; survives the shell
  session but won't auto-restart on machine reboot. If there's a
  launchd / supervisor config that previously brought it up,
  consider re-wiring it.

*Cleanup notes (orphaned helpers, intentionally not deleted):*
- `formatTopicScope` (page.tsx ~line 107) — unused after the AI
  Mention Rate subtitle was dropped earlier in the session.
- `findStrongestTopic` — unused after Bottom Line comparator
  switched from "vs strongest" to "vs mean of others".
- `topicScope?` prop signature gone from HeroKpis.
- Both helpers are pure, ~10-line, type-safe functions. Leaving them
  for now in case a later tile/chart wants them; safe to delete in a
  cleanup pass if you'd like a tighter file.

*Follow-ups created by this session's work:*
- **Per-topic trajectory** (backend): `topic_coverage` rows have no
  `prev_ai_recall` field, so the Weakest Topic Recall tile shows "No
  prior snapshot available" on its delta line. Smallest fix:
  in `_topic_coverage_for_refresh` (or via a new
  `_topic_coverage_per_refresh_bulk`), look up the prior refresh's
  per-topic recall and attach as `prev_ai_recall`. Frontend will
  surface it via the existing `getKpiChangeDisplay` path with no
  rendering changes.
- **Citation Rate gap for subjects without `canonical_url`**: the
  trajectory chart shows the "need more snapshots" placeholder for
  subjects whose canonical URL isn't configured. Either prompt for
  it during subject creation, or fall back to a different third
  trajectory metric for those subjects.
- **Topic label canonicalization** (backend): `_compute_strategic_takeaways`
  / `_topic_for_prompt` could lowercase or sentence-case topic
  labels at write/read time so the frontend `capitalizeFirst` calls
  become unnecessary.
- **Stuck-job reaper**: still on the older list below; not addressed.
- **`buildGapBottomLine` returns null** when all topics tie. For
  Obama specifically, his last ~10 refreshes all show 100% across
  all 3 tracked topics, so the templated bottom line renders nothing
  and the page falls back to the server-polished version (which for
  recent refreshes hasn't been recomputed, leaving the polish cache
  empty). Worth investigating whether the polish step is being
  skipped or whether the server text needs a re-render trigger.

**Recommended Actions LLM refactor + KPI-card layout pass — shipped this session (2026-05-15, continued):**

*Recommended Focus → Recommended Actions (full LLM rewrite):*
- The old `Recommended Focus` rule-based output was abstract consultant
  speak ("Connect post-presidency political influence messaging to
  Barack Obama's established identity..."). Replaced with a per-snapshot
  LLM call that produces 1 primary + 2 secondary concrete, executable
  recommendations.
- New backend in `dashboard/lib/queries.py`:
  - `_compute_recommended_actions()` — orchestrator. Builds payload,
    checks cache, calls Gemini 2.5 Pro with `thinking_budget=2048`,
    validates grounding, retries once with stricter follow-up on
    failure, falls back to subject-agnostic copy if still failing.
  - `_build_recommended_actions_payload()` — assembles structured
    input from existing snapshot fields. **No new schema** beyond
    adding `n_mentioned` to `topic_coverage` rows so the payload can
    show exact "2/4"-style raw fractions on the weakest topic.
  - `_validate_actions_grounding()` — for each of the 3 action
    sentences, substring-matches against valid entities (source
    domains, topic names, dominant narrative cluster name). Catches
    hallucinated sources / generic advice that ducked the
    named-entity requirement.
  - `_shape_actions()` — coerces parsed JSON to the expected shape
    (1 primary + exactly 2 secondary, all four label+action strings
    non-empty); rejects malformed responses.
  - `_recommended_actions_cache_read/write()` — DELETE-then-INSERT
    pattern in `refresh_analyses` keyed on
    `(refresh_run_id, payload-shape)`. Mismatch on payload contents
    auto-busts cache so a new snapshot or schema change forces
    regeneration.
  - `invalidate_recommended_actions_cache()` — public API used by
    the Regenerate button.
  - `_FALLBACK_RECOMMENDED_ACTIONS` — subject-agnostic default with a
    `warning` field surfaced quietly in the UI.
- Cache type: `recommended_actions_v2` (was `_v1` before the
  role-grounding fix below). Bump to invalidate all cached rows.

*Role-grounding fix (Rubio "edit Wikipedia about his legislative work"
hallucination):*
- Reported issue: a recommendation for Marco Rubio said "Edit the
  Marco Rubio page on wikipedia.org to include his recent legislative
  work and statements on domestic 'Current events'" — Rubio is no
  longer a senator and has been Secretary of State for >1 year. The
  LLM defaulted to "US Senator" prior because we sent zero current-
  role context.
- Three coordinated fixes (A + B + C):
  - **A — pass subject context into the payload**: `current_role`,
    `audience`, and a 500-char-truncated `recent_news` from
    `subjects.setup_inputs`. For Rubio, this means the LLM sees
    `current_role: "US Secretary of State"` and a paragraph about
    his immigration declaration / House testimony / drug-trafficker
    actions, instead of inferring a stale role from the metric data
    alone.
  - **B — filter "Current events" from topics**: the
    `_RECENT_NEWS_LABEL` bucket (sourced from `recent_news` prompts)
    is now excluded from the topics passed to the LLM. It's an
    internal mechanism for testing visibility on whatever's in the
    news that week, not a substantive topic area to recommend on.
    The Topic Recall chart in the UI still surfaces it.
  - **C — prompt rules**: new "CRITICAL — grounding in subject's
    actual context" section in the system prompt instructing the
    model to treat `current_role` and `recent_news` as
    authoritative, never rely on training-data prior, reject
    operational/methodological topic names as recommendation
    targets.
- **Important caveat**: this fix is data-dependent. If a subject's
  `setup_inputs.role` falls out of date and nobody updates the row,
  the LLM will faithfully follow the stale data. The next layer
  (deferred) is either a recent-news-driven role-staleness check
  or enabling Gemini's grounded-search tool.

*New FastAPI endpoint + Regenerate button:*
- `POST /api/subjects/{id}/recommended-actions/regenerate` in
  `app/api/routes/subjects.py` — org-scoped, looks up the latest
  `refresh_run_id` for the subject, calls
  `invalidate_recommended_actions_cache()`, returns 204.
- New `apiPostNoContent()` helper in `web/lib/api.ts` for 204
  responses (the existing `apiPost` always tried to parse a JSON
  body).
- `regenerateRecommendedActionsAction()` server action in
  `web/app/subjects/[id]/actions.ts` — calls the endpoint, then
  `revalidatePath()`s the subject page, returns discriminated
  `{ok}` result so the client can surface errors inline.
- New client component `web/app/subjects/[id]/recommended-actions.tsx`
  (`RecommendedActionsBlock`) — header with "Regenerate" link
  (spinning icon during pending), optional warning banner when the
  fallback fired, primary block in the same prominent slot as the
  old Recommended Focus, 2-column secondary grid below.

*KPI card layout — multi-iteration polish:*
- **Added Citation Rate as 4th KPI tile** (alongside AI Mention Rate,
  Average Tone, Weakest Topic Recall). Grid bumped from
  `grid-cols-3` to `grid-cols-2 md:grid-cols-4`. New `citation_rate`
  kind in `getKpiValueColor` with a softer ladder than mention_rate
  (≥20% green, 0%<v<5% warning, 0% neutral) — citation-rate values
  are typically lower than mention-rate values in absolute terms.
- **Tile structure refactor** — went through three iterations based
  on user feedback:
  - First: added parenthetical definition inline next to each label
    (`AI Mention Rate (unprompted mentions)`).
  - Second: moved definition to its own line below the label
    (truncation issue with the inline parens).
  - Final: **dropped the official metric name from the visible
    label entirely**; the plain-English definition IS the title now
    (e.g., title is "Unprompted mentions"; "AI Mention Rate" lives
    in the tooltip's leading clause for technical readers).
- **Card spacing consistency fix**: values were sitting at different
  vertical positions across cards because the Weakest Topic Recall
  tile has a subtitle (the topic name) and the others don't. Fixed
  by:
  - Stacking value + change indicator vertically (each on own
    line) so the value never wraps even with a long change string.
  - Reserving subtitle slot in every tile (`min-h-[14px]` empty div
    when no subtitle present) so all four cards have identical
    bottom-stack height.
  - Compacting change-indicator text: "Down 10 pts from previous
    snapshot" → "↓ 10 pts vs prior". Direction conveyed by icon +
    color, not the words.
  - Min card height: 92 → 140px to accommodate the new vertical
    stack.
- **`formatTonePct` gained an `includeDirection=true` default**
  parameter. Hero KPI tile passes `false` (just "−13%" — title
  "Positive vs negative" + color + sign convey direction, descriptor
  word would force wrap). Trajectory chart keeps the descriptor
  ("−13% negative") since it has more room.
- **Removed `LOW N` badge entirely** — the 3-character-prompt-count
  warning chip was on the Weakest Topic Recall hero tile (and
  briefly on Topic Recall chart bars). Per user direction: "low n
  should not appear anywhere in the dashboard." Removed the field
  from the tile config, the badge JSX, and stale comments. The
  underlying `n_responses` data is preserved in tile and chart row
  hover tooltips for users who want it.

*Weakest Topic Recall color ladder — never goes green:*
- Added `weakest_topic_recall` kind to `getKpiValueColor`. Previously
  used the same `mention_rate` ladder which painted 50% green; the
  user flagged this as undercutting the "this is the gap to address"
  framing of the tile.
- New ladder: <30% warning, otherwise foreground. Never success.
  The whole tile is "this is your worst topic"; celebrating the
  worst with green undermines the headline.

*Bottom Line refinements:*
- "recall" → "mention rate" in the templated phrase ("...50% mention
  rate vs 100% on Current events"). Matches the language used
  everywhere else on the page.
- **Comparator switched** from "vs strongest single topic" to
  "vs mean of N other tracked topics". Strongest-single produced
  thematically off juxtapositions (Obama: "post-presidency political
  influence vs Current events"). Mean-of-others reads as a sober
  gap measurement and avoids picking a curated comparator.
  - 2-topic case still compares directly to the single other topic
    by name.
  - Ties between weakest and all others → return null → server
    bottom_line fallback.
- `findStrongestTopic` is now an unused helper (orphaned by the
  comparator switch). Left in place; safe to delete.

*Schema additions (frontend types):*
- `topic_coverage[i].n_mentioned` (number) — for "2/4" raw
  fractions in the LLM payload.
- `recommended_actions: { primary, secondary, warning? }` on
  `SubjectOverview` — fully typed, replaces the old
  `recommended_focus` rendering path.
- `trajectory.citation_rate: (number | null)[]` — for the third
  Visibility Trends sparkline.

*Cleanup notes:*
- `formatTopicScope` still orphaned (since the AI Mention Rate
  subtitle was dropped earlier in the session).
- `findStrongestTopic` orphaned (since comparator switched).
- Both are short, type-safe pure functions; safe to delete in a
  cleanup pass when scope allows.

*Cost / latency notes for the new LLM call:*
- ~$0.05/snapshot at Gemini 2.5 Pro pricing with 2K thinking tokens.
- One-time cost per snapshot; cached afterwards.
- Latency ~5–15s on cold call (page renders synchronously while
  waiting). Acceptable today since each snapshot only triggers it
  once. If snapshots scale up, consider:
  - Moving the call into the worker (precompute when refresh
    completes, not at page render).
  - Streaming the response into the page if Gemini SDK supports it
    well enough.

*Validation behavior:*
- First LLM call, then validate. If shape OK + every action references
  a valid entity (substring match) → cache and return.
- If validation fails, retry once with stricter follow-up: "Your
  previous response did not reference any specific entity from the
  input data. Every action MUST mention a specific source domain,
  topic name, or narrative cluster name from the payload above, by
  name. Try again."
- If still failing → return `_FALLBACK_RECOMMENDED_ACTIONS` with a
  `warning` field. UI shows a small warning banner above the
  recommendations.

*Follow-ups created by this session's work:*
- **Per-topic delta backend** (still pending from earlier session):
  Weakest Topic Recall tile shows "no prior data" until
  `prev_ai_recall` is added to `topic_coverage` rows.
- **Role-staleness detection**: when `setup_inputs.role` is older
  than `recent_news_fetched_at` by some threshold, surface a
  "review subject metadata" prompt so the LLM doesn't faithfully
  follow stale role context.
- **Gemini grounded search** (Option E from the role-grounding
  menu): would let the LLM verify real-world facts at call time.
  ~2× cost, +2–5s latency. Deferred unless A+B+C produces
  visible factual errors.
- **Cache warming via worker**: precompute recommendations when a
  refresh job completes so first page load doesn't pay the LLM
  latency cost. Easy follow-up.
- **Recommended Action regeneration cooldown**: the Regenerate
  button currently has no rate limit. If a user spam-clicks it, it
  will spam the LLM. Add a per-subject cooldown similar to the
  refresh button.

**Full project QA pass + remediation — shipped this session (2026-05-16):**

A structured audit across the whole Recommended Actions pipeline +
recent UI changes (Hero KPIs, TopicRecallChart, Visibility Trends,
Sources donut). Audit performed via parallel subagents covering
backend edge cases and frontend rendering edge cases, plus direct DB
inspection of subject diversity. Audit found 1 high-severity + 4
medium-severity + 4 low-severity items plus an unnumbered float-
equality issue. All 10 issues are now closed across 7 commits.

*Commit chain (oldest → newest):*

1. **`f77a8c1`** — Dashboard polish bundle + first batch of runtime
   safety fixes (Sources donut chart, Visibility Trends coloring +
   tooltips, Recommended Actions runtime safety).
2. **`e9adc66`** — QA commit 2: visual correctness (TopicRecallChart
   no-real-gap suppression, hero/chart tiebreak consistency, Citation
   Rate not-measured distinction, MiniSpark format prop).
3. **`2e74300`** — QA commit 3: donut polish (touch support +
   stale-hover reset).
4. **`6bc98ef`** — MED 9 fix: Postgres advisory lock around the
   Recommended Actions read → LLM → write window.
5. **`e3f846c`** — MED 12 fix: word-boundary grounding validation.
6. **`a4a5316`** — QA lows: source palette overflow, MiniSpark
   flat-line axis, Regenerate cooldown, float-epsilon tie detection,
   cleaner API error UX.
7. **`a79f116`** — Piece 1: partial unique index on
   `recommended_actions_*` rows + upsert cache write.

*Runtime safety & cost containment (commit f77a8c1)*
- `SubjectOverview.recommended_actions` typed nullable; client
  component short-circuits with a null guard before destructure.
  Prevents a `TypeError` crash on API contract regression or
  deployment skew.
- `_top_sources_for_refresh` SQL now uses `ORDER BY n_citations DESC,
  domain ASC`. Without the tiebreaker, tied source counts flipped
  row order between calls and caused cache misses on every page
  render (each miss = paid Gemini 2.5 Pro call). Likely-significant
  cost vector closed.
- Added `canonical_url` to the LLM payload and gated the "subject's
  own canonical website" surface in the prompt on its presence.
  Without this, the LLM cheerfully recommended SEO updates to
  websites that don't exist for issue/policy/event subjects.
- Added explicit null-`current_role` branch to the prompt with
  per-category surface guidance (organizations, issues, policies,
  events). 5 of 12 subjects in the DB are non-person categories
  with no `role` field; the prompt now instructs the model to NOT
  invent fictitious offices/leadership and to lean on
  subject_category + topic names + recent_news instead.
- Cache version bumped recommended_actions_v3 → v4.

*Visual correctness (commit e9adc66)*
- TopicRecallChart only marks a warning-orange bar when there's a
  real gap (>1 topic AND not all tied within float epsilon). Prior
  behavior: a single-topic snapshot at 100% rendered with that lone
  bar in warning orange (contradicts the value); all-tied snapshots
  arbitrarily highlighted the last-input topic.
- Tiebreak now consistent between Hero's Weakest Topic Recall
  subtitle and TopicRecallChart's warning-orange bar. Both use
  `findWeakestTopic` (first-wins). Prior inconsistency could show
  topic A in the hero subtitle while highlighting topic B in the
  chart on tied data.
- Citation Rate sparkline distinguishes "not measured" from "need
  more snapshots." For subjects without a canonical_url, every
  snapshot's value is null; tile now shows "—" in muted foreground
  + body says "Not measured for this subject" + footer says "This
  metric isn't measured for this subject." Previously showed the
  misleading "Need more snapshots for a trend line" — taking more
  snapshots wouldn't have fixed it.
- MiniSpark tooltip uses the passed `format` callback. Previously
  showed raw floats (`2026-04-15: 0.234`); now shows the metric's
  natural units (`2026-04-15: 23%` or `+12% positive`).

*Donut polish (commit 2e74300)*
- Touch support: each donut segment + each legend row gained an
  `onClick` toggle. Mobile/iPad users can now tap to highlight +
  populate the center label; tap again to clear; tap another to
  switch. Desktop hover unchanged.
- Stale-hover reset: `hovered` is an integer index into segments;
  added a `useEffect` keyed on a derived `dataKey` (`type:name`
  joins memoized over `sources`) to reset to null when the data
  shape changes. Prevents the legend dimming the wrong row after
  Regenerate adds/removes a category.

*Advisory lock — concurrent LLM cost (commit 6bc98ef, MED 9)*
- Two concurrent renders for the same subject (multiple browser
  tabs, collaborators, fast page reloads) could both miss cache
  and both fire paid Gemini 2.5 Pro calls ($0.05 + 5-15s each),
  discarding one result. Worst case under N concurrent loads:
  N paid calls instead of 1.
- New `_LOCK_CLASS_RECOMMENDED_ACTIONS = 1` namespace constant.
  `_compute_recommended_actions` refactored to hold a single
  transaction across read → LLM call → write, with
  `pg_advisory_xact_lock(class, refresh_run_id)` at the top.
  Second concurrent render blocks on the lock, wakes up after
  the first commits, re-checks cache inside the lock, finds the
  freshly-written row, returns it without firing a second
  (paid) LLM call.
- LLM call (5-15s) happens with DB connection open + lock held.
  Acceptable for typical render volume. If connection-pool
  pressure becomes a problem under load, the natural next step
  is precomputing actions in the worker when a refresh completes
  (decoupling generation from page render entirely).
- Verified live: concurrency smoke test on the dev DB confirmed
  Worker A holds lock 2s, Worker B starting 0.3s later waited
  exactly 1.70s for A's commit before acquiring.

*Word-boundary grounding validation (commit e3f846c, MED 12)*
- Previous substring matcher in `_validate_actions_grounding`
  produced false positives: topic "Trade" matched "trade-off",
  source "ap.org" matched "map" or "snap", topic "Policy" passed
  virtually any policy-adjacent sentence.
- Switched to `re.compile(r"\b" + re.escape(ent) + r"\b",
  re.IGNORECASE)`. `re.escape` handles entities with periods /
  hyphens / ampersands; word boundary forces the entity to appear
  as a standalone token.
- New `_GROUNDING_MIN_ENTITY_LEN = 3` cutoff. Acronyms like "AI",
  "US", "EU" are dropped from the valid-entity list — too generic
  to ground reliably even with boundary matching.
- Side benefit: false-positive grounding failures now correctly
  trigger the existing stricter-retry path. Bad outputs get a
  real second chance instead of silently slipping through.
- Verified with 8 unit-test-style scenarios covering false
  positives, true positives, multi-word entities, domains with
  periods, empty-payload edge case, and the short-entity filter.

*Low-severity lots batch (commit a4a5316)*
- **LOW 16** Sources donut: when source-type count exceeds the
  palette size (7), collapses the tail into a single "Other
  (N more)" bucket using the bottom palette slot. Top
  (palette.length − 1) categories each still get their own color.
  More honest than silently aliasing colors.
- **LOW 17** MiniSpark flat-line: when min === max (all snapshot
  values identical), renders a single vertically-centered axis
  label instead of two stacked identical labels.
- **LOW 19** Regenerate cooldown: new `_REGENERATE_COOLDOWN_SECONDS
  = 30` enforced server-side. The endpoint reads the age of the
  current `recommended_actions_v4` cache row before invalidating;
  refuses with HTTP 429 + a Retry-After header + a human-readable
  detail message when the row is younger than 30s. Spam-clicking
  Regenerate can no longer burn back-to-back paid LLM calls.
- **LOW float-epsilon** `buildGapBottomLine` tie detection: replaced
  strict float equality with `Math.abs(diff) < TIE_EPSILON`
  (0.001). DB-aggregation micro-differences no longer cause bogus
  "AI underweights X" lines to render when there's no real gap.
  Matches the pattern already in TopicRecallChart.
- **Bonus** API error UX: `apiPostNoContent` extracts FastAPI's
  `{detail: "..."}` field on non-OK responses. The Regenerate
  cooldown's user-facing error now reads as a sentence instead
  of a wrapped HTTP status string.

*Schema defense (commit a79f116, Piece 1)*
- **Migration `011_recommended_actions_unique.sql`** — new partial
  unique index `idx_recommended_actions_unique` on
  `(refresh_run_id, analysis_type) WHERE analysis_type LIKE
  'recommended_actions_%'`. Partial-and-predicate-scoped so it
  doesn't constrain other analyzers (`asymmetry`,
  `share_of_voice` write multiple per-model rows per refresh).
  LIKE-prefix predicate covers all future cache version bumps
  (v4 → v5 → …) automatically.
- Cache write switched from `DELETE` + `INSERT` to `INSERT ... ON
  CONFLICT (refresh_run_id, analysis_type) WHERE analysis_type
  LIKE 'recommended_actions_%%' DO UPDATE`. Same row id preserved
  across writes; no churn on the primary-key sequence.
- `created_at = NOW()` set in the DO UPDATE clause so the
  Regenerate cooldown's age check measures time since latest write
  (matching prior DELETE+INSERT semantics; otherwise upsert would
  freeze `created_at` at the first write and break the cooldown).
- Verified live against the dev DB: plain duplicate INSERT now
  rejected with `duplicate key value violates unique constraint`;
  upsert succeeds, preserves row id, refreshes `created_at`.

*The Recommended Actions pipeline as it stands today (post-QA)*

Three independent layers of defense against the original concurrent-
write race, each operating at a different level:

1. **Application-level** — `pg_advisory_xact_lock(class=1,
   refresh_run_id)` in `_compute_recommended_actions` serializes
   concurrent writers. Second render blocks → first finishes &
   writes → second wakes up, finds cached row, skips its LLM call.
2. **Validation-level** — word-boundary regex grounding (with
   3-char minimum entity length) catches LLM hallucinations that
   would silently pass the prior substring matcher. Failures
   trigger one stricter retry; if that also fails, the request
   falls through to the subject-agnostic generic fallback.
3. **Schema-level** — partial unique index makes duplicate
   `(refresh_run_id, recommended_actions_*)` rows physically
   impossible. Upsert path writes idempotently. If a future code
   path forgets the lock or a manual SQL write happens, the
   constraint still holds.

Full read → write flow on a cache miss (single render):

```
1. _build_recommended_actions_payload(...)
   ├─ filter "Current events" topic (internal bucket, not a real area)
   ├─ extract setup_inputs.role / audience / recent_news / canonical_url
   └─ assemble structured payload (returns None if too thin to recommend on)

2. Acquire pg_advisory_xact_lock(1, refresh_run_id)

3. SELECT findings FROM refresh_analyses WHERE ... ORDER BY id DESC
   ├─ If row exists AND cached_payload == current_payload: return cached
   └─ Otherwise: proceed

4. Gemini 2.5 Pro call (thinking_budget=2048)
   ├─ Validate shape (1 primary + 2 secondary, all label/action/why non-empty)
   ├─ Validate grounding (every action references ≥1 entity by name)
   └─ On failure: one stricter retry, then fallback

5. INSERT ... ON CONFLICT DO UPDATE (with created_at = NOW())

6. Transaction commit → lock released → next render's cache read finds row
```

Regenerate flow (separate endpoint):

```
1. POST /api/subjects/{id}/recommended-actions/regenerate
2. Lookup latest refresh_run_id for subject
3. Read current cache row's created_at; if <30s old, refuse with 429
4. Otherwise: DELETE the cache row → next page render fires fresh LLM call
```

*Cleanup notes — orphaned helpers*

- `_recommended_actions_cache_read` and `_recommended_actions_cache_write`
  in queries.py are now unused (the orchestrator inlines the SQL inside
  the locked transaction). Left in place as documentation of the cache
  row shape; safe to delete in a future cleanup pass.

*Follow-ups identified but not addressed (low priority — at time of
first pass; cache warming was addressed in the secondary pass below)*

- ~~**Cache warming via worker**~~ — DONE in commit `986dd32` (L11
  from the secondary QA pass below).
- **Source palette extension** — could extend `SOURCE_TYPE_COLORS`
  beyond 7 entries to support 8+ distinct categories without the
  "Other" collapse. Current "Other" bucket is more honest about
  chart legibility but loses some detail.
- **STATE.md long-tail** — this file is now ~2100 lines. Worth
  rolling old session entries into a separate `STATE_archive.md`
  once it's clear no fresh session will need them.

---

**Secondary QA pass + remediation — shipped this session (2026-05-16, continued):**

After the first full QA pass landed, ran a second audit specifically
focused on the just-shipped commits. The intent: catch any issues
the first pass missed and verify the architecture state of the
Recommended Actions pipeline post-refactor. Audit performed via a
parallel subagent reviewing all 8 prior commits + direct verification
against the live dev DB. Surfaced 2 high + 4 medium + 3 low — all
closed across 5 commits.

*Commit chain (oldest → newest):*

9. **`982c041`** — QA commit A: H1 timeouts, M4 Regenerate lock,
   M5 isFinite, M6 sparkline path break (runtime safety + correctness)
10. **`ac9ff26`** — QA commit B: clock_timestamp, %% escape docs,
    schema doc patch (defensive cleanup)
11. **`ada0449`** — L9: grounding regex tolerates hyphen/space normalization
12. **`5aac619`** — L10: self-cleaning orphan version rows
13. **`986dd32`** — L11: precompute Recommended Actions in worker

*H1 — Stuck connection + held lock if Gemini hangs (commit 982c041)*
- `_compute_recommended_actions` held a transaction + advisory lock
  across the 5-15s Gemini call with NO timeouts anywhere in the
  stack (`app/db.py` has no `connect_timeout`/`statement_timeout`,
  Gemini SDK call had no `HttpOptions` timeout). A hung call would
  have wedged the connection AND the lock indefinitely; the except
  block handles thrown exceptions but a hang is not an exception.
  Other renders for the same refresh would have wedged behind the
  lock until OS reclaimed the socket (minutes-to-hours).
- Fix: `SET LOCAL lock_timeout = '30s'` and `statement_timeout =
  '60s'` inside the locked transaction. `HttpOptions(timeout=45_000)`
  (45s) passed to the Gemini client. Verified live: `SET LOCAL
  lock_timeout = '2s'` + peer holding lock raised
  `psycopg.errors.LockNotAvailable` after exactly 2.08s. Existing
  `except Exception` catches it and falls through to naked LLM call.

*M4 — Regenerate during in-flight render was a silent no-op (commit 982c041)*
- Race trace: Render A acquires lock at T=0, starts 14s Gemini call.
  User clicks Regenerate at T=3s. Endpoint runs DELETE — but DELETE
  doesn't take the advisory lock, so it doesn't block on A. Row
  doesn't exist (A hasn't written yet), DELETE no-ops, returns 204.
  A finishes at T=14s, INSERTs the fresh row. User reloads at T=15s,
  sees A's "fresh" recommendations — generated BEFORE the Regenerate
  click. Defeated Regenerate intent entirely.
- Fix: Regenerate endpoint (`app/api/routes/subjects.py`) now takes
  `pg_advisory_xact_lock(1, refresh_run_id)` before the cooldown
  check + DELETE. If a render is mid-LLM call, the endpoint waits
  for the render to commit, then DELETEs the freshly-written row.
  Same SET LOCAL timeouts applied. Cooldown violation handling moved
  outside the with-block so the transaction commits cleanly
  (releasing the lock) before the HTTPException propagates.

*M5 — NaN ai_recall propagation shipped "NaN%" to UI (commit 982c041)*
- `withRecall` filters across `findWeakestTopic`,
  `findStrongestTopic`, `buildGapBottomLine`, and `TopicRecallChart`
  checked `!== null` only. NaN / Infinity values passed through;
  `Math.abs(NaN - X) < epsilon` is always false → tie-detection
  short-circuit doesn't fire → `Math.round(NaN * 100) = NaN` →
  output: `"AI underweights Obama on policy — NaN% mention rate vs
  42% on …"` ships to the UI.
- Fix: shared `_hasFiniteRecall` predicate (`!== null && Number.isFinite`)
  applied to all 4 filter sites.

*M6 — MiniSpark sparkline drew through null gaps (commit 982c041)*
- Mixed null + non-null sparkline values produced a path that
  connected surrounding non-null points DIRECTLY — visually drawing
  a value where there isn't one. Dots correctly skipped nulls, but
  the line passed through the missing position as if interpolated.
- Fix: path builder emits `M` (move) instead of `L` (line-to) after
  a null, breaking the path at gaps. Reads as discontinuity instead
  of phantom interpolation.

*L8 — `NOW()` inside long transactions ≠ wall-clock write time (commit ac9ff26)*
- `created_at = NOW()` on the upsert ran inside a transaction
  holding the advisory lock across the 5-15s Gemini call. `NOW()`
  returns transaction-start time, not wall-clock, so the timestamp
  landed 5-15s in the past relative to the actual write. The
  Regenerate cooldown's age comparison (`NOW() - created_at`, also
  using `NOW()` in its own short transaction) saw a SHORTER age
  than the true wall-clock time, effectively shrinking the 30s
  cooldown.
- Fix: both sides switched to `clock_timestamp()`. Same pitfall
  already bit the worker's job timing (per the Phase B entry above);
  applied the same treatment here.
- Verified live: `NOW()` didn't advance over a 3s sleep inside one
  transaction; `clock_timestamp()` advanced by 3.01s as expected.

*M7 — Defensive comment on `%%` escape in ON CONFLICT WHERE (commit ac9ff26)*
- Documented why the upsert's `WHERE analysis_type LIKE
  'recommended_actions_%%'` predicate uses `%%` (psycopg's escape
  for a literal `%` in parameterized queries). Notes the alternative
  `ON CONFLICT ON CONSTRAINT idx_recommended_actions_unique`
  syntax that avoids the escape entirely if a future writer
  bypasses psycopg.

*L12 — Schema doc patch (commit ac9ff26)*
- `docs/database-schema.md` updated to include migration 011's
  partial unique index, three new analysis_type vocabulary entries
  (`narrative_clusters`, `executive_polish_v5`, `recommended_actions_v4`),
  and notes on the versioned-cache pattern + upsert/lock pattern.

*L9 — Grounding regex tolerates LLM hyphen/space normalization (commit ada0449)*
- The word-boundary grounding match (from `e3f846c`) was strict
  about exact entity form. LLMs commonly normalize hyphens to
  spaces (or vice versa): payload `"post-presidency political
  influence"` + action `"post presidency political influence
  reform"` failed grounding, triggered an unnecessary stricter
  retry (~$0.05 extra per affected snapshot).
- Fix: new `_grounding_pattern_for(entity)` builds the word-boundary
  pattern with hyphens and whitespace inside the entity expanded
  to `[\s\-]+`. Entities WITHOUT a hyphen/space stay strict —
  `trade` still rejects `trade-off`, `ap.org` still rejects `map`,
  `Policy` still rejects `policymaker`. Only relaxes within entity
  boundaries, not the boundaries themselves.
- Verified with 7 test cases: 2 new positives that previously
  failed now correctly accepted; 2 prior positives still accepted;
  3 prior false positives still correctly rejected.

*L10 — Self-cleaning orphan version rows (commit 5aac619)*
- The partial unique index on `(refresh_run_id, analysis_type)
  WHERE analysis_type LIKE 'recommended_actions_%'` allowed
  different version strings to co-exist legally (a v3 row and v4
  row for the same refresh both pass). Storage waste accumulated
  over version bumps until L10. Dev DB had 4 orphan rows
  (v1 × 1, v2 × 1, v3 × 2, v4 × 1) pre-fix.
- Fix: bounded DELETE inside the locked upsert transaction
  removes prior-version rows for THIS refresh before the upsert
  fires. Self-cleaning over the next render cycle for any subject
  whose page is opened after a version bump.
- Live one-time cleanup: ran `DELETE FROM refresh_analyses WHERE
  analysis_type LIKE 'recommended_actions_%' AND analysis_type !=
  'recommended_actions_v4'`. Cleared 4 orphan rows. Only the live
  v4 row remains.
- Caveat: auto-cleanup only fires for refreshes that get
  re-rendered. A refresh whose dashboard page is never opened
  again keeps its orphan forever. Acceptable: rows are harmless
  reads (never returned by the orchestrator's current-version
  query) and storage cost is ~400KB/yr at projected scale.

*L11 — Precompute Recommended Actions in worker (commit 986dd32)*
- The dashboard's LLM call (Gemini 2.5 Pro, ~5-15s) ran
  synchronously inside the page render request path. First page
  load for a freshly-refreshed subject paid the full latency in
  front of the user, and the connection-hold-during-LLM pattern
  was the underlying concern behind the L11 audit item.
- Fix: `app/worker.py` now calls `get_subject_overview(subject_id)`
  as a final step after `run_cross_analysis` completes. That
  triggers `_compute_recommended_actions` as a side effect,
  fires the Gemini call, writes the cache row via the upsert +
  advisory-lock pattern. First dashboard load drops from 5-15s
  to ~100ms.
- Failure handling: wrapped in try/except, logs at WARNING and
  swallows. Dashboard render path still has its on-demand LLM
  call as fallback — same behavior as pre-L11 (waits the full
  5-15s) if precompute fails. No regression possible.
- Concurrency: the advisory lock serializes the worker's
  precompute against any concurrent user-driven render. One
  paid LLM call per refresh either way.
- Connection-hold-during-LLM no longer happens on the user-facing
  request path; it happens in the worker's connection scope
  instead, which is the right place for it (one worker process
  per box, predictable load) vs. the request path (where
  concurrent users could exhaust the pool).
- **Operational note**: any `app/worker.py` change requires a
  worker process restart since Python doesn't auto-reload module
  imports for long-running processes. Worker restarted as part
  of this commit (PID 46765 → 6912).

*The Recommended Actions pipeline now has FOUR defensive layers
(was three after the first QA pass):*

1. **Worker precompute** (L11, new in this pass) — cache is
   warm before the user opens the dashboard. First page render
   is a pure cache hit.
2. **Application advisory lock** (MED 9, first pass) —
   `pg_advisory_xact_lock(1, refresh_run_id)` serializes concurrent
   writers; only one paid LLM call per snapshot regardless of how
   many tabs/users hit the page simultaneously. Now with timeout
   bounds from H1 (30s lock_timeout, 60s statement_timeout, 45s
   Gemini timeout) so a hung call can't wedge anything indefinitely.
2. **Validation** (MED 12 first pass + L9 second pass) —
   word-boundary regex grounding catches LLM hallucinations;
   hyphen/space tolerance handles common LLM normalizations
   without triggering unnecessary retries.
3. **Schema** (Piece 1, first pass) — partial unique index makes
   duplicate `(refresh_run_id, recommended_actions_*)` rows
   physically impossible. Upsert path writes idempotently.

*Bugs surfaced by the audit that turned out to be REAL but
hadn't fired in production yet (good catches):*

- H1: the connection/lock wedge under a Gemini hang would have
  cascaded badly if it ever fired. Worker restart was already
  noted as a required step after analyzer changes, but a stuck
  render-time LLM call would have wedged user pages indefinitely
  until manual intervention.
- M4: the Regenerate-during-in-flight race would have silently
  produced "you got the result you didn't want" outcomes in
  customer-facing usage. Hard to debug — looks like Regenerate
  worked but the recommendations look the same.

*Things left after the secondary pass:*

- **Source palette extension** — still deferred (low priority,
  rare in practice).
- **STATE.md archive split** — this file is approaching ~2400
  lines after this update; the older session entries (Phase A2,
  Phase B, schema-driven new-subject form, historical
  retrospective) could split into `STATE_archive.md` to keep
  the active section focused. Not urgent.

**Hub-and-spokes start + landing page + page.tsx cleanup — shipped
this session (2026-05-16 evening → 2026-05-17):**

Two work streams ran in parallel after the QA passes landed: continued
Summary-tab polish in this session, and the landing page (`/`) built
from scratch in a separate Claude Code session. Both shipped to `main`
without conflicts via clear off-limits file lists.

*Commit chain (oldest → newest):*

14. **`8c9ce74`** — Recommended Actions: trim Overview to primary-only
    + add dedicated `/recommendations` spoke (first hub-and-spokes
    spoke wired up).
15. **`1af6ba5`** — Landing page initial scaffold (parallel session).
16. **`b480630`** — Remove Analysis Scope / "What this snapshot
    includes" section from Overview.
17. **`6d18de7`** — Delete orphaned `PlatformRecallStrip` + related
    dead code (209-line cleanup after b480630).
18. **`6a3efce`** — Landing: rewrite closing CTA headline + drop
    "What it isn't" section.
19. **`40d812e`** — Landing: finalize the Problem section copy
    (McKinsey citation link, 50% stat, body paragraph).

*First hub-and-spokes spoke: `/subjects/[id]/recommendations` (commit 8c9ce74)*
- Per the planned IA in STATE.md ("Next-priority items: hub-and-spokes
  with distinct URLs per spoke"), Recommendations is now its own page
  at `web/app/subjects/[id]/recommendations/page.tsx`.
- Overview tab's Recommended Actions card now renders ONLY the primary
  action + a "View all recommendations →" link below it. The two
  secondary actions move to the spoke so the briefing tab stays
  focused on the headline next-step.
- `RecommendedActionsBlock` component gained a `variant: "full" |
  "primary-only"` prop (defaults to `"full"` so the spoke works
  without explicit configuration). Primary-only gates the secondary
  list and renders the spoke link.
- Spoke uses the same data-fetch pattern as Overview (parallel
  `getSubjectOverview` + `getSubject` + `listSubjects`, `force-dynamic`,
  async `params` per Next.js 16). Reuses Sidebar + Header chrome.
  Back-to-Overview link in both Header and page body.
- Spoke link only renders when `secondary.length > 0` — no point
  linking to "more" when there isn't more.

*Why a new spoke rather than wiring an existing one* — per STATE.md's
planned IA list (Narrative, Visibility, Competition, Topics, Sources,
Prompts, Reports, Settings), Recommendations wasn't on the list — but
it fits the same pattern, carries its own data (the LLM-generated
recommendations), and has natural future expansion (history of
regenerations, export, etc.). Added as a peer spoke.

*Note on Sidebar links* — Sidebar's static placeholder `href="#"`
links still aren't wired to real URLs. Wiring is part of the deferred
Phase D hub-and-spokes IA work; not in scope of these commits. The
"View all recommendations" link on the Overview is the navigation
path to the new spoke for now.

*Analysis Scope section removed + dead code purge (commits b480630, 6d18de7)*
- The "Analysis Scope / What this snapshot includes" section between
  Strategic Takeaways and Evidence is gone. It was the
  topic-coverage + platforms-coverage audit view; the headline
  visibility data lives in the Hero KPIs and Topic Recall chart
  already, so the audit view was redundant.
- Follow-on cleanup removed 209 lines of now-orphaned code from
  `page.tsx`: `PlatformRecallStrip` function (~150 lines),
  `PlatformRow` type, `emptyPlatformRow` helper, `CANONICAL_PLATFORMS`
  constant, `TrendBadge` function, `formatDelta` helper, and the
  `Fragment` import.
- `data.platform_recall` API field unchanged — a future Platforms
  spoke can rebuild from it. The removed component geometry is
  reachable via `git show 6d18de7^:web/app/subjects/[id]/page.tsx`.
- Net `page.tsx` size: 1916 → 1707 lines.

*Landing page (parallel session, commits 1af6ba5, 6a3efce, 40d812e)*
- New file `web/components/landing/LandingPage.tsx` (~480 lines after
  edits): full marketing landing composed of MarketingNav + Hero +
  Problem + ProductPreview + Capabilities + HowItWorks + WhoItsFor +
  ClosingCTA + MarketingFooter sections. Uses the dashboard's
  existing oklch design tokens; matches the executive-briefing tone.
- `web/app/page.tsx` now dispatches by auth state via Clerk's
  `auth()` server helper: signed-out → `<LandingPage />`, signed-in
  → existing subjects-list dashboard (unchanged).
- `web/proxy.ts` updated: `/` added to a public-routes matcher via
  `createRouteMatcher`. Every other route still requires auth +
  redirects to Clerk's hosted sign-in.
- Iterative copy edits since initial scaffold: dropped the "What it
  isn't" Differentiation section, rewrote the closing CTA headline
  to lead with present-tense urgency, finalized the Problem section
  copy with a real McKinsey citation link (`target="_blank"`,
  `rel="noopener noreferrer"`, italicized report title).

*Landing page placeholders STILL outstanding:*
The landing renders without crashing but shows literal `[…PLACEHOLDER]`
strings in several spots. Easy way to find them all:
```bash
grep -n "PLACEHOLDER" web/components/landing/LandingPage.tsx
```
Remaining: `CTA_URL_PLACEHOLDER`, `SAMPLE_REPORT_URL_PLACEHOLDER`,
`CONTACT_EMAIL_PLACEHOLDER`, `DEMO_SUBJECT_PLACEHOLDER`,
`SUBJECT_LIMITS_PLACEHOLDER`, `SNAPSHOT_DETAILS_PLACEHOLDER`,
`INTEGRATION_LIST_PLACEHOLDER`, `SEGMENT_*_PLACEHOLDER`. The Problem
section and Closing CTA copy are now final; everything else is
structurally correct but content-pending.

*Parallel-session coordination — what worked*
- Off-limits file lists (provided in the landing session's initial
  prompt) prevented either session from touching the other's active
  files. Zero merge conflicts across the parallel work.
- "No commit/push without explicit user green light" gating in the
  landing session's prompt meant this session could commit its own
  work first; the landing session's local changes were inspected
  and committed from this session per user request after review.
- STATE.md updates centralized in this session per the off-limits
  list; the landing session was told to leave STATE.md alone.

*Going forward — recommended pattern for parallel work*
- Sidebar (`web/components/dashboard/Sidebar.tsx`) is the most
  natural next-up shared chrome change as more spokes get built.
  When that work starts, mark Sidebar as actively-edited in
  whichever session has it and off-limits in the other.
- The hub-and-spokes layout (`web/app/subjects/[id]/layout.tsx`,
  planned in the IA but not yet created) would be a natural
  parallel-work candidate IF coordinated up-front: one session
  builds the shared layout, the other waits to start spoke pages
  until the layout API is stable.

*Things left after this session*
- **Sidebar wiring** — currently all `href="#"`. Spokes that exist
  (`/recommendations`) and spokes that will exist (`/visibility`,
  `/narrative`, etc.) all need real hrefs threaded through with
  `subjectId`.
- **Landing placeholders** — see grep above. Most are content (copy,
  URLs, demo subject reference); none require code changes.
- **Other planned spokes** — Narrative, Visibility, Competition,
  Topics, Sources, Prompts, Reports, Settings. None built yet.
- **STATE.md long-tail** — now 2380+ lines. Older Phase A2 / Phase B
  / historical-retrospective entries could split into a
  `STATE_archive.md` to keep the active section focused. Not urgent;
  becomes more so as more session entries accumulate.

**Dashboard + landing iteration day — shipped this session (2026-05-17 evening):**

15 commits since the morning STATE.md refresh (`1c4db33`). Two
parallel threads: continued Overview/Sources polish in this session
+ landing copy iteration in the other Claude Code session. Both
landed on `main` without conflicts via off-limits file lists.

*Commit chain (oldest → newest):*

- `4516228` — Dashboard horizontal padding bump (`md:px-8 → md:px-12`).
  Adds 16px breathing room on each side of the Overview content;
  symmetric so the Sidebar's right edge and the right viewport edge
  feel balanced. No effect on viewports wider than the `max-w-[1500px]`
  cap since the centering takes over there.
- `99a4c65` — Strategic Takeaways collapsed into the AI Narrative
  Brief hero card. The standalone "What stands out right now"
  section (which sat between Topic Recall and Evidence with three
  insight cards) is gone. `strongest_asset` and `opposition_frame`
  now render as compact left-border callouts inline in the hero,
  between Bottom Line and Recommended Actions. `message_gap` is
  filtered out because the Bottom Line already surfaces the gap —
  rendering both was the redundancy. Net `-22` lines.
- `9d7baeb` — Recommended Actions block removed from the Overview
  per user request. The `/recommendations` spoke still renders the
  full set; the backend pipeline (advisory lock, upsert, worker
  precompute, regenerate endpoint, cache versioning) all preserved
  untouched. Re-add by restoring `<RecommendedActionsBlock
  variant="primary-only" />` in the hero (the comment at the removal
  site documents the one-line restoration path).
- `96489fc` — Sources donut palette contrast widened. Prior 7-stop
  ramp compressed at the light end (only 0.04 lightness between the
  last two stops); new ramp spreads ~0.12 between each adjacent pair
  with the lightest stop pushed from 0.95 → 0.97 lightness.
- `4455a17` — `.claude/` added to `.gitignore` so per-session Claude
  Code state doesn't surface as untracked.
- `ae1a480` — Landing iteration from the parallel session: filled
  product-copy placeholders (`SUBJECT_LIMITS`, `SNAPSHOT_DETAILS`,
  `INTEGRATION_LIST`, `WHO_IT_IS_FOR`); added `PlatformsStrip`
  between Hero and Problem; added `MidPageCTA` between Capabilities
  and HowItWorks; replaced empty product-preview placeholder with a
  styled mock dashboard; dropped 01–04 card numbering.
- `96e85f3` — Overview hero declutter (bundle): dropped the
  redundant "Frames N% of AI responses..." description from
  DominantNarrativePanel; shrunk the cluster title from
  `font-display text-[24px]` to `text-[18px]` (it's a cluster LABEL,
  not a section title); standardized the right-column eyebrow to
  uppercase + tracked (matching `AI NARRATIVE BRIEF` / `BOTTOM
  LINE`); dropped the generic "How major AI platforms describe..."
  subtitle paragraph.
- `ab7b60c` — Sources: strip leading `www.` in `_canonical_domain`
  so `pbs.org` and `www.washingtonpost.com` no longer read as
  inconsistent. Done at the canonical-domain layer so both the
  Sources list AND the donut category aggregation benefit AND any
  duplicate entries collapse with summed citation counts.
- `269aedf` — Donut chart: pick N evenly-spaced palette indices
  instead of the first N. For 3 categories, the slices were
  previously 0.28 / 0.40 / 0.52 lightness (three dark blues that
  read identical); now 0.28 / 0.64 / 0.97 (dark / medium / light).
  Same logic improves contrast for 4-6 too.
- `7339216` — Sources: rename uncategorized `source_type` from
  "Unknown" to "Other" in `_top_sources_for_refresh`. Reads cleaner
  in both the donut category list and the Sources table type
  column.
- `a571786` — Sources list: source name + ExternalLink icon now a
  single clickable anchor opening the source in a new tab.
  `group-hover` keeps the icon + text in visual sync. Domain is
  already normalized by `_canonical_domain`, so bare
  `https://${s.name}` resolves correctly.
- `1541fb9` — Landing copy polish (parallel session): new
  `DEMO_SUBJECT_DISPLAY` fallback const ("Senator Maya Reyes") so
  the page doesn't show the literal `[..._PLACEHOLDER]` in the UI
  until the real value is set; hero headline tightened to "...has
  no byline"; HeroVisual mock topics swapped to broader civic
  themes; Problem body split into two paragraphs; closing CTA copy
  finalized.
- `a059b2a` — Landing: clarify "primary source for online
  information" (was just "primary source" — ambiguous). McKinsey's
  exact phrase is "primary and preferred source of insight" per
  fact-check; user chose accessibility over exactness.
- **`+ today's commits not yet pushed:`** Sidebar wiring +
  Methodology footer link to the McKinsey citation + this STATE.md
  refresh (bundled per user's "items 1, 7, 8" pick).

*Hub-and-spokes IA — actually wired this session*

The Sidebar (`web/components/dashboard/Sidebar.tsx`) was a static
placeholder with every entry as `href="#"`. Now:

- Accepts `subjectId?: number` and `activeSection?: "overview" |
  "recommendations"` props. Each page passes its own values.
- Computes hrefs based on `subjectId` + per-entry `slug` (Overview
  → `/subjects/{id}`, built spokes → `/subjects/{id}/{slug}`,
  unbuilt entries → `#`).
- Renders unbuilt entries with muted text + a small uppercase
  "Soon" pill on the right edge so users know it's coming but
  not yet wired. `aria-disabled` + `tabIndex={-1}` for a11y.
- Active section gets the existing primary-tint treatment + side
  rail; no JS / no client component (each page tells the Sidebar
  what's active via a string prop, no `usePathname` needed).
- Recommendations entry added to the nav (wasn't in the prior
  list). Lives between Prompts and Reports.
- Wired into both `app/subjects/[id]/page.tsx` (Overview, passes
  `activeSection="overview"`) and `app/subjects/[id]/recommendations/page.tsx`
  (passes `activeSection="recommendations"`).
- `app/dashboard-preview/page.tsx` still uses bare `<Sidebar />`
  (static preview, no subject context) — falls back to all entries
  disabled with default `activeSection="overview"`.

This is the first real hub-and-spokes navigation surface. Future
spoke pages (Narrative, Visibility, Competition, Topics, Sources,
Prompts, Reports, Settings) just need to (a) set their `slug` in
the NAV array, (b) be reachable at `/subjects/{id}/{slug}`, and
(c) pass their own `activeSection` value from the page.

*Methodology footer link (item 8)*

Landing footer's Methodology link was `[METHODOLOGY_URL_PLACEHOLDER]`
(broken). Now points at the McKinsey "New Front Door to the
Internet" report — the same report cited in the Problem section.
`target="_blank"` + `rel="noopener noreferrer"`. Interim target
until a dedicated `/methodology` page exists.

*Remaining landing placeholders*

- `CTA_URL` (booking URL)
- `SAMPLE_REPORT_URL` (page or external link)
- `CONTACT_EMAIL` (closing CTA email)
- `DEMO_SUBJECT` (now has the `DEMO_SUBJECT_DISPLAY` fallback to
  "Senator Maya Reyes" if not filled in — page renders cleanly
  either way)
- `PRIVACY_URL`, `TERMS_URL` (footer links)

`grep -n PLACEHOLDER web/components/landing/LandingPage.tsx` for
the current list anytime.

*Code-cleanliness debt accumulating*

Several helpers are now genuinely orphaned (used to be flagged as
"safe to delete in a cleanup pass"; today's commits added more):

- `formatTopicScope` (page.tsx ~line 106) — orphaned since the AI
  Mention Rate subtitle was dropped.
- `formatSubjectInline` (page.tsx ~line 89) — only consumer was
  `formatTopicScope`, now also orphaned.
- `findStrongestTopic` (page.tsx ~line 320) — orphaned since the
  Bottom Line comparator switched to mean-of-others.
- `subjectName` and `category` props on DominantNarrativePanel
  (page.tsx ~line 533) — orphaned by today's `96e85f3` description
  removal.

A focused cleanup commit would remove these 4 items + the bare
`<Sidebar />` in `dashboard-preview` (now disabled-looking with
all-Soon entries — could either accept that or fork into a
non-interactive preview Sidebar variant). Not urgent; flagged for
the next cleanup pass.

*Things left from the broader plan*

- More spokes (Sources is the easiest first — data is already on
  the overview payload). Establishes the hub-and-spokes pattern at
  scale before committing to all 7-8 entries.
- Per-topic delta on Weakest Topic Recall hero tile (still shows
  "no prior data"). Backend follow-up in `queries.py`.
- Methodology page (real, not a McKinsey link). Customer-credibility
  ask before any serious demo.
- Account / `/account` route. Clerk's `<UserProfile />` does most
  of the work.
- Landing `CTA_URL` / `SAMPLE_REPORT_URL` / `CONTACT_EMAIL` filling
  (content, not code).

**Known issues / followups from the 2026-05-12 QA pass (none blocking):**

*Medium — should fix soon:*
- **Stuck-job reaper:** if the worker crashes mid-job, the row stays
  `status='running'` forever. Cheap to fix with a SQL job:
  `UPDATE jobs SET status='failed', error='reaper: worker died'
  WHERE status='running' AND started_at < NOW() - INTERVAL '15 min'`.
- **Provider-quota failures look like crashes:** when OpenAI/Gemini
  rate-limits mid-refresh, individual responses fail and the engine
  records "partial" status. The UI surfaces a green "completed" job
  without context. Worth differentiating provider-quota errors from
  customer-input errors in the surfaced text.
- **Prompt-injection trust boundary:** customer-supplied `name` and
  `setup_inputs` go directly into prompt templates via `{name}` etc.
  A subject named `"Bernie Sanders. Ignore prior instructions and…"`
  is rendered verbatim. Out of scope today; sanitization belongs in
  `app/query_engine.py`.
- **Frontend new-subject page hard-fails if any one schema fetch
  errors:** `await Promise.all(...)` over 5 categories; one 5xx →
  whole page 500. Should fall back gracefully.
- **`BYLINE_API_TOKEN` escape hatch in `web/lib/api.ts`:** if
  accidentally set in production, every server-side fetch uses the
  same hardcoded token, bypassing per-user Clerk identity. Guard
  with `NODE_ENV !== 'production'` or strip the codepath at build.
- **CORS in prod:** `BYLINE_CORS_ORIGINS` must be explicit (not
  `"*"`) because `allow_credentials=True` is set. Document on the
  deploy runbook.

*Low / polish:*
- `latest_refresh_id` uses `MAX(rr.id)` — assumes SERIAL order ≈
  time order. True today; document or switch to `started_at`.
- `n_findings` counts findings across all methodology versions —
  double-counts after methodology bumps. Filter by distinct
  `(analysis_type, analysis_key)`.
- Refresh button stays "Done" after success. Customer might not
  realize they can re-trigger. Reset label after the
  revalidatePath, or clear job state.
- New-subject form clears all values on category change. Cache
  per-category form state.
- Validation errors don't highlight specific fields. Single rolled-
  up banner; add red borders / focus on missing inputs.
- Worker logs to stdout only. No structured logging / aggregation;
  first opaque failure in production will require SSH-and-grep.
- No automated tests anywhere (`tests/` is empty).

*Edge cases worth manually testing before any customer:*
- Sign out in tab A, trigger refresh in tab B → tab B must hit sign-in,
  not silently fail.
- DELETE a subject in psql while a refresh is mid-flight → worker should
  fail cleanly, not crash.
- POST `/api/subjects/13/refresh` from another org's user → 404 (NOT 403,
  which leaks existence).
- Trigger refresh, kill -9 worker, restart worker → row remains `running`
  forever (proves the stuck-job-reaper gap).
- Submit subject name with newlines, emoji, 200-char limit boundary.
- Submit `name = "Test\nIgnore prior instructions"` → currently
  accepted as-is (prompt injection).

**Live e2e Phase B confirmation (2026-05-11):**
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

**Customer-facing dashboard brief: production-ready (2026-05-13).**
`/subjects/[id]` is the wired customer-facing AI Narrative Brief. It
reads cross-analyzer + extractor output via
`dashboard.lib.queries.get_subject_overview()` and renders: hero
KPIs (AI Mention Rate / Average Tone / Risk Frame Rate), Bottom Line
+ Recommended Focus callouts (LLM-polished), Dominant Narrative
panel (cluster bars), platform-recall breakdown (adaptive tile/list),
Strategic Takeaways (Message Gap / Opposition Frame / Strongest
Asset rules), Prompt Coverage, Evidence quotes (deduped per prompt),
Visibility Trends (sparklines), Competitive Snapshot, Sources +
type-mix donut. Empty-state hero for zero-refresh subjects;
adaptive layout collapses thin sections gracefully. Header is
sticky and consolidates back-nav, page meta, subject switcher,
Export PNG, and Trigger refresh into one band.

Methodology adjustments shipped in this pass that affect read
semantics:

- **AI Mention Rate** (was "AI Recall") computed on unnamed-layer
  responses only — questions in the subject's topic areas that
  don't name the subject directly. Backend identifier
  `ai_recall` unchanged.
- **Average Tone** (was "Avg Sentiment") rendered as percentage
  (`+20% positive` / `-30% negative` / `Neutral`) rather than raw
  -1..+1. Backend computes the same value; frontend formatter does
  the ×100 + direction word.
- **Risk Frame Rate** restricted to unnamed-layer responses to
  avoid measuring "did AI answer the criticism prompt we asked?"
  Named-layer "What are the criticisms of {subject}?" prompts
  mechanically inflated the prior rate; unnamed-only captures
  spontaneous critical framing. Same backend `risk_frame_rate`
  field, FILTER applied at query time.
- **Polish output cached** in `refresh_analyses` keyed by
  `(refresh_run_id, analysis_type='executive_polish_v1')`. One row
  per refresh; cache hit when raw_bottom_line + raw_recommended_focus
  inputs match. DELETE-then-INSERT keeps the table flat. Bump the
  version constant to invalidate all cached rows after a prompt
  change.
- **Trajectory KPIs** computed in 2 grouped queries (one for AI
  Mention Rate, one for sentiment+risk) instead of N×3 per-refresh
  queries. `_kpis_per_refresh_bulk` in `dashboard/lib/queries.py`.
- **Operator-bypass** via `BYLINE_OPERATOR_ORG_ID` env: a configured
  Clerk org_id can read NULL-org seed subjects in addition to its
  own. Used for dogfooding the 11 seed subjects from a real Clerk
  session; leave blank in customer-facing deployments.

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

  5. **Frontend pages (Phase D)** — partially shipped:
     - **Overview page** (`/subjects/[id]/page.tsx`) — production-ready
       customer-facing brief. Trigger refresh wired into the sticky
       Header. See "Customer-facing dashboard brief" subsection above
       for the full feature list.
     - **Hub-and-spokes sub-pages** (Narrative, Visibility, Competition,
       Topics, Sources, Prompts, Reports, Settings) — sidebar items
       exist but every link except Overview goes nowhere. Per the IA
       decisions in "Next-priority items," each spoke is its own
       `page.tsx` under `web/app/subjects/[id]/`. None built yet.
     - **Methodology section** — footer link `Methodology →` still
       points at `#`. Adding an in-page `<section id="methodology">`
       near the bottom of the Overview is the smallest blocker to
       customer credibility. ~20 min.
     - **Landing page (`/`)** — still the v0 scaffold (zinc tokens,
       plain table, no Sidebar/Header chrome). Visually jarring vs
       the polished Overview. Hydration risks fixed (locale-pinned
       date formatting), v0-scaffold dev tell removed from footer,
       but a real redesign is the biggest pre-demo cosmetic gap.
     - **Per-refresh findings drill-down** + response detail view +
       category-aware setup_inputs forms — original Phase D scope,
       still not built.
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
