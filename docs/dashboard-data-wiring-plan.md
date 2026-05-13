# Dashboard data wiring plan

Audit of what's on the customer-facing dashboard mockup
(`web/app/dashboard-preview/page.tsx`, Warren demo data) vs what byline's
pipeline actually computes today. Used to decide what to build before
replacing the hardcoded values with real Obama data — and which gaps
warrant new methodology vs which are quick derivations.

Written 2026-05-13 after the mockup landed at `/dashboard-preview`. Update
when new extractors or cross-analyzers ship.

---

## Status legend

- ✅ **Direct wire** — data exists in the DB, render against it.
- 🟡 **Derivation** — data exists, but needs a small definition or
  aggregation choice before it can be rendered.
- 🔁 **Cross-subject** — methodology supports it, but requires running
  refreshes on multiple comparable subjects and aggregating across them.
- ❌ **New methodology** — no existing extractor or cross-analyzer
  produces this. Net-new work before any dashboard wiring.

---

## Dashboard-element-by-element audit

### Hero card

| Element | Source | Status |
|---|---|---|
| Title / subtitle / eyebrow | Static text per subject | ✅ |
| **Bottom Line** callout (1-sentence diagnostic) | Would need an LLM-call cross-analyzer that synthesizes one paragraph from the refresh's findings. Similar pattern to `TopQuotesAnalyzer`. ~$0.005/refresh. | ❌ |
| **Recommended Focus** callout (1-sentence prescription) | Rule-based templating from the topic-gap data, OR a second LLM call. Rule-based is more auditable; cheaper. Depends on prompt topic tagging existing first. | ❌ |
| **AI Recall** KPI (72%, +4.1) | `mention_detection.subject_mentioned` aggregated across all responses for the refresh. Delta = current refresh vs prior period. | ✅ |
| **Avg Sentiment** KPI (+0.27, +0.04) | `scores.sentiment` mean across all responses for the refresh. | ✅ |
| **Risk Frame Rate** KPI (19%, −0.4) | Threshold derivation. Pick one: (a) `scores.criticism_severity > 0.5` share; (b) `scores.directional_lean` opposite the subject's expected lean; (c) combined. | 🟡 |
| **Per-platform AI Recall strip** (4 chips, ChatGPT/Claude/Gemini/Perplexity) | `mention_detection.subject_mentioned` grouped by `model_id`. Note: byline currently runs 2 models (gpt-5-mini, gemini-2.5-flash); chips for Claude / Perplexity would render as "—" until those providers are added. | ✅ for the 2 we run, ❌ for the others |
| **Dominant narrative** ranked bars (Progressive Reformer 42%, Consumer Advocate 24%, …) | Free-form `narrative_themes` per response doesn't aggregate into N named buckets. Needs either (a) a clustering cross-analyzer producing per-refresh narrative buckets, or (b) a pre-defined narrative taxonomy that the per-response extractor maps to. | ❌ |

### Strategic Takeaways

| Element | Source | Status |
|---|---|---|
| **Message Gap** row ("Warren appears in only 8% of housing-affordability prompts vs 42% of banking-regulation prompts") | Requires (1) prompts tagged with customer-facing topic categories, (2) a comparative cross-analyzer that surfaces topic gaps as 1-sentence findings. | ❌ |
| **Opposition Frame** row (where adversarial framing peaks) | Could be derived from `scores.criticism_severity` × prompt topic, once topics are tagged. Needs same prompt-topic tagging. | ❌ (gated on topic tagging) |
| **Strongest Asset** row (where the entity associates positively) | Similar — `descriptors` or `narrative_themes` × prompt topic, surface the strongest positive association. Needs topic tagging. | ❌ (gated on topic tagging) |

### Prompt Coverage card

| Element | Source | Status |
|---|---|---|
| Per-topic share-of-set and recall (Banking regulation 25% / 91%, Housing affordability 18% / 8%, etc.) | Requires prompts tagged with topic categories. Today's `prompts` table has byline methodology categories (named/1 descriptive baseline) but not customer-facing topic categories. | ❌ |

### Evidence — sample prompts

| Element | Source | Status |
|---|---|---|
| Per-card prompt text + model + mention rank | `model_responses` joined to `prompts` and `models` | ✅ |
| Per-card paraphrased excerpt | Either: (a) verbatim from `response_text` (truncated), (b) reuse `TopQuotesAnalyzer` v1.0 output, (c) new "executive summary" extractor that paraphrases at 30-50 words. | 🟡 |
| Per-card frame label ("Progressive Reformer", "Absent from answer") | Depends on narrative clustering (above) — without stable named buckets, can't label individual responses. | ❌ (gated on clustering) |
| "View all 1,284 prompts" CTA | Already removed in a prior pass. | — |

### Visibility Trends — 3 mini-charts over 8 weeks

