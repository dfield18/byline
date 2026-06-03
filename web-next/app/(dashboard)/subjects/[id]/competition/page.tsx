import { notFound } from "next/navigation";
import {
  getSubjectOverview,
  getSubject,
  type SubjectOverview,
  type SubjectDetail,
} from "@/lib/api";
import { RefreshButton } from "../refresh-button";

/**
 * Competitive spoke — who else AI surfaces in the subject's space.
 *
 * Same backend / same getSubjectOverview payload.
 *
 * FIRST SLICE: share-of-voice (mention-rate) leaderboard, first-mention
 * steal share (who beats the subject to #1), and co-mention frequency
 * (who shares the subject's answers) + mention quality. Deferred:
 * per-platform entity SoV heatmap, topic battleground (topic_leaderboard),
 * per-platform landscape dropdowns.
 *
 * NB the metric landmine: competitive[].sov is MENTION RATE
 * (subject_mentions / total_responses), not the pie-share
 * trajectory.share_of_voice. Labelled "mention rate" throughout.
 */

function formatPct(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}

export default async function CompetitionPage({
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
        <div className="eyebrow">Competitive</div>
        <h1>{data.subject_name}</h1>
        <p>
          No snapshots yet. Take the first one to see who else the AI assistants
          name in this subject&apos;s space — the share-of-voice leaderboard, who
          beats them to the top answer, and who they get grouped with.
        </p>
        <div style={{ marginTop: 24 }}>
          <RefreshButton subjectId={subjectId} />
        </div>
      </div>
    );
  }

  const board = [...data.competitive].sort((a, b) => b.sov - a.sov);
  const maxSov = Math.max(...board.map((r) => r.sov), 0.0001);

  const steal = data.first_mention_steal_share;
  const stealers = steal.stealers;
  const maxSteal = Math.max(...stealers.map((s) => s.share), 0.0001);

  const co = data.co_mention_frequency;
  const maxCo = Math.max(...co.co_mentions.map((c) => c.share), 0.0001);
  const mq = data.mention_quality;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Competitive</div>
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

      {/* Share-of-voice (mention-rate) leaderboard */}
      {board.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-tag">Competitive landscape · mention rate</div>
          <div className="comp-list">
            {board.map((c, i) => (
              <div
                className={`comp-row${c.is_subject ? " is-subject" : ""}`}
                key={c.name}
              >
                <span className="comp-rank">{i + 1}</span>
                <span className="comp-name">
                  {c.name}
                  {c.is_subject && <span className="you">You</span>}
                </span>
                <span className="comp-bar">
                  <i style={{ width: `${(c.sov / maxSov) * 100}%` }} />
                </span>
                <span className="comp-val">{formatPct(c.sov)}</span>
                <span className="comp-aux">
                  {c.avg_rank !== null ? `rank ${c.avg_rank.toFixed(1)}` : "—"} ·{" "}
                  {formatPct(c.first_mention_rate)} first
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Who beats the subject to #1 */}
      {steal.total_responses > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-tag">Who beats {data.subject_name} to #1</div>
          <div className="stat-strip">
            <div className="stat-cell">
              <div className="sn">{steal.subject_first_count}</div>
              <div className="sk">{data.subject_name} first</div>
            </div>
            <div className="stat-cell">
              <div className="sn">{steal.stolen_count}</div>
              <div className="sk">Won by a rival</div>
            </div>
            <div className="stat-cell">
              <div className="sn">{steal.no_first_count}</div>
              <div className="sk">No clear #1</div>
            </div>
          </div>
          {stealers.length > 0 && (
            <div className="lb-list">
              {stealers.map((s) => (
                <div className="lb-row" key={s.name}>
                  <span className="lb-name">{s.name}</span>
                  <span className="lb-bar">
                    <i style={{ width: `${(s.share / maxSteal) * 100}%` }} />
                  </span>
                  <span className="lb-val">
                    {formatPct(s.share)} · {s.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Who shares the subject's answers */}
      {co.co_mentions.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-tag">Who shares {data.subject_name}&apos;s answers</div>
          <div className="section-sub">
            When AI names {data.subject_name} ({co.subject_mention_count}{" "}
            answer{co.subject_mention_count === 1 ? "" : "s"}), they appear in a
            group {formatPct(mq.group.share)} of the time, paired{" "}
            {formatPct(mq.paired.share)}, and alone {formatPct(mq.solo.share)}.
          </div>
          <div className="lb-list">
            {co.co_mentions.map((c) => (
              <div className="lb-row" key={c.name}>
                <span className="lb-name">{c.name}</span>
                <span className="lb-bar">
                  <i style={{ width: `${(c.share / maxCo) * 100}%` }} />
                </span>
                <span className="lb-val">
                  {formatPct(c.share)} · {c.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="deferred-note">
        <b>More of the Competitive deep-dive is coming.</b> The per-platform
        entity share grid, topic battleground (who leads each topic), and
        per-platform landscape are being ported next — all already in the same
        backend payload.
      </div>
    </>
  );
}
