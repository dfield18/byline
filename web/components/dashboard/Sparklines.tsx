// Shared sparkline primitives used by both Overview and Visibility
// vitals KPI tiles. Extracted from app/subjects/[id]/page.tsx so the
// two spokes' sparklines have identical visual character (monotone-
// cubic smoothing, asymmetric padding, null-gap break behavior) and
// don't drift apart.

// Monotone cubic interpolation (Fritsch-Carlson) → cubic-Bezier SVG
// path. Used by both MiniSpark + TinySpark to draw smooth-but-
// monotone curves between snapshots. Why this curve type:
//   - cardinal / Catmull-Rom splines look smoother but can overshoot
//     local extremes, which on a 0..100% rate sparkline produces a
//     curve briefly dipping below 0 or peaking above 100 — wrong
//     even though the dataset can't reach those values.
//   - monotone cubic guarantees the curve passes through every data
//     point AND never overshoots — slopes at each point are clipped
//     when they'd cause a local max or min to be violated.
export function buildMonoCubicPath(
  points: { x: number; y: number }[],
): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    return `M${points[0].x},${points[0].y}`;
  }
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
  // Fritsch-Carlson monotone clamp.
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

// 22px inline sparkline for use inside a compact StatCard (Competition
// spoke's tier-pill column, Overview's Entity-mix card, etc.). No
// axis labels — the surrounding tile carries the magnitude context.
export function TinySpark({
  values,
  color = "var(--primary)",
}: {
  values: (number | null)[];
  color?: string;
}) {
  const numeric = values.filter(
    (v): v is number => v !== null && Number.isFinite(v),
  );
  if (numeric.length < 2) return null;
  const dataMin = Math.min(...numeric);
  const dataMax = Math.max(...numeric);
  const rawRange = dataMax - dataMin || 1;
  const plotMin = dataMin - rawRange * 0.4;
  const plotMax = dataMax + rawRange * 0.15;
  const range = plotMax - plotMin || 1;
  const w = 120;
  const h = 22;
  const pad = 2;
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const runs: { x: number; y: number }[][] = [];
  let cur: { x: number; y: number }[] = [];
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      if (cur.length > 0) {
        runs.push(cur);
        cur = [];
      }
      return;
    }
    const x = pad + i * step;
    const y = h - pad - ((v - plotMin) / range) * (h - pad * 2);
    cur.push({ x, y });
  });
  if (cur.length > 0) runs.push(cur);
  const path = runs.map(buildMonoCubicPath);
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="w-full h-[22px]"
      aria-hidden
    >
      <path
        d={path.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
      />
    </svg>
  );
}

