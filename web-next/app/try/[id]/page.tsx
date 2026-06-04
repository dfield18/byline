import { notFound } from "next/navigation";
import { OverviewBrief } from "@/components/dashboard/OverviewBrief";
import { getTryOverview, getTryStatus } from "@/lib/tryApi";
import { TryBuilding } from "./TryBuilding";

/**
 * Public try-subject Overview. Renders the SAME <OverviewBrief> as the authed
 * dashboard, fed by the public /api/try endpoints (no login).
 *
 * State machine:
 *   - has a completed refresh  → render the brief
 *   - latest job failed, no data → failure message (via TryBuilding)
 *   - otherwise (queued/running/none) → TryBuilding poller, which
 *     router.refresh()es this server component when the job succeeds.
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

  // No completed refresh yet — building (or failed with no prior data).
  return (
    <TryBuilding subjectId={id} subjectName={overview.subject_name} />
  );
}
