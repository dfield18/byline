import type { SubjectOverview } from "@/lib/api";
import { buildCoverageMatrix } from "@/lib/dashboardCopy";
import type { OverviewData, Sentiment, KpiMetric, DeltaDirection, Spoke } from "./OverviewDashboard";

// Route a recommended action to the most relevant detail spoke by keyword.
// Defaults to the Recommendations spoke so every action links somewhere.
function recSpoke(label: string, why: string): Spoke {
  const s = `${label} ${why}`.toLowerCase();
  if (/wikipedia|source|cite|citation|domain|outlet|publication/.test(s)) return "sources";
  if (/narrative|framing|sentiment|tone|story|cluster/.test(s)) return "narrative";
  if (/competitor|rival|versus|\bvs\b|share of voice|leaderboard/.test(s)) return "competition";
  if (/topic|op-?ed|brief|issue|coverage|associat|prompt|conservativ|gop|policy/.test(s)) return "prompts";
  return "recommendations";
}

/** Map a raw sentiment score in [-1, 1] to the component's enum. */
export function bandSentiment(score: number | null): Sentiment {
  if (score === null) return "neutral";
  if (score >= 0.15) return "positive";
  if (score <= -0.15) return "negative";
  return "neutral";
}

/** Format a KPI delta (percentage points or sentiment points) for display. */
function fmtDelta(delta: number | null, unit: "pp" | "pts"): Pick<KpiMetric, "delta" | "deltaDirection"> {
  if (delta === null) return { delta: "no prior", deltaDirection: "neutral" };
  const rounded = Math.round(delta);
  if (rounded === 0) return { delta: "no change", deltaDirection: "neutral" };
  const dir: DeltaDirection = rounded > 0 ? "up" : "down";
  return { delta: `${rounded > 0 ? "↑" : "↓"} ${Math.abs(rounded)} ${unit}`, deltaDirection: dir };
}

const pct = (v: number | null): string => (v === null ? "—" : `${Math.round(v * 100)}%`);
// Map a 0..1 fraction series to 0..100, preserving nulls so every series stays
// index-aligned to trajectory.weeks (the chart's shared x-axis).
const alignPoints = (xs: (number | null)[]): (number | null)[] =>
  xs.map((v) => (v === null ? null : Math.round(v * 100)));
