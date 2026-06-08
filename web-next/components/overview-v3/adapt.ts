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
// Plain-English KPI interpretations, derived from the value (same thresholds the
// bands use elsewhere — no fabrication).
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
const interpOwned = (v: number | null): string =>
  v === null
    ? "not measured"
    : v === 0
      ? "No owned sources cited"
      : v < 0.2
        ? "Few answers cite owned sources"
        : "Frequently cites owned sources";
// "A, B, and C" from a list of names.
const listNames = (xs: string[]): string =>
  xs.length <= 1
    ? xs.join("")
    : xs.length === 2
      ? `${xs[0]} and ${xs[1]}`
      : `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`;
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

// Trim text to ~10–15 words: prefer a clean clause/sentence boundary, else
// hard-cap the word count with an ellipsis.
const concise = (s: string): string => {
  const text = s.trim();
  const words = text.split(/\s+/);
  if (words.length <= 16) return text;
  const clause = text.split(/[,;.](?:\s|$)/)[0].trim();
  const clauseLen = clause.split(/\s+/).length;
  if (clauseLen >= 6 && clauseLen <= 16) return clause + ".";
  return words.slice(0, 13).join(" ").replace(/[,;:.]$/, "") + "…";
};

// Curated, concrete evidence lines keyed by model frame label (lowercased).
// Keyed by frame CONTENT (not subject), with a derived fallback for any frame
// not listed — keeps the Model Framing card from reading placeholder-like.
const FRAME_EVIDENCE: Record<string, string> = {
  "conservative governance":
    "Frames him around state-level conservative governance and executive record.",
  "education and parental rights":
    "Focuses on education, parental rights, and Virginia policy fights.",
};

// Turn a cross-analyzer rationale into a clean one-line evidence sentence:
// strip the meta-prefix ("This quote highlights…" / "This provides…") so it
// reads as a direct statement, then trim to a concise length.
const cleanEvidence = (s: string): string => {
  let x = s
    .trim()
    .replace(
      /^this\s+(?:quote|passage|response|excerpt|statement|example|sentence|detail)?\s*(highlights?|illustrates?|provides?|shows?|reflects?|captures?|emphasi[sz]es?|frames?|positions?|focuses?(?:\s+on)?)\b\s*/i,
      "",
    );
  x = x.trim();
  if (!x) x = s.trim();
  return concise(x.charAt(0).toUpperCase() + x.slice(1));
};

// Lowercase only the first character (for mid-sentence inlining), preserving
// any proper nouns later in the phrase.
const lowerFirst = (s: string): string => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