| Element | Source | Status |
|---|---|---|
| **AI Recall** weekly trajectory | Existing 13 weekly snapshots for Obama (1 live + 12 historical). Aggregate `mention_detection.subject_mentioned` per refresh, sort by date. | ✅ |
| **Share of Voice** weekly trajectory | Same data path — group `mention_detection` by week. | ✅ |
| **First Mention Rate** weekly trajectory | `mention_rank = 1` share per week. | ✅ |
| Per-chart "what it means" caption | Today: hardcoded. Future: rule-based or LLM-summarized per movement. Defer. | 🟡 |

### Competitive Snapshot

| Element | Source | Status |
|---|---|---|
| Horizontal bar chart of 5 entities' SOV | Run refreshes on 5 comparable subjects (e.g., Bernie, AOC, Biden, Buttigieg, the focal subject) and aggregate `mention_detection` across them. The methodology already supports this — seed subjects already exist in the DB; just needs aggregation. | 🔁 |
| Right-side table (Entity / Share / Avg Pos / First Mention) | Same data path. | 🔁 |

### Sources shaping AI answers

| Element | Source | Status |
|---|---|---|
| 7-row sources list (name, influence score, type) | `sources` extractor + `source_types` table. The "influence" score would need a definition (citation count? citation count × position prominence?). | 🟡 |
| Sources donut chart (proportional influence) | Same data, just visualized. | ✅ |

### Methodology footer

| Element | Source | Status |
|---|---|---|
| "Based on 1,284 AI responses across 4 platforms over the last 30 days" | COUNT query on `model_responses` for the period. The "4 platforms" count is currently 2 (gpt-5-mini, gemini-2.5-flash); reflects mock vs real. | ✅ |

---

## Dependency clusters

Tracing the gaps backward, **three dashboard elements collapse onto a
single methodology dependency: prompt topic tagging.**

1. Strategic Takeaways (all 3 rows)
2. Prompt Coverage card (4 rows)
3. Evidence card "frame label" (cross-references narrative clustering too)

All need prompts tagged with customer-facing topic categories like
"banking regulation" / "housing affordability". Today's `prompts` table
has byline methodology categories (named/1, unnamed/3) but no
customer-facing topic categorization.

Similarly, **two elements collapse onto a single dependency: narrative
clustering.**

1. Dominant narrative bars
2. Evidence card frame labels

Both need stable named narrative buckets (Progressive Reformer / Consumer
Advocate / etc.) that the per-response `narrative_themes` extractor
doesn't currently produce — its output is free-form per response.

---

## Recommended build order

Three phases. Each delivers visible dashboard progress.

### Phase 1 — Quick wins (1 day total, ~3 hours net coding)

Fill the easy gaps first. After this phase, the hero KPIs and trend
charts render against real Obama data.

| # | Task | Effort |
|---|---|---|
| 1 | Define **Risk Frame Rate** formula. Decision: `criticism_severity > 0.5` share OR weighted blend with `directional_lean`. Add a SQL helper or a small Python function. | 30 min |
| 2 | **Weekly trajectory aggregations**: write three queries (AI Recall, SOV, First Mention Rate) that produce `{week, value}` series across Obama's 13 refreshes. Expose via a new API endpoint or extend the existing subject-detail one. | 2 hr |
| 3 | **Citation Rate** as a derived metric: `cited_own_site` share. Already validated. Add as a derivation; surface in the dashboard once UI decision is made. | 30 min |
| 4 | **Hero KPI wiring**: replace the hardcoded `headlineKpis` array in `page.tsx` with values fetched from the API. Includes the per-platform recall strip. | 2 hr |
| 5 | **Visibility Trends wiring**: replace the hardcoded chart data with the weekly series from #2. | 1 hr |
| 6 | **Sources list + donut wiring**: replace hardcoded `sources` array with output from a new `GET /api/subjects/{id}/top-sources` endpoint that aggregates the existing `sources` extractor data. | 2 hr |

After Phase 1: ~60% of the dashboard renders real data. The remaining
hardcoded blocks are the narrative-dependent and topic-dependent ones.

### Phase 2 — Prompt topic tagging (1-2 days)

Unlocks Strategic Takeaways + Prompt Coverage + Evidence frame labels.

| # | Task | Effort |
|---|---|---|
| 1 | **Decide on a topic taxonomy**. ~8-15 categories covering the issue space the customer cares about. For Warren-like subjects: banking regulation, consumer protection, housing affordability, foreign policy, etc. For other subject types, similar lists. Each subject + comms team may want different sets — design choice. | 2-4 hr (design only) |
| 2 | **Migration 008**: add `topic_categories TEXT[]` (or a join table) on `prompts`. Optional column. | 30 min |
| 3 | **Tag the existing 50 prompts** with topic categories. By hand or with an LLM-assist. | 2-3 hr |
| 4 | **Surface topic-tag-aware aggregations** in the API: per-topic mention rate, per-topic recall, per-topic share-of-set. | 3-4 hr |
| 5 | **Strategic Takeaways generator** (cross-analyzer): mine for the biggest topic gaps and synthesize 2-4 takeaway sentences per refresh. Pattern: rule-based templating ("X% on topic A vs Y% on topic B") wrapped in concise prose. | 4-6 hr |
| 6 | **Prompt Coverage card wiring**: replace hardcoded list with topic-share + topic-recall query. | 1 hr |

