/**
 * TrendLines — a small multi-series line chart, hand-rolled SVG (no chart lib,
 * matching the rest of the dashboard / Sparkline). Used by the alternate
 * dashboard's Visibility Trend panel to plot the subject's mention rate against
 * its top competitors over the tracked snapshots.
 *
 * Null values break the line (a gap), so a competitor with no data in a given
 * week doesn't get a misleading interpolated segment.
 */

export type TrendSeries = {
  name: string;
  values: (number | null)[]; // aligned to `labels`
  color: string;
  emphasis?: boolean; // the focal subject — drawn thicker, with dots
};

function buildSegments(values: (number | null)[]): number[][] {
  // Contiguous runs of non-null indices → each becomes its own polyline.
  const segments: number[][] = [];
  let cur: number[] = [];
  values.forEach((v, i) => {
    if (v === null || v === undefined) {
      if (cur.length) segments.push(cur);
      cur = [];
    } else {
      cur.push(i);
    }
  });
  if (cur.length) segments.push(cur);
  return segments;
}

export function TrendLines({
  labels,
  series,
  format,
  height = 240,
}: {
  labels: string[];
  series: TrendSeries[];
  format: (v: number) => string;
  height?: number;
}) {
  const W = 760;
  const H = height;
  const padL = 44;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const n = labels.length;

  const allVals = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const rawMax = allVals.length ? Math.max(...allVals) : 1;
  const yMax = rawMax <= 0 ? 1 : rawMax * 1.15;

  const x = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - v / yMax) * (H - padT - padB);

  // 4 horizontal gridlines + y labels.
  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);

  // x tick indices: first, middle, last (avoid crowding).
  const xTicks = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <svg
      className="trend-svg"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Visibility trend over time"
    >
      {gridVals.map((gv, i) => (
        <g key={i}>
          <line
            className="trend-grid"
            x1={padL}
            x2={W - padR}
            y1={y(gv)}
            y2={y(gv)}
          />
          <text className="trend-ylabel" x={padL - 8} y={y(gv) + 3} textAnchor="end">
            {format(gv)}
          </text>
        </g>
      ))}

      {xTicks.map((ti) => (
        <text
          key={ti}
          className="trend-xlabel"
          x={x(ti)}
          y={H - 8}
          textAnchor={ti === 0 ? "start" : ti === n - 1 ? "end" : "middle"}
        >
          {labels[ti]}
        </text>
      ))}

      {series.map((s) => (
        <g key={s.name}>
          {buildSegments(s.values).map((seg, si) => (
            <polyline
              key={si}
              className={`trend-line${s.emphasis ? " emphasis" : ""}`}
              points={seg.map((i) => `${x(i)},${y(s.values[i] as number)}`).join(" ")}
              style={{ stroke: s.color }}
            />
          ))}
          {s.emphasis &&
            s.values.map((v, i) =>
              v === null ? null : (
                <circle
                  key={i}
                  className="trend-dot"
                  cx={x(i)}
                  cy={y(v)}
                  r={3}
                  style={{ fill: s.color }}
                />
              ),
            )}
        </g>
      ))}
    </svg>
  );
}
