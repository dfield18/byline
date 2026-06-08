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
    },
    {
      id: "sentiment",
      label: "avg sentiment",
      value: k.avg_sentiment.value === null ? "—" : k.avg_sentiment.value.toFixed(2),
      ...fmtDelta(k.avg_sentiment.delta, "pts"),
      spark: t.avg_sentiment,
      info: "Average tone of AI answers about this subject, scored from −1 (negative) to +1 (positive). Around 0 is neutral.",
    },
    {
      id: "risk",
      label: "risk framing",
      value: pct(k.risk_frame_rate.value),
      delta: k.risk_frame_rate.value === 0 ? "none detected" : "detected",
      deltaDirection: k.risk_frame_rate.value === 0 ? "neutral" : "down",
      spark: t.risk_frame_rate,
      info: "Share of answers that frame the subject around controversy, scandal, extremism, or reputational risk. Lower is better.",
    },
    {
      id: "citation",
      label: "citation rate",
      value: pct(k.citation_rate.value),
      ...fmtDelta(k.citation_rate.delta, "pp"),
      spark: t.citation_rate,
      info: "Share of AI answers that cite one of the subject's own websites.",
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

  // Coverage matrix (theme × model prominence + association) — the same shape
  // the /dashboard spoke renders. Also flattened to `drivers` for any consumer
  // that only needs theme + association.
  const cov = buildCoverageMatrix(api);
  const coverage = {
    platforms: cov.platforms,
    rows: cov.rows.map((r) => ({
      id: r.label + r.full,
      label: r.label,
      full: r.full,
      level: r.level,
      cells: r.cells,
    })),
  };
  const drivers = coverage.rows.map((r) => ({
    id: r.id,
    label: r.label,
    association: r.level,
  }));

  // Concise one-line framing per model: a real full sentence built from the
  // model's assigned frame (frame_label), kept to ~5–10 words.
  const cardFor = (slug: string) =>
    api.evidence_cards.find((e) => e.model_slug === slug) ?? null;
  const models = api.per_platform_kpis
    .filter((m) => (m.n_responses ?? 0) > 0)
    .map((m) => {
      const frame = cardFor(m.slug)?.frame_label?.trim();
      return {
        id: m.slug,
        name: m.name,
        summary: frame
          ? `Frames ${api.subject_name} around ${frame}.`
          : "No distinct frame surfaced yet.",
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
          spoke: recSpoke(a.label, a.why),
        }))
    : [];

  // One-line takeaway (~10–15 words), derived from visibility + sentiment +
  // competitive standing. Used when the backend bottom_line is absent.
  const mentionPct = k.ai_recall.value !== null ? Math.round(k.ai_recall.value * 100) : null;
  const visBand =
    mentionPct === null ? null : mentionPct < 34 ? "Low" : mentionPct < 67 ? "Moderate" : "Strong";
  const sentWord = bandSentiment(k.avg_sentiment.value);
  const subjStanding = api.competitive.find((c) => c.is_subject);
  const nRivals = api.competitive.filter((c) => !c.is_subject).length;
  const aheadOf = subjStanding
    ? api.competitive.filter((c) => !c.is_subject && c.sov > subjStanding.sov).length
    : 0;
  const standing =
    nRivals === 0 || !subjStanding
      ? null
      : aheadOf === 0
        ? `leading all ${nRivals} tracked rivals`
        : aheadOf >= nRivals
          ? `trailing all ${nRivals} tracked rivals`
          : `behind ${aheadOf} of ${nRivals} tracked rivals`;
  const takeaway =
    visBand === null
      ? null
      : `${visBand} AI visibility (${mentionPct}% mention rate), ${sentWord} sentiment${
          standing ? `, ${standing}` : ""
        }.`;

  return {
    subject: api.subject_name,
    category: api.category || null,
    updatedLabel: updated ? `updated ${updated}` : "no snapshot yet",
    snapshotLabel: updated,
    comparedWith,
    comparisonLabel,
    bottomLine: api.bottom_line ?? takeaway,
    kpis,
    themes: [], // populated once the bucket query-template model exists
    mentionTrend,
    trendLabels,
    competitors,
    drivers,
    coverage,
    models,
    sources,
    topSources,
    sourceTotalLabel: `${total} citations`,
    recommendations,
  };
}