After Phase 2: dashboard is ~85% real. Bottom Line, Recommended Focus,
and Dominant narrative remain.

### Phase 3 — Narrative clustering + executive synthesis (2-3 days)

Closes the loop on the hero and Evidence frame labels.

| # | Task | Effort |
|---|---|---|
| 1 | **Narrative clustering cross-analyzer**: aggregates per-response `narrative_themes` into N (4-6) named buckets per refresh. Three options: (a) hand-defined taxonomy that the existing extractor maps to (cheaper, more stable), (b) per-refresh clustering with an LLM call producing 4-6 named buckets ad hoc (richer, less stable), (c) hybrid — closed taxonomy as a starting set, LLM can suggest additions. Decision point. | 1-1.5 days |
| 2 | **Bottom Line synthesizer**: LLM-call cross-analyzer producing one sentence per refresh, drawing on the cross-analyzer outputs (asymmetry, narrative drift, share of voice). ~$0.005/refresh. Output stored in `refresh_analyses` keyed by `analysis_type='bottom_line'`. | 3-4 hr |
| 3 | **Recommended Focus generator**: rule-based templating from the Strategic Takeaways output + dominant narrative. "If topic X is strongest and topic Y is weakest, recommend connecting Y's messaging to X's authority." Output stored similarly. | 3-4 hr |
| 4 | **Frame labels on Evidence cards**: tag each response with its closest narrative bucket from #1. | 2 hr |
| 5 | **Hero wiring (Bottom Line + Recommended Focus + Dominant narrative)**: replace the hardcoded text in `page.tsx`. | 2 hr |

After Phase 3: dashboard fully wired to real data.

### Phase 4 — Cross-subject competitive view (1-2 days, can defer)

| # | Task | Effort |
|---|---|---|
| 1 | **Pick a competitor set** per subject. For a Person subject like Obama or Warren, a default set might be 4-5 comparable politicians. Customer-configurable; for v1, hardcoded per subject is fine. | Design |
| 2 | **Run refreshes on comparators** if not already done. (For Warren-comparable politicians, Obama's 13 snapshots could be the template; would cost ~$1-2 per comparator.) | 1-2 hr runtime |
| 3 | **Cross-subject aggregation queries**: SOV / Avg Pos / First Mention across the comparator set + focal subject. | 3-4 hr |
| 4 | **Competitive Snapshot wiring**: replace hardcoded `competitorRows` and chart data. | 1 hr |

Could be done in parallel with Phase 2 or 3 — independent of the
topic-tagging and narrative-clustering work.

---

## Decision points worth settling before starting

1. **Risk Frame Rate formula.** Pick one of: criticism_severity > 0.5
   share; directional_lean opposite expected; combined weight. Affects
   the displayed value across the dashboard.
2. **Topic taxonomy.** 8-15 customer-facing topics is the right
   ballpark. Static (define once, tag all prompts) vs dynamic (per
   subject, customer-configurable)? Static is faster to ship.
3. **Narrative clustering approach.** Closed taxonomy (more stable,
   methodology-honest) vs per-refresh LLM clustering (richer, less
   stable). Recommend closed-taxonomy for v1.
4. **Sources "influence" score formula.** Citation count alone, vs
   citation count × prominence (position in response), vs
   authority-weighted (NYT counts more than a blog). Affects the
   Sources list ordering and donut sizing.
5. **Competitor sets.** Per-subject hardcoded (faster) vs customer-
   selectable (more flexible). v1 should be hardcoded.

---

## Out of scope for v1 dashboard wiring

- Real-time refresh of the dashboard. The data updates only when the
  worker runs a new refresh — no live-streaming.
- Drilling into individual response data from the dashboard. Each
  spoke does that; the Overview is summary-only.
- Multi-subject views ("see all my subjects' scorecards"). Each subject
  has its own dashboard. Multi-subject is a future product surface.
- ChatGPT / Claude / Perplexity provider support. Currently we run
  gpt-5-mini and gemini-2.5-flash. Adding more providers is a methodology
  + integration project, not a dashboard project. The per-platform strip
  will show "—" for unsupported providers until they're added.

---

## Summary

Three-phase build path:
1. **Quick wins** (1 day): real data behind hero KPIs + trend charts + sources.
2. **Prompt topic tagging** (1-2 days): unlocks Strategic Takeaways + Prompt Coverage + Evidence frame labels.
3. **Narrative clustering + executive synthesis** (2-3 days): closes the loop on Bottom Line + Recommended Focus + Dominant narrative.

Optional **Phase 4** (1-2 days, independent): cross-subject Competitive Snapshot.

Total greenfield effort: roughly **5-8 days** of focused work to fully
wire the customer-facing dashboard against real data.

Quickest path to a customer-shareable dashboard: Phase 1 + Phase 4 (real
KPIs and competitive view; Bottom Line and Strategic Takeaways stay
hardcoded as "preview" notes until Phase 2-3 ship).
