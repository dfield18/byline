"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area,
  AreaChart,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from "recharts";

const recallData = [
  { w: "W1", v: 61 },
  { w: "W2", v: 63 },
  { w: "W3", v: 62 },
  { w: "W4", v: 66 },
  { w: "W5", v: 68 },
  { w: "W6", v: 67 },
  { w: "W7", v: 70 },
  { w: "W8", v: 72 },
];
const sovData = [
  { w: "W1", v: 14 },
  { w: "W2", v: 14.5 },
  { w: "W3", v: 15 },
  { w: "W4", v: 15.4 },
  { w: "W5", v: 16.2 },
  { w: "W6", v: 17 },
  { w: "W7", v: 17.6 },
  { w: "W8", v: 18 },
];
const trrData = [
  { w: "W1", v: 26 },
  { w: "W2", v: 24 },
  { w: "W3", v: 28 },
  { w: "W4", v: 30 },
  { w: "W5", v: 27 },
  { w: "W6", v: 33 },
  { w: "W7", v: 29 },
  { w: "W8", v: 31 },
];

const tooltipStyle = {
  backgroundColor: "oklch(1 0 0)",
  border: "1px solid oklch(0.91 0.008 250)",
  borderRadius: 6,
  fontSize: 12,
  color: "oklch(0.22 0.02 250)",
  padding: "6px 10px",
  boxShadow: "0 4px 12px rgba(15, 23, 42, 0.08)",
};

function MiniChart({
  data,
  color,
  domain,
  type = "area",
}: {
  data: { w: string; v: number }[];
  color: string;
  domain: [number, number];
  type?: "area" | "line";
}) {
  return (
    <ResponsiveContainer width="100%" height={140}>
      {type === "area" ? (
        <AreaChart data={data} margin={{ top: 6, right: 6, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={`g-${color}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="oklch(0.91 0.008 250)" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="w" stroke="oklch(0.45 0.015 250)" fontSize={10} tickLine={false} axisLine={false} />
          <YAxis domain={domain} stroke="oklch(0.45 0.015 250)" fontSize={10} tickLine={false} axisLine={false} width={28} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: color, strokeOpacity: 0.3 }} />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#g-${color})`} />
        </AreaChart>
      ) : (
        <LineChart data={data} margin={{ top: 6, right: 6, left: 4, bottom: 0 }}>
          <CartesianGrid stroke="oklch(0.91 0.008 250)" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="w" stroke="oklch(0.45 0.015 250)" fontSize={10} tickLine={false} axisLine={false} />
          <YAxis domain={domain} stroke="oklch(0.45 0.015 250)" fontSize={10} tickLine={false} axisLine={false} width={28} />
          <Tooltip contentStyle={tooltipStyle} />
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={{ r: 2.5, fill: color }} />
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}

export function RecallChart() {
  return <MiniChart data={recallData} color="oklch(0.5 0.13 245)" domain={[55, 80]} />;
}
export function SovChart() {
  return <MiniChart data={sovData} color="oklch(0.65 0.13 75)" domain={[10, 22]} />;
}
export function TopResultChart() {
  return <MiniChart data={trrData} color="oklch(0.55 0.13 155)" domain={[20, 38]} type="line" />;
}

const competitors = [
  { name: "Joe Biden", sov: 31 },
  { name: "Alexandria Ocasio-Cortez", sov: 26 },
  { name: "Bernie Sanders", sov: 22 },
  { name: "Elizabeth Warren", sov: 18, you: true },
  { name: "Pete Buttigieg", sov: 12 },
];

// Monochromatic blue gradient — stays in the blue family for tonal
// consistency, but with steep lightness/chroma jumps between stops
// so adjacent slices in the donut are clearly distinguishable. The
// previous palette had ~5pt lightness gaps between stops, which
// rendered adjacent slices nearly identical at small sizes.
const SOURCE_DONUT_COLORS = [
  "oklch(0.28 0.16 245)",  // deep navy
  "oklch(0.45 0.16 245)",  // dark blue
  "oklch(0.60 0.14 245)",  // medium blue
  "oklch(0.74 0.11 245)",  // light blue
  "oklch(0.85 0.07 245)",  // pale blue
  "oklch(0.91 0.04 245)",  // very pale
  "oklch(0.95 0.02 245)",  // near-white
];

export function SourcesDonut({
  data,
}: {
  data: { name: string; score: number }[];
}) {
  // Total influence across all slices, used to render hover tooltips
  // as a share of links rather than the raw aggregated influence
  // number (which is internal and unitless to a reader).
  const total = data.reduce((acc, x) => acc + x.score, 0) || 1;
  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Pie
          data={data}
          dataKey="score"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={88}
          outerRadius={144}
          paddingAngle={1.5}
          stroke="none"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={SOURCE_DONUT_COLORS[i % SOURCE_DONUT_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, name) => [
            `${Math.round((Number(value) / total) * 100)}% of citations`,
            String(name),
          ]}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function CompetitorBars() {
  // Static-mockup variant — uses the hardcoded Warren-equivalent data
  // above. Used by /dashboard-preview (the design reference).
  return <CompetitorBarsFromData data={competitors} />;
}

/**
 * Dynamic variant of the competitive horizontal bar chart. Used by the
 * wired dashboard at /dashboard-preview/[subjectId] with real data.
 * Subject's row gets the primary blue; everyone else gets a muted
 * blue-gray.
 */
export function CompetitorBarsFromData({
  data,
}: {
  data: { name: string; sov: number; is_subject?: boolean }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="oklch(0.91 0.008 250)" strokeDasharray="2 4" horizontal={false} />
        <XAxis type="number" stroke="oklch(0.45 0.015 250)" fontSize={10} tickLine={false} axisLine={false} unit="%" />
        <YAxis
          type="category"
          dataKey="name"
          stroke="oklch(0.32 0.015 250)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          width={170}
        />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "oklch(0.95 0.008 250)" }} />
        <Bar dataKey="sov" radius={[0, 4, 4, 0]} barSize={18}>
          {data.map((c, i) => (
            <Cell
              key={i}
              fill={c.is_subject ? "oklch(0.5 0.13 245)" : "oklch(0.78 0.04 245)"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