// Short x-axis label for a trajectory week bucket; falls back to the raw string.
const fmtWeek = (w: string): string => {
  const d = new Date(w);
  return Number.isNaN(d.getTime())
    ? w
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

// "A, B, and C" from a list of names.
const listNames = (xs: string[]): string =>
  xs.length <= 1
    ? xs.join("")
    : xs.length === 2
      ? `${xs[0]} and ${xs[1]}`
      : `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`;

// Plain-English interpretations, derived generically from the value (no
// fabrication — same thresholds the KPI band uses elsewhere).
const interpMention = (v: number | null): string =>
  v === null
    ? "No visibility data yet"
    : v < 0.34
      ? "Low visibility across monitored prompts"
      : v < 0.67
        ? "Moderate visibility across prompts"
        : "Strong visibility across prompts";
const interpSentiment = (v: number | null): string =>
  v === null
    ? "No sentiment measured yet"
    : v >= 0.15
      ? "Positive overall framing"
      : v <= -0.15
        ? "Negative overall framing"
        : "Neutral overall framing";
const interpRisk = (v: number | null): string =>
  v === null ? "No data yet" : v === 0 ? "No major negative frames" : "Negative framing detected";
const interpCitation = (v: number | null): string =>
  v === null
    ? "Insufficient comparison data"
    : v < 0.2
      ? "Few answers cite sources"
      : "Answers frequently cite sources";

/**
 * Adapt the live `SubjectOverview` payload into the prop-driven `OverviewData`
 * contract. Wired to the CURRENT backend (decision: ship on today's data).
 *
 * `themes` (the issues/recent-news/candidate/race spine) is intentionally left
 * empty until the bucket query-template model lands — the component hides the
 * spine when it's empty rather than show fabricated bucket data.
 */
export function toOverviewData(api: SubjectOverview): OverviewData {
  const updated = api.meta.last_refresh_at
    ? new Date(api.meta.last_refresh_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;

  // KPI deltas are computed by the backend "vs the prior completed refresh".
  // Label them with that prior snapshot's date + the elapsed gap, so "↓ 30 pp"
  // is unambiguous (refresh cadence varies, so we show the real window).
  const priorAt = api.snapshot_diff?.prior_refresh_at ?? null;
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  let comparisonLabel = "First snapshot — no prior period to compare yet";
  let comparedWith = "No prior run to compare yet";
  if (priorAt) {
    const ms =
      api.meta.last_refresh_at != null
        ? new Date(api.meta.last_refresh_at).getTime() - new Date(priorAt).getTime()
        : 0;
    const days = Math.round(ms / 86_400_000);
    const hours = Math.round(ms / 3_600_000);
    const rel =
      days >= 1
        ? `${days} day${days === 1 ? "" : "s"} earlier`
        : hours >= 1
          ? `${hours} hour${hours === 1 ? "" : "s"} earlier`
          : "earlier today";
    comparisonLabel = `Change vs previous snapshot — ${fmtDate(priorAt)} (${rel})`;
    comparedWith = `previous run ${rel}`;
  }

  const k = api.kpis;
  const t = api.trajectory;
  const kpis: KpiMetric[] = [
    {
      id: "mention",
      label: "mention rate",
      value: pct(k.ai_recall.value),
      ...fmtDelta(k.ai_recall.delta, "pp"),
      spark: t.ai_recall,
      info: "Share of AI answers that mention this subject at all. Higher means the subject surfaces more often when these prompts are asked.",
      interpretation: interpMention(k.ai_recall.value),
    },
    {
      id: "sentiment",
      label: "avg sentiment",
      value: k.avg_sentiment.value === null ? "—" : k.avg_sentiment.value.toFixed(2),
      ...fmtDelta(k.avg_sentiment.delta, "pts"),
      spark: t.avg_sentiment,
      info: "Average tone of AI answers about this subject, scored from −1 (negative) to +1 (positive). Around 0 is neutral.",
      interpretation: interpSentiment(k.avg_sentiment.value),
    },
    {
      id: "risk",
      label: "risk framing",
      value: pct(k.risk_frame_rate.value),
      delta: k.risk_frame_rate.value === 0 ? "none detected" : "detected",
      deltaDirection: k.risk_frame_rate.value === 0 ? "neutral" : "down",
      spark: t.risk_frame_rate,
      info: "Share of answers that frame the subject around controversy, scandal, extremism, or reputational risk. Lower is better.",
      interpretation: interpRisk(k.risk_frame_rate.value),
    },
    {
      id: "citation",
      label: "citation rate",
      value: pct(k.citation_rate.value),
      ...fmtDelta(k.citation_rate.delta, "pp"),
      spark: t.citation_rate,
      info: "Share of AI answers that cite or link an external source when discussing this subject.",
      interpretation: interpCitation(k.citation_rate.value),
    },
  ];

  // Mention trend: subject + top-2 rivals by share of voice. Points stay
  // null-aligned to trajectory.weeks so the chart's x-axis lines up.
  const ranked = [...api.competitive].sort((a, b) => b.sov - a.sov);
  const topRivals = ranked.filter((c) => !c.is_subject).slice(0, 2).map((c) => c.name);
  const trendLabels = t.weeks.map(fmtWeek);
  const mentionTrend = [
    { id: "subject", name: api.subject_name, isSubject: true, points: alignPoints(t.ai_recall) },
    ...topRivals.map((name) => {
      const ct = api.competitor_trajectories.find((c) => c.name === name);
      return { id: name, name, isSubject: false, points: ct ? alignPoints(ct.mention_rate) : [] };
    }),
  ].filter((s) => s.points.some((p) => p !== null));

  // Editorial trend insight: subject's mention rate vs the top rivals'.
  const subjComp = api.competitive.find((c) => c.is_subject);
  const trendRivals = ranked.filter((c) => !c.is_subject).slice(0, 3);
  const subjPct = subjComp ? Math.round(subjComp.sov * 100) : null;
  const rivalMaxPct = trendRivals.length
    ? Math.max(...trendRivals.map((c) => Math.round(c.sov * 100)))
    : null;
  const trendInsight =
    subjPct !== null && rivalMaxPct !== null
      ? `${api.subject_name} appears in only ${subjPct}% of answers, while ${listNames(
          trendRivals.map((c) => c.name),
        )} appear in up to ${rivalMaxPct}%.`
      : null;

  // Top 4 rivals by share of voice + the subject = 5 rows (re-sorted by sov so
  // the subject sits in its natural position).
  const rivals = ranked.filter((c) => !c.is_subject).slice(0, 4);
  const subjectRow = ranked.find((c) => c.is_subject);
  const shown = (subjectRow ? [...rivals, subjectRow] : rivals).sort(
    (a, b) => b.sov - a.sov,
  );
  const competitors = shown.map((c) => ({
    id: c.name,
    name: c.name,
    mentionRate: Math.round(c.sov * 100),
    avgRank: c.avg_rank ?? 0,
    topAnswerRate: Math.round(c.first_mention_rate * 100),
    isSubject: c.is_subject,
  }));

  // Drivers = per-theme association strength, reusing the coverage-matrix logic.
  const drivers = buildCoverageMatrix(api).rows.map((r) => ({
    id: r.label + r.full,
    label: r.label,
    association: r.level,
  }));

  // Editorial themes summary: lead with the missing themes (the biggest gaps),
  // then weak, else acknowledge solid coverage.
  const missingThemes = drivers.filter((d) => d.association === "missing").map((d) => d.label);
  const weakThemes = drivers.filter((d) => d.association === "weak").map((d) => d.label);
  const themesSummary = missingThemes.length
    ? `${api.subject_name} is mostly absent from prompts about ${listNames(missingThemes.slice(0, 3))}.`
    : weakThemes.length
      ? `${api.subject_name} has only weak presence on ${listNames(weakThemes.slice(0, 3))}.`
      : `${api.subject_name} has solid coverage across the tracked prompt themes.`;

  // Model evidence: a concise one-sentence read of each model's framing
  // (rationale — a full sentence, ~15–20 words) plus the frame it reinforces.
  const cardFor = (slug: string) =>
    api.evidence_cards.find((e) => e.model_slug === slug) ?? null;
  const models = api.per_platform_kpis
    .filter((m) => (m.n_responses ?? 0) > 0)
    .map((m) => {
      const card = cardFor(m.slug);
      return {
        id: m.slug,
        name: m.name,
        frame: card?.frame_label ?? null,
        summary: card?.rationale || card?.excerpt || "No analysis surfaced yet.",
        sentiment: bandSentiment(m.avg_sentiment),
      };
    });

  // Source-type mix: aggregate citations by type.
  const byType = new Map<string, number>();
  for (const s of api.sources) byType.set(s.type, (byType.get(s.type) ?? 0) + s.n_citations);
  const total = api.sources.reduce((a, s) => a + s.n_citations, 0);
  const sources = [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({
      id: label,
      label,
      share: total > 0 ? Math.round((count / total) * 100) : 0,
      count,
    }));

  // Top individual sources by citation count.
  const topSources = [...api.sources]
    .sort((a, b) => b.n_citations - a.n_citations)
    .slice(0, 5)
    .map((s) => ({ id: s.name, name: s.name, type: s.type, citations: s.n_citations }));

  const rec = api.recommended_actions;
  const recommendations = rec
    ? [rec.primary, ...rec.secondary]
        .slice(0, 3)
        .map((a, i) => ({
          id: `${a.label}-${i}`,
          title: a.label,
          rationale: a.why,
          nextMove: a.action ?? null,
          spoke: recSpoke(a.label, a.why),
        }))
    : [];

  return {
    subject: api.subject_name,
    category: api.category || null,
    updatedLabel: updated ? `updated ${updated}` : "no snapshot yet",
    snapshotLabel: updated,
    comparedWith,
    comparisonLabel,
    bottomLine: api.bottom_line ?? null,
    kpis,
    themes: [], // populated once the bucket query-template model exists
    mentionTrend,
    trendLabels,
    trendInsight,
    competitors,
    drivers,
    themesSummary,
    models,
    sources,
    topSources,
    sourceTotalLabel: `${total} citations`,
    recommendations,
  };
}
