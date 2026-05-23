/**
 * Prompts spoke.
 *
 * Single-section page: a sortable table of every monitored prompt
 * with per-prompt visibility metrics. Exports as CSV and PNG.
 * Right-rail filters honor the global topic + platform scope
 * (same dropdown components the other spokes use).
 *
 * Data: SubjectOverview.per_prompt_coverage. Each row covers one
 * prompt template + its platform results. Sentiment / first-mention
 * per prompt aren't in the payload yet — those columns can be added
 * when the backend extends the per_prompt_coverage aggregator.
 */
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { PromptsTable } from "./PromptsTable";
import {
  getSubject,
  getSubjectOverview,
  listSubjects,
  type Subject,
  type SubjectOverview,
  type SubjectDetail,
} from "@/lib/api";
import { RefreshButton } from "../refresh-button";

export const dynamic = "force-dynamic";

function deriveInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export default async function PromptsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ topic?: string; platform?: string }>;
}) {
  const { id: idStr } = await params;
  const sp = await searchParams;
  const topic = sp.topic || "";
  const platform = sp.platform || "";

  const subjectId = Number.parseInt(idStr, 10);
  if (Number.isNaN(subjectId)) notFound();

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
  void subject;

  // URL-param sanitization: drop topic / platform values that don't
  // match the payload so the rail dropdowns can't claim a scope the
  // table can't honor.
  const validTopicSet = new Set([
    ...data.topic_coverage.map((t) => t.label),
    ...data.per_prompt_coverage
      .map((p) => p.topic_label)
      .filter((l): l is string => Boolean(l)),
  ]);
  const validPlatformSlugSet = new Set(
    data.platform_topic_matrix.platforms.map((p) => p.slug),
  );
  let needsRedirect = false;
  const sanitized: Record<string, string> = { topic, platform };
  if (topic && !validTopicSet.has(topic)) {
    sanitized.topic = "";
    needsRedirect = true;
  }
  if (platform && !validPlatformSlugSet.has(platform)) {
    sanitized.platform = "";
    needsRedirect = true;
  }
  if (needsRedirect) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sanitized)) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    redirect(qs ? `?${qs}` : `?`);
  }

  const subjectInitials = deriveInitials(data.subject_name);
  const updated = data.meta.last_refresh_at
    ? new Date(data.meta.last_refresh_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
  const headerMeta = updated ? `Updated ${updated}` : "";

  // Apply global filters at the row level:
  //   - Topic: match `topic_label` exactly.
  //   - Platform: keep prompts that were actually run on the chosen
  //     platform (platform_results has present=true for that slug).
  //     We DON'T narrow the platform_results array within each row —
  //     metrics stay aggregated across all tested platforms — because
  //     a per-platform view would collapse most columns to binary
  //     (mentioned / not). The filter answers "which prompts include
  //     this platform" rather than "what's the score on this
  //     platform alone."
  const filteredRows = data.per_prompt_coverage.filter((p) => {
    const topicOk = !topic || p.topic_label === topic;
    const platformOk =
      !platform ||
      p.platform_results.some(
        (pr) => pr.slug === platform && pr.present,
      );
    return topicOk && platformOk;
  });

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar subjectId={subjectId} activeSection="prompts" />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          subjectName={data.subject_name}
          subjectInitials={subjectInitials}
          metaLine={headerMeta}
          subjects={subjects.map((s) => ({ id: s.id, name: s.name }))}
          currentSubjectId={subjectId}
          refreshSlot={
            data.meta.latest_refresh_id ? (
              <RefreshButton subjectId={subjectId} />
            ) : null
          }
        />

        {/* xl:pr-44 dropped — the right-rail SectionNav (jump nav
            + filters card) was retired, so the main column gets the
            full content width back. */}
        <main className="flex-1 px-4 md:px-12 py-6 space-y-12 max-w-[1400px] w-full mx-auto">
          <Link
            href={`/subjects/${subjectId}`}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground hover:text-foreground transition-colors -mb-6"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back to {data.subject_name} Overview
          </Link>

          <section id="prompts-table" className="scroll-mt-20">
            <PromptsTable
              rows={filteredRows}
              subjectId={subjectId}
              subjectName={data.subject_name}
              platformSlugFilter={platform}
            />
          </section>
        </main>
      </div>
    </div>
  );
}
