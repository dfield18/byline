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
import { AlertTriangle, Info } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { Card, SectionTitle, Pill } from "@/components/dashboard/ui";
import { BottomLineBlock } from "@/components/dashboard/BottomLineBlock";
import { KpiVitalsTile } from "@/components/dashboard/KpiVitalsTile";
import { getKpiValueColor } from "@/lib/kpiThresholds";
import { TrendOverTime } from "./TrendOverTime";
import { OverviewSubNav } from "../OverviewSubNav";
import { VisibilityTopicFilter } from "./VisibilityTopicFilter";
import { VisibilityPlatformFilter } from "./VisibilityPlatformFilter";
import { TrendWindowToggle } from "./TrendWindowToggle";
import {
  getSubject,
  getSubjectOverview,
  listSubjects,
  type Subject,
  type SubjectOverview,
  type SubjectDetail,
} from "@/lib/api";
import { RefreshButton } from "../refresh-button";
import type { IconType } from "react-icons";
import {
  SiOpenai,
  SiAnthropic,
  SiGooglegemini,
  SiPerplexity,
} from "react-icons/si";

// Brand-mark icons via react-icons/si — same set the Overview
// spoke's Evidence cards and the landing page's "Platforms
// monitored" strip use. Render with currentColor so platform
// names anywhere on the Visibility spoke pick up the same
// muted-foreground treatment instead of branded color noise.
const PLATFORM_ICON: Record<string, IconType> = {
  chatgpt: SiOpenai,
  gemini: SiGooglegemini,
  claude: SiAnthropic,
  perplexity: SiPerplexity,
};

export const dynamic = "force-dynamic";

// ── Helpers ────────────────────────────────────────────────────────

