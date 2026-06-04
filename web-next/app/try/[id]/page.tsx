import { notFound } from "next/navigation";
import { OverviewBrief } from "@/components/dashboard/OverviewBrief";
import { getTryOverview, getTryStatus } from "@/lib/tryApi";
import { TryBuilding } from "./TryBuilding";

/**
 * Public try-subject Overview. Renders the SAME <OverviewBrief> as the authed
 * dashboard, fed by the public /api/try endpoints (no login).
 *
 * State machine:
 *   - has a completed refresh        → render the brief
 *   - job finished but still no data → terminal failure (a partial/failed run
 *     produced no usable brief) — NOT an endless spinner
 *   - otherwise (queued/running)     → TryBuilding poller, which
 *     router.refresh()es this server component when the job finishes.
 */
export default async function TryOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  if (!/^\d+$/.test(idStr)) notFound();
  const id = Number.parseInt(idStr, 10);

  const [overview, status] = await Promise.all([
    getTryOverview(id),
    getTryStatus(id),
  ]);
  if (!overview) notFound();

  // As soon as any refresh has completed, show the real brief — even if a
  // later re-run is queued/failed, the last good snapshot is what we want.
  if (overview.meta.latest_refresh_id !== null) {
    const back = (
      <a href="/" className="back-link">
        <svg
          className="ico"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        Byline home
      </a>
    );
    const cta = (
      <a href="/#cta" className="dash-btn dash-btn-accent">
        Track this narrative →
      </a>
    );
    return (
      <>
        <div className="try-banner">
          This is a live, on-the-fly demo run for <b>{overview.subject_name}</b>.
          Sign up to track it continuously and get alerted when the narrative
          shifts.
        </div>
        <OverviewBrief data={overview} backSlot={back} headerAction={cta} />
      </>
    );
  }

  // No completed refresh yet. If the job has already FINISHED (failed, or
  // succeeded-but-partial → no usable brief), this is terminal — show a failure
  // state rather than polling forever.
  if (status?.status === "failed" || status?.status === "succeeded") {
    return (
      <div className="try-state">
        <div className="eyebrow">Live demo</div>
        <h1>{overview.subject_name}</h1>
        <p className="try-failed">
          We couldn’t assemble a brief for this topic — there wasn’t enough
          coverage across the assistants to score it reliably. Try a more
          prominent person, organization, or issue.
        </p>
        <a href="/" className="dash-btn dash-btn-accent">
          ← Try another topic
        </a>
      </div>
    );
  }

  // Still queued/running — poll until it finishes.
  return (
    <TryBuilding subjectId={id} subjectName={overview.subject_name} />
  );
}
