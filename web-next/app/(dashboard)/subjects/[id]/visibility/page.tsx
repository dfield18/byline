import { notFound } from "next/navigation";
import {
  getSubjectOverview,
  getSubject,
  type SubjectOverview,
  type SubjectDetail,
} from "@/lib/api";
import { RefreshButton } from "../refresh-button";

/**
 * Visibility spoke — the deep-dive on AI Recall / mention prominence.
 *
 * Same backend, same getSubjectOverview payload as the Overview; this
 * just surfaces the visibility-specific slices.
 *
 * FIRST SLICE: per-platform performance, answer prominence (rank
 * distribution), and per-prompt coverage. Deferred: the platform×topic
 * mention-rate heatmap, rank-distribution-by-platform/topic dropdowns,
 * and cross-platform divergence (all already in the payload).
 */

function formatPct(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}
function formatRank(value: number | null): string {
  if (value === null) return "—";
  return value.toFixed(1);
}
function formatSent(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}`;
}

export default async function VisibilityPage({
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

  const updatedShort = data.meta.last_refresh_at
    ? new Date(data.meta.last_refresh_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;

  if (data.meta.latest_refresh_id === null) {
    return (
      <div className="first-run">
        <div className="eyebrow">Visibility</div>
        <h1>{data.subject_name}</h1>
        <p>
          No snapshots yet. Take the first one to see how prominently the major
          AI assistants surface this subject — per platform, by answer position,
          and prompt by prompt.
        </p>
        <div style={{ marginTop: 24 }}>
          <RefreshButton subjectId={subjectId} />
        </div>
      </div>
    );
  }

  const rd = data.rank_distribution;
  const maxBucket = Math.max(...rd.buckets.map((b) => b.share), 0.0001);
  // Canonical platform order/set for the coverage grid columns.
  const platforms = data.per_platform_kpis.map((p) => ({
    slug: p.slug,
    name: p.name,
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Visibility</div>
          <h1>{data.subject_name}</h1>
          <div className="meta-line">
            {updatedShort && <span>Updated {updatedShort}</span>}
            <span className="dot">·</span>
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

      {/* Per-platform performance */}
      {data.per_platform_kpis.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-tag">Per-platform performance</div>
          <div className="table-card table-scroll">
            <table className="subj-table">
              <thead>
                <tr>
                  <th>Platform</th>
                  <th className="num">Responses</th>
                  <th className="num">Mention rate</th>
                  <th className="num">Avg rank</th>
                  <th className="num">First mention</th>
                  <th className="num">Avg sentiment</th>
                </tr>
              </thead>
              <tbody>
                {data.per_platform_kpis.map((p) => (
                  <tr key={p.slug}>
                    <td>
                      <span className="subj-name">{p.name}</span>
                    </td>
                    <td className="num">{p.n_responses}</td>
                    <td className="num">{formatPct(p.mention_rate)}</td>
                    <td className="num">{formatRank(p.avg_rank)}</td>
                    <td className="num">{formatPct(p.first_mention_rate)}</td>
                    <td className="num">{formatSent(p.avg_sentiment)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Answer prominence — rank distribution across all responses */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-tag">
          Answer prominence · {rd.n_mentioned} of {rd.total_responses} mentioned
        </div>
        <div className="rank-list">
          {rd.buckets.map((b) => (
            <div
              className={`rank-row${b.is_absence ? " absence" : ""}`}
              key={b.rank}
            >
              <div className="rank-label">{b.label}</div>
              <div className="rank-bar">
                <i style={{ width: `${(b.share / maxBucket) * 100}%` }} />
              </div>
              <div className="rank-val">
                {formatPct(b.share)} · {b.n}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-prompt coverage — which prompts surface the subject, where */}
      {data.per_prompt_coverage.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-tag">Per-prompt coverage</div>
          <div className="table-card table-scroll">
            <table className="cov-table">
              <thead>
                <tr>
                  <th>Prompt</th>
                  {platforms.map((p) => (
                    <th key={p.slug} className="plat">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.per_prompt_coverage.map((pc) => {
                  const bySlug = new Map(
                    pc.platform_results.map((r) => [r.slug, r]),
                  );
                  return (
                    <tr key={pc.prompt_id}>
                      <td>
                        <div className="cov-prompt">{pc.rendered}</div>
                        {pc.topic_label && (
                          <div className="cov-topic">{pc.topic_label}</div>
                        )}
                      </td>
                      {platforms.map((p) => {
                        const r = bySlug.get(p.slug);
                        let cell = (
                          <span className="cov-absent" title="Not run">
                            ·
                          </span>
                        );
                        if (r?.present && r.mentioned) {
                          cell = (
                            <span
                              className="cov-yes"
                              title={`Mentioned${r.rank ? ` at rank ${r.rank}` : ""}`}
                            >
                              {r.rank ? `#${r.rank}` : "✓"}
                            </span>
                          );
                        } else if (r?.present && !r.mentioned) {
                          cell = (
                            <span className="cov-miss" title="Ran, not mentioned">
                              ✕
                            </span>
                          );
                        }
                        return (
                          <td key={p.slug} className="cov-cell">
                            {cell}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Platform × topic mention-rate heatmap */}
      {(() => {
        const ptm = data.platform_topic_matrix;
        if (ptm.platforms.length === 0 || ptm.topics.length === 0) return null;
        // Densify the sparse cell list into a (platform_slug, topic_label)
        // lookup so every grid cell resolves, even the un-measured ones.
        const cellMap = new Map(
          ptm.cells.map((c) => [`${c.platform_slug} ${c.topic_label}`, c]),
        );
        return (
          <div style={{ marginBottom: 24 }}>
            <div className="section-tag">Mention rate · platform × topic</div>
            <div className="table-card table-scroll">
              <table className="heat">
                <thead>
                  <tr>
                    <th>Topic</th>
                    {ptm.platforms.map((p) => (
                      <th key={p.slug}>{p.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ptm.topics.map((t) => (
                    <tr key={t.label}>
                      <td className="heat-topic">{t.label}</td>
                      {ptm.platforms.map((p) => {
                        const c = cellMap.get(`${p.slug} ${t.label}`);
                        if (!c || c.mention_rate === null) {
                          return (
                            <td
                              key={p.slug}
                              className="heat-cell empty"
                              title="Not measured"
                            >
                              ·
                            </td>
                          );
                        }
                        return (
                          <td
                            key={p.slug}
                            className="heat-cell"
                            style={{
                              background: `rgba(138, 109, 47, ${
                                c.mention_rate * 0.66 + 0.05
                              })`,
                            }}
                            title={`${c.n_mentioned}/${c.n_responses} mentioned`}
                          >
                            {formatPct(c.mention_rate)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Cross-platform divergence */}
      {data.cross_platform_divergence.total_multi_platform > 0 &&
        (() => {
          const cpd = data.cross_platform_divergence;
          return (
            <div style={{ marginBottom: 24 }}>
              <div className="section-tag">Cross-platform agreement</div>
              <div className="stat-strip">
                <div className="stat-cell">
                  <div className="sn">{cpd.agreed}</div>
                  <div className="sk">Platforms agreed</div>
                </div>
                <div className="stat-cell">
                  <div className="sn">{cpd.diverged}</div>
                  <div className="sk">Diverged</div>
                </div>
                <div className="stat-cell">
                  <div className="sn">{formatPct(cpd.alignment_score)}</div>
                  <div className="sk">Alignment score</div>
                </div>
              </div>
              {cpd.divergent_prompts.length > 0 && (
                <div className="div-list">
                  {cpd.divergent_prompts.map((dp) => (
                    <div className="div-row" key={dp.prompt_id}>
                      <div className="div-prompt">{dp.rendered}</div>
                      <div className="div-states">
                        {dp.platform_states.map((s) => (
                          <span
                            key={s.slug}
                            className={`pstat ${s.mentioned ? "yes" : "miss"}`}
                          >
                            {s.name} {s.mentioned ? "✓" : "✕"}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

      <div className="deferred-note">
        <b>One more Visibility view is coming.</b> Rank distribution by platform
        and topic (with combinable dropdown filters) is the remaining deferred
        piece — already in the same backend payload.
      </div>
    </>
  );
}
