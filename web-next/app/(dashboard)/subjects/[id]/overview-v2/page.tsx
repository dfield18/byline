import { notFound } from "next/navigation";
import { getSubjectOverviewCached, type SubjectOverview } from "@/lib/api";
import { toOverviewData } from "@/components/overview/adapt";
import { OverviewClient } from "./OverviewClient";
import { RefreshButton } from "../refresh-button";

/**
 * Validation route for the new prop-driven OverviewDashboard. Lives alongside
 * the existing /dashboard spoke so the two can be compared before any cutover.
 *
 * Server-fetches the SubjectOverview, handles the empty + error states here, and
 * hands the (serializable) adapted data to a thin client wrapper that owns
 * navigation. (loading.tsx provides the skeleton.)
 */
export default async function OverviewV2Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  if (!/^\d+$/.test(idStr)) notFound();
  const subjectId = Number.parseInt(idStr, 10);

  let data: SubjectOverview;
  try {
    data = await getSubjectOverviewCached(subjectId);
  } catch (e) {
    if (e instanceof Error && e.message.includes("404")) notFound();
    return (
      <div className="first-run">
        <div className="eyebrow">Overview</div>
        <h1>Couldn’t load this overview</h1>
        <p>Something went wrong fetching the latest analysis. Reload to try again.</p>
      </div>
    );
  }

  // Empty: subject is tracked but no snapshot/answers ingested yet.
  if (data.meta.latest_refresh_id === null) {
    return (
      <div className="first-run">
        <div className="eyebrow">Overview</div>
        <h1>{data.subject_name}</h1>
        <p>
          No snapshots yet. Take the first one to populate the KPIs, mention
          trend, competitive landscape, and model readout.
        </p>
        <div style={{ marginTop: 24 }}>
          <RefreshButton subjectId={subjectId} />
        </div>
      </div>
    );
  }

  return <OverviewClient data={toOverviewData(data)} subjectId={subjectId} />;
}
