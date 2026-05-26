/**
 * Production AI Narrative Brief dashboard for a customer subject.
 *
 * Fetches in parallel:
 *   - GET /api/subjects/{id}/overview — Phase 1-4 dataset (KPIs,
 *     platform split, trajectory, sources, takeaways, clusters,
 *     evidence, competitive, executive synthesis).
 *   - GET /api/subjects/{id} — subject metadata + refresh history
 *     used by the action bar (trigger-refresh button + history
 *     disclosure).
 */
import Link from "next/link";
import {
  ExternalLink,
  Info,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { notFound } from "next/navigation";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { OverviewSubNav } from "./OverviewSubNav";
import { EvidenceExcerpt } from "./EvidenceExcerpt";
import type { IconType } from "react-icons";
import {
  SiOpenai,
  SiAnthropic,
  SiGooglegemini,
  SiPerplexity,
} from "react-icons/si";
import { Header } from "@/components/dashboard/Header";
import { Card, SectionTitle, Pill } from "@/components/dashboard/ui";
import { BottomLineBlock } from "@/components/dashboard/BottomLineBlock";
import { TinySpark } from "@/components/dashboard/Sparklines";
import { KpiVitalsTile } from "@/components/dashboard/KpiVitalsTile";
import {
  KPI_PLATFORM_SPREAD_LOPSIDED,
  KPI_STRONG_MENTION_RATE,
  KPI_WEAK_MENTION_RATE,
  getKpiValueColor,
} from "@/lib/kpiThresholds";
// Aliased as `nextDynamic` because this page also exports the
// route-segment config `export const dynamic = "force-dynamic"`
// (further down). Importing the next/dynamic helper under its
// own name would collide on the identifier.
import nextDynamic from "next/dynamic";

// CompetitorBarsFromData pulls in recharts via the shared Charts
// barrel (~390 KB). Dynamic-importing splits the recharts chunk
// off Overview's initial First Load JS — the SoV bar list lands
// in the lower-middle of the page, so a loading placeholder
// matching the chart's typical 280 px height avoids layout shift
// while the chunk fetches.
const CompetitorBarsFromData = nextDynamic(
  () =>
    import("@/components/dashboard/Charts").then(
      (m) => m.CompetitorBarsFromData,
    ),
  {
    loading: () => (
      <div className="h-[280px] w-full rounded-md bg-muted/20" />
    ),
  },
);
import {
  getSubject,
  getSubjectOverview,
  listSubjects,
  type Subject,
  type SubjectOverview,
  type SubjectDetail,
} from "@/lib/api";
import { RefreshButton } from "./refresh-button";
import { SourcesTypeMix } from "./sources-type-mix";

export const dynamic = "force-dynamic";

const MODEL_COLORS: Record<string, string> = {
  ChatGPT: "var(--success)",
  Gemini: "var(--primary)",
  Claude: "var(--gold)",
  Perplexity: "var(--chart-5)",
};

// Two-letter initials from the subject name, stripping leading articles
// and short prepositions so event/policy subjects don't collapse to
// "TN"/"TI". Examples: "Alexandria Ocasio-Cortez" → "AO";
// "the Inflation Reduction Act" → "IR"; "AI regulation in the United
// States" → "AR" (acceptable fallback).
const INITIALS_STOPWORDS = new Set(["the", "a", "an", "of", "by", "in"]);
function deriveInitials(name: string): string {
  const words = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w) && !INITIALS_STOPWORDS.has(w.toLowerCase()));
  if (words.length === 0) return name.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Format helpers — keep all KPI formatting consistent across the page
function formatPct(v: number | null, digits = 0): string {
  if (v === null) return "—";
  // Clamp at 100%. The underlying fields (mention_rate,
  // top_result_rate, share_of_voice, citation_rate) are all
  // bounded fractions in 0..1; anything above that is a backend
  // bug, and rendering "120%" would imply we don't trust our own
  // numbers. Floor at 0 too for symmetry with the chart-side
  // defensive guards.
  const clamped = Math.max(0, Math.min(1, v));
  return `${(clamped * 100).toFixed(digits)}%`;
}

// Uppercase only the first character. Used for topic labels which are
// stored inconsistently in the DB ("Current events" but also "leading
// voices on US policy...") — display points need a uniform sentence
// case without flattening acronyms like "US" / "UK" that would be lost
// to a blanket title-case or capitalize-words pass.
function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
// Tone value formatter — by default appends "positive"/"negative"/"neutral"
// so a reader doesn't have to interpret what the sign means.
// 0.20 → "+20% positive", -0.30 → "−30% negative", 0 → "Neutral".
//
// Pass includeDirection=false to get just "+20%" / "−30%" — used in
// the hero KPI tile where the title ("Positive vs negative") already
// frames the scale and the descriptor word would push the value to
// wrap onto a second line.
function formatTonePct(
  v: number | null,
  digits = 0,
  includeDirection = true,
): string {
  if (v === null) return "—";
  // Clamp at ±1 — avg_sentiment is bounded in −1..+1 by definition;
  // anything beyond is a backend bug, and displaying "+150% positive"
  // would imply we don't trust our own scale.
  const clamped = Math.max(-1, Math.min(1, v));
  const pct = clamped * 100;
  if (Math.abs(pct) < 0.5) return "Neutral";
  const sign = pct > 0 ? "+" : "−";
  const base = `${sign}${Math.abs(pct).toFixed(digits)}%`;
  if (!includeDirection) return base;
  const direction = pct > 0 ? "positive" : "negative";
  return `${base} ${direction}`;
}
function KpiTooltipIcon({
  text,
  align = "center",
}: {
  text: string;
  // Horizontal alignment of the tooltip relative to the icon. Default
  // center looks balanced for icons in the middle of a row; use "right"
  // for icons that sit near the right edge of a card/viewport (the
  // centered tooltip would overflow off-screen) and "left" for icons
  // near the left edge.
  align?: "left" | "center" | "right";
}) {
  const pos =
    align === "right" ? "right-0"
    : align === "left" ? "left-0"
    : "left-1/2 -translate-x-1/2";
  // Wrapping span is `tabIndex={0}` + `role="button"` + aria-label so
  // a keyboard / SR user reaches the tooltip via Tab and hears the
  // text — the hover-only reveal used previously was unreachable
  // without a pointer. `group-focus-within` mirrors the hover reveal
  // so the popover appears on focus too, with a visible focus ring.
  return (
    <span
      tabIndex={0}
      role="button"
      aria-label={text}
      className="group relative inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <Info className="h-3 w-3 opacity-50 hover:opacity-100 group-focus-within:opacity-100 transition-opacity cursor-help" />
      <span
        aria-hidden
        className={`pointer-events-none absolute ${pos} bottom-full mb-2 w-56 rounded-md border border-border bg-popover px-3 py-2 text-[11px] leading-snug text-popover-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-30 shadow-lg`}
      >
        {text}
      </span>
    </span>
  );
}


// Predicate used by every consumer of topic_coverage to filter out
// non-finite recall values. `!== null` alone lets NaN / Infinity
// through; once they enter the math (Math.abs, Math.round, average,
// epsilon compare) they propagate to the UI as "NaN%" or break tie
// detection. Strict isFinite check stops that at the boundary.
function _hasFiniteRecall(
  t: SubjectOverview["topic_coverage"][number],
): boolean {
  // n_responses > 0 is the load-bearing check: the backend can
  // return topic rows with {n_responses: 0, ai_recall: 0} when a
  // topic is configured but no responses have scored it yet. A
  // finite ai_recall isn't enough — a 0% bar in the Visibility-by-
  // topic tile reads as "AI never mentions this topic" when the
  // truth is "we haven't measured this topic yet". Both conditions
  // must hold.
  return (
    t.n_responses > 0 &&
    t.ai_recall !== null &&
    Number.isFinite(t.ai_recall)
  );
}

// Lowest-recall topic in this snapshot, or null when no topic has a
// finite ai_recall value. Drives the Weakest Topic Recall hero tile
// and the warning-color bar in the Topic Recall chart.
function findWeakestTopic(
  topics: SubjectOverview["topic_coverage"],
): SubjectOverview["topic_coverage"][number] | null {
  const withRecall = topics.filter(_hasFiniteRecall);
  if (!withRecall.length) return null;
  return withRecall.reduce((min, t) =>
    (t.ai_recall ?? 1) < (min.ai_recall ?? 1) ? t : min,
  );
}

