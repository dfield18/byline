"use client";

/**
 * OverviewDashboard — a prop-driven, self-contained overview view. Does almost
 * no formatting: a backend→props adapter (./adapt.ts) maps the API into the
 * `OverviewData` contract below. All styling is a scoped <style> block using
 * `--bo-*` CSS variables under `.byline-overview`, so it can't leak into (or be
 * leaked into by) the rest of the app. Override the `--bo-*` vars (or add a
 * [data-theme="dark"] block) to retheme.
 *
 * Built per the integration brief, "association" path: the row-3-left unit is
 * "Prompt themes driving this result" and renders `drivers` (theme + a
 * strong/moderate/weak/missing association badge).
 */
import type { ReactNode } from "react";
import { MODEL_BRANDS } from "@/components/dashboard/ModelLogo";

// ── Contract ─────────────────────────────────────────────────────────────
export type Sentiment =
  | "positive"
  | "neutral"
  | "negative"
  | "supportive"
  | "critical"
  | "mixed";
export type ThemeId = "issues" | "recent-news" | "candidate" | "race";
/** A detail spoke a card (or recommendation) can deep-link into. */
export type Spoke =
  | "visibility"
  | "competition"
  | "narrative"
  | "sources"
  | "prompts"
  | "recommendations";
export type Association = "strong" | "moderate" | "weak" | "missing";
export type DeltaDirection = "up" | "down" | "neutral";
export type Trend = "up" | "down" | "flat";

export interface KpiMetric {
  id: string;
  label: string;
  value: string;
  delta: string;
  deltaDirection: DeltaDirection;
  /** Optional trajectory for a micro-sparkline (any scale; nulls = gaps). */
  spark?: (number | null)[];
  /** Optional plain-language definition, shown as a hover/focus tooltip. */
  info?: string;
  /** Optional position-on-a-range cue (e.g. sentiment on −1…+1). */
  scale?: { value: number; min: number; max: number };
}
export interface MentionSeries {
  id: string;
  name: string;
  isSubject: boolean;
  points: (number | null)[]; // 0–100, index-aligned to OverviewData.trendLabels (null = gap)
}
export interface Recommendation {
  id: string;
  title: string;
  rationale: string;
  navigateTo?: ThemeId;
  /** Detail spoke this action's title links into. */
  spoke?: Spoke;
}
export interface ModelDescription {
  id: string;
  name: string;
  summary: string;
  sentiment: Sentiment;
}
export interface DriverTheme {
  id: string;
  label: string;
  association: Association;
}
export interface Competitor {
  id: string;
  name: string;
  mentionRate: number; // 0–100
  avgRank: number;
  topAnswerRate: number; // 0–100
  isSubject: boolean;
}
export interface SourceType {
  id: string;
  label: string;
  share: number; // 0–100
  count: number;
}
export interface TopSource {
  id: string;
  name: string;
  type: string;
  citations: number;
}
export interface Theme {
  id: ThemeId;
  label: string;
  status: string; // free text, e.g. "rank #3"
  sentiment: Sentiment; // drives the badge color
  trend: Trend;
}

export interface OverviewData {
  subject: string;
  /** Subject category, shown as a chip by the name (e.g. "Politician"). */
  category: string | null;
  updatedLabel: string;
  /** What the KPI deltas are measured against, e.g. "Change vs previous snapshot — May 29, 2026 (8 days earlier)". */
  comparisonLabel: string;
  /** One-line synthesis from the backend, shown under the title. */
  bottomLine: string | null;
  kpis: KpiMetric[];
  themes: Theme[];
  mentionTrend: MentionSeries[];
  /** X-axis labels for the mention trend, index-aligned to each series' points. */
  trendLabels: string[];
  competitors: Competitor[];
  drivers: DriverTheme[];
  models: ModelDescription[];
  sources: SourceType[];
  topSources: TopSource[];
  sourceTotalLabel: string;
  recommendations: Recommendation[];
}

// ── Style tokens (semantic) ──────────────────────────────────────────────
const SENTIMENT_STYLE: Record<Sentiment, { bg: string; fg: string; label: string }> = {
  positive: { bg: "var(--bo-pos-bg)", fg: "var(--bo-pos)", label: "Positive" },
  supportive: { bg: "var(--bo-pos-bg)", fg: "var(--bo-pos)", label: "Supportive" },
  neutral: { bg: "var(--bo-neu-bg)", fg: "var(--bo-neu)", label: "Neutral" },
  mixed: { bg: "var(--bo-neu-bg)", fg: "var(--bo-neu)", label: "Mixed" },
  negative: { bg: "var(--bo-neg-bg)", fg: "var(--bo-neg)", label: "Negative" },
  critical: { bg: "var(--bo-neg-bg)", fg: "var(--bo-neg)", label: "Critical" },
};

export const ASSOCIATION_STYLE: Record<Association, { bg: string; fg: string }> = {
  strong: { bg: "var(--bo-pos-bg)", fg: "var(--bo-pos)" },
  moderate: { bg: "var(--bo-bronze-bg)", fg: "var(--bo-bronze-deep)" },
  weak: { bg: "var(--bo-neu-bg)", fg: "var(--bo-neu)" },
  missing: { bg: "var(--bo-neg-bg)", fg: "var(--bo-neg)" },
};

