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
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  Info,
  ArrowRight,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { notFound } from "next/navigation";
import { Sidebar } from "@/components/dashboard/Sidebar";
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
  type KpiValue,
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
    | "citation_rate",
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

  if (others.length === 1) {
    const other = others[0];
    const otherPct = Math.round((other.ai_recall ?? 0) * 100);
    return `AI underweights ${subjectName} on ${weakest.label} — ${weakestPct}% mention rate vs ${otherPct}% on ${other.label}.`;
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
  return `AI underweights ${subjectName} on ${weakest.label} — ${weakestPct}% mention rate vs ${meanOthersPct}% average across ${comparator}.`;
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
    <div className="mt-6 pl-3.5 border-l-2 border-l-primary">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-primary">
        Bottom line
      </div>
      <div className="mt-0.5 text-[15px] font-semibold text-foreground leading-snug">
        {title}
      </div>
      {body && (
        <p className="mt-1.5 text-[13.5px] text-foreground/75 leading-relaxed">
          {body}
        </p>
      )}
    </div>
  );
}

function HeroKpis({
  kpis,
  topics,
}: {
  kpis: SubjectOverview["kpis"];
  // Per-topic mention rates from the same snapshot. Used to populate
  // the Weakest Topic Visibility tile (value + topic-name subtitle).
  // The full per-topic breakdown also renders below the hero in
  // TopicRecallChart — same source, two different surfacings.
  topics: SubjectOverview["topic_coverage"];
}) {
  const weakest = findWeakestTopic(topics);

  // Mirror of the backend's `min_recall_gap_pp` threshold (15pp). When
  // the weakest topic's recall isn't materially below the mean of the
  // other tracked topics, there's no actionable "gap" — pointing the
  // tile at a specific topic would mislead a reader into thinking that
  // topic is a weakness when really all topics are clustered together.
  // The tile keeps showing the value (the weakest IS still the weakest,
  // even if everything's at 100%), but the subtitle swaps to a neutral
  // signal so the reader doesn't chase a non-issue.
  const MIN_GAP_PP = 15;
  const withRecall = topics.filter(_hasFiniteRecall);
  const others = weakest
    ? withRecall.filter((t) => t !== weakest)
    : [];
  const hasMeaningfulGap = (() => {
    if (!weakest || !others.length) return false;
    const meanOthers =
      others.reduce((s, t) => s + (t.ai_recall ?? 0), 0) / others.length;
    const gapPP = (meanOthers - (weakest.ai_recall ?? 0)) * 100;
    return gapPP >= MIN_GAP_PP;
  })();

  const tiles: {
    // Plain-English title. Was previously the metric's official name
    // (e.g., "AI Mention Rate") with a parenthetical definition; now
    // the definition IS the title, since it's what a non-technical
    // reader needs to understand the card. The official metric name
    // is preserved in the tooltip's leading clause for technical
    // readers / consistency with internal naming.
    title: string;
    subtitle?: string | null;
    tooltip: string;
    value: string;
    valueColor: string;
    kpi: KpiValue;
    unit: string;
    goodDirection: "up" | "down";
  }[] = [
    {
      title: "Unprompted mentions",
      tooltip: "AI Mention Rate — share of AI answers that mention this subject. Measured only on questions about the subject's topic areas (listed below) — not questions that name the subject directly.",
      value: formatPct(kpis.ai_recall.value),
      valueColor: getKpiValueColor("mention_rate", kpis.ai_recall.value),
      kpi: kpis.ai_recall,
      unit: "pts",
      goodDirection: "up",
    },
    {
      title: "Positive vs negative",
      tooltip: "Average Tone — average tone of AI answers about this subject, expressed as a percentage above or below neutral. Range −100% (most negative) to +100% (most positive). 0% means perfectly neutral.",
      // Drop "positive"/"negative" word — title carries that context
      // and color/sign convey direction. Frees the value from
      // wrapping to a second line at this card width.
      value: formatTonePct(kpis.avg_sentiment.value, 0, false),
      valueColor: getKpiValueColor("avg_tone", kpis.avg_sentiment.value),
      kpi: kpis.avg_sentiment,
      unit: "pts",
      goodDirection: "up",
    },
    {
      title: "Weakest topic visibility",
      // Subtitle names the weakest topic when there's a meaningful gap
      // vs the other tracked topics; otherwise it signals that all
      // tracked topics are clustered together so a reader doesn't
      // misread the topic name as a weakness. Threshold mirrors the
      // backend's Message Gap rule (15pp).
      subtitle: weakest
        ? hasMeaningfulGap
          ? capitalizeFirst(weakest.label)
          : "No material gap across tracked topics"
        : null,
      tooltip: "Weakest Topic Recall — lowest topic-level mention rate in this snapshot. Same data feeds the Topic Recall chart below. The subtitle names the topic only when its recall is at least 15pp below the average of the other tracked topics.",
      value: formatPct(weakest?.ai_recall ?? null),
      valueColor: getKpiValueColor("weakest_topic_recall", weakest?.ai_recall ?? null),
      // Per-topic deltas aren't tracked in the current API (trajectory
      // carries overall rates, not per-topic ones). Surface "no prior"
      // until a backend change adds prev_ai_recall to topic_coverage.
      kpi: { value: weakest?.ai_recall ?? null, delta: null, trend: "flat" },
      unit: "pts",
      goodDirection: "up",
    },
    {
      title: "% citing own site",
      tooltip: "Citation Rate — share of AI answers that cite the subject's canonical website (e.g., campaign homepage or org domain). Tracks whether AI is sending readers to the subject's owned web property when answering questions about them. Subjects without a canonical URL configured will show 0%.",
      value: formatPct(kpis.citation_rate.value),
      valueColor: getKpiValueColor("citation_rate", kpis.citation_rate.value),
      kpi: kpis.citation_rate,
      unit: "pts",
      goodDirection: "up",
    },
  ];

  return (
    <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4">
      {tiles.map((t) => {
        const change = getKpiChangeDisplay(
          t.kpi.delta,
          t.kpi.trend,
          t.unit,
          t.goodDirection,
        );
        const ChangeIcon = change.icon;

        return (
          <div
            key={t.title}
            className="rounded-lg border border-border/60 bg-card p-5 min-h-[140px] flex flex-col"
          >
            {/* Top: title + tooltip. The plain-English title (e.g.
                "Unprompted mentions") replaces the prior label +
                parenthetical-definition pairing. The official metric
                name is preserved in the tooltip's leading clause. */}
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium text-foreground truncate">
                {t.title}
              </span>
              <KpiTooltipIcon text={t.tooltip} align="right" />
            </div>

            {/* Value + change + subtitle stack — each on its own line.
                Stacking (vs the prior horizontal value+change layout)
                keeps the value from wrapping at narrow card widths and
                gives the change indicator its own room. mt-auto floats
                this stack to the bottom of the card so the value
                baseline aligns across all four tiles. */}
            <div className="mt-auto pt-4 space-y-1.5">
              <div
                className={`text-2xl font-semibold tracking-tight leading-none ${t.valueColor}`}
              >
                {t.value}
              </div>
              <div
                className={`flex items-center gap-1 text-xs leading-none ${change.color}`}
              >
                <ChangeIcon className="h-3 w-3 shrink-0" />
                <span>{change.text}</span>
              </div>
              {/* Subtitle slot — reserved with min-h even when empty
                  so the bottom edge of every card sits at the same
                  vertical position regardless of whether this tile
                  carries a subtitle. Only the Weakest Topic Visibility
                  tile populates this today (with the weakest topic
                  name, or a "no material gap" signal when topics are
                  clustered); the others render an empty placeholder. */}
              <div
                className="text-[11px] text-muted-foreground truncate min-h-[14px]"
                title={t.subtitle ?? undefined}
              >
                {t.subtitle ?? ""}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Builds the KPI card's change-indicator content (text + color + icon)
// based on the delta value, the metric's trend direction, and which
// direction counts as "good" for this particular metric.
//
// Wording is full prose ("Up 10 pts from previous snapshot") rather
// than abbreviations ("+10 pts") so non-technical readers don't have
// to interpret the symbols. Tiny absolute deltas (< 0.5 pts) collapse
// to "Effectively unchanged" so noise doesn't get colored as
// improvement/worsening.
function getKpiChangeDisplay(
  delta: number | null,
  trend: "up" | "down" | "flat",
  unit: string,
  goodDirection: "up" | "down",
): { text: string; color: string; icon: typeof TrendingUp } {
  // No prior snapshot at all
  if (delta === null) {
    return {
      text: "no prior data",
      color: "text-muted-foreground",
      icon: Minus,
    };
  }

  // Tiny absolute deltas — treat as effectively unchanged so we don't
  // color them as good/bad signals or imply directional movement
  // that's really just noise.
  const abs = Math.abs(delta);
  const isEffectivelyZero = abs < 0.5;
  const effectiveTrend = trend === "flat" || isEffectivelyZero ? "flat" : trend;

  if (effectiveTrend === "flat") {
    return {
      text:
        delta === 0 || trend === "flat" ? "no change" : "≈ unchanged",
      color: "text-muted-foreground",
      icon: Minus,
    };
  }

  // Real movement — compact format ("10 pts vs prior") rather than
  // prose ("Down 10 pts from previous snapshot") so the indicator
  // fits on one line beside the value and doesn't crowd the card.
  // Direction is conveyed by the icon + color, not the words.
  const formatted = abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(1);
  const text = `${formatted} ${unit} vs prior`;
  const color =
    effectiveTrend === goodDirection ? "text-success" : "text-warning";
  const icon = effectiveTrend === "up" ? TrendingUp : TrendingDown;
  return { text, color, icon };
}

function DominantNarrativePanel({
  clusters,
}: {
  clusters: SubjectOverview["narrative_clusters"];
}) {
  if (clusters.length === 0) {
    return (
      <div className="lg:col-span-2 lg:border-l lg:border-border/50 lg:pl-12 lg:pt-20">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/50">
          Narrative mix
        </div>
        <p className="mt-3 text-[13px] text-foreground/55 leading-relaxed">
          No narrative clustering available for this snapshot yet. Run the
          cross-analyzer pass to populate this panel.
        </p>
      </div>
    );
  }
  // Heuristic semantic coloring: negative-framing cluster names get the
  // warning treatment so the panel reads as "this is a risk frame", not
  // "this is just another bucket". Falls back to position-based opacity
  // for clusters without obvious framing.
  const isNegative = (name: string) =>
    /polarizing|adversarial|criticism|controversy|risk|scandal/i.test(name);

  return (
    <div className="lg:col-span-2 lg:border-l lg:border-border/50 lg:pl-12">
      {/* Renamed from "Dominant narrative" → "Narrative mix" + the
          eyebrow is one notch smaller / lighter than the left-column
          eyebrows so this panel reads as supporting context rather
          than a competing focal point against the AI Narrative Brief.
          The previous H2 that displayed {top.name} above the bars
          was removed earlier — the same name appears as the first
          bar at the same percentage, producing a literal duplication. */}
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/50">
        Narrative mix
      </div>

      <ul className="mt-6 space-y-5">
        {clusters.slice(0, 4).map((c, i) => {
          // Bar width = absolute share (0..1 → 0..100%). The remaining
          // track visually represents the share not covered by named
          // clusters, which is intentional — clusters aren't required
          // to sum to 100%.
          const barWidth = c.share * 100;
          const negative = isNegative(c.name);
          // Lowered opacity ramp (was 1.0 / 0.75 / 0.55 / 0.45) so even
          // the top bar reads as muted-blue rather than full primary —
          // keeps the panel in a supporting-data register, not
          // competing with the brief's primary-tinted eyebrows. Warning
          // negatives still pop because they need to flag a risk frame.
          const opacity =
            i === 0 ? 0.6 : i === 1 ? 0.45 : i === 2 ? 0.3 : 0.2;
          return (
            <li key={c.name} title={c.description}>
              <div className="flex items-center justify-between text-[12.5px] mb-1">
                <span className="text-foreground/65">
                  {c.name}
                </span>
                <span className="text-foreground/55 tabular-nums text-[11.5px]">
                  {Math.round(c.share * 100)}%
                </span>
              </div>
              <div className="relative h-1 w-full rounded-full bg-muted/80 overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${barWidth}%`,
                    background: negative ? "var(--warning)" : "var(--primary)",
                    opacity: negative ? 0.75 : opacity,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Per-topic mention rate as a horizontal bar list. Sorts strongest →
// weakest; the lowest bar gets the warning accent so the gap reads as
// the actionable signal — UNLESS there's no real gap (single topic,
// or all topics tied at the same rate), in which case no bar gets the
// warning treatment. Topics whose ai_recall is null (no scored
// responses yet) drop out entirely rather than render as 0% — would
// be misleading.
function TopicRecallChart({
  topics,
}: {
  topics: SubjectOverview["topic_coverage"];
}) {
  const sorted = topics
    .filter(_hasFiniteRecall)
    .slice()
    .sort((a, b) => (b.ai_recall ?? 0) - (a.ai_recall ?? 0));
  if (sorted.length === 0) return null;
  // Use findWeakestTopic so the chart highlights the same topic as
  // the Hero's Weakest Topic Recall tile subtitle on ties (first-wins).
  // Prior implementation used sorted[length-1] which is last-wins —
  // user-visible inconsistency on tied snapshots.
  const weakestTopic = findWeakestTopic(sorted);
  // Only mark a bar as "weakest" when a real gap exists — skip the
  // warning treatment entirely for single-topic snapshots or when
  // every topic ties at the same rate. Float tolerance for the tie
  // check (DB aggregation can produce micro-differences).
  const TIE_EPSILON = 0.001;
  const hasRealGap =
    sorted.length > 1 &&
    !sorted.every(
      (t) =>
        Math.abs((t.ai_recall ?? 0) - (sorted[0].ai_recall ?? 0)) <
        TIE_EPSILON,
    );
  return (
    <section>
      <SectionTitle
        eyebrow="Topic Recall"
        title="Mention rate by topic in this snapshot"
        description="Per-topic share of AI answers that mention this subject — sorted from strongest to weakest. The lowest bar is the largest visibility gap."
        className="mb-4"
      />
      <Card className="p-5 md:p-6">
        <div className="space-y-4">
          {sorted.map((t) => {
            const pct = Math.round((t.ai_recall ?? 0) * 100);
            const isWeakest = hasRealGap && t === weakestTopic;
            return (
              <div
                key={t.label}
                className="grid grid-cols-[1fr_56px] items-center gap-x-4"
              >
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <span
                      className="text-sm font-medium text-foreground/85 truncate"
                      title={`${t.n_responses} prompt response${t.n_responses === 1 ? "" : "s"} for this topic`}
                    >
                      {capitalizeFirst(t.label)}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isWeakest ? "bg-warning/70" : "bg-primary/70"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <span className="text-sm font-semibold text-foreground tabular-nums text-right">
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </section>
  );
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
    colorKind: "mention_rate" | "avg_tone" | "citation_rate";
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
      tooltip: "Average tone of AI answers about this subject across each weekly snapshot. Range −100% (most negative) to +100% (most positive); 0% is neutral. Sustained shifts here reflect changes in how AI characterizes the subject — favorable or critical.",
      colorKind: "avg_tone",
    },
    {
      title: "Citation Rate",
      values: trajectory.citation_rate,
      format: (v) => formatPct(v, 0),
      tooltip: "Share of AI answers that cite the subject's canonical website (e.g., campaign homepage or org domain), plotted across each weekly snapshot. Higher is better. Subjects without a canonical URL configured will show 0% throughout.",
      colorKind: "citation_rate",
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
          <Card key={m.title} className="p-5">
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
            <div className="mt-3 pt-3 border-t border-border text-xs text-foreground/70 leading-relaxed">
              {notMeasured ? (
                <>This metric isn&apos;t measured for this subject.</>
              ) : (
                <>
                  {trajectory.weeks.length} weekly snapshot{trajectory.weeks.length === 1 ? "" : "s"};
                  most recent is {formatRefreshKind(trajectory.is_historical[trajectory.is_historical.length - 1] ?? false)}.
                </>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function formatRefreshKind(isHistorical: boolean): string {
  return isHistorical ? "an estimated retrospective" : "a live snapshot";
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
    return (
      <div className="h-[120px] flex items-center justify-center text-[11px] text-muted-foreground">
        Need more snapshots for a trend line
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
  return (
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
  );
}

// Map quote-type to a Pill tone. Criticism/praise carry direction;
// the rest are neutral analytical categorizations.
const TYPE_TONE: Record<string, "warning" | "success" | "primary" | "gold" | "neutral"> = {
  criticism: "warning",
  praise: "success",
  narrative_frame: "primary",
  model_difference: "gold",
  characterization: "neutral",
  factual_claim: "neutral",
};

const TYPE_LABEL: Record<string, string> = {
  criticism: "Criticism",
  praise: "Praise",
  narrative_frame: "Narrative frame",
  model_difference: "Model difference",
  characterization: "Characterization",
  factual_claim: "Factual claim",
};

const MODEL_DISPLAY: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  claude: "Claude",
  perplexity: "Perplexity",
};

function EvidenceCard({ card }: { card: SubjectOverview["evidence_cards"][number] }) {
  // Unnamed-layer cards show the Mentioned/Not-mentioned pill;
  // named-layer cards show the quote type pill instead (mention status
  // is meaningless when the subject is in the prompt itself).
  const pillNode =
    card.mention_status !== null ? (
      card.mention_status.mentioned ? (
        <Pill tone="success">
          Mentioned · #{card.mention_status.rank ?? "?"}
        </Pill>
      ) : (
        <Pill tone="destructive">Not mentioned</Pill>
      )
    ) : (
      <Pill tone={TYPE_TONE[card.type] || "neutral"}>
        {TYPE_LABEL[card.type] || card.type}
      </Pill>
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
  const frameLabel = frameAbsent
    ? "Absent from answer"
    : (card.frame_label || "—");

  return (
    <Card className="flex min-h-[160px] flex-col justify-between p-4">
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

      {/* Bottom: frame label. Pushed to card bottom by parent
          justify-between so all "Frame:" rows align across cards. */}
      <div className="mt-4 pt-3 border-t border-border/60 text-xs font-medium text-foreground/70">
        Frame:{" "}
        <span className={frameAbsent ? "text-warning font-semibold" : "text-foreground font-semibold"}>
          {frameLabel}
        </span>
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
        <div className="col-span-3 text-right">Influence</div>
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
          <main className="flex-1 px-4 md:px-12 py-6 space-y-8 max-w-[1500px] w-full mx-auto">
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

        <main className="flex-1 px-4 md:px-12 py-6 space-y-8 max-w-[1500px] w-full mx-auto">
          {/* HERO */}
          <section>
            <Card className="relative overflow-hidden p-6 md:p-8 border-border/60">
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(135deg, color-mix(in oklab, var(--primary) 5%, transparent) 0%, color-mix(in oklab, var(--primary) 1.5%, transparent) 35%, transparent 70%)",
                }}
              />

              <div className="relative grid lg:grid-cols-5 gap-8 lg:gap-12">
                {/* LEFT: title + callouts. KPIs live below the grid
                    as a full-width strip so the two columns can end
                    at similar heights. */}
                <div className="lg:col-span-3 flex flex-col">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/55 mb-2">
                    AI Narrative Brief
                  </div>
                  <h1 className="font-display text-[28px] md:text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground">
                    {data.subject_name}
                  </h1>
                  {/* Generic subtitle paragraph removed — "How major
                      AI platforms describe X across voter-facing and
                      public-affairs prompts" was boilerplate that
                      didn't earn its line. The Bottom Line below is
                      the actual headline; surfacing it sooner makes
                      the hero punchier. */}

                  {/* Bottom Line — diagnostic finding. Visually
                      parallels the Strongest Asset takeaway below
                      (same eyebrow weight, left-border accent, bold
                      title + regular body) so the two read as a
                      coherent pair instead of competing treatments.
                      Slightly larger type than Strongest Asset since
                      this is the lead claim. */}
                  {effectiveBottomLine && (
                    <BottomLineBlock text={effectiveBottomLine} />
                  )}

                  {/* Strategic-takeaway callouts inline with the hero
                      brief. Surfaces the genuinely-new signals
                      (strongest_asset = what's working, opposition_frame
                      = critical framing AI volunteers) without the
                      standalone "Strategic Takeaways" section that used
                      to live below Topic Recall. `message_gap` is
                      filtered out because the Bottom Line above already
                      surfaces the gap — keeping both was the
                      redundancy. Compact treatment: left-border accent
                      + small uppercase eyebrow + body sentence, no
                      card containers. */}
                  {data.strategic_takeaways
                    .filter((item) => item.kind !== "message_gap")
                    .map((item) => {
                      const accent =
                        item.tone === "warning" ? "border-l-warning"
                        : item.tone === "primary" ? "border-l-primary"
                        : "border-l-foreground/30";
                      const eyebrowColor =
                        item.tone === "warning" ? "text-warning"
                        : item.tone === "primary" ? "text-primary"
                        : "text-foreground/55";
                      return (
                        <div
                          key={item.kind}
                          className={`mt-4 pl-3.5 border-l-2 ${accent}`}
                        >
                          <div
                            className={`text-[10.5px] font-semibold uppercase tracking-[0.06em] ${eyebrowColor}`}
                          >
                            {item.eyebrow}
                          </div>
                          <div className="mt-0.5 text-[13.5px] font-semibold text-foreground leading-snug">
                            {item.title}
                          </div>
                          <p className="mt-1 text-[13px] text-foreground/70 leading-relaxed">
                            {item.body}
                          </p>
                        </div>
                      );
                    })}

                  {/* Recommended Move — completes the briefing triad
                      (Bottom Line = what / Strongest Asset = where
                      you're strong / Recommended Move = what to do).
                      Uses the same editorial chrome as the other two
                      takeaways (eyebrow + bold title + regular body +
                      left-border accent). Full action set + Regenerate
                      controls live on the /recommendations spoke; this
                      block surfaces just the primary action with a
                      "View all" handoff when alternatives exist. */}
                  {data.recommended_actions?.primary && (
                    <div className="mt-5 pl-3.5 border-l-2 border-l-primary">
                      <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-primary">
                        Recommended move
                      </div>
                      {/* Hero shows just the imperative action — the
                          "why" rationale is preserved on the
                          /recommendations spoke alongside the
                          secondary alternatives, so the briefing
                          stays scannable. */}
                      <div className="mt-0.5 text-[14px] font-semibold text-foreground leading-snug">
                        {data.recommended_actions.primary.action}
                      </div>
                      {data.recommended_actions.secondary.length > 0 && (
                        <Link
                          href={`/subjects/${subjectId}/recommendations`}
                          className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:text-primary/80 transition-colors"
                        >
                          View all recommendations
                          <ArrowRight className="h-3 w-3" aria-hidden />
                        </Link>
                      )}
                    </div>
                  )}

                  {/* Fallback when no Bottom Line could be synthesized */}
                  {!effectiveBottomLine && (
                    <div className="mt-6 rounded-md border border-dashed border-border/70 bg-muted/30 px-5 py-4">
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

                </div>

                {/* RIGHT: Dominant narrative — ranked clusters */}
                <DominantNarrativePanel
                  clusters={data.narrative_clusters}
                />
              </div>
              {/* KPI strip: Unprompted mentions · Positive vs negative ·
                  Weakest topic visibility · % citing own site. Risk
                  Frame / Unprompted Criticism Rate was promoted out
                  of the hero in favor of the gap metric — it lives in
                  TopicRecallChart's data feed. Passing topic_coverage
                  so the Weakest Topic Visibility tile can show the
                  weakest topic name as a subtitle. */}
              <HeroKpis kpis={data.kpis} topics={data.topic_coverage} />
            </Card>
          </section>

          {/* TOPIC RECALL — horizontal bar chart that surfaces the
              per-topic mention rate distribution. Sits directly under
              the hero card so the headline "weakest topic" tile is
              immediately followed by the full ranking. The
              audit-style topics table in Analysis Scope below
              remains unchanged. */}
          <TopicRecallChart topics={data.topic_coverage} />

          {/* EVIDENCE — Phase 3c wiring */}
          {data.evidence_cards.length > 0 && (
            <section>
              <SectionTitle
                eyebrow="Evidence"
                title="What AI is actually saying"
                description="Verbatim quotes selected by the top-quotes cross-analyzer from the latest snapshot. Each card shows the originating prompt, the AI's exact words, and the narrative cluster it falls under."
              />
              <div className="grid md:grid-cols-3 gap-4">
                {data.evidence_cards.slice(0, 3).map((card, i) => (
                  <EvidenceCard
                    key={`${card.model_response_id}-${i}`}
                    card={card}
                  />
                ))}
              </div>
            </section>
          )}

          {/* COMPETITIVE SNAPSHOT — Phase 4 wiring */}
          {data.competitive.length > 0 && (
            <Card className="p-6">
              <SectionTitle
                eyebrow="Competitive Snapshot"
                title={`How ${data.subject_name} compares to peers`}
                description={`Share of voice and visibility against the top entities AI surfaces when asked about ${data.subject_name}'s topic areas. Pulled from unnamed-layer responses in this snapshot.`}
                right={<Pill tone="primary">{data.competitive.length} entities tracked</Pill>}
              />
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-foreground/65 mb-3">
                    Share of Voice (% of answers)
                  </div>
                  <CompetitorBarsFromData
                    data={data.competitive.map((c) => ({
                      name: c.name,
                      sov: Math.round(c.sov * 100),
                      is_subject: c.is_subject,
                    }))}
                  />
                </div>
                <div>
                  {/* No overflow-x-auto — table now fits cleanly with
                      tightened padding. Long entity names truncate
                      gracefully via min-w-0 + truncate on the entity
                      cell rather than triggering a horizontal scroll. */}
                  <table className="w-full text-sm table-fixed">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider text-foreground/65 border-b border-border">
                        <th className="px-2 py-2 font-medium">Entity</th>
                        <th className="px-2 py-2 font-medium text-right w-16">
                          <span className="inline-flex items-center justify-end gap-1">
                            Share
                            <KpiTooltipIcon text="Share of voice — the percentage of relevant AI responses where this entity is mentioned at all. Higher means the entity is consistently surfaced when AI answers questions about this subject's topic areas." />
                          </span>
                        </th>
                        <th className="px-2 py-2 font-medium text-right w-20">
                          <span className="inline-flex items-center justify-end gap-1">
                            Avg Pos
                            <KpiTooltipIcon text="Average position when mentioned (1 = first entity named, 2 = second, etc.). Lower numbers mean AI tends to mention this entity earlier in its responses — a sign of prominence." />
                          </span>
                        </th>
                        <th className="px-2 py-2 font-medium text-right w-24">
                          <span className="inline-flex items-center justify-end gap-1">
                            First Mention
                            <KpiTooltipIcon
                              text="Share of responses where this entity is the first one named. A top-of-mind signal — high values mean AI consistently leads with this entity when discussing the subject's topic areas."
                              align="right"
                            />
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.competitive.map((c) => (
                        <tr
                          key={c.name}
                          className={`border-b border-border/60 ${
                            c.is_subject ? "bg-primary/5" : "hover:bg-accent/40"
                          } transition-colors`}
                        >
                          <td className="px-2 py-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`truncate ${c.is_subject ? "font-semibold" : "font-medium"}`}>
                                {c.name}
                              </span>
                              {c.is_subject && <Pill tone="primary">You</Pill>}
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-right font-mono">
                            {Math.round(c.sov * 100)}%
                          </td>
                          <td className="px-2 py-2.5 text-right font-mono">
                            {c.avg_rank !== null ? c.avg_rank.toFixed(1) : "—"}
                          </td>
                          <td className="px-2 py-2.5 text-right font-mono">
                            {Math.round(c.first_mention_rate * 100)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          )}

          {/* VISIBILITY TRENDS — only render when there are at least
              2 snapshots in history. With 0 or 1 snapshots there's no
              line to draw, and a "trend will appear after the next
              snapshot" placeholder reads as filler in an executive
              briefing. The Snapshot History section below already
              communicates how many snapshots exist, so a missing
              Trends section here doesn't leave the user wondering.
              Positioned after Competitive Snapshot so the page
              narrative goes "what's happening now (Brief + Takeaways)
              → who/what's being mentioned (Coverage + Evidence +
              Competitive) → trajectory over time (Trends)". */}
          {data.trajectory.weeks.length >= 2 && (
            <section>
              <SectionTitle
                eyebrow="Visibility Trends"
                title="How visibility has shifted"
                description={
                  data.trajectory.weeks.length === 2
                    ? "Early trend — based on 2 snapshots. Open circles are retrospective estimates; filled circles are live snapshots."
                    : `Movement across the headline metrics over the last ${data.trajectory.weeks.length} weekly snapshots. Open circles are retrospective estimates; filled circles are live snapshots.`
                }
              />
              <TrajectoryStrip trajectory={data.trajectory} />
            </section>
          )}

          {/* SOURCES — wired */}
          <Card className="p-6">
            <SectionTitle
              eyebrow="Sources"
              title="Sources shaping AI answers"
              description={`The publications and pages most often cited or paraphrased in AI responses about ${data.subject_name}.`}
            />
            <div className="grid lg:grid-cols-3 gap-8 items-start">
              <div className="lg:col-span-2">
                <SourcesList sources={data.sources} />
              </div>
              <SourcesTypeMix sources={data.sources} />
            </div>
          </Card>

          {/* REFRESH HISTORY — operator/audit context, behind a disclosure
              so it doesn't clutter the executive view */}
          {subject.refreshes.length > 0 && (
            <details className="group rounded-md border border-border/60 bg-card">
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center justify-between px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-foreground/65 hover:text-foreground transition-colors">
                <span>
                  Snapshot history
                  <span className="ml-2 text-muted-foreground font-normal normal-case tracking-normal">
                    ({subject.refreshes.length} run{subject.refreshes.length === 1 ? "" : "s"})
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-[color,transform] group-open:rotate-90" />
              </summary>
              <div className="px-5 pb-5">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wider text-foreground/65 border-b border-border">
                        <th className="px-3 py-2 font-medium">ID</th>
                        <th className="px-3 py-2 font-medium">Started</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium text-right">Responses</th>
                        <th className="px-3 py-2 font-medium text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subject.refreshes.map((r) => (
                        <tr
                          key={r.id}
                          className="border-b border-border/30 last:border-b-0 hover:bg-accent/40 transition-colors"
                        >
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                            {r.id}
                          </td>
                          <td className="px-3 py-2 text-foreground/80">
                            {new Date(r.started_at).toLocaleString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "UTC",
                            })}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={
                                r.status === "completed"
                                  ? "text-success"
                                  : r.status === "partial"
                                  ? "text-warning"
                                  : "text-muted-foreground"
                              }
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-foreground/65 tabular-nums">
                            {r.n_ok}/{r.n_responses}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                            ${Number(r.cost_usd).toFixed(4)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          )}

          <footer className="pt-6 pb-8 border-t border-border/40">
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
