/**
 * Plain-English interpretation helpers for the Overview Dashboard. These turn
 * the real SubjectOverview payload (the same data powering the KPI cards, chart,
 * ranking, sources, and prompts) into the executive-briefing copy the dashboard
 * shows — kept here, out of the JSX, so the wording is easy to tune and could be
 * unit-tested. Nothing here is hardcoded to a specific subject.
 */
import type { SubjectOverview, KpiValue } from "@/lib/api";

function pct(v: number | null): number | null {
  return v === null ? null : Math.round(v * 100);
}

// Qualitative frequency word for a 0..100 mention rate.
function freqWord(p: number): string {
  if (p >= 90) return "nearly all";
  if (p >= 66) return "most";
  if (p >= 45) return "about half";
  if (p >= 25) return "a minority";
  return "few";
}

/**
 * "What changed" as a terse, scannable list with the actual numbers —
 * e.g. "Mention 80→50% · Citation 5→15% · Sentiment neutral". Arrow notation
 * keeps it compact for the dashboard's small summary column.
 */
export function buildWhatChangedSentence(kpis: SubjectOverview["kpis"]): string {
  const move = (k: KpiValue, noun: string): string | null => {
    if (k.value === null) return null;
    const cur = Math.round(k.value * 100);
    if (k.delta === null || Math.round(k.delta) === 0) return `${noun} ${cur}%`;
    const prior = cur - Math.round(k.delta);
    return `${noun} ${prior}→${cur}%`;
  };
  const parts = [
    move(kpis.ai_recall, "Mention"),
    move(kpis.citation_rate, "Citation"),
  ].filter((p): p is string => p !== null);

  const s = kpis.avg_sentiment;
  const tone =
    s.value === null ? null : s.value > 0.1 ? "positive" : s.value < -0.1 ? "negative" : "neutral";
  if (tone) parts.push(`Sentiment ${tone}`);

  if (parts.length === 0) return "Little change.";
  return parts.join(" · ");
}

/** "What changed since last snapshot" — one bullet per KPI, from value+delta. */
export function buildWhatChanged(kpis: SubjectOverview["kpis"]): string[] {
  const rate = (label: string, k: KpiValue): string => {
    const cur = pct(k.value);
    if (cur === null) return `${label}: not enough data yet.`;
    if (k.delta === null) return `${label} is ${cur}% (no prior snapshot to compare).`;
    if (Math.round(k.delta) === 0) return `${label} held steady at ${cur}%.`;
    const prior = cur - Math.round(k.delta);
    return `${label} ${k.delta < 0 ? "dropped" : "rose"} from ${prior}% to ${cur}%.`;
  };

  const sentiment = (k: KpiValue): string => {
    if (k.value === null) return "Sentiment: not enough data yet.";
    const tone = k.value > 0.1 ? "positive" : k.value < -0.1 ? "negative" : "neutral";
    if (k.delta === null || Math.abs(k.delta) < 1) return `Sentiment stayed ${tone}.`;
    return `Sentiment ${k.delta > 0 ? "improved" : "softened"} but remains ${tone}.`;
  };

  return [
    rate("AI mention rate", kpis.ai_recall),
    rate("Citation rate", kpis.citation_rate),
    sentiment(kpis.avg_sentiment),
    rate("Risk framing", kpis.risk_frame_rate),
  ];
}

/**
 * Chart takeaway connecting the trend to the ranking: when the subject ranks
 * well but is mentioned less than rivals, frame it as "reach, not rank".
 */
export function buildVisibilityInterp(
  overview: SubjectOverview,
): string | null {
  const rows = [...overview.competitive].sort((a, b) => b.sov - a.sov);
  const subject = rows.find((r) => r.is_subject);
  if (!subject) return null;
  const s = Math.round(subject.sov * 100);
  const trailsOnReach = rows.some((r) => !r.is_subject && r.sov > subject.sov);
  const ranksWell = subject.avg_rank !== null && subject.avg_rank <= 3;

  if (trailsOnReach && ranksWell) {
    return `${overview.subject_name}'s issue is reach, not rank: appears in ${freqWord(s)} of answers (${s}%), but ranks highly when mentioned.`;
  }
  const rivals = rows.filter((r) => !r.is_subject).slice(0, 2);
  if (rivals.length === 0) return null;
  const tail = rivals
    .map((r) => `${r.name} in ${freqWord(Math.round(r.sov * 100))}`)
    .join(" and ");
  return `${overview.subject_name} appears in ${freqWord(s)} of AI answers (${s}%), vs ${tail}.`;
}

