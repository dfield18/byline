# byline — project state

> A pulse-check of where the project sits **as of 2026-05-28**
> — three new spokes (Narrative, Sources, Prompts) stood up
> from scratch, then a full Overview-spoke restructure into a
> five-band narrative layout with horizontal sub-nav, then a
> deep two-pass data-correctness sweep that shipped 26
> defensive fixes across the page (tied-rank protection,
> finite/clamp guards, label↔value consistency, threshold
> harmonization, trajectory length normalization at the API
> boundary), then a Visibility-spoke parity pass that brought
> the spoke's sub-nav, briefing tiles, and section formatting
> into alignment with Overview (shared `OverviewSubNav`,
> filters in the sub-nav's right slot, flat KPI tiles, flat
> sections, brand icons for platform names). The big themes:
>
> - **Overview spoke restructured into five bands** (commit
>   `bfda60f`): Vitals → Gap → Competitive → Sources → Evidence,
>   each anchored to a section id that matches the new
>   horizontal sticky sub-nav. Replaces the prior hero card that
>   had absorbed verdict + SoV + takeaways + recommendation into
>   one overloaded surface, and the duplicate Visibility Trends
>   section. Right-rail `OverviewSectionNav` retired in favor of
>   `OverviewSubNav` (horizontal `<nav>` pinned `top-16 z-10`
>   under the Header); content + sub-nav + Header inner all cap
>   at `max-w-[1280px]` so bands, header controls, and nav
>   links align. Killed the fragile `xl:pr-[260px]` corridor
>   pattern entirely.
> - **Overview Vitals card** = subject verdict + 3-up KPI strip
>   (Mention Rate / Net Favorability / First Result Mentioned),
>   each with sparkline + inline trend delta beside the value
>   (`↓10 pp` etc., color-toned by direction). Sparkline plot
>   range padded asymmetrically (40% below, 15% above) so the
>   line never grazes the bottom edge. Reserved subtitle slot
>   on every KPI tile + `mt-auto` on the sparkline align the
>   baselines across all three tiles.
> - **Band 2 = Gap | Strongest asset | Fix three-up**, equal-
>   height. Gap card eyebrow + tone swap dynamically based on
>   `hasRealVisibilityGap()`: warning-toned "Visibility gap by
>   topic" when there's a real spread, success-toned "Topic
>   visibility" when all topics tie ≥70%, neutral otherwise.
>   Strongest asset moved here from the old Competitive band so
>   the trio reads as weakness ↔ strength ↔ action.
> - **Band 3 = Competitive standing**: SoV bars (top 5, subject
>   highlighted) + computed Competitive Position stat stack
>   (rank, gap-to-leader / lead-over-runner-up, SoV trend) on
>   the right. Stats derived from the same `data.competitive`
>   array that feeds the bars, so chart + stats can't drift.
>   Second card flips label AND value together based on rank
>   ("Lead over runner-up / +N pts / ahead of {runnerUp}" when
>   subject is #1, "Gap to leader / −N pts / behind {leader}"
>   otherwise). Tie case ("Tied with X") explicit; single-entity
>   peer set hides the card.
> - **Verdict copy reframed** so the contrast lands at the
>   punchline: "AI mentions {X} in {N}% of answers about
>   {comparator} — but only {M}% on {weakest}." `formatComparator`
>   now names every topic inline regardless of label length;
>   pure-count fallback ("every other tracked topic") only kicks
>   in beyond 6 topics. Empty/all-tied case returns null and
>   falls back to the server `bottom_line`.
>
> - **Narrative spoke shipped.** Four right-rail briefing tiles
>   (Avg Sentiment / Most Positive Topic / Most Negative Topic /
>   Mean Criticism Intensity), per-topic sentiment matrix,
>   narrative cluster cards (now clickable — selecting a card
>   filters Representative Quotes via `?cluster=` URL param),
>   sentiment trend sparklines per cluster, and a Representative
>   Quotes feed (default 2 per cluster, full text on expand).
>   All built on extended `_read_narrative_clusters` (now attaches
>   `sentiment_mean`, `topic_distribution`, `platform_distribution`).
> - **Sources spoke shipped.** Four briefing tiles (Top Source,
>   Sources Tracked, Total Citations, Self-Citation Rate); Top
>   Sources table with **response coverage** + per-source platform
>   chips; Authority Mix bar chart. Backend `_top_sources_for_refresh`
>   rewritten from pre-aggregated counts to raw rows so we can
>   compute `response_coverage` (distinct response_ids / total) and
>   the per-source `platforms[]` list.
> - **Prompts spoke shipped.** Sortable per-prompt table with CSV
>   export (RFC 4180 escaping + BOM), PNG export via dynamic-import
>   `html-to-image`, and two-level click-to-expand: row → per-platform
>   response previews → full scrollable per-platform response. Full
>   response text fetched on-demand from a new backend route
>   `GET /api/subjects/{subject_id}/prompts/{prompt_id}/responses`
>   (Python) proxied through a same-origin Next.js route at
>   `app/api/subjects/[id]/prompts/[promptId]/responses/route.ts`
>   so the client component never imports `server-only` / Clerk
>   server auth modules.
> - **Visibility filter consolidation.** Four per-section URL params
>   (`position_topic`, `position_platform`, `platform_topic`,
>   `topic_platform`) collapsed into two globals (`topic`,
>   `platform`); 44 references renamed. Per-section filter chips
>   removed in favor of a single `filters` slot on the Visibility
>   SectionNav rail.
> - **Backend signal expansion** in `dashboard/lib/queries.py`:
>   `_topic_sentiment_matrix_for_refresh` (per-topic sentiment +
>   lean + certainty), `_platform_sentiment_distribution_for_refresh`
>   (per-platform pos/neu/neg + mean — uses a local `display` map
>   for platform pretty-names since `models` table has no
>   display-name column), `_scoped_score_trajectories` (bulk
>   per-(refresh × topic) and per-(refresh × platform) score arrays
>   for the four narrative scores), `get_prompt_responses_for_subject`
>   (org-scoped per-(subject, prompt) per-platform response fetch),
>   `_kpis_per_refresh_bulk` extended with `net_sentiment` +
>   `directional_lean` + `criticism_severity` + `certainty`,
>   `_trajectory_for_subject` exposes the new score arrays.
> - **Overview polish pass.** Section order reflowed:
>   Hero → **Evidence** (promoted to #2) → Trends → Topics →
>   Competition → Sources. `BottomLineBlock` redesigned (larger
>   balanced headline, secondary "Strategic takeaways +
>   Recommended Move" tier under a soft divider). `HeroKpis`
>   removed entirely (173 lines) — the TrajectoryStrip below now
>   owns those KPIs without duplication. `TopicRecallChart` bars
>   color-tiered (`success` ≥ 70 / `primary` ≥ 40 / `warning`),
>   weakest topic always shown in warning. `MiniSpark` got a date
>   tick row underneath. Evidence card badges swapped to prominent
>   tonal pills (`bg-warning/15 text-warning` etc). "What changed"
>   footer added under TrajectoryStrip with overall mention-rate
>   delta + top 3 topic movers. Snapshot history `<details>`
>   disclosure removed. Right-rail Filters card removed from
>   Overview specifically (kept on other spokes — Overview
>   sections don't yet narrow on topic/platform scope).
> - **Overview Bottom Line copy in plain English**:
>   "When asked about X, AI mentions Y in only N% of answers —
>   well below the M% average across other tracked topics (...)."
>   Citation Rate trend chart title clarified to
>   "Citation Rate (mentioning own site)". Snapshot legend reads
>   "Open circles are backfilled estimates; filled are real-time."
>   Narrative mix definition reads "Recurring AI framings —
>   each bar is the share of responses in that theme."
> - **New right-rail nav**: `OverviewSectionNav` (parallels the
>   spoke SectionNavs) drives the Overview scroll-spy. Each spoke
>   now has its own `SectionNav` component with the same visual
>   language (`w-[220px]`, IntersectionObserver, optional `filters`
>   slot).
> - **Competition spoke** moved into its own directory
>   (`app/subjects/[id]/competition/`) with its own SectionNav +
>   scatter + filter components — split out of the Visibility
>   spoke when the filter consolidation shipped.
>
> Removed along the way: `FilterBar.tsx`, `PlatformTopicFilter`,
> `TopicPlatformFilter`, `TopicPositionFilter`,
> `PositionPlatformFilter`, `CompetitiveScatter` (moved),
> `CompetitiveTabs`, `HeroKpis`, `getKpiChangeDisplay`, the
> Overview snapshot history `<details>`. Replaced by
> `VisibilityTopicFilter` + `VisibilityPlatformFilter` (shared
> across Visibility) and per-spoke `SectionNav` components.
>
> Builds on the 2026-05-21 Visibility hub restructure (commit
> `a6aa0e8`); 2026-05-17 Overview hero consolidation + Sources
> polish + hub-and-spokes wiring; 2026-05-16 dual QA passes;
> 2026-05-15 Recommended Actions LLM refactor.
>
> Read this first if you're a fresh Claude Code session picking up
> work. Update when state shifts meaningfully.

---

## Latest session (2026-05-22 → 2026-05-23) — Spokes buildout + Overview polish

Two commits on `main`:

- **`c99c94b`** — Dashboard: ship Narrative + Sources + Prompts
  spokes; deeper backend signal coverage; Visibility filter
  consolidation; Competition spoke split out.
- **`cb87739`** — Overview + Narrative: hero + reorder +
  clickable clusters. 2 files, 508 ins / 475 del.

### Backend (`dashboard/lib/queries.py`, `app/api/routes/subjects.py`)

New / extended functions in `queries.py`:

| Function | What it returns |
|---|---|
| `_topic_sentiment_matrix_for_refresh` (new) | Per-topic sentiment + directional lean + certainty for the Narrative spoke's topic matrix. Topic labels come from `_topic_for_prompt` so they line up with the Visibility spoke. |
| `_platform_sentiment_distribution_for_refresh` (new) | Per-platform pos/neu/neg counts + mean sentiment. Uses a **local** `display = {"chatgpt": "ChatGPT", ...}` map for pretty names because the `models` table has no display-name column — the original draft tried `m.identifier` and broke with `column m.identifier does not exist`, causing ECONNRESET on page load. |
| `_scoped_score_trajectories` (new) | Bulk per-(refresh × topic) and per-(refresh × platform) means for the four narrative scores (sentiment, directional_lean, criticism_severity, certainty). Single query per scope; powers `trajectory_by_topic` + `trajectory_by_platform` arrays on `SubjectOverview`. |
| `_read_narrative_clusters` (extended) | Now accepts `setup_inputs` and attaches `sentiment_mean` (mean of cluster response_ids' sentiment), `topic_distribution` (counts grouped via `_topic_for_prompt`), and `platform_distribution` (counts grouped by `m.slug`) to each cluster row. |
| `_top_sources_for_refresh` (rewritten) | Rewritten from pre-aggregated counts to raw `(response_id, platform_slug, domain, source_type)` rows so we can compute `response_coverage` (distinct response_ids / total) and per-source `platforms[]` chips. |
| `_kpis_per_refresh_bulk` (extended) | Now also returns `directional_lean`, `criticism_severity` (mean intensity), `certainty`, `net_sentiment` per refresh. |
| `_trajectory_for_subject` (extended) | Exposes the same four score arrays + `net_sentiment` alongside the existing mention-rate/citation/rank trajectories. |
| `get_prompt_responses_for_subject` (new) | Org-scoped per-(subject, prompt) fetch returning per-platform full `response_text` + `mentioned` + `rank`. Powers the Prompts spoke's lazy-fetch row expansion. |

New API route in `app/api/routes/subjects.py`:

```
GET /api/subjects/{subject_id}/prompts/{prompt_id}/responses
  → { responses: [{ platform, response_text, mentioned, rank, ... }] }
  → 404 if subject/prompt not in caller's org
```

### Frontend — new spokes

| Spoke | Files |
|---|---|
| **Narrative** | `web/app/subjects/[id]/narrative/page.tsx` + briefing tiles + topic sentiment matrix + cluster cards (clickable → `?cluster=` URL param filters Representative Quotes) + sentiment trend sparklines |
| **Sources** | `web/app/subjects/[id]/sources/page.tsx` + `SectionNav.tsx` (Top Sources, Authority Mix) + 4 briefing tiles + per-source platform chips |
| **Prompts** | `web/app/subjects/[id]/prompts/page.tsx` + `PromptsTable.tsx` (sortable, CSV export with RFC 4180 escaping + BOM, PNG export via dynamic-import `html-to-image`, two-level click-to-expand with per-platform response previews → full scrollable text) |
| **Competition** (split out) | `web/app/subjects/[id]/competition/` — `page.tsx`, `SectionNav.tsx`, `CompetitiveScatter.tsx`, `LandscapePlatformFilter.tsx`, `TopicProminenceFilter.tsx` (renamed from visibility/) |

New shared client component:

- **`web/app/subjects/[id]/OverviewSectionNav.tsx`** — floating
  right-rail nav for the Overview spoke, IntersectionObserver
  scroll-spy, optional `filters?: ReactNode` slot (currently
  unused on Overview since the Filters card was pulled).

New Next.js proxy route (same-origin, keeps client bundle clean):

- **`web/app/api/subjects/[id]/prompts/[promptId]/responses/route.ts`**
  — proxies the backend `get_prompt_responses_for_subject` call.
  Required because importing `getPromptResponses` from `lib/api.ts`
  directly into a client component pulled in `server-only` /
  Clerk server auth and broke the build.

### Visibility filter consolidation

Four per-section URL params collapsed into two globals:

```
old: ?position_topic, ?position_platform, ?platform_topic, ?topic_platform
new: ?topic, ?platform   (apply across the whole spoke)
```

44 variable references renamed via a Python script. Per-section
filter chips removed in favor of a single `filters` slot on the
Visibility `SectionNav` rail. `FilterBar.tsx`, `PlatformTopicFilter`,
`TopicPlatformFilter`, `TopicPositionFilter`,
`PositionPlatformFilter` all deleted; new shared
`VisibilityTopicFilter` + `VisibilityPlatformFilter` components.

### Overview polish (commit `cb87739`)

- **Section reorder**: Hero → **Evidence** (promoted to #2) →
  Trends → Topics → Competition → Sources. Implemented by moving
  the Evidence `<section>` block above TrajectoryStrip and
  reordering the `overviewSectionNavItems` push order so
  auto-numbering reflows.
- **HeroKpis removed** (173 lines) + `getKpiChangeDisplay` helper
  removed (52 lines) — the duplication of the TrajectoryStrip
  KPI tiles is gone. `TrendingUp`, `TrendingDown`, `Minus`,
  `KpiValue` imports dropped along with them.
- **`BottomLineBlock` redesigned**: no left-border, larger
  balanced headline (`text-[19px] md:text-[21px]`,
  `[text-wrap:balance]`); Strategic takeaways + Recommended Move
  grouped under a `border-t border-border/40` divider as a
  visually secondary tier with reduced type.
- **Plain-English Bottom Line copy**: `buildGapBottomLine`
  rewritten to "When asked about X, AI mentions Y in only N% of
  answers — well below the M% average across other tracked
  topics (Current events and 2 more)." Was: "AI underweights
  X on Y — N% mention rate vs M% average across ...".
- **`TopicRecallChart` color tiers**: bars colored
  `success` ≥ 70 / `primary` ≥ 40 / `warning` < 40; the
  weakest topic is always forced to warning regardless.
- **`MiniSpark` date row**: small tabular-nums row underneath
  each sparkline showing start / midpoint / end dates from the
  underlying snapshots.
- **Evidence card badges → tonal pills**: `EVIDENCE_BADGE_TONE`
  map produces `bg-warning/15 text-warning` etc; the previous
  `<Pill>` component is gone in this surface in favor of plain
  `<span>` with the tone classes.
- **"What changed" footer** under TrajectoryStrip with overall
  mention rate delta + top 3 topic movers (inline IIFE that
  mirrors the Visibility spoke's `composeWhatChanged`).
- **Snapshot history `<details>` disclosure removed.**
- **Right-rail Filters card removed from Overview only** —
  other spokes keep theirs. Overview sections don't yet narrow
  on `topic` / `platform`, so the filter UI was misleading.
- **Citation Rate trend chart title** clarified to
  "Citation Rate (mentioning own site)".
- **Snapshot legend** reads "Open circles are backfilled
  estimates; filled are real-time." (was equals-signs).
- **Narrative mix definition**: "Recurring AI framings — each
  bar is the share of responses in that theme."

### Narrative spoke — clickable cluster cards

- New URL param `?cluster=<name>` with server-side validation
  + redirect when the value doesn't match any cluster name.
- `activeClusterResponseIds: Set<number>` precomputed for O(1)
  membership filter in the Representative Quotes section.
- `buildClusterHref(name | null)` helper preserves topic +
  platform params and appends a `#clusters` anchor so the page
  doesn't jump on click.
- Active cluster gets visual treatment
  (`bg-primary/[0.07] ring-1 ring-primary/30`) and a
  "FILTERING QUOTES" pill. When a cluster is active, the
  Representative Quotes section shows an advisory line
  (`Filtered to the "<name>" narrative cluster`) + a
  "Show all quotes" link.
- `aria-current="true"` (not `aria-pressed`) on the anchor since
  it's role=link.

### Sidebar enablement

`web/components/dashboard/Sidebar.tsx`:

- Removed Topics nav entry + `Hash` icon import (Topics tab not
  shipped yet, was a dead slug).
- Enabled `narrative`, `sources`, `prompts` slugs (was `null` for
  COMING SOON).
- Extended `NavSection` union to include the three new slugs.

### Behavior changes / things to watch

- **`SubjectOverview` shape additions are additive** — no
  breaking renames since the 2026-05-21 push. New fields:
  `topic_sentiment_matrix`, `platform_sentiment_distribution`,
  `trajectory_by_topic`, `trajectory_by_platform`,
  `narrative_clusters[].sentiment_mean`,
  `narrative_clusters[].topic_distribution`,
  `narrative_clusters[].platform_distribution`,
  `sources[].response_coverage`, `sources[].platforms[]`.
- **Same uvicorn `--reload` caveat**: if a field doesn't show
  up after a `SubjectOverview` shape change, restart uvicorn
  (`--reload` sometimes caches module-level imports in this
  codebase). Hit this again this session.
- **ECONNRESET on backend fetch during page load** is a
  transient uvicorn `--reload` artifact when file changes
  trigger a worker restart mid-request. Backend stays alive
  (`curl` returns 401 cleanly). No code fix needed; if it gets
  annoying, add a retry helper in `web/lib/api.ts` or run
  uvicorn without `--reload`.
- **Recurring false-positive validation hook** still flags local
  `new URLSearchParams(...)` blocks as "params is async, add
  await". The page's actual `params` prop *is* awaited correctly
  at function top — the hook is matching the wrong line. Ignore.

---

## Follow-up session (2026-05-23, later) — Overview restructure + polish

Two more commits on `main`:

- **`bfda60f`** — Overview: five-band narrative restructure +
  horizontal sub-nav. 5 files, 1028 ins / 956 del.
- **`724500c`** — Overview: KPI trend deltas + label clarity +
  Band 2 polish. 1 file, 266 ins / 113 del.

### Five-band layout (commit `bfda60f`)

Replaced the prior Overview structure (overloaded hero card +
duplicate Visibility Trends + Sources + Evidence) with five
sequential bands that read as one top-down argument:

| Band | id | Contents |
|---|---|---|
| 1 Vitals | `vitals` | Subject verdict (BottomLineBlock) + 3-up KPI strip (Mention Rate / Net Favorability / First Result Mentioned) each with sparkline + trend delta. "Open Visibility deep-dive →" link in the strip footer. |
| 2 Gap & Fix | `gap` | 3-up: warning-toned "Visibility gap by topic" (TopicRecallInline bars) / success-toned "Strongest asset" / primary-tinted "The fix · recommended move" with "View all N recommendations →" link. |
| 3 Competitive | `competitive` | 2-up (`1.4fr 1fr`): SoV bars (top 5, subject highlighted) + Competitive Position stat stack (rank / gap-to-leader / SoV trend). Stats derived from the SAME `data.competitive` array as the bars via `deriveCompetitivePosition()`. |
| 4 Sources | `sources` | SectionTitle moved INTO the left column of the grid so the donut on the right aligns with the section heading. Table capped at top 5. |
| 5 Evidence | `evidence` | 3-up equal-height EvidenceCards (`items-stretch` + `flex h-full flex-col` + `mt-auto` Frame footer, em-dash placeholder when frame is null). |

### Horizontal sticky sub-nav (commit `bfda60f`)

`OverviewSectionNav.tsx` (right-rail) **deleted**. Replaced by
`OverviewSubNav.tsx`: horizontal `<nav aria-label="Page sections">`
pinned `sticky top-16 z-10` directly under the Header. Five
labelled links matching the band ids. Scroll-spy via
IntersectionObserver (rootMargin `-115px 0px -55% 0px`); active
link gets a 2px primary underline. Real `<a href="#…">` anchors
so navigation works without JS.

Layout consequence: dropped the `xl:grid xl:grid-cols-[minmax(0,1fr)_200px]`
content/rail two-column wrapper. Main content now uses the full
width of its container (capped at `max-w-[1280px]`). No more
empty right gutter; bands span the full content width.

### Content-width cap (commit `bfda60f`)

`max-w-[1500px]` → `max-w-[1280px]` on the populated and empty
Overview `<main>` elements. The `OverviewSubNav` inner content
and the shared `Header`'s inner content also cap at `1280px` so
all three layers align edge-for-edge. The outer `<header>` and
`<nav>` backgrounds still span full-viewport — only the inner
controls cluster centered.

⚠️ **Cross-spoke regression to track**: other spokes (Visibility
1400, Narrative 1400, Sources 1400) still use `max-w-[1400px]`
on their main. Their content now extends ~60px past the centered
Header controls on wide screens until they're tightened to 1280
in a follow-up. Header.tsx carries a code comment flagging this.

### Vitals polish (commit `724500c`)

- **Inline trend delta beside each KPI value** (e.g. `90% ↓10 pp`),
  color-toned by direction (success rising, warning falling,
  muted on zero). Value color stays driven by absolute level;
  the delta carries the directional signal — resolves the
  "green value + falling sparkline" misread that prior versions
  had. Prior value = most recent finite value before the latest
  (scans right-to-left from index `length-2` so a backfill gap
  immediately before the latest doesn't kill the delta).
- **`MiniSpark` plot range asymmetrically padded** (40% below
  the data, 15% above) so the line floats inside the chart
  rather than grazing the bottom edge. Axis labels still show
  the actual data extremes — only the line's vertical position
  gets headroom. Min/max use a `dataMin` / `dataMax` /
  `plotMin` / `plotMax` split internally.
- **KPI tiles equalized**: `items-stretch` on the grid +
  `flex h-full flex-col` on each tile + `mt-auto pt-3` on the
  sparkline mount, plus a reserved subtitle slot rendered on
  every tile (non-breaking space placeholder when no subtitle)
  so the title block height is identical across the strip.
  Sparkline baselines now align across the three tiles regardless
  of which carries a subtitle.
- **Inter-tile gap** bumped `gap-4` → `gap-8` so the
  value/delta on one tile doesn't crowd the sparkline of the
  next.

### Label clarity (commit `724500c`)

| Old | New |
|---|---|
| "Top Result Rate" | "First Result Mentioned" |
| "Average Tone" | "Net Favorability" (tooltip updated) |
| (no subtitle on AI Mention Rate) | `across all topics` subtitle |
| "AI Narrative Brief" eyebrow + Subject H1 inside Vitals card | both removed; `BOTTOM LINE` is the only eyebrow |

Internal field names unchanged (`top_result_rate`, `avg_sentiment`,
etc.) — display labels only.

### Verdict copy reframed (commit `724500c`)

Old template (gap led, contrast buried in parenthetical):
> When asked about X, AI mentions Y in only N% of answers — well
> below the M% average across other tracked topics (Foo, Bar, …).

New template (strong leads, gap is the punchline):
> AI mentions Y in M% of answers about Foo, Bar, and Baz — but
> only N% on X.

`formatComparator` rewritten: names every topic inline regardless
of label length; the pure-count fallback ("every other tracked
topic") only fires when there are more than 6 topics (was
bucketing labels >40 chars into "and N more"). `MAX_INLINE_LABEL_CHARS`
constant retired. Verdict title typography dropped `17/18` →
`16/17` to make room for longer lists. Empty/all-tied case
returns null and falls back to `data.bottom_line`.

### Band 2 polish (commit `724500c`)

- **Equal-height** cards: `items-stretch` on the grid +
  `flex h-full flex-col p-6` on each Card + `mt-auto pt-3` on
  the Fix card's "View all N recommendations →" link.
- **Dynamic gap-card eyebrow + tone** driven by new module-level
  helper `hasRealVisibilityGap()`:
  - real gap → `VISIBILITY GAP BY TOPIC` (warning)
  - all topics tied ≥70% → `TOPIC VISIBILITY` (success)
  - all topics tied <70% → `TOPIC VISIBILITY` (neutral)
- Shared `TIE_EPSILON` constant promoted to module level
  (was shadowed inside `buildGapBottomLine` and `TopicRecallInline`).

### Band 3 polish (commit `724500c`)

- Second stat card flips label AND value together based on
  rank: `LEAD OVER RUNNER-UP / +N pts / ahead of {runnerUp}`
  when subject is #1, `GAP TO LEADER / −N pts / behind {leader}`
  otherwise.
- Tie case (gap = 0) renders `Tied with {peer}` instead of
  `+0 / −0 pts`.
- Single-entity peer set (no runner-up) hides the card entirely
  via the `stats.comparatorName !== null` guard.

### New / removed components

- **New**: `web/app/subjects/[id]/OverviewSubNav.tsx` (horizontal
  sticky sub-nav with scroll-spy).
- **New helpers in `page.tsx`**: `StatCard`, `TinySpark`,
  `deriveCompetitivePosition`, `hasRealVisibilityGap`,
  `pickTopWithSubject`.
- **Deleted**: `web/app/subjects/[id]/OverviewSectionNav.tsx`
  (right-rail superseded by `OverviewSubNav`).
- **Retired functions / constants** in page.tsx:
  `formatRefreshKind`, `MAX_INLINE_LABEL_CHARS`, the bucketing
  branch of `formatComparator`.

---

## Follow-up session #2 (2026-05-23, late) — Top Narratives, click-to-expand evidence, deep data QA

Three commits on `main`:

- **`4782a48`** — Overview: Top Narratives + click-to-expand
  evidence + deep data QA pass. 4 files, 848 ins / 122 del.
- **`7a5e28d`** — Cleanup: unify spoke widths at 1280, drop
  unused strategic_takeaways, doc tidy. 9 files, 33 ins / 44 del.
- **`0fb9dc3`** — Overview: defensive parity pass +
  tie-detection consistency. 4 files, 196 ins / 44 del.

### Band 2 middle card replaced: Strongest Asset → Top Narratives

The middle card in Band 2 (Gap | × | Fix) flipped from a topic-
mention-rate list (which duplicated the Gap card's data) to a
narrative-cluster list driven by `data.narrative_clusters`:

- **`TopNarrativesList`** renders the top 4 clusters by share,
  one row per cluster via the shared `TopicBarRow`.
- Each bar is **sentiment-toned** from `cluster.sentiment_mean`
  (≥0.1 favorable / ≤−0.1 critical / else neutral), paired
  with a small sentiment dot next to the label so the meaning
  carries for colorblind / grayscale viewers.
- ±0.1 neutral band matches the same threshold the backend
  uses to compute `net_sentiment` counts, so the bar coloring
  agrees with the analyzer's own classification.
- Color legend rendered as a card footer
  (`● Favorable · ● Neutral · ● Critical`) so the meaning
  doesn't have to be guessed.
- Tied-top highlight suppressed when ambiguous (parity with
  Gap card + competitive rank tie handling).
- Share clamped to `[0, 1]` with `Number.isFinite` guard
  before `Math.round * 100`.
- Footer caption notes shares are independent — clusters can
  overlap, so the bars don't have to sum to 100%.

### Click-to-expand Evidence cards + full-AI-response fetch

New client component `web/app/subjects/[id]/EvidenceExcerpt.tsx`
gives every Evidence quote two layers of expansion:

- **Show more / Show less** — toggles line-clamp-4 on the
  cross-analyzer's quoted excerpt (no network call). Fires when
  the excerpt exceeds `TRUNCATE_THRESHOLD_CHARS` (240) OR
  contains ≥3 newlines (caught by `countNewlines`, matches
  `\n` / `\r\n` / `\r`). Newline check resolves the case where
  an excerpt was short by character count but clamped by
  paragraph breaks at the visible-line level.
- **Show full AI response** — lazy-fetches the full per-platform
  response text via the existing
  `/api/subjects/{id}/prompts/{promptId}/responses` proxy,
  filters to this card's `model_slug`, renders inline in a
  `max-h-[260px] overflow-y-auto` panel. States handled:
  loading / error / empty / success / toggle off.

**Backend**: `_read_evidence_cards` now SELECTs `mr.prompt_id`
and includes it on every `evidence_cards[]` entry. Frontend type
extended to match. `EvidenceCard` props bumped to thread
`subjectId` + `card.prompt_id` + `card.model_slug` into the
new excerpt component. Requires a uvicorn restart after the
SQL change (caught it once during the session — module cache
caveat documented earlier still applies).

### Per-platform mention-rate chip strip in Band 1

New `PlatformBreakdownStrip` component renders under the Vitals
KPI sparklines (when `data.platform_recall.length > 1`). Each
chip shows `{platform name} {N%}` with the rate color-toned by
the same `mention_rate` thresholds the KPI value uses. Answers
"is the headline rate universal or driven by one platform?" —
unanswerable before without scrolling to the Visibility deep-
dive. Chips also include `n_responses` in the title attribute
for sample-size context. Pct clamped to `[0, 100]` defensively.

### Brand icons replace model dots on Evidence cards

`MODEL_ICON` map added: `SiOpenai` / `SiGooglegemini` /
`SiAnthropic` / `SiPerplexity` from `react-icons/si`, same icon
set the landing page's "Platforms monitored" strip uses. Each
Evidence card's top-row platform marker is the brand glyph at
`h-3.5 w-3.5 text-foreground/70` instead of the prior 1.5×1.5px
colored dot. Falls back to the original colored dot when a
`model_slug` doesn't have a brand mark.

### Cross-spoke width unified at 1280

All five spokes (Visibility, Narrative, Competition, Sources,
Prompts) bumped from `max-w-[1400px]` → `max-w-[1280px]` to
match Overview + the shared Header's inner cap. The earlier
session flagged this as a regression where other spokes'
content extended past the centered Header controls; that's
closed now. Header.tsx code comment updated to reflect
unified-width state.

### Backend payload trim: `strategic_takeaways` dropped

`get_subject_overview` stops serializing `strategic_takeaways`
in its response dict (both populated and empty-overview
branches). Still computed internally as input to
`_compute_bottom_line` + `_compute_recommended_focus`, but no
frontend / Streamlit / test reads it from the API response
(confirmed via grep). Saves ~1-2 KB/req. Frontend
`SubjectOverview` type drops the field to match.

### Deep data QA — fixes shipped this session (chronological)

1. Verdict **rounding-collapse** guard: `buildGapBottomLine`
   returns null when `weakestPct === otherPct` (single-other)
   or `weakestPct === meanOthersPct` (multi-other) so the
   sentence can never read "in N% ... but only N% on Y".
2. Verdict **tied-weakest** guard: returns null when the
   weakest's recall ties (within `TIE_EPSILON`) with at
   least one other topic — the named-topic clause would
   otherwise flicker between snapshots based on backend
   insertion order. `TopicRecallInline` correspondingly
   glows ALL tied-at-weakest bars in warning together.
3. Verdict **empty-label** guards: returns null when
   `weakest.label` / `other.label` is empty; comparator list
   filters empty labels out before `joinList`.
4. **`_hasFiniteRecall`** now requires `n_responses > 0` —
   topic rows with `{n_responses: 0, ai_recall: 0}` no longer
   render as misleading 0% bars in the Gap card.
5. **Competitive rank tie** detection: `deriveCompetitivePosition`
   surfaces `rankIsTied`; rank stat renders "Tied #N" when
   subject's SoV is within tie tolerance of an adjacent entity.
6. **`pickTopWithSubject` zero-SoV skip**: when subject's SoV
   is below `SOV_TIE_EPSILON`, function returns natural top N
   rather than displacing a real-data peer with an empty-bar
   subject.
7. **Negative-SoV defensive floor** at both `CompetitorBarsFromData`
   call sites: `Number.isFinite(c.sov) ? Math.max(0, c.sov) : 0`.
   Backend NaN / Infinity / round-off-negative can't render a
   visually broken bar.
8. **`TopNarrativesList` tied-top highlight** suppressed when
   ambiguous; share clamped `[0, 1]`.
9. **KPI delta unit `pp` → `pts`** to match the Competitive
   Position deltas. One unit across the page.
10. **KPI delta + SoV-trend delta** now require the IMMEDIATELY
    preceding snapshot (not the nearest finite predecessor).
    "vs prior snapshot" copy is honest — never silently spans
    2+ snapshots when a backfill gap sits before the latest.
11. **SoV trend stat eyebrow renamed** to "Entity-mix share
    trend" with sub-line "subject's slice of all tracked-entity
    mentions" — disambiguates from the Band 3 bar chart's
    mention-rate definition (both were colloquially "share of
    voice"; the data definitions actually differ).
12. **`TinySpark` padding harmonized** with `MiniSpark` (40%
    below / 15% above the data range).
13. **`MiniSpark` plot range** padded asymmetrically so a 90%
    value doesn't appear to bottom out at 0%.
14. **`normalizeTrajectory`** runs on every `getSubjectOverview`
    response: pads short series (null / -1 / false sentinels)
    and right-truncates long ones to match `weeks.length`
    exactly. The latest value can never bind to the wrong date
    even if the backend regresses on array alignment. Series
    enumerated explicitly so new fields can't silently bypass.
    Plus an empty-trajectory early-return when `t.weeks` is
    missing so the page degrades to its zero-snapshots
    empty-state branch instead of 500-ing.
15. **`formatPct` / `formatTonePct` clamp** to `[0, 1]` /
    `[-1, 1]` before display. No KPI percentage / sparkline
    axis label / Source influence number can render >100%.
16. **`TopicRecallInline` row pct** clamped at 100.
17. **`PlatformBreakdownStrip` chip pct** clamped at `[0, 100]`
    with `Number.isFinite` short-circuit.
18. **`getKpiValueColor("avg_tone")`** boundaries flipped from
    strict `>0.005 / <-0.005` to inclusive `>= / <=` so the
    color flips at the same threshold `formatTonePct` uses for
    "Neutral".
19. **`TopNarrativesList` sentiment band** uses inclusive
    `>= 0.1 / <= -0.1` so a cluster mean of exactly 0.1 gets
    the matching tone.
20. **Competitive gap label/value consistency**: `rankIsTied`
    and the gap value now share the same `roundedPp(a, b)`
    helper. Sub-pp gaps no longer produce a "Lead over
    runner-up" label paired with a "Tied with X" value.
21. **`deriveCompetitivePosition` finite guard**: `safeRows`
    coerces non-finite `c.sov` to 0 before sort + arithmetic.
    Stat stack can no longer render "NaN pts" / "Infinity pts".
22. **Band 2 dynamic column count**: grid uses `md:grid-cols-{N}`
    based on how many cards actually render. No more single
    card stretched across an empty 3-column row when
    `narrative_clusters` or `recommended_actions` is missing.
23. **`MiniSpark` date labels** force `timeZone: "UTC"` so a
    UTC-midnight snapshot doesn't appear as the previous day
    to viewers in PST/EST.
24. **`PlatformBreakdownStrip` + `SourcesList` row keys** use
    `${name}-${idx}` instead of `name` alone — defends against
    React key collisions if backend ever returns two same-named
    entries.
25. **`OverviewSubNav` observer dep**: `IntersectionObserver`
    `useEffect` keyed off a content-stable `itemsKey`
    (`items.map(i => i.id).join("|")`) rather than the items
    array reference. Observer only reattaches when the band-id
    set actually changes, not on every parent re-render that
    produces a fresh array.
26. **`EvidenceCard` layer tolerance**: `isSolicited` flipped
    from `layer === "named"` to `layer !== "unnamed"`. Any
    future layer (e.g. "mixed", "comparative") that still
    solicits the subject in the prompt gets the "Solicited
    prompt" tag automatically.

### Renames (display only — internal field names unchanged)

| Old | New |
|---|---|
| Top Result Rate | First Result Mentioned |
| Average Tone | Net Favorability (tooltip updated to match) |
| AI Mention Rate | + subtitle "across all topics" |
| The Gap · Mention Rate by Topic | Dynamic "Visibility gap by topic" / "Topic visibility" via `hasRealVisibilityGap` |
| Share-of-voice trend (stat card) | Entity-mix share trend |

### Verdict copy reframe

- Old: `When asked about X, AI mentions Y in only N% of answers — well below the M% average across other tracked topics (...).`
- New: `AI mentions Y in M% of answers about [topics] — but only N% on X.` Contrast lands at the punchline; em-dash split gives the BottomLineBlock a clean title clause + body clause.
- `formatComparator` simplified — names every topic inline
  regardless of label length; pure-count fallback
  ("every other tracked topic") only fires beyond 6 topics.
  `MAX_INLINE_LABEL_CHARS` constant retired.
- Verdict title typography dropped 17/18 → 16/17 to make
  room for longer topic lists.

### Vitals card structural changes

- **Subject H1 + "AI Narrative Brief" eyebrow removed** from
  the populated Vitals card (subject name lives in the header
  subject picker; the eyebrow duplicated "Bottom line").
  Empty-state card unchanged.
- **KPI tiles equalized**: `items-stretch` + `flex h-full
  flex-col` + `mt-auto pt-3` on sparkline + reserved subtitle
  slot, so sparkline baselines align across all three tiles
  regardless of which carries a subtitle.
- **Inter-tile gap** `4` → `8` so value/delta on one tile
  doesn't crowd the sparkline of the next.

### Band 3 refinements

- Second stat card flips **label AND value** together by rank:
  `Lead over runner-up / +N pts / ahead of {runnerUp}` when
  subject is #1; `Gap to leader / −N pts / behind {leader}`
  otherwise. Tie case explicit ("Tied with {peer}"); single-
  entity peer set hides the card via the `comparatorName !== null`
  guard.

### Sources / Evidence touch-ups

- Sources `SectionTitle` moved INTO the left column so the
  donut chart aligns vertically with the heading instead of
  starting below the table.
- Sources top-5 cap on the table.
- Evidence cards equal-height via `h-full` + `mt-auto` on the
  Frame footer; frame footer always rendered (em-dash
  placeholder when null) so the three cards line up.

### New / removed components + helpers

- **New**: `web/app/subjects/[id]/EvidenceExcerpt.tsx`
  (click-to-expand + lazy full-response fetch).
- **New** helpers in `page.tsx`: `TopNarrativesList`,
  `PlatformBreakdownStrip`, `MODEL_ICON` map, `countNewlines`.
- **New** helpers in `lib/api.ts`: `normalizeTrajectory`,
  `padOrTruncate`.
- **Removed**: `StrongestTopicsList` (replaced by
  `TopNarrativesList`), all dead doc comments referencing it.
- **Frontend type cleanup**: `strategic_takeaways` removed from
  `SubjectOverview`.

### Backend changes

- `dashboard/lib/queries.py`:
  - `_read_evidence_cards` SELECT extended with `mr.prompt_id`;
    each evidence card carries it on the payload.
  - `get_subject_overview` response dict stops emitting
    `strategic_takeaways` (still computed internally).

---

## Follow-up session #3 (2026-05-23, evening) — Visibility spoke: sub-nav + Overview formatting parity

One commit on `main`:

- **`f7609dd`** — Visibility: horizontal sub-nav + Overview
  formatting parity. 6 files, 186 ins / 369 del.

Brings the Visibility spoke's layout primitives into alignment
with the Overview spoke so the two surfaces feel like the same
product.

### Sub-nav: right-rail → horizontal sticky bar

- Replaced the right-rail `SectionNav` with the shared
  `OverviewSubNav` component, pinned directly under the Header.
  Items: `01 Trend · 02 Platforms · 03 Topics · 04 Prominence`.
  Same scroll-spy + 2px primary underline + IntersectionObserver
  pattern Overview uses.
- Dropped the `xl:pr-44` right corridor from `<main>` (no
  rail to reserve space for anymore). Main uses the full
  `max-w-[1280px]` cap.
- Section anchors bumped `scroll-mt-20` → `scroll-mt-28` so
  anchored jumps clear both the Header + sub-nav.
- **Deleted** `web/app/subjects/[id]/visibility/SectionNav.tsx`
  (orphaned after the swap).

### Filters in the sub-nav's right slot

- **`OverviewSubNav` gained an optional `right` ReactNode slot.**
  Inner layout flipped from `<div overflow-x-auto><ul>` to
  `<div flex items-center gap-4 h-11><ul>{right && <div ml-auto>}</div>`.
  Right group anchors to the row's right edge via `ml-auto`;
  list still hosts its own horizontal scroll when items
  overflow (no change to the unscoped Overview-spoke usage).
- **`VisibilityTopicFilter` + `VisibilityPlatformFilter` gained
  an `inline` prop.** Default vertical stack is preserved (the
  prior rail/inline-row callers still work); `inline=true`
  switches to a horizontal `label + select` layout with
  `max-w-[180px] / [160px]` caps so long topic names don't
  blow up the sub-nav row.
- Visibility page wires both filters into the sub-nav's right
  slot with `inline` enabled. The page-level filter row that
  briefly lived inside main (between the rail-removal and the
  right-slot wiring) is gone.

### Briefing KPI tile redesign — Overview TrajectoryStrip parity

The four briefing tiles at the top of the Visibility spoke
(AI Mention Rate · Average Mention Position · First Mention
Share · Weakest Topic Visibility) used to render as bordered
`rounded-lg border bg-background/60 p-5` cards with helper
text + polarity (`↑ higher is better`) + benchmark stacked
in the body. They now match the Overview's flat KPI tiles:

- **Flat tile** — `flex h-full flex-col`, no border, no
  background.
- **Title typography** — `text-[11px] uppercase tracking-wider
  text-muted-foreground` (was `text-[12.5px] font-semibold
  uppercase`).
- **Reserved subtitle slot** — `text-[10px] text-muted-foreground/75
  mt-0.5 line-clamp-1` with a non-breaking space placeholder
  when no subtitle. Weakest Topic Visibility's topic-name
  subtitle no longer pushes its value down out of alignment
  with the other three tiles.
- **Value typography** — `text-2xl font-semibold tracking-tight`
  (was `text-[28px] font-semibold leading-none`).
- **Helper + polarity removed** from the visible body. Helper
  text still lives in the `KpiTooltipIcon` tooltip; polarity
  has no Overview equivalent and was dropped.
- **Benchmark line preserved** at `mt-auto pt-3` in muted
  typography since Overview has no equivalent surface for
  cross-subject benchmarking and that line still carries real
  signal.
- **Inter-tile gap** `gap-4` → `gap-8` to match Overview.
- Anchor-wrapped tile lost the border-tinting hover (no
  border to tint); keyboard focus ring preserved.

### Cross-spoke formatting parity

- **Inter-section spacing** `space-y-16` → `space-y-10` (64px
  → 40px between sections) to match Overview's tighter rhythm.
- **Section Card wrappers stripped** from the four section
  bands (`<Card className="p-5 md:p-6">` / `<Card className="p-6 md:p-8">`
  removed around Trend / Platforms / Topics / Prominence
  sections). `SectionTitle` + content now sit flat in main —
  same editorial register as Overview's Trends / Sources /
  Evidence. The briefing Card at the top kept its wrapper
  (it's the hero of the page).
- **Brand icons for platform names** via `react-icons/si` —
  new module-level `PLATFORM_ICON` map in
  `visibility/page.tsx`:
  - `chatgpt → SiOpenai`
  - `gemini → SiGooglegemini`
  - `claude → SiAnthropic`
  - `perplexity → SiPerplexity`

  Same icon set Overview's Evidence cards + the landing page's
  "Platforms monitored" strip use. Wired into two surfaces:
  - **Per-Platform Snapshot heatmap** row labels — `{Icon}
    {name}` inline.
  - **Per-platform KPIs table** (Platforms band) row labels
    — same `{Icon} {name}` treatment.

  Icons render with `text-foreground/65` muted treatment so
  they don't compete with row content. Falls back to text-only
  when a slug doesn't have a mapped icon. **Not yet** wired
  into the `TrendOverTime` chart's legend — that's a separate
  component file and was left untouched in this pass.

### Evidence card single-expand simplification

`EvidenceExcerpt` (Overview spoke) collapsed from a two-tier
expand (`Show more` toggle + `Show full AI response` fetch)
to a single action: **Show full AI response only**. The
stored excerpt always renders line-clamped at 4 lines; the
only expansion is the full per-platform AI response fetch.
Dropped the `expanded` state, the `isLong` / `countNewlines`
heuristic, and the `TRUNCATE_*` constants. Rationale: the
cross-analyzer's stored excerpt is often truncated mid-
sentence by the extractor, so the full AI response is what
readers actually want when they expand — toggling the
clamp on the (often-truncated) excerpt was redundant.

### Component / file changes summary

- **`OverviewSubNav`** — added optional `right: ReactNode`
  prop and the corresponding inner-layout flip. Backward
  compatible (Overview spoke usage unchanged).
- **`VisibilityTopicFilter` / `VisibilityPlatformFilter`** —
  added optional `inline: boolean` prop; default vertical
  stack preserved.
- **`PLATFORM_ICON` map** added at module scope in
  `visibility/page.tsx`.
- **`EvidenceExcerpt`** — simplified to single-action.
- **Deleted**: `web/app/subjects/[id]/visibility/SectionNav.tsx`.

### Open follow-ups (Visibility-scoped, not done in this pass)

- `TrendOverTime` chart legend still renders platform names
  as plain text — picking up `PLATFORM_ICON` there would
  finish the cross-spoke icon coverage.
- Other spokes (Narrative, Sources, Competition) still use
  their own per-spoke `SectionNav.tsx` files with the right-
  rail pattern. They could be migrated to `OverviewSubNav`
  the same way Visibility was; not Overview-scoped so left
  untouched.

---

## Follow-up session #4 (2026-05-24) — Visibility/Competition design parity pass + chart polish

Five commits on `main`:

- **`73f057d`** — Visibility/Overview: shared KpiGauge + design parity + pts unit + status pill clarity. 4 files, 353 ins / 115 del.
- **`e436b6b`** — Competition + Visibility + Overview: cross-spoke layout + chart parity (Competition rebuild). 7 files, 900 ins / 437 del.
- **`4fb75b8`** — Competition: filter-aware Vitals + heatmap polish + chart fixes. 3 files, 301 ins / 72 del.
- **`d0a233b`** — Trend chart end-of-line labels + heatmap legends + cross-spoke copy fixes. 3 files, 313 ins / 47 del.
- **`6ab1f27`** — Trend end-labels opt-in + Position vs Share axis titles. 3 files, 124 ins / 71 del.

Brings the Competitive Visibility spoke into full structural alignment with the Visibility spoke, and pushes both spokes (plus Overview) through a polish pass: shared chart component, shared KPI tile primitive, tiered heatmaps, filter-aware copy, axis-title clarity, and a lot of small signal-quality fixes.

### Shared `KpiGauge` extracted (used by all three spokes)

`KpiGauge` lifted out of Overview's page into `web/components/dashboard/ui.tsx`. Accepts `value` (0..1), `benchmark` (0..1 | null), `fillColor`, and `benchmarkLabel`. When a benchmark is provided AND a label is passed, the gauge renders an inline legend beneath the bar: the same tick glyph that lives on the bar, paired with the caption text — so the eye reads "this glyph on the bar = this glyph in the legend = subject-set avg" without needing an external decoder. All three spokes (Overview Vitals, Visibility Briefing, Competition Vitals) render KPI tile gauges from the same component.

### Visibility spoke — full restyle + tiered heatmap + Trend axis rework

- **Sub-nav gained a `01 Vitals` item.** First briefing section anchored to `#vitals scroll-mt-28` so the sticky rail can land on it. Five items now: Vitals · Trend · Platforms · Topics · Prominence.
- **KPI tile rebuild.** Briefing tiles now consume `KpiGauge` with `benchmarkLabel` (subject-set-avg caption renders inside the gauge as the tick legend). `bg-muted/40 rounded-md p-4` tile chrome; label `text-[11px] uppercase tracking-wider`; value `text-2xl font-semibold tabular-nums`. **Weakest Topic** tile splits value into rate + topic-name suffix via new `valueSuffix` field on `KpiCard`: `"50%"` at `text-2xl` + topic at `text-base font-medium` — same row, baseline-aligned, eye lands on rate first.
- **Status pill semantics tightened.** "Mixed" → "Moderate" (mixed read as a trend word). Thresholds lifted to module constants `STATUS_STRONG_MENTION_RATE = 0.6` / `STATUS_STRONG_AVG_RANK_MAX = 3` / `STATUS_WEAK_MENTION_RATE = 0.3` so both the Platforms and Topics tables share one tunable source. Both Status column tooltips updated to explicitly state "Current visibility level (level only — trend lives in the Change column)" so the pill's meaning isn't ambiguous against the Change column it sits next to.
- **`pp` → `pts` sweep** across the entire spoke (Change columns, tooltips, "What changed" footer, copy).
- **Trend chart data-driven Y-axis.** Hardcoded `[0, 105]` domain replaced with floor/ceil rounding to nearest 5/10/20 step, clamped `[0, 105]`. Tick labels cap at 100. Default height dropped 420 → 320 so the chart no longer dominates the page. Empty-state height tracks the populated height. **`MIN_AXIS_SPAN = 25` floor** added later so tight clusters (subject hugging 90-100%) don't collapse the axis into a 10-pt window — distributes padding around the data midpoint.
- **"What changed" footer merged into the chart card** as its own footer (no `border-t`, text dropped 13px → 11.5px, padding tightened to `mt-3`). Reads as chart annotation, not a sibling section.
- **Current Platform Snapshot heatmap rewritten.** Continuous primary alpha ramp replaced with 3-tier `heatTier` system: `Gap <30%` (warning amber + warning border) · `Mid 30-60%` (neutral muted fill) · `Healthy ≥60%` (calm primary at 10% alpha) · null (dashed muted). Auto-summary line beneath: "One gap: X doesn't mention Y on Z." / "N gaps — largest:..." / "Full coverage..." derived from data, never empty. Color legend strip added below the grid so tier semantics don't require hover.
- **`line-clamp-2` + `flex` collision bug fixed** on heatmap topic headers (line-clamp forces `display:-webkit-box` which collides with `display:flex` — refactored to outer flex container + inner span with the clamp).
- **"Back to {subject} Overview" link removed.** Sub-nav handles spoke navigation.

### Competition spoke — full alignment with Visibility

The big lift of the session. Competition was on pre-treatment chrome (right-rail `SectionNav`, no shared `KpiGauge`, bordered tile cards with helper + polarity hints, continuous-alpha heatmap, no Vitals briefing copy). Brought it into structural parity:

- **`SectionNav` replaced with top-sticky `OverviewSubNav`.** Five items: Vitals · Trend · Landscape · Ranking · Co-Mentions. Filters (Topic + Platform dropdowns) migrated into the sub-nav's `right` slot via new `inline` prop on `TopicProminenceFilter` and `LandscapePlatformFilter`. Right-rail container deleted entirely. `<main>` lost `xl:pr-44` (no rail to reserve space for) and dropped `space-y-12` → `space-y-10` for tighter section rhythm.
- **Vitals briefing card built from scratch.** New `composeCompetitiveBottomLine()` helper generates a 1-2 sentence data-derived summary: rank + SoV + nearest-rival gap, then topic-win clause. "BOTTOM LINE" eyebrow + primary-tinted gradient overlay + coverage caveat — same hero treatment as Visibility's vitals card.
- **KPI tiles rebuilt to KpiGauge shape.** 4 tiles: Competitive Rank (gauge fills to subject SoV), Top Competitor (name-anchored, no gauge), Topic Win Rate (gauge fills to topicsLed/topicsTracked), Strongest Topic (name-anchored with `valueSuffix`). `gaugeBenchmark` stays null on every tile (no per-tile benchmark data shipped today; gauges render fill-only). Polarity hint line (`↑ higher is better`) dropped — tooltip already explains polarity.
- **Filter-aware Vitals copy** added later. Bottom-line and coverage caveat now prefix with the active scope when topic/platform filters are set: `"On ChatGPT, Newsom leads its 7-way comparison set..."` and `"Filtered scope: ChatGPT only (snapshot has 2 platforms × 4 topics)."` Topic-win clause suppressed when topic filter is active (would be a global claim inside a scoped view). Numbers were already filter-aware (computed from `landscapeEntities`); only the framing prose was misleading.
- **Current Platform Ownership heatmap rewritten.** Continuous SoV alpha ramp replaced with 3-tier `sovTier` system: `Marginal <15%` (warning amber) · `Contested 15-40%` (muted) · `Dominant ≥40%` (calm primary). SoV-tuned thresholds because mention-rate's 60%/30% bands don't translate (in a 5-competitor field even a dominant subject sits 25-40%). Auto-summary line beneath: "Strongest on X (N%); most contested on Y (M%)." or "N marginal platforms — weakest:..." Subject row emphasis: bold + primary left-accent border on name cell, `ring-2 ring-primary/50` + bold % on each value cell (matches the Ranking table's subject row treatment).
- **Color legend strip** added beneath the heatmap (same pattern as Visibility's legend, SoV-tuned labels).
- **All Cards unified to `p-6 border-border/60`.** Previously a mix of `p-5 md:p-6` / `p-6 md:p-8` / no border. Section anchors bumped `scroll-mt-20` → `scroll-mt-28`. SectionTitle eyebrows lost the "NN · " numeric prefix since the sub-nav owns numbering.
- **Trend chart "What changed" footer tightened** to match Visibility (no border-t divider, text-13px → text-11.5px, mt-6/pt-5 → mt-3). **Field-wide consolidation**: when all rendered deltas share the same rounded value (the Newsom `-10 pts × 4` case), strip collapses to a single "All N tracked movers · X pts" line.
- **Trend chart axis**: Competition tried `subjectOnlyAxis` first (subject-only fit), but that clipped competitor mention rates below the chart floor. Reverted to all-series fit + the `MIN_AXIS_SPAN=25` floor on `TrendOverTime`, which keeps every line on-canvas while still giving the subject's variation visible territory.
- **Ranking table subject row emphasis bumped** from `bg-primary/[0.04]` alone to `bg-primary/[0.08]` + `border-l-2 border-l-primary/50` + bold entity name. Doubled tint + left accent + bold so eye lands immediately.
- **Strongest Topic tied-detection.** When subject's mention rate is uniform across topics (e.g. 100% on all 4), tile no longer picks an arbitrary one — renders `"100% · Tied across N topics"` via `hasMeaningfulStrongest` flag (5 pp gap from mean of rest required for "strongest" framing).
- **Top Competitor tile color fixed.** Was painted by `toneByThreshold` on gap pp → green when subject was comfortably ahead, which made "Wes Moore" read as a healthy entity instead of a competitor name. Reverted to neutral `text-foreground`; gap direction lives in the caption.
- **Co-Mentions** title: `"Entities Mentioned Alongside X"` → `"Who Else Appears Alongside X"` (no noun mismatch with helper text below). Row values switched from `count · share%` to share-only (count was redundant; share is comparable across snapshots).
- **`pp` → `pts` sweep** across the spoke + Vitals bottom-line "entity" → "way" copy fix ("7-way comparison set" reads as natural English vs the tech-doc "7-entity").
- **Methodology footer** added at end of `<main>` (mirrors Visibility + Overview).
- **Back-link removed** (Sub-nav handles spoke nav).

### Position vs Share scatter (Competition)

- **Renamed** from "Visibility vs. Prominence" — the chart's axes are Avg Mention Position (X) and Share of Voice (Y), both visibility measures, so the old title was at odds with the data.
- **Sub-card merged into single Card with internal divider.** SoV bars + Position vs Share scatter were two stacked bordered Cards in a `lg:grid-cols-2` — now one Card with `lg:divide-x` (vertical divider at wide widths, `border-t` at narrow). Same one-card-one-divider pattern as the Trend chart + What-changed footer.
- **Visible axis titles added** via Recharts `<Label>` — `"Avg Mention Position (← earlier in answer)"` below the X tick labels, `"Share of Voice (↑ more visible)"` rotated -90° to the left of Y. Folds the directional hint into the title itself. Bottom directional caption removed (redundant). Chart height 280 → 300; bottom margin 8 → 32, left margin 12 → 28 to make room for titles.
- **Label collision detection** in `CompetitiveScatter` rewritten — switched from data-space proximity (5% of X span) to label-width-aware: estimates each label's pixel width by char count, compares to actual pixel distance between dots. `LABEL_GAP_PX` later bumped 8 → 14 after observed near-miss collisions ("J.B. Pritzker" + "Josh Shapiro" cluster). Three-tier label placement (above/below/far-below).

### TrendOverTime (shared chart component)

- **Default height** 420 → 320 so Trend is no longer the tallest block on the spoke.
- **Hardcoded `h-[420px]` wrapper bug fixed** — was breaking Competition's `height={340}` prop. Wrapper now uses `style={{ height }}`.
- **Empty state height** matches the populated height (no layout jump).
- **Data-driven Y-axis** (see Visibility section above for details).
- **`subjectOnlyAxis` prop** — fits axis to subject values only; ignored overlays. Used briefly on Competition but reverted (clipped competitor lines). Visibility keeps default `false`.
- **`showEndLabels` prop, default `false`** — opt-in end-of-line labels rendered as inline text next to each series' rightmost data point. Right margin widens 16 → 130 when enabled. **Collision avoidance via label-rail algorithm**: pre-computes each label's pixel-Y from the yDomain projection, sorts ascending, walks through pushing each subsequent label down by ≥14px if it would collide. Subject label rendered bolder (600) than overlays (400 + 0.75 opacity). Visibility opts in (3 well-spread per-platform overlays); Competition leaves it off after the 5-competitor cluster case stacked labels in a tight column disconnected from where their lines ended.
- **`LabelList` import** added (`recharts`).

### Overview spoke — small polish

- **Bottom-line phrasing.** `formatStrongClause(pct, comparator)` and `formatWeakestClause(pct, label)` helpers added: 100% → `"in every answer about X"` (instead of `"in 100% of answers about X"`); 50% → `"only half on X"` (instead of `"only 50% on X"`). Other percentages keep the numeric shape so data still leads.
- **TrajectoryStrip uses shared `KpiGauge`** with `benchmarkLabel` (matches Visibility's gauge tile treatment).

### Cross-spoke / shared component changes

- **`KpiGauge`** in `components/dashboard/ui.tsx` — extracted, gained `benchmarkLabel` legend rendering.
- **`TrendOverTime`** — `subjectOnlyAxis`, `showEndLabels`, `MIN_AXIS_SPAN`, end-of-line label-rail, hardcoded wrapper bug fixed.
- **`OverviewSubNav`** — already had `right` slot; no changes this session.
- **`TopicProminenceFilter` / `LandscapePlatformFilter`** — gained `inline` prop (same pattern as Visibility filters).
- **`SectionNav` (Competition)** — orphaned from page.tsx but file kept (unused; clean-delete candidate).
- **`CompetitiveScatter`** — axis titles + label collision rewrite.

### Tooltip wording divergences resolved (Visibility tables)

Three known inconsistencies between the Platforms and Topics table tooltips, surfaced early in the session, fixed before commit:

- **Avg Position**: "the entity" → "the subject" across both Vitals tile helper + Platforms table tooltip (matches Topics' canonical phrasing).
- **Change tooltip**: color-encoding clause added to Topics tooltip so both tables now spell out the green/amber semantics. Methodology language stays accurate to each (Platforms = prior-snapshot delta, Topics = window-spanning first-vs-latest) since those are genuine backend computation differences.

### Open follow-ups (not done in this pass)

- **Narrative + Sources spokes** still on pre-treatment chrome — old `SectionTitle` styles, no shared `KpiGauge`, no `OverviewSubNav`, back-link present, probably `pp` instead of `pts`, Card padding drift. Playbook is well-established now; mostly mechanical work.
- **Refactor large page files.** Visibility ~2200 lines, Competition ~2400 lines. Each section could be extracted into its own component file for maintainability.
- **Extract `heatTier` / `sovTier` to shared lib.** Both have nearly identical `*TierStyle` mappers with different thresholds. Parameterizing into `bandTier(value, { highMin, lowMax })` in `lib/visibility/heatTier.ts` would prevent silent drift.
- **`CompetitiveSharePanel` unused-var warning** in Overview (pre-existing from `bfda60f`, ESLint flags it as unused — clean-delete candidate).
- **Pre-existing `[recurring]` validation hook noise** on `URLSearchParams` constructions in both Visibility + Competition page files. Hook flags them as "params is async" — false-positive (it's a local URL helper, not the Next.js page `params` prop). Worth filing if the hook can be made smarter.

---

## Follow-up session #5 (2026-05-25) — Competition Standing rework + operator-tooling hardening + multi-tenant cleanup

Ten commits on `main`. The session began as a UI polish pass on the Competitive Visibility spoke, surfaced a metric-coherence bug I shipped halfway through, then expanded into a structural cleanup of the operator tooling and tenant model after a three-agent QA audit caught a class of bugs around CLI tenancy and the worker/CLI pipeline divergence.

- **`cec712a`** — Competition Standing: slim ranking table + KPI sparklines + snapshot-diff strip + strip-plot positioning. Drops the Status column (later restored on subject row only), drops the recharts scatter for a sorted strip plot, adds `TinySpark` + `↑/↓ N pts` deltas to three of four Standing KPI tiles, surfaces `composeCompetitionWhatChanged` as a chip strip under Bottom Line. 2 files, 416 ins / 489 del.
- **`5543504`** — Subject row tier pill restored + Co-Mentions / Platform-Ownership metric unit labels. After the slim-table commit, the QA pass found a non-leader subject (Vance #3, trailing) had no rank/tier indicator. Restored the Status column with the `Pill` rendered only on the subject row; peers keep an empty cell for grid alignment. Co-Mentions section gained an explicit "Co-mention rate = % of {subject}'s answers that also mention this figure" intro and a column header above the bar list; Platform Ownership legend tier labels suffixed with `SoV` so percentages can't be confused with Standing-table SoV or Co-Mentions co-mention rate. 1 file, 109 ins / 13 del.
- **`d7427b2`** — `app/refresh.py`: CLI requires org_id (via `--org-id` or `BYLINE_DEFAULT_ORG`). Hit today: a name lookup for "J.D. Vance" silently matched a legacy NULL-org row (id=5) instead of the real `org_internal` row (id=15), routing two historical refreshes into the wrong tenant before being caught. `_find_subject_by_name` now filters by org; `_create_subject` writes `org_id`; `_resolve_org_id` exits with a clear error if neither source provides one. 1 file, 74 ins / 14 del.
- **`eecf28d`** — `migrations/012_drop_null_org_subjects.sql`: drops the 11 legacy NULL-org subjects (Bernie Sanders, Mitch McConnell, etc.) + all their downstream rows (1868 extractions, 186 refresh_analyses, 132 analysis_runs, 652 model_responses, 29 refresh_runs, 8 jobs via CASCADE), then `ALTER TABLE subjects ALTER COLUMN org_id SET NOT NULL`. With NOT NULL in place, migration 006's partial unique index (`WHERE org_id IS NOT NULL`) covers the whole table by construction. 1 file, 70 ins.
- **`07abf4a`** — Competition Standing metric coherence: unify all deltas/sparklines on mention rate. The headline cluster bug of the session — the QA agent caught that I had three different "Share of Voice" metrics on one band (`competitive[].sov` mention-rate in the table column, `trajectory.ai_recall` mention-rate in row deltas, `trajectory.share_of_voice` pie-share in the snapshot-diff strip and KPI sparklines I added in `cec712a`). Chip values disagreed numerically with the column they sat under. Switched `competitiveRankSpark`, `topCompetitorGapSpark`, and the snapshot-diff strip's competitor trajectories to `ai_recall` / `mention_rate` so everything reads on one scale. 1 file, 35 ins / 32 del.
- **`709d9bb`** — `app/pipeline.py`: extract the canonical 5-step refresh chain into a shared module so worker + CLI run the exact same pipeline. Discovered today: `app/refresh.py main()` was only running step 2 (`run_refresh`), skipping steps 3 (`run_analysis`), 4 (`run_cross_analysis`), and 5 (`get_subject_overview` precompute). Every CLI-triggered refresh — including historical backfills, since `--historical-as-of` is CLI-only — shipped with empty per-response extractions, cross-analyzer outputs, and recommended-actions cache, breaking the Narrative / Sources / Recommendations tabs for that subject. The 12 Vance historical backfills earlier in the session had to be manually stitched by running `run_analysis` + `run_cross_analysis` against each `refresh_run_id` after the fact (output: 12 analyses + 12 cross-analyses + 144 extractions landed on refresh_runs 48-59). Worker `_execute_refresh_job` is now a 1-line delegate; CLI `main()` calls `run_full_refresh_pipeline` with `historical_as_of=` when applicable. Historical mode auto-skips steps 1 + 5 (both "latest snapshot" operations a backfill doesn't change). 3 files, 210 ins / 131 del.
- **`98206dc`** — `app/worker.py`: stuck-job reaper. Hit earlier in the session — TaskStop-ing the in-flight wrong-Vance backfill left `refresh_runs.id=47` orphaned at `status='in_progress'`, which I had to clean up by hand via psql. The per-subject cooldown query in `subjects.py:204` counts `running` jobs against the limit, so one orphan permanently blocks all future refreshes for that subject until manual cleanup. New `reap_stale_jobs(threshold_minutes=10)` (default configurable via `BYLINE_REAP_THRESHOLD_MINUTES`) sweeps both `jobs.status='running'` AND `refresh_runs.status='in_progress'` rows older than the threshold, flips to `failed` with an attributable error string. Called once at worker startup + on every poll iteration before `_claim_next_job`. Public (no leading underscore) so an operator can invoke ad-hoc: `python -c 'from app.worker import reap_stale_jobs; print(reap_stale_jobs())'`. Verified via a synthetic 30-min-old `refresh_runs` orphan — reaped correctly. 1 file, 140 ins / 1 del.
- **`faecf30`** — Competition Standing: "Filters not applied" advisory above KPI strip + snapshot-diff strip. Matches the same advisory pattern the Trend chart (`~L2337`) and Co-Mentions section (`~L2491`) already use. Standing band was silently rendering all-snapshot trajectory deltas + sparklines under a filtered Bottom Line, which is the most confusable kind of UI dishonesty. 1 file, 25 ins.
- **`ed35bb7`** — `dashboard/lib/queries.py`: drop dead NULL-org operator-bypass branches. After migration 012 there are zero NULL-org rows and the schema forbids new ones, so `WHERE (s.org_id = %s OR s.org_id IS NULL)` clauses across `list_subjects` / `get_subject` / `get_subject_overview` / `get_prompt_responses` are dead. Collapsed three-case scoping (None / operator-bypass / strict) → two-case (None / strict); removed `_is_operator_org()` helper and `BYLINE_OPERATOR_ORG_ID` from `.env.example`. Verified: `list_subjects(None)` returns 6 subjects across orgs; strict `list_subjects("org_internal")` returns 5 (correctly excludes the Barack Obama subject in another Clerk org). 2 files, 15 ins / 53 del.
- **`e19cf20`** — QA tail bundle: org defenses + CLI date validation + pre-render visibility + seed env override. Five small defense-in-depth fixes from the audit:
  - **#7** worker tenancy assertion at claim time (`_claim_next_job` joins to `subjects.org_id`; `_assert_job_tenancy` fails the job if `jobs.org_id ≠ subjects.org_id` — backstop against future enqueue bugs);
  - **#9** historical-date validation in `refresh.py` (refuses future dates and duplicate `(subject_id, historical_as_of)` pairs, soft-warns on dates pre-`subjects.created_at`);
  - **#10** `--expect-org` guard on `app.analyzer` and `app.cross_analyzer` CLIs (verifies refresh_run's subject org before running);
  - **#11** `scripts/seed_2028_gop.py` `--org-id` + `BYLINE_SEED_ORG_ID` override (was hardcoded `org_internal`);
  - **#12** `run_refresh` pre-render-failure visibility (`run_one` now returns `(success, cost, pre_render_failed)`; aggregator partitions failures into provider-vs-pre-render and emits a loud warning when prompts skipped before reaching a provider — distinguishes "10 successes + 2 setup_inputs typos" from "10 successes + 2 real provider errors"). 6 files, 269 ins / 14 del.

Plus a non-commit operational arc the session also produced:

- **12 historical Vance backfills** at weekly intervals (`2026-05-18` → `2026-03-02`), landing on `subject_id=15` as `refresh_runs 48-59`. First two refreshes (45, 46) landed on the wrong subject (id=5) before the CLI org-gate fix and were cleaned up manually along with a stuck in-progress run 47. Vance's `trajectory.weeks` is now length 13 (1 live + 12 historical), so the Trend section, inline change deltas, and snapshot-diff strip all populate on reload.
- **Manual analyzer stitch-up** for runs 48-59 — `run_analysis` + `run_cross_analysis` invoked per refresh after `709d9bb`'s pipeline refactor went in, which is what the new structure will avoid having to do for future backfills.

### Metric-naming landmine documented

The `cec712a` → `07abf4a` regression-then-fix turned on a real backend naming inconsistency that's now codified in auto-memory (`memory/byline_metric_naming.md`):

- `competitive[].sov` is **mention rate** (`subject_mentions / total_responses`), despite the field name. The ranking-table column literally reads "Share of Voice" but renders mention rate.
- `trajectory.share_of_voice` / `competitor_trajectories[].share_of_voice` are **pie-share** (`subject_mentions / sum_all_entity_mentions`). Used by Visibility's Trend chart.

These read as wildly different scales — a subject mentioned in 50% of responses but only 5.4% of total entity mentions shows "50%" in the SoV column but `trajectory.share_of_voice` is 0.054. Anywhere a user reads a delta alongside the SoV column, the trajectory feed has to be `ai_recall` (subject) / `mention_rate` (peers), NOT `share_of_voice`. A proper fix is a backend rename (`competitive[].sov` → `competitive[].mention_rate`) plus column-header relabel, but that's a coordinated change touching many places.

### New shared module: `app/pipeline.py`

Two callers, one chain — adding a new extractor or cross-analyzer to `default_extractors()` / `default_cross_analyzers()` picks it up in both worker + CLI by construction. Adding it to one entry point but not the other is structurally impossible now (the modules don't have their own copies).

```
run_full_refresh_pipeline(subject_id, name, *, max_concurrency, historical_as_of)
  ├─ if not historical: _ensure_recent_news_fresh   (step 1)
  ├─ run_refresh                                    (step 2)
  ├─ run_analysis(default_extractors)               (step 3)
  ├─ run_cross_analysis(default_cross_analyzers)    (step 4)
  └─ if not historical: get_subject_overview        (step 5)
```

### Tenancy posture after this session

- `subjects.org_id` is `NOT NULL`; legacy NULL-org rows physically deleted.
- API routes already required org via `_require_org` (pre-existing); no change.
- Worker now asserts `jobs.org_id == subjects.org_id` at claim time (defense in depth — a future enqueue bug can't leak across tenants).
- CLI (`refresh.py`) refuses to operate without `--org-id` / `BYLINE_DEFAULT_ORG`.
- Analyzer + cross_analyzer CLIs accept any `refresh_run_id` by default but support `--expect-org` for ad-hoc safety.
- Seed script (`scripts/seed_2028_gop.py`) defaults to `org_internal` but takes `--org-id` / `BYLINE_SEED_ORG_ID`.
- `dashboard/lib/queries.py` operator-bypass branches gone; scoping is now two-case (unscoped operator path / strict by-org).

### Known clean-up still owed

- **Metric rename across backend + UI**: pick `mention_rate` (or `share_of_voice` if intent shifts) and propagate so the field name, column header, and chip labels all describe the same metric. Today's fix unified the deltas/sparklines but the column-header mislabel still exists.
- **Schema integrity FK delete behavior**: most subjects→child FKs are `NO ACTION`; migration 012 needed a hand-ordered DELETE chain. A future "delete this subject" path will need to re-implement that chain or add `ON DELETE CASCADE` from `subjects` to the analysis layer.
- **Migration runner**: no `schema_migrations` tracking table; migrations applied by hand. The 008/009 gap (renumber accident) is hidden by manual application.
- **Heartbeat-based reaper**: a `last_heartbeat_at` column on `jobs` / `refresh_runs` would let the reaper kick faster (e.g. 90s after last beat) without false positives on legitimately-long jobs. Today's threshold is a generous 10 min; fine for v1.
- **Multi-snapshot data for non-Vance subjects**: Vance now has 13 snapshots; Rubio / DeSantis / Ramaswamy / Youngkin still single-snapshot, so their Trend sections still hide (`hasTrend = weeks.length > 1`). If the trend story matters for them, run historical backfills via the (now full-pipeline-capable) CLI.

---

## Follow-up session #6 (2026-05-25, evening) — Overview/Visibility design parity round 2 + cross-spoke declutter

Fifteen commits on `main`. Picked up immediately after session #5 wrapped and ran as a long iterative design pass — Overview Vitals first (six commits walking the "By platform" subline through three placements before settling), then a cross-spoke parity pass that extracted three new shared components, then a Visibility declutter sweep that removed redundant mention-rate surfaces, then small targeted polish on Trend + Sources.

### Overview Vitals iteration (commits 1-6)

Six commits in sequence on the three Overview KPI tiles (AI Mention Rate · First Result Mentioned · Net Favorability). The "By platform" subline (Mention Rate by platform mini-bar) went through a deliberate walk before landing:

- **`369bd76`** — Fold the standalone "Mention rate by platform" strip into the AI Mention Rate KPI tile (kill the sibling section so there's no redundancy with the tile that now owns the breakdown).
- **`cfcd480`** — Add the same by-platform subline to the other two KPI tiles. Reorder so First Result Mentioned sits between Mention Rate + Net Favorability (matches the "did we appear → did we appear first → how were we framed" mental progression).
- **`d0bba34`** — Drop the `KpiGauge` bar from all three tiles. Benchmark caption stays as plain text (`"Subject-set avg: 35%"`). Gauge was repeating the headline value at half the resolution; numeric benchmark caption carries the same compare without the visual weight.
- **`4d17ef3`** — Move the by-platform subline BELOW the sparkline (was above). Chart leads, breakdown follows. Reads as supporting detail rather than competing with the value.
- **`f98ef91`** — Keep the by-platform subline only on AI Mention Rate; drop from First Result + Net Favorability. The first-result and favorability breakdowns weren't pulling weight relative to the visual density they added — Mention Rate is the canonical platform-split metric.

End state on the Vitals row: three tiles with consistent value + delta + sparkline + benchmark caption, plus an AI-Mention-Rate-only by-platform mini-bar that anchors the "who's seeing me where" read without forcing it on tiles whose answer isn't in their per-platform splits.

### Cross-spoke shared components — extracted in this session

Three new shared modules in `web/components/dashboard/` + `web/lib/`. Pulled out because the parity sweep (next section) was about to copy-paste the same logic into Visibility, and prior copy-paste between Overview and Visibility had already drifted (KPI color thresholds at 0.7/0.4 on Visibility vs 0.6/0.3 on Overview):

- **`web/components/dashboard/KpiVitalsTile.tsx`** — Shared KPI tile (label + value + delta + sparkline + benchmark caption + platform-breakdown subline). `hasSpark = sparkValues !== undefined && sparkValues.length > 0` so callers can omit the spark slot entirely (not just hide it) — `items-stretch` rows then equalize to the shorter height.
- **`web/components/dashboard/Sparklines.tsx`** — Shared `MiniSpark` + `TinySpark` + `buildMonoCubicPath` (Fritsch-Carlson monotone cubic SVG paths). MiniSpark renders a `"1 of N snapshots scored so far"` placeholder when `< 2` data points; this placeholder is later why Weakest Topic loses its spark on Visibility.
- **`web/components/dashboard/BottomLineBlock.tsx`** — Shared bottom-line hero (text + `bodyTone?: "warning" | "neutral"`). Used by both Overview's verdict card and Visibility's vitals briefing — replaces two near-identical parallel implementations.
- **`web/lib/kpiThresholds.ts`** — Single-source-of-truth color thresholds for `mention_rate` / `top_result_rate` / `avg_rank` / `avg_tone` / `weakest_topic_recall` / `risk_frame_rate` / `citation_rate` / `net_sentiment`. Exports `getKpiValueColor(kind, value)` resolver. The color rule everywhere: **value's color reflects absolute strength tier; delta is colored by direction independently** — a strong-but-slipping value reads as green number + amber down-arrow intentionally. Polarity differs per metric (rate metrics higher-better, avg_rank lower-better inverse-tier, avg_tone signed symmetric).

### Visibility ↔ Overview parity pass (commits 7-8)

- **`4047759`** — Consistency pass: shared `BottomLineBlock` lifted out of Overview and reused on Visibility, threshold alignment via `kpiThresholds`, `pp` → `pts` unit sweep, pluralization fixes ("1 platforms" → "1 platform"), `KpiGauge` removal where the numeric caption already carried the compare. 7 files.
- **`69e1b1e`** — Full KPI parity via `KpiVitalsTile` shared component + `kpiThresholds` shared module. Bar / spark / delta restored on both spokes from the same primitive. Eliminates the "Visibility colored 0.7/0.4, Overview colored 0.6/0.3" drift that this session inherited.

### Visibility declutter (commits 9, 11, 12)

- **`9e456eb`** — Disambiguate per-topic snapshot vs all-topics table. **Step 0 confirmed Case A — granularity, not bug**: Platform Snapshot showed per-topic readings while Platform Change Detail aggregated across all topics, so the same platform reading two different numbers on the same page was confusing but correct. Relabeled both sections so the granularity is explicit in the section titles + helper copy.
- **`ba3566d`** — Drop the duplicate Mention Rate column from the Platforms table + drop the AI Mention Rate KPI sparkline (the full Trend chart sits directly below, making the per-tile spark redundant). Two overlapping views collapsed into one.
- **`7f23e97`** — Drop the remaining KPI sparklines (First Mention Share, Weakest Topic Visibility). `items-stretch` was equalizing all 4 tiles to the tallest two (the ones still with sparks), leaving the others padded with whitespace. With the Trend chart owning the time-series story, per-tile sparks were redundant; tiles now share the compact anatomy.

### Competition spoke (commit 10)

- **`30c0782`** — Shared `kpiThresholds` adopted on Standing tiles (was using local constants), Trend chart legend chips made click-toggleable via new `defaultVisibleOverlays?: string[]` prop on `TrendOverTime`, duplicate movers removed from the snapshot-diff strip (subject was being counted in both the subject row and the field-wide consolidation line), Standing KPI band merged into the same Card as the ranking table (was two stacked Cards with the same data, the gap between them broke the visual tie).

### Trend chart polish (commits 13, 14)

- **`6185dda`** — Lighter heatmap legend (dropped Healthy/Mid/Gap tier swatches; the section tooltip + cell hover already explain the tiers, and the auto-summary line below the grid carries the gap count explicitly so colorblind readers still get the read). Per-platform Trend overlays recede further behind the subject's "Overall" line — new `overlayStrokeWidth?: number` prop on `TrendOverTime` (default 2, matches Competition); Visibility passes `overlayOpacity={0.35}` + `overlayStrokeWidth={1.25}` so the four LLM lines sit as reference context, not co-equal series. Competition's heavier styling (0.5 / 2) unchanged so its 6-competitor chart stays legible.
- **`61d9cf7`** — Move the chart's `helperText` from below the chart to above. Was sitting below the legend chips and the "What changed" delta line, which made the lower half of the card busy and pushed the deltas (the actual takeaway) into the middle of the read. Visibility's `SectionTitle` description dropped at the same time — the helperText now sits directly above the chart and says the same thing in more specific terms (names the subject, defines mention rate). Both spokes inherit the move since `TrendOverTime` is shared.

### Sources zebra stripe (commit 15)

- **`f3b3a55`** — Overview Sources list: `bg-muted/40` on rows 2 + 4 + … (idx % 2 === 1) for horizontal scan tracking. Hover state still wins via the more-saturated `accent/60` background.

### Cross-spoke session arc

The unifying thread: Overview and Visibility had the same shape but different implementations of half a dozen primitives (KPI tiles, sparklines, bottom-line cards, color thresholds). Every drift this session caught — color tier mismatches, two parallel `MiniSpark` implementations, copy/paste `BottomLineBlock` markup with subtle padding differences — came from the parallel-implementation pattern. Three shared modules + one shared lib later, both spokes consume the same primitives and a future "change the KPI color rule" or "tighten the BottomLine font" lands in one file.

### Open follow-ups (still owed)

- **Narrative + Sources spokes** still on pre-treatment chrome (pre-session-#4 list item — no progress this session).
- **Visibility / Competition page-file size** still ~2200 / ~2700 lines. The new shared components let some sections extract more cleanly now.
- **`heatTier` / `sovTier`** still duplicated between Visibility and Competition (carried over from session #4's open follow-up — same pattern as today's `kpiThresholds` lift, just not done yet).
- **Metric rename** (`competitive[].sov` → `competitive[].mention_rate`) — session #5 follow-up, still open. Today didn't touch the backend.
- **Recurring "params is async" validation hook noise** — fired on every Edit this session on a pre-existing line 590 of `visibility/page.tsx` unrelated to any edit. Worth filing if the hook can be taught to scope its check.

---

## Follow-up session #7 (2026-05-25 → 2026-05-26, overnight) — Overview Band 2 swap-thrash + QA-agent shipping rounds + dev auth bypass

Eighteen commits on `main` in a single sustained session. Three arcs: (a) iterative Overview Band 2 design churn that ended with Top Narratives + Visibility-by-topic swapping homes between the Vitals row and Band 2 — and then morphing shapes (bars / text / editorial prose) within each home; (b) three rounds of parallel QA agents catching real cross-spoke incoherence, accessibility regressions, and perf debt; (c) a dev-only Clerk auth bypass that unblocks future QA work and surfaced a fresh round of sparse-subject copy bugs.

### Overview Band 2 swap-thrash — what landed where

The session opened with the Top Narratives card removed from Band 2 entirely (`3ab2039`) and "Gap card" → "Visibility by topic" rename. Top Narrative then came back as a Vitals row KPI tile (`919dfba`, replacing First Result Mentioned), got reordered (`3b28796`), and the Visibility-by-topic card grew a takeaway header (`32c1c2e`). Then the actual SWAP: Top Narrative moved to Band 2 as a card; Visibility-by-topic moved to the Vitals row as a tile (`16a12af`). Multiple shape iterations followed:

- **Visibility-by-topic in Vitals row**: bars (per-topic mention rate, top 4 desc) with the weakest row warning-toned (`6a0e9d9`); editorial header line "Weakest: Current events 25%" added (matches the bottom-line verdict copy); spacing bumped to space-y-4 + methodology footer added so the tile fills the same vertical space as its sparkline siblings (`d3d92c5`); benchmark gauge stripped from the AI Mention Rate tile (`186ef21`) so all three Vitals tiles share the same anatomy.
- **Top Narratives in Band 2**: text-only treatment landed in stages — bars-then-no-bars-then-no-tint-then-prose. Final form (`d3179e6`) is an editorial lead sentence ("AI's most common framing of J.D. Vance is **MAGA Alignment and Future Leadership** — a **favorable** angle, appearing in **35%** of responses.") with the cluster name bolded and sentiment word color-coded, plus an "Also surfacing" sub-list of the next 3 clusters in muted text. Methodology line + new "Open Narrative deep-dive →" link to `/subjects/[id]/narrative` (`186ef21`) close the card.
- **Sub-nav rename**: `02 Gap` → `02 Narratives` (`186ef21`) since Band 2's content is now Top Narratives + The fix; the section id renamed `gap` → `narratives` to match. Eligibility gate also tightened from `narrative_clusters.length > 0 || recommended_actions?.primary` → `narrative_clusters.length > 0` (`4356e03`) so never-refreshed subjects don't show a "Narratives" anchor that lands on a Fix-only band.
- **Net Favorability tier — Option B confirmation** (`da7bf71`). Already on the shared symmetric-tier resolver (`kpiThresholds.ts` `KPI_STRONG/WEAK_AVG_TONE = ±0.10`); tightened the annotation to flag the ±10 band as a tunable starting value and document the "color reflects level, delta carries direction; amber rare to stay meaningful" rule. The "Weakest: Current events 25%" lead line was dropped from the Visibility-by-topic tile since the same value already appeared 3 times on the Vitals band (bottom-line verdict, panel header, list row).

End state for Band 2 + Vitals: AI Mention Rate (trajectory KPI) · Net Favorability (trajectory KPI) · Visibility by topic (bar list, snapshot-only); Band 2 = Top Narratives (editorial card) · The fix (recommended move).

### QA-agent shipping rounds (7, 8, 9)

Three rounds of parallel agents — frontend cross-spoke consistency, code health + type contracts, runtime/data — each round catching real bugs.

- **Round 7** (`4356e03`): TS contract bug — `TrendOverTime`'s `defaultVisibleOverlays` was destructured but missing from the props type; Competition callsite broke `tsc --noEmit`. Also dropped the dead `CompetitiveSharePanel` (~50 lines, never instantiated after the Overview rewrite), fixed `1 platforms` plural correctness, consolidated `STATUS_STRONG/WEAK_MENTION_RATE` (Visibility-local) with `KPI_STRONG/WEAK_MENTION_RATE` (shared) since they were the same numbers in two places, tightened the Narratives nav gate.
- **Round 8** (`248e9e7`): Cross-tile color coherence — `TopicBarRow`'s hand-rolled 70/40 ladder swapped to `KPI_STRONG/WEAK_MENTION_RATE` so the Vitals Visibility-by-topic tile and its AI Mention Rate sibling can't render the same 65% mention rate as success on one and neutral on the other (the exact incoherence `kpiThresholds` was extracted to prevent). `MIN_GAP_PP=15` lifted to `KPI_TOPIC_GAP_MIN_PP`, `SOV_TIE_EPSILON` collapsed into the module-level `TIE_EPSILON`. Dead-code sweep: `bmCaption` (orphaned by the benchmark-strip on AI Mention Rate), `trendVerdict` + `snapshotDiffDeltas` (Competition orphans), `ReactNode` import in `KpiVitalsTile`. The `benchmarks` prop on `TrajectoryStrip` also dropped since both metrics now ship null benchmarks.
- **Round 9** (`c7e9a66`, `b1c4f04`, `dadb74c`): a11y + perf wins from the dedicated a11y/perf audits. (Detailed below.)

### A11y + perf wins

- **`--warning` WCAG contrast** (`c7e9a66`). `oklch(0.6 0.16 50)` → `oklch(0.5 0.16 50)`, lifting contrast against the white card from ~3.0:1 to ≥4.5:1 (AA for normal body text). Every warning-toned body text site (BottomLine emphasis, "critical" sentiment word in Top Narratives lead, delta down-arrows, "Weak" status pills) was failing AA at the prior lightness. Hue + chroma preserved so tinted backgrounds (heatmap "gap" cells, etc.) read consistently.
- **Focusable tooltip icons** (`c7e9a66` + `dadb74c`). Both the shared `KpiTooltipIcon` in `KpiVitalsTile.tsx` and the Overview-local one in `page.tsx` were hover-only `<span>`s — keyboard / SR users couldn't reach the tooltip text. Both got `tabIndex={0}` + `role="button"` + focus-visible ring + `group-focus-within:opacity-100` on the popover. The Overview-local one is now the canonical pattern; the Visibility + Competition page-local versions had been doing it right all along.
- **MiniSpark aria-label** (`c7e9a66`). Optional `ariaLabel` prop on the SVG. `KpiVitalsTile` passes `${label} trend, N snapshots` so the primary visual of each KPI tile is no longer invisible to AT users. SVG gets `role="img"` when labeled, `aria-hidden` when undefined.
- **`<h1>` in Header** (`dadb74c`). Sr-only `<h1>` with the subject name at the top of the sticky header. Earlier the populated pages had no `h1` at all — the subject name lived only in the picker chip's `<span>`, breaking the SR heading ladder.
- **KpiGauge progressbar** (`dadb74c`). Track wrapped in `role="progressbar"` + `aria-valuemin/max/now/text`. `aria-valuetext` spells out value + benchmark ("62% (subject-set average 45%)") so the value-vs-benchmark comparison — the whole point of the gauge — is reachable from AT.
- **Non-color weakest/strongest tag on TopicBarRow** (`dadb74c`). Inline "· weakest" / "· strongest" text in the matching tone next to the topic label. Bar color stays as the primary cue for sighted readers; the inline tag is the redundant secondary cue so colorblind readers also get the read.
- **Deep-dive link focus rings + sub-nav focus management** (`b1c4f04`). `focus-visible:ring-primary/50` on all 6 Overview deep-dive links via `replace_all` on their shared className. `OverviewSubNav` `handleNavClick` programmatically focuses the target section after scroll, with `tabIndex={-1}` lazily set on targets so they can receive programmatic focus without entering the natural tab order.
- **Recharts dynamic-import** (`c7e9a66`). `TrendOverTime` + `CompetitorBarsFromData` wrapped in `next/dynamic` at all three callsites. Recharts (~380 KB shared chunk per spoke) now splits off the initial First Load JS — confirmed by inspecting the rendered HTML's `<script>` tags post-bypass: the recharts chunks (`0kc11~mi84xuz.js`, `0hgk_tx2husmp.js`) are NOT in the initial eager scripts. Loading placeholders match each chart's natural height (320/340/280 px) to prevent layout shift. **Gotcha caught mid-edit**: bare `import dynamic from "next/dynamic"` collides with the route-segment-config identifier `export const dynamic = "force-dynamic"` each page already exports → tsc errors on the merged declaration; imports aliased to `nextDynamic` to fix.
- **Lopsided threshold default lift** (`dadb74c`). `KpiVitalsTile.platformBreakdownLopsidedThreshold` default was a hardcoded 40 inline; now reads from `KPI_PLATFORM_SPREAD_LOPSIDED` in the shared module so the constant can be retuned in one place.

### Dev auth bypass (the unblocker)

- **`proxy.ts` BYLINE_AUTH=disabled** (`09771a3`). Until this commit, every QA agent in this session was blind to the rendered DOM — `/subjects/*` redirected to `united-crayfish-78.accounts.dev/sign-in` before reaching the page, so curl returned the Clerk handshake HTML and not the spoke content. Agents had to fall back to static source analysis.
- The bypass: `process.env.NODE_ENV !== "production" && process.env.BYLINE_AUTH === "disabled"` → skip the Clerk session check on authed routes. **Hard-guarded by NODE_ENV** so the env var cannot leak into a deployed build. Matches the FastAPI backend's existing `BYLINE_AUTH=disabled` flag (one env var for stack-wide auth bypass); pairs with the existing `BYLINE_API_TOKEN` escape hatch in `lib/api.ts:14-17` that bypasses Clerk on the server-side API client.
- Usage: `BYLINE_AUTH=disabled BYLINE_API_TOKEN=dev-token npm run dev`. After this, curl localhost:3000/subjects/15 reaches the real spoke; future QA agents can structurally verify rendered output.
- `.env.example` updated with the new var commented out as documentation.

### Post-bypass QA round — real bugs caught (round 10)

With the bypass active, a fresh round of parallel agents (sparse-subject edge cases + cross-spoke data coherence) caught issues the static rounds couldn't see (`0fab86d`):

- **Sparse Visibility "mostly stable" lie**. `composeWhatChanged` returned the hardcoded "Visibility is mostly stable across recent snapshots…" copy when there were < 2 snapshots or no measured `ai_recall` endpoints — i.e. on never-refreshed subjects (16/17/18/19). New `NOT_ENOUGH_DATA_COPY = "Not enough history yet — trend copy lights up once a second snapshot lands."` fires for both early-return paths. `STABLE_COPY` now only fires when "stable" is truthful (2+ measured points, no meaningful deltas).
- **Sparse Visibility bottom-line grammar bug**. `Snapshot covers ${platformsCovered.join(" and ")}.` rendered as `"Snapshot covers . ChatGPT and Claude and Gemini and Perplexity were not included."` when `platformsCovered` was empty (zero-coverage subjects). Added a zero-covered branch: `"No platform responses recorded yet — X and Y and Z are pending."`
- **Net Favorability descriptor mismatched its color tier**. `formatTonePct` appended "positive" / "negative" purely on sign, so a -7% value rendered as "−7% negative" even though the symmetric ±10 KPI_WEAK_AVG_TONE / KPI_STRONG_AVG_TONE tier classified it neutral. Descriptor now follows the same threshold — in-band values (-9..+9) render with no descriptor; verified in DOM: -7% / -9% strip the descriptor, -10% / -11% / -12% correctly keep "negative".
- **Two false positives from agent regexes**: "Overview weakest topic at 50% (should be 25%)" — agent regex picked the wrong adjacent percentage; tile correctly renders "Current events 25% · weakest". "platform s" stray-space pluralization — Next.js `<!-- -->` hydration comments fooled the regex; actual output is `2 platforms` clean.

### Cross-spoke design coherence still owed

- **Competitive-position framing divergence**. Overview's "Competitive position" surfaces "Gap to leader −40 pts behind Donald Trump"; Competition's tile shows "Closest Rival Marco Rubio 0 pts" instead. Both correct in isolation, but a reader scanning the same concept across spokes gets different comparator names + gaps. Worth unifying.
- **Recommendations spoke** boilerplate references "{subject_name}'s latest snapshot" on zero-snapshot subjects.
- **Narrative spoke** internal sub-nav (Sentiment Mix / Topic Sentiment / Narrative Clusters / Representative Quotes) doesn't gate on data presence — sections render empty rather than the nav item dropping.

### Open follow-ups still on the deferred list

- **Opacity-attenuated text contrast** (`text-foreground/55`, `/60`, `/65`) at 9-11px sizes fails WCAG AA. Real fix is bumping to `/70`+ or moving smallest captions up to 11-12px. Touches many sites; broad sweep.
- **Subject picker listbox** (`Header.tsx:145-184`) lacks roving `tabIndex` + arrow-key navigation — listbox a11y standard.
- **Heatmap cells** use `title` (not reliably announced) → `aria-label`.
- **Skip-to-main link** — common pattern, low cost, helps power keyboard users skip Sidebar+Header+sub-nav.
- **`aria-current="true"`** → `"location"` (canonical value; works today but non-spec).
- **`Charts.tsx` per-type split** — barrel today; importing one bar chart drags in PieChart/AreaChart/LineChart. Marginal win.
- **`SourcesTypeMix` dynamic-import** (302 lines client, below-fold on Overview).
- **`heatTier` / `sovTier`** still duplicated between Visibility and Competition (open since session #4).
- **Metric rename** (`competitive[].sov` → `competitive[].mention_rate`) — still open since session #5.

### Pixel / keyboard / VoiceOver still needs you

Agents can structurally verify markup, but they can't see layout, spacing, color shifts in practice, hover states, focus ring contrast against backgrounds, screen-reader announcement order, mobile breakpoints. The bypass lets future agents reach the DOM but doesn't give them a real rendering engine. The productive next step on the QA side is a manual walk-through with DevTools + VoiceOver + a Lighthouse run to validate the perf win.

---

## Follow-up session #8 (2026-05-26 → 2026-05-28) — Competition spoke parity sweep + shared-primitive consolidation

Seven commits on `main`. Sustained pass on the Competition spoke to bring it into design + a11y + behavior parity with Visibility, plus shared-primitive lifts that benefit all three spokes. Most of the work followed a "QA flagged this last round, now ship it" cadence — items the cross-spoke QA agents tagged but were deferred at the time. One real user-reported bug (KPI tooltips not working) caught at the end.

### Competition spoke parity sweep

- **`89ed714`** — BottomLineBlock + KpiVitalsTile migration. Hand-rolled "BOTTOM LINE" hero (eyebrow `text-[12px] tracking-[0.08em] text-primary/80`, body `text-[15.5px] leading-relaxed text-foreground/90`) replaced with shared `<BottomLineBlock text={...} bodyTone="neutral" />`. Bespoke 4-tile JSX builder (~120 lines) replaced with `competitionKpis.map(k => <KpiVitalsTile />)`. Three shared-component additions made the migration mechanical: **`sparkVariant: "mini" | "tiny"`** on KpiVitalsTile (Competition's Standing band has a ranking table folded into the same Card, so MiniSpark would push it below the fold — `"tiny"` opts into the 22-px TinySpark instead); **`ariaLabel`** on TinySpark mirroring the round-9 MiniSpark fix; and a **`deltaTooltip`-driven aria-label** so Competition's "vs start of trend window" semantic reaches SR users instead of being overridden by KpiVitalsTile's hardcoded "vs previous snapshot". Cleanup: removed Competition's local TinySpark (~40 lines, duplicate of the shared one) and the orphan `KpiGauge` import.
- **`57c652c`** — `composeCompetitionWhatChanged` defense-in-depth STABLE_COPY fix. Mirrored the round-10 fix on Visibility's `composeWhatChanged`: the function returned a confident "The comparison set is mostly stable across recent snapshots" on `<2 snapshots` / `!overallEndpoints` paths. Currently latent because the only live consumer is gated by `hasTrend` outside, so sparse subjects never see it today — but a future refactor that removes that outer gate would surface the lie. New `NOT_ENOUGH_DATA_COPY` constant fires for both early-return paths. Bonus catch: `const snapshotDiff = composeCompetitionWhatChanged(...)` at line 1304 was dead code — round 8 cleanup removed its consumer (`snapshotDiffDeltas`) but left the source assignment running on every render. Now gone.
- **`4c25b3a`** — Standing tile comparator unified with Bottom Line + Overview. **Cross-spoke incoherence the QA agent flagged**: Overview's Competitive Position card showed "Gap to leader −40 pts behind Donald Trump"; Competition's same-band Bottom Line said "trailing Donald Trump by 40 pts"; but Competition's "Closest Rival" KPI tile said "Marco Rubio · trails by 0 SoV pts". Three surfaces, three different comparator names + gaps for the same "where do I stand?" concept. Even within Competition itself, the Bottom Line and the tile disagreed. Root cause: Bottom Line + Overview both pick `referenceEntity = isLeader ? runnerUp : leader` (canonical); the Closest Rival tile instead picked the entity at smallest absolute SoV distance — a different question. Fix: renamed tile to "Gap to Leader" / "Lead over Runner-up" (flips with `isLeader`) and rewired to use the Bottom Line's comparator. Spark + delta also rewired to track subject − comparator over time. Bonus: caught a latent issue where the KpiVitalsTile callsite suppressed `standaloneCaption` when sparks were present (even though the shared component handles both — caption at `mt-3`, spark `mt-auto pt-3`). Dropped the suppression so the gap value is now visible on the tile.
- **`7fbc6c0`** — Sub-nav now gates Wins & Losses + Platform Ownership heatmap auto-summary parity. Two more parity items vs Visibility. (1) Competition's sub-nav array was hardcoded to 4 entries (Standing/Positioning/Trend/Co-Mentions) but the page has a 5th `<section id="wins-losses">` gated on `hasWinsLossesData` (always false today; flag flips when the per-(prompt × entity) co-occurrence builder lands). If/when the flag lit up, the section would render but the sub-nav would skip over it. Conditionally inserts `Wins & Losses` (num="04") via `...(hasWinsLossesData ? [...] : [])` with Co-Mentions' num computed as "04" or "05" depending. (2) Visibility's Current Platform Snapshot heatmap renders an auto-summary below the legend ("Full coverage…" / "One gap: X doesn't mention Y on Z." / "N gaps — largest:…"); Competition's Platform Ownership heatmap had no parallel. Added an equivalent line scoped to the SUBJECT's per-platform performance with four branches (0/1/N marginal cells × single-vs-multi-platform). Renders for Vance as: `"Strongest on Gemini (80%); most contested on ChatGPT (20%)."`

### Shared-primitive consolidations

- **`6be2390`** — Shared `bandTier` classifier (`web/lib/bandTier.ts`, new). Long-running follow-up open since session #4. Visibility's `heatTier` (Gap < 30% / Mid 30-60% / Healthy ≥ 60%) and Competition's `sovTier` (Marginal < 15% / Contested 15-40% / Dominant ≥ 40%) had identical structure with different thresholds — two classifiers doing the same `< lowMax / >= highMin` arithmetic. Now both bodies collapse to a `bandTier(value, { highMin, lowMax })` call + a small alias rename. **`SOV_TIER_DOMINANT = 0.4`** and **`SOV_TIER_MARGINAL = 0.15`** lifted to `kpiThresholds.ts` so all four tier thresholds (Visibility mention-rate + Competition SoV) live in one home — a future retune lands in one file. Style mappers (`heatTierStyle` / `sovTierStyle`) stay local because the intent inversion is intentional (Visibility wants healthy cells to RECEDE so gap cells stand out; Competition wants dominant cells to POP because they're wins).

### Trend chart legend rework

- **`2c459b1`** — Hide off-chart overlays from the legend (was crossed-out chips). User asked for: on Competition's Trend chart, hidden entities (Marco Rubio, Tim Scott, Nikki Haley) were rendered as line-through, opacity-50 chips next to the visible ones — visual weight the user didn't want once a chip was hidden. Now `overlays.map(...)` returns null for non-visible overlays; "Show all" / "Reset" button is the canonical recovery. Show-all gate broadened from `defaultVisibleOverlays && overlays.length > visibleByDefault.size` to ALSO render when any overlay is hidden (regardless of `defaultVisibleOverlays`) — without this, Visibility users who toggle a platform off would lose all recovery path. Button text: "Show all" when any hidden, "Reset" when all visible AND non-trivial default subset exists.

### Tooltip popover lift (real bug fix)

- **`c7b1f3f`** — KpiVitalsTile tooltip: lift styled popover into shared component (was native browser `title` only). User reported: tooltips on Overview's AI Mention Rate + Net Favorability tiles "don't work." Root cause: the shared `KpiTooltipIcon` inside `KpiVitalsTile.tsx` used only the native `title` attribute — slow ~1s browser delay, unstyled grey rectangle. Round 9's a11y fix made it focusable but didn't add a popover element; every other tooltip in the app is a custom CSS popover, so the bare title felt like the tooltip was broken. Lifted the Overview-local KpiTooltipIcon's popover pattern (page.tsx ~125) into the shared component: now reveals immediately on hover (`group-hover:opacity-100`) AND on Tab focus (`group-focus-within:opacity-100`); aria-label still announces the text to SR users; native `title` dropped. New `align` prop (default `"right"` since KPI tile icons sit at the right edge of the title block; `"center"`/`"left"` available). Affects every KpiVitalsTile consumer — Overview Vitals, Visibility briefing, Competition Standing — all three now have a consistent styled popover.

### Net state of the Competition spoke

Now fully primer-driven through shared components:

- **BottomLineBlock** (was bespoke hero)
- **KpiVitalsTile** with `sparkVariant="tiny"`, `deltaTooltip="vs start of trend window"`, focusable popover tooltip (was bespoke ~120-line tile builder + bespoke tooltip + local `TinySpark`)
- **TrendOverTime** with `overlayStrokeWidth={2}` explicit, `defaultVisibleOverlays` for top-3 rivals, hide-on-toggle-off legend behavior
- **bandTier** for SoV-tier classification (was local sovTier)
- **kpiThresholds.ts** constants for all three thresholds (`KPI_*_MENTION_RATE`, `SOV_TIER_*`, `KPI_PLATFORM_SPREAD_LOPSIDED`)

Standing tile, Bottom Line, and Overview's Competitive Position card all reference the same comparator (leader / runner-up depending on `isLeader`) with the same rounded gap value. Sub-nav array shape now reflects the page's actual render gates.

### Remaining design follow-ups (still deferred)

- **`CompetitiveScatter` dots a11y** — dots are `<div>` with `aria-label` but not focusable / no role. SR users can't reach per-entity Position/SoV data points. Add `tabIndex={0}` + `role="img"` + focus-visible ring.
- **Recommendations spoke** boilerplate references "{subject_name}'s latest snapshot" on zero-snapshot subjects (caught by sparse-subject runtime QA in session #7 round 10, still untouched).
- **Narrative spoke** internal sub-nav (Sentiment Mix / Topic Sentiment / Narrative Clusters / Representative Quotes) doesn't gate on data presence.
- **Opacity-attenuated text contrast** (`text-foreground/55`, `/60`, `/65`) at 9-11px sizes fails WCAG AA. Broad sweep across many sites.
- **Subject picker listbox** lacks roving `tabIndex` + arrow-key navigation.
- **Heatmap cells** use `title` (not reliably announced) → `aria-label`.
- **Skip-to-main link**, `aria-current="true"` → `"location"` — small a11y closeouts.
- **Charts.tsx per-type split** + **SourcesTypeMix dynamic-import** — small perf wins.
- **Metric rename** (`competitive[].sov` → `competitive[].mention_rate`) — open since session #5.

### Pixel / keyboard / VoiceOver still needs you

The auth-bypass commit from session #7 (`09771a3`) lets curl + agents reach the rendered DOM, but they still can't see actual layout, color rendering, hover states in motion, screen-reader announcement order, or mobile breakpoints. The post-session-#7 fixes have all been structurally verified; the visual + interaction verification is still on you with DevTools + VoiceOver + a Lighthouse run. The Trend chart legend rework (`2c459b1`) and tooltip popover lift (`c7b1f3f`) in particular are interaction-heavy changes that a walk-through would catch any subtle regression on.

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

3. **Frontend drill-down pages (Phase D)** — substantially shipped.
   Live spokes as of 2026-05-23:
   `Overview`, `Visibility`, `Competition`, `Narrative`, `Sources`,
   `Prompts`, `Recommendations`. **Still missing**: `Topics`,
   `Site Audit`, `Reports`, `Settings`.

   Largest backend gap blocking richer spokes: **per-competitor
   sentiment / narrative themes** — every competitor-aware view
   today (Competition spoke, Narrative cluster contributions,
   Sources by competitor) is bottlenecked on it. Requires a new
   extractor + a schema addition on `response_extractions`.

   Smaller pickups within the existing spokes:
   - Wire Overview's `?topic` / `?platform` URL params to actually
     scope the Overview sections (the Filters card was pulled
     because it didn't yet narrow anything). The shared
     `VisibilityTopicFilter` / `VisibilityPlatformFilter`
     components are ready to reuse.
   - Sources v2: per-source trajectory over refreshes, per-source
     sentiment correlation, the URL list per source.
   - Narrative v2: cluster trajectory over refreshes (which
     framings are rising/fading).

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

web-next/                    # BRAND-NEW frontend (full redesign WIP). Same repo,
│                              parallel to web/. Backend frozen — talks to the same
│                              FastAPI :8000 only through copied lib/api.ts.
├── lib/api.ts               #   copied VERBATIM from web/ — the backend contract
├── proxy.ts                 #   copied: Clerk middleware + BYLINE_AUTH bypass
├── app/api/.../route.ts     #   copied: the two client-poll proxy handlers
├── app/layout.tsx           #   minimal ClerkProvider (no fonts/branding yet)
└── app/page.tsx             #   THROWAWAY Phase-0 JSON seam-check — delete before
                             #   real UI. Proves :3001 reaches the backend.
                             # Run: `cd web-next && BYLINE_AUTH=disabled \
                             #   BYLINE_API_TOKEN=dev-token npm run dev` → :3001

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

### Frontend redesign — brand-new UI in `web-next/` (shipped to main, IN PROGRESS)

A full **frontend redesign** is underway: a brand-new UI (no reuse of
`web/`'s design) built in a parallel `web-next/` directory in this same
repo. **The backend is frozen** — out of scope for the redesign. The
contract seam is `lib/api.ts`; every new page must go through it and
nowhere else (no ad-hoc `fetch` to :8000, no client-invented shapes).
The backend only re-enters the conversation if the new UI needs data the
contract doesn't expose.

| | |
|---|---|
| **Owns these files** | everything under `web-next/` (new dir). Does NOT touch `app/`, `web/`, or any backend file. |
| **Design system (DECIDED)** | **Hand-rolled token CSS**, NOT shadcn/ui. Shared `:root` tokens (sand/ink/bronze + Inter) live in `app/globals.css`, mirrored from `components/landing/landing.css`. Dashboard chrome styles in `app/(dashboard)/dashboard.css` (loaded only on the dashboard route group, so the landing's bare-element rules never collide). **No chart library** — sparklines are hand-rolled SVG (Fritsch-Carlson monotone cubic, no overshoot) in `components/dashboard/Sparkline.tsx`. Inline-SVG icons (no icon dep). |
| **Shipped to main** | Phase 0 scaffold; marketing landing (`/`, parity port). THEN this track: **app shell** — `(dashboard)` route-group layout + `Sidebar`/`Header` (workspace-level nav); **`/subjects`** list (restyled metrics + table + empty state); **`/subjects/new`** create form (3-file port: page + client form + server action; Cancel/redirect retargeted to `/subjects` since `/` is now the landing, not the list); **`/subjects/[id]` Overview FIRST SLICE** = back-link + subject header + first-run state + Vitals band (bottom line + recommended focus + 4 headline KPIs + AI-Recall-by-platform bars) + 12-week trajectory sparklines (one per KPI) + **refresh button** (enqueue → poll `/api/jobs/{id}` → revalidate; verified live end-to-end: job 15 queued→running→succeeded, first-run flipped to brief) + **narratives + recommended-action band** + **competitive mention-rate leaderboard** (subject highlighted; NB labelled "mention rate" not SoV — `competitive[].sov` is mention rate, not pie-share) + **sources** (citation/influence leaderboard, per-platform split in row tooltip) + **evidence** (verbatim AI quotes with type/model/prompt). **The Overview brief is now fully ported** (deferred-note removed). **Route-aware spoke sidebar**: the single shell `Sidebar` switches between workspace nav (`/subjects`, `/subjects/new`) and the subject-scoped spoke nav (Overview active + Visibility / Competitive / Narrative / Sources / Prompts / Recommendations as "Soon") by parsing the subject id from the pathname — no nested layout, no double sidebar. All verified live (`tsc` clean; data / first-run / 404 paths). |
| **Architecture notes** | Landing at `app/page.tsx` stays OUTSIDE the `(dashboard)` group → root layout only, no sidebar/header (verified: 0 `dash-sidebar` on `/`). `proxy.ts` gates every route except `/`. KPI units from the backend: `value` is a 0..1 fraction for rates / −1..+1 for sentiment; `delta` is already in points (pp); `risk_frame_rate` is the lone **lower-is-better** KPI → inverted delta coloring + ±0.1 sentiment neutral band. |
| **Remaining** | Overview brief + spoke sidebar done. **Visibility spoke FIRST SLICE shipped** (`subjects/[id]/visibility/page.tsx`: per-platform performance table + answer-prominence rank distribution + per-prompt coverage grid; `SPOKES.visibility` flipped to `built:true`). Visibility deferred: platform×topic heatmap, rank-dist-by-platform/topic dropdowns, cross-platform divergence (all in payload). **Competitive spoke FIRST SLICE shipped** (`subjects/[id]/competition/page.tsx`: mention-rate leaderboard + first-mention steal share + co-mention frequency/mention-quality; `SPOKES.competition` → `built:true`). Competitive deferred: per-platform entity-SoV grid, topic battleground (`topic_leaderboard`), per-platform landscape. **Narrative spoke FIRST SLICE shipped** (`subjects/[id]/narrative/page.tsx`: sentiment mix (pos/neu/neg stacked bar) + dominant AI framings (clusters) + sentiment-by-topic matrix; `SPOKES.narrative` → `built:true`). Narrative deferred: per-platform sentiment, narrative-score trajectories (directional_lean / criticism_severity / certainty / net_sentiment). **3 of 6 spokes done (Visibility, Competitive, Narrative). Next: Sources** → then Prompts → Recommendations (each = a `page.tsx` + flip its `SPOKES` entry to `built:true`). Minor Overview leftovers: lazy "show full quote" expand on evidence cards + refresh-history disclosure. |
| **Cutover (later)** | Phase 3: `git mv web web-old && git mv web-next web`. |
| **Install caveat** | `web-next/node_modules` was installed with `npm install --cache /tmp/npm-cache-bln` — `~/.npm` has root-owned cache files (old npm bug); plain install EACCESes until `sudo chown -R 501:20 ~/.npm`. |

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

  2. **Async job pattern (Phase B) — ✅ SHIPPED.** `POST
     /api/subjects/{id}/refresh` returns `202` and enqueues a row in
     the `jobs` table (per-subject cooldown + per-org hourly rate
     limits); `app/worker.py` claims jobs via `SELECT … FOR UPDATE SKIP
     LOCKED` and runs the refresh + analyzer + cross_analyzer chain.
     Frontend polls `GET /api/jobs/{job_id}`. A stale-job reaper (runs
     at worker startup + each poll, default 10-min threshold) clears
     crashed `running` rows. Still missing: automatic retries (failed
     jobs stay failed; user re-triggers from the UI).

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
# Full local stack (3 servers)
BYLINE_AUTH=disabled .venv/bin/uvicorn app.api.main:app --reload --port 8000  # backend
cd web && npm run dev                                                          # old UI  :3000
cd web-next && BYLINE_AUTH=disabled BYLINE_API_TOKEN=dev-token npm run dev     # new UI  :3001

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
