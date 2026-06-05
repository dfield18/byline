import { notFound } from "next/navigation";
import {
  getSubjectOverview,
  getSubject,
  type SubjectOverview,
  type SubjectDetail,
} from "@/lib/api";
import { TrendLines, type TrendSeries } from "@/components/dashboard/TrendLines";
import { SourceDonut, type DonutSegment } from "@/components/dashboard/SourceDonut";
import { VitalsBlock, KpiGrid } from "@/components/dashboard/overviewKpis";
import { RefreshButton } from "../refresh-button";

/**
 * Alternate Overview "dashboard" view — a denser, screenshot-style layout of
 * the SAME data the Overview brief uses (getSubjectOverview). It is NOT a spoke
 * (not in Sidebar's SPOKES) — reachable by URL and from the "Dashboard view"
 * link on the Overview page. No new metrics: every panel is backed by existing
 * fields. Built in the existing token design language; charts are hand-rolled.
 *
 * Panels: Visibility trend (subject + top 2 competitors) · Industry ranking ·
 * How each model describes the subject (per-LLM) · Source types · Top sources.
 */

const MODEL_NAMES: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  claude: "Claude",
  perplexity: "Perplexity",
};

// Subject line + two competitor overlays. Subject is the bronze accent; the
// competitor hues are picked for legibility against the subject and each other.
const SUBJECT_COLOR = "#8a6d2f";
const COMP_COLORS = ["#5f7a52", "#7a818c"];

// Source-type → donut/legend color. Falls back to a neutral for unmapped types.
const TYPE_COLORS: Record<string, string> = {
  news: "#8a6d2f",
  reference: "#5b6b4a",
  "think tank": "#a8894f",
  government: "#6b7280",
  academic: "#7d8b9c",
  advocacy: "#b0894e",
  corporate: "#7c6a4d",
  unknown: "#cfc9ba",
};
function typeColor(t: string): string {
  return TYPE_COLORS[t.toLowerCase()] ?? "#bdb6a6";
}

