"use client";

/**
 * Position-vs-Share strip plot for the Competitive Visibility section.
 *
 * Renders one row per entity, sorted by avg mention position
 * ascending (best position at top). Each row carries the entity name,
 * a horizontal track with a colored dot placed at the entity's
 * position, and the entity's Share of Voice on the right.
 *
 * Replaces the prior recharts ScatterChart, which collapsed when
 * multiple entities sat at near-identical (position, SoV) coordinates
 * (e.g. Vance/Rubio both at ~3.0/50% — dots stacked, labels collided
 * despite a five-tier collision-avoidance pass). A row-per-entity
 * layout makes overlap structurally impossible: the y dimension just
 * disambiguates names, not encodes data. The diagonal that emerges
 * when SoV correlates inversely with position still reads as the same
 * "leaders top-left, marginals bottom-right" shape the scatter aimed
 * for.
 *
 * Component name retained for caller-import stability — the file
 * still exports `CompetitiveScatter`, even though the visualization
 * is no longer a 2D scatter.
 */

type Entity = {
  name: string;
  sov: number; // 0..1
  avg_rank: number | null;
  is_subject: boolean;
};

export function CompetitiveScatter({
  entities,
  colorByName,
}: {
  entities: Entity[];
  colorByName?: Record<string, string>;
}) {
  // Drop entities without a measured rank — without one we have no
  // position to place a dot at. The card title still reads "Position
  // vs Share" so an empty state is meaningful: "we don't have enough
  // ranked answers yet to chart this landscape."
  const measured = entities.filter(
    (e) => e.avg_rank !== null && Number.isFinite(e.avg_rank),
  );

  if (measured.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-[12.5px] text-muted-foreground">
        Not enough measured ranks to chart the landscape yet.
      </div>
    );
  }

  const ranks = measured.map((e) => e.avg_rank as number);
  const rawMin = Math.min(...ranks);
  const rawMax = Math.max(...ranks);
  // Axis pad: floor the min to a whole tick so the first tick is a
  // clean integer (1.0 / 2.0); pad the max so the rightmost dot has
  // breathing room from the edge. Span is guaranteed ≥1 so a single-
  // entity case (everyone tied at the same rank) doesn't divide by 0.
  const minRank = Math.max(1, Math.floor(rawMin));
  const maxRank = Math.max(rawMax + 0.5, minRank + 1);
  const span = maxRank - minRank || 1;

  // Sort by position ascending so the best position lands at the top
  // row. The dot positions form a top-left-to-bottom-right diagonal
  // when SoV correlates inversely with position — same "winners up-
  // left" pattern the scatter aimed for, now spatially unambiguous.
  const sorted = [...measured].sort((a, b) => {
    const ra = a.avg_rank as number;
    const rb = b.avg_rank as number;
    if (ra !== rb) return ra - rb;
    return b.sov - a.sov; // SoV desc breaks ties
  });

  // ~5 ticks across the span — enough resolution to read positions
  // without crowding the header. Equally-spaced, formatted to 1
  // decimal so a rank of 3.0 doesn't render as "3".
  const TICK_COUNT = 5;
  const ticks = Array.from(
    { length: TICK_COUNT },
    (_, i) => minRank + (span * i) / (TICK_COUNT - 1),
  );

  return (
    <div>
      {/* Header row — column titles + position axis ticks. Tick row
          uses justify-between so first/last ticks anchor to the
          track's start/end exactly, matching dot placement. The
          directional caption sits below the ticks so a reader sees
          "earlier in AI answer (better) ←" alongside the smallest
          (leftmost) tick value, reinforcing direction-of-better. */}
      <div className="grid grid-cols-[120px_1fr_44px] gap-x-3 items-end">
        <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground/70">
          Entity
        </div>
        <div>
          <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground/70">
            {ticks.map((t, i) => (
              <span key={i}>{t.toFixed(1)}</span>
            ))}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">
            ← Avg Position (earlier in answer)
          </div>
        </div>
        <div className="text-right text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground/70">
          SoV
        </div>
      </div>

      {/* Body — one row per entity. Track is a dashed midline with a
          colored dot positioned by xPct = (rank − min) / span. Subject
          row gets the same bg-tint + left accent treatment as the
          subject row in the ranking table above so the two reads
          align. */}
      <div className="mt-2.5">
        {sorted.map((e, idx) => {
          const rank = e.avg_rank as number;
          const xPct = ((rank - minRank) / span) * 100;
          const dotColor =
            colorByName?.[e.name] ??
            (e.is_subject ? "var(--primary)" : "oklch(0.62 0.06 245)");
          return (
            <div
              key={e.name}
              className={`grid grid-cols-[120px_1fr_44px] gap-x-3 items-center py-2 ${
                idx > 0 ? "border-t border-border/30" : ""
              } ${
                e.is_subject
                  ? "bg-primary/[0.06] border-l-2 border-l-primary/50 pl-2 -ml-2 rounded-sm"
                  : ""
              }`}
            >
              <div
                className={`truncate text-[13px] ${
                  e.is_subject
                    ? "font-semibold text-foreground"
                    : "text-foreground/85"
                }`}
                title={e.name}
              >
                {e.name}
              </div>
              <div className="relative h-3">
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-dashed border-border/40" />
                <div
                  className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    left: `${xPct}%`,
                    background: dotColor,
                    opacity: e.is_subject ? 1 : 0.85,
                    boxShadow: e.is_subject
                      ? "0 0 0 2px var(--background)"
                      : undefined,
                  }}
                  title={`${e.name} · position ${rank.toFixed(1)}`}
                  aria-label={`${e.name} at avg position ${rank.toFixed(1)}`}
                />
              </div>
              <div
                className={`text-right text-[13px] tabular-nums ${
                  e.is_subject
                    ? "font-semibold text-foreground"
                    : "text-foreground/80"
                }`}
              >
                {Math.round(e.sov * 100)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
