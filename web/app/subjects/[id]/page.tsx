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
  AlertOctagon,
  Compass,
  Megaphone,
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

export const dynamic = "force-dynamic";

const MODEL_COLORS: Record<string, string> = {
  ChatGPT: "var(--success)",
  Gemini: "var(--primary)",
  Claude: "var(--gold)",
  Perplexity: "var(--chart-5)",
};

// All platforms we want represented in the recall panel — even ones
// without data for this refresh. Keeps the visual stable as we onboard
// new providers (a platform that ran last month but not this week
// shouldn't silently disappear from the panel).
const CANONICAL_PLATFORMS: string[] = [
  "ChatGPT",
  "Gemini",
  "Claude",
  "Perplexity",
];

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
// Category-aware short reference for very long subject names.
// Subject names over ~40 chars (event/policy/issue descriptors like
// "the November 2023 firing of Sam Altman by the OpenAI board") cause
// subtitle lines to balloon to 3+ wraps in narrow columns. For those
// cases we substitute a short category noun ("this event" / "this
// policy" / "this issue") in mid-sentence references; the full name
// still appears in the hero title and body copy where width allows.
function formatSubjectInline(name: string, category: string): string {
  if (name.length <= 40) return name;
  const shortForms: Record<string, string> = {
    event: "this event",
    policy: "this policy",
    issue: "this issue",
    organization: "this organization",
    person: name, // person names are rarely this long; fall back to full
  };
  return shortForms[category] ?? name;
}

// Self-contained subtitle for AI Mention Rate that names both the
// denominator (topic-area responses) and the numerator (responses
// that mention the subject) inline, so a reader gets the metric
// definition without needing the tooltip. Returns null when there
// are no tracked topics — UI hides the line in that case.
function formatTopicScope(
  topics: SubjectOverview["topic_coverage"],
  subjectName: string,
  category: string,
): string | null {
  if (!topics.length) return null;
  const labels = topics.map((t) => t.label);
  let topicPhrase: string;
  if (labels.length === 1) {
    topicPhrase = labels[0];
  } else if (labels.length === 2) {
    topicPhrase = `${labels[0]} and ${labels[1]}`;
  } else if (labels.length === 3) {
    topicPhrase = `${labels[0]}, ${labels[1]}, and ${labels[2]}`;
  } else {
    // 4+: name two, summarize the rest so the line doesn't sprawl
    topicPhrase = `${labels[0]}, ${labels[1]}, and ${labels.length - 2} more`;
  }
  const subjectRef = formatSubjectInline(subjectName, category);
  return `percent of AI responses about ${topicPhrase} that mention ${subjectRef}`;
}

// Tone value formatter — appends "positive"/"negative"/"neutral" so a
// reader doesn't have to interpret what the sign means.
// 0.20 → "+20% positive", -0.30 → "−30% negative", 0 → "Neutral".
function formatTonePct(v: number | null, digits = 0): string {
  if (v === null) return "—";
  const pct = v * 100;
  if (Math.abs(pct) < 0.5) return "Neutral";
  const sign = pct > 0 ? "+" : "−";
  const direction = pct > 0 ? "positive" : "negative";
  return `${sign}${Math.abs(pct).toFixed(digits)}% ${direction}`;
}
function formatDelta(d: number | null, unit: string): string {
  if (d === null) return "—";
  const sign = d > 0 ? "+" : d < 0 ? "−" : "";
  return `${sign}${Math.abs(d).toFixed(unit === "pts" ? 1 : 2)} ${unit}`;
}

function TrendBadge({
  trend,
  delta,
  unit,
  goodDirection,
}: {
  trend: "up" | "down" | "flat";
  delta: number | null;
  unit: string;
  // Which direction of movement represents improvement for this
  // metric. AI Mention Rate / Sentiment improve when up; Risk Frame
  // Rate improves when down. Color reflects whether the delta is in
  // the "good" direction for the underlying metric — green for good,
  // warning for bad, muted for flat.
  goodDirection: "up" | "down";
}) {
  if (delta === null) {
    return <span className="text-[11px] text-foreground/40">no prior</span>;
  }
  const Icon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  let color: string;
  if (trend === "flat") {
    color = "text-muted-foreground";
  } else if (trend === goodDirection) {
    color = "text-success";
  } else {
    color = "text-warning";
  }
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
      <Icon className="h-3 w-3" />
      {formatDelta(delta, unit)}
    </span>
  );
}

