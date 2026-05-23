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
import { Header } from "@/components/dashboard/Header";
import { Card, SectionTitle, Pill } from "@/components/dashboard/ui";
import { CompetitorBarsFromData } from "@/components/dashboard/Charts";
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
  return `${(v * 100).toFixed(digits)}%`;
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
  const pct = v * 100;
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
  return (
    <span className="group relative inline-flex">
      <Info className="h-3 w-3 opacity-50 hover:opacity-100 transition-opacity cursor-help" />
      <span
        className={`pointer-events-none absolute ${pos} bottom-full mb-2 w-56 rounded-md border border-border bg-popover px-3 py-2 text-[11px] leading-snug text-popover-foreground opacity-0 group-hover:opacity-100 transition-opacity z-30 shadow-lg`}
      >
        {text}
      </span>
    </span>
  );
}

// ── Wired sections ──────────────────────────────────────────────────

// Conditional color for a KPI value based on the metric kind and the
// raw value (units consistent with the underlying field — `ai_recall`
// and `risk_frame_rate` are 0..1; `avg_sentiment` is −1..+1).
//
// Thresholds chosen to be restrained: only step into success/warning
// when the value clearly clears the noise band. Anything in between
// stays in neutral foreground so the color treatment doesn't over-fire
// on small differences. `text-warning` reserved for values that
// genuinely warrant attention rather than as a default for "risk"
// metrics (the prior behavior, which painted Risk Frame Rate orange
// even at 0%).
function getKpiValueColor(
  kind:
    | "mention_rate"
    | "avg_tone"
    | "risk_frame_rate"
    | "weakest_topic_recall"
    | "citation_rate"
    | "net_sentiment"
    | "top_result_rate",
  value: number | null,
): string {
  if (value === null) return "text-foreground";
  switch (kind) {
    case "mention_rate":
      // 0..1 — higher is better
      if (value >= 0.5) return "text-success";
      if (value < 0.2) return "text-warning";
      return "text-foreground";
    case "avg_tone":
      // −1..+1 — positive is better, negative is worse. Color mirrors
      // the text label produced by formatTonePct: anything called
      // "positive" goes green, "negative" goes orange, only "Neutral"
      // (|value| < 0.005, i.e. < 0.5% absolute) stays foreground. Prior
      // ±0.2 threshold left mild-negative values like −13% reading as
      // neutral-black while the change indicator next to them already
      // showed warning orange — visually inconsistent.
      if (value > 0.005) return "text-success";
      if (value < -0.005) return "text-warning";
      return "text-foreground";
    case "risk_frame_rate":
      // 0..1 — lower is better
      if (value <= 0.05) return "text-success";
      if (value > 0.2) return "text-warning";
      return "text-foreground";
    case "weakest_topic_recall":
      // 0..1 — narrower color ladder than overall mention rate. Even
      // at 50% the framing of the tile is "this is the weakest topic"
      // / "this is where AI underweights the subject" — celebrating
      // that with a green value undercuts the headline. Only go
      // warning for genuinely severe gaps (<30%); otherwise stay
      // neutral. Never go success: the weakest topic isn't a "win,"
      // and on the only path where weakest = 100% (all topics tied at
      // ceiling) the templated Bottom Line returns null and this tile
      // sits next to no actionable gap to surface anyway.
      if (value < 0.3) return "text-warning";
      return "text-foreground";
    case "citation_rate":
      // 0..1 — higher is better, but the real-world range is much
      // lower than overall mention rate (canonical URLs typically
      // appear in 5–25% of cited responses, not 50%+). Softer ladder:
      // genuinely strong citation share goes green at ≥20%; truly
      // absent (=0%) stays neutral since it often just means no
      // canonical_url is configured for the subject, not a real
      // signal. Warning fires only for low-but-nonzero (<5%, >0%) —
      // a configured site that AI is essentially ignoring.
      if (value >= 0.2) return "text-success";
      if (value > 0 && value < 0.05) return "text-warning";
      return "text-foreground";
    case "net_sentiment":
      // Signed integer count: positive_responses − negative_responses
      // per snapshot (±0.1 neutral band excluded from both counts).
      // Net positive → success; net negative → warning; ties stay
      // neutral. Magnitude varies with response volume so we don't
      // ladder by absolute threshold — direction is the signal.
      if (value > 0) return "text-success";
      if (value < 0) return "text-warning";
      return "text-foreground";
    case "top_result_rate":
      // 0..1 — higher is better. Real-world range is lower than
      // overall mention rate: top-of-mind first-rank share usually
      // tops out around 30-40% even for dominant entities, since
      // most answers list multiple peers. Softer ladder than
      // mention_rate: green at ≥25% (strong top-of-mind), warning
      // when AI essentially never leads with the subject (<5%).
      if (value >= 0.25) return "text-success";
      if (value < 0.05) return "text-warning";
      return "text-foreground";
  }
}

