"use client";

/**
 * TrendLines — a small multi-series line chart, hand-rolled SVG (no chart lib,
 * matching the rest of the dashboard / Sparkline). Used by the Overview
 * Dashboard's Visibility panel to plot the subject's mention rate against its
 * top competitors over the tracked snapshots.
 *
 * Interactive: hovering anywhere over the plot snaps to the nearest week and
 * shows a crosshair + a tooltip listing every line's value at that week. Lines
 * are monotone-cubic smoothed (never overshoots); null values break the line.
 *
 * Client component — so values are 0..1 rates formatted as percentages here
 * (no function props pass the server/client boundary).
 */
import { useState } from "react";
import { buildMonoCubicPath } from "@/components/dashboard/Sparkline";

export type TrendSeries = {
  name: string;
  values: (number | null)[]; // aligned to `labels`
  color: string;
  emphasis?: boolean; // the focal subject — drawn thicker
};

function fmtPct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function buildSegments(values: (number | null)[]): number[][] {
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
  height = 290,
}: {
  labels: string[];
  series: TrendSeries[];
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 760;
  const H = height;
  const padL = 44;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const n = labels.length;

  const allVals = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const rawMax = allVals.length ? Math.max(...allVals) : 1;
  const yMax = Math.max(0.25, Math.min(1, Math.ceil((rawMax * 1.05) / 0.25) * 0.25));

  const x = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - v / yMax) * (H - padT - padB);
  const baseY = y(0);

  // The focal subject's color seeds the soft area-fill gradient under its line.
  const emphasisColor = series.find((s) => s.emphasis)?.color ?? "#8a6d2f";

  const gridVals = [0, 0.25, 0.5, 0.75, 1].filter((v) => v <= yMax + 1e-9);
  const xTicks = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];

  // Map a mouse position over the SVG to the nearest data index. The SVG keeps
  // its viewBox aspect (width:100%, height:auto), so clientX maps linearly.
  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || n <= 1) return;
    const vbX = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((vbX - padL) / (W - padL - padR)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  // Tooltip horizontal position (% of the chart width), clamped from the edges.
  const tipLeft =
    hover === null ? 0 : Math.max(12, Math.min(88, (x(hover) / W) * 100));

  return (
    <div className="trend-wrap">
      <svg
        className="trend-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Visibility trend over time"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="trendAreaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={emphasisColor} stopOpacity={0.2} />
            <stop offset="100%" stopColor={emphasisColor} stopOpacity={0} />
          </linearGradient>
        </defs>

        {gridVals.map((gv, i) => (
          <g key={i}>
            <line className="trend-grid" x1={padL} x2={W - padR} y1={y(gv)} y2={y(gv)} />
            <text className="trend-ylabel" x={padL - 8} y={y(gv) + 3} textAnchor="end">
              {fmtPct(gv)}
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

        {/* crosshair at the hovered week */}
        {hover !== null && (
          <line
            className="trend-cursor"
            x1={x(hover)}
            x2={x(hover)}
            y1={padT}
            y2={H - padB}
          />
        )}

        {/* soft area fill under the focal subject's line (drawn first, behind
            every line so competitor lines stay readable on top of it) */}
        {series
          .filter((s) => s.emphasis)
          .map((s) =>
            buildSegments(s.values).map((seg, si) => {
              const pts = seg.map((i) => ({ x: x(i), y: y(s.values[i] as number) }));
              if (pts.length === 0) return null;
              const line = buildMonoCubicPath(pts, 0.2);
              const last = pts[pts.length - 1];
              const first = pts[0];
              return (
                <path
                  key={`area-${s.name}-${si}`}
                  className="trend-area"
                  d={`${line} L${last.x},${baseY} L${first.x},${baseY} Z`}
                  fill="url(#trendAreaFill)"
                />
              );
            }),
          )}

        {series.map((s) => (
          <g key={s.name}>
            {buildSegments(s.values).map((seg, si) => (
              <path
                key={si}
                className={`trend-line${s.emphasis ? " emphasis" : ""}`}
                d={buildMonoCubicPath(
                  seg.map((i) => ({ x: x(i), y: y(s.values[i] as number) })),
                  0.2,
                )}
                style={{ stroke: s.color }}
              />
            ))}
            {/* point markers; the hovered week's marker is enlarged */}
            {s.values.map((v, i) =>
              v === null ? null : (
                <circle
                  key={i}
                  className={`trend-dot${s.emphasis ? " emphasis" : ""}`}
                  cx={x(i)}
                  cy={y(v)}
                  r={hover === i ? 4.5 : s.emphasis ? 3 : 2.4}
                  style={{ fill: s.color }}
                />
              ),
            )}
          </g>
        ))}
      </svg>

      {hover !== null && (
        <div
          className="trend-tip"
          style={{ left: `${tipLeft}%` }}
          aria-hidden
        >
          <div className="trend-tip-date">{labels[hover]}</div>
          {series.map((s) => {
            const v = s.values[hover];
            if (v === null || v === undefined) return null;
            return (
              <div className="trend-tip-row" key={s.name}>
                <i style={{ background: s.color }} />
                <span className="trend-tip-name">{s.name}</span>
                <b>{fmtPct(v)}</b>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