// Templated Bottom Line that leads with the topic-recall gap rather
// than the strongest area. Returns null when there aren't at least 2
// topics with non-null recall (so the caller can fall back to the
// server-polished bottom_line). Per-topic phrasing uses the raw topic
// label as-is — labels are already human-readable, so no separate
// display_phrase field is needed at this point.
//
// Comparator is purely data-driven:
//   - 2 topics total → compare directly to the other topic by name
//   - 3+ topics     → compare to the arithmetic mean of all OTHER
//                     topics' mention rates ("vs N% average across K
//                     other tracked topics")
//
// The mean-of-others framing avoids the thematic mismatches the
// strongest-topic comparator produced (e.g., "post-presidency political
// influence vs Current events"); it stays neutral about which topic is
// "the" comparator and reads as a sober gap measurement instead.
function buildGapBottomLine(
  subjectName: string,
  topics: SubjectOverview["topic_coverage"],
): string | null {
  const withRecall = topics.filter(_hasFiniteRecall);
  if (withRecall.length < 2) return null;
  const weakest = findWeakestTopic(withRecall)!;
  const others = withRecall.filter((t) => t !== weakest);
  // If the weakest's rate ties with every other topic's, there's no
  // gap to surface — defer to the server bottom_line instead. Uses
  // the module-level TIE_EPSILON so float micro-differences from DB
  // aggregation (0.6666666 vs 0.6666667) don't bypass the check.
  if (
    others.every(
      (t) =>
        Math.abs((t.ai_recall ?? 0) - (weakest.ai_recall ?? 0)) <
        TIE_EPSILON,
    )
  ) {
    return null;
  }
  // If the weakest's rate ties with at least one OTHER topic
  // (within TIE_EPSILON), there's no unambiguous "weakest" to
  // name — findWeakestTopic's choice depends on backend insertion
  // order in topic_coverage, so the named topic in the verdict
  // could shift snapshot-to-snapshot without the data actually
  // changing. Defer to the server bottom_line in that case so a
  // tied-for-weakest situation doesn't produce flicker.
  const weakestIsTied = others.some(
    (t) =>
      Math.abs((t.ai_recall ?? 0) - (weakest.ai_recall ?? 0)) <
      TIE_EPSILON,
  );
  if (weakestIsTied) return null;
  // Guard against an empty/whitespace weakest label — without it,
  // the verdict prints as "...but only 50% on ." (bare period with
  // a trailing space) which reads as a render bug. Defer to the
  // server bottom_line when topic labels are missing data.
  if (!weakest.label || !weakest.label.trim()) return null;
  const weakestPct = Math.round((weakest.ai_recall ?? 0) * 100);

  // Plain-English phrasing structured so the strong-coverage half
  // and the weak-coverage half sit at OPPOSITE ends of the sentence
  // with the contrast at the punchline. Prior template buried the
  // gap topic in a leading "When asked about X" clause and pushed
  // the comparator into a parenthetical at the end, making readers
  // re-parse to figure out which percentage went with which topic.
  // New shape: "AI mentions Y in N% of answers about [comparator]
  // — but only M% on [weakest topic]." The em-dash split gives the
  // BottomLineBlock a clean title clause + body clause to render
  // visually distinct.
  if (others.length === 1) {
    const other = others[0];
    // Same empty-label guard for the comparator topic.
    if (!other.label || !other.label.trim()) return null;
    const otherPct = Math.round((other.ai_recall ?? 0) * 100);
    // Skip the verdict when rounding collapses the two sides of the
    // contrast to the same number — sentence would read "in N%...
    // but only N% on Y" which contradicts itself visually even when
    // a real (sub-rounding) gap exists. Server bottom_line takes
    // over via the gapBottomLine ?? data.bottom_line fallback.
    if (otherPct === weakestPct) return null;
    return `AI mentions ${subjectName} ${formatStrongClause(otherPct, other.label)} — but ${formatWeakestClause(weakestPct, weakest.label)}.`;
  }

  // Filter empty/whitespace labels out of the comparator before
  // building the list — without this, "...about A, , and C" or
  // similar misformatted strings would land in the verdict when
  // even one other topic has a blank label. mean stays computed
  // from ALL others (the numeric signal is still valid; only the
  // naming is unreliable).
  const namedOthers = others.filter((t) => t.label && t.label.trim());
  if (namedOthers.length === 0) return null;
  const meanOthersPct = Math.round(
    (others.reduce((sum, t) => sum + (t.ai_recall ?? 0), 0) / others.length) * 100,
  );
  // Same rounding-collapse guard for the multi-other case.
  if (meanOthersPct === weakestPct) return null;
  // Comparator phrasing tries to name the topics inline so a reader
  // knows what the baseline contains. Topic labels can run long
  // ("figures shaping the current Republican administration"), so a
  // single verbose name in the list can blow up the sentence even
  // when the others are short. Strategy: keep labels ≤40 chars
  // inline; bucket longer ones into "and N more". Fall back to a
  // pure count when nothing's short enough, or when there are too
  // many total to list cleanly.
  const comparator = formatComparator(namedOthers.map((t) => t.label));
  // When formatComparator returns "N other tracked topics" (too
  // many labels to name inline cleanly), rephrase to "every other
  // tracked topic" — the digit prefix reads awkwardly after the
  // preposition "about" in the new template ("answers about 5
  // other tracked topics" is grammatical but stilted).
  const isPureCount = /^\d+ other tracked topics/.test(comparator);
  const aboutPhrase = isPureCount ? "every other tracked topic" : comparator;
  return `AI mentions ${subjectName} ${formatStrongClause(meanOthersPct, aboutPhrase)} — but ${formatWeakestClause(weakestPct, weakest.label)}.`;
}

// Phrasing helpers for the bottom-line verdict. Replace the rounded
// percent with a natural-English equivalent when one exists, so a
// "100%/50%" pair reads as "every answer / only half" instead of
// the more clinical numeric form. Other percentages keep the numeric
// shape so the data still leads the sentence; the swaps only fire
// on values where the English equivalent is exact and unambiguous.
function formatStrongClause(pct: number, comparator: string): string {
  if (pct === 100) return `in every answer about ${comparator}`;
  return `in ${pct}% of answers about ${comparator}`;
}
function formatWeakestClause(pct: number, label: string): string {
  if (pct === 50) return `only half on ${label}`;
  return `only ${pct}% on ${label}`;
}

// Plain-English list joiner: "A", "A and B", "A, B, and C", etc.
const MAX_INLINE_LABELS = 6;

function joinList(labels: string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

// Builds the "comparator" phrase for the gap Bottom Line. Names
// every topic inline regardless of individual label length —
// hiding topics behind "and N more" loses concrete information
// that's worth a longer sentence. Only falls back to a pure count
// when there are SO many topics that the list would dominate the
// verdict (>6). Prior version bucketed labels over 40 chars,
// which collapsed common cases like "and 2 more" instead of
// naming the actual topics.
function formatComparator(labels: string[]): string {
  if (labels.length === 0) return "";
  if (labels.length > MAX_INLINE_LABELS) {
    return `${labels.length} other tracked topics`;
  }
  return joinList(labels);
}

// splitBottomLine + BottomLineBlock now live in
// components/dashboard/BottomLineBlock.tsx — imported above so the
// Visibility spoke's briefing can use the same hero treatment
// (was hand-rolled with divergent typography before extraction).

// Compact per-topic mention-rate bars rendered directly under the
// Bottom Line copy. Folded in from the standalone "Topic Recall"
// section because the Bottom Line prose already cites these numbers —
// the bars reinforce the sentence without claiming a separate
// section. Same color tiers + weakest-topic warning treatment as the
// old TopicRecallChart so visual semantics carry over.
// Float-equality epsilon for tie detection across both topic-
// coverage gaps (hasRealVisibilityGap) and SoV ranking ties
// (deriveCompetitivePosition). One module-level constant so the
// two surfaces can never disagree about what "tied" means at the
// precision boundary. Earlier this file had a separate
// SOV_TIE_EPSILON with the same value (0.001) — consolidated
// here to remove the duplicate.
const TIE_EPSILON = 0.001;
function hasRealVisibilityGap(
  topics: SubjectOverview["topic_coverage"],
): boolean {
  const withRecall = topics.filter(_hasFiniteRecall);
  if (withRecall.length < 2) return false;
  const sorted = withRecall
    .slice()
    .sort((a, b) => (b.ai_recall ?? 0) - (a.ai_recall ?? 0));
  return !sorted.every(
    (t) =>
      Math.abs((t.ai_recall ?? 0) - (sorted[0].ai_recall ?? 0)) <
      TIE_EPSILON,
  );
}

// Shared row used by the Vitals Visibility-by-topic tile and
// (previously) the Band 2 Top Narratives card. Generic so a
// future caller can reuse the same label/bar/percent treatment;
// sort direction, highlight override, and bar tone are caller-
// supplied.
//
// `highlight` semantics:
//   "weakest" → force warning tone at higher opacity
//   "strongest" → force success tone at higher opacity
//   null → use natural tier color (success ≥ KPI_STRONG_MENTION_RATE
//          / primary ≥ KPI_WEAK_MENTION_RATE / warning)
function TopicBarRow({
  label,
  pct,
  highlight,
  tone,
}: {
  label: string;
  pct: number;
  highlight: "weakest" | "strongest" | null;
  // Optional explicit semantic tone for the bar — takes precedence
  // over `highlight` when set. Previously used by the Band 2 Top
  // Narratives card to reflect each cluster's mean SENTIMENT
  // (favorable / critical / neutral) rather than its sort position;
  // that card is now text-only so this prop has no consumer today,
  // but the API is retained for a future caller that wants the
  // sentiment-tinted bar treatment.
  tone?: "success" | "warning" | "neutral";
}) {
  // Tier color reads from the shared kpiThresholds mention-rate
  // ladder (KPI_STRONG = 60, KPI_WEAK = 30) so the SAME rate
  // colors identically here and on the sibling KpiVitalsTile that
  // sits in the same Vitals row. Earlier this used a hand-rolled
  // 70/40 ladder, which meant a 65% mention rate read green here
  // and neutral on the AI Mention Rate tile next to it — a real
  // cross-tile incoherence the shared thresholds module was
  // extracted to prevent.
  const pctFraction = pct / 100;
  const tierColor =
    pctFraction >= KPI_STRONG_MENTION_RATE
      ? "var(--success)"
      : pctFraction >= KPI_WEAK_MENTION_RATE
        ? "var(--primary)"
        : "var(--warning)";
  const toneColor =
    tone === "success"
      ? "var(--success)"
      : tone === "warning"
        ? "var(--warning)"
        : tone === "neutral"
          ? "var(--primary)"
          : null;
  const barColor =
    toneColor ??
    (highlight === "weakest"
      ? "var(--warning)"
      : highlight === "strongest"
        ? "var(--success)"
        : tierColor);
  // When an explicit tone is set OR a highlight is active, render
  // at consistent opacity (0.85) so the bar carries its semantic
  // signal cleanly. Otherwise fall back to the value-derived
  // opacity ramp so a 100% bar reads darker than a 50% one.
  const opacity =
    tone !== undefined || highlight !== null
      ? 0.85
      : 0.4 + (pct / 100) * 0.45;
  return (
    <div className="grid grid-cols-[1fr_44px] items-center gap-x-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[12px] text-foreground/80 mb-1">
          {/* Sentiment dot — colorblind-friendly tone indicator
              that pairs with the bar color. Only rendered when an
              explicit tone is set (narrative-cluster context),
              so the Visibility-by-topic rows aren't visually
              crowded. */}
          {toneColor && (
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: toneColor }}
            />
          )}
          <span className="truncate">{capitalizeFirst(label)}</span>
        </div>
        <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: barColor,
              opacity,
            }}
          />
        </div>
      </div>
      <span className="text-[12px] font-semibold text-foreground tabular-nums text-right">
        {pct}%
      </span>
    </div>
  );
}

