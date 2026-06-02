/* Hand-rolled SVG sparkline for the Overview trends tiles.

   Ported from the old web/ Sparklines.tsx (MiniSpark + the
   Fritsch-Carlson monotone-cubic path builder), restyled to the token
   CSS. Pure render — no hooks, no events — so it stays a server
   component and ships zero client JS. Native <title> elements carry
   the per-point tooltips. */

// Monotone cubic interpolation (Fritsch-Carlson) → cubic-Bezier SVG
// path. Guarantees the curve passes through every point AND never
// overshoots — so a 0..100% rate curve can't briefly dip below 0 or
// peak above 100 the way a Catmull-Rom spline would.
export function buildMonoCubicPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  if (points.length === 2) {
    return `M${points[0].x},${points[0].y}L${points[1].x},${points[1].y}`;
  }
  const n = points.length;
  const dx: number[] = new Array(n - 1);
  const k: number[] = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1].x - points[i].x;
    k[i] = (points[i + 1].y - points[i].y) / (dx[i] || 1);
  }
  const m: number[] = new Array(n);
  m[0] = k[0];
  m[n - 1] = k[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = k[i - 1] * k[i] <= 0 ? 0 : (k[i - 1] + k[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (k[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / k[i];
    const b = m[i + 1] / k[i];
    const h = a * a + b * b;
    if (h > 9) {
      const tau = 3 / Math.sqrt(h);
      m[i] = tau * a * k[i];
      m[i + 1] = tau * b * k[i];
    }
  }
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const t = dx[i] / 3;
    const x1 = points[i].x + t;
    const y1 = points[i].y + m[i] * t;
    const x2 = points[i + 1].x - t;
    const y2 = points[i + 1].y - m[i + 1] * t;
    d += ` C${x1},${y1} ${x2},${y2} ${points[i + 1].x},${points[i + 1].y}`;
  }
  return d;
}

function fmtShortDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // UTC-pinned so server and client agree (no hydration drift).
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function Sparkline({
  values,
  isHistorical,
  labels,
  format,
  color = "var(--accent-bronze)",
  ariaLabel,
}: {
  values: (number | null)[];
  isHistorical: boolean[];
  labels: string[];
  // Formats axis labels in the metric's own units (e.g. "75%", "+0.12").
  format: (v: number | null) => string;
  color?: string;
  ariaLabel?: string;
}) {
  const numericValues = values.filter((v): v is number => v !== null);

  if (values.length > 0 && numericValues.length === 0) {
    return <div className="spark-empty">Not measured for this subject</div>;
  }
  if (numericValues.length < 2) {
    return (
      <div className="spark-empty">
        1 of {values.length} snapshot{values.length === 1 ? "" : "s"} scored so
        far
      </div>
    );
  }

  const dataMin = Math.min(...numericValues);
  const dataMax = Math.max(...numericValues);
  const rawRange = dataMax - dataMin || 1;
  // Asymmetric padding so the line never grazes the top/bottom edges.
  const plotMin = dataMin - rawRange * 0.4;
  const plotMax = dataMax + rawRange * 0.15;
  const range = plotMax - plotMin || 1;
  const w = 280;
  const h = 120;
  const pad = 6;
  const step = (w - pad * 2) / (values.length - 1);
  const yFor = (v: number | null) =>
    v === null ? null : h - pad - ((v - plotMin) / range) * (h - pad * 2);

  // Group into runs of contiguous measured points so nulls break the
  // curve via separate SVG M moves rather than drawing through gaps.
  const runs: { x: number; y: number }[][] = [];
  let cur: { x: number; y: number }[] = [];
  values.forEach((v, i) => {
    const y = yFor(v);
    if (y === null) {
      if (cur.length > 0) {
        runs.push(cur);
        cur = [];
      }
      return;
    }
    cur.push({ x: pad + i * step, y });
  });
  if (cur.length > 0) runs.push(cur);
  const path = runs.map(buildMonoCubicPath).join(" ");

  const flatLine = dataMin === dataMax;
  const measuredIndices = values
    .map((v, i) => (v !== null ? i : -1))
    .filter((i) => i >= 0);
  const firstIdx = measuredIndices[0];
  const lastIdx = measuredIndices[measuredIndices.length - 1];
  const midIdx = measuredIndices[Math.floor(measuredIndices.length / 2)];

  return (
    <div className="spark">
      <div className="spark-plot">
        {flatLine ? (
          <span className="spark-axis-mid">{format(dataMax)}</span>
        ) : (
          <>
            <span className="spark-axis-max">{format(dataMax)}</span>
            <span className="spark-axis-min">{format(dataMin)}</span>
          </>
        )}
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          role={ariaLabel ? "img" : undefined}
          aria-label={ariaLabel}
          aria-hidden={ariaLabel ? undefined : true}
        >
          <line
            x1={pad}
            y1={pad}
            x2={w - pad}
            y2={pad}
            stroke="var(--line)"
            strokeWidth={1}
            strokeDasharray="2 3"
            opacity={0.6}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={pad}
            y1={h - pad}
            x2={w - pad}
            y2={h - pad}
            stroke="var(--line)"
            strokeWidth={1}
            strokeDasharray="2 3"
            opacity={0.6}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {values.map((v, i) => {
            const y = yFor(v);
            if (y === null) return null;
            const x = pad + i * step;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={2.5}
                // Hollow (card-filled) dot for retrospective/backfilled
                // points; solid for the live latest snapshot.
                fill={isHistorical[i] ? "var(--bg-card)" : color}
                stroke={color}
                strokeWidth={1.4}
                vectorEffect="non-scaling-stroke"
              >
                <title>
                  {`${fmtShortDate(labels[i])}: ${format(v)}${
                    isHistorical[i] ? " (retrospective estimate)" : ""
                  }`}
                </title>
              </circle>
            );
          })}
        </svg>
      </div>
      <div className="spark-ticks">
        <span>{fmtShortDate(labels[firstIdx])}</span>
        {measuredIndices.length >= 3 && (
          <span>{fmtShortDate(labels[midIdx])}</span>
        )}
        <span>{fmtShortDate(labels[lastIdx])}</span>
      </div>
    </div>
  );
}
