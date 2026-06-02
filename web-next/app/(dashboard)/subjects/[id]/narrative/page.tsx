import { notFound } from "next/navigation";
import {
  getSubjectOverview,
  getSubject,
  type SubjectOverview,
  type SubjectDetail,
} from "@/lib/api";
import { RefreshButton } from "../refresh-button";

/**
 * Narrative spoke — how AI talks about the subject (sentiment + framings).
 *
 * Same backend / same getSubjectOverview payload.
 *
 * FIRST SLICE: sentiment mix (mention-scoped pos/neu/neg), narrative
 * clusters (dominant AI framings), and sentiment by topic. Deferred:
 * per-platform sentiment distribution and the narrative-score
 * trajectories (directional_lean / criticism_severity / certainty /
 * net_sentiment).
 */

function formatPct(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}
function formatSent(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}`;
}
function sentimentTone(
  value: number | null,
): { cls: string; word: string } | null {
  if (value === null) return null;
  if (value > 0.1) return { cls: "pos", word: "Positive" };
  if (value < -0.1) return { cls: "neg", word: "Negative" };
  return { cls: "neu", word: "Neutral" };
}

// Stacked pos/neu/neg segment widths (% of total), for the sentiment
// bars. Zero-count segments collapse to 0 width.
function segments(pos: number, neu: number, neg: number) {
  const total = pos + neu + neg || 1;
  return {
    pos: (pos / total) * 100,
    neu: (neu / total) * 100,
    neg: (neg / total) * 100,
  };
}

export default async function NarrativePage({
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
        <div className="eyebrow">Narrative</div>
        <h1>{data.subject_name}</h1>
        <p>
          No snapshots yet. Take the first one to see how the AI assistants
          characterize this subject — the sentiment mix, the dominant framings,
          and how the tone splits by topic.
        </p>
        <div style={{ marginTop: 24 }}>
          <RefreshButton subjectId={subjectId} />
        </div>
      </div>
    );
  }

  const sd = data.sentiment_distribution;
  const sdSeg = segments(sd.positive, sd.neutral, sd.negative);
  const sdTone = sentimentTone(sd.mean);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Narrative</div>
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

      {/* Sentiment mix — pos/neu/neg among mentions */}
      {sd.total > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-tag">Sentiment of mentions</div>
          <div className="sent-mix">
            <div className="sent-head">
              {sdTone && (
                <span className={`tone-pill ${sdTone.cls}`}>{sdTone.word}</span>
              )}
              <span className="sent-mean">mean {formatSent(sd.mean)}</span>
              <span className="sent-total">
                {sd.total} mention{sd.total === 1 ? "" : "s"}
              </span>
            </div>
            <div className="sent-bar">
              <div className="seg pos" style={{ width: `${sdSeg.pos}%` }} />
              <div className="seg neu" style={{ width: `${sdSeg.neu}%` }} />
              <div className="seg neg" style={{ width: `${sdSeg.neg}%` }} />
            </div>
            <div className="sent-legend">
              <span className="sl">
                <span className="ld pos" />
                Positive <b>{sd.positive}</b>
              </span>
              <span className="sl">
                <span className="ld neu" />
                Neutral <b>{sd.neutral}</b>
              </span>
              <span className="sl">
                <span className="ld neg" />
                Negative <b>{sd.negative}</b>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Dominant AI framings */}
      {data.narrative_clusters.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-tag">Dominant AI framings</div>
          <div className="cluster-list">
            {data.narrative_clusters.map((c) => {
              const tone = sentimentTone(c.sentiment_mean);
              return (
                <div className="cluster" key={c.name}>
                  <div className="ch">
                    <span className="cname">{c.name}</span>
                    {tone && (
                      <span className={`tone-pill ${tone.cls}`}>{tone.word}</span>
                    )}
                    <span className="cshare">{formatPct(c.share)} of answers</span>
                  </div>
                  <p className="cdesc">{c.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sentiment by topic */}
      {data.topic_sentiment_matrix.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-tag">Sentiment by topic</div>
          <div className="tsm-list">
            {data.topic_sentiment_matrix.map((t) => {
              const seg = segments(
                t.sentiment_positive,
                t.sentiment_neutral,
                t.sentiment_negative,
              );
              return (
                <div className="tsm-row" key={t.topic_label}>
                  <span className="tsm-name" title={t.topic_label}>
                    {t.topic_label}
                  </span>
                  <span className="tsm-bar">
                    <span className="seg pos" style={{ width: `${seg.pos}%` }} />
                    <span className="seg neu" style={{ width: `${seg.neu}%` }} />
                    <span className="seg neg" style={{ width: `${seg.neg}%` }} />
                  </span>
                  <span className="tsm-val">
                    {t.n_responses} · {formatSent(t.sentiment_mean)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="deferred-note">
        <b>More of the Narrative deep-dive is coming.</b> Per-platform sentiment
        and the narrative-score trajectories (directional lean, criticism
        severity, certainty) are being ported next — all already in the same
        backend payload.
      </div>
    </>
  );
}
