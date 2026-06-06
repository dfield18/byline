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
export type Association = "strong" | "moderate" | "weak" | "missing";
export type DeltaDirection = "up" | "down" | "neutral";
export type Trend = "up" | "down" | "flat";

export interface KpiMetric {
  id: string;
  label: string;
  value: string;
  delta: string;
  deltaDirection: DeltaDirection;
}
export interface MentionSeries {
  id: string;
  name: string;
  isSubject: boolean;
  points: number[]; // any scale — the chart normalizes
}
export interface Recommendation {
  id: string;
  title: string;
  rationale: string;
  navigateTo?: ThemeId;
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
export interface Theme {
  id: ThemeId;
  label: string;
  status: string; // free text, e.g. "rank #3"
  sentiment: Sentiment; // drives the badge color
  trend: Trend;
}

export interface OverviewData {
  subject: string;
  updatedLabel: string;
  kpis: KpiMetric[];
  themes: Theme[];
  mentionTrend: MentionSeries[];
  competitors: Competitor[];
  drivers: DriverTheme[];
  models: ModelDescription[];
  sources: SourceType[];
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

function Pill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <span className="bo-pill" style={{ background: bg, color: fg }}>
      {label}
    </span>
  );
}

// Hand-rolled multi-series sparkline (no axes/tooltips). Points are normalized
// across all series so the lines share a vertical scale.
function Sparkline({ series }: { series: MentionSeries[] }) {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return <div className="bo-empty">No trend yet.</div>;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;
  const W = 320;
  const H = 96;
  const pad = 4;
  const path = (pts: number[]) => {
    if (pts.length === 0) return "";
    const step = pts.length <= 1 ? 0 : (W - pad * 2) / (pts.length - 1);
    return pts
      .map((v, i) => {
        const x = pad + i * step;
        const y = H - pad - ((v - min) / range) * (H - pad * 2);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  };
  return (
    <svg className="bo-spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mention trend">
      {series.map((s) => (
        <path
          key={s.id}
          d={path(s.points)}
          fill="none"
          stroke={s.isSubject ? "var(--bo-bronze)" : "var(--bo-line-strong)"}
          strokeWidth={s.isSubject ? 2.5 : 1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={s.isSubject ? undefined : "4 4"}
          opacity={s.isSubject ? 1 : 0.65}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

// Donut for the source-type mix. Degrades gracefully at zero total.
function Donut({ sources, totalLabel }: { sources: SourceType[]; totalLabel: string }) {
  const size = 116;
  const stroke = 15;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const total = sources.reduce((a, s) => a + s.count, 0);
  const palette = ["var(--bo-bronze)", "var(--bo-green)", "var(--bo-coral)", "var(--bo-blue)", "var(--bo-neu)"];
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
  logos,
}: {
  data: OverviewData;
  onNavigate?: (themeId: ThemeId) => void;
  logos?: Partial<Record<string, ReactNode>>;
}) {
  return (
    <div className="byline-overview">
      <style>{BO_CSS}</style>

      <header className="bo-head">
        <h1 className="bo-subject">{data.subject}</h1>
        <span className="bo-updated">{data.updatedLabel}</span>
      </header>

      {/* KPI strip */}
      <div className="bo-kpis">
        {data.kpis.map((k) => (
          <div key={k.id} className="bo-kpi">
            <div className="bo-kpi-label">{k.label}</div>
            <div className="bo-kpi-value">{k.value}</div>
            <div className="bo-kpi-delta" style={{ color: DELTA_COLOR[k.deltaDirection] }}>
              {k.delta}
            </div>
          </div>
        ))}
      </div>

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

      {/* Body grid (2 columns × 3 rows) */}
      <div className="bo-grid">
        {/* Row 1 L — mention trend */}
        <section className="bo-card">
          <Eyebrow dots={["var(--bo-bronze)"]}>Mention trend</Eyebrow>
          <Sparkline series={data.mentionTrend} />
          <div className="bo-legend">
            {data.mentionTrend.map((s) => (
              <span key={s.id} className="bo-legend-item">
                <i
                  style={{
                    background: s.isSubject ? "var(--bo-bronze)" : "var(--bo-line-strong)",
                  }}
                />
                {s.name}
              </span>
            ))}
          </div>
        </section>

        {/* Row 1 R — competitive landscape */}
        <section className="bo-card">
          <Eyebrow dots={["var(--bo-green)"]}>Competitive landscape</Eyebrow>
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
                <span className="bo-num">{c.mentionRate}%</span>
                <span className="bo-num">{c.avgRank.toFixed(1)}</span>
                <span className="bo-num">{c.topAnswerRate}%</span>
              </div>
            ))}
          </div>
        </section>

        {/* Row 2 L — cross-model readout */}
        <section className="bo-card">
          <Eyebrow dots={["var(--bo-blue)"]}>How each model describes {data.subject}</Eyebrow>
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

        {/* Row 2 R — recommendations (the action card) */}
        <section className="bo-card bo-card--action">
          <Eyebrow dots={["var(--bo-bronze)"]}>Recommended focus</Eyebrow>
          <ol className="bo-recs">
            {data.recommendations.map((r, i) => {
              const clickable = !!r.navigateTo;
              return (
                <li key={r.id} className="bo-rec">
                  <span className="bo-rec-num">{i + 1}</span>
                  <div className="bo-rec-body">
                    {clickable ? (
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

        {/* Row 3 L — Prompt themes driving this result (association strength) */}
        <section className="bo-card">
          <Eyebrow dots={["var(--bo-bronze)"]}>Prompt themes driving this result</Eyebrow>
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

        {/* Row 3 R — source type mix */}
        <section className="bo-card">
          <Eyebrow dots={["var(--bo-green)"]}>Source type mix</Eyebrow>
          <div className="bo-source-body">
            <Donut sources={data.sources} totalLabel={data.sourceTotalLabel} />
            <div className="bo-source-bars">
              {data.sources.map((s, i) => {
                const palette = ["var(--bo-bronze)", "var(--bo-green)", "var(--bo-coral)", "var(--bo-blue)", "var(--bo-neu)"];
                const color = palette[i % palette.length];
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

.bo-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 20px; }
.bo-subject { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
.bo-updated { font-size: 12.5px; color: var(--bo-muted); }

.bo-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-bottom: 24px; }
.bo-kpi-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--bo-ink-soft); }
.bo-kpi-value { margin-top: 8px; font-size: 26px; font-weight: 700; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.bo-kpi-delta { margin-top: 6px; font-size: 12.5px; font-weight: 600; font-variant-numeric: tabular-nums; }

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

.bo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.bo-card { background: var(--bo-card); border: 1px solid var(--bo-line); border-radius: var(--bo-radius); box-shadow: var(--bo-shadow); padding: 18px 20px; min-width: 0; }
/* Action card — the "do this next" emphasis: warm tint + bronze accent rail. */
.bo-card--action { background: linear-gradient(180deg, #faf5ea 0%, #fffdf8 70%); border-color: #e7dcc2; box-shadow: inset 3px 0 0 var(--bo-bronze), var(--bo-shadow); }
.bo-card--action .bo-rec-num { background: var(--bo-bronze); color: #fff; }

.bo-eyebrow { display: flex; align-items: center; gap: 7px; margin-bottom: 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--bo-ink-soft); }
.bo-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.bo-pill { font-size: 10.5px; font-weight: 700; letter-spacing: 0.03em; text-transform: capitalize; padding: 2px 8px; border-radius: 6px; white-space: nowrap; }

.bo-spark { width: 100%; height: auto; display: block; }
.bo-legend { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 12px; font-size: 12.5px; color: var(--bo-ink-soft); }
.bo-legend-item { display: inline-flex; align-items: center; gap: 7px; }
.bo-legend-item i { width: 11px; height: 11px; border-radius: 3px; }
.bo-empty { font-size: 12.5px; color: var(--bo-muted); padding: 18px 0; }

.bo-table { display: flex; flex-direction: column; }
.bo-trow { display: grid; grid-template-columns: minmax(0,1fr) 64px 64px 70px; align-items: center; gap: 10px; padding: 9px 8px; margin: 0 -8px; border-top: 1px solid var(--bo-line); border-radius: 7px; font-size: 13px; }
.bo-trow--head { border-top: none; padding-bottom: 5px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--bo-muted); font-weight: 700; }
.bo-trow--you { background: var(--bo-bronze-bg); }
.bo-ent { min-width: 0; font-weight: 600; color: var(--bo-ink-soft); display: flex; align-items: center; gap: 7px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bo-trow--you .bo-ent { color: var(--bo-bronze-deep); }
.bo-you { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #fff; background: var(--bo-bronze); border-radius: 4px; padding: 1px 5px; }
.bo-num { text-align: right; font-variant-numeric: tabular-nums; color: var(--bo-ink-soft); white-space: nowrap; }
.bo-trow--head .bo-num { color: var(--bo-muted); }
.bo-trow--you .bo-num { font-weight: 700; color: var(--bo-ink); }

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

@media (max-width: 860px) {
  .bo-kpis, .bo-spine { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
  .bo-grid { grid-template-columns: 1fr; }
}
`;
