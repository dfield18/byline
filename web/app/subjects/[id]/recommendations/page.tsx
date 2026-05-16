/**
 * Recommendations spoke (hub-and-spokes IA, per STATE.md).
 *
 * The Overview tab renders only the PRIMARY recommended action +
 * a "View all recommendations" link to this page. Here the full
 * set lives: primary + secondary + warning + Regenerate.
 *
 * Data flow mirrors the Overview page exactly — same parallel
 * fetch of overview + subject + subjects so the Header dropdown
 * works. Server Component; `force-dynamic` so cache invalidation
 * from Regenerate / new snapshots propagates immediately.
 */
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { Card, SectionTitle } from "@/components/dashboard/ui";
import {
  getSubject,
  getSubjectOverview,
  listSubjects,
  type Subject,
  type SubjectOverview,
  type SubjectDetail,
} from "@/lib/api";
import { RefreshButton } from "../refresh-button";
import { RecommendedActionsBlock } from "../recommended-actions";

export const dynamic = "force-dynamic";

function deriveInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export default async function RecommendationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const subjectId = Number.parseInt(idStr, 10);
  if (Number.isNaN(subjectId)) notFound();

  // Same parallel-fetch pattern as the Overview tab. listSubjects is
  // non-essential (only powers the Header dropdown), so it fails soft
  // to [] without crashing the page.
  let data: SubjectOverview;
  let subject: SubjectDetail;
  let subjects: Subject[];
  try {
    [data, subject, subjects] = await Promise.all([
      getSubjectOverview(subjectId),
      getSubject(subjectId),
      listSubjects().catch(() => [] as Subject[]),
    ]);
  } catch (e) {
    if (e instanceof Error && e.message.includes("404")) notFound();
    throw e;
  }
  // `subject` is fetched for parity with the Overview chrome's data
  // contract but isn't read directly on this spoke.
  void subject;

  const subjectInitials = deriveInitials(data.subject_name);
  const updated = data.meta.last_refresh_at
    ? new Date(data.meta.last_refresh_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : null;
  const headerMeta =
    updated !== null
      ? `Updated ${updated} · ${data.meta.n_responses} responses`
      : "";

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />

      <div className="flex-1 min-w-0 flex flex-col">
        <Header
          subjectName={data.subject_name}
          subjectInitials={subjectInitials}
          metaLine={headerMeta}
          subjects={subjects.map((s) => ({ id: s.id, name: s.name }))}
          currentSubjectId={subjectId}
          backHref={`/subjects/${subjectId}`}
          backLabel="Overview"
          refreshSlot={<RefreshButton subjectId={subjectId} />}
        />

        <main className="flex-1 px-4 md:px-8 py-6 max-w-[1100px] w-full mx-auto">
          {/* Back-to-Overview affordance for users who navigated here
              via the "View all" link rather than the sidebar. Mirrors
              the Header's back link with a more contextual label. */}
          <Link
            href={`/subjects/${subjectId}`}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back to {data.subject_name} Overview
          </Link>

          <SectionTitle
            eyebrow="Recommendations"
            title="Recommended actions for this snapshot"
            description={`Concrete, executable moves derived from ${data.subject_name}'s latest snapshot. The primary recommendation is the highest-leverage next step; the alternatives below are different angles you can substitute or sequence after.`}
          />

          <Card className="p-5 md:p-6">
            <RecommendedActionsBlock
              actions={data.recommended_actions}
              subjectId={subjectId}
              variant="full"
            />
          </Card>
        </main>
      </div>
    </div>
  );
}