// Predicate used by every consumer of topic_coverage to filter out
// non-finite recall values. `!== null` alone lets NaN / Infinity
// through; once they enter the math (Math.abs, Math.round, average,
// epsilon compare) they propagate to the UI as "NaN%" or break tie
// detection. Strict isFinite check stops that at the boundary.
function _hasFiniteRecall(
  t: SubjectOverview["topic_coverage"][number],
): boolean {
  return t.ai_recall !== null && Number.isFinite(t.ai_recall);
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
  // gap to surface — defer to the server bottom_line instead. Use
  // float epsilon so DB-aggregation micro-differences (0.6666666 vs
  // 0.6666667) don't bypass the tie check. Matches the TIE_EPSILON
  // used in TopicRecallChart for consistency.
  const TIE_EPSILON = 0.001;
  if (
    others.every(
      (t) =>
        Math.abs((t.ai_recall ?? 0) - (weakest.ai_recall ?? 0)) <
        TIE_EPSILON,
    )
  ) {
    return null;
  }
  const weakestPct = Math.round((weakest.ai_recall ?? 0) * 100);

  // Plain-English phrasing so readers unfamiliar with "mention rate"
  // and the topic abstraction can parse the sentence. "When asked
  // about X, AI mentions Y in N% of answers" makes the metric self-
  // describing: the topic is what AI is being asked about; the rate
  // is the share of those answers that name the subject.
  if (others.length === 1) {
    const other = others[0];
    const otherPct = Math.round((other.ai_recall ?? 0) * 100);
    return `When asked about ${weakest.label}, AI mentions ${subjectName} in only ${weakestPct}% of answers — compared to ${otherPct}% when asked about ${other.label}.`;
  }

  const meanOthersPct = Math.round(
    (others.reduce((sum, t) => sum + (t.ai_recall ?? 0), 0) / others.length) * 100,
  );
  // Comparator phrasing tries to name the topics inline so a reader
  // knows what the baseline contains. Topic labels can run long
  // ("figures shaping the current Republican administration"), so a
  // single verbose name in the list can blow up the sentence even
  // when the others are short. Strategy: keep labels ≤40 chars
  // inline; bucket longer ones into "and N more". Fall back to a
  // pure count when nothing's short enough, or when there are too
  // many total to list cleanly.
  const comparator = formatComparator(others.map((t) => t.label));
  // When formatComparator falls back to "N other tracked topics", it
  // already carries the "other tracked topics" framing — don't double
  // it up with a parenthetical. Otherwise wrap the named list so the
  // reader knows those topic names ARE the comparison group.
  const isPureCount = /^\d+ other tracked topics/.test(comparator);
  const comparatorPhrase = isPureCount
    ? comparator
    : `other tracked topics (${comparator})`;
  return `When asked about ${weakest.label}, AI mentions ${subjectName} in only ${weakestPct}% of answers — well below the ${meanOthersPct}% average across ${comparatorPhrase}.`;
}

// Plain-English list joiner: "A", "A and B", "A, B, and C", etc.
const MAX_INLINE_LABEL_CHARS = 40;
const MAX_INLINE_LABELS = 4;

