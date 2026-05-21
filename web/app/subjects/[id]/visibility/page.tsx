/**
 * Visibility hub.
 *
 * Restructured to feel like a polished public-affairs SaaS dashboard
 * — eight scannable sections, each answering one executive question,
 * rather than a long analytics report. Top to bottom:
 *
 *   1. Visibility Briefing       — executive summary + 4 KPIs + platform heatmap
 *   2. Visibility Trend          — single chart + "What changed" insight card
 *   3. Platform Breakdown        — comparison table with status pills
 *   4. Topic Visibility          — 3 columns: Highest / Gaps / Biggest Movement
 *   5. Answer Position           — 5-bucket distribution + plain takeaway
 *   6. Cross-Platform Consistency — interpretation card (not a dense table)
 *   7. Competitive Visibility    — SoV chart + Prominence table (2 panels)
 *   8. Prompt-Level Evidence     — auditable table, collapsed by default
 *
 * Filter bar at the top (Platform / Topic / Compare-to) scopes the
 * Prompt-Level Evidence table and triggers an inline Compare card
 * when a competitor is selected.
 */
import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { notFound } from "next/navigation";

import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { Card, SectionTitle, Pill } from "@/components/dashboard/ui";
import { CompetitorBarsFromData } from "@/components/dashboard/Charts";
import { TrendOverTime } from "./TrendOverTime";
import { FilterBar } from "./FilterBar";
import { SectionNav } from "./SectionNav";
import { CompetitiveScatter } from "./CompetitiveScatter";
import { TopicProminenceFilter } from "./TopicProminenceFilter";
import { TopicPositionFilter } from "./TopicPositionFilter";
import {
  CompetitiveTabs,
  type CompetitiveTab,
} from "./CompetitiveTabs";
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

// ── Helpers ────────────────────────────────────────────────────────

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
        className={`pointer-events-none absolute ${pos} bottom-full mb-2 w-60 rounded-md border border-border bg-popover px-3 py-2 text-[11.5px] leading-snug text-popover-foreground opacity-0 group-hover:opacity-100 transition-opacity z-30 shadow-lg`}
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

function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Two flavors of pp formatter — the codebase has both 0..1 share
// deltas (need ×100 to get pp) and already-in-pp deltas (don't).
// Keeping them as separate helpers so the call site spells out
// which scale it's using, instead of relying on call-time math.
function formatSignedPp(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const pts = Math.round(v * 100);
  if (pts === 0) return "0 pp";
  return `${pts > 0 ? "+" : ""}${pts} pp`;
}

// For values that are ALREADY in pp units (e.g. backend KpiValue.delta
// where _kpi_with_trend has already multiplied by 100). Just round
// and append "pp" — no scale change.
function formatSignedPpRaw(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const pts = Math.round(v);
  if (pts === 0) return "0 pp";
  return `${pts > 0 ? "+" : ""}${pts} pp`;
}

function deltaToneClass(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0) return "text-muted-foreground";
  return v > 0 ? "text-success" : "text-warning";
}

// Status pill semantics for Platform Breakdown. Order matters — the
// first matching rule wins.
function platformStatus(row: {
  mention_rate: number | null;
  avg_rank: number | null;
  n_responses: number;
}): { label: string; tone: "success" | "warning" | "primary" | "neutral" } {
  if (row.n_responses === 0 || row.mention_rate === null) {
    return { label: "Limited Data", tone: "neutral" };
  }
  if (row.mention_rate >= 0.6 && (row.avg_rank ?? 999) <= 3) {
    return { label: "Strong", tone: "success" };
  }
  if (row.mention_rate < 0.3) {
    return { label: "Visibility Gap", tone: "warning" };
  }
  return { label: "Mixed", tone: "primary" };
}

// Compose the Visibility Briefing's natural-language summary from
// real data — visibility level + the platforms it's strongest on +
// strongest/weakest topic. Falls back gracefully when any input is
// missing.
function composeBriefingSummary({
  subjectName,
  mentionRate,
  perPlatformKpis,
  strongestTopic,
  weakestTopic,
}: {
  subjectName: string;
  mentionRate: number | null;
  perPlatformKpis: SubjectOverview["per_platform_kpis"];
  strongestTopic: { label: string } | null;
  weakestTopic: { label: string } | null;
}): string {
  const visibilityWord =
    mentionRate === null
      ? "tracked"
      : mentionRate >= 0.7
        ? "highly visible"
        : mentionRate >= 0.4
          ? "moderately visible"
          : "underweighted";

  const strongPlatforms = perPlatformKpis
    .filter((p) => p.mention_rate !== null && p.mention_rate >= 0.4)
    .sort((a, b) => (b.mention_rate ?? 0) - (a.mention_rate ?? 0))
    .map((p) => p.name);
  const platformsPhrase =
    strongPlatforms.length === 0
      ? ""
      : strongPlatforms.length === 1
        ? `, with especially strong coverage on ${strongPlatforms[0]}`
        : `, with especially strong coverage on ${strongPlatforms.slice(0, -1).join(", ")} and ${strongPlatforms[strongPlatforms.length - 1]}`;

  let topicsPhrase = "";
  if (
    strongestTopic &&
    weakestTopic &&
    strongestTopic.label !== weakestTopic.label
  ) {
    topicsPhrase = ` ${capitalizeFirst(strongestTopic.label)} is the strongest topic area, while ${capitalizeFirst(weakestTopic.label)} is the biggest visibility gap.`;
  } else if (strongestTopic) {
    topicsPhrase = ` ${capitalizeFirst(strongestTopic.label)} is the strongest topic area.`;
  }

  return `${subjectName} is ${visibilityWord} across AI answers${platformsPhrase}.${topicsPhrase}`;
}

// "What changed" copy — composed FROM THE TRAJECTORY ARRAYS, not
// from snapshot_diff. The chart and the card need to refer to the
// same prior snapshot for the page to make sense, but the backend's
// snapshot_diff uses a different "prior" selection (most-recent
// non-historical refresh, dated by completed_at) than the trajectory
// (most-recent refresh of any kind, dated by started_at or
// historical_as_of). When a historical estimate sits between two
// live refreshes, those produce different priors AND different
// dates — the chart says "compared to 05/10" while the card says
// "compared to May 12." Deriving everything from the trajectory
// fixes the contradiction.
//
// Returns { copy, latestDate, priorDate } so the JSX can render
// both endpoints explicitly ("Latest (May 18) vs prior (May 10)")
// instead of just naming one and leaving the other ambiguous.
const STABLE_COPY =
  "Visibility is mostly stable across recent snapshots, with some topic-level variation.";

