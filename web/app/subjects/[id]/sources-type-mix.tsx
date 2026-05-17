"use client";

import { useMemo, useState } from "react";
import type { SubjectOverview } from "@/lib/api";

// Mirror of the page-level constant so the donut + legend share one
// color ladder. Update both if the palette changes.
// Returns N indices evenly distributed across [0, paletteLen - 1].
// Used to pick which slots of the 7-stop blue ramp to assign to a
// donut with N slices so the slices span the full dark→light range
// instead of stacking at the dark end. Examples (paletteLen=7):
//   N=1 → [0]
//   N=2 → [0, 6]
//   N=3 → [0, 3, 6]
//   N=4 → [0, 2, 4, 6]
//   N=7 → [0, 1, 2, 3, 4, 5, 6]
function pickPaletteIndices(n: number, paletteLen: number): number[] {
  if (n <= 1) return [0];
  if (n >= paletteLen) {
    return Array.from({ length: paletteLen }, (_, i) => i);
  }
  return Array.from({ length: n }, (_, i) =>
    Math.round((i * (paletteLen - 1)) / (n - 1)),
  );
}

// Sequential blue ramp (hue 245) used by the donut + legend swatches.
// Lightness is spread roughly evenly from 0.28 → 0.97 so adjacent
// slices have visible contrast (the prior ramp compressed the light
// end — only 0.04 lightness between the last two stops). Chroma fades
// from 0.16 at the darkest to 0.025 at the lightest, which is the
// most blue you can hold at near-white lightness while still reading
// as "blue tint" rather than gray. Darkest stop (0.28 0.16 245)
// unchanged so the largest category keeps its current weight.
const SOURCE_TYPE_COLORS = [
  "oklch(0.28 0.16 245)",
  "oklch(0.40 0.16 245)",
  "oklch(0.52 0.15 245)",
  "oklch(0.64 0.13 245)",
  "oklch(0.76 0.10 245)",
  "oklch(0.87 0.06 245)",
  "oklch(0.97 0.025 245)",
];

type DonutSegment = {
  color: string;
  dashArray: string;
  dashOffset: number;
  name: string;
  pct: number;
};

// Pure helper kept outside the component so the running-sum mutation
// (`cumOffset += dashLength`) sits in plain JS rather than inside a
// React render closure — satisfies react-hooks/immutability without
// forcing an O(n²) reduce-and-spread dance for a ≤7-element array.
function computeDonutSegments(
  aggregated: { name: string; score: number }[],
  total: number,
  circumference: number,
  paletteIndices: number[],
): DonutSegment[] {
  let cumOffset = 0;
  return aggregated.map((t, i) => {
    const pct = (t.score / total) * 100;
    const dashLength = (pct / 100) * circumference;
    const seg: DonutSegment = {
      color: SOURCE_TYPE_COLORS[paletteIndices[i]],
      dashArray: `${dashLength} ${circumference - dashLength}`,
      // Negative offset advances the start point by the cumulative
      // length already drawn by prior segments.
      dashOffset: -cumOffset,
      name: t.name,
      pct: Math.round(pct),
    };
    cumOffset += dashLength;
    return seg;
  });
}