const THEME_DOT: Record<ThemeId, string> = {
  issues: "var(--bo-bronze)",
  "recent-news": "var(--bo-coral)",
  candidate: "var(--bo-blue)",
  race: "var(--bo-green)",
};

const TREND_GLYPH: Record<Trend, string> = { up: "↗", down: "↘", flat: "→" };
const DELTA_COLOR: Record<DeltaDirection, string> = {
  up: "var(--bo-pos)",
  down: "var(--bo-neg)",
  neutral: "var(--bo-muted)",
};

// ── Primitives ───────────────────────────────────────────────────────────
function Eyebrow({ dots, children }: { dots: string[]; children: ReactNode }) {
  return (
    <div className="bo-eyebrow">
      {dots.map((c, i) => (
        <span key={i} className="bo-dot" style={{ background: c }} />
      ))}
      {children}
    </div>
  );
}

// Card header: the eyebrow plus an optional "View all →" deep-link to its spoke.
function CardHead({
  dots,
  children,
  spoke,
  onOpenSpoke,
}: {
  dots: string[];
  children: ReactNode;
  spoke?: Spoke;
  onOpenSpoke?: (spoke: Spoke) => void;
}) {
  return (
    <div className="bo-cardhead">
      <Eyebrow dots={dots}>{children}</Eyebrow>
      {spoke && onOpenSpoke && (
        <button type="button" className="bo-viewall" onClick={() => onOpenSpoke(spoke)}>
          View all →
        </button>
      )}
    </div>
  );
}

function Pill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <span className="bo-pill" style={{ background: bg, color: fg }}>
      {label}
    </span>
  );
}

// Index of the last non-null entry, or -1.
const lastDefined = (pts: (number | null)[]): number => pts.reduce<number>((a, v, i) => (v != null ? i : a), -1);

