import { notFound } from "next/navigation";
import {
  getSubjectOverview,
  getSubject,
  type SubjectOverview,
  type SubjectDetail,
} from "@/lib/api";
import { RefreshButton } from "../refresh-button";
import { PromptCard } from "./PromptCard";
import { PromptPreviewPanel } from "./PromptPreviewPanel";

/**
 * Prompts spoke — the tracked prompts and how each AI assistant answered.
 *
 * Same backend: the prompt list + per-platform mention status come from
 * the getSubjectOverview payload (per_prompt_coverage), and each card
 * lazy-fetches the full per-platform response text on expand via the
 * /api/subjects/{id}/prompts/{promptId}/responses proxy (getPromptResponses).
 *
 * This is the first spoke with interactivity — the expand panel is a
 * client component; the list itself is server-rendered.
 */

export default async function PromptsPage({
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
        <div className="eyebrow">Prompts</div>
        <h1>{data.subject_name}</h1>
        <p>
          No snapshots yet. Take the first one to see every tracked prompt, which
          AI assistants surfaced this subject, and the full text of what each one
          said.
        </p>
        <div style={{ marginTop: 24 }}>
          <RefreshButton subjectId={subjectId} />
        </div>
      </div>
    );
  }

  // Fully-missed prompts lead (the backend already orders them first),
  // so the actionable rows surface at the top.
  const prompts = data.per_prompt_coverage;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Prompts</div>
          <h1>{data.subject_name}</h1>
          <div className="meta-line">
            {updatedShort && <span>Updated {updatedShort}</span>}
            <span className="dot">·</span>
            <span>
              {prompts.length} tracked prompt{prompts.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <RefreshButton subjectId={subjectId} />
      </div>

      <PromptPreviewPanel subject={data.subject_name} />

      {prompts.length === 0 ? (
        <div className="deferred-note">
          No tracked prompts in this snapshot yet.
        </div>
      ) : (
        <div>
          {prompts.map((pc) => (
            <PromptCard
              key={pc.prompt_id}
              subjectId={subjectId}
              promptId={pc.prompt_id}
              rendered={pc.rendered}
              topicLabel={pc.topic_label}
              platformResults={pc.platform_results}
            />
          ))}
        </div>
      )}
    </>
  );
}