export function SourcesTypeMix({
  sources,
}: {
  sources: SubjectOverview["sources"];
}) {
  // Hovered/selected segment index, or null when nothing is active.
  // Drives the center label content + segment opacity dimming.
  // Single state for both hover (desktop) and tap-toggle (touch).
  const [hovered, setHovered] = useState<number | null>(null);

  // Reset the index whenever the sources data shape changes. Without
  // this, a stale `hovered` after a Regenerate that adds/removes a
  // category could highlight the wrong segment, or point out of
  // bounds. Stable identity key derived from category names so the
  // reset only fires on meaningful changes (not on parent re-renders
  // that pass a fresh-reference but identical array).
  //
  // Uses the React-recommended "adjusting state during render" pattern
  // (https://react.dev/reference/react/useState#storing-information-from-previous-renders)
  // rather than useEffect — avoids the wasted commit + brief flash of
  // stale highlighting that an effect-based reset produces.
  const dataKey = useMemo(
    () => sources.map((s) => `${s.type}:${s.name}`).join("|"),
    [sources],
  );
  const [prevDataKey, setPrevDataKey] = useState(dataKey);
  if (dataKey !== prevDataKey) {
    setPrevDataKey(dataKey);
    setHovered(null);
  }

  if (!sources.length) return null;

  // Roll up by type, summing influence scores. Sort desc so heavier
  // categories appear first in both the donut and the legend.
  const byType = new Map<string, number>();
  for (const s of sources) {
    byType.set(s.type, (byType.get(s.type) || 0) + s.score);
  }
  const allAggregated = Array.from(byType.entries())
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score);

  // Color palette has 7 slots. When more than 7 distinct categories
  // exist, the modulo wrap makes two categories share the same hue —
  // indistinguishable in both the donut and the legend. Collapse the
  // tail into a single "Other (N more)" bucket instead. Reserve one
  // palette slot for "Other" so the top (palette.length - 1) named
  // categories each still get their own color.
  const PALETTE_NAMED_SLOTS = SOURCE_TYPE_COLORS.length - 1;
  let aggregated: { name: string; score: number }[];
  if (allAggregated.length > SOURCE_TYPE_COLORS.length) {
    const top = allAggregated.slice(0, PALETTE_NAMED_SLOTS);
    const rest = allAggregated.slice(PALETTE_NAMED_SLOTS);
    const otherScore = rest.reduce((acc, x) => acc + x.score, 0);
    aggregated = [
      ...top,
      { name: `Other (${rest.length} more)`, score: otherScore },
    ];
  } else {
    aggregated = allAggregated;
  }
  const total = aggregated.reduce((acc, x) => acc + x.score, 0) || 1;

  // Pick N evenly-spaced indices from the 7-stop blue ramp instead
  // of taking the first N. With 3 categories the prior approach used
  // indices 0, 1, 2 — three dark blues that read nearly identical;
  // the spread approach uses 0, 3, 6 (dark → medium → light) so each
  // slice gets a visually distinct shade. Same idea for 2 / 4 / 5 /
  // 6 categories: stretch across the full palette range rather than
  // clustering at the dark end.
  const paletteIndices = pickPaletteIndices(
    aggregated.length,
    SOURCE_TYPE_COLORS.length,
  );

  const size = 144;
  const strokeWidth = 26;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const segments = computeDonutSegments(
    aggregated,
    total,
    circumference,
    paletteIndices,
  );

  const hoveredSeg = hovered !== null ? segments[hovered] : null;

  return (
    <div className="lg:border-l lg:border-border/60 lg:pl-8 pt-1">
      <div className="text-[11px] uppercase tracking-wider text-foreground/65 mb-3">
        By category
      </div>

      {/* Donut chart — same color scheme (shades of blue) as the
          prior stacked-bar variant. Hovering a segment highlights it,
          dims the others, and surfaces its name + percentage in the
          center label. The legend below carries the same info
          statically for at-a-glance reading. */}
      <div className="relative flex justify-center">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="h-[144px] w-[144px]"
          role="img"
          aria-label="Source category mix"
        >
          {/* Background ring — fills any rounding gaps between
              segments and gives the donut a single-shape silhouette
              even when one category dominates. */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={strokeWidth}
          />
          {/* Segments — rotate -90deg so the first segment starts at
              12 o'clock. Each segment is a stroked circle whose
              dash-array exposes only its slice of the circumference.
              onClick toggles the selection for touch devices (which
              don't fire hover events). On desktop, hover and tap
              both work; tapping the same segment a second time
              clears it. */}
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {segments.map((s, i) => {
              const isHovered = hovered === i;
              const isDimmed = hovered !== null && !isHovered;
              return (
                <circle
                  key={s.name}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={s.dashArray}
                  strokeDashoffset={s.dashOffset}
                  opacity={isDimmed ? 0.35 : 1}
                  style={{
                    cursor: "pointer",
                    transition: "opacity 120ms ease",
                  }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setHovered((cur) => (cur === i ? null : i))}
                />
              );
            })}
          </g>
        </svg>

        {/* Center label — absolutely positioned over the donut hole.
            HTML (not SVG <text>) so the type stays crisp and supports
            multi-line truncation cleanly. Shows the hovered segment's
            name + percentage; renders empty when nothing's hovered so
            the center reads as intentional empty space. */}
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
          aria-live="polite"
        >
          {hoveredSeg && (
            <>
              <div className="text-lg font-semibold tracking-tight text-foreground leading-none">
                {hoveredSeg.pct}%
              </div>
              <div className="mt-1 text-[10px] text-foreground/70 leading-tight max-w-[80px] line-clamp-2">
                {hoveredSeg.name}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Legend with full category names + percentages. The donut is
          the at-a-glance visual; the legend is the readable map. Both
          surfaces (donut segment + legend row) drive the same hovered
          state — hovering one highlights the other. Tap-toggles on
          legend rows for touch parity with the donut segments. */}
      <ul className="mt-4 space-y-2">
        {aggregated.map((t, i) => {
          const isHovered = hovered === i;
          const isDimmed = hovered !== null && !isHovered;
          return (
            <li
              key={t.name}
              className="flex items-center justify-between gap-2 text-[13px] transition-opacity cursor-pointer"
              style={{ opacity: isDimmed ? 0.45 : 1 }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => setHovered((cur) => (cur === i ? null : i))}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2 w-2 rounded-sm shrink-0"
                  style={{
                    backgroundColor:
                      SOURCE_TYPE_COLORS[paletteIndices[i]],
                  }}
                />
                <span className="truncate text-foreground/85">{t.name}</span>
              </span>
              <span className="tabular-nums font-medium text-foreground/70">
                {Math.round((t.score / total) * 100)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
