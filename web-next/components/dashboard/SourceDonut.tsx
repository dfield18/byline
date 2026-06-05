/**
 * SourceDonut — a small hand-rolled SVG donut for the source-type breakdown on
 * the alternate dashboard. No chart lib; segments are drawn as stroked circle
 * arcs via stroke-dasharray. The center shows the total citation count.
 */

export type DonutSegment = { label: string; value: number; color: string };

export function SourceDonut({
  segments,
  total,
  centerLabel = "Citations",
}: {
  segments: DonutSegment[];
  total: number;
  centerLabel?: string;
}) {
  const size = 132;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const sum = segments.reduce((acc, s) => acc + s.value, 0) || 1;

  // Precompute each arc's length + offset without mutating a render-scoped
  // variable (the offset is the sum of all preceding segments' arc lengths).
  const arcs = segments.map((s, i) => ({
    seg: s,
    dash: (s.value / sum) * circ,
    offset: segments.slice(0, i).reduce((acc, p) => acc + (p.value / sum) * circ, 0),
  }));

  return (
    <svg className="donut-svg" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Source types">
      <circle
        className="donut-track"
        cx={c}
        cy={c}
        r={r}
        fill="none"
        strokeWidth={stroke}
      />
      {arcs.map(({ seg, dash, offset }) => (
        <circle
          key={seg.label}
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={seg.color}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={-offset}
          transform={`rotate(-90 ${c} ${c})`}
        />
      ))}
      <text className="donut-total" x={c} y={c - 2} textAnchor="middle">
        {total.toLocaleString()}
      </text>
      <text className="donut-sub" x={c} y={c + 14} textAnchor="middle">
        {centerLabel}
      </text>
    </svg>
  );
}