function pct(v: number | null): string {
  if (v === null) return "—";
  return `${Math.round(v * 100)}%`;
}
function pct0(v: number): string {
  return `${Math.round(v * 100)}%`;
}
function sentTone(v: number | null): { cls: string; word: string } | null {
  if (v === null) return null;
  if (v > 0.1) return { cls: "pos", word: "Positive" };
  if (v < -0.1) return { cls: "neg", word: "Negative" };
  return { cls: "neu", word: "Neutral" };
}
function sentVal(v: number | null): string {
  if (v === null) return "—";
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`;
}
function shortWeek(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
function latestOf(values: (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] !== null) return values[i];
  }
  return null;
}

export default async function AltDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  if (!/^\d+$/.test(idStr)) notFound();
  const subjectId = Number.parseInt(idStr, 10);

  let data: SubjectOverview;
  let subject: SubjectDetail;
  try {
    [data, subject] = await Promise.all([
      getSubjectOverview(subjectId),
      getSubject(subjectId),
    ]);
  } catch (e) {
    if (e instanceof Error && e.message.includes("404")) notFound();
    throw e;
  }
  void subject;

  if (data.meta.latest_refresh_id === null) {
    return (
      <div className="first-run">
        <div className="eyebrow">Dashboard</div>
        <h1>{data.subject_name}</h1>
        <p>
          No snapshots yet. Take the first one to populate the visibility
          trend, industry ranking, per-model readout, and source mix.
        </p>
        <div style={{ marginTop: 24 }}>
          <RefreshButton subjectId={subjectId} />
        </div>
      </div>
    );
  }

  // ── Visibility trend: subject + top 2 competitors over time ──────────
  const weeks = data.trajectory.weeks;
  const hasTrend = weeks.length >= 2;
  const topCompNames = [...data.competitive]
    .filter((c) => !c.is_subject)
    .sort((a, b) => b.sov - a.sov)
    .slice(0, 2)
    .map((c) => c.name);
  const trendSeries: TrendSeries[] = [
    {
      name: data.subject_name,
      values: data.trajectory.ai_recall,
      color: SUBJECT_COLOR,
      emphasis: true,
    },
    ...topCompNames.map((name, i) => {
      const ct = data.competitor_trajectories.find((t) => t.name === name);
      return {
        name,
        values: ct ? ct.mention_rate : weeks.map(() => null),
        color: COMP_COLORS[i],
      } as TrendSeries;
    }),
  ];

  // ── Industry ranking ─────────────────────────────────────────────────
  const ranking = [...data.competitive].sort((a, b) => b.sov - a.sov);
  const maxSov = Math.max(...ranking.map((c) => c.sov), 0.0001);

  // ── Per-LLM readout: recall + sentiment + a representative quote ──────
  const perModel = [...data.per_platform_kpis]
    .filter((m) => (m.n_responses ?? 0) > 0)
    .sort((a, b) => (b.mention_rate ?? 0) - (a.mention_rate ?? 0));
  function excerptFor(slug: string): string | null {
    const card = data.evidence_cards.find((e) => e.model_slug === slug);
    return card ? card.excerpt : null;
  }

  // ── Source types (donut) + top sources table ─────────────────────────
  const byType = new Map<string, number>();
  for (const s of data.sources) {
    byType.set(s.type, (byType.get(s.type) ?? 0) + s.n_citations);
  }
  const totalCitations = data.sources.reduce((acc, s) => acc + s.n_citations, 0);
  const donutSegments: DonutSegment[] = [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value, color: typeColor(label) }));

  const updatedShort = data.meta.last_refresh_at
    ? new Date(data.meta.last_refresh_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{data.subject_name}</h1>
          <div className="meta-line">
            {updatedShort && (
              <>
                <span>Updated {updatedShort}</span>
                <span className="dot">·</span>
              </>
            )}
            <span>
              {data.meta.n_responses} response
              {data.meta.n_responses === 1 ? "" : "s"} across{" "}
              {data.meta.n_platforms} platform
              {data.meta.n_platforms === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <RefreshButton subjectId={subjectId} />
      </div>

      {/* Bottom line + recommended focus, then the four headline KPIs —
          shared with the Overview brief. */}
      <VitalsBlock
        bottomLine={data.bottom_line}
        recommendedFocus={data.recommended_focus}
      />
      <KpiGrid kpis={data.kpis} trajectory={data.trajectory} />

      {/* Row 1: visibility trend + industry ranking */}
      <div className="alt-grid alt-grid-top">
        <div className="alt-panel">
          <div className="alt-panel-head">
            <span className="alt-panel-title">Visibility</span>
            <span className="alt-panel-sub">Percentage of answers mentioning each entity</span>
          </div>
          {hasTrend ? (
            <>
              <TrendLines labels={weeks.map(shortWeek)} series={trendSeries} format={pct0} />
              <div className="alt-legend">
                {trendSeries.map((s) => {
                  const latest = latestOf(s.values);
                  return (
                    <span className="alt-legend-item" key={s.name}>
                      <i style={{ background: s.color }} />
                      {s.name}
                      {latest !== null && <b>{pct0(latest)}</b>}
                    </span>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="alt-empty">
              Not enough history yet — the trend appears after a second snapshot.
            </div>
          )}
        </div>

        <div className="alt-panel">
          <div className="alt-panel-head">
            <span className="alt-panel-title">Industry ranking</span>
            <span className="alt-panel-sub">Entities by visibility</span>
          </div>
          <div className="alt-rank">
            <div className="alt-rank-row alt-rank-head">
              <span className="r-num">#</span>
              <span className="r-name">Entity</span>
              <span className="alt-rank-bar" aria-hidden />
              <span className="r-val">Vis.</span>
              <span className="r-val">Pos.</span>
              <span className="r-val">1st</span>
            </div>
            {ranking.map((c, i) => (
              <div
                className={`alt-rank-row${c.is_subject ? " is-subject" : ""}`}
                key={c.name}
              >
                <span className="r-num">{i + 1}</span>
                <span className="r-name" title={c.name}>
                  <span className="r-name-text">{c.name}</span>
                  {c.is_subject && <span className="you">You</span>}
                </span>
                <span className="alt-rank-bar" aria-hidden>
                  <i style={{ width: `${(c.sov / maxSov) * 100}%` }} />
                </span>
                <span className="r-val">{pct0(c.sov)}</span>
                <span className="r-val">{c.avg_rank !== null ? c.avg_rank.toFixed(1) : "—"}</span>
                <span className="r-val">{pct0(c.first_mention_rate)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: per-LLM readout */}
      {perModel.length > 0 && (
        <div className="alt-panel" style={{ marginBottom: 24 }}>
          <div className="alt-panel-head">
            <span className="alt-panel-title">
              How each model describes {data.subject_name}
            </span>
            <span className="alt-panel-sub">
              Per-model sentiment, reach, and a sample quote
            </span>
          </div>
          <div className="alt-model-grid">
            {perModel.map((m) => {
              const tone = sentTone(m.avg_sentiment);
              const quote = excerptFor(m.slug);
              return (
                <div className="alt-model-card" key={m.slug}>
                  <div className="alt-model-head">
                    <span className="alt-model-name">{MODEL_NAMES[m.slug] ?? m.name}</span>
                    {tone && (
                      <span className={`tone-pill ${tone.cls}`}>
                        {tone.word} {sentVal(m.avg_sentiment)}
                      </span>
                    )}
                  </div>
                  <div className="alt-model-stat">
                    Mentions the subject in <b>{pct(m.mention_rate)}</b> of answers
                    {m.avg_rank !== null ? ` · avg rank ${m.avg_rank.toFixed(1)}` : ""}
                  </div>
                  {quote ? (
                    <p className="alt-model-quote">“{quote}”</p>
                  ) : (
                    <p className="alt-model-quote muted">No representative quote surfaced.</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Row 3: source types + top sources */}
      {data.sources.length > 0 && (
        <div className="alt-grid alt-grid-sources">
          <div className="alt-panel alt-panel-fill">
            <div className="alt-panel-head">
              <span className="alt-panel-title">Source types</span>
              <span className="alt-panel-sub">Citations across active models</span>
            </div>
            <div className="alt-srctypes-body">
              <div className="alt-donut-wrap">
                <SourceDonut segments={donutSegments} total={totalCitations} />
                <div className="alt-donut-legend">
                  {donutSegments.map((s) => {
                    const p = Math.round((s.value / (totalCitations || 1)) * 100);
                    return (
                      <span className="alt-legend-item" key={s.label}>
                        <i style={{ background: s.color }} />
                        {s.label}
                        <b>{s.value}</b>
                        <span className="alt-legend-pct">{p}%</span>
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="alt-typebar" aria-hidden>
                {donutSegments.map((s) => (
                  <span
                    key={s.label}
                    className="alt-typebar-seg"
                    style={{
                      width: `${(s.value / (totalCitations || 1)) * 100}%`,
                      background: s.color,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="alt-panel">
            <div className="alt-panel-head">
              <span className="alt-panel-title">Top sources</span>
              <span className="alt-panel-sub">Most-cited domains</span>
            </div>
            <div className="alt-src">
              <div className="alt-src-row alt-src-head">
                <span className="s-domain">Domain</span>
                <span className="s-val">Used</span>
                <span className="s-val">Cites</span>
                <span className="s-type">Type</span>
              </div>
              {data.sources.map((s) => (
                <div className="alt-src-row" key={s.name}>
                  <span className="s-domain" title={s.name}>
                    <span className="s-domain-text">{s.name}</span>
                  </span>
                  <span className="s-val">{pct0(s.response_coverage)}</span>
                  <span className="s-val">{s.n_citations}</span>
                  <span className="s-type">
                    <span
                      className="s-type-badge"
                      style={{ color: typeColor(s.type), borderColor: typeColor(s.type) }}
                    >
                      {s.type}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
