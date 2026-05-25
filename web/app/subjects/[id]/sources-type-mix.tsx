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

  // Pre-compute each segment's pct so the bar + legend reuse the
  // same numbers (no rounding drift between the visualization and
  // the readable map below it).
  const segments = aggregated.map((t, i) => ({
    name: t.name,
    pct: Math.round((t.score / total) * 100),
    color: SOURCE_TYPE_COLORS[paletteIndices[i]],
  }));

  // Top category callout — a single hero stat that anchors the
  // right column the way the donut used to. The donut occupied
  // ~144px of vertical space for what was usually 3-4 categories;
  // the new stacked-bar layout frees that space, and surfacing
  // "{News} drives {52%} of cited sources" gives the right column
  // an actual second-order insight instead of just a different
  // visualization of the same percentage list.
  const topSegment = segments[0];

  return (
    <div className="lg:border-l lg:border-border/60 lg:pl-8 pt-1">
      <div className="text-[11px] uppercase tracking-wider text-foreground/65 mb-3">
        By category
      </div>

      {/* Hero callout — top category name + share, success-toned so
          it reads as the actionable signal ("most of AI's citations
          flow from this kind of source"). One-line subtitle names
          the second-place category for context. */}
      {topSegment && (
        <div className="mb-4">
          <div className="text-[22px] font-medium tracking-tight tabular-nums text-foreground leading-none">
            {topSegment.pct}%
          </div>
          <div className="mt-1.5 text-[12.5px] text-foreground/70 leading-snug">
            of cited sources are{" "}
            <span className="font-medium text-foreground/90">
              {topSegment.name}
            </span>
            {segments.length > 1 && (
              <>
                {"; "}
                <span className="font-medium text-foreground/85">
                  {segments[1].name}
                </span>{" "}
                runs {segments[1].pct}%
              </>
            )}
            .
          </div>
        </div>
      )}

      {/* Horizontal stacked bar — replaces the prior donut. Same
          color palette + same hover-to-highlight behavior; the bar
          form factor takes far less vertical space (8px tall vs
          144px) and shows the cumulative composition left-to-right
          in the same way the eye scans the legend below. */}
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label="Source category mix"
      >
        {segments.map((s, i) => {
          const isDimmed = hovered !== null && hovered !== i;
          return (
            <div
              key={s.name}
              className="h-full transition-opacity"
              style={{
                width: `${s.pct}%`,
                background: s.color,
                opacity: isDimmed ? 0.35 : 1,
                cursor: "pointer",
              }}
              title={`${s.name}: ${s.pct}%`}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => setHovered((cur) => (cur === i ? null : i))}
            />
          );
        })}
      </div>

      {/* Legend with full category names + percentages. Bar segment +
          legend row drive the same hovered state — hover one
          highlights the other. Tap-toggles on legend rows for touch
          parity with bar segments. */}
      <ul className="mt-4 space-y-2">
        {segments.map((s, i) => {
          const isDimmed = hovered !== null && hovered !== i;
          return (
            <li
              key={s.name}
              className="flex items-center justify-between gap-2 text-[13px] transition-opacity cursor-pointer"
              style={{ opacity: isDimmed ? 0.45 : 1 }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => setHovered((cur) => (cur === i ? null : i))}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2 w-2 rounded-sm shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                <span className="truncate text-foreground/85">{s.name}</span>
              </span>
              <span className="tabular-nums font-medium text-foreground/70">
                {s.pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
