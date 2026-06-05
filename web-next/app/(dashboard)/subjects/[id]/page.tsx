import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getSubjectOverviewCached,
  getSubject,
  type SubjectOverview,
  type SubjectDetail,
} from "@/lib/api";
import { OverviewBrief } from "@/components/dashboard/OverviewBrief";
import { RefreshButton } from "./refresh-button";

/**
 * Subject Overview — the customer-facing AI Narrative Brief.
 *
 * Same backend, new frontend: this consumes the existing
 * GET /api/subjects/{id}/overview contract (already typed in lib/api.ts)
 * and renders it via the shared <OverviewBrief> presentational component
 * (also used by the public /try/[id] flow). This page owns the data fetch,
 * the back link, and the RefreshButton chrome; the brief itself lives in
 * components/dashboard/OverviewBrief.tsx.
 */

export default async function SubjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  if (!/^\d+$/.test(idStr)) notFound();
  const subjectId = Number.parseInt(idStr, 10);

  // Overview (dashboard data) + subject detail (metadata + 404 signal),
  // fetched concurrently against the same backend.
  let data: SubjectOverview;
  let subject: SubjectDetail;
  try {
    [data, subject] = await Promise.all([
      getSubjectOverviewCached(subjectId),
      getSubject(subjectId),
    ]);
  } catch (e) {
    if (e instanceof Error && e.message.includes("404")) notFound();
    throw e;
  }
  void subject; // reserved for the refresh-history UI (deferred)

  const backLink = (
    <Link href="/subjects" className="back-link">
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
      All subjects
    </Link>
  );

  return (
    <OverviewBrief
      data={data}
      backSlot={backLink}
      headerAction={<RefreshButton subjectId={subjectId} />}
      firstRunAction={<RefreshButton subjectId={subjectId} />}
    />
  );
}
