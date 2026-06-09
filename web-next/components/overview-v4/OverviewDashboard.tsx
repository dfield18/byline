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
import { useState, type MouseEvent, type ReactNode } from "react";
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
  /** One-line plain-English read of what this value means. */
  interpretation?: string;
  /** Render the value at a smaller size (e.g. a long domain). */
  compact?: boolean;
  /** Tooltip for the value when it may be truncated. */
  valueTitle?: string;
  /** Make the value a deep-link into this spoke. */
  spoke?: Spoke;
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
  /** Compact "Addresses: …" cue tying the action to the diagnosis below. */
  addresses?: string | null;
}
export interface ModelDescription {
  id: string;
  name: string;
  /** Concise framing angle for this model (e.g. "Conservative governance"). */
  frame?: string | null;
  /** One-line evidence sentence under the frame tag (from the model's rationale). */
  evidence?: string | null;
  summary: string;
  sentiment: Sentiment;
  /** True for prototype placeholder rows (no live data). */
  placeholder?: boolean;
}
export interface DriverTheme {
  id: string;
  label: string;
  association: Association;
}
export interface CoverageCell {
  slug: string;
  mentioned: boolean;
  present: boolean;
  rank: number | null;
  percentile: number | null;
}
export interface CoverageRow {
  id: string;
  label: string;
  full: string;
  level: Association;
  cells: CoverageCell[];
}
export interface CoverageMatrix {
  platforms: { slug: string; name: string }[];
  rows: CoverageRow[];
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
  /** Data date of this snapshot, e.g. "Jun 2, 2026". */
  snapshotLabel: string | null;
  /** Relative description of the prior run, e.g. "previous run earlier today". */
  comparedWith: string;
  /** What the KPI deltas are measured against (legacy; superseded by comparedWith). */
  comparisonLabel: string;
  /** Executive summary: a bold lead phrase + a normal-weight rest. */
  summaryLead: string | null;
  summaryRest: string;
  kpis: KpiMetric[];
  themes: Theme[];
  mentionTrend: MentionSeries[];
  /** X-axis labels for the mention trend, index-aligned to each series' points. */
  trendLabels: string[];
  /** Short annotation rendered near the subject's endpoint on the trend. */
  trendAnnotation: string | null;
  /** Benchmark cue: mention-rate gap to the leading rival (e.g. "Gap to leading rivals: −60 pp"). */
  trendBenchmark?: string | null;
  /** Insight line for the Mention Rate Trend card. */
  trendInsight: string | null;
  /** Insight line for the Competitive Landscape card. */
  competitiveInsight: string | null;
  competitors: Competitor[];
  drivers: DriverTheme[];
  coverage: CoverageMatrix;
  /** Editorial one-liner summarizing prompt-theme coverage gaps. */
  themesSummary: string | null;
  /** Insight line for the Prompt Coverage Gaps card. */
  gapsInsight: string | null;
  models: ModelDescription[];
  /** Model names we intend to track but have no live data for yet (muted note). */
  untrackedModels?: string[];
  /** Insight line for the Model Framing card. */
  framingInsight: string | null;
  sources: SourceType[];
  topSources: TopSource[];
  sourceTotalLabel: string;
  recommendations: Recommendation[];
  /** Summary sentence at the top of Recommended Next Moves. */
  recsSummary: string;
  /** Compact "what changed vs prior run" cue, derived from snapshot_diff. */
  whatChanged?: string | null;
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
const ASSOC_LABEL: Record<Association, string> = {
  strong: "Strong",
  moderate: "Moderate",
  weak: "Weak",
  missing: "Missing",
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

// Small "i" affordance with a hover/focus tooltip — same pattern as the KPI
// strip, reused for column-header definitions. align="end" opens the bubble
// leftward so it doesn't overflow right-aligned cells near the card edge.
function InfoTip({ text, align = "start" }: { text: string; align?: "start" | "end" }) {
  return (
    <span className="bo-kpi-info" tabIndex={0} aria-label={text}>
      i
      <span
        className={`bo-kpi-tip${align === "end" ? " bo-kpi-tip--end" : ""}`}
        role="tooltip"
      >
        {text}
      </span>
    </span>
  );
}

// Index of the last non-null entry, or -1.
const lastDefined = (pts: (number | null)[]): number => pts.reduce<number>((a, v, i) => (v != null ? i : a), -1);

// Render an insight string with an embedded "N of M" count bolded.
function emphasizeCount(text: string): ReactNode {
  const m = text.match(/\d+ of \d+/);
  if (!m) return text;
  const idx = m.index ?? 0;
  return (
    <>
      {text.slice(0, idx)}
      <strong className="bo-insight-em">{m[0]}</strong>
      {text.slice(idx + m[0].length)}
    </>
  );
}

// Hand-rolled multi-series line chart on a fixed 0–100% domain, with gridlines,
// y-axis ticks, dated x-axis ticks, and a name label at each line's right
// endpoint (so no legend is needed). Points are null-aligned to `labels`, so
// every series shares one time axis; rivals differ by dash pattern + opacity.
function Sparkline({
  series,
  labels,
  annotation,
}: {
  series: MentionSeries[];
  labels: string[];
  annotation?: string | null;
}) {
  // Hovered column index (shared time axis), or null when not hovering.
  const [hover, setHover] = useState<number | null>(null);
  const drawable = series.filter((s) => s.points.some((p) => p != null));
  if (drawable.length === 0 || labels.length === 0) return <div className="bo-empty">No trend yet.</div>;

  const W = 720;
  const H = 404;
  const LX = 46; // left gutter for y-axis labels (wider for larger text)
  // Endpoint labels render INSIDE the plot (right-anchored, with a halo), so the
  // right margin is just a small symmetric gutter — the chart fills the width.
  const RX = 22;
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
  // Darker than --bo-line-strong so the dashed "Leading rivals" line reads on
  // bright monitors, while the dash + thin weight keep it secondary to bronze.
  const RIVAL_STROKE = "#979ca3";
  const rivalOpacity = (i: number) => (i === 0 ? 1 : 0.85);

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

  // Endpoint labels. The subject keeps its own prominent label; when there are
  // ≥2 rivals (which cluster near the top and would collide), collapse them into
  // a single muted "Leading rivals" label at their average height — this also
  // reads the executive point faster: the subject sits far below the field.
  const subjForLabel = drawable.find((s) => s.isSubject);
  const rivalForLabel = drawable.filter((s) => !s.isSubject);
  const rawLabels: { id: string; name: string; y: number; color: string; weight: number }[] = [];
  if (subjForLabel) {
    const li = lastDefined(subjForLabel.points);
    rawLabels.push({
      id: "subject",
      name: subjForLabel.name,
      y: yAt(subjForLabel.points[li] as number),
      color: "var(--bo-bronze-deep)",
      weight: 700,
    });
  }
  if (rivalForLabel.length >= 2) {
    const ys = rivalForLabel.map((s) => yAt(s.points[lastDefined(s.points)] as number));
    rawLabels.push({
      id: "rivals",
      name: "Leading rivals",
      y: ys.reduce((a, b) => a + b, 0) / ys.length,
      color: "var(--bo-muted)",
      weight: 600,
    });
  } else {
    for (const s of rivalForLabel) {
      rawLabels.push({
        id: s.id,
        name: s.name,
        y: yAt(s.points[lastDefined(s.points)] as number),
        color: "var(--bo-muted)",
        weight: 600,
      });
    }
  }
  // De-collide by pushing overlapping labels downward.
  const GAP = 19;
  const labelPos = rawLabels
    .sort((a, b) => a.y - b.y)
    .reduce<{ id: string; name: string; y: number; color: string; weight: number }[]>((acc, l) => {
      const prev = acc[acc.length - 1];
      return [...acc, { ...l, y: prev ? Math.max(l.y, prev.y + GAP) : l.y }];
    }, []);

  // Pointer → nearest column on the shared time axis.
  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || N <= 1) return;
    const vbx = ((e.clientX - rect.left) / rect.width) * W;
    const t = (vbx - x0) / (x1 - x0);
    setHover(Math.max(0, Math.min(N - 1, Math.round(t * (N - 1)))));
  };
  const hoverRows =
    hover === null
      ? []
      : drawable
          .filter((s) => s.points[hover] != null)
          .map((s) => ({
            id: s.id,
            name: s.name,
            value: s.points[hover] as number,
            color: s.isSubject ? "var(--bo-bronze)" : "var(--bo-line-strong)",
            isSubject: s.isSubject,
          }));
  const tipLeft = hover === null ? 0 : Math.max(9, Math.min(91, (xAt(hover) / W) * 100));