function KpiTooltipIcon({
  text,
  align = "center",
  direction = "above",
}: {
  text: string;
  align?: "left" | "center" | "right";
  // "above" tooltips get clipped when the icon lives inside a
  // container with `overflow-x-auto` (CSS spec: a non-visible
  // overflow axis forces the other axis to also clip). Pass
  // direction="below" for tooltips on table column headers inside
  // horizontally-scrollable wrappers — the tooltip extends down
  // into the table body where there's no overflow conflict.
  direction?: "above" | "below";
}) {
  const pos =
    align === "right"
      ? "right-0"
      : align === "left"
        ? "left-0"
        : "left-1/2 -translate-x-1/2";
  const vert =
    direction === "below" ? "top-full mt-2" : "bottom-full mb-2";
  // Trigger is a focusable `<span>` (not a `<button>`) because some
  // tiles wrap their whole body in an `<a>` for click-through, and
  // HTML forbids interactive content (buttons) nested inside anchors.
  // `tabIndex={0}` + `role="button"` keeps the trigger keyboard-
  // reachable; the tooltip reveals via CSS `focus-visible` on focus
  // or `hover` on mouse, no JS click handler needed.
  // `aria-label` duplicates the tooltip text so a screen reader
  // announces the content when the trigger gains focus.
  return (
    <span
      tabIndex={0}
      role="button"
      aria-label={text}
      className="group relative inline-flex rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <Info className="h-3.5 w-3.5 opacity-70 hover:opacity-100 group-focus-visible:opacity-100 transition-opacity cursor-help text-foreground/65" />
      <span
        role="tooltip"
        className={`pointer-events-none absolute ${pos} ${vert} w-60 rounded-md border border-border bg-popover px-3 py-2 text-[11.5px] leading-snug text-popover-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity z-30 shadow-lg`}
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

// Threshold (in average mention position) at or above which a row
// is flagged as "poor". Picks 5.0 — past the first answer-list
// fold for most LLM responses — so genuinely weak placements pop
// without flagging mid-pack ranks like 3.x or 4.x.
const POOR_POSITION_THRESHOLD = 5.0;
function isPoorPosition(v: number | null | undefined): boolean {
  return (
    v !== null && v !== undefined && Number.isFinite(v) && v >= POOR_POSITION_THRESHOLD
  );
}

function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// For values that are ALREADY in pts units (e.g. backend KpiValue.delta
// where _kpi_with_trend has already multiplied by 100). Just round
// and append "pp" — no scale change. The earlier 0..1-share variant
// (`formatSignedPp`) was removed when the Largest Movement card was
// folded into the Topic Visibility table; every remaining caller
// hands deltas in pts units already.
// Returns a signed "±N pts" string (or "0 pts"). Unit changed from
// "pp" → "pts" to match Overview's delta formatter and the
// Competitive Position stat stack, so every delta on every spoke
// reads in the same unit.
function formatSignedPpRaw(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const pts = Math.round(v);
  if (pts === 0) return "0 pts";
  return `${pts > 0 ? "+" : ""}${pts} pts`;
}

function deltaToneClass(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0) return "text-muted-foreground";
  return v > 0 ? "text-success" : "text-warning";
}

// Status pill semantics for Platform Breakdown. Order matters — the
// first matching rule wins.
// Pill semantics = CURRENT LEVEL only (Option A). Trend/decline is
// NOT an input — the Change column carries that signal. A
// high-mention-rate platform that just dropped 20 pts still reads
// as "Strong" with the Change column showing the −20. This keeps
// the pill encoding exactly one dimension (level), and avoids
// muddling level + direction into a single signal that contradicts
// either column.
//
// Thresholds lifted to named constants so they're tunable in one
// place across both the Platforms and Topics tables (both consume
// platformStatus). The "Mixed" label was renamed to "Moderate" —
// "Mixed" reads as a trend word ("mixed signals"), inappropriate
// for a purely-level judgment.
const STATUS_STRONG_MENTION_RATE = 0.6;
const STATUS_STRONG_AVG_RANK_MAX = 3;
const STATUS_WEAK_MENTION_RATE = 0.3;

// Per-cell tier for the Current Platform Snapshot heatmap. The
// thresholds are the SAME constants that drive the Platforms /
// Topics row pills (above) so a "gap" cell in the heatmap means
// the same thing as a "Weak" status pill in the tables — readers
// don't have to re-learn the tier system per section. Color
// treatment encodes the tier: warning amber for gaps so the
// exception cell carries the visual weight, calm low-alpha primary
// tint for healthy cells so the uniform 100% blocks recede into
// the background instead of dominating the section.
type HeatTier = "gap" | "mid" | "healthy" | "none";
function heatTier(rate: number | null): HeatTier {
  if (rate === null || !Number.isFinite(rate)) return "none";
  if (rate < STATUS_WEAK_MENTION_RATE) return "gap";
  if (rate >= STATUS_STRONG_MENTION_RATE) return "healthy";
  return "mid";
}
function heatTierStyle(tier: HeatTier): {
  background: string;
  border: string;
  textClass: string;
} {
  switch (tier) {
    case "gap":
      return {
        background: "color-mix(in oklab, var(--warning) 22%, transparent)",
        border: "1px solid color-mix(in oklab, var(--warning) 55%, transparent)",
        textClass: "text-warning font-bold",
      };
    case "mid":
      return {
        background: "color-mix(in oklab, var(--muted) 65%, transparent)",
        border: "1px solid transparent",
        textClass: "text-foreground/85 font-semibold",
      };
    case "healthy":
      return {
        background: "color-mix(in oklab, var(--primary) 10%, transparent)",
        border: "1px solid transparent",
        textClass: "text-foreground/55 font-medium",
      };
    case "none":
      return {
        background: "color-mix(in oklab, var(--muted) 35%, transparent)",
        border:
          "1px dashed color-mix(in oklab, var(--muted-foreground) 30%, transparent)",
        textClass: "text-muted-foreground",
      };
  }
}
function platformStatus(row: {
  mention_rate: number | null;
  avg_rank: number | null;
  n_responses: number;
}): { label: string; tone: "success" | "warning" | "primary" | "neutral" } {
  if (row.n_responses === 0 || row.mention_rate === null) {
    return { label: "Limited Data", tone: "neutral" };
  }
  if (
    row.mention_rate >= STATUS_STRONG_MENTION_RATE &&
    (row.avg_rank ?? 999) <= STATUS_STRONG_AVG_RANK_MAX
  ) {
    return { label: "Strong", tone: "success" };
  }
  if (row.mention_rate < STATUS_WEAK_MENTION_RATE) {
    return { label: "Weak", tone: "warning" };
  }
  return { label: "Moderate", tone: "primary" };
}

// Compose the Visibility Briefing's natural-language summary from
// real data — visibility level + the platforms it's strongest on +
// strongest/weakest topic. Falls back gracefully when any input is
// missing.
// Executive briefing line for Visibility Performance — short,
// public-affairs voice. Two beats: overall mention rate + the
// largest topic-level weakness. Falls back gracefully when any
// input is missing.
function composeBriefingSummary({
  subjectName,
  mentionRate,
  avgRank,
  weakestTopic,
}: {
  subjectName: string;
  mentionRate: number | null;
  avgRank: number | null;
  weakestTopic: { label: string } | null;
}): string {
  if (mentionRate === null) {
    return `Visibility is being tracked for ${subjectName}.`;
  }
  const mentionPct = Math.round(mentionRate * 100);
  // Lead sentence states mention rate + avg position when both are
  // available; drops the position clause cleanly when avg_rank is
  // missing so the sentence still reads.
  const positionClause =
    avgRank !== null && Number.isFinite(avgRank)
      ? `, with an average mention position of ${avgRank.toFixed(1)}`
      : "";
  const lead = `${subjectName} appears in ${mentionPct}% of tracked AI answers${positionClause}.`;
  const weak = weakestTopic
    ? ` The largest topic-level weakness is ${weakestTopic.label.toLowerCase()}.`
    : "";
  return lead + weak;
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

// "What changed" returns a list of structured deltas + endpoint
// dates, so the sidebar can render multiple ranked rows (overall
// mention rate + top topic movers) instead of one cramped sentence.
// Competitors are intentionally absent: cross-subject movement now
// lives on the /competition spoke, so surfacing it here would muddy
// the IA between the two pages.
type WhatChangedDelta = {
  // Plain-language label rendered in the sidebar row, e.g.
  // "Overall mention rate" or a capitalized topic label.
  label: string;
  // Signed change in percentage points (pts). Positive = up, negative
  // = down. Caller formats the value via formatSignedPp's *Raw*
  // variant since we hand back pts units, not a 0..1 share.
  deltaPp: number;
  // Drives the colored arrow + sign coloring in the row.
  kind: "overall" | "topic";
};

function composeWhatChanged({
  trajectoryWeeks,
  aiRecall,
  topicTrajectories,
}: {
  trajectoryWeeks: SubjectOverview["trajectory"]["weeks"];
  aiRecall: (number | null)[];
  topicTrajectories: SubjectOverview["topic_trajectories"];
}): {
  deltas: WhatChangedDelta[];
  fallbackCopy: string | null;
  latestDate: string | null;
  priorDate: string | null;
} {
  const len = trajectoryWeeks.length;
  if (len < 2) {
    return {
      deltas: [],
      fallbackCopy: STABLE_COPY,
      latestDate: trajectoryWeeks[len - 1] ?? null,
      priorDate: null,
    };
  }
  // First/last measured indices across the visible window — not just
  // the last-two-snapshots pair. Lets the footer describe the chart's
  // entire window ("Mar 23 → May 10") instead of just the latest
  // snapshot transition. Handles null entries gracefully — backfill
  // gaps don't drop the delta.
  const measuredIndices = (arr: (number | null)[]): [number, number] | null => {
    let first = -1;
    let last = -1;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (v !== null && Number.isFinite(v)) {
        if (first === -1) first = i;
        last = i;
      }
    }
    return first !== -1 && last !== -1 && first !== last ? [first, last] : null;
  };
  const overallEndpoints = measuredIndices(aiRecall);
  if (!overallEndpoints) {
    return {
      deltas: [],
      fallbackCopy: STABLE_COPY,
      latestDate: trajectoryWeeks[len - 1] ?? null,
      priorDate: trajectoryWeeks[0] ?? null,
    };
  }
  const [priorIdx, latestIdx] = overallEndpoints;
  const latestDate = trajectoryWeeks[latestIdx];
  const priorDate = trajectoryWeeks[priorIdx];

  // Match the backend snapshot_diff's 5-pts filter on topic movers
  // so micro-jitter doesn't surface (e.g., 1-pts swings on small N).
  // The overall recall delta uses a lower 1-pts floor — the headline
  // line earns a place on the card even for smaller swings.
  const TOPIC_MIN_DELTA = 0.05;
  const OVERALL_MIN_DELTA = 0.01;

  const deltas: WhatChangedDelta[] = [];

  // Overall mention rate delta — always leads the list when present.
  const curOverall = aiRecall[latestIdx];
  const priOverall = aiRecall[priorIdx];
  if (
    curOverall !== null &&
    priOverall !== null &&
    Number.isFinite(curOverall) &&
    Number.isFinite(priOverall)
  ) {
    const d = (curOverall as number) - (priOverall as number);
    if (Math.abs(d) >= OVERALL_MIN_DELTA) {
      deltas.push({
        label: "Overall mention rate",
        deltaPp: Math.round(d * 100),
        kind: "overall",
      });
    }
  }

  // Top topic movers — collect all that clear the 5-pts floor, sort
  // by absolute magnitude desc, take the top 3. Each topic uses its
  // OWN first/last measured indices within the window so a topic
  // with sparse data still surfaces if it has any two measured
  // snapshots (the overall endpoint indices wouldn't necessarily
  // line up with the topic's measured ones).
  const topicMovers: WhatChangedDelta[] = [];
  for (const t of topicTrajectories) {
    const endpoints = measuredIndices(t.mention_rate);
    if (!endpoints) continue;
    const [pIdx, lIdx] = endpoints;
    const cur = t.mention_rate[lIdx];
    const pri = t.mention_rate[pIdx];
    if (
      cur === null ||
      pri === null ||
      !Number.isFinite(cur) ||
      !Number.isFinite(pri)
    )
      continue;
    const d = (cur as number) - (pri as number);
    if (Math.abs(d) < TOPIC_MIN_DELTA) continue;
    topicMovers.push({
      label: capitalizeFirst(t.label),
      deltaPp: Math.round(d * 100),
      kind: "topic",
    });
  }
  topicMovers.sort((a, b) => Math.abs(b.deltaPp) - Math.abs(a.deltaPp));
  deltas.push(...topicMovers.slice(0, 3));

  return {
    deltas,
    fallbackCopy: deltas.length === 0 ? STABLE_COPY : null,
    latestDate,
    priorDate,
  };
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
  // Headline framing per spec: rank-1 share vs rank-6+ share. The
  // earlier bucket-dominant prose ("ranks rank 6+ on another 30%")
  // was both ungrammatical and over-conditional — the new template
  // always tells the same two-clause story so the reader can compare
  // pole-position visibility against fall-off in one line.
  const rank1 = rankDist.buckets.find((b) => b.rank === 1 && !b.is_absence);
  const rank6 = rankDist.buckets.find((b) => b.rank === 6 && !b.is_absence);
  const absence = rankDist.buckets.find((b) => b.is_absence);
  const rank1Pct = rank1 ? Math.round(rank1.share * 100) : 0;
  const rank6Pct = rank6 ? Math.round(rank6.share * 100) : 0;
  // If the subject is missing from a majority of answers, lead with
  // that — telling someone "first mention in 0%, sixth+ in 0%" hides
  // the actual story.
  if (absence && absence.share >= 0.5) {
    return `${subjectName} is missing from ${Math.round(absence.share * 100)}% of AI answers in this snapshot.`;
  }
  if (rank1Pct === 0 && rank6Pct === 0) {
    return `${subjectName} typically appears in the middle of AI answers in this snapshot.`;
  }
  return `${subjectName} is the first mention in ${rank1Pct}% of answers, but appears sixth or later in ${rank6Pct}%.`;
}

// ── Page ───────────────────────────────────────────────────────────

export default async function VisibilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    topic?: string;
    platform?: string;
    trend_window?: string;
  }>;
}) {
  const { id: idStr } = await params;
  const sp = await searchParams;
  // Page-level scope filters. Replace the prior 4 per-section
  // params (position_topic / position_platform / platform_topic
  // / topic_platform) since the right-rail dropdowns now drive
  // every section that supports topic / platform scoping. URL
  // param names mirror the Competition spoke's singletons.
  const topic = sp.topic || "";
  const platform = sp.platform || "";
  // Trend chart window — 4w / 8w / 12w / all. 12w is the default
  // (matches the toggle component's default state). Unknown values
  // fall back to 12w rather than throwing, so a hand-tampered URL
  // can't put the chart into an empty state.
  const TREND_WINDOW_SIZES: Record<string, number | null> = {
    "4w": 4,
    "8w": 8,
    "12w": 12,
    all: null,
  };
  const trendWindowKey = sp.trend_window || "12w";
  const trendWindowSize =
    trendWindowKey in TREND_WINDOW_SIZES
      ? TREND_WINDOW_SIZES[trendWindowKey]
      : 12;
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
  // Fetched for chrome-data parity / 404 detection; not read directly
  // on this spoke now that the subtitle pronoun resolution is gone.
  void subject;

  // ── URL-param sanitization ──────────────────────────────────────
  // Drop dropdown-scope params whose value doesn't match anything in
  // the current payload (typos, stale links, hand-tampered URLs). If
  // any need dropping, redirect once to the same path with a cleaned
  // querystring so the dropdowns and the URL agree on what's active.
  // Doing this on the server keeps the client dropdowns from showing
  // a value the data won't honor.
  const validTopicSet = new Set([
    ...data.topic_leaderboard.map((t) => t.topic_label),
    ...(data.per_platform_kpis_by_topic ?? []).map((t) => t.topic_label),
    ...data.topic_coverage.map((t) => t.label),
  ]);
  const validPlatformSlugSet = new Set(
    data.platform_topic_matrix.platforms.map((p) => p.slug),
  );
  const sanitized: Record<string, string> = {
    topic: topic,
    platform: platform,
    trend_window: sp.trend_window || "",
  };
  let needsRedirect = false;
  if (topic && !validTopicSet.has(topic)) {
    sanitized.topic = "";
    needsRedirect = true;
  }
  if (platform && !validPlatformSlugSet.has(platform)) {
    sanitized.platform = "";
    needsRedirect = true;
  }
  // `trend_window` cleanup: drop unknown values (hand-tampered URLs
  // would otherwise show the bad value in the URL while the chart
  // silently falls back to 12w via TREND_WINDOW_SIZES), and also
  // drop the explicit "12w" default to match the toggle's own
  // "default = no URL param" behavior so link-shared URLs stay tidy.
  if (sp.trend_window) {
    if (!(sp.trend_window in TREND_WINDOW_SIZES)) {
      sanitized.trend_window = "";
      needsRedirect = true;
    } else if (sp.trend_window === "12w") {
      sanitized.trend_window = "";
      needsRedirect = true;
    }
  }
  if (needsRedirect) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sanitized)) {
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    redirect(qs ? `?${qs}` : `?`);
  }

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
      ? `Updated ${updated} · ${data.meta.n_responses} response${data.meta.n_responses === 1 ? "" : "s"}`
      : "";

  // ── Derived data shared across sections ─────────────────────────
  const focal = data.competitive.find((c) => c.is_subject);

  // Coverage gap — which of the four platforms have no responses in
  // this snapshot. Lifted out of the Platform Change Detail IIFE
  // because the executive summary needs to surface it too; readers
  // shouldn't have to scroll to the table footnote to learn that a
  // headline rate like "90%" only covers half the providers.
  const EXPECTED_PLATFORMS = ["ChatGPT", "Claude", "Gemini", "Perplexity"];
  const platformsPresent = new Set(
    data.platform_recall
      .filter((p) => p.n_responses > 0)
      .map((p) => p.name),
  );
  const platformsCovered = EXPECTED_PLATFORMS.filter((n) =>
    platformsPresent.has(n),
  );
  const platformsNotIncluded = EXPECTED_PLATFORMS.filter(
    (n) => !platformsPresent.has(n),
  );
  const topicsWithRecall = data.topic_coverage.filter(
    (t) => t.ai_recall !== null && Number.isFinite(t.ai_recall),
  );
  const topicsSortedDesc = [...topicsWithRecall].sort(
    (a, b) => (b.ai_recall ?? 0) - (a.ai_recall ?? 0),
  );
  // strongestTopic dropped from the briefing summary at request;
  // the weakest topic remains (drives the Largest Visibility Gap
  // KPI tile + the Weakest Topic card + the briefing's tail line).
  const weakestTopic =
    topicsSortedDesc[topicsSortedDesc.length - 1] ?? null;

  const mentionRate = data.kpis.ai_recall.value;

  // ── Topic Visibility table rows ────────────────────────────────
  // Mirrors the Platform Change Detail table's shape — Topic |
  // Mention Rate | Avg. Mention Position | First Mention Share |
  // Change | Status. When platform-scoped via ?topic_platform=, the
  // mention rate + n come from the (platform × topic) matrix cell,
  // avg_rank + first_mention from per_platform_kpis_by_topic, and
  // the change column from topic_trajectories_by_platform. When
  // unscoped, everything comes from topic_leaderboard + the
  // aggregate topic_trajectories.
  const scopedPlatformTrajectories = platform
    ? (data.topic_trajectories_by_platform ?? []).find(
        (p) => p.slug === platform,
      )
    : null;
  const scopedPlatformLabel =
    data.platform_topic_matrix.platforms.find((p) => p.slug === platform)
      ?.name ?? null;

  type TopicRow = {
    label: string;
    mention_rate: number | null;
    avg_rank: number | null;
    first_mention_rate: number | null;
    delta: number | null; // signed pts (already × 100)
    n_responses: number;
  };

  // First/last measured endpoints in a sparse trajectory — same
  // helper logic the Trend section uses for `composeWhatChanged`,
  // duplicated inline so the topic table can compute change without
  // sharing a function reference across the file.
  const topicMeasuredEndpoints = (
    arr: (number | null)[],
  ): [number, number] | null => {
    let first = -1;
    let last = -1;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (v !== null && Number.isFinite(v)) {
        if (first === -1) first = i;
        last = i;
      }
    }
    return first !== -1 && last !== -1 && first !== last ? [first, last] : null;
  };

  const topicTrajectorySource = scopedPlatformTrajectories
    ? scopedPlatformTrajectories.topics
    : data.topic_trajectories;

  const topicTableRows: TopicRow[] = data.topic_leaderboard.map((t) => {
    const subjectEntity = t.entities.find((e) => e.is_subject) ?? null;

    let mention_rate: number | null;
    let n_responses: number;
    let avg_rank: number | null;
    let first_mention_rate: number | null;

    if (platform) {
      // Platform-scoped path. Missing cells = topic had zero
      // responses on this platform (filtered out below).
      const cell = data.platform_topic_matrix.cells.find(
        (c) =>
          c.platform_slug === platform &&
          c.topic_label === t.topic_label,
      );
      const perPlatform = (data.per_platform_kpis_by_topic ?? [])
        .find((entry) => entry.topic_label === t.topic_label)
        ?.platforms.find((p) => p.slug === platform);
      mention_rate = cell?.mention_rate ?? null;
      n_responses = cell?.n_responses ?? 0;
      avg_rank = perPlatform?.avg_rank ?? null;
      first_mention_rate = perPlatform?.first_mention_rate ?? null;
    } else {
      // Unscoped: use topic_leaderboard's per-topic subject entity.
      mention_rate = subjectEntity?.sov ?? t.subject_rate ?? null;
      n_responses = t.n_responses;
      avg_rank = subjectEntity?.avg_rank ?? null;
      first_mention_rate = subjectEntity?.first_mention_rate ?? null;
    }

    // Change column — first-vs-last measured value from the relevant
    // trajectory array. Returns null when the topic has fewer than
    // two measured snapshots (renders as "—" downstream).
    const trajectory =
      topicTrajectorySource.find((tt) => tt.label === t.topic_label)
        ?.mention_rate ?? [];
    const endpoints = topicMeasuredEndpoints(trajectory);
    const delta = endpoints
      ? (((trajectory[endpoints[1]] as number) -
          (trajectory[endpoints[0]] as number)) *
          100)
      : null;

    return {
      label: t.topic_label,
      mention_rate,
      avg_rank,
      first_mention_rate,
      delta,
      n_responses,
    };
  });

  // Filter to rows with measured responses (matches the Platform
  // table's `p.n_responses > 0` filter) and sort by mention rate
  // desc — most-visible topics lead, weakest sit at the bottom.
  const topicTableRowsSorted = topicTableRows
    .filter((r) => r.n_responses > 0 && r.mention_rate !== null)
    .sort((a, b) => (b.mention_rate ?? 0) - (a.mention_rate ?? 0));

  // Per-platform overlay lines for the Visibility Trend chart.
  // High-contrast categorical palette per LLM slug. The earlier
  // monochromatic blue ramp made adding Claude + Perplexity unreadable
  // (four close-hue blues blur into one another). Each platform now
  // gets a distinctly different color family so an at-a-glance read
  // tells the reader which line is which, even at four overlays.
  // Unknown slugs fall back to a muted cyan.
  const PLATFORM_COLOR_BY_SLUG: Record<string, string> = {
    chatgpt: "oklch(0.65 0.13 200)",   // sky / teal
    gemini: "oklch(0.48 0.17 270)",    // deep indigo
    claude: "oklch(0.68 0.16 60)",     // amber / orange
    perplexity: "oklch(0.60 0.18 20)", // rose / red
  };
  const PLATFORM_FALLBACK_COLOR = "oklch(0.62 0.10 200)";
  // Window-slicing helper. `null` window = show everything; otherwise
  // tail-slice to the last N entries. `Math.min` guards against
  // trajectories shorter than the chosen window (no IndexError;
  // the chart just renders whatever exists).
  const sliceTrendWindow = <T,>(arr: T[]): T[] => {
    if (trendWindowSize === null || trendWindowSize >= arr.length) return arr;
    return arr.slice(arr.length - trendWindowSize);
  };
  const trendWeeks = sliceTrendWindow(data.trajectory.weeks);
  const trendSubjectValues = sliceTrendWindow(data.trajectory.ai_recall);
  // Look up color by slug (categorical) instead of array index (ramp).
  // Means each platform has the same color across snapshots regardless
  // of which one had the most responses on the current refresh.
  const platformOverlays = (data.platform_trajectories ?? []).map((p) => ({
    name: p.name,
    color: PLATFORM_COLOR_BY_SLUG[p.slug] ?? PLATFORM_FALLBACK_COLOR,
    values: sliceTrendWindow(p.mention_rate),
    // iconSlug threads the platform slug through to the
    // TrendOverTime legend so each chip renders the brand mark
    // next to the platform name — same brand-icon treatment the
    // Per-Platform Snapshot heatmap and the per-platform KPIs
    // table on this page use.
    iconSlug: p.slug,
  }));
  // Sliced topic trajectories feed `composeWhatChanged` so the
  // footer's deltas describe the visible window, not just the
  // latest snapshot pair.
  const trendTopicTrajectories = data.topic_trajectories.map((t) => ({
    ...t,
    mention_rate: sliceTrendWindow(t.mention_rate),
  }));

  // Visibility Performance — short executive summary + 4 KPI cards.
  const briefingSummary = composeBriefingSummary({
    subjectName: data.subject_name,
    mentionRate,
    avgRank: focal?.avg_rank ?? null,
    weakestTopic,
  });
  // Polarity is kept on the KpiCard shape as documentation of each
  // metric's "is higher or lower better?" — even though the actual
  // color resolution is now centralized in getKpiValueColor from
  // @/lib/kpiThresholds, the polarity tag stays useful when adding
  // new metrics or auditing the table. The local toneByThreshold
  // helper that used to live here was removed when the shared
  // resolver landed.
  type Polarity = "higher_better" | "lower_better";

  type KpiCard = {
    label: string;
    value: string;
    // Optional smaller text appended inline after the primary value
    // (e.g. the Weakest Topic name following its rate).
    valueSuffix?: string | null;
    helper: string;
    tooltip?: string;
    valueColor: string;
    polarity: Polarity;
    // 0..1 fraction for the KpiGauge fill. Null skips the gauge.
    gaugeValue: number | null;
    gaugeBenchmark: number | null;
    // Optional one-line caption rendered below the gauge — used
    // for inverse-tier metrics ("lower is better") so the gauge
    // isn't misread against the rate-card convention.
    gaugeOrientationCaption?: string;
    // Sub-line carried via the gauge (when present) or rendered
    // as the standalone caption (when no gauge).
    caption: string | null;
    anchor?: string;
    // Signed pp delta vs the prior snapshot. Direction-toned ↑/↓
    // arrow rendered by the shared tile component; null hides
    // the delta entirely.
    deltaPp?: number | null;
    // Sparkline series (aligned to data.trajectory.weeks). Omit
    // when the metric has no time series at all — the tile drops
    // the spark slot rather than fabricating a line.
    sparkValues?: (number | null)[];
    // Format function for sparkline axis labels — defaults to
    // string-cast; pass the same formatter used for the headline
    // value so the axis reads in matching units.
    sparkFormat?: (v: number | null) => string;
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
    topic_gap_median: null,
  };
  const bmCaption = (
    avg: number | null,
    formatter: (v: number) => string,
  ): string | null => {
    if (avg === null || !Number.isFinite(avg)) return null;
    if (bm.n_subjects <= 1) return null;
    return `vs ${formatter(avg)} subject-set avg`;
  };
  // Normalize a rank value (1.0 = best, ~10 = worst) into a 0..1
  // fraction for the gauge bar where 1.0 → 100% (best) and 10.0 →
  // 0% (worst). Lets Avg Mention Position render the same gauge
  // shape as the percentage-based tiles even though its raw scale
  // is opposite-direction.
  const rankToFrac = (rank: number | null): number | null => {
    if (rank === null || !Number.isFinite(rank)) return null;
    return Math.max(0, Math.min(1, 1 - (rank - 1) / 9));
  };
  // Helper to compute "delta vs the IMMEDIATELY preceding snapshot"
  // for a trajectory series. Returns the signed pp delta, or null
  // when one endpoint is missing — same rule the Overview tiles use
  // so a backfill gap doesn't silently make the delta span 2+
  // snapshots.
  const deltaFromSeries = (
    series: (number | null)[] | undefined,
  ): number | null => {
    if (!series || series.length < 2) return null;
    const latest = series[series.length - 1];
    const prior = series[series.length - 2];
    if (
      latest === null ||
      prior === null ||
      !Number.isFinite(latest) ||
      !Number.isFinite(prior)
    ) {
      return null;
    }
    return Math.round(((latest as number) - (prior as number)) * 100);
  };
  const kpis: KpiCard[] = [
    {
      label: "AI Mention Rate",
      value: formatPct(mentionRate),
      helper: "Share of monitored prompts where the subject appeared.",
      // Shared getKpiValueColor — same constants Overview's tile uses
      // so the same 50% reads the same color on both spokes.
      valueColor: getKpiValueColor("mention_rate", mentionRate),
      polarity: "higher_better",
      gaugeValue: mentionRate,
      gaugeBenchmark: bm.ai_mention_rate_avg,
      caption: bmCaption(bm.ai_mention_rate_avg, (v) => formatPct(v)),
      anchor: "trend",
      // Delta still rendered as ↑/↓ N pts beside the value — it's a
      // single number derived from the trajectory's last two
      // measured points, not a duplicate of the Trend chart's curve.
      deltaPp: deltaFromSeries(data.trajectory.ai_recall),
      // Sparkline intentionally omitted on this tab — the full
      // "Mention Rate Over Time" Trend chart sits in the next
      // section (#trend) and renders the SAME ai_recall series at
      // chart-size with axes + dots, so a mini-version here would
      // duplicate the very thing the click-through navigates to.
      // The other three Visibility tiles keep their sparklines
      // because their series (top_result_rate, weakest-topic
      // mention rate) aren't replicated in any chart on this tab.
      // sparkValues / sparkFormat deliberately unset.
    },
    {
      label: "Average Mention Position",
      value: formatRank(focal?.avg_rank ?? null),
      helper: "Average position when this entity appears in an answer.",
      tooltip:
        "Average answer position among responses where the subject is mentioned. Lower values mean the subject appears earlier in the answer.",
      // Inverse-tier: rank ≤ 2.0 success, > 4.0 warning — handled
      // by getKpiValueColor("avg_rank", ...). The gauge fill is
      // pre-inverted via rankToFrac (1.0 = best maps to a full bar)
      // and the gaugeOrientationCaption ("lower position rank is
      // better") clarifies the polarity flip vs the rate cards.
      valueColor: getKpiValueColor("avg_rank", focal?.avg_rank ?? null),
      polarity: "lower_better",
      gaugeValue: rankToFrac(focal?.avg_rank ?? null),
      gaugeBenchmark: rankToFrac(bm.avg_mention_rank_avg),
      gaugeOrientationCaption: "lower position rank is better",
      caption: bmCaption(bm.avg_mention_rank_avg, (v) => v.toFixed(1)),
      anchor: "position",
      // No sparkline — avg_rank is not shipped as a trajectory
      // series on data.trajectory. Per the parity spec, when a
      // KPI has no history the spark slot omits rather than
      // fabricates a line. Caller leaves sparkValues undefined and
      // the shared tile drops the spark wrapper.
    },
    {
      label: "First Mention Share",
      value: formatPct(focal?.first_mention_rate ?? null),
      helper: "How often the subject appeared first among named entities.",
      valueColor: getKpiValueColor(
        "top_result_rate",
        focal?.first_mention_rate ?? null,
      ),
      polarity: "higher_better",
      gaugeValue: focal?.first_mention_rate ?? null,
      gaugeBenchmark: bm.first_mention_rate_avg,
      caption: bmCaption(bm.first_mention_rate_avg, (v) => formatPct(v)),
      anchor: "position",
      // Delta still rendered as ↑/↓ N pts beside the value — single
      // number, not a duplicate of any chart.
      deltaPp: deltaFromSeries(data.trajectory.top_result_rate),
      // Sparkline intentionally omitted on this tab — paired with the
      // AI Mention Rate spark drop (commit ba3566d) so all four
      // Visibility KPI cards share the same compact anatomy and the
      // vitals row equalizes at the shorter height. The full Trend
      // chart below covers any per-metric trend story a reader
      // wants; per-card sparklines duplicate that scroll-adjacent
      // surface. Overview keeps its sparklines because Overview has
      // no on-tab Trend chart to defer to.
    },
    (() => {
      // Reformed to mirror the Overview spoke's "Weakest topic
      // visibility" hero tile so a reader switching between the two
      // pages sees one consistent framing of this signal. Caption
      // (renders BELOW the value, matching the screenshot's tile-4
      // pattern) names the topic when the gap is materially below
      // the mean of the other topics (15pp threshold matches the
      // Overview tile and the backend's Message Gap rule), otherwise
      // signals that all tracked topics are clustered together so a
      // reader doesn't chase a non-issue. No gauge — the gap
      // framing carries the signal, and there's no subject-set
      // benchmark for "weakest" to compare against.
      const MIN_GAP_PP = 15;
      const withRecall = topicsSortedDesc.filter(
        (t) => t.ai_recall !== null && Number.isFinite(t.ai_recall),
      );
      const others = weakestTopic
        ? withRecall.filter((t) => t !== weakestTopic)
        : [];
      const hasMeaningfulGap = (() => {
        if (!weakestTopic || others.length === 0) return false;
        const meanOthers =
          others.reduce((s, t) => s + (t.ai_recall ?? 0), 0) /
          others.length;
        const gapPp = (meanOthers - (weakestTopic.ai_recall ?? 0)) * 100;
        return gapPp >= MIN_GAP_PP;
      })();
      const weakestRecall = weakestTopic?.ai_recall ?? null;
      // When a meaningful gap exists, append the topic name as a
      // smaller suffix on the headline ("50% Progressive state
      // governance"). The percent stays at the value font size; the
      // topic renders at an intermediate size — smaller than the
      // value (so the number leads), larger than the caption (so
      // the topic still reads as headline content, not chrome).
      const weakestSuffix =
        weakestTopic && hasMeaningfulGap
          ? capitalizeFirst(weakestTopic.label)
          : null;
      return {
        label: "Weakest Topic Visibility",
        value: formatPct(weakestRecall),
        valueSuffix: weakestSuffix,
        helper:
          "Lowest topic-level mention rate in this snapshot. The topic name is appended to the rate only when its rate is at least 15 pts below the average of the other tracked topics.",
        // Shared color rule for the weakest-topic context — only
        // fires warning on genuinely severe gaps (<30%); never
        // success (this tile's framing is "this is the weakest" so
        // a green value would undercut the message). Matches
        // Overview's weakest-topic color treatment.
        valueColor: getKpiValueColor("weakest_topic_recall", weakestRecall),
        polarity: "higher_better" as const,
        // No gauge for Weakest Topic — no subject-set benchmark
        // for "the weakest" to compare against.
        gaugeValue: null,
        gaugeBenchmark: null,
        // Caption suppressed when the topic is already in the value
        // line. Retained only for the no-gap / no-topics shell states.
        caption:
          weakestTopic && hasMeaningfulGap
            ? null
            : weakestTopic
              ? "No material gap across tracked topics"
              : "No tracked topics",
        anchor: "topics",
        // Sparkline + delta intentionally omitted — paired with the
        // First Mention Share + AI Mention Rate spark drops so the
        // four Visibility KPI cards share the same compact anatomy
        // (value + suffix + standaloneCaption only here, since this
        // tile has no benchmark gauge either). The MiniSpark also
        // routinely fell back to its "1 of N snapshots scored so
        // far" placeholder when the weakest topic had only one
        // measured point — that placeholder was the visible
        // symptom of the missing data, not useful information for
        // the reader.
      };
    })(),
  ];

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

        {/* Horizontal sticky sub-nav pinned directly under the
            Header — same component the Overview spoke uses. Hosts
            both the section jump-links (left) and the page-level
            filter dropdowns (right, via OverviewSubNav's optional
            `right` slot) on a single sticky row, so navigation and
            scope state ride together as the user scrolls. */}
        <OverviewSubNav
          items={[
            // "Vitals" leads the rail to mirror the Overview spoke,
            // where the first sub-nav item also points at the band
            // that holds the executive summary + KPI tiles. The
            // Visibility briefing IS this tab's Vitals analog (same
            // KpiGauge tiles, same headline phrasing pattern); the
            // missing nav entry left the band visible but unreachable
            // from the sticky rail. Anchors to the existing first
            // <section>, now id="vitals".
            { id: "vitals", label: "Vitals", num: "01" },
            { id: "trend", label: "Trend", num: "02" },
            { id: "platforms", label: "Platforms", num: "03" },
            { id: "topics", label: "Topics", num: "04" },
            { id: "position", label: "Prominence", num: "05" },
          ]}
          right={
            <>
              <VisibilityTopicFilter
                inline
                topics={data.topic_coverage.map((t) => ({
                  label: t.label,
                }))}
              />
              <VisibilityPlatformFilter
                inline
                platforms={data.platform_topic_matrix.platforms.map(
                  (p) => ({ slug: p.slug, name: p.name }),
                )}
              />
            </>
          }
        />

        <main className="flex-1 px-4 md:px-12 py-6 space-y-10 max-w-[1280px] w-full mx-auto">
          {/* ── 1. VITALS (Visibility Briefing) ──────────────────── */}
          {/* The H2 "Visibility Performance" title and its boilerplate
              subtitle were removed at request — the sidebar's active
              "Visibility" pill plus the breadcrumb above already
              establish the page identity, and the data-driven
              briefing line below opens the section with real signal
              instead of a static description. id="vitals" matches the
              first sub-nav item ("01 Vitals") so the rail scrolls to
              this band; scroll-mt-28 mirrors the other sections so
              the sticky header doesn't crop the eyebrow. */}
          <section id="vitals" className="scroll-mt-28">
            {/* Briefing Card matches the Overview Vitals card
                styling exactly: tighter padding (md:p-7 not md:p-8),
                explicit border-border/60, plus the same subtle
                primary-tinted gradient overlay so the two heroes
                read as the same surface across spokes. */}
            <Card className="relative overflow-hidden p-6 md:p-7 border-border/60">
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(135deg, color-mix(in oklab, var(--primary) 5%, transparent) 0%, color-mix(in oklab, var(--primary) 1.5%, transparent) 35%, transparent 70%)",
                }}
              />
              <div className="relative">
              {/* Shared BottomLineBlock — same component the Overview
                  Vitals card uses, so the two heroes have identical
                  type + spacing + title/body split treatment. The
                  briefingSummary is a server-polished summary line
                  (not a templated gap verdict), so bodyTone="neutral"
                  — no warning-tone left rule on the body clause. */}
              <BottomLineBlock text={briefingSummary} bodyTone="neutral" />

              {/* Coverage note — surfaces missing platforms inline
                  with the briefing so every percentage below is read
                  in the right context. Previously buried as a footnote
                  on the Platform Change Detail table. */}
              {platformsNotIncluded.length > 0 && (
                <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
                  Snapshot covers {platformsCovered.join(" and ")}.
                  {" "}
                  {platformsNotIncluded.join(" and ")}{" "}
                  {platformsNotIncluded.length === 1 ? "was" : "were"}{" "}
                  not included.
                </p>
              )}

              {/* 4 KPI cards. Each has label + tooltip + value +
                  optional subtitle + plain-English helper. Tiles with
                  an `anchor` are wrapped in an in-page link so the
                  briefing tile becomes an entry point into the
                  deeper section below. KpiGauge bars were dropped
                  in 2026-05-25's Overview consistency pass so this
                  spoke matches Overview's bar-free tile treatment;
                  the benchmark caption ("vs N% subject-set avg")
                  stays as a small muted line where the gauge used
                  to render, so the cross-subject comparison signal
                  isn't lost. */}
              <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 items-stretch">
                {kpis.map((k) => (
                  <KpiVitalsTile
                    key={k.label}
                    label={k.label}
                    tooltipText={k.tooltip ?? k.helper}
                    value={k.value}
                    valueSuffix={k.valueSuffix}
                    valueColor={k.valueColor}
                    deltaPp={k.deltaPp}
                    gaugeValue={k.gaugeValue}
                    gaugeBenchmark={k.gaugeBenchmark}
                    // gauge's inline caption — only rendered when a
                    // gauge is present. For no-gauge tiles (Weakest
                    // Topic) the same `caption` field flows into
                    // standaloneCaption below so the text still
                    // renders, just in a different slot.
                    benchmarkCaption={
                      k.gaugeBenchmark !== null ? k.caption : null
                    }
                    gaugeOrientationCaption={k.gaugeOrientationCaption}
                    standaloneCaption={
                      k.gaugeBenchmark === null ? k.caption : null
                    }
                    sparkValues={k.sparkValues}
                    sparkIsHistorical={
                      k.sparkValues
                        ? data.trajectory.is_historical.slice(
                            0,
                            k.sparkValues.length,
                          )
                        : undefined
                    }
                    sparkLabels={
                      k.sparkValues
                        ? data.trajectory.weeks.slice(0, k.sparkValues.length)
                        : undefined
                    }
                    sparkFormat={k.sparkFormat}
                    anchor={k.anchor}
                  />
                ))}
              </div>

              {/* Platform Visibility Snapshot — secondary heatmap
                  inside the briefing card. Same matrix data as
                  before but visually de-emphasized: smaller header,
                  more compact cells, no "Build-on/Fix" callout.
                  When every cell rounds to the same mention rate
                  the heatmap reads as monotone (the user's complaint:
                  four identical 100% bars), so we collapse to a
                  single line summarizing the uniform value
                  instead. */}
              {data.platform_topic_matrix.platforms.length > 0 &&
                data.platform_topic_matrix.topics.length > 0 && (() => {
                  const finiteCells = data.platform_topic_matrix.cells.filter(
                    (c) =>
                      c.mention_rate !== null &&
                      Number.isFinite(c.mention_rate),
                  );
                  const expectedCellCount =
                    data.platform_topic_matrix.platforms.length *
                    data.platform_topic_matrix.topics.length;
                  const uniformPct = (() => {
                    if (finiteCells.length === 0) return null;
                    if (finiteCells.length < expectedCellCount) return null;
                    const first = Math.round(
                      (finiteCells[0].mention_rate ?? 0) * 100,
                    );
                    const allSame = finiteCells.every(
                      (c) => Math.round((c.mention_rate ?? 0) * 100) === first,
                    );
                    return allSame ? first : null;
                  })();
                  if (uniformPct !== null) {
                    return (
                      <div className="mt-8 border-t border-border/50 pt-6">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/55 inline-flex items-center gap-1">
                          Current Platform Snapshot
                          <KpiTooltipIcon
                            text="Mention rate for each AI platform on each tracked topic — share of that platform's monitored prompts in this topic area where the subject was mentioned."
                            align="left"
                          />
                        </div>
                        <p className="mt-1.5 text-[13px] text-foreground/75">
                          {uniformPct}% across all platforms and topics.
                        </p>
                      </div>
                    );
                  }
                  // Tiered cells + auto-summary. The old per-cell
                  // alpha gradient made 100% cells the strongest
                  // visual element; new treatment inverts that so
                  // healthy cells (≥60%) recede into a calm light
                  // tint and any gap (<30%) pops in warning amber.
                  // Summary line below the grid spells out the
                  // exception in words so the read isn't carried
                  // by color alone (accessibility + faster scan).
                  const platformBySlug = new Map(
                    data.platform_topic_matrix.platforms.map((p) => [p.slug, p]),
                  );
                  const gapCells = data.platform_topic_matrix.cells
                    .filter(
                      (c) =>
                        c.mention_rate !== null &&
                        Number.isFinite(c.mention_rate) &&
                        (c.mention_rate as number) < STATUS_WEAK_MENTION_RATE,
                    )
                    .map((c) => ({
                      platformName:
                        platformBySlug.get(c.platform_slug)?.name ??
                        c.platform_slug,
                      topicLabel: capitalizeFirst(c.topic_label),
                      rate: c.mention_rate as number,
                    }))
                    // Lowest rate first — "largest gap".
                    .sort((a, b) => a.rate - b.rate);
                  const summary = (() => {
                    if (gapCells.length === 0) {
                      return "Full coverage across all platforms and topics.";
                    }
                    if (gapCells.length === 1) {
                      const g = gapCells[0];
                      const topicLc = g.topicLabel.toLowerCase();
                      if (g.rate === 0) {
                        return `One gap: ${g.platformName} doesn't mention ${data.subject_name} on ${topicLc}.`;
                      }
                      return `One weak cell: ${g.platformName} on ${topicLc} (${Math.round(
                        g.rate * 100,
                      )}%).`;
                    }
                    const largest = gapCells[0];
                    return `${gapCells.length} gaps — largest: ${largest.platformName} on ${largest.topicLabel.toLowerCase()} (${Math.round(
                      largest.rate * 100,
                    )}%).`;
                  })();
                  return (
                  <div className="mt-8 border-t border-border/50 pt-6">
                    <div className="mb-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/55 inline-flex items-center gap-1">
                        Mention rate by platform AND topic
                        <KpiTooltipIcon
                          text="Each cell = % of that platform's monitored prompts ON THAT TOPIC where the subject was mentioned. Amber cells flag gaps (<30%); calm cells are at strong coverage (≥60%). The Platform Change Detail table below aggregates these cells per platform across ALL topics — that's why the same platform can read 50% on a single topic here and 80% overall below."
                          align="left"
                        />
                      </div>
                      <p className="mt-1 text-[12.5px] text-muted-foreground">
                        Each cell = % of answers <span className="font-medium text-foreground/75">on that topic</span> (per platform) that mention {data.subject_name}.
                        The all-topics rollup lives in the table below.
                      </p>
                    </div>
                    <div className="overflow-x-auto">
                      <div
                        className="grid gap-1 min-w-fit"
                        style={{
                          gridTemplateColumns: `minmax(72px, auto) repeat(${data.platform_topic_matrix.topics.length}, minmax(56px, 1fr))`,
                        }}
                      >
                        <div />
                        {data.platform_topic_matrix.topics.map((t) => (
                          // Two-element nesting: outer flex owns the
                          // reserved min-height + bottom alignment;
                          // inner span owns the line-clamp. Can't
                          // combine `flex` and `line-clamp-2` on the
                          // same element — line-clamp forces
                          // `display:-webkit-box` which collides with
                          // `display:flex` and one of them silently
                          // wins, breaking either the clamping or the
                          // alignment depending on which class is
                          // later in the cascade.
                          <div
                            key={t.label}
                            className="flex items-end justify-center px-1 min-h-[26px]"
                            title={capitalizeFirst(t.label)}
                          >
                            <span className="line-clamp-2 text-center text-[10.5px] leading-tight text-foreground/60">
                              {capitalizeFirst(t.label)}
                            </span>
                          </div>
                        ))}
                        {data.platform_topic_matrix.platforms.map((p) => {
                          const Icon = PLATFORM_ICON[p.slug];
                          return (
                          <div
                            key={p.slug}
                            style={{ display: "contents" }}
                          >
                            <div className="self-center pr-2 text-[12px] font-medium text-foreground/80 inline-flex items-center gap-1.5">
                              {Icon && (
                                <Icon
                                  className="h-3 w-3 text-foreground/65 shrink-0"
                                  aria-hidden
                                />
                              )}
                              <span>{p.name}</span>
                            </div>
                            {data.platform_topic_matrix.topics.map((t) => {
                              const cell =
                                data.platform_topic_matrix.cells.find(
                                  (c) =>
                                    c.platform_slug === p.slug &&
                                    c.topic_label === t.label,
                                );
                              const rate = cell?.mention_rate ?? null;
                              const tier = heatTier(rate);
                              const ts = heatTierStyle(tier);
                              const titleLabel = `${p.name} × ${capitalizeFirst(t.label)}: ${
                                rate === null || !cell
                                  ? "no data"
                                  : `${Math.round(rate * 100)}% (${cell.n_mentioned}/${cell.n_responses})`
                              }`;
                              return (
                                // Clickable: scrolls to (and
                                // briefly highlights via :target)
                                // the matching row in Platform
                                // Breakdown below. Heatmap doubles
                                // as a navigation primitive.
                                <a
                                  key={t.label}
                                  href={`#platform-${p.slug}`}
                                  className="relative flex h-7 items-center justify-center rounded-sm transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40"
                                  style={{
                                    background: ts.background,
                                    border: ts.border,
                                  }}
                                  title={titleLabel}
                                >
                                  <span
                                    className={`text-[10.5px] tabular-nums ${ts.textClass}`}
                                  >
                                    {rate === null
                                      ? "—"
                                      : `${Math.round(rate * 100)}%`}
                                  </span>
                                </a>
                              );
                            })}
                          </div>
                          );
                        })}
                      </div>
                    </div>
                    {/* Color legend — only the "No data" swatch
                        remains; the three tier swatches (Healthy /
                        Mid / Gap) were dropped per design call —
                        the section tooltip + cell hover already
                        explain the tier coloring, and the auto-
                        summary line below carries the gap count
                        explicitly so colorblind readers still get
                        the read. */}
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className="inline-block h-3 w-3 rounded-sm"
                          style={{
                            background:
                              "color-mix(in oklab, var(--muted) 35%, transparent)",
                            border:
                              "1px dashed color-mix(in oklab, var(--muted-foreground) 30%, transparent)",
                          }}
                        />
                        No data
                      </span>
                    </div>
                    {/* Auto-summary: gap count or positive line.
                        Always rendered (never empty) so the read
                        isn't carried by color alone — color +
                        text together so a colorblind reader gets
                        the same answer as a sighted one. */}
                    <p className="mt-3 text-[12.5px] leading-relaxed text-foreground/80">
                      {summary}
                    </p>
                  </div>
                  );
                })()}
              </div>
            </Card>
          </section>

          {/* "Where you stand now" chapter divider removed — the
              numbered eyebrows on each section already signal the
              page structure; the divider was floating in blank
              space without adding signal. */}

          {/* ── 2. VISIBILITY TREND ─────────────────────────────── */}
          <section id="trend" className="scroll-mt-28">
            <SectionTitle
              eyebrow="Trend"
              title="Mention Rate Over Time"
              // Section description dropped — the chart's helperText
              // (now rendered above the chart) carries the same
              // explanation in more specific terms (names the
              // subject, defines mention rate). Keeping both stacked
              // two near-identical lines above the chart.
              className="mb-5"
              right={<TrendWindowToggle />}
            />
            <Card className="p-6 border-border/60">
            {/* Chart + "What changed" share a single card. The
                earlier 1fr_300px split created a tall empty sidebar
                because 3-4 short deltas couldn't fill the chart's
                ~260px height; folding the deltas into a footer
                strip inside the same card removes that dead space
                and puts the deltas directly under the line they
                describe. */}
              <TrendOverTime
                subjectName="Overall"
                trajectoryWeeks={trendWeeks}
                subjectValues={trendSubjectValues}
                overlays={platformOverlays}
                helperText={`Mention rate shows the share of tracked AI answers where ${data.subject_name} appeared — overall, with each platform's mention rate as a lighter line for context.`}
                // Per-platform overlays sit FURTHER back than
                // Competition's competitor lines — Visibility's
                // focal read is "Overall", and the per-platform
                // splits are reference context, not co-equal series.
                // Lighter (0.35 vs 0.5) + thinner (1.25 vs 2) keeps
                // the four LLM lines legible on hover but stops them
                // from competing with the subject line for the eye.
                overlayOpacity={0.35}
                overlayStrokeWidth={1.25}
                // Opt into end-of-line labels — Visibility's overlays
                // are per-platform breakdowns of the SAME metric
                // (typically 2-4 platforms), so they spread across
                // the chart with the subject rather than clustering
                // at one Y value. Competition leaves this off
                // because its 7 competitor lines often converge at
                // the same mention rate, which makes the label rail
                // stack 5+ labels in a tight column.
                showEndLabels
              />
              {(() => {
                const result = composeWhatChanged({
                  trajectoryWeeks: trendWeeks,
                  aiRecall: trendSubjectValues,
                  topicTrajectories: trendTopicTrajectories,
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
                // Footer eyebrow text contextualizes the strip with
                // the snapshot endpoints so a reader doesn't have to
                // guess "compared to when?".
                const eyebrow =
                  latestStr && priorStr
                    ? `What changed · ${priorStr} → ${latestStr}`
                    : latestStr
                      ? `What changed · since ${latestStr}`
                      : "What changed";
                return (
                  // What-changed reads as the chart's own footer
                  // rather than a sibling section: no top border, no
                  // generous gap. Sits directly under the helper
                  // caption so the chips feel like an annotation of
                  // the lines above. Text dropped to 11.5px (same
                  // size as the legend chips) so the strip reads as
                  // chart chrome, not its own block of content.
                  <div className="mt-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/55">
                      {eyebrow}
                    </div>
                    {result.deltas.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
                        {result.deltas.map((d) => (
                          <li
                            key={`${d.kind}:${d.label}`}
                            className="inline-flex max-w-full items-baseline gap-1.5"
                          >
                            <span
                              className={`max-w-[220px] truncate text-[11.5px] ${
                                d.kind === "overall"
                                  ? "font-medium text-foreground"
                                  : "text-foreground/80"
                              }`}
                              title={d.label}
                            >
                              {d.label}
                            </span>
                            <span
                              className={`shrink-0 text-[11.5px] font-semibold tabular-nums ${deltaToneClass(
                                d.deltaPp,
                              )}`}
                            >
                              {formatSignedPpRaw(d.deltaPp)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-[11.5px] leading-relaxed text-foreground/80">
                        {result.fallbackCopy}
                      </p>
                    )}
                  </div>
                );
              })()}
            </Card>
          </section>

          {/* ── 3. PLATFORM BREAKDOWN ───────────────────────────── */}
          <section id="platforms" className="scroll-mt-28">
            <SectionTitle
              eyebrow="Platforms"
              title="Platform Change Detail"
              description={
                topic
                  ? `How each AI platform covers ${data.subject_name} on this topic.`
                  : `How each AI platform covers ${data.subject_name}.`
              }
              className="mb-5"
            />
            <Card className="p-6 border-border/60">
              {(() => {
                // When a topic is selected, swap in the per-(platform,
                // topic) breakdown so all four metric columns reflect
                // the chosen topic — including the per-topic delta vs
                // the prior snapshot. Otherwise fall back to the
                // all-topics roll-up (data.per_platform_kpis).
                const scopedTopic = topic
                  ? (data.per_platform_kpis_by_topic ?? []).find(
                      (t) => t.topic_label === topic,
                    )
                  : null;
                const platforms = scopedTopic
                  ? scopedTopic.platforms.filter((p) => p.n_responses > 0)
                  : data.per_platform_kpis.filter((p) => p.n_responses > 0);
                if (platforms.length === 0) {
                  return (
                    <div className="text-[13.5px] text-muted-foreground">
                      No platform responses in this snapshot.
                    </div>
                  );
                }
                return (
                  <>
                    <div>
                      <table className="w-full text-left">
                        {/* Mention Rate column dropped — it duplicated
                            the Current Platform Snapshot heatmap above
                            (which shows per-(platform × topic) mention
                            rate, with the all-topics rollup explained
                            in the heatmap's own tooltip). The remaining
                            5 columns surface per-platform signals that
                            don't appear elsewhere on this tab:
                            Position, First Mention, Change, Status.
                            Widths redistributed across 5 cols summing
                            to 100%. */}
                        <colgroup>
                          <col style={{ width: "26%" }} />
                          <col style={{ width: "20%" }} />
                          <col style={{ width: "20%" }} />
                          <col style={{ width: "16%" }} />
                          <col style={{ width: "18%" }} />
                        </colgroup>
                        <thead>
                          <tr className="border-b border-border/60 text-[10.5px] uppercase tracking-[0.06em] text-foreground/65">
                            <th className="py-2.5 pr-3 font-semibold">
                              Platform
                            </th>
                            <th className="py-2.5 px-3 text-right font-semibold">
                              <span className="inline-flex items-center justify-end gap-1">
                                Avg. Mention Position
                                <KpiTooltipIcon
                                  text="Average answer position among responses where the subject is mentioned. Lower values mean the subject appears earlier in the answer."
                                  align="right"
                                  direction="below"
                                />
                              </span>
                            </th>
                            <th className="py-2.5 px-3 text-right font-semibold">
                              <span className="inline-flex items-center justify-end gap-1">
                                First Mention Share
                                <KpiTooltipIcon
                                  text="Share of this platform's answers where the subject was the first-named entity. Pole-position visibility — being mentioned at all is one thing; being listed first is another."
                                  align="right"
                                  direction="below"
                                />
                              </span>
                            </th>
                            <th className="py-2.5 px-3 text-right font-semibold">
                              <span className="inline-flex items-center justify-end gap-1">
                                Change
                                <KpiTooltipIcon
                                  text="Mention-rate change from the prior snapshot, in percentage points. Positive (green) = up from last snapshot; negative (amber) = down. Renders an em-dash when there is no prior snapshot to compare against."
                                  align="right"
                                  direction="below"
                                />
                              </span>
                            </th>
                            <th className="py-2.5 pl-3 text-right font-semibold">
                              <span className="inline-flex items-center justify-end gap-1">
                                Status
                                <KpiTooltipIcon
                                  text="Current visibility level (level only — trend lives in the Change column). Strong = mention rate ≥60% AND avg position ≤3; Weak = mention rate <30%; Moderate = anything in between; Limited Data = platform has no measured responses in this snapshot."
                                  align="right"
                                  direction="below"
                                />
                              </span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {platforms.map((p) => {
                            // When scoped to a topic, the row carries
                            // its own per-topic delta (in pts); when
                            // unscoped, fall back to the all-topics
                            // platform_recall delta. Both come in pts
                            // units so the formatter is the same.
                            const change = scopedTopic
                              ? ((p as { delta: number | null }).delta ?? null)
                              : (data.platform_recall.find(
                                  (pr) => pr.name === p.name,
                                )?.delta ?? null);
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
                                  {(() => {
                                    const Icon = PLATFORM_ICON[p.slug];
                                    return (
                                      <span className="inline-flex items-center gap-1.5">
                                        {Icon && (
                                          <Icon
                                            className="h-3.5 w-3.5 text-foreground/65 shrink-0"
                                            aria-hidden
                                          />
                                        )}
                                        <span>{p.name}</span>
                                      </span>
                                    );
                                  })()}
                                </td>
                                <td className="py-3 px-3 text-right tabular-nums text-foreground/90">
                                  {isPoorPosition(p.avg_rank) ? (
                                    <span
                                      className="inline-flex items-center justify-end gap-1 font-semibold text-destructive"
                                      title={`Avg position ${formatRank(p.avg_rank)} — at or past the rank-${POOR_POSITION_THRESHOLD} threshold for a weak placement`}
                                    >
                                      <AlertTriangle
                                        className="h-3.5 w-3.5"
                                        aria-hidden
                                      />
                                      {formatRank(p.avg_rank)}
                                    </span>
                                  ) : (
                                    formatRank(p.avg_rank)
                                  )}
                                </td>
                                <td className="py-3 px-3 text-right tabular-nums text-foreground/90">
                                  {formatPct(p.first_mention_rate)}
                                </td>
                                <td className="py-3 px-3 text-right tabular-nums">
                                  {change === null ? (
                                    <span className="text-muted-foreground">—</span>
                                  ) : (
                                    <span
                                      className={`font-semibold ${deltaToneClass(change)}`}
                                    >
                                      {formatSignedPpRaw(change)}
                                    </span>
                                  )}
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
                    {/* Coverage note moved to the briefing card so
                        every percentage on the page is read in the
                        same coverage context — see the platformsNotIncluded
                        block under the executive summary line. */}
                  </>
                );
              })()}
            </Card>
          </section>

          {/* ── 4. TOPIC VISIBILITY ─────────────────────────────── */}
          <section id="topics" className="scroll-mt-28">
            <SectionTitle
              eyebrow="Topics"
              title="Topic Visibility"
              description={
                platform && scopedPlatformLabel
                  ? `How each tracked topic ranks for ${data.subject_name} on ${scopedPlatformLabel}.`
                  : `How each tracked topic ranks for ${data.subject_name}.`
              }
              className="mb-5"
            />
            <Card className="p-6 border-border/60">
            {/* Single table — same column structure as the Platforms
                table (Mention Rate · Avg. Mention Position · First
                Mention Share · Change · Status). Replaces the prior
                Strongest Topics + Largest Movement two-card layout;
                the same data now reads as a sortable, scannable list
                where row position IS the strongest-to-weakest story
                and the Change column subsumes the Largest Movement
                card. */}
              {topicTableRowsSorted.length === 0 ? (
                <div className="text-[13.5px] text-muted-foreground">
                  No measured topic coverage in this snapshot.
                </div>
              ) : (
                <div>
                  <table className="w-full text-left">
                    <colgroup>
                      <col style={{ width: "25%" }} />
                      <col style={{ width: "13%" }} />
                      <col style={{ width: "16%" }} />
                      <col style={{ width: "16%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "16%" }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-border/60 text-[10.5px] uppercase tracking-[0.06em] text-foreground/65">
                        <th className="py-2.5 pr-3 font-semibold">Topic</th>
                        <th className="py-2.5 px-3 text-right font-semibold">
                          <span className="inline-flex items-center justify-end gap-1">
                            Mention Rate
                            <KpiTooltipIcon
                              text="Share of monitored prompts on this topic where the subject was mentioned."
                              align="right"
                              direction="below"
                            />
                          </span>
                        </th>
                        <th className="py-2.5 px-3 text-right font-semibold">
                          <span className="inline-flex items-center justify-end gap-1">
                            Avg. Mention Position
                            <KpiTooltipIcon
                              text="Average answer position among responses on this topic where the subject is mentioned. Lower values mean the subject appears earlier in the answer."
                              align="right"
                              direction="below"
                            />
                          </span>
                        </th>
                        <th className="py-2.5 px-3 text-right font-semibold">
                          <span className="inline-flex items-center justify-end gap-1">
                            First Mention Share
                            <KpiTooltipIcon
                              text="Share of this topic's answers where the subject was the first-named entity. Pole-position visibility — being mentioned at all is one thing; being listed first is another."
                              align="right"
                              direction="below"
                            />
                          </span>
                        </th>
                        <th className="py-2.5 px-3 text-right font-semibold">
                          <span className="inline-flex items-center justify-end gap-1">
                            Change
                            <KpiTooltipIcon
                              text="Mention-rate change across the tracked window (first vs latest measured snapshot for this topic), in percentage points. Positive (green) = up across the window; negative (amber) = down. Renders an em-dash when there are fewer than two measured snapshots."
                              align="right"
                              direction="below"
                            />
                          </span>
                        </th>
                        <th className="py-2.5 pl-3 text-right font-semibold">
                          <span className="inline-flex items-center justify-end gap-1">
                            Status
                            <KpiTooltipIcon
                              text="Current visibility level (level only — trend lives in the Change column). Strong = mention rate ≥60% AND avg position ≤3; Weak = mention rate <30%; Moderate = anything in between; Limited Data = topic has no measured responses in this snapshot."
                              align="right"
                              direction="below"
                            />
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {topicTableRowsSorted.map((row) => {
                        const status = platformStatus({
                          mention_rate: row.mention_rate,
                          avg_rank: row.avg_rank,
                          n_responses: row.n_responses,
                        });
                        return (
                          <tr
                            key={row.label}
                            className="border-b border-border/30 last:border-0 text-[14px]"
                          >
                            <td className="py-3 pr-3 font-medium text-foreground">
                              <span
                                className="line-clamp-2"
                                title={capitalizeFirst(row.label)}
                              >
                                {capitalizeFirst(row.label)}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums text-foreground/90">
                              {formatPct(row.mention_rate)}
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums text-foreground/90">
                              {isPoorPosition(row.avg_rank) ? (
                                <span
                                  className="inline-flex items-center justify-end gap-1 font-semibold text-destructive"
                                  title={`Avg position ${formatRank(row.avg_rank)} — at or past the rank-${POOR_POSITION_THRESHOLD} threshold for a weak placement`}
                                >
                                  <AlertTriangle
                                    className="h-3.5 w-3.5"
                                    aria-hidden
                                  />
                                  {formatRank(row.avg_rank)}
                                </span>
                              ) : (
                                formatRank(row.avg_rank)
                              )}
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums text-foreground/90">
                              {formatPct(row.first_mention_rate)}
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums">
                              {row.delta === null ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <span
                                  className={`font-semibold ${deltaToneClass(row.delta)}`}
                                >
                                  {formatSignedPpRaw(row.delta)}
                                </span>
                              )}
                            </td>
                            <td className="py-3 pl-3 text-right">
                              <Pill tone={status.tone}>{status.label}</Pill>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </section>

          {/* ── 5. ANSWER POSITION ──────────────────────────────── */}
          <section id="position" className="scroll-mt-28">
            <SectionTitle
              eyebrow="Prominence"
              title="Answer Prominence"
              description="When mentioned, where this subject appears in the AI answer."
              className="mb-5"
            />
            <Card className="p-6 border-border/60">
              {(() => {
                // Four scope states for Answer Prominence:
                //   - neither filter set → aggregate `rank_distribution`
                //   - topic only         → `topic_leaderboard[t].subject_rank_buckets`
                //   - platform only      → `rank_distribution_by_platform[p].all_topics`
                //   - both               → `rank_distribution_by_platform[p].by_topic[t]`
                // Every source ships the same bucket schema so the
                // renderer below is shape-agnostic.
                const scopedTopic = topic
                  ? data.topic_leaderboard.find(
                      (t) => t.topic_label === topic,
                    )
                  : null;
                const scopedPlatformEntry = platform
                  ? (data.rank_distribution_by_platform ?? []).find(
                      (p) => p.slug === platform,
                    )
                  : null;
                const scopedPlatformName =
                  scopedPlatformEntry?.name ??
                  data.platform_topic_matrix.platforms.find(
                    (p) => p.slug === platform,
                  )?.name ??
                  null;
                const platformTopicBucket =
                  scopedPlatformEntry && topic
                    ? scopedPlatformEntry.by_topic.find(
                        (t) => t.topic_label === topic,
                      )
                    : null;
                // Defensive fallbacks: a stale uvicorn that hasn't
                // picked up either new field would otherwise crash
                // the takeaway helper. Falling back through wider
                // scopes keeps the section rendering until the API
                // catches up.
                const rankDist =
                  platformTopicBucket ??
                  scopedPlatformEntry?.all_topics ??
                  scopedTopic?.subject_rank_buckets ??
                  data.rank_distribution;
                // Avg rank: most specific scope first, mirroring the
                // rank-distribution fallback chain. The per-(platform,
                // topic) intersection lives on per_platform_kpis_by_topic;
                // platform-only lives on per_platform_kpis; topic-only
                // lives on topic_leaderboard's entities.
                const scopedSubjectEntity = scopedTopic
                  ? scopedTopic.entities.find((e) => e.is_subject)
                  : null;
                const perTopicPerPlatformAvgRank =
                  platform && topic
                    ? (
                        (data.per_platform_kpis_by_topic ?? []).find(
                          (t) => t.topic_label === topic,
                        )?.platforms.find(
                          (p) => p.slug === platform,
                        )?.avg_rank ?? null
                      )
                    : null;
                const perPlatformAvgRank =
                  platform && !topic
                    ? (data.per_platform_kpis.find(
                        (p) => p.slug === platform,
                      )?.avg_rank ?? null)
                    : null;
                const avgRank =
                  perTopicPerPlatformAvgRank ??
                  perPlatformAvgRank ??
                  (scopedTopic
                    ? (scopedSubjectEntity?.avg_rank ?? null)
                    : (focal?.avg_rank ?? null));
                // Scope label fragments — joined into "topic · platform"
                // eyebrow above the takeaway and into the "responses
                // mentioned X on this …" trailer. We only include a
                // fragment when the underlying data IS actually
                // scoped to it; falling back silently (e.g. the user
                // picked a topic that had no responses on the chosen
                // platform → platformTopicBucket = undefined → we'd
                // be reading platform-only data) would let the
                // eyebrow lie about the active scope.
                const topicActuallyScoped =
                  topic.length > 0 &&
                  (Boolean(platformTopicBucket) ||
                    Boolean(scopedTopic?.subject_rank_buckets));
                const platformActuallyScoped =
                  platform.length > 0 &&
                  Boolean(
                    platformTopicBucket || scopedPlatformEntry?.all_topics,
                  );
                const fellBackFromCombo =
                  topic.length > 0 &&
                  platform.length > 0 &&
                  !platformTopicBucket;
                const scopeFragments: string[] = [];
                if (topicActuallyScoped && scopedTopic) {
                  scopeFragments.push(
                    capitalizeFirst(scopedTopic.topic_label),
                  );
                }
                if (platformActuallyScoped && scopedPlatformName) {
                  scopeFragments.push(scopedPlatformName);
                }
                return (
              <div className="grid gap-6 lg:grid-cols-[280px_1fr] lg:items-center">
                {/* Takeaway + avg-rank callout */}
                <div>
                  {scopeFragments.length > 0 && (
                    <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-primary/80">
                      {scopeFragments.join(" · ")}
                    </div>
                  )}
                  {fellBackFromCombo && (
                    <div className="mb-2 text-[11.5px] leading-relaxed text-muted-foreground">
                      No responses for this topic on{" "}
                      {scopedPlatformName ?? "this platform"} in the
                      latest snapshot — showing platform totals across
                      all topics.
                    </div>
                  )}
                  <p className="text-[14px] leading-relaxed text-foreground/85">
                    {composeAnswerPositionTakeaway(
                      rankDist,
                      data.subject_name,
                    )}
                  </p>
                  <div className="mt-5 flex items-baseline gap-3">
                    {/* text-2xl matches the Overview KPI value
                        typography (e.g. AI Mention Rate's "90%")
                        so the avg-rank stat reads in the same
                        register as every other headline value
                        on the page. */}
                    <div className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
                      {formatRank(avgRank)}
                    </div>
                    <div className="inline-flex items-center gap-1 text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">
                      Avg. Mention Position
                      <KpiTooltipIcon
                        text="Answer prominence measures where the entity appears when it is mentioned. Rank 1 means the entity is the first one surfaced in the answer. Lower values mean earlier placement."
                        align="left"
                      />
                    </div>
                  </div>
                  <div className="mt-1 text-[12px] text-muted-foreground tabular-nums">
                    {rankDist.n_mentioned} of{" "}
                    {rankDist.total_responses} responses
                    mentioned {data.subject_name}
                    {(() => {
                      // Trailer reflects the active scope: "on this
                      // topic", "on {Platform}", or
                      // "on this topic on {Platform}".
                      if (scopedTopic && scopedPlatformName) {
                        return ` on this topic on ${scopedPlatformName}`;
                      }
                      if (scopedTopic) return " on this topic";
                      if (scopedPlatformName) {
                        return ` on ${scopedPlatformName}`;
                      }
                      return "";
                    })()}
                    .
                  </div>
                </div>

                {/* 5-bucket horizontal bars. Each bucket's width is
                    its share of total responses (so all bars sum to
                    100%). Bar treatment harmonized with KpiGauge
                    (h-1.5 track, 0.85 opacity, same rounded-full
                    chrome) so the page reads with one consistent
                    bar primitive across the Vitals strip and the
                    Prominence section. "Not mentioned" gets the
                    warning tone — it's the adverse outcome, not
                    just another bucket. */}
                <ul className="space-y-3">
                  {rankDist.buckets.map((b) => {
                    const pct = Math.round(b.share * 100);
                    const fillColor = b.is_absence
                      ? "var(--warning)"
                      : "var(--primary)";
                    return (
                      <li
                        key={b.label}
                        className="grid grid-cols-[120px_1fr_56px] items-center gap-4"
                      >
                        <span className="text-[13px] font-medium text-foreground/80">
                          {b.label}
                        </span>
                        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{
                              width: `${b.share * 100}%`,
                              background: fillColor,
                              opacity: 0.85,
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

          {/* Methodology footer — matches the Overview spoke's
              terminal footer so every spoke ends with the same
              data-provenance line + product tagline. */}
          <footer className="mt-12 pt-6 pb-8 border-t border-border/40">
            <p className="text-center text-[11.5px] text-foreground/70 leading-relaxed">
              Based on{" "}
              <span className="font-semibold text-foreground/80 tabular-nums">
                {data.meta.n_responses}
              </span>{" "}
              AI responses across{" "}
              <span className="font-semibold text-foreground/80">
                {data.meta.n_platforms} platforms
              </span>
              .{" "}
              <a href="#" className="text-primary hover:underline">
                Methodology →
              </a>
            </p>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Brand Visibility · AI Narrative Intelligence for Public Affairs
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
