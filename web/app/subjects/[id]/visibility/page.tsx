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
import { Fragment } from "react";
import Link from "next/link";
import { ArrowLeft, Info, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { notFound } from "next/navigation";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { Card, SectionTitle, Pill } from "@/components/dashboard/ui";
import { CompetitorBarsFromData } from "@/components/dashboard/Charts";
import { TrendOverTime } from "./TrendOverTime";
import { TopicTrends } from "./TopicTrends";
import { FilterBar } from "./FilterBar";
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

// Capitalize the first character without lowercasing the rest. Used
// to normalize topic labels that arrive from the backend with
// inconsistent capitalization ("Current events" vs "post-presidency
// political influence") so the dashboard renders a uniform first
// letter regardless of source casing.
function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Signed-percent renderer for Avg Sentiment values that live in the
// -1..+1 range. "+30%" / "−12%" / "0%" so a reader can see polarity
// at a glance without having to interpret an unsigned decimal.
function formatSentimentSigned(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const pct = Math.round(v * 100);
  if (pct === 0) return "0%";
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

// Pick a foreground color token for an Avg Sentiment value. Mirrors
// the thresholds used by Hero KPI tiles so the same value reads the
// same color across the Visibility tab.
function sentimentColorClass(v: number | null | undefined): string {
  if (v === null || v === undefined) return "text-foreground/60";
  if (v > 0.1) return "text-success";
  if (v < -0.1) return "text-warning";
  return "text-foreground/75";
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // ?platform=<slug>&topic=<label>&compare=<competitor name> drive
  // the FilterBar's URL-state model — the page reads them here and
  // applies the filters during render. Keeps the hub bookmarkable
  // and the rendering 100% server-side.
  searchParams: Promise<{
    platform?: string;
    topic?: string;
    compare?: string;
  }>;
}) {
  const { id: idStr } = await params;
  const sp = await searchParams;
  const filterPlatform = sp.platform || "";
  const filterTopic = sp.topic || "";
  const compareName = sp.compare || "";
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

  // Derive the Build-on / Fix combos from the platform × topic
  // matrix. Build-on = highest mention rate cell (ties go to the
  // cell backed by more responses); Fix = lowest, same tiebreak so
  // we prefer high-volume zeros over single-shot misses. Both fall
  // out of the same backend rollup as the hero's right-column
  // heatmap so the verbal claim and the visual evidence agree.
  const matrix = data.platform_topic_matrix;
  const measuredCells = matrix.cells.filter(
    (c) => c.mention_rate !== null && Number.isFinite(c.mention_rate),
  );
  const buildOnCell = measuredCells.length
    ? [...measuredCells].sort(
        (a, b) =>
          (b.mention_rate ?? 0) - (a.mention_rate ?? 0) ||
          b.n_responses - a.n_responses,
      )[0]
    : null;
  const fixCellRaw = measuredCells.length
    ? [...measuredCells].sort(
        (a, b) =>
          (a.mention_rate ?? 0) - (b.mention_rate ?? 0) ||
          b.n_responses - a.n_responses,
      )[0]
    : null;
  // Suppress Fix when it's the same cell as Build-on (single-cell
  // matrix) — surfacing the same combo twice tells the reader
  // nothing about a gap.
  const fixCell =
    fixCellRaw &&
    buildOnCell &&
    fixCellRaw.platform_slug === buildOnCell.platform_slug &&
    fixCellRaw.topic_label === buildOnCell.topic_label
      ? null
      : fixCellRaw;
  const platformNameFor = (slug: string): string =>
    matrix.platforms.find((p) => p.slug === slug)?.name ?? slug;
  const nextMoveCopy = data.recommended_actions?.primary?.action ?? null;

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
      subtitle: weakestTopic ? capitalizeFirst(weakestTopic.label) : "No tracked topics",
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
          {/* Sticky filter bar — Platform / Topic / Compare-to.
              Filters are URL-driven (?platform=…&topic=…&compare=…)
              so the page stays server-rendered and the hub remains
              bookmarkable. Sits above the back-link so it's the
              first thing in the scrollable area. */}
          <FilterBar
            platforms={data.platform_topic_matrix.platforms.map((p) => ({
              slug: p.slug,
              name: p.name,
            }))}
            topics={data.platform_topic_matrix.topics.map((t) => ({
              label: t.label,
            }))}
            competitors={data.competitor_trajectories.map((c) => ({
              name: c.name,
            }))}
          />

          {/* Back-to-Overview affordance for users who navigated here
              via the sidebar. */}
          <Link
            href={`/subjects/${subjectId}`}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors -mb-8"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back to {data.subject_name} Overview
          </Link>

          {/* ── SNAPSHOT DIFF BANNER ─────────────────────────────── */}
          {/* "What changed since your last snapshot." Pinned above
              the hero so a returning user sees the new information
              before re-reading the snapshot state. Only renders when
              the backend ships a non-null snapshot_diff (i.e. there
              is a prior refresh AND at least one ≥5pp swing or a
              non-null overall delta). Three slots: overall recall,
              top topic mover, top competitor mover. */}
          {data.snapshot_diff &&
            (data.snapshot_diff.overall_recall_delta !== null ||
              data.snapshot_diff.topic_changes.length > 0 ||
              data.snapshot_diff.competitor_changes.length > 0) && (
              <Card className="border-border/60 bg-card/40 p-5 md:px-6 md:py-4">
                {(() => {
                  const sd = data.snapshot_diff;
                  const priorDate = sd.prior_refresh_at
                    ? (() => {
                        const d = new Date(sd.prior_refresh_at);
                        return Number.isNaN(d.getTime())
                          ? null
                          : d.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            });
                      })()
                    : null;
                  const fmtSignedPct = (v: number): string => {
                    const pts = Math.round(v * 100);
                    if (pts === 0) return "0 pp";
                    return `${pts > 0 ? "+" : ""}${pts} pp`;
                  };
                  const deltaTone = (v: number): string =>
                    v > 0
                      ? "text-success"
                      : v < 0
                        ? "text-warning"
                        : "text-muted-foreground";
                  return (
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-8">
                      <div className="md:max-w-[260px]">
                        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/50">
                          What changed
                        </div>
                        <div className="mt-1 text-[14px] font-semibold text-foreground">
                          Since{" "}
                          {priorDate ? priorDate : "your prior snapshot"}
                        </div>
                        {sd.overall_recall_delta !== null && (
                          <div
                            className={`mt-1 text-[13px] font-medium ${deltaTone(sd.overall_recall_delta)}`}
                          >
                            Overall mention rate{" "}
                            {fmtSignedPct(sd.overall_recall_delta)}
                          </div>
                        )}
                      </div>

                      <div className="grid flex-1 gap-3 sm:grid-cols-2">
                        {sd.topic_changes.length > 0 && (
                          <div>
                            <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-foreground/55">
                              Topic movers
                            </div>
                            <ul className="mt-1.5 space-y-1.5">
                              {sd.topic_changes.map((t) => (
                                <li
                                  key={t.label}
                                  className="flex items-baseline justify-between gap-3 text-[12.5px]"
                                >
                                  <span className="truncate text-foreground/80">
                                    {capitalizeFirst(t.label)}
                                  </span>
                                  <span
                                    className={`shrink-0 font-semibold tabular-nums ${deltaTone(t.delta)}`}
                                  >
                                    {fmtSignedPct(t.delta)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {sd.competitor_changes.length > 0 && (
                          <div>
                            <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-foreground/55">
                              Competitor movers (SoV)
                            </div>
                            <ul className="mt-1.5 space-y-1.5">
                              {sd.competitor_changes.map((c) => (
                                <li
                                  key={c.name}
                                  className="flex items-baseline justify-between gap-3 text-[12.5px]"
                                >
                                  <span className="truncate text-foreground/80">
                                    {c.name}
                                  </span>
                                  <span
                                    className={`shrink-0 font-semibold tabular-nums ${deltaTone(c.delta)}`}
                                  >
                                    {fmtSignedPct(c.delta)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </Card>
            )}

          {/* ── COMPARE CARD ─────────────────────────────────────── */}
          {/* Renders when ?compare=<name> is set in the URL.
              Shows the chosen competitor's four headline metrics
              side-by-side with the subject's, plus a recent trend
              direction. Data joins:
                - current snapshot metrics from `competitive[]`
                - trajectory slope from `competitor_trajectories[]`
              Competitor selection is limited to the top-3 by
              appearance (the set we have time-series data for). */}
          {compareName &&
            (() => {
              const cmp = data.competitive.find(
                (c) => c.name === compareName,
              );
              const subj = data.competitive.find((c) => c.is_subject);
              const cmpTraj = data.competitor_trajectories.find(
                (t) => t.name === compareName,
              );
              if (!cmp || !subj) return null;
              // Last-vs-first delta over the trajectory window as a
              // simple trend signal. Skipped if the competitor has
              // <2 measured weeks.
              const cmpSeries = (cmpTraj?.mention_rate ?? []).filter(
                (v): v is number => v !== null && Number.isFinite(v),
              );
              const cmpDelta =
                cmpSeries.length >= 2
                  ? cmpSeries[cmpSeries.length - 1] - cmpSeries[0]
                  : null;
              const subjSeries = data.trajectory.ai_recall.filter(
                (v): v is number => v !== null && Number.isFinite(v),
              );
              const subjDelta =
                subjSeries.length >= 2
                  ? subjSeries[subjSeries.length - 1] - subjSeries[0]
                  : null;
              type Row = {
                label: string;
                subject: number | null;
                competitor: number | null;
                format: (v: number | null) => string;
              };
              const rows: Row[] = [
                {
                  label: "Mention rate / SoV",
                  subject: subj.sov,
                  competitor: cmp.sov,
                  format: (v) =>
                    v === null ? "—" : `${Math.round(v * 100)}%`,
                },
                {
                  label: "Avg position",
                  subject: subj.avg_rank,
                  competitor: cmp.avg_rank,
                  format: (v) => (v === null ? "—" : v.toFixed(1)),
                },
                {
                  label: "First-mention rate",
                  subject: subj.first_mention_rate,
                  competitor: cmp.first_mention_rate,
                  format: (v) =>
                    v === null ? "—" : `${Math.round(v * 100)}%`,
                },
                {
                  label: "Trend (oldest → newest)",
                  subject: subjDelta,
                  competitor: cmpDelta,
                  format: (v) =>
                    v === null
                      ? "—"
                      : `${v > 0 ? "+" : ""}${Math.round(v * 100)} pp`,
                },
              ];
              return (
                <section>
                  <SectionTitle
                    eyebrow="Compare"
                    title={`${data.subject_name} vs ${compareName}`}
                    description="Side-by-side on the headline visibility metrics for this snapshot. Trend column shows movement across the tracked window."
                    className="mb-4"
                    right={
                      <Link
                        href="?"
                        className="rounded-md border border-border/70 px-2.5 py-1 text-[11.5px] font-medium text-foreground/70 transition-colors hover:bg-card"
                      >
                        Exit compare
                      </Link>
                    }
                  />
                  <Card className="p-5 md:p-6">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-border/60 text-[10px] uppercase tracking-[0.06em] text-foreground/65">
                            <th className="py-2.5 pr-3 font-semibold">
                              Metric
                            </th>
                            <th className="py-2.5 px-3 text-right font-semibold">
                              {data.subject_name}
                            </th>
                            <th className="py-2.5 px-3 text-right font-semibold">
                              {compareName}
                            </th>
                            <th className="py-2.5 pl-3 text-right font-semibold">
                              Gap
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => {
                            const gap =
                              r.subject !== null && r.competitor !== null
                                ? r.subject - r.competitor
                                : null;
                            // For avg position, lower is better — so
                            // a positive (subj - cmp) gap is a LOSS,
                            // not a win. Invert tone for that row.
                            const lowerBetter =
                              r.label === "Avg position";
                            const subjAhead =
                              gap === null
                                ? null
                                : lowerBetter
                                  ? gap < 0
                                  : gap > 0;
                            const gapTone =
                              subjAhead === null
                                ? "text-muted-foreground"
                                : subjAhead
                                  ? "text-success"
                                  : "text-warning";
                            const gapFormat =
                              gap === null
                                ? "—"
                                : r.label === "Avg position"
                                  ? (gap > 0 ? "+" : "") + gap.toFixed(1)
                                  : `${gap > 0 ? "+" : ""}${Math.round(
                                      gap * 100,
                                    )} pp`;
                            return (
                              <tr
                                key={r.label}
                                className="border-b border-border/30 last:border-0 text-[13.5px]"
                              >
                                <td className="py-3 pr-3 font-medium text-foreground/80">
                                  {r.label}
                                </td>
                                <td className="py-3 px-3 text-right tabular-nums font-semibold text-foreground">
                                  {r.format(r.subject)}
                                </td>
                                <td className="py-3 px-3 text-right tabular-nums text-foreground/85">
                                  {r.format(r.competitor)}
                                </td>
                                <td
                                  className={`py-3 pl-3 text-right tabular-nums font-medium ${gapTone}`}
                                >
                                  {gapFormat}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </section>
              );
            })()}

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
                  {/* Left: operational triad — Build on / Fix / Next
                      move. Replaces the prior Mention-strength /
                      Visibility-leader / Visibility-gap snapshot
                      framing so the Visibility hub reads as a
                      diagnosis rather than restating Overview. Each
                      block sourced from the platform × topic matrix
                      (Build-on = argmax cell, Fix = argmin cell with
                      ties broken by response volume) plus the LLM-
                      generated recommended primary action for the
                      Next-move call. */}
                  <div className="lg:col-span-3 space-y-5">
                    {buildOnCell ? (
                      <div className="border-l-2 border-l-success/70 pl-3.5">
                        <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-success">
                          Build on
                        </div>
                        <div className="mt-0.5 text-[15px] font-semibold leading-snug text-foreground">
                          {platformNameFor(buildOnCell.platform_slug)} ×{" "}
                          {capitalizeFirst(buildOnCell.topic_label)}.
                        </div>
                        <p className="mt-1.5 text-[13.5px] leading-relaxed text-foreground/75">
                          {formatPct(buildOnCell.mention_rate)} mention rate
                          across {buildOnCell.n_responses} answer
                          {buildOnCell.n_responses === 1 ? "" : "s"} —
                          the strongest signal in this snapshot.
                        </p>
                      </div>
                    ) : (
                      <div className="border-l-2 border-l-muted pl-3.5 text-[13px] text-foreground/55">
                        Not enough measured intersections to identify a
                        build-on combo yet.
                      </div>
                    )}

                    {fixCell && (
                      <div className="border-l-2 border-l-warning/70 pl-3.5">
                        <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-warning">
                          Fix
                        </div>
                        <div className="mt-0.5 text-[14px] font-semibold leading-snug text-foreground">
                          {platformNameFor(fixCell.platform_slug)} ×{" "}
                          {capitalizeFirst(fixCell.topic_label)}.
                        </div>
                        <p className="mt-1 text-[13px] leading-relaxed text-foreground/70">
                          {formatPct(fixCell.mention_rate)} across{" "}
                          {fixCell.n_responses} answer
                          {fixCell.n_responses === 1 ? "" : "s"} — the
                          worst combo in the matrix on the right.
                        </p>
                      </div>
                    )}

                    {nextMoveCopy && (
                      <div className="border-l-2 border-l-primary pl-3.5">
                        <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-primary">
                          Next move
                        </div>
                        <div className="mt-0.5 text-[14px] font-semibold leading-snug text-foreground">
                          {nextMoveCopy}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right: Platform × Topic mini-heatmap. Visual
                      evidence behind the Build-on / Fix triad on the
                      left — same matrix the backend rollup ships, the
                      argmax/argmin cells named in the triad are the
                      dark/pale corners here. Cells are shaded by
                      mention rate (linear opacity ramp from 0.15 to
                      0.85); the rate prints inside each cell so a
                      reader doesn't have to map colors back to
                      values. Topic labels truncate with a title
                      tooltip for the full string. Empty intersections
                      (a platform didn't answer that topic in this
                      snapshot) render as a flat muted tray. */}
                  <div className="lg:col-span-2 lg:border-l lg:border-border/50 lg:pl-12">
                    <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/50">
                      Platform × Topic
                    </div>
                    {matrix.platforms.length > 0 &&
                    matrix.topics.length > 0 ? (
                      <div className="mt-5 overflow-x-auto">
                        <div
                          className="grid gap-1.5 min-w-fit"
                          style={{
                            gridTemplateColumns: `minmax(60px, auto) repeat(${matrix.topics.length}, minmax(48px, 1fr))`,
                          }}
                        >
                          {/* Header row: empty corner + topic labels */}
                          <div />
                          {matrix.topics.map((t) => (
                            <div
                              key={t.label}
                              className="line-clamp-2 px-0.5 text-center text-[10px] leading-tight text-foreground/60"
                              title={capitalizeFirst(t.label)}
                            >
                              {capitalizeFirst(t.label)}
                            </div>
                          ))}
                          {/* Body: per-platform rows */}
                          {matrix.platforms.map((p) => (
                            <Fragment key={p.slug}>
                              <div className="self-center pr-2 text-[11.5px] font-medium text-foreground/75">
                                {p.name}
                              </div>
                              {matrix.topics.map((t) => {
                                const cell = matrix.cells.find(
                                  (c) =>
                                    c.platform_slug === p.slug &&
                                    c.topic_label === t.label,
                                );
                                const rate = cell?.mention_rate ?? null;
                                const isExtreme =
                                  cell &&
                                  ((buildOnCell &&
                                    cell.platform_slug ===
                                      buildOnCell.platform_slug &&
                                    cell.topic_label ===
                                      buildOnCell.topic_label) ||
                                    (fixCell &&
                                      cell.platform_slug ===
                                        fixCell.platform_slug &&
                                      cell.topic_label ===
                                        fixCell.topic_label));
                                const opacity =
                                  rate === null ? 1 : 0.15 + rate * 0.7;
                                const titleLabel = `${p.name} × ${capitalizeFirst(t.label)}: ${
                                  rate === null || !cell
                                    ? "no data"
                                    : `${Math.round(rate * 100)}% (${cell.n_mentioned}/${cell.n_responses})`
                                }`;
                                return (
                                  <div
                                    key={t.label}
                                    className={`relative flex h-9 items-center justify-center rounded-sm ${
                                      isExtreme
                                        ? "ring-1 ring-foreground/25"
                                        : ""
                                    }`}
                                    style={{
                                      background:
                                        rate === null
                                          ? "var(--muted)"
                                          : "var(--primary)",
                                      opacity:
                                        rate === null
                                          ? 0.35
                                          : opacity,
                                    }}
                                    title={titleLabel}
                                  >
                                    <span
                                      className={`text-[10.5px] font-semibold tabular-nums ${
                                        rate !== null && rate > 0.5
                                          ? "text-background"
                                          : "text-foreground"
                                      }`}
                                    >
                                      {rate === null
                                        ? "—"
                                        : `${Math.round(rate * 100)}%`}
                                    </span>
                                  </div>
                                );
                              })}
                            </Fragment>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-6 text-[12.5px] text-muted-foreground">
                        No platform × topic intersections measured in this
                        snapshot yet.
                      </div>
                    )}
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

          {/* ── TREND OVER TIME ──────────────────────────────────── */}
          {/* Subject's weekly trajectory + tabbed control for SoV and
              Top Result Rate (those tabs are placeholders today —
              backend only ships per-week mention-rate history; SoV
              and Top Result are current-snapshot-only). Sits between
              the hero (current state) and Topic Recall (where am I
              weakest) so the reader gets a "how is this trending?"
              answer before drilling into specific gaps. */}
          <TrendOverTime
            subjectName={data.subject_name}
            trajectory={data.trajectory}
            competitorTrajectories={data.competitor_trajectories}
            currentMentionRate={data.kpis.ai_recall.value}
            mentionRateDelta={data.kpis.ai_recall.delta}
            mentionRateTrend={data.kpis.ai_recall.trend}
          />

          {/* ── PER-PLATFORM METRIC MATRIX ──────────────────────── */}
          {/* The four headline visibility metrics broken out per
              platform. Surfaces dispersion that the per-platform
              bars in the hero (mention rate only) can't show — e.g.
              a platform that mentions you a lot but ranks you low,
              or a platform where the tone diverges from the
              average. Real platforms (currently ChatGPT, Gemini)
              render first; Claude/Perplexity show as N/A rows so
              the reader sees the full intended coverage and which
              platforms aren't yet wired. */}
          <section>
            <SectionTitle
              eyebrow="By Platform"
              title="How each AI platform sees this subject"
              description="The four headline metrics broken out per platform. Helps spot a platform that's dragging the average."
              className="mb-4"
            />
            <Card className="p-5 md:p-6">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border/60 text-[10px] uppercase tracking-[0.06em] text-foreground/65">
                      <th className="py-2.5 pr-3 font-semibold">Platform</th>
                      <th className="py-2.5 px-3 text-right font-semibold">
                        <span className="inline-flex items-center justify-end gap-1">
                          Mention Rate
                          <KpiTooltipIcon
                            text="Share of this platform's answers about the subject's topic areas that mention them by name. Higher means this platform reliably surfaces the subject when asked about their topics."
                            align="right"
                          />
                        </span>
                      </th>
                      <th className="py-2.5 px-3 text-right font-semibold">
                        <span className="inline-flex items-center justify-end gap-1">
                          Avg Position
                          <KpiTooltipIcon
                            text="Average rank of this subject in the list of entities the platform mentions. Computed only across answers where the subject IS mentioned. 1.0 means always listed first; higher numbers mean further down the list."
                            align="right"
                          />
                        </span>
                      </th>
                      <th className="py-2.5 px-3 text-right font-semibold">
                        <span className="inline-flex items-center justify-end gap-1">
                          First-Mention
                          <KpiTooltipIcon
                            text="Share of this platform's answers where the subject was listed first (rank #1). Pole-position visibility — being mentioned at all is one thing; being mentioned first is another."
                            align="right"
                          />
                        </span>
                      </th>
                      <th className="py-2.5 pl-3 text-right font-semibold">
                        <span className="inline-flex items-center justify-end gap-1">
                          Avg Sentiment
                          <KpiTooltipIcon
                            text="Mean tone of this platform's answers across all responses about the subject (named + unnamed layers). Range −100% (most negative) to +100% (most positive); 0% is neutral. Color matches the Hero KPI thresholds."
                            align="right"
                          />
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Render the full intended platform surface
                      // (ChatGPT/Claude/Gemini/Perplexity) — real
                      // rows from per_platform_kpis first, then
                      // N/A placeholders for platforms not yet
                      // wired in the backend. Match keyword list
                      // mirrors the hero's per-platform bars block.
                      type Row = {
                        name: string;
                        slug?: string;
                        n_responses?: number;
                        mention_rate: number | null;
                        avg_rank: number | null;
                        first_mention_rate: number | null;
                        avg_sentiment: number | null;
                        isPlaceholder: boolean;
                      };
                      const EXPECTED: { display: string; matches: string[] }[] = [
                        { display: "ChatGPT", matches: ["chatgpt", "openai", "gpt"] },
                        { display: "Claude", matches: ["claude", "anthropic"] },
                        { display: "Gemini", matches: ["gemini", "google"] },
                        { display: "Perplexity", matches: ["perplexity"] },
                      ];
                      const real: Row[] = [];
                      const placeholders: Row[] = [];
                      for (const spec of EXPECTED) {
                        const match = data.per_platform_kpis.find((p) =>
                          spec.matches.some((kw) =>
                            p.slug.toLowerCase().includes(kw) ||
                            p.name.toLowerCase().includes(kw),
                          ),
                        );
                        if (match) {
                          real.push({
                            name: spec.display,
                            slug: match.slug,
                            n_responses: match.n_responses,
                            mention_rate: match.mention_rate,
                            avg_rank: match.avg_rank,
                            first_mention_rate: match.first_mention_rate,
                            avg_sentiment: match.avg_sentiment,
                            isPlaceholder: false,
                          });
                        } else {
                          placeholders.push({
                            name: spec.display,
                            mention_rate: null,
                            avg_rank: null,
                            first_mention_rate: null,
                            avg_sentiment: null,
                            isPlaceholder: true,
                          });
                        }
                      }
                      real.sort(
                        (a, b) =>
                          (b.mention_rate ?? 0) - (a.mention_rate ?? 0),
                      );
                      const rows = [...real, ...placeholders];
                      return rows.map((row) => {
                        const muted = row.isPlaceholder
                          ? "text-foreground/35"
                          : "text-foreground/85";
                        const nameMuted = row.isPlaceholder
                          ? "text-foreground/40"
                          : "text-foreground";
                        return (
                          <tr
                            key={row.name}
                            className="border-b border-border/30 last:border-0 text-[13.5px]"
                          >
                            <td className={`py-3 pr-3 font-medium ${nameMuted}`}>
                              {row.name}
                            </td>
                            <td className={`py-3 px-3 text-right tabular-nums ${muted}`}>
                              {row.isPlaceholder ? "N/A" : formatPct(row.mention_rate)}
                            </td>
                            <td className={`py-3 px-3 text-right tabular-nums ${muted}`}>
                              {row.isPlaceholder ? "N/A" : formatRank(row.avg_rank)}
                            </td>
                            <td className={`py-3 px-3 text-right tabular-nums ${muted}`}>
                              {row.isPlaceholder
                                ? "N/A"
                                : formatPct(row.first_mention_rate)}
                            </td>
                            <td
                              className={`py-3 pl-3 text-right tabular-nums ${
                                row.isPlaceholder
                                  ? "text-foreground/35"
                                  : sentimentColorClass(row.avg_sentiment)
                              }`}
                            >
                              {row.isPlaceholder
                                ? "N/A"
                                : formatSentimentSigned(row.avg_sentiment)}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>

          {/* ── CROSS-PLATFORM DIVERGENCE ────────────────────────── */}
          {/* Are the platforms aligned, or are some platform-
              specific blind spots dragging the average? High
              alignment = systemic gaps (every platform misses the
              same topic); low alignment = the gap is one platform's
              problem. Diagnostic that pairs with the By-Platform
              matrix above. Only renders when there's at least one
              multi-platform prompt to score. */}
          {data.cross_platform_divergence.total_multi_platform > 0 && (
            <section>
              <SectionTitle
                eyebrow="Cross-Platform Alignment"
                title="Do the platforms agree, or are some missing what others catch?"
                description={`${data.cross_platform_divergence.agreed} of ${data.cross_platform_divergence.total_multi_platform} multi-platform prompts had every platform agree (all mention or all miss). The rest are platform-specific blind spots.`}
                className="mb-4"
              />
              <Card className="p-5 md:p-6">
                <div className="flex flex-wrap items-baseline gap-6">
                  <div>
                    <div className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
                      {data.cross_platform_divergence.alignment_score !==
                      null
                        ? `${Math.round(
                            data.cross_platform_divergence
                              .alignment_score * 100,
                          )}%`
                        : "—"}
                    </div>
                    <div className="mt-1.5 text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">
                      Alignment score
                    </div>
                  </div>
                  <div className="text-[13px] text-foreground/70">
                    {data.cross_platform_divergence.diverged === 0 ? (
                      <>
                        Every multi-platform prompt agreed — coverage
                        gaps here are <strong>systemic</strong>, not
                        platform-specific.
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-foreground">
                          {data.cross_platform_divergence.diverged}{" "}
                          prompt
                          {data.cross_platform_divergence.diverged === 1
                            ? ""
                            : "s"}
                        </span>{" "}
                        had platforms disagree — see below for the
                        biggest splits.
                      </>
                    )}
                  </div>
                </div>

                {data.cross_platform_divergence.divergent_prompts.length >
                  0 && (
                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-border/60 text-[10px] uppercase tracking-[0.06em] text-foreground/65">
                          <th className="py-2.5 pr-3 font-semibold">
                            Prompt
                          </th>
                          {data.cross_platform_divergence.divergent_prompts[0]?.platform_states.map(
                            (ps) => (
                              <th
                                key={ps.slug}
                                className="py-2.5 px-2 text-center font-semibold"
                              >
                                {ps.name}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {data.cross_platform_divergence.divergent_prompts.map(
                          (dp) => (
                            <tr
                              key={dp.prompt_id}
                              className="border-b border-border/30 last:border-0 align-top text-[13px]"
                            >
                              <td
                                className="py-3 pr-3 text-[12.5px] leading-relaxed text-foreground/85"
                                title={dp.rendered || dp.template}
                              >
                                {(() => {
                                  const t = dp.rendered || dp.template;
                                  return t.length > 90
                                    ? t.slice(0, 90) + "…"
                                    : t;
                                })()}
                              </td>
                              {dp.platform_states.map((ps) => (
                                <td
                                  key={ps.slug}
                                  className="py-3 px-2 text-center"
                                  title={`${ps.name}: ${ps.mentioned ? "mentioned" : "missed"}`}
                                >
                                  <span
                                    className="inline-block h-2.5 w-2.5 rounded-full"
                                    style={{
                                      background: ps.mentioned
                                        ? "var(--success)"
                                        : "var(--warning)",
                                      opacity: 0.85,
                                    }}
                                  />
                                </td>
                              ))}
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </section>
          )}

          {/* ── POSITION DISTRIBUTION ───────────────────────────── */}
          {/* Histogram of where the subject lands when mentioned —
              #1 vs #2 vs #3 vs #4+. Stands alone (the paired Tone
              card that previously shared this row was removed at
              request). */}
          <section>
            <div>
              <SectionTitle
                eyebrow="Position"
                title="Where the subject lands in AI answers"
                description="When mentioned, what rank does this subject get? Bars sum to 100% of mentioned responses."
                className="mb-4"
              />
              <Card className="p-5 md:p-6">
                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <div className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
                      {formatRank(focal?.avg_rank ?? null)}
                    </div>
                    <div className="mt-1.5 text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">
                      Avg position
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
                      {data.rank_distribution.reduce((acc, b) => acc + b.n, 0)}
                    </div>
                    <div className="mt-1.5 text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">
                      Mentions in snapshot
                    </div>
                  </div>
                </div>
                {/* Vertical bars — heights scaled to the max bar in
                    this snapshot so a low-mention subject still
                    shows a readable shape (relative shares matter
                    more than absolute height). Falls back to a
                    flat tray when all shares are zero so the
                    skeleton still reads as "histogram". */}
                <div className="mt-6 flex h-[140px] items-end gap-3">
                  {(() => {
                    const maxShare = Math.max(
                      ...data.rank_distribution.map((b) => b.share),
                      0.01,
                    );
                    return data.rank_distribution.map((b) => {
                      const heightPct = (b.share / maxShare) * 100;
                      // Darker fill for #1 (the win-state), step
                      // down through #2/#3, palest for #4+ — same
                      // direction as the Topic Recall opacity ramp.
                      const opacity =
                        b.rank === 1
                          ? 0.85
                          : b.rank === 2
                            ? 0.65
                            : b.rank === 3
                              ? 0.5
                              : 0.35;
                      return (
                        <div
                          key={b.rank}
                          className="flex flex-1 flex-col items-center gap-2"
                        >
                          <div className="text-[12px] font-semibold tabular-nums text-foreground">
                            {b.n}
                          </div>
                          <div className="relative h-full w-full rounded-t-md bg-muted/60">
                            <div
                              className="absolute bottom-0 left-0 right-0 rounded-t-md"
                              style={{
                                height: `${heightPct}%`,
                                background: "var(--primary)",
                                opacity,
                              }}
                            />
                          </div>
                          <div className="text-[11.5px] font-medium text-foreground/70">
                            {b.label}
                          </div>
                          <div className="text-[10.5px] tabular-nums text-muted-foreground">
                            {Math.round(b.share * 100)}%
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </Card>
            </div>

          </section>

          {/* ── MENTION QUALITY ──────────────────────────────────── */}
          {/* When the subject IS mentioned, how crowded is the
              company they keep? Solo / paired / group decomposition
              tells the reader whether mentions are "AI calls you
              out by name" or "AI lists you in a group of 8". Same
              denominator as the rank distribution above; different
              question entirely. */}
          {data.mention_quality.total_mentioned > 0 && (
            <section>
              <SectionTitle
                eyebrow="Mention Quality"
                title="When AI mentions the subject, who else is in the answer?"
                description={`Across ${data.mention_quality.total_mentioned} mentioned responses — solo callouts vs paired vs crowded lists.`}
                className="mb-4"
              />
              <Card className="p-5 md:p-6">
                {(() => {
                  const mq = data.mention_quality;
                  const buckets = [
                    {
                      key: "solo",
                      label: "Solo",
                      hint: "Only the subject named",
                      data: mq.solo,
                      opacity: 0.85,
                    },
                    {
                      key: "paired",
                      label: "Paired",
                      hint: "Subject + 1–2 competitors",
                      data: mq.paired,
                      opacity: 0.55,
                    },
                    {
                      key: "group",
                      label: "Group",
                      hint: "Subject + 3 or more competitors",
                      data: mq.group,
                      opacity: 0.3,
                    },
                  ];
                  return (
                    <div className="space-y-4">
                      {buckets.map((b) => (
                        <div
                          key={b.key}
                          className="grid grid-cols-[140px_1fr_auto] items-center gap-4"
                        >
                          <div>
                            <div className="text-[13px] font-semibold text-foreground">
                              {b.label}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {b.hint}
                            </div>
                          </div>
                          <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/70">
                            <div
                              className="absolute inset-y-0 left-0 rounded-full"
                              style={{
                                width: `${b.data.share * 100}%`,
                                background: "var(--primary)",
                                opacity: b.opacity,
                              }}
                            />
                          </div>
                          <div className="min-w-[80px] text-right text-[13px] tabular-nums text-foreground/85">
                            <span className="font-semibold text-foreground">
                              {b.data.count}
                            </span>
                            <span className="text-foreground/55">
                              {" "}
                              · {Math.round(b.data.share * 100)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </Card>
            </section>
          )}

          {/* ── FIRST-MENTION STEAL SHARE ───────────────────────── */}
          {/* Companion to the Position histogram: when the subject
              isn't #1, who is? Names specific opponents and the
              questions they're winning, so a comms reader has
              actionable "we're losing on these terms to that
              person" intelligence rather than just an aggregate
              rank number. Hides when there are no measurable
              first-mention contests in this snapshot. */}
          {data.first_mention_steal_share.total_responses > 0 && (
            <section>
              <SectionTitle
                eyebrow="First-Mention Contest"
                title="When the subject isn't #1, who is?"
                description={`Across ${data.first_mention_steal_share.total_responses} unnamed-layer responses, ${data.subject_name} took first mention ${data.first_mention_steal_share.subject_first_count} times; competitors took it ${data.first_mention_steal_share.stolen_count} times.`}
                className="mb-4"
              />
              <Card className="p-5 md:p-6">
                {data.first_mention_steal_share.stealers.length === 0 ? (
                  <div className="text-[13px] text-foreground/70">
                    No competitor landed at rank #1 in this snapshot — the
                    only first-mention contests were either won by{" "}
                    {data.subject_name} or had no ranked entity at all.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-border/60 text-[10px] uppercase tracking-[0.06em] text-foreground/65">
                          <th className="py-2.5 pr-3 font-semibold">
                            <span className="inline-flex items-center gap-1">
                              Competitor
                              <KpiTooltipIcon
                                text="An entity AI surfaced at rank #1 in an unnamed-layer response where the subject didn't take first mention. Names come from the competitors_mentioned extraction; name variants (e.g. 'Joe Biden' vs 'Biden') aren't deduped today."
                                align="left"
                              />
                            </span>
                          </th>
                          <th className="py-2.5 px-3 text-right font-semibold">
                            <span className="inline-flex items-center justify-end gap-1">
                              Times #1
                              <KpiTooltipIcon
                                text="Number of unnamed-layer responses where this competitor was AI's first-mentioned entity. Each response counts once, even if the competitor appeared multiple times within it."
                                align="right"
                              />
                            </span>
                          </th>
                          <th className="py-2.5 px-3 text-right font-semibold">
                            <span className="inline-flex items-center justify-end gap-1">
                              Share of all responses
                              <KpiTooltipIcon
                                text="Times-#1 divided by the total unnamed-layer responses in this snapshot — same denominator the subject's first-mention rate uses, so you can compare 'you won X%' directly against 'this competitor stole Y%'."
                                align="right"
                              />
                            </span>
                          </th>
                          <th className="py-2.5 pl-3 font-semibold">
                            <span className="inline-flex items-center gap-1">
                              Sample question
                              <KpiTooltipIcon
                                text="One of up to three example prompt templates where this competitor took rank #1. Hover the cell text to see the additional samples."
                                align="left"
                              />
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.first_mention_steal_share.stealers.map((s) => (
                          <tr
                            key={s.name}
                            className="border-b border-border/30 last:border-0 align-top text-[13.5px]"
                          >
                            <td className="py-3 pr-3 font-medium text-foreground">
                              {s.name}
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums text-foreground/85">
                              {s.count}
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums text-foreground/85">
                              {Math.round(s.share * 100)}%
                            </td>
                            <td
                              className="py-3 pl-3 text-[12.5px] leading-relaxed text-foreground/70"
                              title={s.sample_prompts.join("\n\n")}
                            >
                              {s.sample_prompts[0]
                                ? `"${
                                    s.sample_prompts[0].length > 90
                                      ? s.sample_prompts[0].slice(0, 90) + "…"
                                      : s.sample_prompts[0]
                                  }"`
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </section>
          )}

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
                            {capitalizeFirst(t.label)}
                          </div>
                          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted/80">
                            <div
                              className="absolute inset-y-0 left-0 rounded-full"
                              style={{
                                width: `${pct}%`,
                                background: isWeakest
                                  ? "var(--warning)"
                                  : "var(--primary)",
                                // Value-derived opacity so a 100% bar reads
                                // darker than a 50% bar — width alone wasn't
                                // enough visual differentiation between
                                // high- and mid-recall topics.
                                opacity: isWeakest ? 0.85 : 0.4 + (pct / 100) * 0.45,
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

          {/* ── TOPIC TRENDS ─────────────────────────────────────── */}
          {/* Per-topic mention rate over time — same topics as Topic
              Recall above, but plotted across snapshots so a reader
              can see which topic is rising or falling rather than
              just "which is weakest right now". Complements rather
              than replaces the snapshot bars. */}
          {data.topic_trajectories.length > 0 &&
            data.trajectory.weeks.length >= 2 && (
              <section>
                <SectionTitle
                  eyebrow="Topic Trends"
                  title="How each topic's coverage has moved"
                  description="One line per tracked topic, week over week. Hover for the value at any snapshot."
                  className="mb-4"
                />
                <Card className="p-5 md:p-6">
                  <TopicTrends
                    trajectoryWeeks={data.trajectory.weeks}
                    topicTrajectories={data.topic_trajectories}
                  />
                </Card>
              </section>
            )}

          {/* ── TOPIC MOMENTUM ───────────────────────────────────── */}
          {/* Two-column ranking derived from topic_trajectories:
              biggest gainers vs biggest decliners across the
              tracked window. Quick "what's actually moving"
              read — faster than parsing the multi-line chart
              above for the same answer. Uses oldest-non-null
              vs newest-non-null per topic as the delta. */}
          {data.topic_trajectories.length > 0 &&
            (() => {
              type Mover = {
                label: string;
                source_field: string;
                delta: number;
                current_rate: number;
                oldest_rate: number;
              };
              const movers: Mover[] = [];
              for (const t of data.topic_trajectories) {
                const measured = t.mention_rate
                  .map((v, i) => ({ v, i }))
                  .filter(
                    (
                      p,
                    ): p is { v: number; i: number } =>
                      p.v !== null && Number.isFinite(p.v),
                  );
                if (measured.length < 2) continue;
                const oldest = measured[0].v;
                const newest = measured[measured.length - 1].v;
                movers.push({
                  label: t.label,
                  source_field: t.source_field,
                  delta: newest - oldest,
                  current_rate: newest,
                  oldest_rate: oldest,
                });
              }
              if (movers.length === 0) return null;
              const rising = movers
                .filter((m) => m.delta > 0.005)
                .sort((a, b) => b.delta - a.delta)
                .slice(0, 5);
              const declining = movers
                .filter((m) => m.delta < -0.005)
                .sort((a, b) => a.delta - b.delta)
                .slice(0, 5);
              if (rising.length === 0 && declining.length === 0) {
                return null;
              }
              const renderList = (
                rows: Mover[],
                tone: "success" | "warning",
              ) => (
                <ul className="space-y-3">
                  {rows.map((m) => {
                    const pts = Math.round(m.delta * 100);
                    const sign = m.delta > 0 ? "+" : "";
                    const toneClass =
                      tone === "success" ? "text-success" : "text-warning";
                    return (
                      <li
                        key={m.label}
                        className="flex items-baseline justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[13.5px] font-medium text-foreground">
                            {capitalizeFirst(m.label)}
                          </div>
                          <div className="text-[11px] text-muted-foreground tabular-nums">
                            {Math.round(m.oldest_rate * 100)}% →{" "}
                            {Math.round(m.current_rate * 100)}%
                          </div>
                        </div>
                        <span
                          className={`shrink-0 font-semibold tabular-nums text-[14px] ${toneClass}`}
                        >
                          {sign}
                          {pts} pp
                        </span>
                      </li>
                    );
                  })}
                </ul>
              );
              return (
                <section className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <SectionTitle
                      eyebrow="Topic Momentum"
                      title="Topics gaining ground"
                      description="Biggest mention-rate gains from oldest to newest snapshot."
                      className="mb-4"
                    />
                    <Card className="p-5 md:p-6">
                      {rising.length > 0 ? (
                        renderList(rising, "success")
                      ) : (
                        <div className="text-[13px] text-muted-foreground">
                          No topics gained ground across the tracked
                          window.
                        </div>
                      )}
                    </Card>
                  </div>
                  <div>
                    <SectionTitle
                      eyebrow="Topic Momentum"
                      title="Topics losing ground"
                      description="Biggest mention-rate declines from oldest to newest snapshot."
                      className="mb-4"
                    />
                    <Card className="p-5 md:p-6">
                      {declining.length > 0 ? (
                        renderList(declining, "warning")
                      ) : (
                        <div className="text-[13px] text-muted-foreground">
                          No topics lost ground across the tracked
                          window.
                        </div>
                      )}
                    </Card>
                  </div>
                </section>
              );
            })()}

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

          {/* ── PER-PROMPT COVERAGE TABLE ────────────────────────── */}
          {/* The "what to fix" view — every tracked unnamed-layer
              prompt as a row, each platform a colored status dot
              (green = mentioned, red = missed, gray = no response
              from that platform). Sorted with fully-missed prompts
              at the top so the actionable rows lead. Hover any row
              for the full prompt text. */}
          {data.per_prompt_coverage.length > 0 &&
            (() => {
              // Apply filter-bar scoping: topic narrows the rows;
              // platform narrows the columns to a single column.
              // Filtering done here (server-side) so the URL state
              // drives the rendered table without any client logic.
              const filteredRows = data.per_prompt_coverage.filter(
                (r) => !filterTopic || r.topic_label === filterTopic,
              );
              const filterCols = (
                cols: SubjectOverview["per_prompt_coverage"][number]["platform_results"],
              ) =>
                filterPlatform
                  ? cols.filter((c) => c.slug === filterPlatform)
                  : cols;
              const headerCols = filterCols(
                filteredRows[0]?.platform_results ?? [],
              );
              return (
                <section>
                  <SectionTitle
                    eyebrow="Per-Prompt Coverage"
                    title="Where exactly the subject surfaces — and where it doesn't"
                    description="Every tracked prompt as a row. Green = mentioned, red = ran but missed, gray = no response from that platform. Sorted with fully-missed prompts first."
                    className="mb-4"
                    right={
                      filterPlatform || filterTopic ? (
                        <span className="text-[11.5px] text-muted-foreground">
                          Scoped to {filteredRows.length} prompt
                          {filteredRows.length === 1 ? "" : "s"}
                          {filterPlatform ? ` · ${filterPlatform}` : ""}
                          {filterTopic
                            ? ` · ${capitalizeFirst(filterTopic).slice(0, 40)}`
                            : ""}
                        </span>
                      ) : undefined
                    }
                  />
                  <Card className="p-5 md:p-6">
                    {filteredRows.length === 0 ? (
                      <div className="text-[13px] text-muted-foreground">
                        No prompts match the current filter scope.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="border-b border-border/60 text-[10px] uppercase tracking-[0.06em] text-foreground/65">
                              <th className="py-2.5 pr-3 font-semibold">
                                Topic
                              </th>
                              <th className="py-2.5 px-3 font-semibold">
                                Prompt
                              </th>
                              {headerCols.map((col) => (
                                <th
                                  key={col.slug}
                                  className="py-2.5 px-2 text-center font-semibold"
                                >
                                  {col.name}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredRows.map((row) => (
                              <tr
                                key={row.prompt_id}
                                className="border-b border-border/30 last:border-0 align-top text-[13px]"
                              >
                                <td className="py-3 pr-3 text-[11.5px] font-medium text-foreground/75">
                                  {row.topic_label
                                    ? capitalizeFirst(row.topic_label)
                                    : "—"}
                          </td>
                          <td
                            className="py-3 px-3 text-[12.5px] leading-relaxed text-foreground/85"
                            title={row.rendered || row.template}
                          >
                            {(() => {
                              const text = row.rendered || row.template;
                              return text.length > 110
                                ? text.slice(0, 110) + "…"
                                : text;
                            })()}
                          </td>
                                {filterCols(row.platform_results).map(
                                  (cell) => {
                                    const tone = !cell.present
                                      ? { bg: "var(--muted)", op: 0.4 }
                                      : cell.mentioned
                                        ? {
                                            bg: "var(--success)",
                                            op: 0.85,
                                          }
                                        : {
                                            bg: "var(--warning)",
                                            op: 0.85,
                                          };
                                    const label = !cell.present
                                      ? "no response"
                                      : cell.mentioned
                                        ? `mentioned${cell.rank ? ` · rank ${cell.rank}` : ""}`
                                        : "missed";
                                    return (
                                      <td
                                        key={cell.slug}
                                        className="py-3 px-2 text-center"
                                        title={`${cell.name}: ${label}`}
                                      >
                                        <span
                                          className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full"
                                          style={{
                                            background: tone.bg,
                                            opacity: tone.op,
                                          }}
                                          aria-label={label}
                                        >
                                          {cell.mentioned && cell.rank ? (
                                            <span className="text-[8.5px] font-bold leading-none text-background">
                                              {cell.rank}
                                            </span>
                                          ) : null}
                                        </span>
                                      </td>
                                    );
                                  },
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Legend — keeps the dot semantics discoverable
                        without making the table cells noisier. */}
                    {filteredRows.length > 0 && (
                      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px] text-foreground/65">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{
                              background: "var(--success)",
                              opacity: 0.85,
                            }}
                          />
                          Mentioned (number = rank)
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{
                              background: "var(--warning)",
                              opacity: 0.85,
                            }}
                          />
                          Ran but missed
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{
                              background: "var(--muted)",
                              opacity: 0.4,
                            }}
                          />
                          No response in this snapshot
                        </span>
                      </div>
                    )}
                  </Card>
                </section>
              );
            })()}

        </main>
      </div>
    </div>
  );
}
