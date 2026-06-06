import type { SubjectOverview } from "@/lib/api";
import { buildCoverageMatrix } from "@/lib/dashboardCopy";
import type { OverviewData, Sentiment, KpiMetric, DeltaDirection } from "./OverviewDashboard";

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
const seriesToPoints = (xs: (number | null)[]): number[] =>
  xs.filter((v): v is number => v !== null).map((v) => Math.round(v * 100));

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

  const k = api.kpis;
  const kpis: KpiMetric[] = [
    { id: "mention", label: "mention rate", value: pct(k.ai_recall.value), ...fmtDelta(k.ai_recall.delta, "pp") },
    {
      id: "sentiment",
      label: "avg sentiment",
      value: k.avg_sentiment.value === null ? "—" : k.avg_sentiment.value.toFixed(2),
      ...fmtDelta(k.avg_sentiment.delta, "pts"),
    },
    {
      id: "risk",
      label: "risk framing",
      value: pct(k.risk_frame_rate.value),
      delta: k.risk_frame_rate.value === 0 ? "none detected" : "detected",
      deltaDirection: k.risk_frame_rate.value === 0 ? "neutral" : "down",
    },
    { id: "citation", label: "citation rate", value: pct(k.citation_rate.value), ...fmtDelta(k.citation_rate.delta, "pp") },
  ];

  // Mention trend: subject + top-2 rivals by share of voice.
  const ranked = [...api.competitive].sort((a, b) => b.sov - a.sov);
  const topRivals = ranked.filter((c) => !c.is_subject).slice(0, 2).map((c) => c.name);
  const mentionTrend = [
    { id: "subject", name: api.subject_name, isSubject: true, points: seriesToPoints(api.trajectory.ai_recall) },
    ...topRivals.map((name) => {
      const t = api.competitor_trajectories.find((ct) => ct.name === name);
      return { id: name, name, isSubject: false, points: t ? seriesToPoints(t.mention_rate) : [] };
    }),
  ].filter((s) => s.points.length > 0);

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

  const excerptFor = (slug: string) =>
    api.evidence_cards.find((e) => e.model_slug === slug)?.excerpt ?? null;
  const models = api.per_platform_kpis
    .filter((m) => (m.n_responses ?? 0) > 0)
    .map((m) => ({
      id: m.slug,
      name: m.name,
      summary: excerptFor(m.slug) ?? "No representative quote surfaced yet.",
      sentiment: bandSentiment(m.avg_sentiment),
    }));

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

  const rec = api.recommended_actions;
  const recommendations = rec
    ? [rec.primary, ...rec.secondary]
        .slice(0, 3)
        .map((a, i) => ({ id: `${a.label}-${i}`, title: a.label, rationale: a.why }))
    : [];

  return {
    subject: api.subject_name,
    updatedLabel: updated ? `updated ${updated}` : "no snapshot yet",
    kpis,
    themes: [], // populated once the bucket query-template model exists
    mentionTrend,
    competitors,
    drivers,
    models,
    sources,
    sourceTotalLabel: `${total} citations`,
    recommendations,
  };
}
