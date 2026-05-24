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
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SubjectOverview } from "@/lib/api";
import type { IconType } from "react-icons";
import {
  SiOpenai,
  SiAnthropic,
  SiGooglegemini,
  SiPerplexity,
} from "react-icons/si";

// Brand-mark icons via react-icons/si — same map the
// visibility/page.tsx uses for the heatmap row labels and the
// per-platform KPIs table. Kept duplicated here rather than
// extracted to a shared util so this component stays self-
// contained; both maps are short and slug-stable.
const PLATFORM_ICON: Record<string, IconType> = {
  chatgpt: SiOpenai,
  gemini: SiGooglegemini,
  claude: SiAnthropic,
  perplexity: SiPerplexity,
};

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
  // Optional platform slug used to render a brand-mark icon
  // (react-icons/si) next to the legend chip — same pattern the
  // Per-Platform Snapshot heatmap and the per-platform KPIs
  // table on this page use. Caller (visibility/page.tsx) passes
  // `iconSlug: p.slug` for platform overlays; topic overlays
  // omit it and the chip falls back to just a colored bar + name.
  iconSlug?: string;
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
          // Pick a brand icon when the entry's name lowercases to
          // one of our known platform slugs ("ChatGPT" → "chatgpt",
          // "Gemini" → "gemini", etc.). Topic-name entries (which
          // never match a slug) fall through to the colored dot.
          // Same icon set used by the chip legend below + the
          // heatmap + the per-platform KPIs table.
          const TooltipIcon =
            PLATFORM_ICON[(entry.name ?? "").toLowerCase()];
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
              {TooltipIcon && (
                <TooltipIcon
                  className="h-3 w-3 shrink-0 text-foreground/65"
                  aria-hidden
                />
              )}
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
  height = 320,
  subjectOnlyAxis = false,
  showEndLabels = false,
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
  // Chart pixel height for both populated and empty states. Default
  // 320 keeps the Trend section in proportion with the other
  // Visibility sections (summary band, tables) rather than letting
  // a single 0-100% chart dominate the tab. Competition spoke
  // overrides to a custom value when its overlay count warrants more
  // vertical room.
  height?: number;
  // When true, the data-driven Y-axis fits ONLY the subject's values
  // — overlays are ignored for axis computation. Used by the
  // Competition spoke where overlays are competitor mention rates
  // (often much lower than the subject) so an all-series fit would
  // stretch the axis to ~0-100% and hide the subject's movement in
  // the top fifth. Visibility leaves this off because its overlays
  // are per-platform breakdowns of the SAME metric — they cluster
  // with the subject, so the all-series fit produces an equivalently
  // tight axis without clipping any series.
  subjectOnlyAxis?: boolean;
  // When true, each series gets an inline label at the right end of
  // its line (subject name + competitor names). Opt-in because the
  // label-rail collision logic gracefully spaces ≤3-4 well-separated
  // series but falls apart when many lines converge at the same Y
  // value (e.g. Competition's 7 lines clustering at 40% mention
  // rate stacks 5 labels in a tight vertical column disconnected
  // from where their lines end). Callers with well-spread or few-
  // overlay charts opt in; dense-cluster cases rely on the chip
  // legend below instead.
  showEndLabels?: boolean;
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
    // Empty state matches the populated chart's pixel height so the
    // section reserves the same vertical space whether or not the
    // chart has rendered. Avoids a layout jump and keeps the tab's
    // section proportions consistent across populated / unpopulated
    // states for the same subject.
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/20 px-6 text-center"
        style={{ height }}
      >
        <div className="text-[12.5px] leading-relaxed text-foreground/65">
          Not enough history to chart yet — chart populates once a
          second weekly snapshot lands.
        </div>
      </div>
    );
  }

  // Data-driven Y-axis. The earlier hardcoded 0-100% domain crushed
  // a 10-20pt decline into the top fifth of the chart and read as
  // "basically flat", masking the one declining-visibility story the
  // tab exists to surface. The replacement fits the axis to the
  // visible data with a small pad so movement is legible, while
  // keeping the scale honest:
  //   - axis is rounded to a multiple of `step` (5, 10, or 20)
  //   - bounds are clamped to [0, 105] so we never invent a negative
  //     percentage or run past the 100% ceiling without a small lip
  //   - ~4 evenly-spaced ticks across the resulting range
  //   - tick labels still spell out the percent so the reader sees
  //     immediately that the axis isn't a 0-100% scale
  // Axis-fitting value set. Default = every series (subject +
  // overlays); when `subjectOnlyAxis` is true, just the subject so
  // the axis tightens to the subject's range and the subject's
  // movement reads clearly even when overlays span a much wider
  // band. Overlay lines still render normally — they just don't
  // pull the axis around.
  const axisNames = subjectOnlyAxis ? [subjectName] : allNames;
  const allValues: number[] = [];
  data.forEach((row) => {
    axisNames.forEach((k) => {
      const v = row[k];
      if (typeof v === "number") allValues.push(v);
    });
  });
  const { yDomain, yTicks } = (() => {
    if (allValues.length === 0) {
      return { yDomain: [0, 100] as [number, number], yTicks: [0, 25, 50, 75, 100] };
    }
    const dataMin = Math.min(...allValues);
    const dataMax = Math.max(...allValues);
    const pad = 5;
    // Floor on the axis span so a tight cluster (e.g. subject-only
    // axis on a subject hugging 90-100%) doesn't collapse to a
    // 10-point window with only 3 ticks. Without this, the axis
    // crushes against the data and any nearby off-axis lines get
    // clipped at the chart floor. 25 keeps a comfortable 4-5 tick
    // count at step 5 and gives competitor lines a few points of
    // visible territory below the subject's band.
    const MIN_AXIS_SPAN = 25;
    const dataRange = dataMax - dataMin;
    const paddedRange = Math.max(dataRange + 2 * pad, MIN_AXIS_SPAN);
    // Pick a step that yields ~4 gridlines across the padded range.
    // Small ranges (tight cluster) get a 5pt step; medium ranges get
    // 10pt; very wide ranges get 20pt so we don't print 8+ tick
    // labels on a short axis.
    const step = paddedRange <= 25 ? 5 : paddedRange <= 50 ? 10 : 20;
    // Distribute the (possibly-expanded) padding around the data
    // midpoint so the dataset sits centered in its breathing room
    // rather than pinned to one edge.
    const halfExtra = (paddedRange - dataRange) / 2;
    const rawMin = dataMin - halfExtra;
    const rawMax = dataMax + halfExtra;
    const min = Math.max(0, Math.floor(rawMin / step) * step);
    // Domain can breathe up to 105 so a series at the 100% ceiling
    // doesn't fuse with the chart frame, but tick labels stop at
    // 100 because "105%" reads as nonsensical for a share metric.
    const max = Math.min(105, Math.ceil(rawMax / step) * step);
    const tickMax = Math.min(100, max);
    const ticks: number[] = [];
    for (let t = min; t <= tickMax; t += step) ticks.push(t);
    return { yDomain: [min, max] as [number, number], yTicks: ticks };
  })();

  // End-of-line labels: for every series with a value at the chart's
  // rightmost data point, render its name as inline text next to the
  // line's terminus. Eye stays on the chart instead of bouncing to
  // the chip legend below. Series that ended earlier in the window
  // (no value at the final data row) stay legend-only — placing a
  // label mid-chart for them would read as a value annotation on the
  // wrong data point.
  //
  // Collision avoidance: when two or more series end at similar Y
  // values (e.g. 5 competitors clustered at 40% mention rate), the
  // labels would stack on top of each other. Pre-compute each
  // label's pixel-Y offset via a label-rail algorithm: sort by
  // natural pixel-Y ascending, walk through, push each subsequent
  // label down by at least MIN_LABEL_SPACING_PX if it would collide
  // with the previous one. The resulting offset is applied per-label
  // inside the LabelList render below.
  const MIN_LABEL_SPACING_PX = 14;
  const LABEL_CHART_MARGIN_TOP = 12;
  const LABEL_CHART_MARGIN_BOTTOM = 4;
  const labelChartCanvasH =
    height - LABEL_CHART_MARGIN_TOP - LABEL_CHART_MARGIN_BOTTOM;
  // Project a percent value (in yDomain space) to its pixel Y inside
  // the chart canvas. Inverted because SVG Y increases downward.
  const yPxOfPct = (pct: number): number => {
    if (yDomain[1] === yDomain[0]) {
      return LABEL_CHART_MARGIN_TOP + labelChartCanvasH / 2;
    }
    return (
      LABEL_CHART_MARGIN_TOP +
      ((yDomain[1] - pct) / (yDomain[1] - yDomain[0])) * labelChartCanvasH
    );
  };
  const lastRowIdx = data.length - 1;
  const lastRow = lastRowIdx >= 0 ? data[lastRowIdx] : null;
  type EndLabel = {
    name: string;
    value: number;
    color: string;
    isSubject: boolean;
    naturalY: number;
  };
  const endLabelInputs: EndLabel[] = [];
  if (lastRow) {
    const subjVal = lastRow[subjectName];
    if (typeof subjVal === "number") {
      endLabelInputs.push({
        name: subjectName,
        value: subjVal,
        color: PRIMARY,
        isSubject: true,
        naturalY: yPxOfPct(subjVal),
      });
    }
    overlays.forEach((o) => {
      const v = lastRow[o.name];
      if (typeof v === "number") {
        endLabelInputs.push({
          name: o.name,
          value: v,
          color: o.color,
          isSubject: false,
          naturalY: yPxOfPct(v),
        });
      }
    });
  }
  const sortedByY = [...endLabelInputs].sort(
    (a, b) => a.naturalY - b.naturalY,
  );
  const labelYByName: Record<string, number> = {};
  let lastPlacedY = -Infinity;
  for (const e of sortedByY) {
    const placedY = Math.max(e.naturalY, lastPlacedY + MIN_LABEL_SPACING_PX);
    labelYByName[e.name] = placedY;
    lastPlacedY = placedY;
  }

  return (
    <div>
      {/* Wrapper height tracks the `height` prop so Visibility (320,
          default) and Competition (340, explicit) each render at
          their own size. Wrapper used to be hardcoded h-[420px],
          which left dead space below the chart whenever a caller
          passed a smaller height. */}
      <div className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height={height} minWidth={1}>
          <ComposedChart
            data={data}
            // Right margin widens only when end-of-line labels are
            // enabled — without labels, the chart uses the original
            // tight 16px right margin to maximize plot area. With
            // labels, ~130px reserves room for the longest entity
            // name without clipping.
            margin={{
              top: 12,
              right: showEndLabels ? 130 : 16,
              left: 0,
              bottom: 4,
            }}
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
              >
                {showEndLabels && (
                  <LabelList
                    dataKey={o.name}
                    content={(props) => {
                      if (
                        props.index !== lastRowIdx ||
                        typeof props.value !== "number" ||
                        labelYByName[o.name] === undefined
                      ) {
                        return null;
                      }
                      const px =
                        typeof props.x === "number" ? props.x : 0;
                      return (
                        <text
                          x={px + 8}
                          y={labelYByName[o.name]}
                          dy="0.35em"
                          fontSize={11}
                          fill="var(--foreground)"
                          fillOpacity={0.75}
                          fontWeight={400}
                        >
                          {o.name}
                        </text>
                      );
                    }}
                  />
                )}
              </Line>
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
            >
              {showEndLabels && (
                <LabelList
                  dataKey={subjectName}
                  content={(props) => {
                    if (
                      props.index !== lastRowIdx ||
                      typeof props.value !== "number" ||
                      labelYByName[subjectName] === undefined
                    ) {
                      return null;
                    }
                    const px =
                      typeof props.x === "number" ? props.x : 0;
                    return (
                      <text
                        x={px + 8}
                        y={labelYByName[subjectName]}
                        dy="0.35em"
                        fontSize={11}
                        fill="var(--foreground)"
                        fontWeight={600}
                      >
                        {subjectName}
                      </text>
                    );
                  }}
                />
              )}
            </Line>
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
        {overlays.map((o) => {
          const Icon = o.iconSlug ? PLATFORM_ICON[o.iconSlug] : undefined;
          return (
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
              {Icon && (
                <Icon
                  className="h-3 w-3 text-foreground/65 shrink-0 transition-opacity"
                  style={{ opacity: opacityFor(o.name, 1) }}
                  aria-hidden
                />
              )}
              <span
                className="max-w-[220px] truncate text-foreground/70 transition-opacity"
                title={o.name}
                style={{ opacity: opacityFor(o.name, 1) }}
              >
                {o.name}
              </span>
            </button>
          );
        })}
      </div>
      {helperText && (
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          {helperText}
        </p>
      )}
    </div>
  );
}