// Top narrative clusters list for the Band 2 Top Narratives card.
// Editorial treatment: a prose lead sentence names the dominant
// AI framing (with a sentiment qualifier when meaningful), then
// a smaller supporting list surfaces the next few clusters.
// Earlier the card was a flat 4-row list of name + %, which read
// as data even though the underlying signal — "what story is AI
// telling about this subject?" — is editorial. The Visibility-by-
// topic tile up in the Vitals row carries the bar visualization;
// this card stays text-led to differentiate the two surfaces and
// to give the dominant framing actual prose weight.
function TopNarrativesList({
  clusters,
  subjectName,
}: {
  clusters: SubjectOverview["narrative_clusters"];
  subjectName: string;
}) {
  const safePct = (share: number): number => {
    // Defensive: finite-check first (Math.min/max propagate NaN,
    // so a backend regression producing NaN share would render
    // "NaN%" without this guard), then clamp to [0,1].
    const f = Number.isFinite(share)
      ? Math.max(0, Math.min(1, share))
      : 0;
    return Math.round(f * 100);
  };
  const sorted = clusters
    .slice()
    .sort((a, b) => b.share - a.share)
    .slice(0, 4);
  if (sorted.length === 0) return null;
  const top = sorted[0];
  const rest = sorted.slice(1);
  // Sentiment qualifier — uses the same ±0.1 inclusive thresholds
  // the backend uses for net_sentiment classification, so the
  // word ("favorable" / "critical" / "neutral") agrees with how
  // the analyzer scored the cluster's responses. Null sentiment_
  // mean leaves the qualifier off entirely rather than guessing.
  const toneWord =
    top.sentiment_mean === null
      ? null
      : top.sentiment_mean >= 0.1
        ? "favorable"
        : top.sentiment_mean <= -0.1
          ? "critical"
          : "neutral";
  const toneClass =
    toneWord === "favorable"
      ? "text-success"
      : toneWord === "critical"
        ? "text-warning"
        : "text-foreground";
  return (
    <div className="mt-3">
      {/* Editorial lead — names the dominant framing in prose, with
          the cluster name and sentiment tone visually emphasized so
          the eye lands on the finding, not the percentage. */}
      <p className="text-[14px] leading-relaxed text-foreground">
        AI&apos;s most common framing of {subjectName} is{" "}
        <span className="font-semibold">{top.name}</span>
        {toneWord !== null && (
          <>
            {" — a "}
            <span className={`font-medium ${toneClass}`}>{toneWord}</span>
            {" angle"}
          </>
        )}
        {", appearing in "}
        <span className="font-semibold tabular-nums">
          {safePct(top.share)}%
        </span>
        {" of responses."}
      </p>
      {rest.length > 0 && (
        <>
          <p className="mt-4 text-[11px] uppercase tracking-wider text-muted-foreground">
            Also surfacing
          </p>
          <ul className="mt-2 space-y-2">
            {rest.map((c) => (
              <li
                key={c.name}
                className="flex items-baseline gap-3 text-[12.5px] leading-snug text-foreground/85"
              >
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="tabular-nums font-medium text-foreground/70">
                  {safePct(c.share)}%
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// Top-N by SoV with the subject force-included when they're outside
// the natural top N. Drops the lowest-ranked non-subject row to make
// room so the searched-for entity stays visible.
//
// Exception: when the subject's SoV is zero (or negligibly small),
// force-inserting them displaces a peer that actually has data with
// a bar that renders as an empty highlighted track — looks like a
// broken row to the reader. In that case we keep the natural top N
// and let the Competitive Position stat stack carry the "subject
// not yet mentioned" signal via its rank/gap cards instead.
function pickTopWithSubject(
  rows: SubjectOverview["competitive"],
  n: number,
): SubjectOverview["competitive"] {
  const sorted = rows.slice().sort((a, b) => b.sov - a.sov);
  const top = sorted.slice(0, n);
  if (top.some((c) => c.is_subject)) return top;
  const subject = sorted.find((c) => c.is_subject);
  if (!subject) return top;
  // Don't displace a peer with real data with an empty-bar subject.
  // Epsilon-bound rather than strict > 0 so float round-off can't
  // sneak a "0.0000001 mention" subject into the chart.
  if (subject.sov < TIE_EPSILON) return top;
  return [...sorted.slice(0, n - 1), subject];
}

// Compact stat card matching the Vitals KPI tile language: small
// muted eyebrow, large value, optional supporting line. Used in the
// Competitive band's right column so the chart and the stats read
// from the same visual family.
function StatCard({
  label,
  value,
  valueTone,
  sub,
  spark,
  progress,
}: {
  label: string;
  value: string;
  valueTone?: "success" | "warning" | "neutral";
  sub?: React.ReactNode;
  spark?: React.ReactNode;
  // 0..1 — when set, renders a thin horizontal bar BELOW the value
  // (above any sub line / sparkline) so the stat has a visual peer
  // to the SoV bars on the chart to the card's left. Fill convention:
  // 1.0 = leader / no gap; 0 = bottom of the field / max gap. Tone
  // is inherited from valueTone so a warning-toned value gets a
  // warning-toned bar — matches the platform breakdown bars on the
  // Vitals card.
  progress?: number;
}) {
  const valueColor =
    valueTone === "success"
      ? "text-success"
      : valueTone === "warning"
        ? "text-warning"
        : "text-foreground";
  const fillVar =
    valueTone === "success"
      ? "var(--success)"
      : valueTone === "warning"
        ? "var(--warning)"
        : "var(--primary)";
  return (
    <div className="rounded-md bg-muted/40 px-3.5 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/55">
        {label}
      </div>
      <div className={`mt-1 text-[22px] font-medium tracking-tight tabular-nums ${valueColor}`}>
        {value}
      </div>
      {progress !== undefined && Number.isFinite(progress) && (
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/70"
          aria-hidden
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
              background: fillVar,
              opacity: 0.85,
            }}
          />
        </div>
      )}
      {spark && <div className="mt-1.5">{spark}</div>}
      {sub && (
        <div className="mt-0.5 text-[11.5px] text-foreground/60 leading-snug">
          {sub}
        </div>
      )}
    </div>
  );
}

// TinySpark + MiniSpark + buildMonoCubicPath now live in
// components/dashboard/Sparklines.tsx — imported above so both
// Overview's vitals KPI tiles and Visibility's briefing tiles share
// identical sparkline visual character.

// Derive the competitive position stats from the chart's own
// data array. Returned values match exactly what the bars show
// — same sort, same rounding rules — so the stack and the chart
// can never drift out of sync.
type CompetitivePositionStats = {
  rank: number | null;
  peerCount: number;
  gapPp: number | null;
  comparatorName: string | null;
  isLeader: boolean;
  // True when the subject's SoV rounds to within 0pp of an
  // adjacent entity. Surfaced as "Tied #N" in the rank stat so a
  // reader doesn't see "#2 of 7" when the data actually shows two
  // entities at the same displayed SoV — the displayed rank would
  // otherwise depend on insertion order in data.competitive and
  // could shift snapshot to snapshot without the underlying data
  // changing. Critically, this uses the SAME rounded-pp comparison
  // that drives the gap value, so the rank label ("Lead over
  // runner-up" / "Gap to leader") and the gap value ("Tied with X"
  // / "+N pts") can never contradict.
  rankIsTied: boolean;
};
// 0..1 float epsilon retained for pickTopWithSubject (where the
// chart-side check happens BEFORE rounding to pts, since the bar
// chart's visual indicator of "subject has SoV worth showing"
// should not depend on display-precision rounding). Tie detection
// inside deriveCompetitivePosition uses a per-call rounded check
// keyed to the display unit (pp) for consistency with the gap
// value. The previous SOV_TIE_EPSILON constant (also 0.001) was
// consolidated into the module-level TIE_EPSILON above.
function deriveCompetitivePosition(
  rows: SubjectOverview["competitive"],
): CompetitivePositionStats {
  // Coerce non-finite SoVs to 0 before sort + arithmetic. The chart
  // already does this at its input boundary; doing it here too
  // keeps the stat stack from rendering "NaN pts" / "Infinity pts"
  // on a backend regression that produces NaN (0/0) or Infinity.
  const safeRows = rows.map((c) => ({
    ...c,
    sov: Number.isFinite(c.sov) ? c.sov : 0,
  }));
  const sorted = safeRows.slice().sort((a, b) => b.sov - a.sov);
  const peerCount = sorted.length;
  const subjectIdx = sorted.findIndex((c) => c.is_subject);
  if (subjectIdx === -1) {
    return {
      rank: null,
      peerCount,
      gapPp: null,
      comparatorName: null,
      isLeader: false,
      rankIsTied: false,
    };
  }
  const rank = subjectIdx + 1;
  const subject = sorted[subjectIdx];
  const isLeader = rank === 1;
  // Tie detection now driven by the SAME rounded-to-pp comparison
  // the display uses. Previously rankIsTied used SOV_TIE_EPSILON
  // (0.001 = 0.1pp) while the gap value was Math.round-ed (which
  // collapses anything < 0.5pp to 0pp) — a 0.3pp gap produced
  // `rankIsTied: false` (so the label said "Lead over runner-up" /
  // "Gap to leader") AND `gapPp: 0` (so the value said "Tied with
  // X"). Label and value contradicted. Driving both off the same
  // rounded gap means they always agree.
  const above = subjectIdx > 0 ? sorted[subjectIdx - 1] : null;
  const below = subjectIdx < sorted.length - 1 ? sorted[subjectIdx + 1] : null;
  const roundedPp = (a: number, b: number) =>
    Math.round((a - b) * 100);
  const rankIsTied =
    (above !== null && roundedPp(above.sov, subject.sov) === 0) ||
    (below !== null && roundedPp(subject.sov, below.sov) === 0);
  // Rank #1: compare downward against the runner-up so the stat
  // reads "ahead of X by N pts" rather than the nonsensical
  // "−0 pts behind myself". Otherwise compare upward to leader.
  if (isLeader) {
    const runnerUp = sorted[1];
    if (!runnerUp) {
      return {
        rank,
        peerCount,
        gapPp: null,
        comparatorName: null,
        isLeader,
        rankIsTied,
      };
    }
    const gapPp = roundedPp(subject.sov, runnerUp.sov);
    return {
      rank,
      peerCount,
      gapPp,
      comparatorName: runnerUp.name,
      isLeader,
      rankIsTied,
    };
  }
  const leader = sorted[0];
  const gapPp = roundedPp(subject.sov, leader.sov);
  return {
    rank,
    peerCount,
    gapPp,
    comparatorName: leader.name,
    isLeader,
    rankIsTied,
  };
}

// KpiGauge moved to @/components/dashboard/ui so the Visibility
// briefing tiles can reuse the exact same component.

function TrajectoryStrip({
  trajectory,
  perPlatformKpis,
  topicCoverage,
  subjectName,
}: {
  trajectory: SubjectOverview["trajectory"];
  // Per-platform breakdown for the trajectory KPI tiles. The
  // payload ships mention_rate, avg_sentiment, and
  // first_mention_rate per platform on a single per_platform_kpis
  // array; each metric pulls the field it needs.
  perPlatformKpis: SubjectOverview["per_platform_kpis"];
  // Topic-coverage feeds the rightmost "Visibility by topic" tile
  // — a per-topic bar list (top 4 sorted desc) with the weakest
  // row warning-toned. The Visibility deep-dive's per-topic
  // tables carry the full snapshot detail; this tile is the
  // at-a-glance summary up in the Vitals row.
  topicCoverage: SubjectOverview["topic_coverage"];
  subjectName: string;
}) {
  const metrics: {
    title: string;
    subtitle?: string;
    values: (number | null)[];
    format: (v: number | null) => string;
    tooltip: string;
    // `kind` drives the conditional value coloring via getKpiValueColor.
    // Uses the same thresholds the Hero KPI tiles use, so the same
    // metric carries identical color semantics across both surfaces.
    colorKind: "mention_rate" | "avg_tone" | "top_result_rate";
    // Optional cross-subject benchmark used to render the gauge's
    // tick mark + the "vs N% subject-set avg" caption beneath.
    // null when the metric has no comparable cross-subject average
    // (currently Net Favorability — sentiment doesn't roll up to
    // a single set-wide number meaningfully).
    benchmark: number | null;
    benchmarkCaption: string | null;
    // Per-platform breakdown for this metric. Generic
    // {name, value} pairs so each metric can pull a different
    // field off per_platform_kpis (mention_rate / avg_sentiment /
    // first_mention_rate) without the consumer needing to know.
    platformBreakdown?: { name: string; value: number | null }[];
  }[] = [
    {
      title: "AI Mention Rate",
      // "across all topics" qualifier disambiguates this KPI from the
      // topic-specific mention rate shown in the verdict and Gap card
      // — fast readers saw "AI Mention Rate 90%" beside a verdict
      // saying "mentioned in 50% of answers" and stalled. The other
      // tiles in this strip are also all-topics figures but don't
      // co-appear with a topic-specific number, so no qualifier
      // needed there.
      subtitle: "across all topics",
      values: trajectory.ai_recall,
      format: (v) => formatPct(v, 0),
      tooltip: "Share of AI answers that mention this subject on topic-area questions (where the prompt doesn't name them directly), plotted across each weekly snapshot. Higher is better. Rising means AI is more reliably surfacing the subject when asked about their topic areas.",
      colorKind: "mention_rate",
      // Benchmark gauge + caption dropped from this tile so its
      // anatomy matches Net Favorability's (sparkline + delta +
      // platform breakdown only). Earlier the "| vs 70% subject-set
      // avg" tick rail above the chart made this tile read busier
      // than its row-mates; the cross-subject avg is a footnote
      // most readers don't act on and is still surfaced via the
      // Visibility deep-dive's KPI strip.
      benchmark: null,
      benchmarkCaption: null,
      // Per-platform decomposition of THIS metric's value — folded
      // in from the standalone "Mention rate by platform" strip
      // that used to sit below the KPI row. Same pattern (and same
      // subline renderer) used by Net Favorability + First Result
      // Mentioned below; all three pull the per_platform_kpis array
      // shipped on SubjectOverview.
      platformBreakdown: perPlatformKpis.map((p) => ({
        name: p.name,
        value: p.mention_rate,
      })),
    },
    // Order: AI Mention Rate → Net Favorability → Top Narrative.
    // Mention Rate (do we appear?) on the left; Net Favorability
    // (how do mentions read in aggregate?) in the middle as the
    // quantitative sentiment summary; Top Narrative (what's the
    // single most-common AI framing?) on the right as the
    // qualitative discrete companion. The middle slot stays a
    // trajectory-based KPI so the row's two snapshot+trajectory
    // tiles flank the snapshot-only Top Narrative tile, rather
    // than splitting them across the row.
    {
      title: "Net Favorability",
      values: trajectory.avg_sentiment,
      format: (v) => formatTonePct(v),
      tooltip: "Net favorability — the mean sentiment score across all AI answers in this snapshot, weighted by intensity. Range −100% (most unfavorable) to +100% (most favorable); 0% is neutral. Measures how favorably AI characterizes the subject when it does mention them.",
      colorKind: "avg_tone",
      // Sentiment doesn't have a cross-subject average on the
      // payload — would be misleading anyway since each subject's
      // sentiment distribution is shaped by their topic mix.
      benchmark: null,
      benchmarkCaption: null,
      // No platformBreakdown — same operator choice as the
      // First Result tile. Per-platform sentiment is on the
      // Narrative deep-dive.
    },
  ];

  // Weakest topic + gap-exists feed the Visibility-by-topic tile's
  // bar list — `gapExistsSnap` gates the `highlight="weakest"` row
  // tone, `weakestTopic` is the row whose mention rate matches the
  // floor. Earlier this block also computed allHighSnap /
  // weakestTopicPct / weakestTopicColor for a lead-line summary
  // above the bars; that line was dropped (it duplicated the
  // bottom-line verdict's "but only 25% on Current events"
  // phrasing), so only the bar-list-driving values are kept.
  const withRecallSnap = topicCoverage.filter(_hasFiniteRecall);
  const gapExistsSnap = hasRealVisibilityGap(topicCoverage);
  const weakestTopic =
    withRecallSnap.length > 0
      ? withRecallSnap.reduce((a, b) =>
          (a.ai_recall ?? 0) <= (b.ai_recall ?? 0) ? a : b,
        )
      : null;

  const renderTrajectoryTile = (m: (typeof metrics)[number]) => {
    // Prior value = the IMMEDIATELY preceding snapshot only. Earlier
    // we scanned right-to-left through nulls to find the nearest
    // finite predecessor; that produced a misleading "vs previous
    // snapshot" delta when the actual preceding snapshot was a
    // backfill gap. When the immediate predecessor isn't measured
    // we show no delta — the label can't lie.
    const latestValue = m.values[m.values.length - 1] ?? null;
    const rawPrior = m.values[m.values.length - 2];
    const priorValue =
      rawPrior !== null &&
      rawPrior !== undefined &&
      Number.isFinite(rawPrior)
        ? rawPrior
        : null;
    const deltaPp =
      latestValue !== null &&
      Number.isFinite(latestValue) &&
      priorValue !== null
        ? Math.round((latestValue - priorValue) * 100)
        : null;
    const notMeasured =
      m.values.length > 0 && m.values.every((v) => v === null);
    const valueColor = notMeasured
      ? "text-muted-foreground"
      : getKpiValueColor(m.colorKind, latestValue);
    const gaugeValue =
      m.benchmark !== null &&
      latestValue !== null &&
      Number.isFinite(latestValue)
        ? Math.max(0, Math.min(1, latestValue))
        : null;
    return (
      <KpiVitalsTile
        key={m.title}
        label={m.title}
        subtitle={m.subtitle}
        tooltipText={m.tooltip}
        value={notMeasured ? "—" : m.format(latestValue)}
        valueColor={valueColor}
        deltaPp={notMeasured ? null : deltaPp}
        gaugeValue={gaugeValue}
        gaugeBenchmark={m.benchmark}
        benchmarkCaption={m.benchmarkCaption}
        sparkValues={m.values}
        sparkIsHistorical={trajectory.is_historical}
        sparkLabels={trajectory.weeks}
        sparkFormat={m.format}
        platformBreakdown={m.platformBreakdown}
        platformBreakdownIsSigned={m.colorKind === "avg_tone"}
        platformBreakdownLopsidedThreshold={KPI_PLATFORM_SPREAD_LOPSIDED}
      />
    );
  };

  return (
    <div className="grid md:grid-cols-3 gap-8 items-stretch">
      {/* AI Mention Rate (trajectory + per-platform breakdown) */}
      {renderTrajectoryTile(metrics[0])}
      {/* Net Favorability (trajectory) */}
      {renderTrajectoryTile(metrics[1])}
      {/* Visibility by topic — per-topic mention-rate bars (top 4
          tracked topics, sorted descending). Differentiates from
          the Top Narratives card in Band 2 which stays text-only;
          the bar surface lives up here in the Vitals row so a
          reader sees the per-topic spread at a glance. Outer
          chrome (rounded-md bg-muted/40 p-4 etc.) matches
          KpiVitalsTile's baseClasses so the three Vitals tiles
          read as one row. */}
      {withRecallSnap.length > 0 && (
        <div className="flex h-full flex-col rounded-md bg-muted/40 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground truncate">
                Visibility by topic
              </div>
              {/* Subtitle slot left empty (non-breaking space) so
                  the title block occupies the same vertical space
                  as the sibling tiles' "across all topics" / etc.
                  subtitle lines. */}
              <div className="text-[10px] text-muted-foreground/75 lowercase mt-0.5">
                {" "}
              </div>
            </div>
            <KpiTooltipIcon
              text={`Mention rate per tracked topic for ${subjectName} on topic-area questions (where the prompt doesn't name the subject directly). Bars sorted highest to lowest; warning tone on the weakest topic when there's a real spread. Open the Visibility deep-dive (link below) for snapshot + per-platform detail.`}
            />
          </div>
          {/* Weakest-topic lead line removed — the bottom-line
              verdict above the Vitals row already says "but only
              25% on Current events" and the warning-toned weakest
              row in the bar list below carries the same signal,
              so a third repetition just trained the eye to skip
              the band. The list's tone + emphasis keeps "which is
              weakest" obvious without relying on color alone. */}
          {/* Bar list. Reuses TopicBarRow for visual consistency
              with the sibling rendering on the Visibility deep-
              dive. Top 4 only — keeps the tile compact alongside
              the other Vitals tiles. Row spacing bumped from
              space-y-2 → space-y-4 so the bars breathe and the
              tile fills the same vertical space as the sparkline
              tiles next to it instead of bottoming out short. */}
          {(() => {
            const sortedDesc = withRecallSnap
              .slice()
              .sort((a, b) => (b.ai_recall ?? 0) - (a.ai_recall ?? 0))
              .slice(0, 4);
            const weakestRate = weakestTopic?.ai_recall ?? null;
            const isWeakestRow = (t: (typeof sortedDesc)[number]) =>
              weakestRate !== null &&
              Math.abs((t.ai_recall ?? 0) - weakestRate) < 0.001;
            return (
              <div className="mt-4 space-y-4">
                {sortedDesc.map((t) => (
                  <TopicBarRow
                    key={t.label}
                    label={t.label}
                    pct={Math.min(
                      100,
                      Math.round((t.ai_recall ?? 0) * 100),
                    )}
                    highlight={
                      gapExistsSnap && isWeakestRow(t) ? "weakest" : null
                    }
                  />
                ))}
              </div>
            );
          })()}
          {/* Methodology footer pinned to the bottom via mt-auto.
              Mirrors the AI Mention Rate tile's by-platform footer
              line — names the metric inline so a non-technical
              reader doesn't have to infer the denominator, and
              gives the tile a bottom-anchored element so heights
              equalize cleanly against the sparkline tiles. */}
          <p className="mt-auto pt-3 text-[10.5px] text-muted-foreground leading-relaxed">
            % of AI answers per topic that mention {subjectName} · lower = bigger gap
          </p>
        </div>
      )}
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = {
  criticism: "Criticism",
  praise: "Praise",
  narrative_frame: "Narrative frame",
  model_difference: "Model difference",
  characterization: "Characterization",
  factual_claim: "Factual claim",
};

// Inline pill styling for the Evidence card's type / mention
// badges. Mirrors the Narrative cluster sentiment-label pattern
// (bg-tone/15 + text-tone, rounded-full, uppercase bold) so the
// corner badge actually reads as a tonal indicator rather than
// muted small-caps text. Used in place of the generic <Pill>
// component here so Evidence cards get the more prominent
// treatment without affecting <Pill> consumers elsewhere.
const EVIDENCE_BADGE_TONE: Record<string, string> = {
  criticism: "bg-warning/15 text-warning",
  praise: "bg-success/15 text-success",
  narrative_frame: "bg-primary/15 text-primary",
  // Model-difference + characterization + factual_claim don't carry
  // a positive/negative direction — give them readable muted bgs
  // (not the same as no-bg so they still pop against the card).
  model_difference: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  characterization: "bg-muted text-foreground/75",
  factual_claim: "bg-muted text-foreground/75",
};

const MODEL_DISPLAY: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  claude: "Claude",
  perplexity: "Perplexity",
};

// Brand-mark icons via react-icons/si (CC0 simple-icons set) —
// same package the landing page's "Platforms monitored" strip
// uses, so the Evidence card now reads with the actual platform
// glyph next to its name instead of a colored dot. Icons render
// with currentColor so the muted-foreground treatment matches
// the surrounding text rather than introducing brand-color
// noise into the card.
const MODEL_ICON: Record<string, IconType> = {
  chatgpt: SiOpenai,
  gemini: SiGooglegemini,
  claude: SiAnthropic,
  perplexity: SiPerplexity,
};

function EvidenceCard({
  card,
  subjectId,
}: {
  card: SubjectOverview["evidence_cards"][number];
  subjectId: number;
}) {
  // Unnamed-layer cards show the Mentioned/Not-mentioned badge;
  // named-layer cards show the quote type badge instead (mention
  // status is meaningless when the subject is in the prompt itself).
  // Both render with the same prominent bg-tone/15 + text-tone
  // styling so the corner badge actually reads as a tonal signal
  // instead of muted small-caps text — same treatment the Narrative
  // spoke's cluster cards use.
  const badgeClass =
    "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] tabular-nums";
  const pillNode =
    card.mention_status !== null ? (
      card.mention_status.mentioned ? (
        <span className={`${badgeClass} bg-success/15 text-success`}>
          Mentioned · #{card.mention_status.rank ?? "?"}
        </span>
      ) : (
        <span className={`${badgeClass} bg-destructive/15 text-destructive`}>
          Not mentioned
        </span>
      )
    ) : (
      <span
        className={`${badgeClass} ${EVIDENCE_BADGE_TONE[card.type] ?? "bg-muted text-foreground/75"}`}
      >
        {TYPE_LABEL[card.type] || card.type}
      </span>
    );

  // Named-layer cards come from prompts that mentioned the subject by
  // name (e.g., "What are the criticisms of X?"). Tagging them as
  // "Solicited prompt" makes it unmissable that any critical content
  // in the quote is a response to a direct question — not AI's
  // unprompted framing. This is the visual bridge between a damning
  // quote and a low Unprompted Criticism Rate, which would otherwise
  // read as a contradiction.
  //
  // Treated as "anything that isn't unnamed" rather than strict
  // equality with "named" so a future layer (e.g. "mixed",
  // "comparative") that still solicits the subject in the prompt
  // gets the same tag automatically. mention_status is only
  // surfaced on unnamed-layer cards anyway, so the two pills
  // remain mutually exclusive.
  const isSolicited = card.layer !== "unnamed";

  const frameAbsent =
    card.mention_status?.mentioned === false;
  // Always render the Frame footer so the three cards line up
  // even when the cross-analyzer didn't tag a frame on one quote.
  // Previously we hid the row when null, which made one card
  // visibly shorter than the others and read as a dropped field;
  // the em-dash placeholder is honest about "no frame tagged"
  // while keeping the cards structurally identical.
  const frameLabel = frameAbsent
    ? "Absent from answer"
    : card.frame_label && card.frame_label.trim() !== ""
      ? card.frame_label
      : "—";
  const frameValueClass =
    frameLabel === "—"
      ? "text-foreground/40 font-medium"
      : frameAbsent
        ? "text-warning font-semibold"
        : "text-foreground font-semibold";

  return (
    // h-full lets the card fill the grid cell's row height (grid
    // items default to align-self: stretch), so the three cards in
    // the row come out equal-height even when their excerpts differ
    // in length. The Frame footer below uses mt-auto to stay pinned
    // to the bottom regardless of how short the body content is.
    <Card className="flex h-full flex-col p-4">
      <div>
        {/* Top row: model brand icon + name (left), type/mention
            badge (right). Aligned identically across all cards via
            mb-3 spacing. Icon is the platform's actual brand mark
            (SiOpenai / SiGooglegemini / SiAnthropic / SiPerplexity
            via react-icons/si), matching the landing page's
            "Platforms monitored" strip — replaces the prior colored
            dot which carried less identity signal. */}
        <div className="flex items-center justify-between gap-2 mb-3">
          {(() => {
            const Icon = MODEL_ICON[card.model_slug];
            return (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/80">
                {Icon ? (
                  <Icon
                    className="h-3.5 w-3.5 text-foreground/70"
                    aria-hidden
                  />
                ) : (
                  // Fallback to the colored dot only when a slug
                  // doesn't have a brand mark in MODEL_ICON yet
                  // (new platforms added in future).
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: MODEL_COLORS[MODEL_DISPLAY[card.model_slug]] || "var(--muted-foreground)" }}
                  />
                )}
                {MODEL_DISPLAY[card.model_slug] || card.model_slug}
              </span>
            );
          })()}
          {pillNode}
        </div>

        {/* "Solicited prompt" tag — only on named-layer cards. Tells
            the reader at a glance that this quote came from a prompt
            naming the subject, which is excluded from the Unprompted
            Criticism Rate denominator. */}
        {isSolicited && (
          <div
            className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1.5"
            title="This quote comes from a prompt that named the subject directly (e.g., a 'criticisms of X' or 'policy positions of X' question). Responses to such prompts are excluded from the Unprompted Criticism Rate, since they reflect the question rather than AI's volunteered framing."
          >
            Solicited prompt{" "}
            <span className="font-normal normal-case tracking-normal text-muted-foreground/80">
              (subject named in prompt)
            </span>
          </div>
        )}

        {/* Originating prompt — the question that elicited the quote. */}
        <div className="text-sm font-semibold text-foreground leading-snug mb-2">
          &ldquo;{card.prompt_text}&rdquo;
        </div>

        {/* AI's actual quote / paraphrased excerpt. Collapsed to
            ~4 lines by default; users can click "Show full quote"
            to reveal the rest (or click the truncated text itself).
            Cards stay roughly equal-height in the collapsed state;
            expanded cards grow taller — readers self-select which
            quotes they want the full text of. */}
        <EvidenceExcerpt
          excerpt={card.excerpt}
          rationale={card.rationale}
          subjectId={subjectId}
          promptId={card.prompt_id}
          modelSlug={card.model_slug}
        />
      </div>

      {/* Frame footer — always rendered (em-dash placeholder when
          missing) so the three cards in a row align identically.
          mt-auto pushes it to the bottom of the card regardless of
          how much body content sits above it. */}
      <div className="mt-auto pt-3 border-t border-border/60 text-xs font-medium text-foreground/70">
        Frame: <span className={frameValueClass}>{frameLabel}</span>
      </div>
    </Card>
  );
}

function SourcesList({ sources }: { sources: SubjectOverview["sources"] }) {
  if (!sources.length) {
    return (
      <div className="text-sm text-muted-foreground p-5">
        No sources extracted yet. Run a snapshot with grounding enabled.
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-12 text-[10px] uppercase tracking-wider text-foreground/65 px-3 pb-2 border-b border-border">
        <div className="col-span-6">Source</div>
        <div className="col-span-3 text-right">
          <span className="inline-flex items-center justify-end gap-1">
            Influence
            <KpiTooltipIcon
              text="How often this source appears in AI answers, scored 0–100 relative to the most-cited source. The top source always scores 100; others scale down from there based on their citation count."
              align="right"
            />
          </span>
        </div>
        <div className="col-span-3 text-right">Type</div>
      </div>
      {sources.map((s, idx) => (
        <div
          // `${name}-${idx}` rather than `name` alone so a future
          // regression returning two same-named sources doesn't
          // trigger a React key collision (same defensive pattern
          // PlatformBreakdownStrip uses).
          key={`${s.name}-${idx}`}
          // Zebra striping (even rows tinted) — subtle muted/40
          // band on rows 2 + 4 + … makes a 5-row list easier to
          // scan horizontally without needing borders between
          // rows. Hover still wins via the more-saturated accent
          // background.
          className={`grid grid-cols-12 items-center gap-2 px-3 py-2.5 rounded-md hover:bg-accent/60 transition-colors text-sm ${
            idx % 2 === 1 ? "bg-muted/40" : ""
          }`}
        >
          <div className="col-span-6 flex items-center gap-2 min-w-0">
            <span className="text-[10px] text-muted-foreground tabular-nums w-4">
              {String(idx + 1).padStart(2, "0")}
            </span>
            {/* Source name + icon are a single anchor target — clicking
                either opens the source's homepage in a new tab. The
                domain is already normalized by `_canonical_domain`
                (no `www.` prefix, no Wikipedia subdomain), so a bare
                `https://${s.name}` resolves correctly for all
                real-world sources we surface. `group-hover` keeps the
                icon and the text in visual sync on hover. */}
            <a
              href={`https://${s.name}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 min-w-0 hover:text-primary transition-colors"
              title={`Open ${s.name} in a new tab`}
            >
              <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
              <span className="truncate font-medium">{s.name}</span>
            </a>
          </div>
          <div className="col-span-3 text-right">
            <div className="inline-flex items-center gap-1.5">
              <div className="w-16 h-1 bg-border rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${s.score}%` }} />
              </div>
              <span className="text-xs font-mono text-muted-foreground">{s.score}</span>
            </div>
          </div>
          <div className="col-span-3 text-right">
            <Pill tone="neutral">{s.type}</Pill>
          </div>
        </div>
      ))}
    </div>
  );
}

// High-contrast monochromatic blue gradient used inside the stacked
// bar and matching legend dots so the two visualizations stay
// visually unified.
// SourcesTypeMix is a client component (interactive hover state on
// the donut segments); imported from ./sources-type-mix at the top
// of this file. The SOURCE_TYPE_COLORS palette lives in that file
// since it's the sole consumer.

// ── Page ────────────────────────────────────────────────────────────

export default async function SubjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const subjectId = Number.parseInt(idStr, 10);
  if (Number.isNaN(subjectId)) notFound();

  // Parallel-fetch the overview (dashboard data) and the subject
  // detail (refresh history + metadata for the action bar). Both
  // hit the same backend on different routes; running them
  // concurrently halves the wall-time vs sequential.
  let data: SubjectOverview;
  let subject: SubjectDetail;
  let subjects: Subject[];
  try {
    // listSubjects is non-essential to the page (it only powers the
    // header dropdown), so we let it fail soft to [] without crashing
    // the whole page.
    [data, subject, subjects] = await Promise.all([
      getSubjectOverview(subjectId),
      getSubject(subjectId),
      listSubjects().catch(() => [] as Subject[]),
    ]);
  } catch (e) {
    if (e instanceof Error && e.message.includes("404")) notFound();
    throw e;
  }
  // Subject detail is fetched in parallel with the overview for 404
  // detection (and previously fed the Snapshot history disclosure
  // that was retired). Other consumers can read it back without a
  // round-trip; for now it's intentionally unused after the read.
  void subject;

  // Short date for the sticky header meta line — drops the year so
  // the line stays tight ("Updated May 8" vs "Updated May 8, 2026").
  const updatedShort = data.meta.last_refresh_at
    ? new Date(data.meta.last_refresh_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : null;

  const subjectInitials = deriveInitials(data.subject_name);
  // Sticky header meta — operational info only. Subject name is
  // already visible in the entity dropdown chip to the right; "AI
  // Visibility" is implicit from the page context. Keep only the
  // snapshot date + response count so the band stays uncluttered.
  const headerMeta =
    updatedShort !== null
      ? `Updated ${updatedShort} · ${data.meta.n_responses} response${data.meta.n_responses === 1 ? "" : "s"}`
      : "";

  // Jump-to items for the right-rail nav. Some sections render only
  // when their data exists (Trends needs ≥2 trajectory weeks,
  // Evidence + Competition require non-empty payloads) — filter the
  // item list to match so the rail can't point at a missing anchor.
  // Five-band narrative layout: Vitals → Gap → Competitive → Sources → Evidence.
  // Band ids match the section ids below. Conditional bands
  // (Narratives needs at least one cluster OR a recommended fix;
  // Competitive needs at least one competitor row; Evidence needs at
  // least one quote) drop out of both the nav and the page when
  // their data is empty so the rail never points at a missing
  // anchor. The "narratives" id replaced the prior "gap" anchor —
  // the topic-gap content moved to the Vitals row's Visibility-by-
  // topic tile, so a sub-nav link labelled "Gap" no longer matched
  // what it landed on.
  const overviewSectionNavItems: { id: string; label: string; num: string }[] = [];
  overviewSectionNavItems.push({ id: "vitals", label: "Vitals", num: "01" });
  // Nav item gate matches the Top Narratives card's render gate
  // (`narrative_clusters.length > 0`), NOT the loosened section
  // gate that also accepts a fallback `recommended_actions.primary`.
  // Without this, never-refreshed subjects (zero clusters but the
  // backend ships a placeholder primary action) showed a
  // "Narratives" nav item that landed on a Fix-only band with no
  // Narratives content — false advertising in the rail.
  if (data.narrative_clusters.length > 0) {
    overviewSectionNavItems.push({
      id: "narratives",
      label: "Narratives",
      num: String(overviewSectionNavItems.length + 1).padStart(2, "0"),
    });
  }
  if (data.competitive.length > 0) {
    overviewSectionNavItems.push({
      id: "competitive",
      label: "Competitive",
      num: String(overviewSectionNavItems.length + 1).padStart(2, "0"),
    });
  }
  overviewSectionNavItems.push({
    id: "sources",
    label: "Sources",
    num: String(overviewSectionNavItems.length + 1).padStart(2, "0"),
  });
  if (data.evidence_cards.length > 0) {
    overviewSectionNavItems.push({
      id: "evidence",
      label: "Evidence",
      num: String(overviewSectionNavItems.length + 1).padStart(2, "0"),
    });
  }

  // Empty state: subject exists but has no completed refresh yet. The
  // normal page would render mostly empty cards and "—" values. Show
  // a focused first-run state instead so the user understands they're
  // looking at a not-yet-refreshed subject, not a broken page.
  const isEmpty = data.meta.latest_refresh_id === null;
  if (isEmpty) {
    return (
      <div className="flex min-h-screen bg-background text-foreground">
        <Sidebar subjectId={subjectId} activeSection="overview" />
        <div className="flex-1 min-w-0 flex flex-col">
          <Header
            subjectName={data.subject_name}
            subjectInitials={subjectInitials}
            metaLine={headerMeta}
            subjects={subjects.map((s) => ({ id: s.id, name: s.name }))}
            currentSubjectId={subjectId}
            backHref="/"
            backLabel="All subjects"
            refreshSlot={<RefreshButton subjectId={subjectId} />}
          />
          <main className="flex-1 px-4 md:px-12 py-6 space-y-16 max-w-[1280px] w-full mx-auto">
            <Card className="relative overflow-hidden p-10 md:p-14 border-border/60">
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(135deg, color-mix(in oklab, var(--primary) 5%, transparent) 0%, color-mix(in oklab, var(--primary) 1.5%, transparent) 35%, transparent 70%)",
                }}
              />
              <div className="relative flex flex-col items-start gap-5 max-w-2xl">
                <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 border border-primary/30">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/55 mb-2">
                    AI Narrative Brief
                  </div>
                  <h1 className="font-display text-[30px] md:text-[34px] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground">
                    {data.subject_name}
                  </h1>
                  <p className="mt-3 text-[15px] leading-relaxed text-foreground/70">
                    No snapshots yet for this subject. Run the first one to
                    generate an executive brief — KPIs, narrative clusters,
                    evidence quotes, competitive snapshot, and source mix.
                  </p>
                  <p className="mt-2 text-[13px] text-foreground/55">
                    A typical snapshot takes 1–3 minutes and analyzes ~25
                    responses across the major AI search platforms.
                  </p>
                </div>
                <div className="mt-2 text-[12px] text-foreground/55 flex items-center gap-2">
                  Use the
                  <span className="inline-flex items-center px-2 py-0.5 rounded border border-border text-foreground/70 text-[11px]">
                    Take snapshot
                  </span>
                  button at the top right to get started.
                </div>
              </div>
            </Card>
          </main>
        </div>
      </div>
    );
  }

  // Templated, gap-led Bottom Line synthesized from per-topic recall.
  // Prefer this over the server-polished `data.bottom_line` because it
  // leads with the largest visibility gap — the actionable headline —
  // rather than describing the strongest area. Falls back to the
  // server text when topic_coverage doesn't have ≥2 topics with
  // non-null recall (no gap to compute).
  const gapBottomLine = buildGapBottomLine(
    data.subject_name,
    data.topic_coverage,
  );
  const effectiveBottomLine = gapBottomLine ?? data.bottom_line;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar subjectId={subjectId} activeSection="overview" />

      <div className="flex-1 min-w-0 flex flex-col">
        <Header
          subjectName={data.subject_name}
          subjectInitials={subjectInitials}
          metaLine={headerMeta}
          subjects={subjects.map((s) => ({ id: s.id, name: s.name }))}
          currentSubjectId={subjectId}
          backHref="/"
          backLabel="All subjects"
          refreshSlot={<RefreshButton subjectId={subjectId} />}
        />

        {/* Horizontal sticky sub-nav pinned directly under the Header.
            Replaces the prior right-rail OverviewSectionNav, which
            forced every band to render in a ~80%-width grid column
            and left an empty right gutter. With the sub-nav in the
            header stack, the content area below can use the full
            available width up to `max-w-[1280px]`. */}
        <OverviewSubNav items={overviewSectionNavItems} />

        <main className="flex-1 px-4 md:px-12 py-6 max-w-[1280px] w-full mx-auto">
          <div className="space-y-10 min-w-0">

          {/* BAND 1 — VITALS. Executive summary: who, the verdict
              sentence, and the three headline metrics in one card.
              Replaces the old hero (which had absorbed SoV bars,
              mention-rate-by-topic, takeaways, and the recommended
              move into a single overloaded surface). The Visibility
              Trends section that used to repeat the same three KPIs
              below has been removed — its content moved here, and
              the "Open Visibility deep-dive →" link sits in the
              strip footer for readers who want the full breakdown. */}
          <section id="vitals" className="scroll-mt-28">
            <Card className="relative overflow-hidden p-6 md:p-7 border-border/60">
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(135deg, color-mix(in oklab, var(--primary) 5%, transparent) 0%, color-mix(in oklab, var(--primary) 1.5%, transparent) 35%, transparent 70%)",
                }}
              />
              <div className="relative">
                {/* Subject H1 dropped — the subject name already
                    appears in the page Header's subject picker, so
                    duplicating it here cost vertical real estate and
                    pushed the verdict below the fold. "AI Narrative
                    Brief" eyebrow also dropped — the page chrome and
                    sub-nav already establish what this surface is,
                    and stacking it above "Bottom line" read as two
                    consecutive headers for the same paragraph.
                    BottomLineBlock's own "Bottom line" eyebrow now
                    leads the card, the verdict sentence is the
                    focal point. */}
                {effectiveBottomLine && (
                  <BottomLineBlock
                    text={effectiveBottomLine}
                    // Only paint the body warning when the verdict
                    // came from the templated gap composer — that's
                    // the path that produces the "…but only N% on Y"
                    // punchline structure. Server-polished verdicts
                    // (the data.bottom_line fallback) can be praise
                    // or strong-asset framing where amber would
                    // misread the mood.
                    bodyTone={gapBottomLine ? "warning" : "neutral"}
                  />
                )}

                {!effectiveBottomLine && (
                  <div className="rounded-md border border-dashed border-border/70 bg-muted/30 px-5 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/45">
                      Executive summary
                    </div>
                    <p className="mt-1.5 text-[13px] text-foreground/55 leading-relaxed max-w-xl">
                      Not enough signal in this snapshot to synthesize a
                      bottom line yet. Take another snapshot or wait for
                      more data to accumulate.
                    </p>
                  </div>
                )}

                {/* KPI strip — three time-series tiles. Same component
                    that used to live in the standalone Visibility Trends
                    section; moved here so vitals read together and the
                    page doesn't repeat them twice. */}
                {data.trajectory.weeks.length >= 1 && (
                  <div className="mt-6 pt-5 border-t border-border/40">
                    {/* Per-platform mention-rate breakdown was a
                        standalone full-width strip below this
                        TrajectoryStrip; it's now folded into the
                        AI Mention Rate tile as a compact subline
                        (since the split is just a decomposition of
                        that one metric). The full per-platform
                        breakdown still lives in the Visibility
                        deep-dive's Platform Change Detail table —
                        see the "Open Visibility deep-dive →" link
                        below. */}
                    <TrajectoryStrip
                      trajectory={data.trajectory}
                      perPlatformKpis={data.per_platform_kpis}
                      topicCoverage={data.topic_coverage}
                      subjectName={data.subject_name}
                    />
                    {data.trajectory.weeks.length >= 2 && (
                      <div className="mt-4 flex justify-end">
                        <Link
                          href={`/subjects/${subjectId}/visibility`}
                          className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-sm transition-colors"
                        >
                          Open Visibility deep-dive
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </section>

          {/* BAND 2 — NARRATIVES & FIX. The dominant AI framings of
              the subject sit next to the recommended move. Swapped
              with Visibility-by-topic, which moved up to the Vitals
              row as a compressed KPI tile (weakest topic + pct);
              the per-topic bar list is now reached via the Visibility
              deep-dive link in the Vitals card. */}
          {(data.narrative_clusters.length > 0 ||
            data.recommended_actions?.primary) && (
            <section id="narratives" className="scroll-mt-28">
              {(() => {
                // items-stretch + h-full on each Card equalize the
                // two cards' heights regardless of content length.
                //
                // Dynamic column count so that when the Fix card (no
                // recommended action) is absent, the remaining card
                // fills the row instead of stretching across an empty
                // slot.
                const narrativesCardEligible = data.narrative_clusters.length > 0;
                const fixCardEligible = Boolean(data.recommended_actions?.primary);
                const cardCount =
                  (narrativesCardEligible ? 1 : 0) + (fixCardEligible ? 1 : 0);
                const gridColsClass =
                  cardCount === 2 ? "md:grid-cols-2" : "md:grid-cols-1";
                return (
                  <div className={`grid ${gridColsClass} gap-4 items-stretch`}>
                    {/* Top narratives — the recurring AI framings
                        (clusters) and how often each appears across
                        responses, sentiment-toned. Swapped here from
                        the Vitals row's single-cluster KPI tile so
                        the full top-4 list lands in Band 2 alongside
                        The fix as one "what's the narrative · what
                        do we do about it" beat. */}
                    {data.narrative_clusters.length > 0 && (
                      <Card className="flex h-full flex-col p-6 border-border/60">
                        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-primary mb-3">
                          Top narratives
                        </div>
                        <TopNarrativesList
                          clusters={data.narrative_clusters}
                          subjectName={data.subject_name}
                        />
                        <p className="mt-3 text-[10.5px] text-muted-foreground leading-relaxed">
                          Shares can overlap · values don&apos;t sum to 100%
                        </p>
                        {/* Deep-dive link, mt-auto pinned to the
                            bottom so it sits flush with The fix's
                            "View all N recommendations" link in
                            the sibling card. Matches the same
                            link pattern the Vitals + SoV + Sources
                            cards use to drill into their respective
                            spokes. */}
                        <div className="mt-auto pt-4 flex justify-end">
                          <Link
                            href={`/subjects/${subjectId}/narrative`}
                            className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-sm transition-colors"
                          >
                            Open Narrative deep-dive
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                          </Link>
                        </div>
                      </Card>
                    )}

                    {/* The fix. Primary-tinted card so it reads
                        as the actionable callout. Secondaries
                        surfaced inline below the primary so the card
                        fills out and matches the vertical weight of
                        the Top Narratives card to its left (without
                        the secondaries the card had ~3 lines of text
                        and a block of whitespace before the bottom-
                        pinned link). */}
                    {data.recommended_actions?.primary && (
                      <Card className="flex h-full flex-col p-6 border border-primary/30 bg-primary/[0.04]">
                        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-primary mb-3">
                          The fix · recommended move
                        </div>
                        <div className="text-[14px] font-medium text-foreground leading-snug">
                          {data.recommended_actions.primary.action}
                        </div>
                        {/* Top 2 secondaries inline. Cap at 2 to keep
                            the card from outgrowing its siblings on
                            subjects with many tracked actions —
                            "View all N" link below still surfaces
                            anything beyond the cap. Rendered as a
                            compact bulleted list (was a paragraph
                            with bold "Label." prefixes — the label
                            and action duplicated each other in
                            practice and the bold prefix made the
                            card read text-heavy in Band 2). */}
                        {data.recommended_actions.secondary.length > 0 && (
                          <ul className="mt-3 pt-3 border-t border-primary/15 space-y-1.5">
                            {data.recommended_actions.secondary
                              .slice(0, 2)
                              .map((s) => (
                                <li
                                  key={s.label}
                                  className="flex gap-2 text-[12.5px] text-foreground/75 leading-snug"
                                >
                                  <span
                                    aria-hidden
                                    className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary/60"
                                  />
                                  <span>{s.action}</span>
                                </li>
                              ))}
                          </ul>
                        )}
                        {data.recommended_actions.secondary.length > 0 && (
                          <Link
                            href={`/subjects/${subjectId}/recommendations`}
                            className="mt-auto pt-3 inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-sm transition-colors"
                          >
                            View all {1 + data.recommended_actions.secondary.length} recommendations
                            <ArrowRight className="h-3 w-3" aria-hidden />
                          </Link>
                        )}
                      </Card>
                    )}
                  </div>
                );
              })()}
            </section>
          )}

          {/* BAND 3 — COMPETITIVE STANDING. SoV bars on the left,
              competitive-position stat stack (rank, gap-to-leader,
              SoV trend) on the right with a thin divider. Stats are
              derived from the SAME data.competitive array that feeds
              the chart, so the two surfaces can never disagree. */}
          {data.competitive.length > 0 && (
            <section id="competitive" className="scroll-mt-28">
              <Card className="p-6 border-border/60">
                <div className="grid lg:grid-cols-[1.4fr_1fr] gap-7 items-center">
                  <div className="min-w-0">
                    <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/55">
                      Share of voice
                    </div>
                    {/* Plain-language definition: who AI mentions
                        most often when answering about this subject's
                        topic areas. Defines "share of voice" inline
                        so non-technical readers (the executive
                        audience for this brief) don't need to know
                        the marketing term — the sentence itself
                        carries the meaning. The top-N truncation
                        note appended only when applicable; both
                        numbers come from data.competitive.length so
                        bars + stat denominator + caption stay in
                        sync. */}
                    <p className="mt-1 text-[11.5px] leading-snug text-foreground/55">
                      How often each entity gets named in AI answers
                      about {data.subject_name}&apos;s topic areas —
                      a measure of who&apos;s dominating AI&apos;s
                      coverage.
                      {data.competitive.length > 5 && (
                        <>
                          {" "}Showing top 5 of {data.competitive.length} tracked entities.
                        </>
                      )}
                    </p>
                    <div className="mt-4 max-w-[640px]">
                      <CompetitorBarsFromData
                        data={pickTopWithSubject(data.competitive, 5).map((c) => ({
                          name: c.name,
                          // Defensive: coerce non-finite (NaN /
                          // Infinity) to 0 and floor tiny negatives
                          // from float round-off. Backend float
                          // arithmetic can produce −1e−16; analyzer
                          // bugs could produce NaN (0/0). The chart
                          // computes bar width from this value, so
                          // without the guard either would render
                          // visually broken (NaN% / negative width).
                          sov: Number.isFinite(c.sov) ? Math.max(0, c.sov) : 0,
                          is_subject: c.is_subject,
                        }))}
                        height={280}
                      />
                      {/* Methodology footer matching Visibility Gap +
                          Top Narratives in Band 2 — keeps "what does
                          this percentage mean?" answerable inline on
                          every chart instead of asking the reader to
                          infer the metric definition. Plus a small
                          legend disambiguating the subject's primary-
                          toned bar from the muted peer bars. */}
                      <p className="mt-3 text-[10.5px] text-muted-foreground leading-relaxed">
                        Each bar = % of AI answers about {data.subject_name}&apos;s
                        topic areas that name this entity. Higher = more
                        AI mind-share within the comparison set.
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--primary)" }} />
                          {data.subject_name}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--muted-foreground)", opacity: 0.45 }} />
                          Tracked competitor
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Competitive position stat stack — three cards that
                      interpret the chart on the left. Rank and gap
                      are derived from the SAME `data.competitive`
                      array that feeds the bars (via deriveCompetitivePosition)
                      so the chart and the stats can never drift.
                      SoV trend pulls from trajectory.share_of_voice
                      (the entity-pie share, the same definition the
                      chart bars represent), not competitive[].sov,
                      so the trend and the chart agree on what
                      "share of voice" means.
                      TODO: opposition_frame takeaway dropped from
                      Overview in this restructure — surfaces on the
                      Narrative spoke; revisit if a Band-2 fourth
                      slot becomes warranted. */}
                  {(() => {
                    const stats = deriveCompetitivePosition(data.competitive);
                    const sovSeries = data.trajectory.share_of_voice;
                    // Trend uses the IMMEDIATELY preceding snapshot
                    // only, not the most recent finite predecessor.
                    // "vs last snapshot" in the sub-line should mean
                    // "literally the snapshot before this one" — if
                    // that snapshot has a backfill gap, we hide the
                    // delta rather than silently span 2+ snapshots.
                    // (Sparkline still renders the full series with
                    // gap-aware path construction.)
                    const rawLatestSov = sovSeries[sovSeries.length - 1];
                    const rawPriorSov = sovSeries[sovSeries.length - 2];
                    const latestSov =
                      rawLatestSov !== null &&
                      rawLatestSov !== undefined &&
                      Number.isFinite(rawLatestSov)
                        ? rawLatestSov
                        : null;
                    const priorSov =
                      rawPriorSov !== null &&
                      rawPriorSov !== undefined &&
                      Number.isFinite(rawPriorSov)
                        ? rawPriorSov
                        : null;
                    const sovDeltaPp =
                      latestSov !== null && priorSov !== null
                        ? Math.round((latestSov - priorSov) * 100)
                        : null;
                    // Card eligible when we can compute the trend
                    // against the immediate predecessor. If only one
                    // snapshot exists, or the predecessor isn't
                    // measured, hide the card (rather than show "—").
                    const trendCardEligible = sovDeltaPp !== null;
                    return (
                      <div className="lg:border-l lg:border-border/40 lg:pl-7 space-y-3.5">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/55">
                          Competitive position
                        </div>

                        {stats.rank !== null && (
                          <StatCard
                            label="Rank in peer set"
                            // Tied case shows "Tied for #N" so a
                            // reader doesn't see a hard rank when
                            // the underlying SoV values are equal —
                            // the displayed rank would otherwise
                            // shift snapshot-to-snapshot based on
                            // backend insertion order without the
                            // data actually changing.
                            value={
                              stats.rankIsTied
                                ? `Tied #${stats.rank}`
                                : `#${stats.rank}`
                            }
                            // Position-from-leader bar: rank 1 of N
                            // → full bar (1.0); rank N of N → empty
                            // (1/N). Inverts the displayed rank into
                            // a "more filled = more leader-adjacent"
                            // visual so it reads the same way as the
                            // platform bars on the Vitals card.
                            progress={
                              stats.peerCount > 0
                                ? (stats.peerCount - stats.rank + 1) /
                                  stats.peerCount
                                : undefined
                            }
                            // Tone the bar by rank tier — top third
                            // green, bottom third amber, middle
                            // neutral. Matches the convention used
                            // by Visibility KPI tiles for "X% recall"
                            // grading.
                            valueTone={
                              stats.peerCount > 0
                                ? stats.rank <= Math.max(1, stats.peerCount / 3)
                                  ? "success"
                                  : stats.rank > (stats.peerCount * 2) / 3
                                    ? "warning"
                                    : "neutral"
                                : undefined
                            }
                            sub={
                              <span>
                                of{" "}
                                <span className="tabular-nums">
                                  {stats.peerCount}
                                </span>{" "}
                                tracked entities
                              </span>
                            }
                          />
                        )}

                        {/* Label and value switch together based on
                            rank: "Gap to leader / −N pts / behind X"
                            for non-#1 subjects, "Lead over runner-up
                            / +N pts / ahead of X" when the subject IS
                            the leader. Avoids the contradictory
                            "Gap to leader: Leads" pairing. Edge case:
                            if there's no runner-up (single tracked
                            entity), comparatorName is null and we
                            hide the card entirely rather than show
                            a stat with no peer context. */}
                        {stats.gapPp !== null &&
                          stats.comparatorName !== null && (
                            <StatCard
                              label={
                                stats.isLeader ? "Lead over runner-up" : "Gap to leader"
                              }
                              value={
                                stats.isLeader
                                  ? stats.gapPp > 0
                                    ? `+${stats.gapPp} pts`
                                    : `Tied with ${stats.comparatorName}`
                                  : stats.gapPp < 0
                                    ? `${stats.gapPp} pts`
                                    : `Tied with ${stats.comparatorName}`
                              }
                              valueTone={
                                stats.gapPp > 0
                                  ? "success"
                                  : stats.gapPp < 0
                                    ? "warning"
                                    : "neutral"
                              }
                              // Gap-closeness bar: 1.0 = no gap
                              // (tied or leader), 0 = max 100pp
                              // separation. Visualizes "how close
                              // is the subject to its comparator"
                              // independent of the sign, then the
                              // tone (success/warning) carries the
                              // direction.
                              progress={Math.max(
                                0,
                                1 - Math.min(100, Math.abs(stats.gapPp)) / 100,
                              )}
                              sub={
                                stats.gapPp === 0
                                  ? null
                                  : stats.isLeader
                                    ? `ahead of ${stats.comparatorName}`
                                    : `behind ${stats.comparatorName}`
                              }
                            />
                          )}

                        {/* Plain-language relabel — was
                            "Entity-mix share trend" with a jargon
                            sub-line "subject's slice of all
                            tracked-entity mentions" that comms
                            readers stumbled on. The previous label
                            was chosen to disambiguate from the bar
                            chart on the left (which is labeled
                            "Share of voice" but is actually mention
                            rate per competitive[].sov, NOT
                            trajectory.share_of_voice). That cross-
                            card ambiguity is now a documented
                            backend-coordinated rename — see
                            memory/byline_metric_naming.md. For now,
                            this card honors the user's clearer
                            language even though it shares a name
                            with the (mislabeled) bar chart. The
                            underlying metric here is genuine pie-
                            share (subject's mentions / sum of all
                            tracked-entity mentions). */}
                        {trendCardEligible && (
                          <StatCard
                            label="Share-of-voice change"
                            value={
                              sovDeltaPp === null
                                ? "—"
                                : sovDeltaPp > 0
                                  ? `+${sovDeltaPp} pts`
                                  : `${sovDeltaPp} pts`
                            }
                            valueTone={
                              sovDeltaPp === null
                                ? "neutral"
                                : sovDeltaPp > 0
                                  ? "success"
                                  : sovDeltaPp < 0
                                    ? "warning"
                                    : "neutral"
                            }
                            spark={<TinySpark values={sovSeries} />}
                            sub={
                              sovDeltaPp === null
                                ? null
                                : `${
                                    sovDeltaPp > 0
                                      ? `+${sovDeltaPp}`
                                      : sovDeltaPp
                                  } pts vs last snapshot`
                            }
                          />
                        )}
                      </div>
                    );
                  })()}
                </div>
                {/* Drill-in link — matches the "Open Visibility
                    deep-dive →" affordance on the Vitals card so
                    every band has a consistent "go deeper here"
                    exit. Without this, the page felt asymmetric:
                    only the Vitals band invited the reader to keep
                    going, the rest dead-ended. */}
                <div className="mt-5 pt-4 border-t border-border/40 flex justify-end">
                  <Link
                    href={`/subjects/${subjectId}/competition`}
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-sm transition-colors"
                  >
                    Open Competitive Visibility deep-dive
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </div>
              </Card>
            </section>
          )}

          {/* SOURCES — wired. No Card wrapper so the section reads
              as flat editorial content, matching the Trends + Evidence
              treatment above. */}
          <section id="sources" className="scroll-mt-28">
            {/* SectionTitle moved INSIDE the left column so the
                donut chart on the right starts at the same vertical
                line as the section heading + description text,
                rather than below the table header. Both columns
                now begin at the top of the grid row. */}
            <div className="grid lg:grid-cols-3 gap-8 items-start">
              <div className="lg:col-span-2">
                <SectionTitle
                  eyebrow="Sources"
                  title="Sources shaping AI answers"
                  description={`The publications and pages most often cited or paraphrased in AI responses about ${data.subject_name}.`}
                />
                <SourcesList sources={data.sources.slice(0, 5)} />
              </div>
              <SourcesTypeMix sources={data.sources} />
            </div>
            {/* Drill-in link — same affordance as the Vitals +
                Competitive bands above. */}
            <div className="mt-5 pt-4 border-t border-border/40 flex justify-end">
              <Link
                href={`/subjects/${subjectId}/sources`}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-sm transition-colors"
              >
                Open Sources deep-dive
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          </section>

          {/* EVIDENCE — moved to the bottom so the page closes with
              concrete quotes after the headline / trend / source
              context above. */}
          {data.evidence_cards.length > 0 && (
            <section id="evidence" className="scroll-mt-28">
              <SectionTitle
                eyebrow="Evidence"
                title="What AI is actually saying"
                description="What AI is actually saying when people ask about this subject — real quotes from this week's check."
              />
              {/* items-stretch (default in grid, made explicit) + the
                  Card's h-full + mt-auto footer combine to equalize
                  card heights even when excerpt lengths differ. */}
              <div className="grid md:grid-cols-3 gap-4 items-stretch">
                {data.evidence_cards.slice(0, 3).map((card, i) => (
                  <EvidenceCard
                    key={`${card.model_response_id}-${i}`}
                    card={card}
                    subjectId={subjectId}
                  />
                ))}
              </div>
              {/* Drill-in link — Prompts spoke carries the full
                  per-prompt × per-platform response feed that the
                  3 sampled quotes here are pulled from. Matches
                  the Vitals + Competitive + Sources bands above. */}
              <div className="mt-5 pt-4 border-t border-border/40 flex justify-end">
                <Link
                  href={`/subjects/${subjectId}/prompts`}
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-sm transition-colors"
                >
                  Open Prompts deep-dive
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>
            </section>
          )}

          </div>

          <footer className="mt-12 pt-6 pb-8 border-t border-border/40">
            <p className="text-center text-[11.5px] text-foreground/70 leading-relaxed">
              Based on{" "}
              <span className="font-semibold text-foreground/80 tabular-nums">
                {data.meta.n_responses}
              </span>{" "}
              AI responses across{" "}
              <span className="font-semibold text-foreground/80">
                {data.meta.n_platforms} platform
                {data.meta.n_platforms === 1 ? "" : "s"}
              </span>
              .{" "}
              <a href="#" className="text-primary hover:underline">
                Methodology →
              </a>
            </p>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Brand Visibility · AI Narrative Intelligence for Public Affairs
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