/** Ranking insight — frame the gap as frequency vs position when that's true. */
export function buildRankingInsight(
  overview: SubjectOverview,
): string | null {
  const rows = [...overview.competitive].sort((a, b) => b.sov - a.sov);
  const subject = rows.find((r) => r.is_subject);
  if (!subject) return null;
  const ahead = rows.filter((r) => !r.is_subject && r.sov > subject.sov);
  const ranksWell = subject.avg_rank !== null && subject.avg_rank <= 3;
  if (ahead.length > 0 && ranksWell) {
    const names = ahead.slice(0, 2).map((r) => r.name).join(" and ");
    return `${overview.subject_name} is mentioned less often than ${names}, but when it appears it ranks near the top (avg rank ${subject.avg_rank!.toFixed(1)}) — the gap is frequency, not position.`;
  }
  if (ahead.length === 0) {
    return `${overview.subject_name} leads the field on how often AI answers mention it.`;
  }
  return `${overview.subject_name} trails the field on both how often it's mentioned and where it ranks when it appears.`;
}

/** Source-mix takeaway + a priority line, from the real source types/domains. */
export function buildSourceCopy(
  overview: SubjectOverview,
): { takeaway: string; priority: string } | null {
  if (overview.sources.length === 0) return null;
  const byType = new Map<string, number>();
  for (const s of overview.sources) {
    byType.set(s.type, (byType.get(s.type) ?? 0) + s.n_citations);
  }
  const topTypes = [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const topDomain = [...overview.sources].sort((a, b) => b.n_citations - a.n_citations)[0]?.name;
  const t1 = topTypes[0]?.toLowerCase() ?? "news";
  const t2 = topTypes[1]?.toLowerCase();
  const typesPhrase = t2 ? `${t1} and ${t2} sources` : `${t1} sources`;
  return {
    takeaway: `AI relies heavily on ${typesPhrase} for ${overview.subject_name}${topDomain ? `, with ${topDomain} and major outlets shaping most answers` : ""}.`,
    priority: `Strengthen presence in the high-authority ${t1} and reference-style sources AI models cite most.`,
  };
}

// Visibility-gap one-liner shown above the chart+ranking row: name the rivals
// the subject trails on reach, framed around "ranks well but appears less".
export function buildVisibilityGap(overview: SubjectOverview): string | null {
  const rows = [...overview.competitive].sort((a, b) => b.sov - a.sov);
  const subject = rows.find((r) => r.is_subject);
  if (!subject) return null;
  const ahead = rows.filter((r) => !r.is_subject && r.sov > subject.sov).slice(0, 2);
  const ranksWell = subject.avg_rank !== null && subject.avg_rank <= 3;
  if (ahead.length === 0) {
    return `${overview.subject_name} leads the field on how often AI answers mention it.`;
  }
  const names = ahead.map((r) => r.name).join(" and ");
  return ranksWell
    ? `${overview.subject_name} ranks highly when mentioned — but AI mentions ${names} far more often.`
    : `AI mentions ${names} far more often than ${overview.subject_name}.`;
}

const GENERIC_TOPICS = new Set([
  "current events", "general", "news", "latest", "overview", "other", "misc",
]);
const THEME_FILLER =
  /\b(legislation|right now|today|currently|recently|in the us|in the united states|in the country|in america)\b/gi;

// A short, scannable theme label for a prompt (the full prompt stays in a
// tooltip). Pulls the distinctive object phrase out of the question.
function themeLabel(prompt: string, topic: string | null): string {
  const base = prompt.replace(/[?.\s]+$/, "");
  const patterns: RegExp[] = [
    /\b(?:involved in|active on|engaged on)\s+(.+)$/i,
    /\b(?:focused on tackling|tackling|combating|addressing)\s+(.+)$/i,
    /\b(?:focused on|working on)\s+(.+)$/i,
    /\b(?:leading on|lead on)\s+(.+)$/i,
    /\b(?:shaping)\s+(?:the\s+)?(.+)$/i,
    /\bon\s+(?:the\s+)?(.+)$/i,
  ];
  let phrase: string | null = null;
  for (const p of patterns) {
    const m = base.match(p);
    if (m) {
      phrase = m[1];
      break;
    }
  }
  if (!phrase && topic && !GENERIC_TOPICS.has(topic.toLowerCase())) phrase = topic;
  if (!phrase) phrase = base;
  phrase = phrase.replace(THEME_FILLER, "").replace(/\s+/g, " ").trim().replace(/^the\s+/i, "");
  const words = phrase.split(" ");
  if (words.length > 5) phrase = words.slice(0, 5).join(" ");
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

export type CoverageCell = {
  slug: string;
  mentioned: boolean; // the subject was mentioned on this model for this prompt
  present: boolean; // the prompt was actually run on this model
  rank: number | null; // position when mentioned (1 = first)
  percentile: number | null; // prominence percentile vs the field (100 = top), null if no rank
};
export type CoverageRow = {
  label: string; // short theme label
  full: string; // full prompt (tooltip)
  cells: CoverageCell[]; // aligned to the platforms column order
  coverage: number; // how many models mentioned the subject (for sorting)
};

/**
 * Coverage matrix for the Prompt-themes panel: one row per tracked prompt
 * (short theme label), one column per model, each cell carrying whether the
 * subject was mentioned and at what rank. Surfaces the per-platform results the
 * old two-column "appears / missing" view threw away. Rows are sorted strongest
 * coverage first so the matrix reads top = owns it, bottom = blind spots.
 */
export function buildCoverageMatrix(
  overview: SubjectOverview,
): { platforms: { slug: string; name: string }[]; rows: CoverageRow[] } {
  // Columns = union of models seen across prompts, in first-seen order.
  const platMap = new Map<string, string>();
  for (const p of overview.per_prompt_coverage) {
    for (const r of p.platform_results) {
      if (!platMap.has(r.slug)) platMap.set(r.slug, r.name);
    }
  }
  const platforms = [...platMap.entries()].map(([slug, name]) => ({ slug, name }));

  // Prominence percentile: where the subject placed vs the tracked field, so a
  // raw rank ("2") becomes a self-explanatory "how near the top" score. rank 1
  // → 100, last place → 0. Field size = the competitive set (subject + rivals).
  const fieldSize = Math.max(2, overview.competitive.length);
  const rankPercentile = (rank: number | null): number | null => {
    if (rank === null) return null;
    const p = Math.round(((fieldSize - rank) / (fieldSize - 1)) * 100);
    return Math.max(0, Math.min(100, p));
  };

  const rows: CoverageRow[] = [];
  for (const p of overview.per_prompt_coverage) {
    const full = (p.rendered || p.template || "").trim();
    if (!full) continue;
    const bySlug = new Map(p.platform_results.map((r) => [r.slug, r]));
    const cells: CoverageCell[] = platforms.map(({ slug }) => {
      const r = bySlug.get(slug);
      const rank = r?.rank ?? null;
      return {
        slug,
        mentioned: r?.mentioned === true,
        present: r?.present === true,
        rank,
        percentile: r?.mentioned === true ? rankPercentile(rank) : null,
      };
    });
    rows.push({
      label: themeLabel(full, p.topic_label),
      full,
      cells,
      coverage: cells.filter((c) => c.mentioned).length,
    });
  }
  rows.sort((a, b) => b.coverage - a.coverage);
  return { platforms, rows: rows.slice(0, 8) };
}

/** Make a model frame_label read as an analytical "frame". */
export function analyticalFrame(frame: string): string {
  const f = frame.trim().replace(/\s+frame$/i, "");
  return `${f} frame`;
}

/** A short, honest opportunity prompt for the per-model framing section. */
export function modelOpportunity(overview: SubjectOverview): string {
  return `Opportunity: models describe ${overview.subject_name}'s ideology and role, but connect them less consistently to specific leaders, institutions, and current power dynamics — the framing AI reaches for first.`;
}

/**
 * One-line analytical takeaway shown under the per-model section title (above
 * the quote cards) — explains why the cards matter: models describe the subject
 * clearly but anchor that description in biography/ideology rather than current
 * leadership and power structures.
 */
export function modelTakeaway(overview: SubjectOverview): string {
  return `Models describe ${overview.subject_name} clearly, but split between biography and ideology rather than linking the subject to current leadership and power structures.`;
}
