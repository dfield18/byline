/**
 * Visibility spoke (hub-and-spokes IA).
 *
 * Answers the four questions a non-technical comms exec asks about
 * presence in AI answers, in order:
 *   1. How visible am I right now, and where?  (Hero brief + KPI strip)
 *   2. Where am I weakest?                       (Topic Recall)
 *   3. Who's getting the mentions instead?       (Competitive Snapshot)
 *
 * Chrome mirrors the recommendations spoke (Sidebar + Header + main),
 * and section patterns mirror the Overview tab (Card + SectionTitle,
 * primary-tinted briefing triad, narrative-mix-style mini bars).
 *
 * Visibility Trends (a weekly line-chart strip) is the natural fourth
 * section here; it currently lives on the Overview page as a private
 * TrajectoryStrip component. Future refactor: extract TrajectoryStrip
 * + TopicRecallChart into shared chart components and reuse them
 * here. For now Topic Recall is inlined and Visibility Trends is
 * pending that extraction.
 */
import Link from "next/link";
import { ArrowLeft, Info, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { notFound } from "next/navigation";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { Card, SectionTitle, Pill } from "@/components/dashboard/ui";
import { CompetitorBarsFromData } from "@/components/dashboard/Charts";
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

// Lightweight tooltip-on-hover for KPI tile titles. Mirrors the
// KpiTooltipIcon pattern used on the Overview page — duplicated
// here for now; future refactor should extract to shared
// components/dashboard/ui.tsx so both pages import the same
// component.
function KpiTooltipIcon({
  text,
  align = "center",
}: {
  text: string;
  align?: "left" | "center" | "right";
}) {
  const pos =
    align === "right"
      ? "right-0"
      : align === "left"
        ? "left-0"
        : "left-1/2 -translate-x-1/2";
  return (
    <span className="group relative inline-flex">
      <Info className="h-3 w-3 opacity-50 hover:opacity-100 transition-opacity cursor-help" />
      <span
        className={`pointer-events-none absolute ${pos} bottom-full mb-2 w-56 rounded-md border border-border bg-popover px-3 py-2 text-[11px] leading-snug text-popover-foreground opacity-0 group-hover:opacity-100 transition-opacity z-30 shadow-lg`}
      >
        {text}
      </span>
    </span>
  );
}

function deriveInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function formatPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${Math.round(v * 100)}%`;
}

function formatRank(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(1);
}

function formatPtsDelta(deltaShare: number | null | undefined): string | null {
  if (deltaShare === null || deltaShare === undefined) return null;
  const pts = Math.abs(Math.round(deltaShare * 100));
  if (pts === 0) return "Flat vs prior snapshot.";
  const direction = deltaShare > 0 ? "Up" : "Down";
  return `${direction} ${pts} pts vs prior snapshot.`;
}

export default async function VisibilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const subjectId = Number.parseInt(idStr, 10);
  if (Number.isNaN(subjectId)) notFound();

  // Parallel-fetch (same pattern as the Overview tab + Recommendations
  // spoke). listSubjects is non-essential — fails soft to [] so the
  // header dropdown still works without breaking the page.
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
  // Fetched for chrome-data parity; not read directly on this spoke.
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

  // ── Derived Visibility data ──────────────────────────────────────
  // Focal subject's row in the competitive set carries avg_rank +
  // first_mention_rate — the two visibility-specific metrics that
  // aren't in the regular kpis object.
  const focal = data.competitive.find((c) => c.is_subject);

  // Highest-mention-rate platform — names the "visibility leader."
  const platformsWithRecall = data.platform_recall.filter(
    (p) => p.value !== null,
  );
  const topPlatform =
    platformsWithRecall.length > 0
      ? platformsWithRecall.reduce((best, p) =>
          (p.value ?? 0) > (best.value ?? 0) ? p : best,
        )
      : null;

  // Lowest-recall topic — the "visibility gap." Filter out null
  // ai_recall first so unscored topics don't get treated as 0%.
  const topicsWithRecall = data.topic_coverage.filter(
    (t) => t.ai_recall !== null && Number.isFinite(t.ai_recall),
  );
  const weakestTopic =
    topicsWithRecall.length > 0
      ? topicsWithRecall.reduce((min, t) =>
          (t.ai_recall ?? 1) < (min.ai_recall ?? 1) ? t : min,
        )
      : null;

  // Mention rate KPI is the headline visibility number.
  const mentionRate = data.kpis.ai_recall.value;
  const mentionRateDelta = data.kpis.ai_recall.delta;

  // KPI strip values (mention rate, avg position, first-mention rate,
  // delta vs prior). Tooltips explain each metric in plain English so
  // a non-technical reader can hover for context without leaving the
  // page.
  type KPI = {
    label: string;
    value: string;
    valueColor: string;
    delta: string | null;
    trend: "up" | "down" | "flat";
    subtitle?: string;
    tooltip: string;
  };
  const kpis: KPI[] = [
    {
      label: "Mention rate",
      value: formatPct(mentionRate),
      valueColor: "text-success",
      delta: formatPtsDelta(mentionRateDelta),
      trend:
        mentionRateDelta === null
          ? "flat"
          : mentionRateDelta > 0
            ? "up"
            : mentionRateDelta < 0
              ? "down"
              : "flat",
      tooltip:
        "Share of AI answers (across the four monitored platforms) that mention this subject when asked about its tracked topic areas. Higher means AI consistently surfaces the subject when discussing its topics.",
    },
    {
      label: "Average position",
      value: formatRank(focal?.avg_rank ?? null),
      valueColor: "text-foreground",
      delta: null,
      trend: "flat",
      subtitle: "When mentioned, what rank",
      tooltip:
        "When this subject is mentioned in an AI answer, what rank it occupies on average (1 = first entity named, 2 = second, etc.). Lower numbers mean AI tends to name this subject earlier — a sign of prominence.",
    },
    {
      label: "First-mention rate",
      value: formatPct(focal?.first_mention_rate ?? null),
      valueColor: "text-foreground",
      delta: null,
      trend: "flat",
      subtitle: "Share of answers naming you first",
      tooltip:
        "Share of AI answers (about this subject's topic areas) where this subject is the very first entity named. A top-of-mind signal — high values mean AI leads with this subject when discussing the topic.",
    },
    {
      label: "Weakest topic",
      value: formatPct(weakestTopic?.ai_recall ?? null),
      valueColor: "text-warning",
      delta: null,
      trend: "flat",
      subtitle: weakestTopic?.label ?? "No tracked topics",
      tooltip:
        "The tracked topic where this subject's mention rate is lowest — the largest visibility gap in this snapshot. Subtitle names the topic. Same data drives the Topic Recall section below.",
    },
  ];

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar subjectId={subjectId} activeSection="visibility" />

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

        <main className="flex-1 px-4 md:px-12 py-6 space-y-16 max-w-[1500px] w-full mx-auto">
          {/* Back-to-Overview affordance for users who navigated here
              via the sidebar. */}
          <Link
            href={`/subjects/${subjectId}`}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors -mb-8"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back to {data.subject_name} Overview
          </Link>

          {/* ── HERO ─────────────────────────────────────────────── */}
          <section>
            <Card className="relative overflow-hidden p-6 md:p-8 border-border/60">
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(135deg, color-mix(in oklab, var(--primary) 5%, transparent) 0%, color-mix(in oklab, var(--primary) 1.5%, transparent) 35%, transparent 70%)",
                }}
              />

              <div className="relative">
                {/* Header row: eyebrow + subject name + meta */}
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-border/80 pb-5">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/55 mb-2">
                      AI Visibility Brief
                    </div>
                    <h1 className="font-display text-[28px] md:text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground">
                      {data.subject_name}
                    </h1>
                  </div>
                  <div className="text-[11.5px] font-medium text-foreground/75">
                    {data.meta.n_responses} responses ·{" "}
                    {data.meta.n_platforms} platforms
                  </div>
                </div>

                {/* 2-col body: briefing triad + per-platform mini-strip */}
                <div className="relative mt-6 grid lg:grid-cols-5 gap-8 lg:gap-12">
                  {/* Left: visibility-specific briefing triad. Same
                      primary-tinted left-border chrome as Overview's
                      Bottom Line / Strongest Asset / Recommended Move
                      blocks, but each beat reframed around presence/
                      position rather than narrative. */}
                  <div className="lg:col-span-3 space-y-5">
                    <div className="border-l-2 border-l-primary pl-3.5">
                      <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-primary">
                        Mention strength
                      </div>
                      <div className="mt-0.5 text-[15px] font-semibold leading-snug text-foreground">
                        {data.subject_name} appears in{" "}
                        {formatPct(mentionRate)} of AI answers across the
                        tracked topic areas.
                      </div>
                      {formatPtsDelta(mentionRateDelta) && (
                        <p className="mt-1.5 text-[13.5px] leading-relaxed text-foreground/75">
                          {formatPtsDelta(mentionRateDelta)}
                        </p>
                      )}
                    </div>

                    {topPlatform && (
                      <div className="border-l-2 border-l-primary pl-3.5">
                        <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-primary">
                          Visibility leader
                        </div>
                        <div className="mt-0.5 text-[13.5px] font-semibold leading-snug text-foreground">
                          Strongest platform: {topPlatform.name}.
                        </div>
                        <p className="mt-1 text-[13px] leading-relaxed text-foreground/70">
                          {formatPct(topPlatform.value)}
                          {" "}mention rate there &mdash; higher than the
                          cross-platform average.
                        </p>
                      </div>
                    )}

                    {weakestTopic && (
                      <div className="border-l-2 border-l-primary pl-3.5">
                        <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-primary">
                          Visibility gap
                        </div>
                        <div className="mt-0.5 text-[14px] font-semibold leading-snug text-foreground">
                          Underweighted on {weakestTopic.label}.
                        </div>
                        <p className="mt-1 text-[13px] leading-relaxed text-foreground/70">
                          Only {formatPct(weakestTopic.ai_recall)} mention
                          rate in this topic area &mdash; the lowest among
                          tracked topics.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Right: per-platform mention-rate bars. Same chrome
                      as Overview's DominantNarrativePanel (Narrative
                      Mix) — same eyebrow weight, same opacity ramp by
                      position, same thin bar treatment. Aligned with
                      lg:pt-20 to start at the same y as the briefing
                      triad's first eyebrow. */}
                  <div className="lg:col-span-2 lg:border-l lg:border-border/50 lg:pl-12 lg:pt-20">
                    <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/50">
                      Per-platform mention rate
                    </div>
                    <ul className="mt-6 space-y-5">
                      {[...data.platform_recall]
                        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
                        .map((p, i) => {
                          const pct = (p.value ?? 0) * 100;
                          const opacity =
                            i === 0
                              ? 0.6
                              : i === 1
                                ? 0.45
                                : i === 2
                                  ? 0.3
                                  : 0.2;
                          return (
                            <li key={p.name}>
                              <div className="mb-1 flex items-center justify-between text-[12.5px]">
                                <span className="text-foreground/65">
                                  {p.name}
                                </span>
                                <span className="tabular-nums text-[11.5px] text-foreground/55">
                                  {formatPct(p.value)}
                                </span>
                              </div>
                              <div className="relative h-1 w-full overflow-hidden rounded-full bg-muted/80">
                                <div
                                  className="absolute inset-y-0 left-0 rounded-full"
                                  style={{
                                    width: `${pct}%`,
                                    background: "var(--primary)",
                                    opacity,
                                  }}
                                />
                              </div>
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                </div>

                {/* KPI strip — same chrome as Overview's HeroKpis
                    (rounded card, min-h for uniform height, value/
                    delta/subtitle stack at bottom with subtitle inline
                    next to value). */}
                <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4">
                  {kpis.map((k) => {
                    const TrendIcon =
                      k.trend === "up"
                        ? TrendingUp
                        : k.trend === "down"
                          ? TrendingDown
                          : Minus;
                    const deltaColor =
                      k.delta === null
                        ? "text-muted-foreground"
                        : k.trend === "up"
                          ? "text-success"
                          : k.trend === "down"
                            ? "text-warning"
                            : "text-muted-foreground";
                    const deltaText = k.delta ?? "no prior data";
                    return (
                      <div
                        key={k.label}
                        className="rounded-lg border border-border/80 bg-background/60 p-5 min-h-[140px] flex flex-col"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="truncate text-sm font-medium text-foreground">
                            {k.label}
                          </span>
                          <KpiTooltipIcon text={k.tooltip} align="right" />
                        </div>
                        <div className="mt-auto pt-4 space-y-1.5">
                          <div className="flex min-h-[40px] items-center gap-2.5">
                            <div
                              className={`shrink-0 text-2xl font-semibold leading-none tracking-tight ${k.valueColor}`}
                            >
                              {k.value}
                            </div>
                            {k.subtitle && (
                              <div
                                className="line-clamp-2 text-[13px] leading-snug text-muted-foreground"
                                title={k.subtitle}
                              >
                                {k.subtitle}
                              </div>
                            )}
                          </div>
                          <div
                            className={`flex items-center gap-1 text-xs leading-none ${deltaColor}`}
                          >
                            <TrendIcon
                              className="h-3 w-3 shrink-0"
                              aria-hidden
                            />
                            <span>{deltaText}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          </section>

          {/* ── TOPIC RECALL ─────────────────────────────────────── */}
          {data.topic_coverage.length > 0 && (
            <Card className="p-6">
              <SectionTitle
                eyebrow="Topic Recall"
                title="Where AI sees you (and where it doesn't)"
                description={`Per-topic mention rate for ${data.subject_name}. Sorted strongest to weakest — the lowest bar is your largest visibility gap.`}
              />
              <div className="mt-2 space-y-3">
                {[...data.topic_coverage]
                  .filter(
                    (t) =>
                      t.ai_recall !== null && Number.isFinite(t.ai_recall),
                  )
                  .sort((a, b) => (b.ai_recall ?? 0) - (a.ai_recall ?? 0))
                  .map((t) => {
                    const pct = (t.ai_recall ?? 0) * 100;
                    const isWeakest =
                      weakestTopic !== null && t.label === weakestTopic.label;
                    return (
                      <div key={t.label} className="grid grid-cols-[1fr_auto] items-center gap-x-4">
                        <div>
                          <div className="mb-1 text-[13.5px] text-foreground/85">
                            {t.label}
                          </div>
                          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted/80">
                            <div
                              className="absolute inset-y-0 left-0 rounded-full"
                              style={{
                                width: `${pct}%`,
                                background: isWeakest
                                  ? "var(--warning)"
                                  : "var(--primary)",
                                opacity: isWeakest ? 0.85 : 0.7,
                              }}
                            />
                          </div>
                        </div>
                        <div className="text-[13px] font-semibold tabular-nums text-foreground/85">
                          {Math.round(pct)}%
                        </div>
                      </div>
                    );
                  })}
              </div>
            </Card>
          )}

          {/* ── COMPETITIVE SNAPSHOT ─────────────────────────────── */}
          {data.competitive.length > 0 && (
            <Card className="p-6">
              <SectionTitle
                eyebrow="Competitive Snapshot"
                title={`Who's getting the mentions alongside ${data.subject_name}`}
                description={`Share of voice and visibility against the top entities AI surfaces when asked about ${data.subject_name}'s topic areas. Pulled from unnamed-layer responses in this snapshot.`}
                right={
                  <Pill tone="primary">
                    {data.competitive.length} entities tracked
                  </Pill>
                }
              />
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-foreground/65 mb-3">
                    Share of Voice (% of answers)
                  </div>
                  <CompetitorBarsFromData
                    data={data.competitive.map((c) => ({
                      name: c.name,
                      sov: Math.round(c.sov * 100),
                      is_subject: c.is_subject,
                    }))}
                  />
                </div>
                <div>
                  <table className="w-full text-sm table-fixed">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider text-foreground/65 border-b border-border">
                        <th className="px-2 py-2 font-medium">Entity</th>
                        <th className="px-2 py-2 font-medium text-right w-16">
                          Share
                        </th>
                        <th className="px-2 py-2 font-medium text-right w-20">
                          Avg Pos
                        </th>
                        <th className="px-2 py-2 font-medium text-right w-24">
                          First Mention
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.competitive.map((c) => (
                        <tr
                          key={c.name}
                          className={`border-b border-border/60 ${
                            c.is_subject
                              ? "bg-primary/5"
                              : "hover:bg-accent/40"
                          } transition-colors`}
                        >
                          <td className="px-2 py-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`truncate ${c.is_subject ? "font-semibold" : "font-medium"}`}
                              >
                                {c.name}
                              </span>
                              {c.is_subject && (
                                <Pill tone="primary">You</Pill>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-right font-mono">
                            {Math.round(c.sov * 100)}%
                          </td>
                          <td className="px-2 py-2.5 text-right font-mono">
                            {c.avg_rank !== null
                              ? c.avg_rank.toFixed(1)
                              : "—"}
                          </td>
                          <td className="px-2 py-2.5 text-right font-mono">
                            {Math.round(c.first_mention_rate * 100)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
