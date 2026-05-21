"use client";

/**
 * Visibility Trend chart.
 *
 * Single-metric (mention rate) area chart over recent snapshots,
 * with up to two faint topic overlay lines so the reader can see
 * "are my strongest / weakest topics moving in the same direction
 * as my overall visibility?". Generic `overlays` prop keeps the
 * component reusable — the page picks which two topics to surface.
 *
 * Designed as the focal chart on the Visibility hub's "Visibility
 * Trend" section. Pairs with a "What changed" insight card to the
 * right (rendered by the page, not this component).
 */
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
import type { SubjectOverview } from "@/lib/api";

const PRIMARY = "var(--primary)";

// Backend ships ISO date strings (e.g. "2026-05-13"). Render as MM/DD
// for compact tick labels.
function formatWeekTick(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}/${day}`;
}

type Overlay = {
  name: string;             // legend label
  color: string;            // line stroke color
  values: (number | null)[]; // aligned to trajectoryWeeks
};

type TooltipPayloadEntry = {
  name?: string;
  value?: number | string;
  color?: string;
  payload?: { rawWeek?: string };
};

function ChartTooltip({
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
  const entries = payload.filter(
    (p) =>
      p.value !== null &&
      p.value !== undefined &&
      Number.isFinite(Number(p.value)),
  );
  if (entries.length === 0) return null;
  // Subject row pinned to top, overlays sorted by value desc below.
  const sorted = [...entries].sort((a, b) => {
    if (a.name === subjectName) return -1;
    if (b.name === subjectName) return 1;
    return Number(b.value) - Number(a.value);
  });
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

export function TrendOverTime({
  subjectName,
  trajectoryWeeks,
  subjectValues,
  overlays,
}: {
  subjectName: string;
  trajectoryWeeks: SubjectOverview["trajectory"]["weeks"];
  subjectValues: (number | null)[];     // aligned to trajectoryWeeks
  overlays: Overlay[];                  // up to 2-3 topic lines
}) {
  // Wide-format chart data: one row per week, one column per entity.
  type Row = { w: string; rawWeek: string } & Record<
    string,
    number | string | null
  >;
  const toPct = (raw: number | null | undefined): number | null =>
    raw === null || raw === undefined || !Number.isFinite(raw)
      ? null
      : Math.round((raw as number) * 1000) / 10;

  const allNames = [subjectName, ...overlays.map((o) => o.name)];
  const data: Row[] = trajectoryWeeks
    .map((w, i) => {
      const row: Row = { w: formatWeekTick(w), rawWeek: w };
      row[subjectName] = toPct(subjectValues[i]);
      overlays.forEach((o) => {
        row[o.name] = toPct(o.values[i]);
      });
      return row;
    })
    .filter((row) => allNames.some((k) => typeof row[k] === "number"));

  const subjectMeasuredWeeks = data.filter(
    (r) => typeof r[subjectName] === "number",
  ).length;

  if (subjectMeasuredWeeks < 2) {
    return (
      <div className="flex h-[260px] flex-col items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/20 px-6 text-center">
        <div className="text-[14px] font-medium text-foreground/75">
          Not enough history to chart yet
        </div>
        <div className="mt-1 max-w-[420px] text-[12.5px] leading-relaxed text-foreground/55">
          Weekly snapshots populate this chart as new refreshes land.
          Typically two or more snapshots are needed before a trend
          line is meaningful.
        </div>
      </div>
    );
  }

  // Y-axis padding across all entity values combined.
  const allValues: number[] = [];
  data.forEach((row) => {
    allNames.forEach((k) => {
      const v = row[k];
      if (typeof v === "number") allValues.push(v);
    });
  });
  let yDomain: [number, number] = [0, 100];
  if (allValues.length > 0) {
    const lo = Math.max(0, Math.floor(Math.min(...allValues) / 10) * 10);
    const hi = Math.min(100, Math.ceil(Math.max(...allValues) / 10) * 10);
    yDomain =
      lo === hi
        ? [Math.max(0, lo - 10), Math.min(100, hi + 10)]
        : [lo, hi];
  }

  return (
    <div>
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height={260} minWidth={1}>
          <ComposedChart
            data={data}
            margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.18} />
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
              content={<ChartTooltip subjectName={subjectName} />}
            />
            {overlays.map((o) => (
              <Line
                key={o.name}
                type="monotone"
                dataKey={o.name}
                stroke={o.color}
                strokeOpacity={0.75}
                strokeWidth={1.5}
                dot={false}
                activeDot={{
                  r: 3,
                  fill: o.color,
                  fillOpacity: 0.75,
                  strokeWidth: 0,
                }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
            <Area
              type="monotone"
              dataKey={subjectName}
              stroke={PRIMARY}
              strokeWidth={2.5}
              fill="url(#trend-fill)"
              dot={{ r: 2.5, fill: PRIMARY, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px]">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-[2px] w-4 rounded-full"
            style={{ background: PRIMARY }}
            aria-hidden
          />
          <span className="font-medium text-foreground">{subjectName}</span>
        </span>
        {overlays.map((o) => (
          <span key={o.name} className="inline-flex items-center gap-1.5">
            <span
              className="h-[2px] w-4 rounded-full"
              style={{ background: o.color, opacity: 0.75 }}
              aria-hidden
            />
            <span
              className="max-w-[220px] truncate text-foreground/70"
              title={o.name}
            >
              {o.name}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
