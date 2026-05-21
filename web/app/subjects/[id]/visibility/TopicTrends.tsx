"use client";

/**
 * Per-topic mention-rate trend lines for the Visibility hub.
 *
 * One faint line per tracked topic, all on the same chart, aligned
 * to the same week ticks as the headline Trend Over Time chart.
 * Answers "which topic is rising or falling" rather than the
 * snapshot bars above ("which topic is weakest right now"). Pure
 * complement — same data shape as Topic Recall but resolved across
 * time instead of just the latest snapshot.
 */
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SubjectOverview } from "@/lib/api";

// Qualitative palette for topic lines. Hues distinct enough that
// adjacent lines in the chart don't blur together, mid-lightness/
// mid-chroma so none dominates visually. Pulled in order of topic
// rank (highest-volume first) so the most-populated topic gets the
// most-readable color.
const TOPIC_COLORS = [
  "oklch(0.55 0.16 245)",  // blue
  "oklch(0.62 0.14 160)",  // teal
  "oklch(0.66 0.14 55)",   // amber
  "oklch(0.55 0.13 310)",  // violet
  "oklch(0.60 0.15 25)",   // red-orange
  "oklch(0.58 0.13 130)",  // green
  "oklch(0.62 0.10 240)",  // muted blue
  "oklch(0.65 0.10 90)",   // olive
];

function formatWeekTick(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}/${day}`;
}

function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

type TooltipPayloadEntry = {
  name?: string;
  value?: number | string;
  color?: string;
  payload?: { rawWeek?: string };
};

function TopicTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const entries = payload.filter(
    (p) =>
      p.value !== null &&
      p.value !== undefined &&
      Number.isFinite(Number(p.value)),
  );
  if (entries.length === 0) return null;
  const sorted = [...entries].sort(
    (a, b) => Number(b.value) - Number(a.value),
  );
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
    <div className="min-w-[220px] rounded-md border border-border bg-popover px-3 py-2 shadow-lg">
      <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {headerLabel}
      </div>
      <div className="space-y-1">
        {sorted.map((entry) => (
          <div
            key={entry.name}
            className="flex items-center gap-2 text-[12px]"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: entry.color }}
              aria-hidden
            />
            <span className="truncate text-foreground/80">
              {entry.name}
            </span>
            <span className="ml-auto tabular-nums font-medium text-foreground/85">
              {Math.round(Number(entry.value))}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TopicTrends({
  trajectoryWeeks,
  topicTrajectories,
}: {
  trajectoryWeeks: SubjectOverview["trajectory"]["weeks"];
  topicTrajectories: SubjectOverview["topic_trajectories"];
}) {
  // Build wide-format chart data: one row per week, one column per
  // topic. Recharts renders each Line off its own dataKey, keyed
  // by topic label. Pct values rounded to one decimal so the
  // tooltip doesn't lie about round-off.
  type Row = { w: string; rawWeek: string } & Record<
    string,
    number | string | null
  >;
  const toPct = (raw: number | null | undefined): number | null =>
    raw === null || raw === undefined || !Number.isFinite(raw)
      ? null
      : Math.round((raw as number) * 1000) / 10;

  const data: Row[] = trajectoryWeeks
    .map((w, i) => {
      const row: Row = { w: formatWeekTick(w), rawWeek: w };
      topicTrajectories.forEach((t) => {
        row[capitalizeFirst(t.label)] = toPct(t.mention_rate[i]);
      });
      return row;
    })
    .filter((row) =>
      topicTrajectories.some(
        (t) => typeof row[capitalizeFirst(t.label)] === "number",
      ),
    );

  if (data.length < 2 || topicTrajectories.length === 0) {
    return (
      <div className="flex h-[200px] flex-col items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/20 px-6 text-center">
        <div className="text-[14px] font-medium text-foreground/75">
          Not enough history to chart topic trends yet
        </div>
        <div className="mt-1 max-w-[440px] text-[12.5px] leading-relaxed text-foreground/55">
          Each tracked topic needs at least two measured snapshots
          before its line is meaningful.
        </div>
      </div>
    );
  }

  // Y-axis padding across all topic values combined so a high-
  // volume topic doesn't clip above a lower-volume one.
  const allValues: number[] = [];
  data.forEach((row) => {
    topicTrajectories.forEach((t) => {
      const v = row[capitalizeFirst(t.label)];
      if (typeof v === "number") allValues.push(v);
    });
  });
  let yDomain: [number, number] = [0, 100];
  if (allValues.length > 0) {
    const lo = Math.max(0, Math.floor(Math.min(...allValues) / 10) * 10);
    const hi = Math.min(100, Math.ceil(Math.max(...allValues) / 10) * 10);
    yDomain = lo === hi ? [Math.max(0, lo - 10), Math.min(100, hi + 10)] : [lo, hi];
  }

  return (
    <div>
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
          >
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
              cursor={{
                stroke: "oklch(0.45 0.015 250)",
                strokeOpacity: 0.3,
              }}
              content={<TopicTooltip />}
            />
            {topicTrajectories.map((t, i) => {
              const color = TOPIC_COLORS[i % TOPIC_COLORS.length];
              return (
                <Line
                  key={t.label}
                  type="monotone"
                  dataKey={capitalizeFirst(t.label)}
                  stroke={color}
                  strokeWidth={1.75}
                  strokeOpacity={0.85}
                  dot={false}
                  activeDot={{ r: 3.5, fill: color, strokeWidth: 0 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Inline legend below the chart — color swatch + topic label.
          Truncates long labels with a title tooltip for the full
          string. Wraps across multiple rows when there are many
          topics. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px]">
        {topicTrajectories.map((t, i) => {
          const color = TOPIC_COLORS[i % TOPIC_COLORS.length];
          return (
            <span
              key={t.label}
              className="inline-flex items-center gap-1.5"
              title={capitalizeFirst(t.label)}
            >
              <span
                className="h-[2px] w-4 rounded-full"
                style={{ background: color }}
                aria-hidden
              />
              <span className="max-w-[200px] truncate text-foreground/70">
                {capitalizeFirst(t.label)}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
