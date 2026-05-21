"use client";

/**
 * Trend Over Time card for the Visibility spoke.
 *
 * Three tabs (Mention Rate / Share of Voice / Top Result Rate) sit
 * above a single chart area. Only Mention Rate has a real per-week
 * series today — backend ships `trajectory.ai_recall` for the
 * subject but no per-competitor series, and SoV / Top Result Rate
 * aren't tracked over time at all (snapshot-only via the
 * `competitive[]` leaderboard). The two non-wired tabs render a
 * "coming soon" empty state pointing the user at Competitive
 * Snapshot below for the snapshot view. When per-competitor series
 * ship from the backend, this is where lighter overlay lines for
 * each competitor will plug in.
 */
import { useId, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  Info,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Card, SectionTitle } from "@/components/dashboard/ui";
import type { SubjectOverview } from "@/lib/api";

type MetricKey = "mention_rate" | "share_of_voice" | "top_result_rate";

const METRICS: { key: MetricKey; label: string; tooltip: string }[] = [
  {
    key: "mention_rate",
    label: "Mention Rate",
    tooltip:
      "Share of AI answers about this subject's topic areas that mention them by name. Higher is better — rising means AI is more reliably surfacing the subject when asked about their topic areas.",
  },
  {
    key: "share_of_voice",
    label: "Share of Voice",
    tooltip:
      "The subject's slice of the entity pie: subject mentions ÷ (subject + deduped competitor mentions) per snapshot. Captures competitive crowding — even with a strong mention rate, SoV can fall if competitors are named more often in the same answers.",
  },
  {
    key: "top_result_rate",
    label: "Top Result Rate",
    tooltip:
      "Share of answers where the subject was listed first (rank #1) among entities AI mentioned. Pole-position visibility — being mentioned at all is one thing; being mentioned first is another.",
  },
];

// Hover-tooltip helper, mirroring the KpiTooltipIcon pattern used on
// the Visibility page. Inline here (rather than importing) because
// KpiTooltipIcon is a private helper inside page.tsx and we want to
// keep this client component standalone for now.
function MetricInfo({ text }: { text: string }) {
  return (
    <span className="group/info relative inline-flex">
      <Info
        className="ml-1 h-3 w-3 opacity-50 transition-opacity group-hover/info:opacity-100"
        aria-hidden
      />
      <span className="pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-2 w-60 -translate-x-1/2 rounded-md border border-border bg-popover px-3 py-2 text-[11px] leading-snug text-popover-foreground opacity-0 shadow-lg transition-opacity group-hover/info:visible group-hover/info:opacity-100">
        {text}
      </span>
    </span>
  );
}

const PRIMARY = "var(--primary)";

// Distinct hues for competitor overlay lines so the eye can tell
// them apart at a glance instead of guessing which faded-blue is
// which. Hues stay muted (medium chroma, mid-lightness) so the
// subject's bold primary still reads as the focal series — these
// are background context, not equally-weighted peers. Pulled in
// order of competitor rank (top-appearance first), so the most
// persistent rival gets the most readable color.
const COMPETITOR_COLORS = [
  "oklch(0.62 0.12 160)",  // muted teal
  "oklch(0.66 0.13 55)",   // muted amber
  "oklch(0.55 0.11 310)",  // muted violet
];
const COMPETITOR_OPACITY = 0.75;

// Custom tooltip for the multi-series chart. Default Recharts
// tooltip works but stacks all series in arrival order without
// emphasising the subject — this version puts the subject row at
// the top (bold), sorts competitors by value desc below it, and
// shows a color swatch matching each line so the hover surface
// reads like the legend (entity + value) for the hovered week.
type TooltipPayloadEntry = {
  name?: string;
  value?: number | string;
  color?: string;
  payload?: { rawWeek?: string };
};

