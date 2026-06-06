import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getSubjectOverviewCached,
  getSubject,
  type SubjectOverview,
  type SubjectDetail,
} from "@/lib/api";
import { TrendLines, type TrendSeries } from "@/components/dashboard/TrendLines";
import { SourceDonut, type DonutSegment } from "@/components/dashboard/SourceDonut";
import { VitalsBlock, KpiGrid } from "@/components/dashboard/overviewKpis";
import { ModelLogo, modelBrandColor } from "@/components/dashboard/ModelLogo";
import { SetHeaderTitle } from "@/components/dashboard/HeaderTitle";
import { ExportButton } from "@/components/dashboard/ExportButton";
import {
  buildVisibilityGap,
  buildCoverageMatrix,
  modelTakeaway,
  analyticalFrame,
} from "@/lib/dashboardCopy";
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

const NARRATIVE_LEVEL_LABEL: Record<string, string> = {
  strong: "Strong",
  moderate: "Moderate",
  weak: "Weak",
  missing: "Missing",
};

// Gold/bronze stays tied to the SUBJECT; competitors are neutral grays so the
// accent reads as "you" and rivals recede.
const SUBJECT_COLOR = "#8a6d2f";
const COMP_COLORS = ["#9aa0a6", "#c2c6cb"];

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
      getSubjectOverviewCached(subjectId),
      getSubject(subjectId),
    ]);
  } catch (e) {
    if (e instanceof Error && e.message.includes("404")) notFound();
    throw e;
  }

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

  // ── Competitive landscape ─────────────────────────────────────────────
  const rankingAll = [...data.competitive].sort((a, b) => b.sov - a.sov);
  const maxSov = Math.max(...rankingAll.map((c) => c.sov), 0.0001);
  // Show the top five; always keep the subject's own row even if it ranks lower.
  const ranking = rankingAll.slice(0, 5);
  const subjectRow = rankingAll.find((c) => c.is_subject);
  if (subjectRow && !ranking.includes(subjectRow)) ranking.push(subjectRow);

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

  const nResp = data.meta.n_responses;
  const nPlat = data.meta.n_platforms;
  const headerMeta = [
    updatedShort ? `Updated ${updatedShort}` : null,
    `${nResp} response${nResp === 1 ? "" : "s"} across ${nPlat} platform${nPlat === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  // ── Plain-English interpretation (from the real payload) ─────────────
  const visGap = buildVisibilityGap(data);
  const coverage = buildCoverageMatrix(data);
  // "Where to focus" companion — the top prioritized actions, sourced from the
  // same recommendations data as the exec-band focus and the Recommendations tab.
  const rec = data.recommended_actions;
  const focusActions = rec ? [rec.primary, ...rec.secondary].slice(0, 3) : [];
  const modelTake = modelTakeaway(data);
  const dateRange =
    hasTrend && weeks.length > 0
      ? `${shortWeek(weeks[0])} – ${shortWeek(weeks[weeks.length - 1])}`
      : null;
  function frameFor(slug: string): string | null {
    const card = data.evidence_cards.find(
      (e) => e.model_slug === slug && e.frame_label,
    );
    return card?.frame_label ?? null;
  }

  return (
    <div className="alt-dash">
      {/* Push the subject name + meta up into the top Header bar. */}
      <SetHeaderTitle heading={data.subject_name} meta={headerMeta} />

      {/* Print-only brief header (hidden on screen; shown when exporting to PDF
          since the app chrome / sticky header are stripped for print). */}
      <div className="print-only print-brief-head">
        <div className="pbh-brand">Byline · AI Narrative Brief</div>
        <h1>{data.subject_name}</h1>
        <div className="pbh-meta">{headerMeta}</div>
      </div>

      {/* Scope bar: subject type · tracked models · date range — the analysis
          context, styled as a SaaS control strip. */}
      <div className="alt-controlbar">
        <div className="alt-cb-left">
          <span className={`cat-badge cat-${subject.category}`}>
            {subject.category.charAt(0).toUpperCase() + subject.category.slice(1)}
          </span>
          {perModel.length > 0 && (
            <>
              <span className="alt-cb-sep" aria-hidden />
              <span className="alt-cb-plabel">Tracking</span>
              {perModel.map((m) => (
                <span className="alt-cb-chip" key={m.slug} title={m.name}>
                  <ModelLogo slug={m.slug} size={15} />
                  {MODEL_NAMES[m.slug] ?? m.name}
                </span>
              ))}
            </>
          )}
        </div>
        <div className="alt-cb-right">
          {dateRange && (
            <span className="alt-cb-range">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              {dateRange}
            </span>
          )}
          <ExportButton />
        </div>
      </div>

      {/* Row 1 — four KPI cards on the page background */}
      <KpiGrid kpis={data.kpis} trajectory={data.trajectory} compact />

      {/* Row 2 — Bottom line (left) · Recommended focus + Where to focus (right) */}
      <VitalsBlock
        bottomLine={data.bottom_line}
        recommendedFocus={data.recommended_focus}
        recommendationsHref={`/subjects/${subjectId}/recommendations`}
        extra={
          focusActions.length > 0 ? (
            <div className="vexec-col vexec-focus">
              <div className="eyebrow">Where to focus</div>
              <ol className="focus-list">
                {focusActions.map((a, i) => (
                  <li className="focus-item" key={i}>
                    <span className="focus-num">{i + 1}</span>
                    <div className="focus-body">
                      <span className="focus-label">{a.label}</span>
                      <p className="focus-why">{a.why}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <Link
                href={`/subjects/${subjectId}/recommendations`}
                className="vexec-link"
              >
                View recommendations →
              </Link>
            </div>
          ) : null
        }
        compact
      />

      {/* Visibility gap — the chart + ranking tell one story */}
      {visGap && (
        <div className="alt-section-head">
          <span className="alt-section-title">Visibility gap</span>
          <span className="alt-section-sub">{visGap}</span>
        </div>
      )}
      <div className="alt-grid alt-grid-top">
        <div className="alt-panel alt-panel-chart">
          <div className="alt-panel-head">
            <span className="alt-panel-title">Mention trend</span>
            <span className="alt-panel-sub">% of AI answers mentioning each entity</span>
          </div>
          {hasTrend ? (
            <div className="alt-chart-body">
              <TrendLines labels={weeks.map(shortWeek)} series={trendSeries} height={240} />
              <div className="alt-legend">
                {trendSeries.map((s) => (
                  <span className="alt-legend-item" key={s.name}>
                    <i style={{ background: s.color }} />
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="alt-empty">
              Not enough history yet — the trend appears after a second snapshot.
            </div>
          )}
        </div>

        <div className="alt-panel">
          <div className="alt-panel-head">
            <span className="alt-panel-title">Competitive landscape</span>
            <span className="alt-panel-sub">How the field stacks up in AI answers</span>
            <Link href={`/subjects/${subjectId}/competition`} className="alt-panel-link">
              View competitive →
            </Link>
          </div>
          <div className="alt-rank">
            <div className="alt-rank-row alt-rank-head">
              <span className="r-num">#</span>
              <span className="r-name">Entity</span>
              <span className="alt-rank-bar" aria-hidden />
              <span className="r-val" title="% of AI answers that mention this entity">
                Mention %
              </span>
              <span className="r-val" title="Average position when mentioned">Avg rank</span>
              <span className="r-val" title="% of answers where this entity is the first mentioned">
                Top answer
              </span>
            </div>
            {ranking.map((c) => (
              <Link
                href={`/subjects/${subjectId}/competition`}
                className={`alt-rank-row alt-rank-link${c.is_subject ? " is-subject" : ""}`}
                key={c.name}
              >
                <span className="r-num">{rankingAll.indexOf(c) + 1}</span>
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
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* What drives the gap — prompt patterns (matrix) ║ gaps to close, the
          cause behind the visibility outcome above */}
      <div className="alt-section-head">
        <span className="alt-section-title">What drives the gap</span>
        <span className="alt-section-sub">
          Where AI surfaces the subject — and where it doesn&apos;t.
        </span>
      </div>
      <div className="alt-grid alt-grid-themesrc">
      {coverage.rows.length > 0 && coverage.platforms.length > 0 && (
        <div className="alt-panel">
          <div className="alt-panel-head">
            <span className="alt-panel-title">Prompt themes driving this result</span>
            <span className="alt-panel-sub">
              Per-model prominence and association strength
            </span>
            <Link href={`/subjects/${subjectId}/prompts`} className="alt-panel-link">
              View all prompts →
            </Link>
          </div>
          <div
            className="pt-matrix pt-matrix-strength"
            style={{ ["--ptm-cols" as string]: coverage.platforms.length }}
          >
            <div className="pt-matrix-row pt-matrix-head">
              <span className="ptm-theme">Theme</span>
              {coverage.platforms.map((p) => (
                <span className="ptm-cell" key={p.slug} title={p.name}>
                  <ModelLogo slug={p.slug} size={20} />
                </span>
              ))}
              <span className="ptm-cell ptm-strength-cell">Association</span>
            </div>
            {coverage.rows.map((row) => (
              <div
                className="pt-matrix-row"
                key={row.label + row.full}
                title={row.full}
                tabIndex={0}
                aria-label={row.full}
              >
                <span className="ptm-theme">
                  <span className="ptm-theme-text">{row.label}</span>
                </span>
                {row.cells.map((c) => (
                  <span className="ptm-cell" key={c.slug}>
                    {c.mentioned ? (
                      c.percentile !== null ? (
                        <span
                          className="ptm-pip hit"
                          title={`${MODEL_NAMES[c.slug] ?? c.slug}: mentioned · prominence percentile ${c.percentile} (rank ${c.rank})`}
                        >
                          {c.percentile}
                        </span>
                      ) : (
                        <span
                          className="ptm-pip hit dot"
                          title={`${MODEL_NAMES[c.slug] ?? c.slug}: mentioned`}
                        />
                      )
                    ) : c.present ? (
                      <span
                        className="ptm-pip miss"
                        title={`${MODEL_NAMES[c.slug] ?? c.slug}: not mentioned (0)`}
                      >
                        0
                      </span>
                    ) : (
                      <span
                        className="ptm-pip na"
                        title={`${MODEL_NAMES[c.slug] ?? c.slug}: not asked`}
                      >
                        ·
                      </span>
                    )}
                  </span>
                ))}
                <span className="ptm-cell ptm-strength-cell">
                  <span className={`ng-level ng-${row.level}`}>
                    {NARRATIVE_LEVEL_LABEL[row.level]}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <div className="pt-matrix-legend">
            <span className="ptm-legend-text">
              Prominence percentile (100 = top, 0 = not mentioned) · Association =
              link strength.
            </span>
          </div>
        </div>
      )}
      {data.sources.length > 0 && (
        <div className="alt-panel alt-panel-srctypes">
          <div className="alt-panel-head">
            <span className="alt-panel-title">Source type mix</span>
            <span className="alt-panel-sub">Citations across active models</span>
            <Link href={`/subjects/${subjectId}/sources`} className="alt-panel-link">
              View all sources →
            </Link>
          </div>
          <div className="alt-donut-wrap alt-donut-wrap-wide">
            <SourceDonut segments={donutSegments} total={totalCitations} />
            <div className="alt-srctype-bars">
              {donutSegments.map((s) => {
                const p = Math.round((s.value / (totalCitations || 1)) * 100);
                return (
                  <div className="stb-row" key={s.label}>
                    <span className="stb-label">
                      <i style={{ background: s.color }} />
                      {s.label}
                    </span>
                    <span className="stb-bar" aria-hidden>
                      <i style={{ width: `${p}%`, background: s.color }} />
                    </span>
                    <span className="stb-val">
                      <span className="stb-pct">{p}%</span>
                      <span className="stb-cites">{s.value} cites</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Row 2: per-LLM readout */}
      {perModel.length > 0 && (
        <div className="alt-panel">
          <div className="alt-panel-head">
            <span className="alt-panel-title">
              How each model describes {data.subject_name}
            </span>
            <span className="alt-panel-sub">
              Per-model sentiment, reach, and a sample quote
            </span>
            <Link href={`/subjects/${subjectId}/narrative`} className="alt-panel-link">
              View narrative →
            </Link>
          </div>
          <p className="alt-model-takeaway">{modelTake}</p>
          <div className="alt-model-grid">
            {perModel.map((m) => {
              const tone = sentTone(m.avg_sentiment);
              const quote = excerptFor(m.slug);
              const brand = modelBrandColor(m.slug);
              const frame = frameFor(m.slug);
              return (
                <Link
                  href={`/subjects/${subjectId}/narrative`}
                  className="mq-card mq-card-link"
                  key={m.slug}
                >
                  <span className="mq-accent" style={{ background: brand }} aria-hidden />
                  {frame && <span className="mq-frame">{analyticalFrame(frame)}</span>}
                  <span className="mq-mark" style={{ color: brand }} aria-hidden>
                    “
                  </span>
                  {quote ? (
                    <p className="mq-quote">{quote}</p>
                  ) : (
                    <p className="mq-quote muted">No representative quote surfaced yet.</p>
                  )}
                  <div className="mq-foot">
                    <ModelLogo slug={m.slug} size={30} />
                    <div className="mq-attr">
                      <span className="mq-name">{MODEL_NAMES[m.slug] ?? m.name}</span>
                      {m.avg_rank !== null && (
                        <span className="mq-stat">avg rank {m.avg_rank.toFixed(1)}</span>
                      )}
                    </div>
                    {tone && (
                      <span className={`tone-pill ${tone.cls}`}>
                        {tone.word} {sentVal(m.avg_sentiment)}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
          {/* One slim row for any models not yet tracked, instead of N empty cards */}
          {(() => {
            const untracked = Object.keys(MODEL_NAMES).filter(
              (slug) => !perModel.some((m) => m.slug === slug),
            );
            if (untracked.length === 0) return null;
            return (
              <div className="mq-untracked">
                <span className="mq-untracked-icons" aria-hidden>
                  {untracked.map((slug) => (
                    <ModelLogo key={slug} slug={slug} size={16} />
                  ))}
                </span>
                <span className="mq-untracked-text">
                  Add {untracked.map((slug) => MODEL_NAMES[slug]).join(", ")} to
                  compare how they describe {data.subject_name}.
                </span>
                <Link
                  href={`/subjects/${subjectId}/narrative`}
                  className="mq-untracked-cta"
                >
                  Add models →
                </Link>
              </div>
            );
          })()}
        </div>
      )}

    </div>
  );
}
