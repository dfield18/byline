"use client";

import { useEffect, useMemo, useState } from "react";
import type { SubjectOverview } from "@/lib/api";

// Mirror of the page-level constant so the donut + legend share one
// color ladder. Update both if the palette changes.
const SOURCE_TYPE_COLORS = [
  "oklch(0.28 0.16 245)",
  "oklch(0.45 0.16 245)",
  "oklch(0.60 0.14 245)",
  "oklch(0.74 0.11 245)",
  "oklch(0.85 0.07 245)",
  "oklch(0.91 0.04 245)",
  "oklch(0.95 0.02 245)",
];

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
  // effect only fires on meaningful changes (not on parent re-renders
  // that pass a fresh-reference but identical array).
  const dataKey = useMemo(
    () => sources.map((s) => `${s.type}:${s.name}`).join("|"),
    [sources],
  );
  useEffect(() => {
    setHovered(null);
  }, [dataKey]);

  if (!sources.length) return null;

  // Roll up by type, summing influence scores. Sort desc so heavier
  // categories appear first in both the donut and the legend.
  const byType = new Map<string, number>();
  for (const s of sources) {
    byType.set(s.type, (byType.get(s.type) || 0) + s.score);
  }
  const aggregated = Array.from(byType.entries())
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score);
  const total = aggregated.reduce((acc, x) => acc + x.score, 0) || 1;

  const size = 144;
  const strokeWidth = 26;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let cumOffset = 0;
  const segments = aggregated.map((t, i) => {
    const pct = (t.score / total) * 100;
    const dashLength = (pct / 100) * circumference;
    const seg = {
      color: SOURCE_TYPE_COLORS[i % SOURCE_TYPE_COLORS.length],
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
                      SOURCE_TYPE_COLORS[i % SOURCE_TYPE_COLORS.length],
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
