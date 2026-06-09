import { notFound } from "next/navigation";
import { getSubjectOverviewCached, type SubjectOverview } from "@/lib/api";
import { toOverviewData } from "@/components/overview-v5/adapt";
import { OverviewClient } from "./OverviewClient";
import { RefreshButton } from "../refresh-button";

/**
 * overview-v5 — an independent copy of overview-v4 with its OWN component +
 * adapter under components/overview-v5/, so it can be iterated on without
 * touching v4. Reachable at /subjects/[id]/overview-v5 and from the sidebar.
 */
export default async function OverviewV5Page({
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
