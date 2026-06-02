import { notFound } from "next/navigation";
import {
  getSubjectOverview,
  getSubject,
  type SubjectOverview,
  type SubjectDetail,
} from "@/lib/api";
import { RefreshButton } from "../refresh-button";

/**
 * Sources spoke — which sites AI leans on when answering about the subject.
 *
 * Same backend / same getSubjectOverview payload (the `sources` array).
 *
 * FIRST SLICE: source type mix (aggregated by category) + an enriched
 * citation leaderboard that exposes the per-platform split inline (the
 * Overview band kept it in a tooltip). Deferred: full per-platform
 * source matrix, domain reclassification controls.
 */

export default async function SourcesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const subjectId = Number.parseInt(idStr, 10);
  if (Number.isNaN(subjectId)) notFound();

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
        <div className="eyebrow">Sources</div>
        <h1>{data.subject_name}</h1>
        <p>
          No snapshots yet. Take the first one to see which websites the AI
          assistants cite when they answer about this subject — by type and by
          influence.
        </p>
        <div style={{ marginTop: 24 }}>
          <RefreshButton subjectId={subjectId} />
        </div>
      </div>
    );
  }

  // Aggregate the source list into a type (category) mix, ranked by
  // total citations.
  const typeMap = new Map<
    string,
    { type: string; sources: number; citations: number }
  >();
  for (const s of data.sources) {
    const e = typeMap.get(s.type) ?? { type: s.type, sources: 0, citations: 0 };
    e.sources += 1;
    e.citations += s.n_citations;
    typeMap.set(s.type, e);
  }
  const typeMix = [...typeMap.values()].sort((a, b) => b.citations - a.citations);
  const maxTypeCit = Math.max(...typeMix.map((t) => t.citations), 1);
  const maxScore = Math.max(...data.sources.map((s) => s.score), 1);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Sources</div>
          <h1>{data.subject_name}</h1>
          <div className="meta-line">
            {updatedShort && <span>Updated {updatedShort}</span>}
            <span className="dot">·</span>
            <span>
              {data.sources.length} source
              {data.sources.length === 1 ? "" : "s"} cited
            </span>
          </div>
        </div>
        <RefreshButton subjectId={subjectId} />
      </div>

      {data.sources.length === 0 ? (
        <div className="deferred-note">
          No sources were cited in this snapshot.
        </div>
      ) : (
        <>
          {/* Source type mix */}
          <div style={{ marginBottom: 24 }}>
            <div className="section-tag">Source type mix</div>
            <div className="lb-list">
              {typeMix.map((t) => (
                <div className="lb-row" key={t.type}>
                  <span className="lb-name">{t.type}</span>
                  <span className="lb-bar">
                    <i style={{ width: `${(t.citations / maxTypeCit) * 100}%` }} />
                  </span>
                  <span className="lb-val">
                    {t.citations} cite{t.citations === 1 ? "" : "s"} · {t.sources}{" "}
                    src
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Top sources — enriched leaderboard with per-platform split */}
          <div style={{ marginBottom: 24 }}>
            <div className="section-tag">Top sources</div>
            <div className="src2-list">
              {data.sources.map((s) => (
                <div className="src2-row" key={s.name}>
                  <div className="src2-top">
                    <div className="source-name">
                      <span className="sd">{s.name}</span>
                      <span className="src-type">{s.type}</span>
                    </div>
                    <div className="source-bar">
                      <i style={{ width: `${(s.score / maxScore) * 100}%` }} />
                    </div>
                    <div className="source-meta">
                      {s.n_citations} cite{s.n_citations === 1 ? "" : "s"} ·{" "}
                      {Math.round(s.response_coverage * 100)}% cov
                    </div>
                  </div>
                  {s.platforms.length > 0 && (
                    <div className="src2-plats">
                      {s.platforms.map((p) => (
                        <span className="src-plat" key={p.slug}>
                          {p.name} {p.n_citations}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="deferred-note">
        <b>More of the Sources deep-dive is coming.</b> The full per-platform
        source matrix and domain-category controls are being ported next.
      </div>
    </>
  );
}