  return (
    <div className="bo-spark-wrap">
    <svg
      className="bo-spark"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Mention rate trend"
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
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
            stroke={s.isSubject ? "var(--bo-bronze)" : RIVAL_STROKE}
            strokeWidth={s.isSubject ? 3.2 : 1.7}
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
            fill={s.isSubject ? "var(--bo-bronze)" : RIVAL_STROKE}
          />
        );
      })}

      {/* endpoint name labels, INSIDE the plot (right-anchored just left of each
          endpoint dot, with a halo so they read over the lines) — lets the chart
          fill the width instead of reserving a right-hand label gutter. */}
      {labelPos.map((l) => (
        <text
          key={`${l.id}-label`}
          className="bo-spark-label"
          x={x1 - 6}
          y={Math.min(l.y + 3.5, H - 4)}
          textAnchor="end"
          style={{ fill: l.color, fontWeight: l.weight, fontSize: l.weight >= 700 ? 17 : undefined }}
        >
          {l.name}
        </text>
      ))}

      {/* subtle annotation under the subject's endpoint label */}
      {annotation &&
        (() => {
          const subjLabel = labelPos.find((l) => l.weight >= 700);
          if (!subjLabel) return null;
          return (
            <text
              className="bo-spark-annot"
              x={x1 - 6}
              y={Math.min(subjLabel.y + 20, H - 3)}
              textAnchor="end"
            >
              {annotation}
            </text>
          );
        })()}

      {/* hover guide + per-series markers */}
      {hover !== null && hoverRows.length > 0 && (
        <g>
          <line
            x1={xAt(hover)}
            y1={y0}
            x2={xAt(hover)}
            y2={y1}
            stroke="var(--bo-line-strong)"
            strokeWidth={1}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
          {hoverRows.map((r) => (
            <circle
              key={`${r.id}-hov`}
              cx={xAt(hover)}
              cy={yAt(r.value)}
              r={r.isSubject ? 4 : 3}
              fill={r.color}
              stroke="var(--bo-card)"
              strokeWidth={1.5}
            />
          ))}
        </g>
      )}
    </svg>
      {hover !== null && hoverRows.length > 0 && (
        <div className="bo-sparktip" style={{ left: `${tipLeft}%` }}>
          <div className="bo-sparktip-date">{labels[hover]}</div>
          {hoverRows.map((r) => (
            <div key={r.id} className="bo-sparktip-row">
              <i style={{ background: r.color }} />
              <span className="bo-sparktip-name">{r.name}</span>
              <b>{r.value}%</b>
            </div>
          ))}
        </div>
      )}
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
        <div className="bo-snapshot bo-snapshot--inhead">
          <span className="bo-snap">
            <span className="bo-snap-k">Snapshot</span> {data.snapshotLabel ?? "—"}
          </span>
        </div>
      </header>

      {(data.summaryLead || data.summaryRest) && (
        <p className="bo-bottomline">
          {data.summaryLead && <strong className="bo-summary-lead">{data.summaryLead}</strong>}
          {data.summaryLead ? " " : ""}
          {data.summaryRest}
        </p>
      )}

      {/* KPI strip — consistent sparkline viz across all four */}
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
            <div className="bo-kpi-body">
              <div className="bo-kpi-figs">
                {k.spoke && onOpenSpoke ? (
                  <button
                    type="button"
                    className={`bo-kpi-value bo-kpi-value--link${k.compact ? " bo-kpi-value--sm" : ""}`}
                    title={k.valueTitle}
                    onClick={() => k.spoke && onOpenSpoke(k.spoke)}
                  >
                    {k.value}
                  </button>
                ) : (
                  <div
                    className={`bo-kpi-value${k.compact ? " bo-kpi-value--sm" : ""}`}
                    title={k.valueTitle}
                  >
                    {k.value}
                  </div>
                )}
                <div className="bo-kpi-delta" style={{ color: DELTA_COLOR[k.deltaDirection] }}>
                  {k.delta}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {/* Comparison cue — bottom-left, just under the KPI strip. */}
      <p className="bo-comparison">
        <span className="bo-snap-k">Compared with</span> {data.comparedWith}
      </p>

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

      {/* Recommended next moves — the executive conclusion, answered first */}
      <section className="bo-card bo-card--action">
        <div className="bo-cardhead">
          <Eyebrow dots={["var(--bo-bronze)"]}>Recommended next moves</Eyebrow>
          {onOpenSpoke && (
            <button
              type="button"
              className="bo-viewall"
              onClick={() => onOpenSpoke("recommendations")}
            >
              View all →
            </button>
          )}
        </div>
        <p className="bo-cardnote bo-cardnote--priority">
          {data.recsSummary.startsWith("Priority:") ? (
            <>
              <strong className="bo-priority-k">Priority:</strong>
              {data.recsSummary.slice("Priority:".length)}
            </>
          ) : (
            data.recsSummary
          )}
        </p>
        {data.whatChanged && (
          <div className="bo-changed">
            <span className="bo-changed-dot" aria-hidden />
            <p className="bo-changed-text">
              <span className="bo-changed-k">What changed:</span> {data.whatChanged}
            </p>
          </div>
        )}
        {/* TODO(rec-drawer): make each mini-card open a recommendation detail
            drawer (why this rec, related prompt gaps, example AI answers, driving
            sources, suggested action, expected metric). For now the title links
            into its detail spoke; the card carries a hover affordance only. */}
        <ol className="bo-recs bo-recs--cols">
          {data.recommendations.map((r, i) => {
            const linkSpoke = r.spoke && onOpenSpoke ? r.spoke : null;
            return (
              <li key={r.id} className="bo-rec bo-rec--interactive">
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
                  {r.addresses && (
                    <p className="bo-rec-addr">
                      <span className="bo-rec-addr-k">Addresses:</span> {r.addresses}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ── Visibility performance ─────────────────────────────────────────── */}
      <h2 className="bo-section-h bo-section-h--spaced">Visibility performance</h2>
      <div className="bo-toprow">
        {/* Mention trend — no "View all" (keep the strip uncluttered) */}
        <section className="bo-card">
          <CardHead dots={["var(--bo-bronze)"]}>Mention rate trend</CardHead>
          <div className="bo-trendhead">
            {data.trendInsight && <p className="bo-insight bo-insight--flush">{data.trendInsight}</p>}
            {data.trendBenchmark &&
              (() => {
                const [bLabel, bValue] = data.trendBenchmark.split(/:\s*/);
                return (
                  <span className="bo-benchmark">
                    <span className="bo-benchmark-k">{bLabel}</span>
                    {bValue && <span className="bo-benchmark-v">{bValue}</span>}
                  </span>
                );
              })()}
          </div>
          <Sparkline
            series={data.mentionTrend}
            labels={data.trendLabels}
            annotation={data.trendAnnotation}
          />
        </section>

        {/* Competitive landscape */}
        <section className="bo-card bo-card--roomy">
          <CardHead dots={["var(--bo-bronze)"]} spoke="competition" onOpenSpoke={onOpenSpoke}>
            Competitive landscape
          </CardHead>
          {data.competitiveInsight && <p className="bo-insight">{data.competitiveInsight}</p>}
          <div className="bo-table">
            <div className="bo-trow bo-trow--head">
              <span className="bo-ent">Entity</span>
              <span className="bo-num">
                <span title="Mention Rate">Mention</span>
                <InfoTip align="end" text="Mention Rate — share of AI answers across the tracked prompts that mention this entity at all." />
              </span>
              <span className="bo-num">
                <span title="Average Position">Avg Pos.</span>
                <InfoTip align="end" text="Average Position — mean rank of this entity among all entities named in an answer, when it appears. Lower is better." />
              </span>
              <span className="bo-num">
                <span title="Top Answer Rate">Top Answer</span>
                <InfoTip align="end" text="Top Answer Rate — share of answers where this entity is named first (the top-ranked result)." />
              </span>
            </div>
            {data.competitors.map((c) => (
              <div key={c.id} className={`bo-trow${c.isSubject ? " bo-trow--you" : ""}`}>
                <span className="bo-ent">
                  <span className="bo-ent-name">{c.name}</span>
                </span>
                <span className="bo-num bo-num--bar">
                  <span
                    className="bo-cbar"
                    style={{ width: `${Math.max(0, Math.min(100, c.mentionRate))}%` }}
                    aria-hidden
                  />
                  <span className="bo-num-v">{c.mentionRate}%</span>
                </span>
                <span className="bo-num">{c.avgRank.toFixed(1)}</span>
                <span className="bo-num">{c.topAnswerRate}%</span>
              </div>
            ))}
          </div>
          <p className="bo-tnote">Avg position — lower is better.</p>
        </section>
      </div>

      {/* ── Diagnosis ──────────────────────────────────────────────────────── */}
      <h2 className="bo-section-h">Diagnosis</h2>
      <div className="bo-diag">
        {/* Top row: Model framing (left) + Prompt coverage gaps (right, narrow). */}
        <div className="bo-diag-row">
        {/* Model framing */}
        <section className="bo-card">
          <CardHead dots={["var(--bo-bronze)"]} spoke="narrative" onOpenSpoke={onOpenSpoke}>
            Model framing
          </CardHead>
          {/* Cross-model readout — mirrors the landing console's .lc-card rows
              (logo · name + sentiment + frame · evidence), stacked vertically,
              with dimmed placeholders for models not yet tracked
              (Claude/Perplexity). */}
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
                      {m.frame && <span className="bo-rframe-chip">{m.frame}</span>}
                    </div>
                    {m.evidence && <p className="bo-rev">{m.evidence}</p>}
                  </div>
                </div>
              );
            })}
            {(data.untrackedModels ?? []).map((name) => {
              const slug = name.toLowerCase();
              return (
                <div key={slug} className="bo-rcard bo-rcard--ph">
                  <ModelMark slug={slug} name={name} logo={logos?.[slug]} />
                  <div className="bo-rbody">
                    <div className="bo-rtop">
                      <span className="bo-rname">{name}</span>
                      <span className="bo-rsent bo-rsent--ph">Not yet tracked</span>
                    </div>
                    <p className="bo-rev">Will appear after the next model run.</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        {/* Prompt coverage gaps — right column, narrow. */}
        <section className="bo-card">
          <CardHead dots={["var(--bo-bronze)"]} spoke="prompts" onOpenSpoke={onOpenSpoke}>
            Prompt coverage gaps
          </CardHead>
          {data.themesSummary && <p className="bo-insight">{emphasizeCount(data.themesSummary)}</p>}
          {data.coverage.rows.length > 0 ? (
            <>
              {/* No per-model breakout — just the theme and its association level. */}
              <div className="bo-ptm bo-ptm--nobreak">
                <div className="bo-ptm-row bo-ptm-head">
                  <span className="bo-ptm-theme">Theme</span>
                  <span className="bo-ptm-cell bo-ptm-assoc">Association</span>
                </div>
                {data.coverage.rows.map((row) => (
                  <div className="bo-ptm-row" key={row.id} title={row.full}>
                    <span className="bo-ptm-theme">
                      <span className="bo-ptm-tt">{row.label}</span>
                    </span>
                    <span className="bo-ptm-cell bo-ptm-assoc">
                      <span className={`bo-ng bo-ng--${row.level}`}>{ASSOC_LABEL[row.level]}</span>
                    </span>
                  </div>
                ))}
              </div>
              <p className="bo-ptm-legend">
                Association = link strength across the tracked prompt themes.
              </p>
            </>
          ) : (
            <div className="bo-empty">No prompt-theme coverage yet.</div>
          )}
        </section>
        </div>
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

.bo-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 10px 12px; margin-bottom: 8px; }
.bo-subject { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
.bo-cat { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--bo-muted); background: var(--bo-sand); padding: 2px 6px; border-radius: 5px; }
.bo-summary-lead { font-weight: 600; color: var(--bo-ink); }
/* Section dividers (Visibility performance / Diagnosis). */
.bo-section-h { margin: 0 0 17px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #25252a; }
/* Extra breathing room above the first section header (below the action card). */
.bo-section-h--spaced { margin-top: 32px; }
/* Per-card insight line — semibold, below the header, above the content. */
.bo-insight { margin: -4px 0 14px; font-size: 13.5px; font-weight: 600; line-height: 1.4; color: var(--bo-ink-soft); }
/* Emphasized count inside an insight (e.g. "4 of 5"). */
.bo-insight-em { font-weight: 800; color: var(--bo-ink); }
/* Trend insight + benchmark share a row; the pill sits inline to the right and
   wraps below on narrow widths. */
.bo-trendhead { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.bo-insight--flush { margin: 0; }
/* Benchmark cue — a small, light muted-gold stat pill, secondary to the insight. */
.bo-benchmark { display: inline-flex; align-items: baseline; gap: 5px; padding: 2px 8px; border-radius: 999px; background: rgba(138,109,47,0.055); white-space: nowrap; }
.bo-benchmark-k { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--bo-muted); }
.bo-benchmark-v { font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--bo-bronze-deep); }
.bo-updated { font-size: 12.5px; color: var(--bo-muted); }
.bo-bottomline { margin: 0 0 16px; font-size: 15px; line-height: 1.5; color: var(--bo-ink-soft); max-width: 760px; }

/* KPI strip — a grouped executive metric strip with column dividers. */
.bo-kpis { display: grid; grid-template-columns: repeat(4, 1fr); margin-bottom: 8px; border-top: 1px solid rgba(40,36,22,0.07); border-bottom: 1px solid rgba(40,36,22,0.07); }
/* Comparison cue under the KPI strip, bottom-left, small + muted. */
.bo-comparison { margin: 0 0 26px; font-size: 11px; color: var(--bo-muted); }
.bo-kpi { padding: 18px 22px; }
.bo-kpi:first-child { padding-left: 0; }
/* Soft, low-contrast vertical dividers — premium, not spreadsheet-like. */
.bo-kpi:not(:first-child) { border-left: 1px solid rgba(40,36,22,0.06); }
/* Snapshot metadata strip — rides at the right of the header row. */
.bo-snapshot { display: flex; align-items: baseline; flex-wrap: wrap; gap: 12px; font-size: 12px; color: var(--bo-ink-soft); }
/* Snapshot metadata rides at the right of the header row, aligned to the top
   of the subject title; wraps below the title block on narrow screens. */
.bo-snapshot--inhead { margin-left: auto; margin-top: -22px; }
.bo-snap-k { font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; font-size: 10.5px; color: var(--bo-muted); margin-right: 4px; }
.bo-snap-sep { align-self: center; width: 1px; height: 12px; background: var(--bo-line-strong); }
.bo-kpi-label { display: inline-flex; align-items: center; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--bo-muted); }
.bo-kpi-info { position: relative; display: inline-grid; place-items: center; width: 14px; height: 14px; margin-left: 5px; border-radius: 50%; border: 1px solid var(--bo-line-strong); color: var(--bo-muted); font-size: 9px; font-weight: 700; font-style: normal; line-height: 1; text-transform: none; cursor: default; outline: none; }
.bo-kpi-info:hover, .bo-kpi-info:focus-visible { color: var(--bo-ink-soft); border-color: var(--bo-ink-soft); }
.bo-kpi-tip { position: absolute; top: calc(100% + 8px); left: -3px; width: 210px; padding: 9px 11px; border-radius: 9px; background: var(--bo-ink); color: #f3f1ec; font-size: 11.5px; font-weight: 500; line-height: 1.45; letter-spacing: 0; text-transform: none; text-align: left; box-shadow: 0 12px 28px -10px rgba(16,16,26,0.5); opacity: 0; visibility: hidden; transform: translateY(-3px); transition: opacity .13s ease, transform .13s ease, visibility .13s ease; z-index: 60; pointer-events: none; }
.bo-kpi-tip::before { content: ""; position: absolute; bottom: 100%; left: 6px; border: 5px solid transparent; border-bottom-color: var(--bo-ink); }
/* Right-anchored variant: opens leftward for right-aligned cells. */
.bo-kpi-tip--end { left: auto; right: -3px; }
.bo-kpi-tip--end::before { left: auto; right: 6px; }
.bo-kpi-info:hover .bo-kpi-tip, .bo-kpi-info:focus-visible .bo-kpi-tip { opacity: 1; visibility: visible; transform: translateY(0); }
/* Compact KPI: figures on the left, sparkline/scale on the right of the cell. */
.bo-kpi-body { display: flex; align-items: center; gap: 14px; margin-top: 6px; }
.bo-kpi-figs { flex: none; }
.bo-kpi-viz { flex: 1; min-width: 0; }
.bo-kpi-value { max-width: 100%; font-size: 25px; font-weight: 700; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; line-height: 1.05; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Smaller value for long strings (e.g. a domain) so it doesn't overflow. */
.bo-kpi-value--sm { font-size: 15px; letter-spacing: -0.01em; font-variant-numeric: normal; }
.bo-kpi-value--link { background: none; border: none; padding: 0; font: inherit; color: var(--bo-bronze-deep); cursor: pointer; text-align: left; display: block; }
.bo-kpi-value--link:hover { text-decoration: underline; }
.bo-kpi-delta { margin-top: 4px; font-size: 12.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.bo-kpi-interp { margin-top: 6px; font-size: 12px; line-height: 1.35; color: var(--bo-muted); }
.bo-kspark { width: 100%; height: 34px; display: block; }

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
.bo-toprow { display: grid; grid-template-columns: 1.3fr 1fr; gap: 30px; margin-bottom: 32px; }
.bo-card--roomy { padding: 24px 30px; }
/* Diagnosis: Prompt Coverage Gaps first (left) + wider — it carries more
   strategic weight; Model Framing second (right). */
.bo-grid { display: grid; grid-template-columns: 55fr 45fr; gap: 22px; }
.bo-card { background: var(--bo-card); border: 1px solid var(--bo-line); border-radius: var(--bo-radius); box-shadow: var(--bo-shadow); padding: 22px 24px; min-width: 0; }
/* Action card — the "do this next" emphasis: warm tint + bronze accent rail. */
.bo-card--full { grid-column: 1 / -1; }
/* Left accent rail + a SUBTLE full border (lighter than before now that the
   card sits high on the page) keeps it warm/strategic without heavy gold. */
.bo-card--action { background: linear-gradient(180deg, #faf6ec 0%, #fffdf8 72%); border-color: #f2ece1; box-shadow: inset 4px 0 0 var(--bo-bronze), var(--bo-shadow); padding: 25px 28px; }
.bo-card--action .bo-rec-num { background: var(--bo-bronze); color: #fff; }
.bo-card--action .bo-cardhead { margin-bottom: 11px; }
.bo-card--action .bo-cardnote { margin: -2px 0 7px; }
/* Priority sentence — slightly more weight/size than a plain note. */
.bo-cardnote--priority { font-size: 14px; line-height: 1.5; color: var(--bo-ink-soft); }
.bo-priority-k { font-weight: 700; color: var(--bo-ink); }

.bo-cardhead { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.bo-cardhead .bo-eyebrow { margin-bottom: 0; }
.bo-viewall { flex: none; background: none; border: none; padding: 0; font: inherit; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; text-transform: none; color: var(--bo-muted); cursor: pointer; white-space: nowrap; }
.bo-viewall:hover { color: var(--bo-bronze-deep); }
.bo-viewall:focus-visible { outline: 2px solid var(--bo-bronze); outline-offset: 2px; border-radius: 4px; }
.bo-eyebrow { display: flex; align-items: center; gap: 7px; margin-bottom: 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--bo-ink-soft); }
.bo-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.bo-pill { font-size: 10.5px; font-weight: 700; letter-spacing: 0.03em; text-transform: capitalize; padding: 2px 8px; border-radius: 6px; white-space: nowrap; }

.bo-spark-wrap { position: relative; }
.bo-spark { width: 100%; height: auto; display: block; cursor: crosshair; }
.bo-axis { fill: var(--bo-muted); font-size: 13px; font-variant-numeric: tabular-nums; }
/* Halo (card-colored stroke behind the fill) keeps the in-plot endpoint labels
   legible where they cross the trend lines. */
.bo-spark-label { font-size: 14.5px; letter-spacing: -0.01em; paint-order: stroke; stroke: var(--bo-card); stroke-width: 4px; stroke-linejoin: round; }
.bo-spark-annot { fill: var(--bo-muted); font-size: 11px; paint-order: stroke; stroke: var(--bo-card); stroke-width: 3px; stroke-linejoin: round; }
/* Hover tooltip — values at the hovered column. */
.bo-sparktip { position: absolute; top: 4px; transform: translateX(-50%); pointer-events: none; z-index: 5; background: var(--bo-ink); color: #f3f1ec; border-radius: 9px; padding: 8px 11px; font-size: 11.5px; line-height: 1.4; box-shadow: 0 12px 28px -10px rgba(16,16,26,0.5); white-space: nowrap; }
.bo-sparktip-date { font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #c9c1b2; margin-bottom: 5px; }
.bo-sparktip-row { display: flex; align-items: center; gap: 7px; }
.bo-sparktip-row + .bo-sparktip-row { margin-top: 2px; }
.bo-sparktip-row i { width: 9px; height: 9px; border-radius: 2px; flex: none; }
.bo-sparktip-name { color: #e8e3d8; }
.bo-sparktip-row b { margin-left: auto; padding-left: 12px; font-variant-numeric: tabular-nums; }
.bo-empty { font-size: 12.5px; color: var(--bo-muted); padding: 18px 0; }

.bo-table { display: flex; flex-direction: column; }
.bo-trow { display: grid; grid-template-columns: minmax(0,1fr) 74px 70px 96px; align-items: center; gap: 13px; padding: 14px 8px; margin: 0 -8px; border-top: 1px solid var(--bo-line); border-radius: 7px; font-size: 13px; line-height: 1.4; }
.bo-trow--head { border-top: none; padding-bottom: 9px; align-items: end; font-size: 9px; text-transform: uppercase; letter-spacing: 0.02em; color: var(--bo-muted); font-weight: 700; }
/* Numeric column headers centered over their columns (data cells stay
   right-aligned) for a tighter, more grid-like read. */
.bo-trow--head .bo-num { white-space: nowrap; line-height: 1.15; text-align: center; }
/* Shrink the info "i" in column headers + a little space from the label. */
.bo-trow--head .bo-kpi-info { width: 12px; height: 12px; margin-left: 7px; font-size: 8px; }
.bo-trow--you { background: rgba(138,109,47,0.07); }
.bo-ent { min-width: 0; font-weight: 600; color: var(--bo-ink-soft); display: flex; align-items: center; gap: 7px; }
/* Allow full entity names to wrap to a second line rather than truncate. */
.bo-ent-name { min-width: 0; white-space: normal; overflow-wrap: break-word; line-height: 1.25; }
.bo-trow--you .bo-ent { color: var(--bo-bronze-deep); font-weight: 700; }
.bo-you { flex: none; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #fff; background: var(--bo-bronze); border-radius: 4px; padding: 1px 5px; }
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

/* Diagnosis stack: full-width cards in a vertical column (Model framing row
   above Prompt coverage gaps). */
.bo-diag { display: flex; flex-direction: column; gap: 22px; }
/* Diagnosis row: Model framing (wide) + Prompt coverage gaps (narrow). */
.bo-diag-row { display: grid; grid-template-columns: 1.26fr 0.74fr; gap: 22px; align-items: start; }
/* Cross-model readout — mirrors the landing console's .lc-card rows:
   logo badge · (name + sentiment + frame) · evidence line, stacked vertically. */
.bo-readout { display: flex; flex-direction: column; }
.bo-rcard { display: flex; gap: 15px; padding: 18px 0; border-top: 1px solid var(--bo-line); }
.bo-rcard:first-child { border-top: none; }
.bo-rbody { flex: 1; min-width: 0; }
.bo-rtop { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; min-height: 22px; flex-wrap: wrap; }
.bo-rname { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
.bo-rsent { font-size: 9px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; padding: 2px 6px; border-radius: 5px; white-space: nowrap; opacity: 0.85; }
.bo-rsent--ph { background: var(--bo-sand); color: var(--bo-muted); opacity: 1; }
.bo-rframe-chip { display: inline-block; font-size: 12px; font-weight: 600; color: var(--bo-bronze-deep); background: var(--bo-bronze-bg); padding: 2px 9px; border-radius: 7px; }
.bo-rev { margin: 0; font-size: 14.5px; line-height: 1.55; color: var(--bo-ink-soft); }
/* Placeholder model cards (not yet tracked) — dimmed so they read as pending. */
.bo-rcard--ph { opacity: 0.5; }
/* Editorial intro line under a card header (insights, subtitles). */
.bo-cardnote { margin: -4px 0 14px; font-size: 13px; line-height: 1.45; color: var(--bo-muted); }
.bo-rtext { margin: 0; font-size: 14.5px; line-height: 1.5; color: var(--bo-ink-soft); }

.bo-logo { width: 32px; height: 32px; flex: none; border-radius: 8px; display: grid; place-items: center; overflow: hidden; }
.bo-logo--fallback { background: var(--bo-sand); color: var(--bo-ink-soft); font-weight: 700; font-size: 13px; }
.bo-logo svg { width: 17px; height: 17px; display: block; }

.bo-recs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 13px; }
.bo-rec { display: flex; gap: 11px; }
.bo-rec-num { flex: none; width: 23px; height: 23px; border-radius: 50%; background: var(--bo-bronze-bg); color: var(--bo-bronze-deep); font-size: 12px; font-weight: 700; display: grid; place-items: center; }
.bo-rec-body { min-width: 0; }
.bo-rec-title { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; line-height: 1.25; color: var(--bo-ink); }
.bo-rec-title--link { background: none; border: none; padding: 0; font: inherit; font-weight: 700; color: var(--bo-bronze-deep); cursor: pointer; text-align: left; }
.bo-rec-title--link:hover { text-decoration: underline; }
.bo-rec-why { margin: 9px 0 0; font-size: 12px; line-height: 1.5; color: var(--bo-muted); }
/* Compact evidence cue tying an action back to the diagnosis below — reads as
   quiet metadata, lighter + smaller than the description above it. */
.bo-rec-addr { margin: 12px 0 0; font-size: 10px; line-height: 1.4; color: #90909a; }
.bo-rec-addr-k { font-weight: 600; color: var(--bo-muted); }
/* Recommended next moves: three actions as separated mini-cards, taller so the
   titles read as the primary content and descriptions as supporting detail. */
.bo-recs--cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.bo-recs--cols .bo-rec { align-items: flex-start; gap: 10px; padding: 22px 18px; border: 1px solid var(--bo-line); border-radius: 12px; background: #fdfbf6; }
/* Future-clickable affordance: subtle hover until the detail drawer ships. */
.bo-rec--interactive { transition: border-color .15s ease, background .15s ease; }
.bo-recs--cols .bo-rec--interactive:hover { border-color: var(--bo-line-strong); background: #fdf8ee; }
/* "What changed" — a subtle inline supporting row under the Priority line.
   No box/border/white background; just a small gold dot + muted text so it
   blends into the warm recommendations card. */
.bo-changed { display: flex; align-items: flex-start; gap: 8px; margin: 0 0 19px; }
.bo-changed-dot { flex: none; width: 6px; height: 6px; margin-top: 7px; border-radius: 50%; background: var(--bo-bronze); }
.bo-changed-text { margin: 0; font-size: 13px; line-height: 1.5; color: var(--bo-muted); }
.bo-changed-k { font-weight: 700; color: var(--bo-ink-soft); }

.bo-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 0; border-top: 1px solid var(--bo-line); }
.bo-row--first { border-top: none; }
.bo-mut { font-size: 13px; font-weight: 600; color: var(--bo-ink-soft); min-width: 0; }

/* Prompt-themes coverage matrix (theme × model prominence + association). */
.bo-ptm { display: flex; flex-direction: column; }
.bo-ptm-row { display: grid; grid-template-columns: minmax(0,1fr) repeat(var(--bo-ptm-cols, 2), 44px) 92px; align-items: center; gap: 12px; padding: 13px 8px; margin: 0 -8px; border-top: 1px solid var(--bo-line); border-radius: 7px; }
/* No per-model breakout: just Theme + Association. */
.bo-ptm--nobreak .bo-ptm-row { grid-template-columns: minmax(0,1fr) 110px; }
.bo-ptm-head { border-top: none; padding-bottom: 11px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--bo-muted); font-weight: 700; }
.bo-ptm-theme { min-width: 0; font-size: 13px; font-weight: 600; color: var(--bo-ink-soft); line-height: 1.35; padding-right: 6px; }
.bo-ptm-head .bo-ptm-theme { font-weight: 700; }
.bo-ptm-tt { display: block; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bo-ptm-cell { display: grid; place-items: center; }
/* Placeholder model columns (not yet tracked) — dimmed so they read as pending. */
.bo-ptm-cell--ph { opacity: 0.38; }
.bo-ptm-assoc { justify-items: start; padding-left: 8px; }
.bo-ptm-logo { width: 20px; height: 20px; border-radius: 6px; display: grid; place-items: center; }
.bo-ptm-logo svg { width: 12px; height: 12px; display: block; }
.bo-ptm-logo--fb { background: var(--bo-sand); color: var(--bo-ink-soft); font-size: 10px; font-weight: 700; }
.bo-pip { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; font-size: 10px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
.bo-pip--hit { background: var(--bo-bronze); color: #fff; width: auto; min-width: 24px; height: 18px; padding: 0 6px; border-radius: 9px; }
.bo-pip--hit.bo-pip--dot { width: 9px; min-width: 0; height: 9px; padding: 0; border-radius: 50%; }
.bo-pip--miss { width: auto; min-width: 24px; height: 18px; padding: 0 6px; border-radius: 9px; border: 1px solid var(--bo-line-strong); color: var(--bo-muted); background: transparent; }
.bo-pip--na { color: var(--bo-line-strong); font-weight: 400; }
/* Prompt-themes strength-bar chart: theme label + a bar whose length encodes
   the association level, against a Missing→Strong axis. */
.bo-sb { display: flex; flex-direction: column; margin-top: 6px; }
.bo-sb-row { display: grid; grid-template-columns: minmax(0, 1fr) 1.25fr 64px; gap: 22px; align-items: center; padding: 13px 0; border-top: 1px solid var(--bo-line); }
.bo-sb-axis { border-top: none; padding: 0 0 7px; }
.bo-sb-ticks { display: flex; justify-content: space-between; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; color: #54545d; }
.bo-sb-level { justify-self: end; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--bo-muted); }
.bo-sb-level--moderate { color: var(--bo-bronze-deep); }
.bo-sb-level--strong { color: var(--bo-pos); }
.bo-sb-theme { min-width: 0; font-size: 12.5px; font-weight: 600; color: var(--bo-ink-soft); line-height: 1.35; padding-right: 4px; }
.bo-sb-track { position: relative; height: 9px; border-radius: 5px; background: var(--bo-sand); box-shadow: inset 0 0 0 1px rgba(28,24,14,0.06); overflow: hidden; }
/* faint reference lines at the Weak (⅓) and Moderate (⅔) marks */
.bo-sb-grid { position: absolute; inset: 0; background:
  linear-gradient(90deg, transparent calc(33.33% - 0.5px), var(--bo-line-strong) 33.33%, transparent calc(33.33% + 0.5px)),
  linear-gradient(90deg, transparent calc(66.66% - 0.5px), var(--bo-line-strong) 66.66%, transparent calc(66.66% + 0.5px)); opacity: 0.5; }
.bo-sb-fill { position: absolute; left: 0; top: 0; bottom: 0; min-width: 10px; border-radius: 5px; }
.bo-ng { display: inline-block; flex: none; width: 72px; text-align: center; padding: 3px 0; border-radius: 6px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
.bo-ng--strong { background: var(--bo-pos-bg); color: var(--bo-pos); }
.bo-ng--moderate { background: var(--bo-bronze-bg); color: var(--bo-bronze-deep); }
.bo-ng--weak { background: var(--bo-neu-bg); color: var(--bo-neu); }
.bo-ng--missing { background: var(--bo-neg-bg); color: var(--bo-neg); }
.bo-ptm-legend { margin: 14px 2px 0; font-size: 11px; line-height: 1.5; color: var(--bo-muted); }

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
  .bo-kpis { grid-template-columns: repeat(2, 1fr); }
  .bo-kpi:nth-child(2) { border-left: none; }
  .bo-kpi:nth-child(odd) { padding-left: 0; }
  .bo-spine { grid-template-columns: repeat(2, 1fr); }
  .bo-toprow, .bo-grid, .bo-diag-row { grid-template-columns: 1fr; }
  .bo-recs--cols { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 640px) {
  .bo-kpis { grid-template-columns: 1fr; }
  .bo-kpi { border-left: none; padding-left: 0; }
  .bo-recs--cols { grid-template-columns: 1fr; }
}
`;