function MultiSeriesTooltip({
  active,
  payload,
  label,
  subjectName,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  subjectName: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  // Drop entries where the line had a null at this week (gap in
  // data) — Recharts still hands them to us but they'd read as
  // misleading zeros.
  const entries = payload.filter(
    (p) =>
      p.value !== null &&
      p.value !== undefined &&
      Number.isFinite(Number(p.value)),
  );
  if (entries.length === 0) return null;

  // Subject first, then competitors descending by value.
  const sorted = [...entries].sort((a, b) => {
    if (a.name === subjectName) return -1;
    if (b.name === subjectName) return 1;
    return Number(b.value) - Number(a.value);
  });

  // Header: format the rawWeek ISO date (carried on each row's
  // payload) into "May 13, 2026". Fall back to the MM/DD x-axis
  // label if the rawWeek isn't present for some reason.
  const rawWeek = sorted[0]?.payload?.rawWeek;
  const headerLabel = rawWeek
    ? (() => {
        const d = new Date(rawWeek);
        return Number.isNaN(d.getTime())
          ? (label ?? rawWeek)
          : d.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
      })()
    : (label ?? "");

  return (
    <div className="min-w-[200px] rounded-md border border-border bg-popover px-3 py-2 shadow-lg">
      <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {headerLabel}
      </div>
      <div className="space-y-1">
        {sorted.map((entry) => {
          const isSubject = entry.name === subjectName;
          return (
            <div
              key={entry.name}
              className="flex items-center gap-2 text-[12px]"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: entry.color }}
                aria-hidden
              />
              <span
                className={
                  isSubject
                    ? "truncate font-semibold text-foreground"
                    : "truncate text-foreground/80"
                }
              >
                {entry.name}
              </span>
              <span
                className={`ml-auto tabular-nums ${
                  isSubject
                    ? "font-semibold text-foreground"
                    : "font-medium text-foreground/85"
                }`}
              >
                {Number(entry.value)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Backend ships ISO date strings (e.g. "2026-05-13"). Render as MM/DD
// for compact tick labels; fall back to the raw string if parsing
// fails so a contract change doesn't blank out the axis.
function formatWeekTick(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}/${day}`;
}


export function TrendOverTime({
  subjectName,
  trajectory,
  competitorTrajectories,
  currentMentionRate,
  mentionRateDelta,
  mentionRateTrend,
}: {
  subjectName: string;
  trajectory: SubjectOverview["trajectory"];
  competitorTrajectories: SubjectOverview["competitor_trajectories"];
  currentMentionRate: number | null;
  mentionRateDelta: number | null;
  mentionRateTrend: "up" | "down" | "flat";
}) {
  const [active, setActive] = useState<MetricKey>("mention_rate");
  const gradientId = useId();

  // Pick the trajectory array for the active tab. All three metrics
  // ship as parallel `(number | null)[]` arrays aligned to
  // trajectory.weeks, so the rendering logic below is metric-agnostic.
  const valuesForActive: (number | null)[] =
    active === "mention_rate"
      ? trajectory.ai_recall
      : active === "share_of_voice"
        ? trajectory.share_of_voice
        : trajectory.top_result_rate;

  // Pick the matching per-competitor array per metric.
  const competitorValuesFor = (
    c: SubjectOverview["competitor_trajectories"][number],
  ): (number | null)[] =>
    active === "mention_rate"
      ? c.mention_rate
      : active === "share_of_voice"
        ? c.share_of_voice
        : c.top_result_rate;

  // Build wide-format chart data: one row per week with a column per
  // entity (subject + each competitor). Recharts renders each Line /
  // Area off its own dataKey, so columns are keyed by entity name.
  // Null values produce gaps in the line (set connectNulls={false}
  // on each series) so a no-data week reads as "unmeasured" rather
  // than "fell to 0%". Pct values in 0..100 with one decimal of
  // precision so hover tooltips don't lie about round-off.
  type ChartRow = { w: string; rawWeek: string } & Record<
    string,
    number | string | null
  >;
  const entityNames = [
    subjectName,
    ...competitorTrajectories.map((c) => c.name),
  ];
  const toPct = (raw: number | null | undefined): number | null =>
    raw === null || raw === undefined || !Number.isFinite(raw)
      ? null
      : Math.round((raw as number) * 1000) / 10;
  const wideSeries: ChartRow[] = trajectory.weeks
    .map((w, i) => {
      const row: ChartRow = { w: formatWeekTick(w), rawWeek: w };
      row[subjectName] = toPct(valuesForActive[i]);
      competitorTrajectories.forEach((c) => {
        row[c.name] = toPct(competitorValuesFor(c)[i]);
      });
      return row;
    })
    // Drop weeks where every entity is null (would render as an
    // empty x-tick with no data, which just adds visual noise).
    .filter((row) =>
      entityNames.some((k) => typeof row[k] === "number"),
    );

  // Y-axis padding: 5pt-stepped band around the observed range
  // across ALL entities (subject + competitors) so a competitor
  // peak doesn't get clipped above the subject's max. Clamped to
  // [0, 100]; degenerate flat-line case gets an artificial spread
  // so the line doesn't render as a single horizontal stripe.
  const allValues: number[] = [];
  wideSeries.forEach((row) => {
    entityNames.forEach((k) => {
      const v = row[k];
      if (typeof v === "number") allValues.push(v);
    });
  });
  let yDomain: [number, number] = [0, 100];
  if (allValues.length > 0) {
    const lo = Math.max(0, Math.floor(Math.min(...allValues) / 5) * 5 - 5);
    const hi = Math.min(100, Math.ceil(Math.max(...allValues) / 5) * 5 + 5);
    yDomain = lo === hi ? [Math.max(0, lo - 5), Math.min(100, hi + 5)] : [lo, hi];
  }

  // Chart renders only when the subject has at least two measured
  // weeks. Competitor lines can be sparser without blocking the
  // chart — they're context, not the focal series.
  const subjectMeasuredWeeks = wideSeries.filter(
    (r) => typeof r[subjectName] === "number",
  ).length;

  // Callout value + delta. For Mention Rate we trust the hero KPI
  // (which carries the backend's well-formed trend semantics);
  // for SoV / Top Result Rate the hero doesn't carry these so we
  // derive last-vs-prior from the trajectory itself.
  let activeCurrent: number | null;
  let activeDelta: number | null;
  let activeTrend: "up" | "down" | "flat";
  if (active === "mention_rate") {
    activeCurrent = currentMentionRate;
    activeDelta = mentionRateDelta;
    activeTrend = mentionRateTrend;
  } else {
    const nonNull = valuesForActive.filter(
      (v): v is number => v !== null && Number.isFinite(v),
    );
    activeCurrent = nonNull.length ? nonNull[nonNull.length - 1] : null;
    const prior = nonNull.length > 1 ? nonNull[nonNull.length - 2] : null;
    activeDelta =
      activeCurrent !== null && prior !== null ? activeCurrent - prior : null;
    activeTrend =
      activeDelta === null
        ? "flat"
        : activeDelta > 0.005
          ? "up"
          : activeDelta < -0.005
            ? "down"
            : "flat";
  }

  const TrendIcon =
    activeTrend === "up"
      ? TrendingUp
      : activeTrend === "down"
        ? TrendingDown
        : Minus;
  const deltaColor =
    activeDelta === null
      ? "text-muted-foreground"
      : activeTrend === "up"
        ? "text-success"
        : activeTrend === "down"
          ? "text-warning"
          : "text-muted-foreground";
  const valueText =
    activeCurrent !== null ? `${Math.round(activeCurrent * 100)}%` : "—";

  // Identify the two snapshots backing the delta so the callout can
  // name them explicitly ("vs May 14 snapshot") instead of using a
  // vague period label. Both indices come from the active metric's
  // own non-null entries — keeps the delta and the named date in
  // strict agreement even if other metrics have different gaps.
  const idxsWithValue = valuesForActive
    .map((v, i) => (v !== null && Number.isFinite(v) ? i : -1))
    .filter((i) => i >= 0);
  let priorDateLabel: string | null = null;
  let currentDateLabel: string | null = null;
  if (idxsWithValue.length >= 2) {
    const curIdx = idxsWithValue[idxsWithValue.length - 1];
    const priIdx = idxsWithValue[idxsWithValue.length - 2];
    const curDate = new Date(trajectory.weeks[curIdx]);
    const priDate = new Date(trajectory.weeks[priIdx]);
    const fmt = (d: Date): string =>
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (!Number.isNaN(curDate.getTime())) currentDateLabel = fmt(curDate);
    if (!Number.isNaN(priDate.getTime())) priorDateLabel = fmt(priDate);
  }

  const deltaText =
    activeDelta === null
      ? "no prior data"
      : `${activeDelta > 0 ? "+" : ""}${Math.round(
          activeDelta * 100,
        )} pts${
          priorDateLabel && currentDateLabel
            ? ` (${priorDateLabel} → ${currentDateLabel})`
            : priorDateLabel
              ? ` vs ${priorDateLabel}`
              : ""
        }`;

  const hasSeries = subjectMeasuredWeeks >= 2;
  const activeMeta = METRICS.find((m) => m.key === active)!;

  // Tab-specific description copy for the section header — same
  // structure across the three metrics so the header is the only
  // thing that changes between tabs.
  const descriptionForActive =
    active === "mention_rate"
      ? `${subjectName}'s share of AI answers across tracked industry questions, week over week.`
      : active === "share_of_voice"
        ? `${subjectName}'s slice of the entity pie — out of all entities AI named in answers, the share that's ${subjectName}.`
        : `Share of answers where ${subjectName} was listed first — week over week.`;

  return (
    <section>
      <SectionTitle
        eyebrow="Trend Over Time"
        title="How visibility has moved over recent snapshots"
        description={descriptionForActive}
        className="mb-4"
      />
      <Card className="p-5 md:p-6">
        {/* Tab pill control. Single rounded container with the active
            tab promoted to a white pill — mirrors the look of the
            screenshot the design references. */}
        <div
          role="tablist"
          aria-label="Trend metric"
          className="inline-flex rounded-full border border-border/80 bg-muted/40 p-1"
        >
          {METRICS.map((m) => {
            const isActive = m.key === active;
            return (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(m.key)}
                className={`inline-flex items-center rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${
                  isActive
                    ? "bg-background text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                    : "text-foreground/60 hover:text-foreground"
                }`}
              >
                {m.label}
                <MetricInfo text={m.tooltip} />
              </button>
            );
          })}
        </div>

        {hasSeries ? (
          <>
            {/* Current value + delta callout, matching the Hero KPI
                card's value/delta semantics so the same number reads
                the same color across the page. */}
            <div className="mt-5 flex items-baseline gap-3">
              <div className="text-[28px] font-semibold tracking-tight tabular-nums leading-none text-foreground">
                {valueText}
              </div>
              <div className={`flex items-center gap-1 text-sm ${deltaColor}`}>
                <TrendIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{deltaText}</span>
              </div>
            </div>

            <div className="mt-5 h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={wideSeries}
                  margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id={gradientId}
                      x1="0"
                      x2="0"
                      y1="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor={PRIMARY}
                        stopOpacity={0.18}
                      />
                      <stop offset="100%" stopColor={PRIMARY} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="oklch(0.91 0.008 250)"
                    strokeDasharray="2 4"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="w"
                    stroke="oklch(0.45 0.015 250)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                  />
                  <YAxis
                    domain={yDomain}
                    stroke="oklch(0.45 0.015 250)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <Tooltip
                    cursor={{ stroke: PRIMARY, strokeOpacity: 0.3 }}
                    content={<MultiSeriesTooltip subjectName={subjectName} />}
                  />
                  {/* Competitor lines render FIRST so the subject's
                      filled area paints over them — the focal line
                      always sits on top. Each competitor gets its
                      own hue from COMPETITOR_COLORS so the eye can
                      tell them apart when they cross or sit close
                      together; opacity is uniform across competitors
                      (color does the distinguishing). dot=false to
                      avoid competing with the subject's filled
                      dots. */}
                  {competitorTrajectories.map((c, i) => {
                    const color =
                      COMPETITOR_COLORS[i % COMPETITOR_COLORS.length];
                    return (
                      <Line
                        key={c.name}
                        type="monotone"
                        dataKey={c.name}
                        stroke={color}
                        strokeOpacity={COMPETITOR_OPACITY}
                        strokeWidth={1.5}
                        dot={false}
                        activeDot={{
                          r: 3,
                          fill: color,
                          fillOpacity: COMPETITOR_OPACITY,
                          strokeWidth: 0,
                        }}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    );
                  })}
                  <Area
                    type="monotone"
                    dataKey={subjectName}
                    stroke={PRIMARY}
                    strokeWidth={2.5}
                    fill={`url(#${gradientId})`}
                    dot={{ r: 2.5, fill: PRIMARY, strokeWidth: 0 }}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Inline legend so a reader knows which line is which
                without having to hover. Subject swatch is the bold
                primary; competitor swatches fade in the same
                stepped opacity as their lines. */}
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px]">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-[2px] w-4 rounded-full"
                  style={{ background: PRIMARY }}
                  aria-hidden
                />
                <span className="font-medium text-foreground">
                  {subjectName}
                </span>
              </span>
              {competitorTrajectories.map((c, i) => {
                const color = COMPETITOR_COLORS[i % COMPETITOR_COLORS.length];
                return (
                  <span key={c.name} className="inline-flex items-center gap-1.5">
                    <span
                      className="h-[2px] w-4 rounded-full"
                      style={{ background: color, opacity: COMPETITOR_OPACITY }}
                      aria-hidden
                    />
                    <span className="text-foreground/70">{c.name}</span>
                  </span>
                );
              })}
            </div>

            {/* SoV gets a definitional footnote because the pie-share
                definition used here differs from the per-entity
                "SoV" column in the Competitive Snapshot table below.
                The other two metrics don't need a footnote — they
                match their snapshot equivalents exactly. */}
            {active === "share_of_voice" && (
              <div className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
                Share of Voice here is pie-share: each entity&apos;s
                mentions ÷ (subject + deduped competitor mentions) per
                snapshot. The Competitive Snapshot table below uses a
                per-entity mention-rate definition, so the two
                won&apos;t match.
              </div>
            )}
          </>
        ) : (
          // All three metrics ship from the backend, so the only
          // reason a tab renders empty now is "fewer than two measured
          // snapshots" (one point isn't a trend). Same copy for all
          // three tabs — the situation is identical.
          <div className="mt-5 flex h-[260px] flex-col items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/20 px-6 text-center">
            <Activity
              className="h-7 w-7 text-foreground/30"
              aria-hidden
            />
            <div className="mt-3 text-[14px] font-medium text-foreground/75">
              Not enough {activeMeta.label.toLowerCase()} history to
              chart yet
            </div>
            <div className="mt-1 max-w-[460px] text-[12.5px] leading-relaxed text-foreground/55">
              Weekly snapshots will populate here as new refreshes
              land — typically two or more snapshots are needed before
              the line is meaningful.
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