// 120px-tall sparkline used inside vitals KPI tiles (Overview +
// Visibility). Carries axis labels (min/max + start/midpoint/end date
// ticks below), historical-vs-live dot styling, and per-point tooltips.
export function MiniSpark({
  values,
  isHistorical,
  labels,
  format,
  color = "var(--primary)",
  ariaLabel,
}: {
  values: (number | null)[];
  isHistorical: boolean[];
  labels: string[];
  // Formatter used to render the min/max axis labels in the same
  // units as the metric (so a recall trajectory shows "75%" not
  // "0.75", tone shows "+12% positive" not "0.12", etc.).
  format: (v: number | null) => string;
  color?: string;
  // Accessible label for the SVG. The sparkline is the primary
  // visual of the KPI tile but conveys no information to AT users
  // without this label. KpiVitalsTile passes the metric name so a
  // screen reader announces e.g. "AI Mention Rate trend, latest
  // 50%, 13 snapshots". Callers without a meaningful label (e.g.
  // decorative usage) can leave undefined and the SVG goes
  // aria-hidden.
  ariaLabel?: string;
}) {
  const numericValues = values.filter((v): v is number => v !== null);
  if (values.length > 0 && numericValues.length === 0) {
    return (
      <div className="h-[120px] flex items-center justify-center text-center text-[11px] text-muted-foreground px-3 leading-relaxed">
        Not measured for this subject
      </div>
    );
  }
  if (numericValues.length < 2) {
    return (
      <div className="h-[120px] flex flex-col items-center justify-center gap-2 px-3">
        <div className="h-1.5 w-1.5 rounded-full bg-primary" />
        <div className="text-[11px] text-muted-foreground leading-relaxed text-center">
          1 of {values.length} snapshot{values.length === 1 ? "" : "s"} scored so far
        </div>
      </div>
    );
  }
  // Padded plot range so the line never grazes top/bottom edges.
  const dataMin = Math.min(...numericValues);
  const dataMax = Math.max(...numericValues);
  const min = dataMin;
  const max = dataMax;
  const rawRange = dataMax - dataMin || 1;
  const plotMin = dataMin - rawRange * 0.4;
  const plotMax = dataMax + rawRange * 0.15;
  const range = plotMax - plotMin || 1;
  const w = 280;
  const h = 120;
  const pad = 6;
  const step = (w - pad * 2) / (values.length - 1);
  const yFor = (v: number | null) =>
    v === null ? null : h - pad - ((v - plotMin) / range) * (h - pad * 2);

  // Group into runs of contiguous measured points so nulls break
  // the curve via SVG M moves.
  const measuredRuns: { x: number; y: number }[][] = [];
  let currentRun: { x: number; y: number }[] = [];
  values.forEach((v, i) => {
    const y = yFor(v);
    if (y === null) {
      if (currentRun.length > 0) {
        measuredRuns.push(currentRun);
        currentRun = [];
      }
      return;
    }
    currentRun.push({ x: pad + i * step, y });
  });
  if (currentRun.length > 0) measuredRuns.push(currentRun);
  const path: string[] = measuredRuns.map(buildMonoCubicPath);

  const flatLine = min === max;
  // Date ticks: first measured · midpoint · last measured.
  const measuredIndices: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== null) measuredIndices.push(i);
  }
  const fmtShortDate = (iso: string | undefined): string => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  };
  const firstIdx = measuredIndices[0];
  const lastIdx = measuredIndices[measuredIndices.length - 1];
  const midIdx =
    measuredIndices[Math.floor(measuredIndices.length / 2)];
  return (
    <div>
      <div className="relative h-[120px] pl-9">
        {flatLine ? (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 text-[9px] leading-none text-muted-foreground/55 tabular-nums">
            {format(max)}
          </span>
        ) : (
          <>
            <span className="absolute left-0 top-0 text-[9px] leading-none text-muted-foreground/55 tabular-nums">
              {format(max)}
            </span>
            <span className="absolute left-0 bottom-0 text-[9px] leading-none text-muted-foreground/55 tabular-nums">
              {format(min)}
            </span>
          </>
        )}
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          role={ariaLabel ? "img" : undefined}
          aria-label={ariaLabel}
          aria-hidden={ariaLabel ? undefined : true}
        >
          <line
            x1={pad}
            y1={pad}
            x2={w - pad}
            y2={pad}
            stroke="var(--border)"
            strokeWidth={1}
            strokeDasharray="2 3"
            opacity={0.5}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={pad}
            y1={h - pad}
            x2={w - pad}
            y2={h - pad}
            stroke="var(--border)"
            strokeWidth={1}
            strokeDasharray="2 3"
            opacity={0.5}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={path.join(" ")}
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
                fill={isHistorical[i] ? "var(--card)" : color}
                stroke={color}
                strokeWidth={1.4}
                vectorEffect="non-scaling-stroke"
              >
                <title>
                  {`${labels[i]}: ${format(v)}${
                    isHistorical[i] ? " (retrospective estimate)" : ""
                  }`}
                </title>
              </circle>
            );
          })}
        </svg>
      </div>
      <div className="mt-1.5 pl-9 flex items-center justify-between text-[9px] tabular-nums text-muted-foreground/55">
        <span>{fmtShortDate(labels[firstIdx])}</span>
        {measuredIndices.length >= 3 && (
          <span>{fmtShortDate(labels[midIdx])}</span>
        )}
        <span>{fmtShortDate(labels[lastIdx])}</span>
      </div>
    </div>
  );
}