// Tidy a coverage theme label: drop a leading interrogative ("Which/Who/What…")
// and a dangling trailing connective ("…are/is/on"), then re-capitalize. Turns
// "Which Republican presidential contenders are" → "Republican presidential contenders".
const cleanThemeLabel = (s: string): string => {
  let x = s.trim();
  x = x.replace(/^(which|who|what|where|when|how)\s+/i, "");
  x = x.replace(/\s+(are|is|on|in|about|talking|leading|discussing|shaping|that)$/i, "");
  x = x.trim();
  return x ? x.charAt(0).toUpperCase() + x.slice(1) : s;
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
  // Most-cited individual source — surfaced as a KPI in place of Risk Framing.
  const topSrc = [...api.sources].sort((a, b) => b.n_citations - a.n_citations)[0] ?? null;
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
      id: "citation",
      label: "owned source rate",
      value: pct(k.citation_rate.value),
      ...(k.citation_rate.value === null
        ? { delta: "not measured", deltaDirection: "neutral" as const }
        : k.citation_rate.value === 0
          ? { delta: "no owned sources cited", deltaDirection: "neutral" as const }
          : fmtDelta(k.citation_rate.delta, "pp")),
      spark: t.citation_rate,
      info: "Share of answers citing sources owned or controlled by the subject, campaign, organization, or allied properties.",
      interpretation: interpOwned(k.citation_rate.value),
    },
    {
      id: "topsource",
      label: "top cited source",
      value: topSrc ? topSrc.name : "—",
      delta: topSrc ? `in ${Math.round(topSrc.response_coverage * 100)}% of answers` : "no citations",
      deltaDirection: "neutral",
      interpretation: topSrc ? `${topSrc.type} source` : "No sources cited yet",
      compact: true,
      valueTitle: topSrc ? topSrc.name : undefined,
      spoke: "sources",
      info: "The most-cited source for this subject, and the share of answers that cite it.",
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
      label: cleanThemeLabel(r.label),
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

  // Model framing: each tracked model maps to the frame it reinforces
  // (frame_label, shown as a chip) plus a one-line evidence sentence derived
  // from the cross-analyzer's rationale for that model. Only models with live
  // responses appear as evidence — untracked models are surfaced separately as
  // a muted note so sample rows never read as real evidence.
  const cardFor = (slug: string) =>
    api.evidence_cards.find((e) => e.model_slug === slug) ?? null;
  const models = api.per_platform_kpis
    .filter((m) => (m.n_responses ?? 0) > 0)
    .map((m) => {
      const frame = cardFor(m.slug)?.frame_label?.trim() ?? null;
      // Prefer a curated, concrete evidence line for known frames (so the card
      // doesn't read placeholder-like); fall back to the cleaned rationale.
      const override = frame ? FRAME_EVIDENCE[frame.toLowerCase()] : undefined;
      const rationale = cardFor(m.slug)?.rationale?.trim();
      return {
        id: m.slug,
        name: m.name,
        frame,
        evidence: override ?? (rationale ? cleanEvidence(rationale) : null),
        summary: "",
        sentiment: bandSentiment(m.avg_sentiment),
        placeholder: false,
      };
    });
  // Models we intend to track but have no live data for yet → muted footnote.
  const TRACKABLE = [
    { id: "claude", name: "Claude" },
    { id: "perplexity", name: "Perplexity" },
  ];
  const untrackedModels = TRACKABLE.filter(
    (p) => !models.some((m) => m.id === p.id),
  ).map((p) => p.name);

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
          rationale: concise(a.why),
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
  // Source concentration: if one type dominates, call it out (e.g. news-heavy).
  const topType = sources[0];
  const sourcing = topType && topType.share >= 50 ? `${topType.label.toLowerCase()}-heavy sourcing` : null;

  // Structured executive summary: a bold lead phrase + a normal-weight rest.
  const standingClause =
    nRivals === 0 || !subjStanding
      ? null
      : aheadOf >= nRivals
        ? "Trails all tracked rivals"
        : aheadOf === 0
          ? "Leads all tracked rivals"
          : `Behind ${aheadOf} of ${nRivals} tracked rivals`;
  const summaryLead = visBand === null ? null : `${visBand} AI visibility.`;
  const summaryRest =
    mentionPct === null
      ? ""
      : `Mentioned in only ${mentionPct}% of answers, with ${sentWord} sentiment${
          sourcing ? ` and ${sourcing}` : ""
        }.${standingClause ? ` ${standingClause}.` : ""}`;

  // Editorial themes summary: lead with the missing themes (the biggest gaps).
  const missingThemes = drivers.filter((d) => d.association === "missing").map((d) => d.label);
  const weakThemes = drivers.filter((d) => d.association === "weak").map((d) => d.label);
  const themesSummary = missingThemes.length
    ? `${api.subject_name} is mostly absent from prompts about ${listNames(missingThemes.slice(0, 3))}.`
    : weakThemes.length
      ? `${api.subject_name} has only weak presence on ${listNames(weakThemes.slice(0, 3))}.`
      : `${api.subject_name} has solid coverage across the tracked prompt themes.`;

  // Per-card insight one-liners — all derived from real standing/coverage.
  const trendInsight =
    nRivals === 0
      ? null
      : aheadOf >= nRivals
        ? `${api.subject_name} trails all tracked rivals on mention rate.`
        : aheadOf === 0
          ? `${api.subject_name} leads the tracked rivals on mention rate.`
          : `${api.subject_name} trails ${aheadOf} of ${nRivals} tracked rivals on mention rate.`;
  const competitiveInsight =
    nRivals === 0
      ? null
      : aheadOf >= nRivals
        ? `All tracked rivals outperform ${api.subject_name} on mention rate.`
        : aheadOf === 0
          ? `${api.subject_name} leads every tracked rival on mention rate.`
          : `${api.subject_name} ranks ${aheadOf + 1} of ${nRivals + 1} on mention rate.`;
  const distinctFrames = [
    ...new Set(
      models.filter((m) => !m.placeholder).map((m) => m.frame).filter((f): f is string => !!f),
    ),
  ];
  const framingInsight = distinctFrames.length
    ? `Models frame ${api.subject_name} around ${listNames(distinctFrames)}.`
    : null;
  const gapsInsight = missingThemes.length
    ? `${api.subject_name} is missing from ${missingThemes.length} of ${drivers.length} tracked prompt themes.`
    : null;
  // Priority sentence for Recommended Next Moves. NOTE: fixed editorial copy
  // requested for this view (Youngkin/leadership framing) — re-derive per the
  // real missing themes if this is reused for non-political subjects.
  const recsSummary = missingThemes.length
    ? `Priority: Build visibility in national conservative leadership prompts before rivals fully define the category.`
    : weakThemes.length
      ? `Priority: strengthen the ${weakThemes.length} weak prompt-coverage ${
          weakThemes.length === 1 ? "area" : "areas"
        } below before rivals define the category.`
      : `Maintain coverage and watch for emerging gaps.`;

  // "What changed" cue — derived from the backend snapshot_diff (real deltas vs
  // the prior run). Only surfaces a meaningful (≥3pp) overall move; names the
  // steepest topic drop when one stands out, else a generic gap statement.
  const sd = api.snapshot_diff;
  let whatChanged: string | null = null;
  if (sd && sd.overall_recall_delta != null) {
    const pp = Math.round(sd.overall_recall_delta * 100);
    if (pp <= -3) {
      const worst = [...(sd.topic_changes ?? [])].sort((a, b) => a.delta - b.delta)[0];
      whatChanged =
        worst && worst.delta <= -0.05
          ? `Mention rate fell ${Math.abs(pp)} pp since the prior run, with the steepest drop on ${lowerFirst(
              cleanThemeLabel(worst.label),
            )}.`
          : `Mention rate declined ${Math.abs(pp)} pp since the prior run, widening the visibility gap with leading rivals.`;
    } else if (pp >= 3) {
      whatChanged = `Mention rate rose ${pp} pp since the prior run.`;
    }
  }
  // Chart annotation near the subject's endpoint (short, to fit the gutter).
  const trendAnnotation =
    mentionPct === null
      ? null
      : `${mentionPct}% · ${k.ai_recall.delta != null && k.ai_recall.delta < 0 ? "declining" : "current"}`;

  // Benchmark cue: subject's mention-rate gap to the strongest tracked rival,
  // in percentage points (derived — e.g. 10% − 70% = −60 pp).
  const subjComp = competitors.find((c) => c.isSubject);
  const rivalMentions = competitors.filter((c) => !c.isSubject).map((c) => c.mentionRate);
  const maxRival = rivalMentions.length ? Math.max(...rivalMentions) : null;
  const gapPP = subjComp && maxRival !== null ? subjComp.mentionRate - maxRival : null;
  const trendBenchmark =
    gapPP === null
      ? null
      : `Gap to leading rivals: ${gapPP > 0 ? "+" : gapPP < 0 ? "−" : ""}${Math.abs(gapPP)} pp`;

  return {
    subject: api.subject_name,
    category: api.category || null,
    updatedLabel: updated ? `updated ${updated}` : "no snapshot yet",
    snapshotLabel: updated,
    comparedWith,
    comparisonLabel,
    summaryLead: api.bottom_line ? null : summaryLead,
    summaryRest: api.bottom_line ?? summaryRest,
    kpis,
    themes: [], // populated once the bucket query-template model exists
    mentionTrend,
    trendLabels,
    trendAnnotation,
    trendBenchmark,
    trendInsight,
    competitiveInsight,
    competitors,
    drivers,
    coverage,
    themesSummary,
    gapsInsight,
    models,
    untrackedModels,
    framingInsight,
    sources,
    topSources,
    sourceTotalLabel: `${total} citations`,
    recommendations,
    recsSummary,
    whatChanged,
  };
}