function joinList(labels: string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

// Builds the "comparator" phrase for the gap Bottom Line. Names
// topics inline when their labels are short enough, buckets long
// labels into "and N more", and falls back to a pure count when
// inline naming would produce an unreadable sentence.
function formatComparator(labels: string[]): string {
  const shortLabels = labels.filter(
    (l) => l.length <= MAX_INLINE_LABEL_CHARS,
  );
  const longCount = labels.length - shortLabels.length;

  // No short labels, or too many topics overall — pure count.
  if (shortLabels.length === 0 || shortLabels.length > MAX_INLINE_LABELS) {
    return `${labels.length} other tracked topics`;
  }
  // All short and within the inline cap — name them all.
  if (longCount === 0) {
    return joinList(shortLabels);
  }
  // Mix: name the short ones, bucket the long ones.
  const tail = `and ${longCount} more`;
  return shortLabels.length === 1
    ? `${shortLabels[0]} ${tail}`
    : `${shortLabels.join(", ")}, ${tail}`;
}

// Split a Bottom Line string into a bold title clause + a regular
// elaboration line so the rendered block can mirror the Strongest
// Asset takeaway's two-line hierarchy. Handles the three sentence
// shapes our bottom_line generators emit:
//   1. Em-dash separated:  "claim — supporting metric"
//      → title "claim", body "supporting metric"
//   2. Parenthetical:      "claim (supporting metric)."
//      → title "claim", body "supporting metric"
//   3. No separator:       "claim only."
//      → title is the whole string, no body
// Trailing period on the body is preserved; title gets no terminal
// punctuation to match Strongest Asset's title convention.
function splitBottomLine(text: string): { title: string; body: string | null } {
  const trimmed = text.trim();
  // Em-dash split (covers buildGapBottomLine + _compute_bottom_line's
  // gap-only branch). Uses the actual em-dash char with optional
  // whitespace either side.
  const emDash = trimmed.match(/^(.+?)\s*—\s*(.+?)\.?\s*$/);
  if (emDash) {
    return { title: emDash[1].trim(), body: emDash[2].trim() + "." };
  }
  // Parenthetical split (covers _compute_bottom_line's strong-only
  // branch and most LLM-polished outputs that follow that template).
  const paren = trimmed.match(/^(.+?)\s*\((.+?)\)\.?\s*$/);
  if (paren) {
    return { title: paren[1].trim(), body: paren[2].trim() + "." };
  }
  // No splittable separator (covers strong-and-gap variant + any
  // polish output that the LLM rephrased into a single clause).
  return { title: trimmed, body: null };
}

function BottomLineBlock({ text }: { text: string }) {
  const { title, body } = splitBottomLine(text);
  return (
    // Vitals-tier treatment — verdict sentence sits between subject
    // title and the KPI strip. text-wrap:balance splits the title
    // evenly across lines instead of dropping a single word onto a
    // second line. Topic-recall mini-bars moved out to Band 2 ("the
    // gap") so the verdict reads as one beat, not two stacked beats.
    <div className="mt-4">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-primary">
        Bottom line
      </div>
      <div className="mt-1.5 text-[17px] md:text-[18px] font-medium leading-[1.4] tracking-tight text-foreground [text-wrap:balance] max-w-[90%]">
        {title}
      </div>
      {body && (
        <p className="mt-2 text-[14px] text-foreground/75 leading-relaxed [text-wrap:balance] max-w-[90%]">
          {body}
        </p>
      )}
    </div>
  );
}

// Compact per-topic mention-rate bars rendered directly under the
// Bottom Line copy. Folded in from the standalone "Topic Recall"
// section because the Bottom Line prose already cites these numbers —
// the bars reinforce the sentence without claiming a separate
// section. Same color tiers + weakest-topic warning treatment as the
// old TopicRecallChart so visual semantics carry over.
function TopicRecallInline({
  topics,
}: {
  topics: SubjectOverview["topic_coverage"];
}) {
  const sorted = topics
    .filter(_hasFiniteRecall)
    .slice()
    .sort((a, b) => (b.ai_recall ?? 0) - (a.ai_recall ?? 0));
  if (sorted.length === 0) return null;
  const weakestTopic = findWeakestTopic(sorted);
  const TIE_EPSILON = 0.001;
  const hasRealGap =
    sorted.length > 1 &&
    !sorted.every(
      (t) =>
        Math.abs((t.ai_recall ?? 0) - (sorted[0].ai_recall ?? 0)) < TIE_EPSILON,
    );
  return (
    <div className="mt-5">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/55 mb-2.5">
        Mention rate by topic
      </div>
      <div className="space-y-2.5">
        {sorted.map((t) => {
          const pct = Math.round((t.ai_recall ?? 0) * 100);
          const isWeakest = hasRealGap && t === weakestTopic;
          const tierColor =
            pct >= 70
              ? "var(--success)"
              : pct >= 40
                ? "var(--primary)"
                : "var(--warning)";
          const barColor = isWeakest ? "var(--warning)" : tierColor;
          return (
            <div
              key={t.label}
              className="grid grid-cols-[1fr_44px] items-center gap-x-3"
            >
              <div className="min-w-0">
                <div className="text-[12px] text-foreground/80 truncate mb-1">
                  {capitalizeFirst(t.label)}
                </div>
                <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: barColor,
                      opacity: isWeakest ? 0.75 : 0.4 + (pct / 100) * 0.45,
                    }}
                  />
                </div>
              </div>
              <span className="text-[12px] font-semibold text-foreground tabular-nums text-right">
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompetitiveSharePanel({
  competitive,
}: {
  competitive: SubjectOverview["competitive"];
}) {
  if (competitive.length === 0) {
    return (
      <div className="lg:border-l lg:border-border/50 lg:pl-12 lg:pt-20">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/50">
          Share of Voice (% of answers)
        </div>
        <p className="mt-1 text-[11.5px] leading-snug text-foreground/55">
          % of answers mentioning each tracked entity.
        </p>
        <p className="mt-3 text-[13px] text-foreground/55 leading-relaxed">
          No competitive entities tracked for this snapshot yet.
        </p>
      </div>
    );
  }

  return (
    <div className="lg:border-l lg:border-border/50 lg:pl-12 lg:pt-20">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/50">
        Share of Voice (% of answers)
      </div>
      <p className="mt-1 text-[11.5px] leading-snug text-foreground/55">
        % of answers mentioning each tracked entity.
      </p>
      <div className="mt-5">
        <CompetitorBarsFromData
          data={pickTopWithSubject(competitive, 5).map((c) => ({
            name: c.name,
            sov: c.sov,
            is_subject: c.is_subject,
          }))}
          height={340}
        />
      </div>
    </div>
  );
}

// Top-N by SoV with the subject always included. If the subject sits
// outside the top N, drop the lowest-ranked non-subject row to make
// room so the searched-for entity stays visible.
function pickTopWithSubject(
  rows: SubjectOverview["competitive"],
  n: number,
): SubjectOverview["competitive"] {
  const sorted = rows.slice().sort((a, b) => b.sov - a.sov);
  const top = sorted.slice(0, n);
  if (top.some((c) => c.is_subject)) return top;
  const subject = sorted.find((c) => c.is_subject);
  if (!subject) return top;
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
}: {
  label: string;
  value: string;
  valueTone?: "success" | "warning" | "neutral";
  sub?: React.ReactNode;
  spark?: React.ReactNode;
}) {
  const valueColor =
    valueTone === "success"
      ? "text-success"
      : valueTone === "warning"
        ? "text-warning"
        : "text-foreground";
  return (
    <div className="rounded-md bg-muted/40 px-3.5 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/55">
        {label}
      </div>
      <div className={`mt-1 text-[22px] font-medium tracking-tight tabular-nums ${valueColor}`}>
        {value}
      </div>
      {spark && <div className="mt-1.5">{spark}</div>}
      {sub && (
        <div className="mt-0.5 text-[11.5px] text-foreground/60 leading-snug">
          {sub}
        </div>
      )}
    </div>
  );
}

// Tiny inline sparkline for use inside a compact StatCard. Hand-
// rolled SVG (no recharts) so it stays at ~22px tall without the
// axis-label overhead MiniSpark carries. Skips null segments and
// connects only adjacent finite points; renders nothing if there
// aren't at least two finite values.
function TinySpark({
  values,
  color = "var(--primary)",
}: {
  values: (number | null)[];
  color?: string;
}) {
  const numeric = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (numeric.length < 2) return null;
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  const range = max - min || 1;
  const w = 120;
  const h = 22;
  const pad = 2;
  const step = (w - pad * 2) / (values.length - 1);
  const path: string[] = [];
  let lastWasNull = false;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      lastWasNull = true;
      return;
    }
    const x = pad + i * step;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    path.push(path.length === 0 || lastWasNull ? `M${x},${y}` : `L${x},${y}`);
    lastWasNull = false;
  });
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="w-full h-[22px]"
      aria-hidden
    >
      <path d={path.join(" ")} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

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
};
function deriveCompetitivePosition(
  rows: SubjectOverview["competitive"],
): CompetitivePositionStats {
  const sorted = rows.slice().sort((a, b) => b.sov - a.sov);
  const peerCount = sorted.length;
  const subjectIdx = sorted.findIndex((c) => c.is_subject);
  if (subjectIdx === -1) {
    return { rank: null, peerCount, gapPp: null, comparatorName: null, isLeader: false };
  }
  const rank = subjectIdx + 1;
  const subject = sorted[subjectIdx];
  const isLeader = rank === 1;
  // Rank #1: compare downward against the runner-up so the stat
  // reads "ahead of X by N pts" rather than the nonsensical
  // "−0 pts behind myself". Otherwise compare upward to leader.
  if (isLeader) {
    const runnerUp = sorted[1];
    if (!runnerUp) {
      return { rank, peerCount, gapPp: null, comparatorName: null, isLeader };
    }
    const gapPp = Math.round((subject.sov - runnerUp.sov) * 100);
    return { rank, peerCount, gapPp, comparatorName: runnerUp.name, isLeader };
  }
  const leader = sorted[0];
  const gapPp = Math.round((subject.sov - leader.sov) * 100);
  return { rank, peerCount, gapPp, comparatorName: leader.name, isLeader };
}

function TrajectoryStrip({ trajectory }: { trajectory: SubjectOverview["trajectory"] }) {
  const metrics: {
    title: string;
    values: (number | null)[];
    format: (v: number | null) => string;
    tooltip: string;
    // `kind` drives the conditional value coloring via getKpiValueColor.
    // Uses the same thresholds the Hero KPI tiles use, so the same
    // metric carries identical color semantics across both surfaces.
    colorKind: "mention_rate" | "avg_tone" | "top_result_rate";
  }[] = [
    {
      title: "AI Mention Rate",
      values: trajectory.ai_recall,
      format: (v) => formatPct(v, 0),
      tooltip: "Share of AI answers that mention this subject on topic-area questions (where the prompt doesn't name them directly), plotted across each weekly snapshot. Higher is better. Rising means AI is more reliably surfacing the subject when asked about their topic areas.",
      colorKind: "mention_rate",
    },
    {
      title: "Average Tone",
      values: trajectory.avg_sentiment,
      format: (v) => formatTonePct(v),
      tooltip: "Average tone — the mean sentiment score across all AI answers in this snapshot, weighted by intensity. Range −100% to +100%; 0% is neutral. Measures how favorably AI characterizes the subject when it does mention them.",
      colorKind: "avg_tone",
    },
    {
      title: "Top Result Rate",
      values: trajectory.top_result_rate,
      format: (v) => formatPct(v, 0),
      tooltip: "Share of AI answers where this subject is named FIRST among all entities mentioned. A top-of-mind signal. Distinct from Mention Rate (any mention, anywhere in the answer) — Top Result Rate measures whether AI leads with this subject when it lists entities.",
      colorKind: "top_result_rate",
    },
  ];

  return (
    <div className="grid md:grid-cols-3 gap-4">
      {metrics.map((m) => {
        const latestValue = m.values[m.values.length - 1] ?? null;
        // "Not measured" when every snapshot returned null for this
        // metric (e.g. Citation Rate for a subject with no
        // canonical_url). Distinct from "no snapshots yet" — the
        // header value and footer copy both adjust so the tile reads
        // as not-applicable rather than waiting-on-data.
        const notMeasured =
          m.values.length > 0 &&
          m.values.every((v) => v === null);
        const valueColor = notMeasured
          ? "text-muted-foreground"
          : getKpiValueColor(m.colorKind, latestValue);
        return (
          // Flat tile — no Card wrapper. Matches the page's flatter
          // editorial register (Sources, Evidence section header).
          // Visual separation comes from the grid gap, not borders.
          <div key={m.title}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {m.title}
              </div>
              <KpiTooltipIcon text={m.tooltip} align="right" />
            </div>
            <div className={`mt-1 text-2xl font-semibold tracking-tight ${valueColor}`}>
              {notMeasured ? "—" : m.format(latestValue)}
            </div>
            <div className="mt-3">
              <MiniSpark
                values={m.values}
                isHistorical={trajectory.is_historical}
                labels={trajectory.weeks}
                format={m.format}
              />
            </div>
            {/* Per-tile footer reserved for the "not measured" case
                only — the section-level description already carries
                the snapshot count + live/historical legend, so
                repeating it three times across tiles was dead text. */}
            {notMeasured && (
              <div className="mt-3 pt-3 border-t border-border text-xs text-foreground/70 leading-relaxed">
                This metric isn&apos;t measured for this subject.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MiniSpark({
  values,
  isHistorical,
  labels,
  format,
}: {
  values: (number | null)[];
  isHistorical: boolean[];
  labels: string[];
  // Formatter used to render the min/max axis labels in the same units
  // as the metric (so a recall trajectory shows "75%" not "0.75",
  // tone shows "+12% positive" not "0.12", etc.). Same callback the
  // tile uses for its big value, kept consistent.
  format: (v: number | null) => string;
}) {
  const numericValues = values.filter((v): v is number => v !== null);
  // Distinguish "we have snapshots but the metric isn't measurable for
  // this subject" from "we just don't have enough snapshots yet." For
  // Citation Rate against a subject with no canonical_url, every
  // snapshot's value is null — the user shouldn't see "need more
  // snapshots" since taking more wouldn't fix it.
  if (values.length > 0 && numericValues.length === 0) {
    return (
      <div className="h-[120px] flex items-center justify-center text-center text-[11px] text-muted-foreground px-3 leading-relaxed">
        Not measured for this subject
      </div>
    );
  }
  if (numericValues.length < 2) {
    // Single data point — render a dot at the value instead of a
    // "need more snapshots" placeholder, which read as a broken tile
    // when it sat beside two fully-rendered sparklines. The tile's
    // headline value already carries the number; this just gives the
    // chart area a non-empty visual + a count of how much data
    // backs that value.
    return (
      <div className="h-[120px] flex flex-col items-center justify-center gap-2 px-3">
        <div className="h-1.5 w-1.5 rounded-full bg-primary" />
        <div className="text-[11px] text-muted-foreground leading-relaxed text-center">
          1 of {values.length} snapshots scored so far
        </div>
      </div>
    );
  }
  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  const range = max - min || 1;
  const w = 280;
  const h = 120;
  const pad = 6;
  const step = (w - pad * 2) / (values.length - 1);
  const yFor = (v: number | null) =>
    v === null ? null : h - pad - ((v - min) / range) * (h - pad * 2);

  // Build path; emit M (move) instead of L (line-to) after a null
  // so the line breaks at gaps. Prior implementation only skipped
  // nulls — which connected the surrounding non-null points
  // directly, visually drawing a line THROUGH points that should
  // be gaps (e.g., a snapshot whose analyzer crashed and produced
  // a null reading). The break makes "no measurement here" read
  // as discontinuity.
  const path: string[] = [];
  let lastWasNull = false;
  values.forEach((v, i) => {
    const y = yFor(v);
    if (y === null) {
      lastWasNull = true;
      return;
    }
    const x = pad + i * step;
    const needsMove = path.length === 0 || lastWasNull;
    path.push(needsMove ? `M${x},${y}` : `L${x},${y}`);
    lastWasNull = false;
  });

  // Axis labels live as HTML overlays (not SVG <text>) because the
  // SVG uses preserveAspectRatio="none" to stretch the line full
  // width — that would distort SVG text. Container reserves left
  // padding (pl-9) so the SVG plot area visually starts to the right
  // of the axis labels; the SVG itself still renders edge-to-edge
  // within the remaining width.
  // When every numeric value is identical (e.g. flat 100% recall
  // across all snapshots), min === max and both axis labels would
  // render the same text stacked. Show a single vertically-centered
  // label instead — clearer about what's being depicted.
  const flatLine = min === max;
  // Date ticks under the chart — first measured · midpoint · last
  // measured. Picks indices from the actual values (not just the
  // labels array) so a sparkline with leading nulls doesn't show
  // a date for an empty point. Renders a 3-cell flex row below
  // the SVG; the parent reserves space via the wrapping div.
  const measuredIndices: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== null) measuredIndices.push(i);
  }
  const fmtShortDate = (iso: string | undefined): string => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };
  const firstIdx = measuredIndices[0];
  const lastIdx = measuredIndices[measuredIndices.length - 1];
  const midIdx =
    measuredIndices[Math.floor(measuredIndices.length / 2)];
  return (
    <div>
      <div className="relative h-[120px] pl-9">
        {flatLine ? (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 text-[9px] leading-none text-muted-foreground/55 tabular-nums">
            {format(max)}
          </span>
        ) : (
          <>
            <span className="absolute left-0 top-0 text-[9px] leading-none text-muted-foreground/55 tabular-nums">
              {format(max)}
            </span>
            <span className="absolute left-0 bottom-0 text-[9px] leading-none text-muted-foreground/55 tabular-nums">
              {format(min)}
            </span>
          </>
        )}
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full">
        {/* Subtle top/bottom gridlines anchor the line to the axis
            labels' values. Dashed + faint so they read as guidance
            rather than chart structure. */}
        <line
          x1={pad}
          y1={pad}
          x2={w - pad}
          y2={pad}
          stroke="var(--border)"
          strokeWidth={1}
          strokeDasharray="2 3"
          opacity={0.5}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={pad}
          y1={h - pad}
          x2={w - pad}
          y2={h - pad}
          stroke="var(--border)"
          strokeWidth={1}
          strokeDasharray="2 3"
          opacity={0.5}
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={path.join(" ")}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      {values.map((v, i) => {
        const y = yFor(v);
        if (y === null) return null;
        const x = pad + i * step;
        // Historical dots are open circles; live points are filled
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={2.5}
            fill={isHistorical[i] ? "var(--card)" : "var(--primary)"}
            stroke="var(--primary)"
            strokeWidth={1.4}
            vectorEffect="non-scaling-stroke"
          >
            <title>
              {`${labels[i]}: ${format(v)}${
                isHistorical[i] ? " (retrospective estimate)" : ""
              }`}
            </title>
          </circle>
        );
      })}
        </svg>
      </div>
      {/* X-axis date row — start · midpoint · end of the measured
          range. Mirrors the date-tick pattern on the Narrative
          spoke's sparklines so a reader can see what time window
          the line covers without consulting the section header.
          Indented to match the SVG's pl-9 plot area so the labels
          align with the plotted points. */}
      <div className="mt-1.5 pl-9 flex items-center justify-between text-[9px] tabular-nums text-muted-foreground/55">
        <span>{fmtShortDate(labels[firstIdx])}</span>
        {measuredIndices.length >= 3 && (
          <span>{fmtShortDate(labels[midIdx])}</span>
        )}
        <span>{fmtShortDate(labels[lastIdx])}</span>
      </div>
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

function EvidenceCard({ card }: { card: SubjectOverview["evidence_cards"][number] }) {
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
  const isSolicited = card.layer === "named";

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
        {/* Top row: model name (left) + type/mention badge (right).
            Aligned identically across all cards via mb-3 spacing. */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/80">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: MODEL_COLORS[MODEL_DISPLAY[card.model_slug]] || "var(--muted-foreground)" }}
            />
            {MODEL_DISPLAY[card.model_slug] || card.model_slug}
          </span>
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

        {/* AI's actual quote / paraphrased excerpt. line-clamp-4 keeps
            cards visually even regardless of underlying excerpt length;
            full text is in the rationale tooltip on hover. */}
        <p
          className="line-clamp-4 text-sm leading-relaxed text-foreground/80"
          title={card.rationale}
        >
          {card.excerpt}
        </p>
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
          key={s.name}
          className="grid grid-cols-12 items-center gap-2 px-3 py-2.5 rounded-md hover:bg-accent/60 transition-colors text-sm"
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
      ? `Updated ${updatedShort} · ${data.meta.n_responses} responses`
      : "";

  // Jump-to items for the right-rail nav. Some sections render only
  // when their data exists (Trends needs ≥2 trajectory weeks,
  // Evidence + Competition require non-empty payloads) — filter the
  // item list to match so the rail can't point at a missing anchor.
  // Five-band narrative layout: Vitals → Gap → Competitive → Sources → Evidence.
  // Band ids match the section ids below. Conditional bands (Gap needs at least
  // one finite topic recall; Competitive needs at least one competitor row;
  // Evidence needs at least one quote) drop out of both the nav and the page
  // when their data is empty so the rail never points at a missing anchor.
  const overviewSectionNavItems: { id: string; label: string; num: string }[] = [];
  overviewSectionNavItems.push({ id: "vitals", label: "Vitals", num: "01" });
  if (data.topic_coverage.some(_hasFiniteRecall)) {
    overviewSectionNavItems.push({
      id: "gap",
      label: "Gap",
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
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/55 mb-1.5">
                  AI Narrative Brief
                </div>
                <h1 className="font-display text-[22px] font-medium leading-[1.15] tracking-[-0.02em] text-foreground">
                  {data.subject_name}
                </h1>

                {effectiveBottomLine && (
                  <BottomLineBlock text={effectiveBottomLine} />
                )}

                {!effectiveBottomLine && (
                  <div className="mt-4 rounded-md border border-dashed border-border/70 bg-muted/30 px-5 py-4">
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
                    <TrajectoryStrip trajectory={data.trajectory} />
                    {data.trajectory.weeks.length >= 2 && (
                      <div className="mt-3 flex justify-end">
                        <Link
                          href={`/subjects/${subjectId}/visibility`}
                          className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:text-primary/80 transition-colors"
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

          {/* BAND 2 — GAP & FIX. Problem and solution adjacent.
              Left card: the topic-coverage gap (where AI under-
              mentions the subject). Right card: the recommended
              move that closes it. Pairs read as one editorial beat. */}
          {(data.topic_coverage.some(_hasFiniteRecall) ||
            data.recommended_actions?.primary) && (
            <section id="gap" className="scroll-mt-28">
              {/* 3-up: Gap (warning) → Strongest asset (success) → Fix (primary).
                  The trio reads as one weakness ↔ strength ↔ action beat.
                  Strongest asset was relocated here from the Competitive
                  band so the Competitive band can be just chart + stats. */}
              {(() => {
                const strongestAsset = data.strategic_takeaways.find(
                  (item) => item.kind === "strongest_asset",
                );
                return (
                  <div className="grid md:grid-cols-3 gap-4">
                    {/* The gap */}
                    {data.topic_coverage.some(_hasFiniteRecall) && (
                      <Card className="p-6 border-border/60">
                        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-warning mb-3">
                          The gap · mention rate by topic
                        </div>
                        <TopicRecallInline topics={data.topic_coverage} />
                      </Card>
                    )}

                    {/* Strongest asset — success-toned to contrast the
                        warning-toned gap card on its left. Renders the
                        same title + body the takeaway carries; the
                        eyebrow ("STRONGEST ASSET") is forced to the
                        success color regardless of the takeaway's own
                        tone field so this card always reads as the
                        "what's working" beat in the trio. */}
                    {strongestAsset && (
                      <Card className="p-6 border-border/60">
                        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-success mb-3">
                          {strongestAsset.eyebrow}
                        </div>
                        <div className="text-[14px] font-medium text-foreground leading-snug">
                          {strongestAsset.title}
                        </div>
                        <p className="mt-1.5 text-[12.5px] text-foreground/70 leading-relaxed">
                          {strongestAsset.body}
                        </p>
                      </Card>
                    )}

                    {/* The fix. Primary-tinted card so it reads
                        as the actionable callout. */}
                    {data.recommended_actions?.primary && (
                      <Card className="p-6 border border-primary/30 bg-primary/[0.04]">
                        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-primary mb-3">
                          The fix · recommended move
                        </div>
                        <div className="text-[14px] font-medium text-foreground leading-snug">
                          {data.recommended_actions.primary.action}
                        </div>
                        {data.recommended_actions.secondary.length > 0 && (
                          <Link
                            href={`/subjects/${subjectId}/recommendations`}
                            className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:text-primary/80 transition-colors"
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
                    {/* Subtitle declares the top-N truncation so the
                        visible bar count and the "of N tracked entities"
                        denominator in the stat stack on the right
                        agree to the reader. Both numbers come from
                        data.competitive.length — no hardcoded totals. */}
                    <p className="mt-1 text-[11.5px] leading-snug text-foreground/55">
                      {data.competitive.length > 5
                        ? `Top 5 of ${data.competitive.length} tracked entities by share of voice.`
                        : "% of answers mentioning each tracked entity."}
                    </p>
                    <div className="mt-4 max-w-[640px]">
                      <CompetitorBarsFromData
                        data={pickTopWithSubject(data.competitive, 5).map((c) => ({
                          name: c.name,
                          sov: c.sov,
                          is_subject: c.is_subject,
                        }))}
                        height={280}
                      />
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
                    const sovFinite = sovSeries.filter(
                      (v): v is number => v !== null && Number.isFinite(v),
                    );
                    const latestSov =
                      sovFinite.length > 0 ? sovFinite[sovFinite.length - 1] : null;
                    const priorSov =
                      sovFinite.length >= 2 ? sovFinite[sovFinite.length - 2] : null;
                    const sovDeltaPp =
                      latestSov !== null && priorSov !== null
                        ? Math.round((latestSov - priorSov) * 100)
                        : null;
                    const trendCardEligible = sovFinite.length >= 2;
                    return (
                      <div className="lg:border-l lg:border-border/40 lg:pl-7 space-y-3.5">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/55">
                          Competitive position
                        </div>

                        {stats.rank !== null && (
                          <StatCard
                            label="Rank in peer set"
                            value={`#${stats.rank}`}
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

                        {stats.gapPp !== null && (
                          <StatCard
                            label="Gap to leader"
                            value={
                              stats.isLeader
                                ? stats.gapPp > 0
                                  ? `+${stats.gapPp} pts`
                                  : "Leads"
                                : `${stats.gapPp} pts`
                            }
                            valueTone={
                              stats.isLeader
                                ? "success"
                                : stats.gapPp < 0
                                  ? "warning"
                                  : "neutral"
                            }
                            sub={
                              stats.isLeader
                                ? stats.gapPp > 0 && stats.comparatorName
                                  ? `ahead of ${stats.comparatorName}`
                                  : "leads the field"
                                : stats.comparatorName
                                  ? `behind ${stats.comparatorName}`
                                  : null
                            }
                          />
                        )}

                        {trendCardEligible && (
                          <StatCard
                            label="Share-of-voice trend"
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
                            sub="vs last snapshot"
                          />
                        )}
                      </div>
                    );
                  })()}
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
                  />
                ))}
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
                {data.meta.n_platforms} platforms
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
