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
import { useState } from "react";
import {
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
  helperText,
  overlayOpacity = 0.7,
  height = 420,
}: {
  subjectName: string;
  trajectoryWeeks: SubjectOverview["trajectory"]["weeks"];
  subjectValues: (number | null)[];     // aligned to trajectoryWeeks
  overlays: Overlay[];                  // up to 2-3 topic lines
  // Optional small caption rendered below the chart legend, used
  // by callers (e.g. the Competition spoke) to anchor what the
  // mention-rate values mean for a non-technical reader.
  helperText?: string;
  // Stroke opacity for overlay (non-subject) lines. Default 0.7 so
  // competitor / per-platform lines sit a touch behind the subject.
  // Competition spoke passes a lower value (~0.5) when many
  // competitor lines crowd the chart and the subject needs to read
  // as the focal series.
  overlayOpacity?: number;
  // Chart pixel height. Default 420 keeps the Visibility spoke
  // unchanged; the Competition spoke passes a smaller value so
  // the line movements feel less wavy when many overlay lines
  // are competing for vertical room.
  height?: number;
}) {
  // Hover-to-isolate: when the user hovers a legend chip (or a line),
  // drop the opacity of every non-hovered series so the chosen one
  // pops. `hoveredName === null` = no isolation; default rendering.
  // Both subject and overlay lines react to this so the user can
  // focus on a single series even when four overlays + the subject
  // line are crowding the chart.
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const opacityFor = (name: string, base: number): number =>
    hoveredName === null || hoveredName === name ? base : 0.12;
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
  // Render the full 0-100% conceptual range but pad the actual
  // domain to 105 so a series that hugs the ceiling (100%) sits a
  // hair below the chart frame instead of fusing with it. Explicit
  // ticks keep the visible axis labels at 0/25/50/75/100 so the
  // chart still reads as a 0-100% scale. A truncated axis is still
  // off-limits — that would exaggerate movement.
  const yDomain: [number, number] = [0, 105];
  const yTicks = [0, 25, 50, 75, 100];

  return (
    <div>
      {/* Chart canvas at 420px — bumped from 340 because with 4-5
          series in the upper 50-100% band the old height still made
          the lines weave on top of each other. The taller canvas
          combined with the tighter Y-domain (above) lets the cluster
          spread vertically instead of stacking. */}
      <div className="h-[420px] w-full">
        <ResponsiveContainer width="100%" height={height} minWidth={1}>
          <ComposedChart
            data={data}
            margin={{ top: 12, right: 16, left: 0, bottom: 4 }}
          >
            {/* Gradient `<defs>` removed when the subject's area
                fill was replaced with a heavier line stroke — the
                fill was visually dominant and exaggerated the
                subject's weight in the chart. */}
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
              // minTickGap=40 lets Recharts thin the x-axis labels
              // automatically — at 12 weekly snapshots the default
              // would print every date, which crowds the axis. Now
              // labels render at a comfortable cadence regardless of
              // window width or how many weeks the trajectory has.
              minTickGap={40}
            />
            <YAxis
              domain={yDomain}
              ticks={yTicks}
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
                // Overlay strokes set to 70% opacity so the
                // subject's primary line + area fill stays clearly
                // dominant in the cluster — fully-opaque competitor
                // lines were competing for visual weight and making
                // the chart read as "lots of lines" instead of "one
                // subject, several context lines."
                strokeOpacity={opacityFor(o.name, overlayOpacity)}
                strokeWidth={2}
                dot={false}
                activeDot={{
                  r: 3,
                  fill: o.color,
                  fillOpacity: 0.85,
                  strokeWidth: 0,
                }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
            <Line
              type="monotone"
              dataKey={subjectName}
              stroke={PRIMARY}
              // Subject line gets a heavier stroke (3.5px vs the 2px
              // competitor lines) so the focal entity reads clearly
              // as the lead series — especially important on the
              // Competition spoke where 6 competitor lines crowd
              // the chart. Going past ~4px starts to feel chunky;
              // 3.5px is the "noticeably thicker" sweet spot.
              strokeWidth={3.5}
              strokeOpacity={opacityFor(subjectName, 1)}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend doubles as the hover-isolate control. Hovering a
          chip (mouse or keyboard focus) drops the opacity of every
          other series so the chosen line pops; leaving restores the
          full chart. Keyboard users get the same behavior via
          `focus` / `blur` because the chips are tabbable buttons. */}
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11.5px]">
        <button
          type="button"
          onMouseEnter={() => setHoveredName(subjectName)}
          onMouseLeave={() => setHoveredName(null)}
          onFocus={() => setHoveredName(subjectName)}
          onBlur={() => setHoveredName(null)}
          className="inline-flex items-center gap-1.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <span
            className="h-[2px] w-4 rounded-full"
            style={{
              background: PRIMARY,
              opacity: opacityFor(subjectName, 1),
            }}
            aria-hidden
          />
          <span
            className="font-medium text-foreground transition-opacity"
            style={{ opacity: opacityFor(subjectName, 1) }}
          >
            {subjectName}
          </span>
        </button>
        {/* Legend follows the same order as the chart's line data
            (backend ships overlays sorted by total volume desc).
            Aligning legend and chart ordering means a reader can
            match "first chip" → "most-mentioned series" without
            re-mapping between alphabetical chips and volume-ranked
            lines. */}
        {overlays.map((o) => (
            <button
              key={o.name}
              type="button"
              onMouseEnter={() => setHoveredName(o.name)}
              onMouseLeave={() => setHoveredName(null)}
              onFocus={() => setHoveredName(o.name)}
              onBlur={() => setHoveredName(null)}
              className="inline-flex items-center gap-1.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <span
                className="h-[2px] w-4 rounded-full"
                style={{
                  background: o.color,
                  opacity: opacityFor(o.name, overlayOpacity),
                }}
                aria-hidden
              />
              <span
                className="max-w-[220px] truncate text-foreground/70 transition-opacity"
                title={o.name}
                style={{ opacity: opacityFor(o.name, 1) }}
              >
                {o.name}
              </span>
            </button>
          ))}
      </div>
      {helperText && (
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          {helperText}
        </p>
      )}
    </div>
  );
}