function composeWhatChanged({
  trajectoryWeeks,
  aiRecall,
  topicTrajectories,
  competitorTrajectories,
}: {
  trajectoryWeeks: SubjectOverview["trajectory"]["weeks"];
  aiRecall: (number | null)[];
  topicTrajectories: SubjectOverview["topic_trajectories"];
  competitorTrajectories: SubjectOverview["competitor_trajectories"];
}): { copy: string; latestDate: string | null; priorDate: string | null } {
  const len = trajectoryWeeks.length;
  if (len < 2) {
    return {
      copy: STABLE_COPY,
      latestDate: trajectoryWeeks[len - 1] ?? null,
      priorDate: null,
    };
  }
  const latestIdx = len - 1;
  const priorIdx = len - 2;
  const latestDate = trajectoryWeeks[latestIdx];
  const priorDate = trajectoryWeeks[priorIdx];

  // Match the backend snapshot_diff's 5-pp filter so micro-jitter
  // doesn't surface in the prose (e.g., 1-pp swings on small N).
  const MIN_DELTA = 0.05;

  // Biggest topic mover at this snapshot boundary.
  let topTopic: { label: string; delta: number } | null = null;
  for (const t of topicTrajectories) {
    const cur = t.mention_rate[latestIdx];
    const pri = t.mention_rate[priorIdx];
    if (
      cur === null ||
      pri === null ||
      !Number.isFinite(cur) ||
      !Number.isFinite(pri)
    )
      continue;
    const delta = (cur as number) - (pri as number);
    if (Math.abs(delta) < MIN_DELTA) continue;
    if (topTopic === null || Math.abs(delta) > Math.abs(topTopic.delta)) {
      topTopic = { label: t.label, delta };
    }
  }

  // Biggest competitor SoV mover.
  let topCompetitor: { name: string; delta: number } | null = null;
  for (const c of competitorTrajectories) {
    const cur = c.share_of_voice[latestIdx];
    const pri = c.share_of_voice[priorIdx];
    if (
      cur === null ||
      pri === null ||
      !Number.isFinite(cur) ||
      !Number.isFinite(pri)
    )
      continue;
    const delta = (cur as number) - (pri as number);
    if (Math.abs(delta) < MIN_DELTA) continue;
    if (
      topCompetitor === null ||
      Math.abs(delta) > Math.abs(topCompetitor.delta)
    ) {
      topCompetitor = { name: c.name, delta };
    }
  }

  const parts: string[] = [];
  if (topTopic) {
    const verb = topTopic.delta > 0 ? "rose" : "declined";
    const magnitude = Math.abs(Math.round(topTopic.delta * 100));
    parts.push(
      `${capitalizeFirst(topTopic.label)} ${verb} ${magnitude} pp in the latest snapshot`,
    );
  }
  if (topCompetitor) {
    const verb = topCompetitor.delta > 0 ? "gained" : "lost";
    const magnitude = Math.abs(Math.round(topCompetitor.delta * 100));
    parts.push(
      `${topCompetitor.name} ${verb} ${magnitude} pp of share of voice`,
    );
  }
  if (parts.length === 0) {
    // No topic / competitor mover passed the 5-pp filter — fall back
    // to overall recall delta if it moved at all.
    const cur = aiRecall[latestIdx];
    const pri = aiRecall[priorIdx];
    if (
      cur !== null &&
      pri !== null &&
      Number.isFinite(cur) &&
      Number.isFinite(pri)
    ) {
      const delta = (cur as number) - (pri as number);
      if (Math.abs(delta) >= 0.01) {
        const verb = delta > 0 ? "rose" : "declined";
        const magnitude = Math.abs(Math.round(delta * 100));
        parts.push(`Overall mention rate ${verb} ${magnitude} pp`);
      }
    }
  }
  if (parts.length === 0) {
    return { copy: STABLE_COPY, latestDate, priorDate };
  }
  return { copy: parts.join("; ") + ".", latestDate, priorDate };
}

// "When this subject is mentioned, how prominently it appears" —
// plain-English takeaway derived from the bucket with the largest
// share. Honest about absence: "missing from most answers" wins
// if Not mentioned dominates.
function composeAnswerPositionTakeaway(
  rankDist: SubjectOverview["rank_distribution"],
  subjectName: string,
): string {
  if (rankDist.total_responses === 0) {
    return "No measured responses in this snapshot to assess position.";
  }
  const sorted = [...rankDist.buckets].sort((a, b) => b.n - a.n);
  const dominant = sorted[0];
  const secondary = sorted[1];
  if (!dominant || dominant.n === 0) {
    return "No measured responses in this snapshot to assess position.";
  }
  // Phrase used to describe a non-absence rank bucket inline.
  const bucketPhrase = (
    b: SubjectOverview["rank_distribution"]["buckets"][number],
  ): string =>
    b.is_absence
      ? "missing entirely"
      : b.rank === 1
        ? "leads the answer"
        : `ranks ${b.label.toLowerCase()}`;

  const dominantPct = Math.round(dominant.share * 100);
  // Honest about bimodal shapes: if a secondary bucket carries ≥15%
  // share, mention both so the reader doesn't take a 40% modal rank
  // as the full story when 30% of answers also sit lower. The prior
  // single-clause takeaway hid that distribution.
  if (secondary && secondary.share >= 0.15) {
    const secondaryPct = Math.round(secondary.share * 100);
    if (dominant.is_absence) {
      return `${subjectName} is missing from ${dominantPct}% of AI answers, and ${bucketPhrase(secondary)} on another ${secondaryPct}%.`;
    }
    if (dominant.rank === 1) {
      return `${subjectName} ${bucketPhrase(dominant)} on ${dominantPct}% of answers, but ${bucketPhrase(secondary)} on another ${secondaryPct}%.`;
    }
    return `${subjectName} ${bucketPhrase(dominant)} on ${dominantPct}% of answers, with another ${secondaryPct}% ${bucketPhrase(secondary)}.`;
  }

  // No substantial second bucket — single-clause is fine.
  if (dominant.is_absence) {
    return `${subjectName} is missing from most AI answers in this snapshot.`;
  }
  if (dominant.rank === 1) {
    return `${subjectName} is regularly the lead entity in AI answers.`;
  }
  if (dominant.rank === 2) {
    return `${subjectName} is mentioned regularly, but usually after another entity leads the answer.`;
  }
  return `${subjectName} is often mentioned, but typically further down the list of entities AI names.`;
}

// ── Page ───────────────────────────────────────────────────────────