function KpiTooltipIcon({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <Info className="h-3 w-3 opacity-50 hover:opacity-100 transition-opacity cursor-help" />
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 rounded-md border border-border bg-popover px-3 py-2 text-[11px] leading-snug text-popover-foreground opacity-0 group-hover:opacity-100 transition-opacity z-30 shadow-lg">
        {text}
      </span>
    </span>
  );
}

// ── Wired sections ──────────────────────────────────────────────────

function HeroKpis({
  kpis,
  topicScope,
}: {
  kpis: SubjectOverview["kpis"];
  // Plain-English phrase listing the subject's tracked topic areas
  // (e.g., "of queries about progressive politicians in the US Senate
  // and corporate influence in American politics"). Surfaced as a
  // subtitle under metrics scoped to unnamed-layer queries so the
  // reader knows exactly what topic set the denominator includes.
  topicScope?: string | null;
}) {
  const tiles: {
    label: string;
    subtitle?: string | null;
    tooltip: string;
    value: string;
    risk?: boolean;
    kpi: KpiValue;
    unit: string;
    goodDirection: "up" | "down";
  }[] = [
    {
      label: "AI Mention Rate",
      subtitle: topicScope,
      tooltip: "Share of AI answers that mention this subject. Measured only on questions about the subject's topic areas (listed below) — not questions that name the subject directly.",
      value: formatPct(kpis.ai_recall.value),
      kpi: kpis.ai_recall,
      unit: "pts",
      goodDirection: "up",
    },
    {
      label: "Average Tone",
      tooltip: "Average tone of AI answers about this subject, expressed as a percentage above or below neutral. Range −100% (most negative) to +100% (most positive). 0% means perfectly neutral.",
      value: formatTonePct(kpis.avg_sentiment.value, 0),
      kpi: kpis.avg_sentiment,
      unit: "pts",
      goodDirection: "up",
    },
    {
      label: "Risk Frame Rate",
      tooltip: "Share of AI answers that volunteer a critical framing of the subject (criticism severity > 0.5). Measured only on questions about the subject's topic areas — not questions that ask about controversies or criticisms directly, since those would mechanically inflate the rate.",
      value: formatPct(kpis.risk_frame_rate.value),
      risk: true,
      kpi: kpis.risk_frame_rate,
      unit: "pts",
      goodDirection: "down",
    },
  ];

  return (
    <div className="mt-8 grid grid-cols-3 gap-3">
      {tiles.map((t) => {
        const delta = t.kpi.delta;
        const trend = t.kpi.trend;
        const Icon =
          trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

        // Color logic: muted for neutral/no-data, green for improvement
        // in this metric's good direction, amber/warning for the
        // opposite direction. Restrained colors only.
        let changeColor: string;
        if (delta === null) changeColor = "text-muted-foreground";
        else if (trend === "flat") changeColor = "text-muted-foreground";
        else if (trend === t.goodDirection) changeColor = "text-success";
        else changeColor = "text-warning";

        return (
          <div
            key={t.label}
            className="rounded-lg border border-border/60 bg-card p-4 min-h-[92px] flex flex-col"
          >
            {/* Top: label + tooltip */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground truncate">
                {t.label}
              </span>
              <KpiTooltipIcon text={t.tooltip} />
            </div>

            {/* Middle: large KPI value */}
            <div
              className={`mt-2 text-2xl font-semibold tracking-tight leading-none ${
                t.risk ? "text-warning" : "text-foreground"
              }`}
            >
              {t.value}
            </div>

            {/* Bottom: change indicator. Pushed to bottom with mt-auto
                so cards with varying value-line heights still align
                their change rows. */}
            <div className={`mt-auto pt-3 inline-flex items-center gap-1 text-xs ${changeColor}`}>
              {delta === null ? (
                <span>No prior comparison</span>
              ) : trend === "flat" ? (
                <>
                  <Icon className="h-3 w-3" />
                  <span>Unchanged</span>
                </>
              ) : (
                <>
                  <Icon className="h-3 w-3" />
                  <span>{formatDelta(delta, t.unit)}</span>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DominantNarrativePanel({
  clusters,
  subjectName,
  category,
}: {
  clusters: SubjectOverview["narrative_clusters"];
  subjectName: string;
  // Subject category — used to swap in a short reference ("this event"
  // / "this policy") when subject_name is too long to fit in the
  // narrow right-column subtitle without 3-line wrapping.
  category: string;
}) {
  if (clusters.length === 0) {
    return (
      <div className="lg:col-span-2 lg:border-l lg:border-border/50 lg:pl-12">
        <div className="text-[12px] font-semibold text-foreground/70">
          Dominant narrative
        </div>
        <p className="mt-3 text-[13px] text-foreground/55 leading-relaxed">
          No narrative clustering available for this snapshot yet. Run the
          cross-analyzer pass to populate this panel.
        </p>
      </div>
    );
  }
  const top = clusters[0];
  const topShare = top.share || 0;
  // Heuristic semantic coloring: negative-framing cluster names get the
  // warning treatment so the panel reads as "this is a risk frame", not
  // "this is just another bucket". Falls back to position-based opacity
  // for clusters without obvious framing.
  const isNegative = (name: string) =>
    /polarizing|adversarial|criticism|controversy|risk|scandal/i.test(name);

  return (
    <div className="lg:col-span-2 lg:border-l lg:border-border/50 lg:pl-12">
      <div className="text-[12px] font-semibold text-foreground/70">
        Dominant narrative
      </div>

      <div className="mt-2 font-display text-[24px] leading-tight font-semibold tracking-[-0.02em] text-foreground">
        {top.name}
      </div>
      <div className="mt-1.5 text-[13px] text-foreground/70 leading-snug">
        Frames{" "}
        <span className="text-foreground font-semibold">
          {Math.round(topShare * 100)}%
        </span>{" "}
        of AI responses to this snapshot's questions about{" "}
        {formatSubjectInline(subjectName, category)} and related topic areas.
      </div>

      <ul className="mt-12 space-y-8">
        {clusters.map((c, i) => {
          // Bar width = absolute share (0..1 → 0..100%). The remaining
          // track visually represents the share not covered by named
          // clusters, which is intentional — clusters aren't required
          // to sum to 100%.
          const barWidth = c.share * 100;
          const negative = isNegative(c.name);
          // Position-based opacity for non-negative clusters; warning
          // color overrides for negative ones regardless of position
          const opacity =
            i === 0 ? 1 : i === 1 ? 0.75 : i === 2 ? 0.55 : 0.45;
          return (
            <li key={c.name} title={c.description}>
              <div className="flex items-center justify-between text-[13px] mb-1.5">
                <span className="text-foreground/85 font-medium">
                  {c.name}
                </span>
                <span className="text-foreground/70 tabular-nums text-[12px]">
                  {Math.round(c.share * 100)}%
                </span>
              </div>
              <div className="relative h-1.5 w-full rounded-full bg-muted/80 overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${barWidth}%`,
                    background: negative ? "var(--warning)" : "var(--primary)",
                    opacity: negative ? 0.85 : opacity,
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

// Placeholder used for canonical platforms that didn't return data on
// this refresh. Visually rendered as N/A in both tile and list layouts.
type PlatformRow = SubjectOverview["platform_recall"][number];
function emptyPlatformRow(name: string): PlatformRow {
  return {
    name,
    value: null,
    delta: null,
    trend: "flat",
    n_responses: 0,
  };
}

function PlatformRecallStrip({ platforms }: { platforms: SubjectOverview["platform_recall"] }) {
  // Merge the live data with the canonical list so missing platforms
  // surface as N/A rather than vanishing. Preserve canonical order;
  // append any non-canonical platforms the API returned at the end.
  const byName = new Map(platforms.map((p) => [p.name, p]));
  const merged: PlatformRow[] = [
    ...CANONICAL_PLATFORMS.map((name) => byName.get(name) ?? emptyPlatformRow(name)),
    ...platforms.filter((p) => !CANONICAL_PLATFORMS.includes(p.name)),
  ];
  if (!merged.length) return null;

  // Above this count the tile grid wraps awkwardly inside the narrow
  // right column, so we switch to a single-column list layout that
  // scales linearly to any N.
  const useList = merged.length >= 5;

  return (
    <div aria-label="Per-platform recall breakdown" className="relative block">
      {useList ? (
        <ul className="divide-y divide-border/40 border border-border/60 rounded-md bg-card">
          {merged.map((p) => {
            const noData = p.value === null;
            return (
              <li
                key={p.name}
                title={
                  noData
                    ? `No data available for ${p.name} in this period.`
                    : `${formatPct(p.value, 0)} of relevant prompts on ${p.name}. Based on ${p.n_responses} responses.`
                }
                className={`flex items-center justify-between gap-3 px-3 py-2 ${
                  p.lowest ? "bg-warning/[0.04]" : ""
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: noData
                        ? "var(--muted-foreground)"
                        : MODEL_COLORS[p.name] || "var(--muted-foreground)",
                      opacity: noData ? 0.4 : 1,
                    }}
                  />
                  <span
                    className={`text-[12px] font-medium truncate ${
                      noData ? "text-foreground/45" : "text-foreground/85"
                    }`}
                  >
                    {p.name}
                  </span>
                </div>
                <div className="flex items-baseline gap-2 shrink-0">
                  <span
                    className={`font-display text-[14px] font-semibold tabular-nums tracking-[-0.01em] ${
                      noData ? "text-foreground/40" : "text-foreground"
                    }`}
                  >
                    {noData ? "N/A" : formatPct(p.value, 0)}
                  </span>
                  {!noData && (
                    <TrendBadge
                      trend={p.trend}
                      delta={p.delta}
                      unit="pts"
                      goodDirection="up"
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${merged.length}, minmax(0, 1fr))` }}
        >
          {merged.map((p) => {
            const noData = p.value === null;
            return (
              <div
                key={p.name}
                title={
                  noData
                    ? `No data available for ${p.name} in this period.`
                    : `${formatPct(p.value, 0)} of relevant prompts on ${p.name} where the subject is mentioned. Based on ${p.n_responses} responses.`
                }
                className={`relative min-w-0 rounded-md border px-2 py-2 ${
                  noData
                    ? "border-border/50 bg-card/50"
                    : p.lowest
                    ? "border-warning/30 bg-warning/[0.04]"
                    : "border-border bg-card"
                }`}
              >
                {p.lowest && !noData && (
                  <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-warning" />
                )}
                <div className="flex items-center gap-1 mb-0.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: noData
                        ? "var(--muted-foreground)"
                        : MODEL_COLORS[p.name] || "var(--muted-foreground)",
                      opacity: noData ? 0.4 : 1,
                    }}
                  />
                  <span
                    className={`text-[10px] font-medium truncate ${
                      noData ? "text-foreground/45" : "text-foreground/70"
                    }`}
                  >
                    {p.name}
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span
                    className={`font-display text-[15px] font-semibold tabular-nums tracking-[-0.015em] ${
                      noData ? "text-foreground/40" : "text-foreground"
                    }`}
                  >
                    {noData ? "N/A" : formatPct(p.value, 0)}
                  </span>
                  {!noData && (
                    <TrendBadge
                      trend={p.trend}
                      delta={p.delta}
                      unit="pts"
                      goodDirection="up"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TrajectoryStrip({ trajectory }: { trajectory: SubjectOverview["trajectory"] }) {
  const metrics: { title: string; values: (number | null)[]; format: (v: number | null) => string }[] = [
    {
      title: "AI Mention Rate",
      values: trajectory.ai_recall,
      format: (v) => formatPct(v, 0),
    },
    {
      title: "Average Tone",
      values: trajectory.avg_sentiment,
      format: (v) => formatTonePct(v),
    },
    {
      title: "Risk Frame Rate",
      values: trajectory.risk_frame_rate,
      format: (v) => formatPct(v, 0),
    },
  ];

  return (
    <div className="grid md:grid-cols-3 gap-4">
      {metrics.map((m) => (
        <Card key={m.title} className="p-5">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {m.title}
          </div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">
            {m.format(m.values[m.values.length - 1] ?? null)}
          </div>
          <div className="mt-3">
            <MiniSpark
              values={m.values}
              isHistorical={trajectory.is_historical}
              labels={trajectory.weeks}
            />
          </div>
          <div className="mt-3 pt-3 border-t border-border text-xs text-foreground/70 leading-relaxed">
            {trajectory.weeks.length} weekly snapshot{trajectory.weeks.length === 1 ? "" : "s"};
            most recent is {formatRefreshKind(trajectory.is_historical[trajectory.is_historical.length - 1] ?? false)}.
          </div>
        </Card>
      ))}
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
}: {
  values: (number | null)[];
  isHistorical: boolean[];
  labels: string[];
}) {
  const numericValues = values.filter((v): v is number => v !== null);
  if (numericValues.length < 2) {
    return (
      <div className="h-[60px] flex items-center justify-center text-[11px] text-muted-foreground">
        Need more snapshots for a trend line
      </div>
    );
  }
  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  const range = max - min || 1;
  const w = 280;
  const h = 60;
  const pad = 4;
  const step = (w - pad * 2) / (values.length - 1);
  const yFor = (v: number | null) =>
    v === null ? null : h - pad - ((v - min) / range) * (h - pad * 2);

  // Build path; break at null points
  const path: string[] = [];
  values.forEach((v, i) => {
    const y = yFor(v);
    if (y === null) return;
    const x = pad + i * step;
    path.push(path.length === 0 ? `M${x},${y}` : `L${x},${y}`);
  });

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-[60px] w-full">
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
            r={2}
            fill={isHistorical[i] ? "var(--card)" : "var(--primary)"}
            stroke="var(--primary)"
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
          >
            <title>
              {`${labels[i]}: ${v === null ? "—" : v.toFixed(3)}${
                isHistorical[i] ? " (retrospective estimate)" : ""
              }`}
            </title>
          </circle>
        );
      })}
    </svg>
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
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: MODEL_COLORS[MODEL_DISPLAY[card.model_slug]] || "var(--muted-foreground)" }}
            />
            {MODEL_DISPLAY[card.model_slug] || card.model_slug}
          </span>
          {pillNode}
        </div>

        {/* Originating prompt — the question that elicited the quote. */}
        <div className="text-sm font-semibold text-foreground leading-snug mb-2">
          &ldquo;{card.prompt_text}&rdquo;
        </div>

        {/* AI's actual quote / paraphrased excerpt. line-clamp-4 keeps
            cards visually even regardless of underlying excerpt length;
            full text is in the rationale tooltip on hover. */}
        <p
          className="line-clamp-4 text-sm leading-relaxed text-foreground/70"
          title={card.rationale}
        >
          {card.excerpt}
        </p>
      </div>

      {/* Bottom: frame label. Pushed to card bottom by parent
          justify-between so all "Frame:" rows align across cards. */}
      <div className="mt-4 pt-3 border-t border-border/60 text-xs text-muted-foreground">
        Frame:{" "}
        <span className={frameAbsent ? "text-warning font-medium" : "text-foreground font-medium"}>
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
            <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="truncate font-medium">{s.name}</span>
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
const SOURCE_TYPE_COLORS = [
  "oklch(0.28 0.16 245)",
  "oklch(0.45 0.16 245)",
  "oklch(0.60 0.14 245)",
  "oklch(0.74 0.11 245)",
  "oklch(0.85 0.07 245)",
  "oklch(0.91 0.04 245)",
  "oklch(0.95 0.02 245)",
];

function SourcesTypeMix({ sources }: { sources: SubjectOverview["sources"] }) {
  if (!sources.length) return null;

  // Roll up by type, summing influence scores. Sort desc so heavier
  // categories appear first in both the bar segments and the legend.
  const byType = new Map<string, number>();
  for (const s of sources) {
    byType.set(s.type, (byType.get(s.type) || 0) + s.score);
  }
  const aggregated = Array.from(byType.entries())
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score);
  const total = aggregated.reduce((acc, x) => acc + x.score, 0) || 1;

  // Horizontal stacked bar replaces the donut chart — supports the
  // source-mix readout rather than dominating the card. The legend
  // below carries the actual labels and percentages; the bar is just
  // a visual aid for proportions at a glance.
  return (
    <div className="lg:border-l lg:border-border/60 lg:pl-8 pt-1">
      <div className="text-[11px] uppercase tracking-wider text-foreground/65 mb-3">
        Source mix
      </div>

      {/* Horizontal stacked bar — single 10px tall row, segments
          proportional to each category's share of total influence. */}
      <div className="flex h-2.5 w-full overflow-hidden rounded-sm">
        {aggregated.map((t, i) => {
          const pct = (t.score / total) * 100;
          return (
            <div
              key={t.name}
              title={`${t.name} — ${Math.round(pct)}%`}
              style={{
                width: `${pct}%`,
                backgroundColor: SOURCE_TYPE_COLORS[i % SOURCE_TYPE_COLORS.length],
              }}
            />
          );
        })}
      </div>

      {/* Legend with full category names + percentages. This is the
          primary read; the bar is decorative reinforcement. */}
      <ul className="mt-4 space-y-2">
        {aggregated.map((t, i) => (
          <li
            key={t.name}
            className="flex items-center justify-between gap-2 text-[13px]"
          >
            <span className="flex items-center gap-2 min-w-0">
              <span
                className="h-2 w-2 rounded-sm shrink-0"
                style={{ backgroundColor: SOURCE_TYPE_COLORS[i % SOURCE_TYPE_COLORS.length] }}
              />
              <span className="truncate text-foreground/85">{t.name}</span>
            </span>
            <span className="tabular-nums font-medium text-foreground/70">
              {Math.round((t.score / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Placeholder section for Phase 2/3 methodology gaps ──────────────

function PhasePlaceholder({ title, phase, what }: { title: string; phase: string; what: string }) {
  return (
    <Card className="p-5 border-dashed">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground/55">
            {title}
          </div>
          <p className="mt-1.5 text-sm text-foreground/65 leading-relaxed max-w-2xl">
            {what}
          </p>
        </div>
        <Pill tone="neutral">{phase}</Pill>
      </div>
    </Card>
  );
}

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

  const updated = data.meta.last_refresh_at
    ? new Date(data.meta.last_refresh_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";
  // Shorter date for the sticky header meta line — drops the year so
  // the line stays tight ("Updated May 8" vs "Updated May 8, 2026").
  // The hero card carries the full date with year for archival clarity.
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
        <Sidebar />
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
          <main className="flex-1 px-4 md:px-8 py-6 space-y-8 max-w-[1500px] w-full mx-auto">
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

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />

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

        <main className="flex-1 px-4 md:px-8 py-6 space-y-8 max-w-[1500px] w-full mx-auto">
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
                  <p className="mt-2.5 text-[14.5px] leading-relaxed text-foreground/70 max-w-xl">
                    How major AI platforms describe {data.subject_name} across
                    voter-facing and public-affairs prompts.
                  </p>

                  {/* Executive summary — Bottom Line (diagnostic) +
                      Recommended Focus (action) as a single visually
                      linked block. Both share the outer container,
                      separated by a hairline divider. Side-bar
                      accents give stylistic parallelism while the
                      color difference (primary blue vs muted) signals
                      "finding vs action." */}
                  {(data.bottom_line || data.recommended_focus) && (
                    <div className="mt-6 rounded-md overflow-hidden border border-border/40">
                      {data.bottom_line && (
                        <div
                          className="relative pl-5 pr-4 py-4"
                          style={{
                            background:
                              "color-mix(in oklab, var(--primary) 6%, transparent)",
                          }}
                        >
                          <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-primary" />
                          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary mb-1.5">
                            Bottom line
                          </div>
                          <p className="text-[17px] leading-relaxed font-semibold tracking-[-0.005em] text-foreground">
                            {data.bottom_line}
                          </p>
                        </div>
                      )}
                      {data.bottom_line && data.recommended_focus && (
                        <div className="border-t border-border/40" />
                      )}
                      {data.recommended_focus && (
                        <div className="relative pl-5 pr-4 py-3.5 bg-card">
                          <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-foreground/40" />
                          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/55 mb-1.5">
                            Recommended focus
                          </div>
                          <p className="text-[14.5px] leading-relaxed text-foreground/90">
                            {data.recommended_focus}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fallback when neither piece could be synthesized */}
                  {!data.bottom_line && !data.recommended_focus && (
                    <div className="mt-6 rounded-md border border-dashed border-border/70 bg-muted/30 px-5 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/45">
                        Executive summary
                      </div>
                      <p className="mt-1.5 text-[13px] text-foreground/55 leading-relaxed max-w-xl">
                        Not enough signal in this snapshot to synthesize an
                        executive briefing yet. Take another snapshot or wait
                        for more data to accumulate.
                      </p>
                    </div>
                  )}

                </div>

                {/* RIGHT: Dominant narrative — ranked clusters */}
                <DominantNarrativePanel
                  clusters={data.narrative_clusters}
                  subjectName={data.subject_name}
                  category={data.category}
                />
              </div>
              {/* topicScope dropped — the dynamic subtitle made the
                  AI Mention Rate tile visually heavier than the other
                  two KPI tiles. Methodology context lives in the
                  tooltip and the Prompt Coverage section below. */}
              <HeroKpis kpis={data.kpis} />
            </Card>
          </section>

          {/* STRATEGIC TAKEAWAYS — Phase 2 wiring.
              Extra top spacing (mt-12 = 48px, overrides the parent
              space-y-8's 32px default) so the transition from the
              executive topline (AI Narrative Brief card above) to
              the strategic interpretation feels deliberate — a clean
              visual pause, not two sections stacked back-to-back. */}
          {data.strategic_takeaways.length > 0 && (
            <section className="mt-12">
              <SectionTitle
                eyebrow="Strategic Takeaways"
                title="What stands out right now"
                description="The action-oriented interpretation — what to notice or do because of the current AI narrative."
              />
              <Card className="p-5 md:p-6">
                {/* Each takeaway renders as its own insight card inside
                    the outer section container. Left-border accent
                    signals type at a glance: orange for risks/gaps,
                    blue for assets/opportunities, muted gray for
                    everything else. Two-column grid on md+, stacks on
                    smaller viewports. */}
                <div
                  className={`grid gap-4 ${
                    data.strategic_takeaways.length === 1
                      ? "grid-cols-1"
                      : "grid-cols-1 md:grid-cols-2"
                  }`}
                >
                  {data.strategic_takeaways.map((item) => {
                    // Accent color per takeaway type. Restrained palette:
                    // border-l-warning for weakness/risk signals,
                    // border-l-primary for asset/strength signals,
                    // border-l-muted for everything else.
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
                        className={`rounded-lg border border-border/60 bg-muted/30 p-4 border-l-2 ${accent}`}
                      >
                        <div
                          className={`text-xs font-semibold uppercase tracking-wide ${eyebrowColor}`}
                        >
                          {item.eyebrow}
                        </div>
                        <div className="mt-1.5 text-sm font-semibold text-foreground leading-snug">
                          {item.title}
                        </div>
                        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                          {item.body}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </section>
          )}

          {/* COVERAGE — combined: prompt-topic breakdown + AI-platform
              breakdown. Both are denominators of AI Mention Rate
              (topic dimension and platform dimension respectively),
              so they belong in one analytical view rather than two
              separate sections. */}
          <section>
            <SectionTitle
              eyebrow="Coverage"
              title="What was included in this analysis"
            />
            <Card className="p-5 md:p-6">
              <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
                {/* LEFT: topics */}
                {data.topic_coverage.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground/55 mb-3">
                      By topic
                    </div>
                    <div className="grid grid-cols-[1fr_auto_auto_60px] items-baseline gap-x-4 text-[10px] uppercase tracking-wider text-foreground/65 pb-2 border-b border-border/60">
                      <span>Topic</span>
                      <span className="text-right">Share</span>
                      <span className="text-right">Mention</span>
                      <span></span>
                    </div>
                    {data.topic_coverage.map((t) => {
                      const recallPct = t.ai_recall === null ? null : t.ai_recall * 100;
                      return (
                        <div
                          key={t.label}
                          className="grid grid-cols-[1fr_auto_auto_60px] items-baseline gap-x-4 py-2.5 border-b border-border/30 last:border-b-0 text-sm"
                          title={`${t.n_unique_slots} prompt slot${t.n_unique_slots === 1 ? "" : "s"} × ${t.n_responses / t.n_unique_slots} model${t.n_unique_slots === 1 ? "" : "s"} = ${t.n_responses} responses · source: ${t.source_field}`}
                        >
                          <span className="font-medium text-foreground/85 truncate">
                            {t.label}
                          </span>
                          <span className="text-foreground/70 tabular-nums text-right">
                            {(t.share_of_set * 100).toFixed(0)}%
                          </span>
                          <span className="font-mono tabular-nums text-foreground/80 text-right">
                            {recallPct === null ? "—" : `${recallPct.toFixed(0)}%`}
                          </span>
                          <div className="h-1 bg-border rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary/70"
                              style={{ width: `${recallPct ?? 0}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* RIGHT: platforms */}
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground/55 mb-3">
                    By AI platform
                  </div>
                  <PlatformRecallStrip platforms={data.platform_recall} />
                </div>
              </div>
              <p className="mt-5 text-[11.5px] text-foreground/65 leading-relaxed">
                Mention Rate is measured only on questions that don't name
                the subject directly. Questions that DO name the subject
                would trivially score 100% and are excluded. N/A on a
                platform means it didn't run this snapshot.
              </p>
            </Card>
          </section>

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
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                        <th className="px-3 py-2.5 font-medium">Entity</th>
                        <th className="px-3 py-2.5 font-medium text-right">Share</th>
                        <th className="px-3 py-2.5 font-medium text-right">Avg Pos</th>
                        <th className="px-3 py-2.5 font-medium text-right">First Mention</th>
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
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <span className={c.is_subject ? "font-semibold" : "font-medium"}>
                                {c.name}
                              </span>
                              {c.is_subject && <Pill tone="primary">You</Pill>}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right font-mono">
                            {Math.round(c.sov * 100)}%
                          </td>
                          <td className="px-3 py-3 text-right font-mono">
                            {c.avg_rank !== null ? c.avg_rank.toFixed(1) : "—"}
                          </td>
                          <td className="px-3 py-3 text-right font-mono">
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

          {/* VISIBILITY TRENDS — wired. Below 2 refreshes there's no
              trend line to draw, so render a single-row banner instead
              of three half-empty cards. Positioned after Competitive
              Snapshot so the page narrative goes "what's happening
              now (Brief + Takeaways) → who/what's being mentioned
              (Coverage + Evidence + Competitive) → trajectory over
              time (Trends)". */}
          <section>
            {data.trajectory.weeks.length >= 2 ? (
              <>
                <SectionTitle
                  eyebrow="Visibility Trends"
                  title="How visibility has shifted"
                  description={`Movement across the headline metrics over the last ${data.trajectory.weeks.length} weekly snapshots. Open circles are retrospective estimates; filled circles are live snapshots.`}
                />
                <TrajectoryStrip trajectory={data.trajectory} />
              </>
            ) : (
              <>
                <SectionTitle
                  eyebrow="Visibility Trends"
                  title="How visibility has shifted"
                  description="Trend lines compare visibility week-over-week. Available after the second snapshot."
                />
                <Card className="flex items-center gap-3 px-5 py-4">
                  <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0" />
                  <p className="text-sm text-foreground/70 leading-relaxed">
                    {data.trajectory.weeks.length === 0
                      ? "No snapshots yet — trend charts will appear after the second snapshot."
                      : "1 snapshot in history so far. Trend charts will appear after the next snapshot."}
                  </p>
                </Card>
              </>
            )}
          </section>

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