// Hand-rolled multi-series line chart on a fixed 0–100% domain, with gridlines,
// y-axis ticks, dated x-axis ticks, and a name label at each line's right
// endpoint (so no legend is needed). Points are null-aligned to `labels`, so
// every series shares one time axis; rivals differ by dash pattern + opacity.
function Sparkline({ series, labels }: { series: MentionSeries[]; labels: string[] }) {
  const drawable = series.filter((s) => s.points.some((p) => p != null));
  if (drawable.length === 0 || labels.length === 0) return <div className="bo-empty">No trend yet.</div>;

  const W = 720;
  const H = 272;
  const LX = 38; // left gutter for y-axis labels
  const RX = 100; // right gutter for endpoint labels
  const TY = 16;
  const BY = 30; // bottom gutter for x-axis labels
  const x0 = LX;
  const x1 = W - RX;
  const y0 = TY;
  const y1 = H - BY;
  const MAXV = 100; // mention rate is a percentage
  const N = labels.length;

  const xAt = (i: number) => (N <= 1 ? x1 : x0 + (i / (N - 1)) * (x1 - x0));
  const yAt = (v: number) => y1 - (Math.max(0, Math.min(MAXV, v)) / MAXV) * (y1 - y0);
  const clampY = (y: number) => Math.max(y0, Math.min(y1, y));
  // Catmull-Rom → cubic Bézier: a smooth curve through every point. Control-point
  // y's are clamped to the plot so peaks/troughs don't overshoot past 0/100%.
  const smooth = (cs: { x: number; y: number }[]): string => {
    if (cs.length === 0) return "";
    const head = `M${cs[0].x.toFixed(1)},${cs[0].y.toFixed(1)}`;
    if (cs.length === 1) return head;
    const segs = cs.slice(1).map((p2, i) => {
      const p0 = cs[i - 1] ?? cs[i];
      const p1 = cs[i];
      const p3 = cs[i + 2] ?? p2;
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = clampY(p1.y + (p2.y - p0.y) / 6);
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = clampY(p2.y - (p3.y - p1.y) / 6);
      return `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    });
    return [head, ...segs].join(" ");
  };
  const path = (pts: (number | null)[]) =>
    smooth(
      pts
        .map((v, i) => ({ v, i }))
        .filter((p): p is { v: number; i: number } => p.v != null)
        .map((p) => ({ x: xAt(p.i), y: yAt(p.v) })),
    );

  const rivals = drawable.filter((s) => !s.isSubject);
  const rivalIndex = (s: MentionSeries) => rivals.indexOf(s);
  const rivalDash = (i: number) => (i === 0 ? undefined : i === 1 ? "6 5" : "2 5");
  const rivalOpacity = (i: number) => (i === 0 ? 0.8 : 0.58);

  const subj = drawable.find((s) => s.isSubject);
  const subjFirst = subj ? subj.points.findIndex((p) => p != null) : -1;
  const subjLast = subj ? lastDefined(subj.points) : -1;
  const areaPath =
    subj && subjFirst >= 0
      ? `${path(subj.points)} L${xAt(subjLast).toFixed(1)},${y1.toFixed(1)} L${xAt(subjFirst).toFixed(1)},${y1.toFixed(1)} Z`
      : "";

  // X-axis ticks: up to 5, evenly spaced across the shared time index.
  const tickCount = Math.min(5, N);
  const tickIdx =
    tickCount <= 1 ? [N - 1] : Array.from({ length: tickCount }, (_, k) => Math.round((k * (N - 1)) / (tickCount - 1)));

  // Endpoint labels, de-collided by pushing overlapping labels downward.
  const GAP = 15;
  const labelPos = drawable
    .map((s) => {
      const li = lastDefined(s.points);
      return {
        id: s.id,
        name: s.name,
        y: yAt(s.points[li] as number),
        color: s.isSubject ? "var(--bo-bronze-deep)" : "var(--bo-muted)",
        weight: s.isSubject ? 700 : 600,
      };
    })
    .sort((a, b) => a.y - b.y)
    .reduce<{ id: string; name: string; y: number; color: string; weight: number }[]>((acc, l) => {
      const prev = acc[acc.length - 1];
      return [...acc, { ...l, y: prev ? Math.max(l.y, prev.y + GAP) : l.y }];
    }, []);

  return (
    <svg className="bo-spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mention rate trend">
      <defs>
        <linearGradient id="bo-area-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--bo-bronze)" stopOpacity={0.13} />
          <stop offset="100%" stopColor="var(--bo-bronze)" stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* gridlines + y-axis ticks */}
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line x1={x0} y1={yAt(g)} x2={x1} y2={yAt(g)} stroke="var(--bo-line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <text className="bo-axis" x={x0 - 8} y={yAt(g) + 3.5} textAnchor="end">
            {g}%
          </text>
        </g>
      ))}

      {/* x-axis date ticks */}
      {tickIdx.map((i) => (
        <text
          key={`x-${i}`}
          className="bo-axis"
          x={xAt(i)}
          y={y1 + 16}
          textAnchor={i === 0 ? "start" : i === N - 1 ? "end" : "middle"}
        >
          {labels[i]}
        </text>
      ))}

      {subj && <path d={areaPath} fill="url(#bo-area-fade)" stroke="none" />}

      {drawable.map((s) => {
        const ri = rivalIndex(s);
        return (
          <path
            key={s.id}
            d={path(s.points)}
            fill="none"
            stroke={s.isSubject ? "var(--bo-bronze)" : "var(--bo-line-strong)"}
            strokeWidth={s.isSubject ? 2.5 : 1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={s.isSubject ? undefined : rivalDash(ri)}
            opacity={s.isSubject ? 1 : rivalOpacity(ri)}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}

      {/* endpoint dots */}
      {drawable.map((s) => {
        const li = lastDefined(s.points);
        return (
          <circle
            key={`${s.id}-dot`}
            cx={xAt(li)}
            cy={yAt(s.points[li] as number)}
            r={s.isSubject ? 3.5 : 2.5}
            fill={s.isSubject ? "var(--bo-bronze)" : "var(--bo-line-strong)"}
          />
        );
      })}

      {/* endpoint name labels (replaces the legend) */}
      {labelPos.map((l) => (
        <text
          key={`${l.id}-label`}
          className="bo-spark-label"
          x={x1 + 8}
          y={Math.min(l.y + 3.5, H - 4)}
          style={{ fill: l.color, fontWeight: l.weight }}
        >
          {l.name}
        </text>
      ))}
    </svg>
  );
}

// Tiny single-series sparkline for a KPI card. Self-normalizes; nulls = gaps.
function MiniSpark({ points }: { points: (number | null)[] }) {
  const vals = points.filter((v): v is number => v != null);
  if (vals.length < 2) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const W = 120;
  const H = 26;
  const pad = 2;
  const N = points.length;
  const xAt = (i: number) => (N <= 1 ? 0 : pad + (i / (N - 1)) * (W - pad * 2));
  const yAt = (v: number) => H - pad - ((v - min) / range) * (H - pad * 2);
  const d = points
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v != null)
    .map((p, k) => `${k === 0 ? "M" : "L"}${xAt(p.i).toFixed(1)},${yAt(p.v).toFixed(1)}`)
    .join(" ");
  const li = lastDefined(points);
  return (
    <svg className="bo-kspark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke="var(--bo-line-strong)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {li >= 0 && <circle cx={xAt(li)} cy={yAt(points[li] as number)} r={1.8} fill="var(--bo-bronze)" />}
    </svg>
  );
}

// Categorical palette for the source-type mix (donut, legend, and bars share
// it). Hues are spread across the wheel — gold, olive, clay, slate, plum — but
// kept muted to fit the warm public-affairs aesthetic, so 3–5 segments stay
// clearly distinguishable (the old palette put tan-on-tan for News vs Social).
const SOURCE_PALETTE = ["#8a6d2f", "#5b6b4a", "#bc5f3a", "#41658c", "#8a6a9b"];

// Donut for the source-type mix. Degrades gracefully at zero total.
function Donut({ sources, totalLabel }: { sources: SourceType[]; totalLabel: string }) {
  const size = 116;
  const stroke = 15;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const total = sources.reduce((a, s) => a + s.count, 0);
  const palette = SOURCE_PALETTE;
  // Precompute each arc's length + offset without mutating a render-scoped
  // variable (offset = sum of all preceding arcs' lengths).
  const arcs = sources.map((s, i) => ({
    seg: s,
    color: palette[i % palette.length],
    dash: total > 0 ? (s.count / total) * circ : 0,
    offset: total > 0 ? sources.slice(0, i).reduce((sum, p) => sum + (p.count / total) * circ, 0) : 0,
  }));
  return (
    <svg className="bo-donut" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Source type mix">
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--bo-sand)" strokeWidth={stroke} />
      {total > 0 &&
        arcs.map(({ seg, color, dash, offset }) => (
          <circle
            key={seg.id}
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${c} ${c})`}
          />
        ))}
      {total > 0 && (
        <>
          <text className="bo-donut-num" x={c} y={c - 1} textAnchor="middle">
            {total}
          </text>
          <text className="bo-donut-sub" x={c} y={c + 13} textAnchor="middle">
            {totalLabel.replace(/^\d+\s*/, "") || "cites"}
          </text>
        </>
      )}
    </svg>
  );
}