export default async function VisibilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // URL state drives FilterBar + Compare card. Page stays fully
  // server-rendered; FilterBar pushes new search params via
  // router.replace.
  searchParams: Promise<{
    compare?: string;
    prominence_topic?: string;
    competitive_tab?: string;
    position_topic?: string;
  }>;
}) {
  const { id: idStr } = await params;
  const sp = await searchParams;
  const compareName = sp.compare || "";
  const prominenceTopic = sp.prominence_topic || "";
  const positionTopic = sp.position_topic || "";
  // Valid tabs only — unknown values fall through to "overview" so a
  // URL hack can't put the section into an empty state.
  const competitiveTab: CompetitiveTab =
    sp.competitive_tab === "co-mentions" ||
    sp.competitive_tab === "ownership"
      ? sp.competitive_tab
      : "overview";
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

  // ── Derived data shared across sections ─────────────────────────
  const focal = data.competitive.find((c) => c.is_subject);
  const topicsWithRecall = data.topic_coverage.filter(
    (t) => t.ai_recall !== null && Number.isFinite(t.ai_recall),
  );
  const topicsSortedDesc = [...topicsWithRecall].sort(
    (a, b) => (b.ai_recall ?? 0) - (a.ai_recall ?? 0),
  );
  const strongestTopic = topicsSortedDesc[0] ?? null;
  const weakestTopic =
    topicsSortedDesc[topicsSortedDesc.length - 1] ?? null;

  const mentionRate = data.kpis.ai_recall.value;

  // Topic Visibility: 3-column data prep.
  // Highest = top 3 topics by mention rate (unconditional — these
  // ARE the highest, even if every topic is tied at 100%).
  // Gaps = topics that are MEANINGFULLY weaker than the ceiling
  // (≥10 pp below the strongest topic). Without this floor, a
  // subject with all topics at 100% would surface 100% topics
  // as "gaps", which is nonsensical. Also dedupe against the
  // Highest set so the same topic can't appear in both columns.
  const highestTopics = topicsSortedDesc.slice(0, 3);
  const highestSet = new Set(highestTopics.map((t) => t.label));
  const ceiling = topicsSortedDesc[0]?.ai_recall ?? 1;
  const GAP_THRESHOLD_PP = 0.1;
  const gapTopics = [...topicsSortedDesc]
    .reverse()
    .filter(
      (t) =>
        (t.ai_recall ?? 1) <= ceiling - GAP_THRESHOLD_PP &&
        !highestSet.has(t.label),
    )
    .slice(0, 3);

  // Biggest topic mover across the tracked window — derived from
  // topic_trajectories' first vs latest non-null value. Hidden
  // (null) when no topic has at least two measured snapshots.
  type Mover = {
    label: string;
    delta: number;
    oldest: number;
    newest: number;
  };
  let biggestMover: Mover | null = null;
  for (const t of data.topic_trajectories) {
    const measured = t.mention_rate.filter(
      (v): v is number => v !== null && Number.isFinite(v),
    );
    if (measured.length < 2) continue;
    const oldest = measured[0];
    const newest = measured[measured.length - 1];
    const delta = newest - oldest;
    if (
      biggestMover === null ||
      Math.abs(delta) > Math.abs(biggestMover.delta)
    ) {
      biggestMover = { label: t.label, delta, oldest, newest };
    }
  }

  // Visibility Trend overlay series: top competitors' mention-rate
  // trajectories so the reader can see "are they gaining on me?"
  // alongside the subject's own line. Distinct hues per competitor
  // (instead of using TOPIC_OVERLAY_COLORS' two-color scheme).
  const COMPETITOR_LINE_COLORS = [
    "oklch(0.62 0.12 160)",  // muted teal
    "oklch(0.66 0.13 55)",   // muted amber
    "oklch(0.55 0.11 310)",  // muted violet
  ];
  const trendOverlays = data.competitor_trajectories.map((c, i) => ({
    name: c.name,
    color: COMPETITOR_LINE_COLORS[i % COMPETITOR_LINE_COLORS.length],
    values: c.mention_rate,
  }));

  // Visibility Briefing — narrative summary + 4 KPI cards.
  const briefingSummary = composeBriefingSummary({
    subjectName: data.subject_name,
    mentionRate,
    perPlatformKpis: data.per_platform_kpis,
    strongestTopic,
    weakestTopic,
  });
  // Color all four KPI cards by threshold for a consistent verdict
  // policy — previously only AI Mention Rate was toned, which read
  // as "the others don't have an opinion." Each metric has its own
  // polarity (whether higher or lower is the desired direction);
  // toneByThreshold flips the success/warning mapping accordingly.
  type Polarity = "higher_better" | "lower_better";
  const toneByThreshold = (
    value: number | null,
    polarity: Polarity,
    good: number,
    bad: number,
  ): string => {
    if (value === null || !Number.isFinite(value)) return "text-foreground/60";
    if (polarity === "higher_better") {
      if (value >= good) return "text-success";
      if (value <= bad) return "text-warning";
      return "text-foreground";
    }
    if (value <= good) return "text-success";
    if (value >= bad) return "text-warning";
    return "text-foreground";
  };

  type KpiCard = {
    label: string;
    value: string;
    helper: string;
    subtitle?: string;
    valueColor: string;
    polarity: Polarity;
    // Subject-set benchmark caption — pre-formatted so each KPI
    // can supply its own scale (pct vs rank). null when no
    // benchmark exists for that metric (e.g. Largest Visibility
    // Gap doesn't have a cross-subject avg yet).
    benchmark: string | null;
  };
  // Defensive: a stale uvicorn process can serve an older payload
  // missing this field, which would crash the page. Fall back to
  // a no-benchmark shell so each KPI card just hides the benchmark
  // line until the API reloads.
  const bm = data.subject_set_benchmarks ?? {
    n_subjects: 0,
    ai_mention_rate_avg: null,
    avg_mention_rank_avg: null,
    first_mention_rate_avg: null,
  };
  const bmCaption = (
    avg: number | null,
    formatter: (v: number) => string,
  ): string | null => {
    if (avg === null || !Number.isFinite(avg)) return null;
    if (bm.n_subjects <= 1) return null;
    return `vs ${formatter(avg)} subject-set avg (${bm.n_subjects} subjects)`;
  };
  const kpis: KpiCard[] = [
    {
      label: "AI Mention Rate",
      value: formatPct(mentionRate),
      helper: "Share of monitored prompts where the subject appeared.",
      valueColor: toneByThreshold(mentionRate, "higher_better", 0.7, 0.4),
      polarity: "higher_better",
      benchmark: bmCaption(bm.ai_mention_rate_avg, (v) => formatPct(v)),
    },
    {
      label: "Avg. Mention Rank",
      value: formatRank(focal?.avg_rank ?? null),
      helper: "Average position when the subject was mentioned.",
      valueColor: toneByThreshold(
        focal?.avg_rank ?? null,
        "lower_better",
        2,
        4,
      ),
      polarity: "lower_better",
      benchmark: bmCaption(bm.avg_mention_rank_avg, (v) => v.toFixed(1)),
    },
    {
      label: "First Mention Share",
      value: formatPct(focal?.first_mention_rate ?? null),
      helper: "How often the subject appeared first among named entities.",
      valueColor: toneByThreshold(
        focal?.first_mention_rate ?? null,
        "higher_better",
        0.5,
        0.2,
      ),
      polarity: "higher_better",
      benchmark: bmCaption(bm.first_mention_rate_avg, (v) => formatPct(v)),
    },
    {
      label: "Largest Visibility Gap",
      // The value shown is the WEAKEST topic's mention rate — so
      // higher = the gap is less severe = better. Same polarity as
      // AI Mention Rate.
      value: formatPct(weakestTopic?.ai_recall ?? null),
      subtitle: weakestTopic
        ? capitalizeFirst(weakestTopic.label)
        : "No tracked topics",
      helper: "Topic area where visibility is weakest.",
      valueColor: toneByThreshold(
        weakestTopic?.ai_recall ?? null,
        "higher_better",
        0.7,
        0.4,
      ),
      polarity: "higher_better",
      // No cross-subject benchmark for this one yet — each subject's
      // "weakest topic" is by definition different, so an average
      // wouldn't be apples-to-apples.
      benchmark: null,
    },
  ];

  // Composed Competitive Visibility summary line.
  const subjectInSet = data.competitive.find((c) => c.is_subject);
  const competitorsRanked = data.competitive
    .filter((c) => !c.is_subject)
    .sort((a, b) => b.sov - a.sov);
  let competitiveSummary = "";
  if (subjectInSet && competitorsRanked.length > 0) {
    const top1 = competitorsRanked[0];
    const top2 = competitorsRanked[1];
    if (subjectInSet.sov >= top1.sov) {
      const rivals = top2
        ? `${top1.name} and ${top2.name} compete for visibility in this comparison set.`
        : `${top1.name} is the closest competitor.`;
      competitiveSummary = `${data.subject_name} leads this comparison set by share of voice; ${rivals}`;
    } else {
      competitiveSummary = `${top1.name} leads this comparison set; ${data.subject_name} sits at ${Math.round(subjectInSet.sov * 100)}% share of voice.`;
    }
  }


  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar subjectId={subjectId} activeSection="visibility" />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          subjectName={data.subject_name}
          subjectInitials={subjectInitials}
          metaLine={headerMeta}
          // Narrow the Subject objects to the {id, name} shape Header
          // declares — matches the Overview page's pattern and keeps
          // the dropdown's list-key set tight to what's actually
          // used in render (the wider object had extra fields that
          // were tripping React's child-attribution warning here).
          subjects={subjects.map((s) => ({ id: s.id, name: s.name }))}
          currentSubjectId={subjectId}
          refreshSlot={
            data.meta.latest_refresh_id ? (
              <RefreshButton subjectId={subjectId} />
            ) : null
          }
        />

        {/* xl:pr-44 reserves a corridor on the right at xl+ widths
            so the fixed SectionNav (right-6, ~140px wide) doesn't
            overlap the main column's content — the Prominence card
            header was getting clipped by the nav at the section's
            right edge. */}
        <main className="flex-1 px-4 md:px-12 xl:pr-44 py-6 space-y-16 max-w-[1400px] w-full mx-auto">
          {/* Sticky filter bar — scopes Prompt-Level Evidence and
              triggers Compare. URL-driven so the page stays
              server-rendered and the hub remains bookmarkable. */}
          <FilterBar
            competitors={data.competitor_trajectories.map((c) => ({
              name: c.name,
            }))}
          />

          {/* Floating section jump-nav (xl+ only). Pure anchors —
              the sections below carry matching id attributes. */}
          <SectionNav />

          <Link
            href={`/subjects/${subjectId}`}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground hover:text-foreground transition-colors -mb-6"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back to {data.subject_name} Overview
          </Link>

          {/* Compare card — renders when ?compare=Name is set. Same
              data join as before: current snapshot from competitive[],
              trend slope from competitor_trajectories[]. */}
          {compareName &&
            (() => {
              const cmp = data.competitive.find((c) => c.name === compareName);
              const subj = data.competitive.find((c) => c.is_subject);
              const cmpTraj = data.competitor_trajectories.find(
                (t) => t.name === compareName,
              );
              if (!cmp || !subj) return null;
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
                lowerBetter?: boolean;
              };
              const rows: Row[] = [
                {
                  label: "Share of Voice",
                  subject: subj.sov,
                  competitor: cmp.sov,
                  format: (v) =>
                    v === null ? "—" : `${Math.round(v * 100)}%`,
                },
                {
                  label: "Avg. Mention Rank",
                  subject: subj.avg_rank,
                  competitor: cmp.avg_rank,
                  format: (v) => (v === null ? "—" : v.toFixed(1)),
                  lowerBetter: true,
                },
                {
                  label: "First Mention Share",
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
                    description="Side-by-side on the headline visibility metrics for this snapshot."
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
                          <tr className="border-b border-border/60 text-[10.5px] uppercase tracking-[0.06em] text-foreground/65">
                            <th className="py-2.5 pr-3 font-semibold">Metric</th>
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
                            const subjAhead =
                              gap === null
                                ? null
                                : r.lowerBetter
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
                                : r.lowerBetter
                                  ? (gap > 0 ? "+" : "") + gap.toFixed(1)
                                  : `${gap > 0 ? "+" : ""}${Math.round(gap * 100)} pp`;
                            return (
                              <tr
                                key={r.label}
                                className="border-b border-border/30 last:border-0 text-[14px]"
                              >
                                <td className="py-3 pr-3 font-medium text-foreground/85">
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

          {/* ── 1. VISIBILITY BRIEFING ──────────────────────────── */}
          {/* Custom oversized header — this is the executive
              summary and should outweigh the numbered drill-down
              sections below. Inlined instead of SectionTitle so
              the title can carry more weight without changing
              the shared component. */}
          <section>
            <div className="mb-6">
              <h2 className="text-[26px] font-semibold tracking-[-0.015em] text-foreground">
                AI Visibility Briefing
              </h2>
              <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-foreground/75">
                How often this subject appears in AI answers, where
                it ranks, and where visibility is changing.
              </p>
            </div>
            <Card className="p-6 md:p-8">
              {/* Executive summary line — composed from real data. */}
              <p className="text-[15.5px] leading-relaxed text-foreground/90">
                {briefingSummary}
              </p>

              {/* 4 KPI cards. Each has label + tooltip + value +
                  optional subtitle (e.g. the gap topic name) +
                  plain-English helper underneath. */}
              <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {kpis.map((k) => (
                  <div
                    key={k.label}
                    className="flex flex-col rounded-lg border border-border/80 bg-background/60 p-5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[12.5px] font-semibold uppercase tracking-[0.04em] text-foreground/65">
                        {k.label}
                      </span>
                      <KpiTooltipIcon text={k.helper} align="right" />
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                      <span
                        className={`text-[28px] font-semibold leading-none tracking-tight tabular-nums ${k.valueColor}`}
                      >
                        {k.value}
                      </span>
                    </div>
                    {k.subtitle && (
                      <div
                        className="mt-2 line-clamp-2 text-[12.5px] leading-snug text-foreground/70"
                        title={k.subtitle}
                      >
                        {k.subtitle}
                      </div>
                    )}
                    <div className="mt-auto pt-3 space-y-1 text-[11.5px] leading-snug text-muted-foreground">
                      <div>{k.helper}</div>
                      <div className="text-foreground/55">
                        {k.polarity === "higher_better"
                          ? "↑ higher is better"
                          : "↓ lower is better"}
                      </div>
                      {k.benchmark && (
                        <div className="text-foreground/55">
                          {k.benchmark}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Platform Visibility Snapshot — secondary heatmap
                  inside the briefing card. Same matrix data as
                  before but visually de-emphasized: smaller header,
                  more compact cells, no "Build-on/Fix" callout. */}
              {data.platform_topic_matrix.platforms.length > 0 &&
                data.platform_topic_matrix.topics.length > 0 && (
                  <div className="mt-8 border-t border-border/50 pt-6">
                    <div className="mb-3 flex items-baseline justify-between gap-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/55 inline-flex items-center gap-1">
                        Platform Visibility Snapshot
                        <KpiTooltipIcon
                          text="Mention rate for each AI platform on each tracked topic — share of that platform's monitored prompts in this topic area where the subject was mentioned. Darker cells mean stronger coverage."
                          align="left"
                        />
                      </div>
                      <div className="text-[11.5px] text-muted-foreground">
                        Mention rate per platform × topic
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <div
                        className="grid gap-1.5 min-w-fit"
                        style={{
                          gridTemplateColumns: `minmax(72px, auto) repeat(${data.platform_topic_matrix.topics.length}, minmax(56px, 1fr))`,
                        }}
                      >
                        <div />
                        {data.platform_topic_matrix.topics.map((t) => (
                          <div
                            key={t.label}
                            className="line-clamp-2 px-1 text-center text-[10.5px] leading-tight text-foreground/60"
                            title={capitalizeFirst(t.label)}
                          >
                            {capitalizeFirst(t.label)}
                          </div>
                        ))}
                        {data.platform_topic_matrix.platforms.map((p) => (
                          <div
                            key={p.slug}
                            style={{ display: "contents" }}
                          >
                            <div className="self-center pr-2 text-[12px] font-medium text-foreground/80">
                              {p.name}
                            </div>
                            {data.platform_topic_matrix.topics.map((t) => {
                              const cell =
                                data.platform_topic_matrix.cells.find(
                                  (c) =>
                                    c.platform_slug === p.slug &&
                                    c.topic_label === t.label,
                                );
                              const rate = cell?.mention_rate ?? null;
                              const titleLabel = `${p.name} × ${capitalizeFirst(t.label)}: ${
                                rate === null || !cell
                                  ? "no data"
                                  : `${Math.round(rate * 100)}% (${cell.n_mentioned}/${cell.n_responses})`
                              }`;
                              // Apply the rate-based fade to the
                              // background via color-mix alpha, NOT
                              // to the whole element via `opacity`.
                              // Otherwise low-rate cells (like 0%)
                              // also fade their text into the
                              // background and the value reads as
                              // empty. Floor at 25% mix so the 0%
                              // cell still has a visible background
                              // tint and the "0%" text reads cleanly.
                              const bgAlphaPct =
                                rate === null
                                  ? 35
                                  : Math.round(
                                      (0.25 + rate * 0.6) * 100,
                                    );
                              const bgColor =
                                rate === null
                                  ? `color-mix(in oklab, var(--muted) ${bgAlphaPct}%, transparent)`
                                  : `color-mix(in oklab, var(--primary) ${bgAlphaPct}%, transparent)`;
                              return (
                                // Clickable: scrolls to (and
                                // briefly highlights via :target)
                                // the matching row in Platform
                                // Breakdown below. Turns the
                                // heatmap into a navigation
                                // primitive instead of just a
                                // visual.
                                <a
                                  key={t.label}
                                  href={`#platform-${p.slug}`}
                                  className="relative flex h-8 items-center justify-center rounded-sm transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40"
                                  style={{ background: bgColor }}
                                  title={titleLabel}
                                >
                                  <span
                                    className={`text-[10.5px] font-semibold tabular-nums ${
                                      rate !== null && rate > 0.55
                                        ? "text-background"
                                        : "text-foreground"
                                    }`}
                                  >
                                    {rate === null
                                      ? "—"
                                      : `${Math.round(rate * 100)}%`}
                                  </span>
                                </a>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
            </Card>
          </section>

          {/* ── PHASE 1 HEADER ───────────────────────────────────── */}
          {/* Chapter divider — sections 01-04 answer "where do
              we stand right now." */}
          <div className="flex items-center gap-4">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-foreground/55">
              Where you stand now
            </div>
            <div className="h-px flex-1 bg-border/70" />
          </div>

          {/* ── 2. VISIBILITY TREND ─────────────────────────────── */}
          <section id="trend" className="scroll-mt-20">
            <SectionTitle
              eyebrow="01 · Trend"
              title="Visibility Trend"
              description="How often this subject appeared across recent AI monitoring snapshots."
              className="mb-5"
            />
            <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
              <Card className="p-5 md:p-6">
                <TrendOverTime
                  subjectName={data.subject_name}
                  trajectoryWeeks={data.trajectory.weeks}
                  subjectValues={data.trajectory.ai_recall}
                  overlays={trendOverlays}
                />
              </Card>
              <Card className="p-5 md:p-6 bg-card/60">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/55">
                  What changed
                </div>
                {(() => {
                  // Both prose and date labels derive from the same
                  // trajectory endpoints — keeps the card's "what
                  // moved" story consistent with the chart endpoints
                  // the user is looking at right above.
                  const result = composeWhatChanged({
                    trajectoryWeeks: data.trajectory.weeks,
                    aiRecall: data.trajectory.ai_recall,
                    topicTrajectories: data.topic_trajectories,
                    competitorTrajectories: data.competitor_trajectories,
                  });
                  const fmt = (iso: string | null): string | null => {
                    if (!iso) return null;
                    const d = new Date(iso);
                    return Number.isNaN(d.getTime())
                      ? null
                      : d.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        });
                  };
                  const latestStr = fmt(result.latestDate);
                  const priorStr = fmt(result.priorDate);
                  return (
                    <>
                      <p className="mt-3 text-[13.5px] leading-relaxed text-foreground/85">
                        {result.copy}
                      </p>
                      {(latestStr || priorStr) && (
                        <div className="mt-3 text-[11.5px] text-muted-foreground">
                          {latestStr && priorStr
                            ? `Latest snapshot (${latestStr}) vs prior (${priorStr}).`
                            : latestStr
                              ? `Latest snapshot: ${latestStr}.`
                              : `Prior snapshot: ${priorStr}.`}
                        </div>
                      )}
                    </>
                  );
                })()}
              </Card>
            </div>
          </section>

          {/* ── 3. PLATFORM BREAKDOWN ───────────────────────────── */}
          <section id="platforms" className="scroll-mt-20">
            <SectionTitle
              eyebrow="02 · Platforms"
              title="Platform Breakdown"
              description="How each AI platform surfaces this subject."
              className="mb-5"
            />
            <Card className="p-5 md:p-6">
              {(() => {
                // Filter out platforms with no responses entirely so
                // the table doesn't show misleading N/A rows. Names
                // missing from per_platform_kpis but expected
                // industry-wide go to the footnote below.
                const platforms = data.per_platform_kpis.filter(
                  (p) => p.n_responses > 0,
                );
                const EXPECTED = [
                  "ChatGPT",
                  "Claude",
                  "Gemini",
                  "Perplexity",
                ];
                const present = new Set(platforms.map((p) => p.name));
                const notIncluded = EXPECTED.filter((n) => !present.has(n));
                if (platforms.length === 0) {
                  return (
                    <div className="text-[13.5px] text-muted-foreground">
                      No platform responses in this snapshot.
                    </div>
                  );
                }
                return (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-border/60 text-[10.5px] uppercase tracking-[0.06em] text-foreground/65">
                            <th className="py-2.5 pr-3 font-semibold">
                              Platform
                            </th>
                            <th className="py-2.5 px-3 text-right font-semibold">
                              <span className="inline-flex items-center justify-end gap-1">
                                Mention Rate
                                <KpiTooltipIcon
                                  text="Share of this platform's monitored prompts where the subject was mentioned."
                                  align="right"
                                />
                              </span>
                            </th>
                            <th className="py-2.5 px-3 text-right font-semibold">
                              <span className="inline-flex items-center justify-end gap-1">
                                Avg. Rank
                                <KpiTooltipIcon
                                  text="Average position when the subject was mentioned. Lower is better; 1.0 means always first."
                                  align="right"
                                />
                              </span>
                            </th>
                            <th className="py-2.5 px-3 text-right font-semibold">
                              <span className="inline-flex items-center justify-end gap-1">
                                First Mention Share
                                <KpiTooltipIcon
                                  text="Share of this platform's answers where the subject was the first-named entity. Pole-position visibility — being mentioned at all is one thing; being listed first is another."
                                  align="right"
                                />
                              </span>
                            </th>
                            <th className="py-2.5 px-3 text-right font-semibold">
                              <span className="inline-flex items-center justify-end gap-1">
                                Change
                                <KpiTooltipIcon
                                  text="Mention-rate change from the prior snapshot, in percentage points. Positive (green) = up from last snapshot; negative (amber) = down. Renders an em-dash when there is no prior snapshot to compare against."
                                  align="right"
                                />
                              </span>
                            </th>
                            <th className="py-2.5 pl-3 text-right font-semibold">
                              <span className="inline-flex items-center justify-end gap-1">
                                Status
                                <KpiTooltipIcon
                                  text="At-a-glance verdict combining mention rate and rank: Strong = mention rate ≥60% AND avg rank ≤3; Visibility Gap = mention rate <30%; Mixed = anything in between; Limited Data = platform has no measured responses in this snapshot."
                                  align="right"
                                />
                              </span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {platforms.map((p) => {
                            const matchingRecall = data.platform_recall.find(
                              (pr) => pr.name === p.name,
                            );
                            const change = matchingRecall?.delta ?? null;
                            const status = platformStatus(p);
                            return (
                              <tr
                                key={p.slug}
                                id={`platform-${p.slug}`}
                                // `:target` highlight kicks in when
                                // the heatmap cell in the briefing
                                // links here via #platform-<slug>.
                                className="border-b border-border/30 last:border-0 text-[14px] target:bg-primary/[0.06] target:outline target:outline-1 target:outline-primary/30"
                              >
                                <td className="py-3 pr-3 font-medium text-foreground">
                                  {p.name}
                                </td>
                                <td className="py-3 px-3 text-right tabular-nums text-foreground/90">
                                  {formatPct(p.mention_rate)}
                                </td>
                                <td className="py-3 px-3 text-right tabular-nums text-foreground/90">
                                  {formatRank(p.avg_rank)}
                                </td>
                                <td className="py-3 px-3 text-right tabular-nums text-foreground/90">
                                  {formatPct(p.first_mention_rate)}
                                </td>
                                <td
                                  className={`py-3 px-3 text-right tabular-nums ${deltaToneClass(change)}`}
                                >
                                  {change === null
                                    ? "—"
                                    : formatSignedPpRaw(change)}
                                </td>
                                <td className="py-3 pl-3 text-right">
                                  <Pill tone={status.tone}>
                                    {status.label}
                                  </Pill>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {notIncluded.length > 0 && (
                      <div className="mt-4 text-[11.5px] text-muted-foreground">
                        {notIncluded.join(" and ")} {notIncluded.length === 1 ? "was" : "were"} not included in this snapshot.
                      </div>
                    )}
                  </>
                );
              })()}
            </Card>
          </section>

          {/* ── 4. TOPIC VISIBILITY ─────────────────────────────── */}
          <section id="topics" className="scroll-mt-20">
            <SectionTitle
              eyebrow="03 · Topics"
              title="Topic Visibility"
              description="Where this subject is consistently surfaced — and where AI coverage is weaker."
              className="mb-5"
            />
            <div className="grid gap-5 lg:grid-cols-3">
              {/* Highest Visibility */}
              <Card className="p-5 md:p-6">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-success">
                  Highest Visibility
                </div>
                <h3 className="mt-1 text-[15px] font-semibold text-foreground">
                  Top topics by mention rate
                </h3>
                <ul className="mt-4 space-y-3">
                  {highestTopics.length === 0 ? (
                    <li className="text-[13px] text-muted-foreground">
                      No measured topic coverage in this snapshot.
                    </li>
                  ) : (
                    highestTopics.map((t) => (
                      <li key={t.label}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-[13.5px] font-medium text-foreground">
                            {capitalizeFirst(t.label)}
                          </span>
                          <span className="shrink-0 text-[14px] font-semibold tabular-nums text-foreground">
                            {formatPct(t.ai_recall)}
                          </span>
                        </div>
                        <div className="relative mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/80">
                          <div
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{
                              width: `${(t.ai_recall ?? 0) * 100}%`,
                              background: "var(--success)",
                              opacity: 0.55,
                            }}
                          />
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </Card>

              {/* Visibility Gaps */}
              <Card className="p-5 md:p-6">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-warning">
                  Visibility Gaps
                </div>
                <h3 className="mt-1 text-[15px] font-semibold text-foreground">
                  Where AI coverage is weakest
                </h3>
                <ul className="mt-4 space-y-3">
                  {gapTopics.length === 0 ? (
                    <li className="text-[13px] text-muted-foreground">
                      No clear gaps — coverage is even across topics.
                    </li>
                  ) : (
                    gapTopics.map((t) => (
                      <li key={t.label}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-[13.5px] font-medium text-foreground">
                            {capitalizeFirst(t.label)}
                          </span>
                          <span className="shrink-0 text-[14px] font-semibold tabular-nums text-foreground">
                            {formatPct(t.ai_recall)}
                          </span>
                        </div>
                        <div className="relative mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/80">
                          <div
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{
                              width: `${(t.ai_recall ?? 0) * 100}%`,
                              background: "var(--warning)",
                              opacity: 0.55,
                            }}
                          />
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </Card>

              {/* Biggest Movement */}
              <Card className="p-5 md:p-6">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/60">
                  Biggest Movement
                </div>
                <h3 className="mt-1 text-[15px] font-semibold text-foreground">
                  Largest recent shift
                </h3>
                {biggestMover ? (
                  <div className="mt-4">
                    <div className="text-[14px] font-medium text-foreground">
                      {capitalizeFirst(biggestMover.label)}
                    </div>
                    <div
                      className={`mt-2 text-[28px] font-semibold leading-none tracking-tight tabular-nums ${deltaToneClass(biggestMover.delta)}`}
                    >
                      {formatSignedPp(biggestMover.delta)}
                    </div>
                    <div className="mt-2 text-[12px] text-muted-foreground tabular-nums">
                      {Math.round(biggestMover.oldest * 100)}% →{" "}
                      {Math.round(biggestMover.newest * 100)}%
                    </div>
                    <div className="mt-3 text-[11.5px] text-muted-foreground">
                      Oldest measured snapshot vs latest.
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 text-[13px] text-muted-foreground">
                    Not enough history yet to measure topic movement.
                  </div>
                )}
              </Card>
            </div>
          </section>

          {/* ── 5. ANSWER POSITION ──────────────────────────────── */}
          <section id="position" className="scroll-mt-20">
            <SectionTitle
              eyebrow="04 · Position"
              title="Answer Position"
              description="When this subject is mentioned, how prominently it appears in the AI answer."
              className="mb-5"
              right={
                <TopicPositionFilter
                  topics={data.topic_leaderboard.map((t) => ({
                    label: t.topic_label,
                  }))}
                />
              }
            />
            <Card className="p-5 md:p-6">
              {(() => {
                // Pick the rank-distribution source based on the
                // dropdown selection. Default ("All topics") uses the
                // existing aggregate rank_distribution; selecting a
                // specific topic swaps in that topic's
                // subject_rank_buckets. Same shape, identical render
                // downstream.
                const scopedTopic = positionTopic
                  ? data.topic_leaderboard.find(
                      (t) => t.topic_label === positionTopic,
                    )
                  : null;
                const rankDist = scopedTopic
                  ? scopedTopic.subject_rank_buckets
                  : data.rank_distribution;
                // Avg rank: use the topic's per-entity avg_rank from
                // the entities array when scoped; fall back to the
                // headline focal.avg_rank otherwise.
                const scopedSubjectEntity = scopedTopic
                  ? scopedTopic.entities.find((e) => e.is_subject)
                  : null;
                const avgRank = scopedTopic
                  ? (scopedSubjectEntity?.avg_rank ?? null)
                  : (focal?.avg_rank ?? null);
                return (
              <div className="grid gap-6 lg:grid-cols-[280px_1fr] lg:items-center">
                {/* Takeaway + avg-rank callout */}
                <div>
                  {scopedTopic && (
                    <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-primary/80">
                      {capitalizeFirst(scopedTopic.topic_label)}
                    </div>
                  )}
                  <p className="text-[14px] leading-relaxed text-foreground/85">
                    {composeAnswerPositionTakeaway(
                      rankDist,
                      data.subject_name,
                    )}
                  </p>
                  <div className="mt-5 flex items-baseline gap-3">
                    <div className="text-[32px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
                      {formatRank(avgRank)}
                    </div>
                    <div className="text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">
                      Avg. mention rank
                    </div>
                  </div>
                  <div className="mt-1 text-[12px] text-muted-foreground tabular-nums">
                    {rankDist.n_mentioned} of{" "}
                    {rankDist.total_responses} responses
                    mentioned {data.subject_name}
                    {scopedTopic ? " on this topic" : ""}.
                  </div>
                </div>

                {/* 5-bucket horizontal bars. Each bucket's width is
                    its share of total responses (so all bars sum to
                    100%). "Not mentioned" gets a muted warning tone
                    so the gap reads as a distinct category, not
                    just an empty bucket. */}
                <ul className="space-y-3">
                  {rankDist.buckets.map((b) => {
                    const pct = Math.round(b.share * 100);
                    const tone = b.is_absence
                      ? { bg: "var(--warning)", op: 0.45 }
                      : { bg: "var(--primary)", op: 0.65 };
                    return (
                      <li
                        key={b.label}
                        className="grid grid-cols-[120px_1fr_56px] items-center gap-4"
                      >
                        <span className="text-[13px] font-medium text-foreground/80">
                          {b.label}
                        </span>
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/70">
                          <div
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{
                              width: `${b.share * 100}%`,
                              background: tone.bg,
                              opacity: tone.op,
                            }}
                          />
                        </div>
                        <span className="text-right text-[13px] font-semibold tabular-nums text-foreground">
                          {pct}%
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
                );
              })()}
            </Card>
          </section>

          {/* ── PHASE 2 HEADER ───────────────────────────────────── */}
          {/* Chapter divider — section 05 answers "who else is in
              the picture and how do we stack up." The previous
              `-mb-4 pt-2` pull was overlapping the next section's
              SectionTitle eyebrow at this width. Removed both;
              space-y-16 on <main> handles the gap naturally. */}
          <div className="flex items-center gap-4">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-foreground/55">
              The competitive landscape
            </div>
            <div className="h-px flex-1 bg-border/70" />
          </div>

          {/* ── 6. COMPETITIVE VISIBILITY ───────────────────────── */}
          {data.competitive.length > 0 && (
            <section id="competitive" className="scroll-mt-20">
              <SectionTitle
                eyebrow="05 · Competitive"
                title="Competitive Visibility"
                description={`Who gets mentioned alongside ${data.subject_name} — and who competes for attention.`}
                className="mb-5"
              />
              {competitiveSummary && (
                <p className="mb-5 max-w-3xl text-[14px] leading-relaxed text-foreground/85">
                  {competitiveSummary}
                </p>
              )}

              {/* Tab strip — Overview (default) shows SoV bars +
                  scatter + Prominence. Co-Mentions tab shows the
                  bar list. Ownership tab shows the entities ×
                  platforms heatmap. Topic Battleground is NOT a
                  tab here — it remains its own section below. */}
              <div className="mb-5">
                <CompetitiveTabs active={competitiveTab} />
              </div>

              {competitiveTab === "overview" && (
                <>
              <div className="grid gap-5 lg:grid-cols-2">
                {/* Top-left panel: Share of Voice bars */}
                <Card className="p-5 md:p-6">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/55">
                    Share of Voice
                  </div>
                  <h3 className="mb-4 text-[15px] font-semibold text-foreground">
                    Who AI surfaces most often
                  </h3>
                  <CompetitorBarsFromData
                    data={data.competitive.map((c) => ({
                      name: c.name,
                      sov: c.sov,
                      is_subject: c.is_subject,
                    }))}
                  />
                </Card>

                {/* Top-right panel: Position vs Share scatter.
                    Pairs with the SoV bars on the left — bars
                    answer "who shows up most," scatter answers
                    "who shows up *first* AND most." Top-left
                    quadrant = winners (low rank, high share). */}
                <Card className="p-5 md:p-6">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/55">
                    Position vs Share
                  </div>
                  <h3 className="mb-4 text-[15px] font-semibold text-foreground">
                    Where each entity sits in the landscape
                  </h3>
                  <CompetitiveScatter
                    entities={data.competitive.map((c) => ({
                      name: c.name,
                      sov: c.sov,
                      avg_rank: c.avg_rank,
                      is_subject: c.is_subject,
                    }))}
                  />
                </Card>
              </div>

              {/* Full-width Prominence table below the chart pair.
                  Adds a composite Competitive Index column
                  combining SoV, first-mention share, and rank
                  into a single 0-100 score so the table can be
                  scanned by overall position rather than picking
                  among three columns. Score is equal-weighted
                  across the three normalized inputs. */}
              <Card className="mt-5 p-5 md:p-6">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/55">
                      Prominence
                    </div>
                    <h3 className="mt-1 text-[15px] font-semibold text-foreground">
                      Position and first-mention performance
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    {/* Topic-scope dropdown — pushes the chosen
                        topic into ?prominence_topic=… so the page
                        can recompute the table against that topic's
                        response subset on next render. Default is
                        "All topics" (cross-topic aggregation, the
                        prior behavior). */}
                    <TopicProminenceFilter
                      topics={data.topic_leaderboard.map((t) => ({
                        label: t.topic_label,
                      }))}
                    />
                    <span className="text-[11.5px] text-muted-foreground">
                      Sorted by Competitive Index
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  {(() => {
                    // Composite index — equal-weighted blend of
                    // SoV + first-mention + rank-position (rank 1 =
                    // 1.0, rank 10+ = 0). Same formula whether the
                    // table is in cross-topic or topic-scoped mode.
                    const indexFor = (e: {
                      sov: number;
                      avg_rank: number | null;
                      first_mention_rate: number;
                    }): number => {
                      const sov = e.sov;
                      const fm = e.first_mention_rate;
                      const rankScore =
                        e.avg_rank === null || !Number.isFinite(e.avg_rank)
                          ? 0
                          : Math.max(
                              0,
                              1 - (Math.max(1, e.avg_rank) - 1) / 9,
                            );
                      return Math.round(((sov + fm + rankScore) / 3) * 100);
                    };
                    // When a topic filter is active, pull per-topic
                    // entities from topic_leaderboard; otherwise use
                    // the cross-topic competitive snapshot. Shape is
                    // unified so the table render logic doesn't care
                    // which source it's looking at.
                    const scopedTopic = prominenceTopic
                      ? data.topic_leaderboard.find(
                          (t) => t.topic_label === prominenceTopic,
                        )
                      : null;
                    const baseRows = scopedTopic
                      ? scopedTopic.entities.map((e) => ({
                          name: e.name,
                          sov: e.sov,
                          avg_rank: e.avg_rank,
                          first_mention_rate: e.first_mention_rate,
                          is_subject: e.is_subject,
                        }))
                      : data.competitive.map((c) => ({
                          name: c.name,
                          sov: c.sov,
                          avg_rank: c.avg_rank,
                          first_mention_rate: c.first_mention_rate,
                          is_subject: c.is_subject,
                        }));
                    const rows = baseRows
                      .map((c) => ({ ...c, score: indexFor(c) }))
                      .sort((a, b) => b.score - a.score);
                    return (
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-border/60 text-[10px] uppercase tracking-[0.06em] text-foreground/65">
                            <th className="py-2 pr-3 font-semibold">
                              <span className="inline-flex items-center gap-1">
                                Entity
                                <KpiTooltipIcon
                                  text="The subject (highlighted with a You pill) plus the top competitor entities AI surfaced alongside them in this snapshot. Names come from the competitors_mentioned extraction; name variants are not deduped."
                                  align="left"
                                />
                              </span>
                            </th>
                            <th className="py-2 px-2 text-right font-semibold">
                              <span className="inline-flex items-center justify-end gap-1">
                                Score
                                <KpiTooltipIcon
                                  text="Competitive Index — composite 0–100 score combining Share of Voice, First Mention Share, and a rank-position score (rank 1 = 1.0, rank 10+ = 0). Equal weights across the three inputs."
                                  align="right"
                                />
                              </span>
                            </th>
                            <th className="py-2 px-2 text-right font-semibold">
                              <span className="inline-flex items-center justify-end gap-1">
                                Share
                                <KpiTooltipIcon
                                  text="Share of Voice — fraction of unnamed-layer responses where this entity appeared. Same definition for every row, so each entity's value is comparable to every other."
                                  align="right"
                                />
                              </span>
                            </th>
                            <th className="py-2 px-2 text-right font-semibold">
                              <span className="inline-flex items-center justify-end gap-1">
                                Avg. Rank
                                <KpiTooltipIcon
                                  text="Average position when this entity was mentioned. Lower is better; 1.0 means always listed first. Renders an em-dash when the entity was never measured at a known rank in this snapshot."
                                  align="right"
                                />
                              </span>
                            </th>
                            <th className="py-2 pl-2 text-right font-semibold">
                              <span className="inline-flex items-center justify-end gap-1">
                                First Mention
                                <KpiTooltipIcon
                                  text="Share of responses where this entity was AI's first-named entity (rank #1). Pole-position visibility — different from Share, which counts any mention regardless of rank."
                                  align="right"
                                />
                              </span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((c) => (
                            <tr
                              key={c.name}
                              className={`border-b border-border/30 last:border-0 text-[13.5px] ${c.is_subject ? "bg-primary/[0.04]" : ""}`}
                            >
                              <td className="py-2.5 pr-3 font-medium text-foreground">
                                <span className="inline-flex items-center gap-2">
                                  {c.name}
                                  {c.is_subject && (
                                    <Pill tone="primary">You</Pill>
                                  )}
                                </span>
                              </td>
                              <td className="py-2.5 px-2 text-right tabular-nums font-semibold text-foreground">
                                {c.score}
                              </td>
                              <td className="py-2.5 px-2 text-right tabular-nums text-foreground/85">
                                {Math.round(c.sov * 100)}%
                              </td>
                              <td className="py-2.5 px-2 text-right tabular-nums text-foreground/85">
                                {c.avg_rank !== null
                                  ? c.avg_rank.toFixed(1)
                                  : "—"}
                              </td>
                              <td className="py-2.5 pl-2 text-right tabular-nums text-foreground/85">
                                {Math.round(c.first_mention_rate * 100)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </Card>
                </>
              )}

              {/* Co-Mentions tab — "When AI mentions the subject,
                  who shares the answer?" Denominator is subject-
                  mention responses, not all responses — distinct
                  from SoV. */}
              {competitiveTab === "co-mentions" &&
                (data.co_mention_frequency.subject_mention_count > 0 &&
                data.co_mention_frequency.co_mentions.length > 0 ? (
                  <Card className="p-5 md:p-6">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/55">
                      Co-Mentions
                    </div>
                    <h3 className="mb-1 text-[15px] font-semibold text-foreground">
                      Who AI surfaces alongside {data.subject_name}
                    </h3>
                    <p className="mb-5 max-w-3xl text-[13px] leading-relaxed text-foreground/70">
                      Across{" "}
                      {data.co_mention_frequency.subject_mention_count}{" "}
                      responses naming {data.subject_name}, here are
                      the entities AI most often pairs them with.
                    </p>
                    <ul className="space-y-3">
                      {data.co_mention_frequency.co_mentions.map(
                        (row, i) => {
                          const opacity = Math.max(0.3, 0.85 - i * 0.07);
                          const sharePct = Math.round(row.share * 100);
                          return (
                            <li
                              key={row.name}
                              className="grid grid-cols-[180px_1fr_72px] items-center gap-4"
                            >
                              <span className="truncate text-[13.5px] font-medium text-foreground">
                                {row.name}
                              </span>
                              <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/70">
                                <div
                                  className="absolute inset-y-0 left-0 rounded-full"
                                  style={{
                                    width: `${row.share * 100}%`,
                                    background: "var(--primary)",
                                    opacity,
                                  }}
                                />
                              </div>
                              <span className="text-right text-[13px] tabular-nums text-foreground/85">
                                <span className="font-semibold text-foreground">
                                  {row.count}
                                </span>
                                <span className="text-foreground/55">
                                  {" "}
                                  · {sharePct}%
                                </span>
                              </span>
                            </li>
                          );
                        },
                      )}
                    </ul>
                    <div className="mt-4 text-[11.5px] text-muted-foreground">
                      Share = co-mentions ÷{" "}
                      {data.co_mention_frequency.subject_mention_count}{" "}
                      subject-mention responses. Higher = AI frequently
                      pairs them with the subject in the same answer.
                    </div>
                  </Card>
                ) : (
                  <Card className="p-5 md:p-6 text-[13px] text-muted-foreground">
                    Not enough subject-mention responses in this
                    snapshot to compute co-mentions.
                  </Card>
                ))}

              {/* Ownership tab — entities × platforms heatmap.
                  Reveals platform-specific dominance the SoV bars
                  in Overview can't show. */}
              {competitiveTab === "ownership" &&
                (data.per_platform_entity_sov.entities.length > 0 &&
                data.per_platform_entity_sov.platforms.length > 0 ? (
                  <Card className="p-5 md:p-6">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/55">
                      Platform Ownership
                    </div>
                    <h3 className="mb-5 text-[15px] font-semibold text-foreground">
                      Who dominates each AI platform
                    </h3>
                    <div className="overflow-x-auto">
                      <div
                        className="grid gap-1.5 min-w-fit"
                        style={{
                          gridTemplateColumns: `minmax(160px, auto) repeat(${data.per_platform_entity_sov.platforms.length}, minmax(72px, 1fr))`,
                        }}
                      >
                        <div />
                        {data.per_platform_entity_sov.platforms.map((p) => (
                          <div
                            key={p.slug}
                            className="px-1 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground/65"
                          >
                            {p.name}
                          </div>
                        ))}
                        {data.per_platform_entity_sov.entities.map((e) => (
                          <div key={e.name} style={{ display: "contents" }}>
                            <div
                              className={`self-center pr-2 text-[13px] ${
                                e.is_subject
                                  ? "font-semibold text-foreground"
                                  : "text-foreground/80"
                              }`}
                            >
                              <span className="inline-flex items-center gap-2">
                                {e.name}
                                {e.is_subject && (
                                  <Pill tone="primary">You</Pill>
                                )}
                              </span>
                            </div>
                            {data.per_platform_entity_sov.platforms.map(
                              (p) => {
                                const cell =
                                  data.per_platform_entity_sov.cells.find(
                                    (c) =>
                                      c.platform_slug === p.slug &&
                                      c.entity_name === e.name,
                                  );
                                const sov = cell?.sov ?? 0;
                                const bgAlphaPct = Math.round(
                                  (0.2 + sov * 0.65) * 100,
                                );
                                const titleLabel = `${p.name} × ${e.name}: ${Math.round(sov * 100)}% (${cell?.n_appearances ?? 0}/${p.n_responses})`;
                                return (
                                  <div
                                    key={p.slug}
                                    className={`relative flex h-9 items-center justify-center rounded-sm ${
                                      e.is_subject
                                        ? "ring-1 ring-primary/30"
                                        : ""
                                    }`}
                                    style={{
                                      background: `color-mix(in oklab, var(--primary) ${bgAlphaPct}%, transparent)`,
                                    }}
                                    title={titleLabel}
                                  >
                                    <span
                                      className={`text-[11px] font-semibold tabular-nums ${
                                        sov > 0.55
                                          ? "text-background"
                                          : "text-foreground"
                                      }`}
                                    >
                                      {Math.round(sov * 100)}%
                                    </span>
                                  </div>
                                );
                              },
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-4 text-[11.5px] text-muted-foreground">
                      Top entities by total appearances; the subject is
                      always included. SoV = entity&apos;s appearances on
                      that platform ÷ platform&apos;s total unnamed-
                      layer responses.
                    </div>
                  </Card>
                ) : (
                  <Card className="p-5 md:p-6 text-[13px] text-muted-foreground">
                    Not enough cross-platform data in this snapshot to
                    compute ownership.
                  </Card>
                ))}
            </section>
          )}


        </main>
      </div>
    </div>
  );
}
