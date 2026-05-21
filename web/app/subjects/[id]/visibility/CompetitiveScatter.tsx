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
}: {
  entities: {
    name: string;
    sov: number;          // 0..1
    avg_rank: number | null;
    is_subject: boolean;
  }[];
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

  // Pad the rank axis a bit beyond the observed range so the
  // extreme points aren't hugging the chart edge.
  const ranks = points.map((p) => p.rank);
  const minRank = Math.max(1, Math.floor(Math.min(...ranks)) - 0.5);
  const maxRank = Math.ceil(Math.max(...ranks)) + 0.5;

  const subjectPoint = points.filter((p) => p.isSubject);
  const competitorPoints = points.filter((p) => !p.isSubject);

  return (
    <div>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height={220} minWidth={1}>
          <ScatterChart
            margin={{ top: 12, right: 16, left: 8, bottom: 8 }}
          >
            <CartesianGrid
              stroke="oklch(0.91 0.008 250)"
              strokeDasharray="2 4"
            />
            {/* X axis: avg rank, reversed so "best position" sits
                LEFT. tickFormatter forces 1-decimal display because
                Recharts otherwise renders the auto-generated tick
                boundaries (e.g. 3.9944444445) at full precision. */}
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
            />
            <YAxis
              type="number"
              dataKey="sov"
              name="Share of voice"
              domain={[0, 100]}
              stroke="oklch(0.45 0.015 250)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v: number) => `${v}%`}
            />
            <ZAxis range={[60, 60]} />
            <Tooltip
              cursor={{ stroke: PRIMARY, strokeOpacity: 0.25 }}
              content={<ScatterTooltip />}
            />
            {/* Competitors first so the subject's larger primary dot
                paints on top when they overlap. */}
            <Scatter
              data={competitorPoints}
              fill="oklch(0.62 0.06 245)"
              fillOpacity={0.7}
              shape="circle"
            />
            <Scatter
              data={subjectPoint}
              fill={PRIMARY}
              shape="circle"
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Axis polarity captions sit below the chart in plain text,
          not as rotated chart labels — the rotated SoV label was
          overlapping the tick percentages and adding visual noise
          for one short string. */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span>X axis: Avg mention rank — ← lower is better</span>
        <span>Y axis: Share of voice — higher is better ↑</span>
      </div>
    </div>
  );
}