// A thin −/0/+ position cue for a value on a fixed range (e.g. sentiment on
// −1…+1), so an abstract figure like "−0.04" visibly reads as "near neutral".
function KpiScale({ value, min, max }: { value: number; min: number; max: number }) {
  const span = max - min || 1;
  const pos = Math.max(0, Math.min(100, ((value - min) / span) * 100));
  const mid = Math.max(0, Math.min(100, ((0 - min) / span) * 100));
  const color = value >= 0.15 ? "var(--bo-pos)" : value <= -0.15 ? "var(--bo-neg)" : "var(--bo-neu)";
  return (
    <div className="bo-kscale" aria-hidden>
      <span className="bo-kscale-track" />
      <span className="bo-kscale-mid" style={{ left: `${mid}%` }} />
      <span className="bo-kscale-dot" style={{ left: `${pos}%`, background: color }} />
    </div>
  );
}

// Brand-colored model mark, matching the landing "Cross-model readout" console.
// Prefers a caller-supplied logo, then the shared brand glyph, then an initial.
function ModelMark({ slug, name, logo }: { slug: string; name: string; logo?: ReactNode }) {
  if (logo) return <span className="bo-logo">{logo}</span>;
  const brand = MODEL_BRANDS[slug];
  if (brand) {
    return (
      <span className="bo-logo" style={{ background: brand.bg }} aria-hidden>
        <svg viewBox="0 0 24 24" fill="#fff">
          <path d={brand.path} />
        </svg>
      </span>
    );
  }
  return (
    <span className="bo-logo bo-logo--fallback" aria-hidden>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

// ── Component ──────────────────────────────────────────────────────────────
export function OverviewDashboard({
  data,
  onNavigate,
  onOpenSpoke,
  logos,
}: {
  data: OverviewData;
  onNavigate?: (themeId: ThemeId) => void;
  onOpenSpoke?: (spoke: Spoke) => void;
  logos?: Partial<Record<string, ReactNode>>;
}) {
  return (
    <div className="byline-overview">
      <style>{BO_CSS}</style>

      <header className="bo-head">
        <h1 className="bo-subject">{data.subject}</h1>
        {data.category && <span className="bo-cat">{data.category}</span>}
        <span className="bo-updated">{data.updatedLabel}</span>
      </header>

      {data.bottomLine && <p className="bo-bottomline">{data.bottomLine}</p>}

      {/* KPI strip */}
      <div className="bo-kpis">
        {data.kpis.map((k) => (
          <div key={k.id} className="bo-kpi">
            <div className="bo-kpi-label">
              {k.label}
              {k.info && (
                <span className="bo-kpi-info" tabIndex={0} aria-label={k.info}>
                  i
                  <span className="bo-kpi-tip" role="tooltip">
                    {k.info}
                  </span>
                </span>
              )}
            </div>
            <div className="bo-kpi-value">{k.value}</div>
            {k.scale && <KpiScale value={k.scale.value} min={k.scale.min} max={k.scale.max} />}
            <div className="bo-kpi-delta" style={{ color: DELTA_COLOR[k.deltaDirection] }}>
              {k.delta}
            </div>
            {k.spark && <MiniSpark points={k.spark} />}
          </div>
        ))}
      </div>
      <div className="bo-kpi-note">{data.comparisonLabel}</div>

      {/* Theme spine — navigable. Hidden until theme/bucket data exists. */}
      {data.themes.length > 0 && (
        <div className="bo-spine">
          {data.themes.map((t) => {
            const s = SENTIMENT_STYLE[t.sentiment];
            return (
              <button
                key={t.id}
                type="button"
                className="bo-theme"
                onClick={() => onNavigate?.(t.id)}
                aria-label={`${t.label} — ${t.status}. Open theme detail.`}
              >
                <span className="bo-theme-dot" style={{ background: THEME_DOT[t.id] }} />
                <span className="bo-theme-label">{t.label}</span>
                <span className="bo-theme-status">{t.status}</span>
                <span className="bo-theme-foot">
                  <Pill label={s.label} bg={s.bg} fg={s.fg} />
                  <span className="bo-theme-trend">{TREND_GLYPH[t.trend]}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Top row: mention trend beside the competitive landscape */}
      <div className="bo-toprow">
        {/* Mention trend — headline */}
        <section className="bo-card">
          <CardHead dots={["var(--bo-bronze)"]} spoke="visibility" onOpenSpoke={onOpenSpoke}>
            Mention rate trend
          </CardHead>
          <Sparkline series={data.mentionTrend} labels={data.trendLabels} />
        </section>

        {/* Competitive landscape — beside the chart */}
        <section className="bo-card">
          <CardHead dots={["var(--bo-bronze)"]} spoke="competition" onOpenSpoke={onOpenSpoke}>
            Competitive landscape
          </CardHead>
          <div className="bo-table">
            <div className="bo-trow bo-trow--head">
              <span className="bo-ent">Entity</span>
              <span className="bo-num">Mention %</span>
              <span className="bo-num">Avg rank</span>
              <span className="bo-num">Top answer</span>
            </div>
            {data.competitors.map((c) => (
              <div key={c.id} className={`bo-trow${c.isSubject ? " bo-trow--you" : ""}`}>
                <span className="bo-ent">
                  {c.name}
                  {c.isSubject && <span className="bo-you">You</span>}
                </span>
                <span className="bo-num bo-num--bar">
                  <span className="bo-cbar" style={{ width: `${Math.max(0, Math.min(100, c.mentionRate))}%` }} aria-hidden />
                  <span className="bo-num-v">{c.mentionRate}%</span>
                </span>
                <span className="bo-num">{c.avgRank.toFixed(1)}</span>
                <span className="bo-num">{c.topAnswerRate}%</span>
              </div>
            ))}
          </div>
          <p className="bo-tnote">Avg rank — lower is better.</p>
        </section>
      </div>

      {/* 2×2 grid: readout + prompt themes, then source mix + recommended focus */}
      <div className="bo-grid">
        {/* Cross-model readout — where competitive landscape was */}
        <section className="bo-card">
          <CardHead dots={["var(--bo-bronze)"]} spoke="narrative" onOpenSpoke={onOpenSpoke}>
            How each model describes {data.subject}
          </CardHead>
          <div className="bo-readout">
            {data.models.map((m) => {
              const s = SENTIMENT_STYLE[m.sentiment];
              return (
                <div key={m.id} className="bo-rcard">
                  <ModelMark slug={m.id} name={m.name} logo={logos?.[m.id]} />
                  <div className="bo-rbody">
                    <div className="bo-rtop">
                      <span className="bo-rname">{m.name}</span>
                      <span className="bo-rsent" style={{ background: s.bg, color: s.fg }}>
                        {s.label}
                      </span>
                    </div>
                    <p className="bo-rtext">{m.summary}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Prompt themes — where the cross-model readout was */}
        <section className="bo-card">
          <CardHead dots={["var(--bo-bronze)"]} spoke="prompts" onOpenSpoke={onOpenSpoke}>
            Prompt themes driving this result
          </CardHead>
          {data.drivers.map((d, i) => {
            const s = ASSOCIATION_STYLE[d.association];
            return (
              <div key={d.id} className={`bo-row${i === 0 ? " bo-row--first" : ""}`}>
                <span className="bo-mut">{d.label}</span>
                <Pill label={d.association} bg={s.bg} fg={s.fg} />
              </div>
            );
          })}
        </section>

        {/* Source type mix */}
        <section className="bo-card">
          <CardHead dots={["var(--bo-bronze)"]} spoke="sources" onOpenSpoke={onOpenSpoke}>
            Source type mix
          </CardHead>
          <div className="bo-source-body">
            <Donut sources={data.sources} totalLabel={data.sourceTotalLabel} />
            <div className="bo-source-bars">
              {data.sources.map((s, i) => {
                const color = SOURCE_PALETTE[i % SOURCE_PALETTE.length];
                return (
                  <div key={s.id} className="bo-sbar">
                    <span className="bo-sbar-label">
                      <i style={{ background: color }} />
                      {s.label}
                    </span>
                    <span className="bo-sbar-track" aria-hidden>
                      <i style={{ width: `${s.share}%`, background: color }} />
                    </span>
                    <span className="bo-sbar-val">
                      {s.share}% <em>{s.count}</em>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Top sources — beside the source type mix */}
        <section className="bo-card">
          <CardHead dots={["var(--bo-bronze)"]} spoke="sources" onOpenSpoke={onOpenSpoke}>
            Top sources
          </CardHead>
          {data.topSources.length > 0 ? (
            <div className="bo-topsrc">
              {data.topSources.map((s) => (
                <div key={s.id} className="bo-topsrc-row">
                  <span className="bo-topsrc-name">{s.name}</span>
                  <span className="bo-topsrc-type">{s.type}</span>
                  <span className="bo-topsrc-cites">
                    {s.citations} <em>cites</em>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="bo-empty">No sources cited yet.</div>
          )}
        </section>

        {/* Recommended focus — the action card, full-width banner on its own line */}
        <section className="bo-card bo-card--action bo-card--full">
          <CardHead dots={["var(--bo-bronze)"]} spoke="recommendations" onOpenSpoke={onOpenSpoke}>
            Recommended focus
          </CardHead>
          <ol className="bo-recs">
            {data.recommendations.map((r, i) => {
              const linkSpoke = r.spoke && onOpenSpoke ? r.spoke : null;
              return (
                <li key={r.id} className="bo-rec">
                  <span className="bo-rec-num">{i + 1}</span>
                  <div className="bo-rec-body">
                    {linkSpoke ? (
                      <button
                        type="button"
                        className="bo-rec-title bo-rec-title--link"
                        onClick={() => onOpenSpoke?.(linkSpoke)}
                      >
                        {r.title} →
                      </button>
                    ) : r.navigateTo ? (
                      <button
                        type="button"
                        className="bo-rec-title bo-rec-title--link"
                        onClick={() => r.navigateTo && onNavigate?.(r.navigateTo)}
                      >
                        {r.title} →
                      </button>
                    ) : (
                      <span className="bo-rec-title">{r.title}</span>
                    )}
                    <p className="bo-rec-why">{r.rationale}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </div>
  );
}

// ── Scoped styles ──────────────────────────────────────────────────────────
const BO_CSS = `
.byline-overview {
  --bo-bg: #f4f1ea;
  --bo-card: #ffffff;
  --bo-ink: #16161a;
  --bo-ink-soft: #3b3b42;
  --bo-muted: #6b6b73;
  --bo-line: #e8e7e0;
  --bo-line-strong: #c2c6cb;
  --bo-sand: #efeae0;
  --bo-bronze: #8a6d2f;
  --bo-bronze-deep: #75591f;
  --bo-bronze-bg: rgba(138,109,47,0.12);
  --bo-coral: #b0894e;
  --bo-blue: #4285f4;
  --bo-green: #5b6b4a;
  --bo-pos: #3f7d52;
  --bo-pos-bg: #eaf3ec;
  --bo-neu: #8a7a4e;
  --bo-neu-bg: #f5f0e2;
  --bo-neg: #a85248;
  --bo-neg-bg: #f6eae8;
  --bo-radius: 16px;
  --bo-shadow: 0 1px 2px rgba(28,24,14,0.045), 0 12px 26px -16px rgba(28,24,14,0.18);
  font-family: var(--font-inter, "Inter", -apple-system, system-ui, sans-serif);
  color: var(--bo-ink);
  max-width: 1224px;
  margin: 0 auto;
}
.byline-overview * { box-sizing: border-box; }

.bo-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; }
.bo-subject { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
.bo-cat { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--bo-bronze-deep); background: var(--bo-bronze-bg); padding: 3px 8px; border-radius: 6px; }
.bo-updated { font-size: 12.5px; color: var(--bo-muted); }
.bo-bottomline { margin: 0 0 20px; font-size: 15px; line-height: 1.5; color: var(--bo-ink-soft); max-width: 78ch; }

.bo-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-bottom: 9px; }
.bo-kpi-note { margin: 0 2px 24px; text-align: left; font-size: 11px; color: var(--bo-muted); }
.bo-kpi-label { display: inline-flex; align-items: center; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--bo-ink-soft); }
.bo-kpi-info { position: relative; display: inline-grid; place-items: center; width: 14px; height: 14px; margin-left: 5px; border-radius: 50%; border: 1px solid var(--bo-line-strong); color: var(--bo-muted); font-size: 9px; font-weight: 700; font-style: normal; line-height: 1; text-transform: none; cursor: default; outline: none; }
.bo-kpi-info:hover, .bo-kpi-info:focus-visible { color: var(--bo-ink-soft); border-color: var(--bo-ink-soft); }
.bo-kpi-tip { position: absolute; top: calc(100% + 8px); left: -3px; width: 210px; padding: 9px 11px; border-radius: 9px; background: var(--bo-ink); color: #f3f1ec; font-size: 11.5px; font-weight: 500; line-height: 1.45; letter-spacing: 0; text-transform: none; text-align: left; box-shadow: 0 12px 28px -10px rgba(16,16,26,0.5); opacity: 0; visibility: hidden; transform: translateY(-3px); transition: opacity .13s ease, transform .13s ease, visibility .13s ease; z-index: 60; pointer-events: none; }
.bo-kpi-tip::before { content: ""; position: absolute; bottom: 100%; left: 6px; border: 5px solid transparent; border-bottom-color: var(--bo-ink); }
.bo-kpi-info:hover .bo-kpi-tip, .bo-kpi-info:focus-visible .bo-kpi-tip { opacity: 1; visibility: visible; transform: translateY(0); }
.bo-kpi-value { margin-top: 8px; font-size: 26px; font-weight: 700; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.bo-kpi-delta { margin-top: 6px; font-size: 12.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.bo-kspark { width: 100%; max-width: 150px; height: 24px; display: block; margin-top: 11px; }
/* −/0/+ position cue (sentiment): a track, a 0 tick, and a dot at the value. */
.bo-kscale { position: relative; height: 12px; max-width: 150px; margin-top: 9px; }
.bo-kscale-track { position: absolute; left: 0; right: 0; top: 5px; height: 3px; border-radius: 2px; background: var(--bo-sand); }
.bo-kscale-mid { position: absolute; top: 2px; width: 1px; height: 9px; background: var(--bo-line-strong); transform: translateX(-0.5px); }
.bo-kscale-dot { position: absolute; top: 1px; width: 9px; height: 9px; border-radius: 50%; transform: translateX(-4.5px); border: 2px solid var(--bo-card); box-shadow: 0 0 0 1px rgba(28,24,14,0.06); }

.bo-spine { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px; }
.bo-theme {
  display: flex; flex-direction: column; gap: 7px; text-align: left;
  padding: 14px 16px; border: 1px solid var(--bo-line); border-radius: var(--bo-radius);
  background: var(--bo-card); box-shadow: var(--bo-shadow); cursor: pointer;
  font: inherit; color: inherit; transition: border-color .15s ease, transform .15s ease;
}
.bo-theme:hover { border-color: var(--bo-line-strong); transform: translateY(-1px); }
.bo-theme:focus-visible { outline: 2px solid var(--bo-bronze); outline-offset: 2px; }
.bo-theme-dot { width: 9px; height: 9px; border-radius: 50%; }
.bo-theme-label { font-size: 13.5px; font-weight: 700; letter-spacing: -0.01em; }
.bo-theme-status { font-size: 12px; color: var(--bo-muted); }
.bo-theme-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 2px; }
.bo-theme-trend { color: var(--bo-muted); font-size: 14px; }

/* Top row: a wider trend beside the narrower competitive table. */
.bo-toprow { display: grid; grid-template-columns: 1.6fr 1fr; gap: 18px; margin-bottom: 18px; }
.bo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.bo-card { background: var(--bo-card); border: 1px solid var(--bo-line); border-radius: var(--bo-radius); box-shadow: var(--bo-shadow); padding: 18px 20px; min-width: 0; }
/* Action card — the "do this next" emphasis: warm tint + bronze accent rail. */
.bo-card--full { grid-column: 1 / -1; }
.bo-card--action { background: linear-gradient(180deg, #faf5ea 0%, #fffdf8 70%); border-color: #e7dcc2; box-shadow: inset 3px 0 0 var(--bo-bronze), var(--bo-shadow); }
.bo-card--action .bo-rec-num { background: var(--bo-bronze); color: #fff; }

.bo-cardhead { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.bo-cardhead .bo-eyebrow { margin-bottom: 0; }
.bo-viewall { flex: none; background: none; border: none; padding: 0; font: inherit; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; text-transform: none; color: var(--bo-muted); cursor: pointer; white-space: nowrap; }
.bo-viewall:hover { color: var(--bo-bronze-deep); }
.bo-viewall:focus-visible { outline: 2px solid var(--bo-bronze); outline-offset: 2px; border-radius: 4px; }
.bo-eyebrow { display: flex; align-items: center; gap: 7px; margin-bottom: 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--bo-ink-soft); }
.bo-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.bo-pill { font-size: 10.5px; font-weight: 700; letter-spacing: 0.03em; text-transform: capitalize; padding: 2px 8px; border-radius: 6px; white-space: nowrap; }

.bo-spark { width: 100%; height: auto; display: block; }
.bo-axis { fill: var(--bo-muted); font-size: 10px; font-variant-numeric: tabular-nums; }
.bo-spark-label { font-size: 11px; letter-spacing: -0.01em; }
.bo-empty { font-size: 12.5px; color: var(--bo-muted); padding: 18px 0; }

.bo-table { display: flex; flex-direction: column; }
.bo-trow { display: grid; grid-template-columns: minmax(0,1fr) 88px 60px 68px; align-items: center; gap: 10px; padding: 9px 8px; margin: 0 -8px; border-top: 1px solid var(--bo-line); border-radius: 7px; font-size: 13px; }
.bo-trow--head { border-top: none; padding-bottom: 5px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--bo-muted); font-weight: 700; }
.bo-trow--you { background: var(--bo-bronze-bg); }
.bo-ent { min-width: 0; font-weight: 600; color: var(--bo-ink-soft); display: flex; align-items: center; gap: 7px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bo-trow--you .bo-ent { color: var(--bo-bronze-deep); }
.bo-you { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #fff; background: var(--bo-bronze); border-radius: 4px; padding: 1px 5px; }
.bo-num { text-align: right; font-variant-numeric: tabular-nums; color: var(--bo-ink-soft); white-space: nowrap; }
.bo-trow--head .bo-num { color: var(--bo-muted); }
.bo-trow--you .bo-num { font-weight: 700; color: var(--bo-ink); }
/* Inline magnitude bar behind the Mention % cell for at-a-glance scanning. */
/* Mention % as a labeled bar: a full-cell track, a fill to the value, and the
   number sitting over the right end so bar and figure read as one unit. */
.bo-num--bar { position: relative; display: flex; justify-content: flex-end; align-items: center; padding: 4px 8px; margin: -3px 0; border-radius: 5px; background: var(--bo-sand); overflow: hidden; }
.bo-cbar { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(138,109,47,0.18); }
.bo-trow--you .bo-cbar { background: rgba(138,109,47,0.34); }
.bo-num-v { position: relative; font-variant-numeric: tabular-nums; }
.bo-tnote { margin: 11px 2px 0; font-size: 11px; color: var(--bo-muted); }

/* Cross-model readout — mirrors the landing console's .lc-card rows. */
.bo-readout { display: flex; flex-direction: column; }
.bo-rcard { display: flex; gap: 14px; padding: 16px 0; border-top: 1px solid var(--bo-line); }
.bo-rcard:first-child { border-top: none; padding-top: 2px; }
.bo-rbody { flex: 1; min-width: 0; }
.bo-rtop { display: flex; align-items: center; gap: 10px; margin-bottom: 5px; min-height: 22px; }
.bo-rname { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
.bo-rsent { font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; padding: 3px 9px; border-radius: 6px; white-space: nowrap; }
.bo-rtext { margin: 0; font-size: 14.5px; line-height: 1.55; color: var(--bo-ink-soft); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

.bo-logo { width: 32px; height: 32px; flex: none; border-radius: 8px; display: grid; place-items: center; overflow: hidden; }
.bo-logo--fallback { background: var(--bo-sand); color: var(--bo-ink-soft); font-weight: 700; font-size: 13px; }
.bo-logo svg { width: 17px; height: 17px; display: block; }

.bo-recs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 13px; }
.bo-rec { display: flex; gap: 11px; }
.bo-rec-num { flex: none; width: 22px; height: 22px; border-radius: 50%; background: var(--bo-bronze-bg); color: var(--bo-bronze-deep); font-size: 12px; font-weight: 700; display: grid; place-items: center; }
.bo-rec-body { min-width: 0; }
.bo-rec-title { font-size: 13.5px; font-weight: 700; letter-spacing: -0.01em; color: var(--bo-ink); }
.bo-rec-title--link { background: none; border: none; padding: 0; font: inherit; color: var(--bo-bronze-deep); cursor: pointer; }
.bo-rec-title--link:hover { text-decoration: underline; }
.bo-rec-why { margin: 3px 0 0; font-size: 12.5px; line-height: 1.5; color: var(--bo-muted); }
/* Full-width action banner: lay the recommendations out side by side. */
.bo-card--full .bo-recs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px 28px; }
.bo-card--full .bo-rec { align-items: flex-start; }

.bo-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 0; border-top: 1px solid var(--bo-line); }
.bo-row--first { border-top: none; }
.bo-mut { font-size: 13px; font-weight: 600; color: var(--bo-ink-soft); min-width: 0; }

.bo-source-body { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
.bo-donut { width: 116px; height: 116px; flex: none; }
.bo-donut-num { fill: var(--bo-ink); font-size: 20px; font-weight: 700; }
.bo-donut-sub { fill: var(--bo-muted); font-size: 8px; text-transform: uppercase; letter-spacing: 0.08em; }
.bo-source-bars { flex: 1; min-width: 180px; display: flex; flex-direction: column; gap: 12px; }
.bo-sbar { display: grid; grid-template-columns: 110px 1fr auto; align-items: center; gap: 12px; }
.bo-sbar-label { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--bo-ink-soft); }
.bo-sbar-label i { width: 10px; height: 10px; border-radius: 3px; flex: none; }
.bo-sbar-track { height: 8px; border-radius: 5px; background: var(--bo-sand); overflow: hidden; }
.bo-sbar-track i { display: block; height: 100%; border-radius: 5px; }
.bo-sbar-val { font-size: 12.5px; font-weight: 700; color: var(--bo-ink); font-variant-numeric: tabular-nums; white-space: nowrap; }
.bo-sbar-val em { font-style: normal; font-weight: 500; color: var(--bo-muted); }

/* Top individual sources — a compact leaderboard card beside the type mix. */
.bo-topsrc { display: flex; flex-direction: column; }
.bo-topsrc-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: baseline; gap: 12px; padding: 9px 0; border-top: 1px solid var(--bo-line); font-size: 13px; }
.bo-topsrc-row:first-of-type { border-top: none; }
.bo-topsrc-name { min-width: 0; font-weight: 600; color: var(--bo-ink-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bo-topsrc-type { font-size: 11px; color: var(--bo-muted); text-transform: capitalize; white-space: nowrap; }
.bo-topsrc-cites { font-size: 12.5px; font-weight: 700; color: var(--bo-ink); font-variant-numeric: tabular-nums; white-space: nowrap; }
.bo-topsrc-cites em { font-style: normal; font-weight: 500; color: var(--bo-muted); }

@media (max-width: 860px) {
  .bo-kpis, .bo-spine { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 860px) {
  .bo-card--full .bo-recs { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 860px) {
  .bo-toprow { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .bo-grid { grid-template-columns: 1fr; }
  .bo-card--full .bo-recs { grid-template-columns: 1fr; }
}
`;
