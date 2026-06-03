import { notFound } from "next/navigation";
import {
  getSubjectOverview,
  getSubject,
  type SubjectOverview,
  type SubjectDetail,
} from "@/lib/api";
import { RefreshButton } from "../refresh-button";
import { RegenerateButton } from "./RegenerateButton";

/**
 * Recommendations spoke — what the data says the subject should do next.
 *
 * Same backend / same getSubjectOverview payload (recommended_actions +
 * topic_leaderboard). The Regenerate button drops the cached LLM
 * recommendations and revalidates (one LLM call).
 *
 * Topic battleground is sorted biggest-gap-first by the backend, so the
 * topics where the subject most trails the leader lead the list.
 */

function formatPct(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}

export default async function RecommendationsPage({
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
        <div className="eyebrow">Recommendations</div>
        <h1>{data.subject_name}</h1>
        <p>
          No snapshots yet. Take the first one to get a recommended action plan —
          where to focus, which sources to reinforce, and the topics where this
          subject most trails the leader.
        </p>
        <div style={{ marginTop: 24 }}>
          <RefreshButton subjectId={subjectId} />
        </div>
      </div>
    );
  }

  const rec = data.recommended_actions;
  const board = data.topic_leaderboard;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Recommendations</div>
          <h1>{data.subject_name}</h1>
          <div className="meta-line">
            {updatedShort && <span>Updated {updatedShort}</span>}
            <span className="dot">·</span>
            <span>
              {data.meta.n_responses} response
              {data.meta.n_responses === 1 ? "" : "s"} analyzed
            </span>
          </div>
        </div>
        <RefreshButton subjectId={subjectId} />
      </div>

      {/* Recommended actions */}
      {rec?.primary && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-head">
            <div className="section-tag">Recommended actions</div>
            <RegenerateButton subjectId={subjectId} />
          </div>
          <div className="action-card">
            <div className="eyebrow">Primary move</div>
            <div className="alabel">{rec.primary.label}</div>
            <p className="aaction">{rec.primary.action}</p>
            <p className="awhy">{rec.primary.why}</p>
            {rec.secondary.length > 0 && (
              <div className="action-sec">
                {rec.secondary.map((s) => (
                  <div className="si" key={s.label}>
                    <div className="sl">{s.label}</div>
                    <div className="sa">{s.action}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {rec.warning && <div className="rec-warning">{rec.warning}</div>}
        </div>
      )}

      {/* Topic battleground */}
      {board.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-tag">Topic battleground</div>
          <div className="battle-list">
            {board.map((t) => (
              <div className="battle-row" key={t.topic_label}>
                <div className="battle-head">
                  <span className="battle-topic">{t.topic_label}</span>
                  {t.subject_is_leader ? (
                    <span className="battle-tag lead">You lead</span>
                  ) : (
                    <span className="battle-tag behind">
                      {Math.round(t.gap_to_leader * 100)}pp behind
                    </span>
                  )}
                </div>
                <div>
                  <div className="bb-row">
                    <span className="bb-lbl">{data.subject_name}</span>
                    <span className="bb-bar">
                      <i className="me" style={{ width: `${t.subject_rate * 100}%` }} />
                    </span>
                    <span className="bb-val">{formatPct(t.subject_rate)}</span>
                  </div>
                  {!t.subject_is_leader && (
                    <div className="bb-row">
                      <span className="bb-lbl">{t.leader_name}</span>
                      <span className="bb-bar">
                        <i
                          className="them"
                          style={{ width: `${t.leader_rate * 100}%` }}
                        />
                      </span>
                      <span className="bb-val">{formatPct(t.leader_rate)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
