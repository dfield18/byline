"use client";

/**
 * Position-vs-Share scatter for the Competitive Visibility section.
 *
 * Each entity is a single dot:
 *   - X axis = Avg Mention Rank (reversed — lower = better, so the
 *     "best position" sits on the LEFT, mirroring how readers
 *     instinctively want to scan a competitive landscape)
 *   - Y axis = Share of Voice (0..100%)
 *   - The focal subject dot is larger and primary-toned; competitors
 *     are smaller and muted
 *
 * Top-left = "high share + leads the answer" (winners). Bottom-right
 * = "low share + ranks low" (marginal). The shape of the cluster
 * tells the executive who's clustered where without reading any
 * tables.
 */
import {
  CartesianGrid,
  Label,
  LabelList,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  type TooltipProps,
} from "recharts";

const PRIMARY = "var(--primary)";

type EntityPoint = {
  name: string;
  rank: number;       // avg_rank — lower is better
  sov: number;        // 0..100 (already converted to pct)
  isSubject: boolean;
};

type ScatterTooltipPayload = {
  payload?: EntityPoint;
};

function ScatterTooltip({
  active,
  payload,
}: TooltipProps<number, string> & { payload?: ScatterTooltipPayload[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="min-w-[160px] rounded-md border border-border bg-popover px-3 py-2 shadow-lg">
      <div className="text-[12px] font-semibold text-foreground">
        {point.name}
      </div>
      <div className="mt-1 space-y-0.5 text-[11.5px] text-foreground/80">
        <div className="flex items-center justify-between gap-3 tabular-nums">
          <span className="text-muted-foreground">Avg rank</span>
          <span>{point.rank.toFixed(1)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 tabular-nums">
          <span className="text-muted-foreground">Share of voice</span>
          <span>{Math.round(point.sov)}%</span>
        </div>
      </div>
    </div>
  );
}

export function CompetitiveScatter({
  entities,
  colorByName,
}: {
  entities: {
    name: string;
    sov: number;          // 0..1
    avg_rank: number | null;
    is_subject: boolean;
  }[];
  // Page-canonical entity → color map. When provided, each dot
  // takes its color from this map so a reader can connect "the
  // orange dot" here to "the orange line" in the trend chart and
  // "the orange bar" in the SoV chart. Falls back to the prior
  // two-tone treatment when omitted.
  //
  // Plain object (not a function) so the prop is serializable
  // across the Server → Client component boundary.
  colorByName?: Record<string, string>;
}) {
  // Only points where avg_rank is measured — without it we can't
  // place the dot on the X axis. Drop nulls instead of pinning
  // them to some default (which would be misleading).
  const points: EntityPoint[] = entities
    .filter((e) => e.avg_rank !== null && Number.isFinite(e.avg_rank))
    .map((e) => ({
      name: e.name,
      rank: e.avg_rank as number,
      sov: Math.round(e.sov * 1000) / 10,
      isSubject: e.is_subject,
    }));

  if (points.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-[12.5px] text-muted-foreground">
        Not enough measured ranks to chart the landscape yet.
      </div>
    );
  }

  // Pad the rank axis just enough that the extreme dots aren't
  // hugging the chart edge — but no more. The previous version
  // also floor/ceiled the bounds to the nearest integer, which
  // could add up to ~1.0 of slack on a single side (e.g. a max
  // of 6.1 → ceil → 7 → +0.5 → 7.5). That stretched the domain
  // and squeezed close-together dots (e.g. rank 5.4 vs 5.6)
  // into adjacent pixels. Use the raw data range + a small
  // fixed pad so most of the pixel budget goes to the actual
  // spread between entities.
  const ranks = points.map((p) => p.rank);
  const rawMin = Math.min(...ranks);
  const rawMax = Math.max(...ranks);
  const minRank = Math.max(1, rawMin - 0.25);
  const maxRank = rawMax + 0.25;

  // Render one <Scatter> per entity so each dot can take its own
  // color (Recharts Scatter is single-fill; the per-point approach
  // is the standard way to thread categorical colors through). Sort
  // the subject last so its dot paints on top when it overlaps a
  // competitor; subject also stays semibold-labelled so it leads
  // the eye in the cluster.
  const renderOrder = [
    ...points.filter((p) => !p.isSubject),
    ...points.filter((p) => p.isSubject),
  ];

  // Pixel range describing the X domain used by the smart-anchor
  // logic on each label. Lower rank sits LEFT on the chart (default
  // Recharts behavior for numeric axes), so xFraction=0 = leftmost
  // and xFraction=1 = rightmost.
  const xFractionOf = (rank: number): number => {
    const span = maxRank - minRank;
    if (span <= 0) return 0.5;
    return (rank - minRank) / span;
  };

  // Collision-aware label placement. Earlier version triggered only
  // when dots were within 5% of the X span — too narrow when labels
  // run wide ("Gretchen Whitmer" at 11px ≈ 100px), so two dots 0.7
  // axis-units apart still rendered their labels overlapping. New
  // approach estimates each label's pixel width from its character
  // count and compares to the per-pair pixel distance: if the labels
  // would touch (even after a small gap), the lower-priority dot
  // flips to the next tier. Y-proximity stays at 8 pp since vertical
  // overlap is binary (labels are one line, no width variability).
  const CHAR_PX = 6.5;
  // Gap bumped from 8 → 14 after observed near-miss collisions (e.g.
  // "J.B. Pritzker" and "Josh Shapiro" sitting ~92px apart with
  // estimated combined half-width ~85px were marked safe but read
  // as a single run-on string). 14px of required gap pushes
  // borderline pairs into the tier-shift branch where one flips
  // below the dot instead of overlapping above.
  const LABEL_GAP_PX = 14;
  // The CompetitiveScatter card sits in a half-width grid on a
  // 1280px page, so the chart canvas is ~520px wide for the X axis
  // area. Approximate is fine — this is a "would these visually
  // overlap" gate, not pixel-perfect placement; ±50px viewport drift
  // shifts the threshold by a few percent of one label width.
  const ASSUMED_X_AXIS_PX = 520;
  const yCloseSov = 8;
  const xPxOf = (rank: number): number =>
    xFractionOf(rank) * ASSUMED_X_AXIS_PX;
  const labelPxOf = (name: string): number => name.length * CHAR_PX;
  const wouldLabelsOverlap = (a: EntityPoint, b: EntityPoint): boolean => {
    if (Math.abs(a.sov - b.sov) > yCloseSov) return false;
    const pxDist = Math.abs(xPxOf(a.rank) - xPxOf(b.rank));
    const minPxDist =
      (labelPxOf(a.name) + labelPxOf(b.name)) / 2 + LABEL_GAP_PX;
    return pxDist < minPxDist;
  };
  // Sort to make the placement order deterministic: subject first
  // (so it claims "above"), then by SoV desc (topmost dots claim
  // their slot first, lower dots flip if they collide).
  const orderedForPlacement = [...points].sort((a, b) => {
    if (a.isSubject !== b.isSubject) return a.isSubject ? -1 : 1;
    if (a.sov !== b.sov) return b.sov - a.sov;
    return a.rank - b.rank;
  });
  // Three vertical tiers so a cluster of three (or more) nearby
  // dots can each claim a distinct label slot instead of pairing
  // off and leaving the third overlapping. Priority is
  // above → below → far-below; "far-below" sits one extra label
  // height down, leaving the dot itself clean.
  type LabelTier = "above" | "below" | "far-below";
  const labelPositionByName: Record<string, LabelTier> = {};
  const TIER_ORDER: LabelTier[] = ["above", "below", "far-below"];
  for (let i = 0; i < orderedForPlacement.length; i++) {
    const p = orderedForPlacement[i];
    // Collect tiers already claimed by neighbors that fall within
    // the proximity window so this dot can pick any tier that
    // none of them are using.
    const taken = new Set<LabelTier>();
    for (let j = 0; j < i; j++) {
      const other = orderedForPlacement[j];
      if (wouldLabelsOverlap(p, other)) {
        const otherTier = labelPositionByName[other.name];
        if (otherTier) taken.add(otherTier);
      }
    }
    const chosen = TIER_ORDER.find((t) => !taken.has(t)) ?? "above";
    labelPositionByName[p.name] = chosen;
  }

  return (
    <div>
      {/* Chart canvas grew to 280px so 5+ dots + their labels fit
          without colliding with the axes. Margins are generous on
          all sides so the custom label renderer can place text past
          the dot in any direction without overflowing the card. */}
      {/* Chart height bumped 280 → 300 to make room for the X-axis
          title below the tick labels without crowding the plot
          area. Bottom + left margins widened for the axis title
          text; right kept tight since labels render via the smart
          anchor in LabelList. */}
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height={300} minWidth={1}>
          <ScatterChart
            margin={{ top: 36, right: 32, left: 28, bottom: 32 }}
          >
            <CartesianGrid
              stroke="oklch(0.91 0.008 250)"
              strokeDasharray="2 4"
            />
            {/* X axis: avg rank, reversed so "best position" sits
                LEFT. tickFormatter forces 1-decimal display because
                Recharts otherwise renders the auto-generated tick
                boundaries (e.g. 3.9944444445) at full precision.
                Axis title folds the directional hint into the label
                ("Avg Mention Position (earlier →)") so the reader
                doesn't need to read a separate caption below the
                chart to learn which direction is better. */}
            <XAxis
              type="number"
              dataKey="rank"
              name="Avg rank"
              domain={[maxRank, minRank]}
              stroke="oklch(0.45 0.015 250)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              tickFormatter={(v: number) => v.toFixed(1)}
            >
              <Label
                value="Avg Mention Position (← earlier in answer)"
                position="bottom"
                offset={12}
                fontSize={11}
                fill="var(--muted-foreground)"
              />
            </XAxis>
            <YAxis
              type="number"
              dataKey="sov"
              name="Share of voice"
              // Domain extends to 110 (not 100) so a dot at 100%
              // SoV doesn't sit at the chart's top edge — labels
              // positioned just above the topmost dot otherwise
              // collide with the "100%" Y-axis tick label. Explicit
              // ticks keep the visible tick set the same (0/25/50/
              // 75/100) so the change reads as headroom, not as a
              // weirdly-scaled axis.
              domain={[0, 110]}
              ticks={[0, 25, 50, 75, 100]}
              stroke="oklch(0.45 0.015 250)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v: number) => `${v}%`}
            >
              <Label
                value="Share of Voice (↑ more visible)"
                angle={-90}
                position="left"
                offset={4}
                fontSize={11}
                fill="var(--muted-foreground)"
                style={{ textAnchor: "middle" }}
              />
            </YAxis>
            <ZAxis range={[60, 60]} />
            <Tooltip
              cursor={{ stroke: PRIMARY, strokeOpacity: 0.25 }}
              content={<ScatterTooltip />}
            />
            {renderOrder.map((p) => {
              const fill =
                colorByName?.[p.name] ??
                (p.isSubject ? PRIMARY : "oklch(0.62 0.06 245)");
              return (
                <Scatter
                  key={p.name}
                  data={[p]}
                  fill={fill}
                  fillOpacity={p.isSubject ? 1 : 0.85}
                  shape="circle"
                >
                  {/* Custom label renderer — Recharts' default
                      `position="top"` centered labels above each
                      dot and would word-wrap long names (Donald
                      Trump → "Donald" / "Trump") when the centered
                      label estimated wider than the dot's slot.
                      Render once as a single SVG <text> line with
                      smart anchoring instead:
                        - leftmost dots: anchor start, text extends
                          right so it doesn't clip past the Y-axis.
                        - rightmost dots: anchor end, text extends
                          left so it doesn't clip past the card edge.
                        - everyone else: anchored middle (the prior
                          default), centered above the dot. */}
                  <LabelList
                    dataKey="name"
                    content={(props) => {
                      const x =
                        typeof props.x === "number" ? props.x : 0;
                      const y =
                        typeof props.y === "number" ? props.y : 0;
                      const xFrac = xFractionOf(p.rank);
                      // Labels in the left HALF of the chart anchor
                      // to the right of their dot (text extends
                      // rightward), so they always point AWAY from
                      // the Y-axis tick area regardless of how close
                      // the dot sits to the axis. Labels in the
                      // right HALF mirror that to point away from
                      // the right edge of the card. The middle band
                      // gets a centered label above the dot.
                      let textAnchor: "start" | "middle" | "end" =
                        "middle";
                      let dx = 0;
                      if (xFrac >= 0.7) {
                        textAnchor = "end";
                        dx = -8;
                      } else if (xFrac <= 0.3) {
                        textAnchor = "start";
                        dx = 8;
                      }
                      // Y offset by tier: "above" sits 10px above
                      // the dot center; "below" sits 16px below
                      // (dot radius + breathing gap); "far-below"
                      // sits 30px below so a third clustered label
                      // can stack cleanly under the "below" one
                      // without overlapping it.
                      const labelPosition =
                        labelPositionByName[p.name] ?? "above";
                      const labelY =
                        labelPosition === "far-below"
                          ? y + 30
                          : labelPosition === "below"
                          ? y + 16
                          : y - 10;
                      return (
                        <text
                          x={x + dx}
                          y={labelY}
                          textAnchor={textAnchor}
                          fontSize={11}
                          fontWeight={p.isSubject ? 600 : 400}
                          fill="var(--foreground)"
                        >
                          {p.name}
                        </text>
                      );
                    }}
                  />
                </Scatter>
              );
            })}
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Directional caption removed — the axis titles now carry
          the direction-of-better hints inline ("← earlier in answer"
          on X, "↑ more visible" on Y) so a separate caption would
          duplicate the signal. */}
    </div>
  );
}
