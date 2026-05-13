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
} from "lucide-react";
import { notFound } from "next/navigation";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { Card, SectionTitle, Pill } from "@/components/dashboard/ui";
import { CompetitorBarsFromData } from "@/components/dashboard/Charts";
import {
  getSubject,
  getSubjectOverview,
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

// Format helpers — keep all KPI formatting consistent across the page
function formatPct(v: number | null, digits = 0): string {
  if (v === null) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}
function formatSentiment(v: number | null): string {
  if (v === null) return "—";
  return v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
}
function formatDelta(d: number | null, unit: string): string {
  if (d === null) return "—";
  const sign = d > 0 ? "+" : d < 0 ? "−" : "";
  return `${sign}${Math.abs(d).toFixed(unit === "pts" ? 1 : 2)} ${unit}`;
}

function TrendBadge({ trend, delta, unit }: { trend: "up" | "down" | "flat"; delta: number | null; unit: string }) {
  if (delta === null) {
    return <span className="text-[11px] text-foreground/40">no prior</span>;
  }
  const Icon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const color = trend === "flat" ? "text-muted-foreground" : "text-success";
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

function HeroKpis({ kpis }: { kpis: SubjectOverview["kpis"] }) {
  const tiles: { label: string; tooltip: string; value: string; risk?: boolean; kpi: KpiValue; unit: string }[] = [
    {
      label: "AI Recall",
      tooltip: "Share of relevant AI answers (unnamed-layer prompts about the topic area) that mention this subject.",
      value: formatPct(kpis.ai_recall.value),
      kpi: kpis.ai_recall,
      unit: "pts",
    },
    {
      label: "Avg Sentiment",
      tooltip: "Mean tone across all AI answers about this subject, scaled −1 (most negative) to +1 (most positive).",
      value: formatSentiment(kpis.avg_sentiment.value),
      kpi: kpis.avg_sentiment,
      unit: "",
    },
    {
      label: "Risk Frame Rate",
      tooltip: "Share of AI answers where the model frames the subject through controversy, criticism, or opposition narratives (criticism severity > 0.5).",
      value: formatPct(kpis.risk_frame_rate.value),
      risk: true,
      kpi: kpis.risk_frame_rate,
      unit: "pts",
    },
  ];

  return (
    <div className="mt-7 grid grid-cols-3 gap-8 pt-6 border-t border-border/50">
      {tiles.map((t) => (
        <div key={t.label} className="min-w-0">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground/75">
            <span className="truncate">{t.label}</span>
            <KpiTooltipIcon text={t.tooltip} />
          </div>
          <div className="mt-2 flex items-baseline gap-2.5">
            <div
              className={`font-display text-[28px] leading-none font-semibold tracking-[-0.02em] ${
                t.risk ? "text-warning" : "text-foreground"
              }`}
            >
              {t.value}
            </div>
            <TrendBadge trend={t.kpi.trend} delta={t.kpi.delta} unit={t.unit} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DominantNarrativePanel({
  clusters,
  subjectName,
}: {
  clusters: SubjectOverview["narrative_clusters"];
  subjectName: string;
}) {
  if (clusters.length === 0) {
    return (
      <div className="lg:col-span-2 lg:border-l lg:border-border/50 lg:pl-12">
        <div className="text-[12px] font-semibold text-foreground/70">
          Dominant narrative
        </div>
        <p className="mt-3 text-[13px] text-foreground/55 leading-relaxed">
          No narrative clustering available for this refresh yet. Run the
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
      <div className="mt-1.5 text-[13px] text-foreground/60">
        Appears in{" "}
        <span className="text-foreground font-semibold">
          {Math.round(topShare * 100)}%
        </span>{" "}
        of AI answers about {subjectName}
      </div>

      <ul className="mt-7 space-y-5">
        {clusters.map((c, i) => {
          const barWidth = topShare > 0 ? (c.share / topShare) * 100 : 0;
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
                <span className="text-foreground/55 tabular-nums text-[12px]">
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

function PlatformRecallStrip({ platforms }: { platforms: SubjectOverview["platform_recall"] }) {
  if (!platforms.length) return null;
  return (
    <div
      aria-label="Per-platform recall breakdown"
      className="relative block mt-8 pt-6 border-t border-border/50"
    >
      <div className="flex items-center justify-between gap-3 mb-3 px-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground/55">
          AI Recall by platform
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {platforms.map((p) => (
          <div
            key={p.name}
            title={
              p.value === null
                ? `No data available for ${p.name} in this period.`
                : `${formatPct(p.value, 0)} of relevant prompts on ${p.name} where the subject is mentioned. Based on ${p.n_responses} responses.`
            }
            className={`relative rounded-md border px-3 py-2.5 ${
              p.lowest ? "border-warning/30 bg-warning/[0.04]" : "border-border bg-card"
            }`}
          >
            {p.lowest && (
              <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-warning" />
            )}
            <div className="flex items-center gap-1.5 mb-1">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: MODEL_COLORS[p.name] || "var(--muted-foreground)" }}
              />
              <span className="text-[11px] font-medium text-foreground/70">{p.name}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[18px] font-semibold tabular-nums tracking-[-0.015em] text-foreground">
                {formatPct(p.value, 0)}
              </span>
              <TrendBadge trend={p.trend} delta={p.delta} unit="pts" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrajectoryStrip({ trajectory }: { trajectory: SubjectOverview["trajectory"] }) {
  const metrics: { title: string; values: (number | null)[]; format: (v: number | null) => string }[] = [
    {
      title: "AI Recall",
      values: trajectory.ai_recall,
      format: (v) => formatPct(v, 0),
    },
    {
      title: "Avg Sentiment",
      values: trajectory.avg_sentiment,
      format: (v) => formatSentiment(v),
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
          <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground leading-relaxed">
            {trajectory.weeks.length} weekly snapshot{trajectory.weeks.length === 1 ? "" : "s"};
            most recent is {formatRefreshKind(trajectory.is_historical[trajectory.is_historical.length - 1] ?? false)}.
          </div>
        </Card>
      ))}
    </div>
  );
}

function formatRefreshKind(isHistorical: boolean): string {
  return isHistorical ? "an estimated retrospective" : "a live refresh";
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
        Need more refreshes for a trend line
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
              {labels[i]}: {v === null ? "—" : v.toFixed(3)}
              {isHistorical[i] ? " (retrospective estimate)" : ""}
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
    <Card className="p-5 flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: MODEL_COLORS[MODEL_DISPLAY[card.model_slug]] || "var(--muted-foreground)" }}
          />
          {MODEL_DISPLAY[card.model_slug] || card.model_slug}
        </span>
        {pillNode}
      </div>
      <div className="text-[13px] font-semibold text-foreground mb-3 leading-snug">
        &ldquo;{card.prompt_text}&rdquo;
      </div>
      <div
        className="text-xs text-muted-foreground leading-relaxed flex-1 border-l-2 border-primary/40 pl-3 italic"
        title={card.rationale}
      >
        {card.excerpt}
      </div>
      <div className="mt-4 pt-3 border-t border-border text-[11px] text-muted-foreground">
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
        No sources extracted yet. Run a refresh with grounding enabled.
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-12 text-[10px] uppercase tracking-wider text-muted-foreground px-3 pb-2 border-b border-border">
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
  try {
    [data, subject] = await Promise.all([
      getSubjectOverview(subjectId),
      getSubject(subjectId),
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

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />

      <div className="flex-1 min-w-0 flex flex-col">
        <Header />

        <main className="flex-1 px-4 md:px-8 py-10 space-y-10 max-w-[1500px] w-full mx-auto">
          {/* ACTION BAR — back nav + trigger refresh */}
          <div className="flex items-center justify-between gap-4 -mb-6">
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← All subjects
            </Link>
            <RefreshButton subjectId={subjectId} />
          </div>

          {/* HERO */}
          <section>
            <div className="flex items-center justify-between gap-4 mb-4 px-1">
              <div className="text-xs text-foreground/55">
                AI Visibility Snapshot · Latest refresh {updated}
              </div>
              <div className="text-xs text-foreground/55 whitespace-nowrap">
                {data.meta.n_responses} responses · {data.meta.n_platforms} platforms
              </div>
            </div>

            <Card className="relative overflow-hidden p-7 md:p-10 border-border/60">
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(135deg, color-mix(in oklab, var(--primary) 5%, transparent) 0%, color-mix(in oklab, var(--primary) 1.5%, transparent) 35%, transparent 70%)",
                }}
              />

              <div className="relative grid lg:grid-cols-5 gap-8 lg:gap-12">
                {/* LEFT: title + callouts + KPIs */}
                <div className="lg:col-span-3 flex flex-col">
                  <h1 className="font-display text-[24px] md:text-[27px] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground">
                    AI Narrative Brief: {data.subject_name}
                  </h1>
                  <p className="mt-2.5 text-[14.5px] leading-relaxed text-foreground/70 max-w-xl">
                    How major AI platforms describe {data.subject_name} across
                    voter-facing and public-affairs prompts.
                  </p>

                  {/* Bottom Line — diagnostic callout, primary visual weight */}
                  {data.bottom_line && (
                    <div
                      className="mt-6 relative pl-5 pr-4 py-4 rounded-md"
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

                  {/* Recommended Focus — prescriptive follow-on, quieter */}
                  {data.recommended_focus && (
                    <div className="mt-3 relative pl-5 pr-4 py-3.5 rounded-md border border-border/60 bg-card">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/55 mb-1.5">
                        Recommended focus
                      </div>
                      <p className="text-[14.5px] leading-relaxed text-foreground/90">
                        {data.recommended_focus}
                      </p>
                    </div>
                  )}

                  {/* Fallback when neither piece could be synthesized */}
                  {!data.bottom_line && !data.recommended_focus && (
                    <div className="mt-6 rounded-md border border-dashed border-border/70 bg-muted/30 px-5 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/45">
                        Executive summary
                      </div>
                      <p className="mt-1.5 text-[13px] text-foreground/55 leading-relaxed max-w-xl">
                        Not enough signal in this refresh to synthesize an
                        executive briefing yet. Trigger another refresh or wait
                        for more data to accumulate.
                      </p>
                    </div>
                  )}

                  <HeroKpis kpis={data.kpis} />
                </div>

                {/* RIGHT: Dominant narrative — ranked clusters */}
                <DominantNarrativePanel
                  clusters={data.narrative_clusters}
                  subjectName={data.subject_name}
                />
              </div>
              <PlatformRecallStrip platforms={data.platform_recall} />
            </Card>
          </section>

          {/* STRATEGIC TAKEAWAYS — Phase 2 wiring */}
          {data.strategic_takeaways.length > 0 && (
            <section>
              <SectionTitle
                eyebrow="Strategic Takeaways"
                title="What stands out this period"
                description={`The most important shifts in how AI platforms currently describe ${data.subject_name}.`}
              />
              <Card className="p-2 md:p-3">
                <ul className="divide-y divide-border/60">
                  {data.strategic_takeaways.map((item) => {
                    const Icon =
                      item.kind === "message_gap" ? AlertOctagon
                      : item.kind === "opposition_frame" ? Compass
                      : Megaphone;
                    const eyebrowClass =
                      item.tone === "warning" ? "text-warning"
                      : item.tone === "muted" ? "text-foreground/55"
                      : "text-primary/80";
                    const dotClass =
                      item.tone === "warning" ? "bg-warning"
                      : item.tone === "muted" ? "bg-foreground/30"
                      : "bg-primary";
                    return (
                      <li
                        key={item.kind}
                        className="relative grid grid-cols-[auto_1fr] gap-5 px-5 md:px-6 py-5"
                      >
                        <span className={`absolute left-0 top-5 bottom-5 w-[2px] rounded-full ${dotClass}`} />
                        <div className="pt-0.5">
                          <Icon className={`h-4 w-4 ${eyebrowClass}`} />
                        </div>
                        <div className="min-w-0">
                          <div className={`text-[11.5px] font-semibold uppercase tracking-[0.06em] ${eyebrowClass}`}>
                            {item.eyebrow}
                          </div>
                          <div className="mt-1 text-[16px] font-semibold tracking-[-0.01em] text-foreground leading-snug">
                            {item.title}
                          </div>
                          <p className="mt-1.5 text-[13.5px] text-foreground/70 leading-relaxed max-w-3xl">
                            {item.body}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          )}

          {/* PROMPT COVERAGE — Phase 2 wiring */}
          {data.topic_coverage.length > 0 && (
            <section>
              <SectionTitle
                eyebrow="Prompt coverage"
                title="What types of questions were included in this analysis"
                description="Topics derived from the subject's setup_inputs. Recall is the share of unnamed-layer prompts in that topic where AI surfaced the subject."
              />
              <Card className="p-5 md:p-6">
                <div className="grid grid-cols-[1fr_auto_auto_72px] items-baseline gap-x-6 text-[10px] uppercase tracking-wider text-muted-foreground pb-2 border-b border-border/60">
                  <span>Topic</span>
                  <span className="text-right">Share of set</span>
                  <span className="text-right">AI recall</span>
                  <span></span>
                </div>
                {data.topic_coverage.map((t) => {
                  const recallPct = t.ai_recall === null ? null : t.ai_recall * 100;
                  return (
                    <div
                      key={t.label}
                      className="grid grid-cols-[1fr_auto_auto_72px] items-baseline gap-x-6 py-2.5 border-b border-border/30 last:border-b-0 text-sm"
                      title={`${t.n_unique_slots} prompt slot${t.n_unique_slots === 1 ? "" : "s"} × ${t.n_responses / t.n_unique_slots} model${t.n_unique_slots === 1 ? "" : "s"} = ${t.n_responses} responses · source: ${t.source_field}`}
                    >
                      <span className="font-medium text-foreground/85 truncate">
                        {t.label}
                      </span>
                      <span className="text-foreground/55 tabular-nums text-right">
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
                <p className="mt-3 text-[11.5px] text-foreground/50 leading-relaxed">
                  Recall is computed on unnamed-layer prompts only (where the
                  subject is not mentioned in the question). Named-layer recall
                  is trivially 100%.
                </p>
              </Card>
            </section>
          )}

          {/* EVIDENCE — Phase 3c wiring */}
          {data.evidence_cards.length > 0 && (
            <section>
              <SectionTitle
                eyebrow="Evidence"
                title="What AI is actually saying"
                description="Verbatim quotes selected by the top-quotes cross-analyzer across the latest refresh. Each card shows the originating prompt, the AI's exact words, and the narrative cluster it falls under."
              />
              <div className="grid md:grid-cols-3 gap-4">
                {data.evidence_cards.map((card, i) => (
                  <EvidenceCard
                    key={`${card.model_response_id}-${i}`}
                    card={card}
                  />
                ))}
              </div>
            </section>
          )}

          {/* VISIBILITY TRENDS — wired */}
          <section>
            <SectionTitle
              eyebrow="Visibility Trends"
              title="How visibility has shifted"
              description={`Movement across the headline metrics over the last ${data.trajectory.weeks.length} weekly refreshes. Open circles are retrospective estimates; filled circles are live refreshes.`}
            />
            <TrajectoryStrip trajectory={data.trajectory} />
          </section>

          {/* COMPETITIVE SNAPSHOT — Phase 4 wiring */}
          {data.competitive.length > 0 && (
            <Card className="p-6">
              <SectionTitle
                eyebrow="Competitive Snapshot"
                title={`How ${data.subject_name} compares to peers`}
                description={`Share of voice and visibility against the top entities AI surfaces when asked about ${data.subject_name}'s topic areas. Pulled from unnamed-layer responses on this refresh.`}
                right={<Pill tone="primary">{data.competitive.length} entities tracked</Pill>}
              />
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
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

          {/* SOURCES — wired */}
          <Card className="p-6">
            <SectionTitle
              eyebrow="Sources"
              title="Sources shaping AI answers"
              description={`The publications and pages most often cited or paraphrased in AI responses about ${data.subject_name}.`}
            />
            <SourcesList sources={data.sources} />
          </Card>

          {/* REFRESH HISTORY — operator/audit context, behind a disclosure
              so it doesn't clutter the executive view */}
          {subject.refreshes.length > 0 && (
            <details className="group rounded-md border border-border/60 bg-card">
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center justify-between px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-foreground/65 hover:text-foreground transition-colors">
                <span>
                  Refresh history
                  <span className="ml-2 text-muted-foreground font-normal normal-case tracking-normal">
                    ({subject.refreshes.length} run{subject.refreshes.length === 1 ? "" : "s"})
                  </span>
                </span>
                <span className="text-[11px] text-primary group-hover:underline">
                  {/* arrow rotates on open via group-open: */}
                  <span className="inline-block transition-transform group-open:rotate-90">›</span>
                </span>
              </summary>
              <div className="px-5 pb-5">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
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
            <p className="text-center text-[11.5px] text-foreground/60 leading-relaxed">
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
