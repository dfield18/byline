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

  let offset = 0;
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
      {segments.map((s) => {
        const frac = s.value / sum;
        const dash = frac * circ;
        const el = (
          <circle
            key={s.label}
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${c} ${c})`}
          />
        );
        offset += dash;
        return el;
      })}
      <text className="donut-total" x={c} y={c - 2} textAnchor="middle">
        {total.toLocaleString()}
      </text>
      <text className="donut-sub" x={c} y={c + 14} textAnchor="middle">
        {centerLabel}
      </text>
    </svg>
  );
}
