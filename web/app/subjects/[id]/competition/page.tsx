/**
 * Competition spoke.
 *
 * Three stacked sections (Landscape / Co-Mentions / Platform
 * Ownership) with a floating SectionNav on the right at xl+. Same
 * narrative pattern as the Visibility hub — one continuous read,
 * no tabs hiding two-thirds of the content behind a click.
 *
 * Backed by the same `SubjectOverview` payload as Visibility, so no
 * new endpoint. Topic-scope dropdown on the Prominence table is
 * URL-driven via ?prominence_topic=.
 */
import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { Card, SectionTitle, Pill } from "@/components/dashboard/ui";
import { CompetitorBarsFromData } from "@/components/dashboard/Charts";
import { CompetitiveScatter } from "./CompetitiveScatter";
import { TopicProminenceFilter } from "./TopicProminenceFilter";
import { LandscapePlatformFilter } from "./LandscapePlatformFilter";
import { SectionNav } from "./SectionNav";
import { TrendOverTime } from "../visibility/TrendOverTime";
import { TrendWindowToggle } from "../visibility/TrendWindowToggle";
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

// Inline tooltip helper — kept on parity with the Visibility spoke's
// equivalent so column-header tooltips behave identically across
// pages. Trigger is a focusable `<span>` (not a `<button>`) so it
// can nest inside `<a>` wrappers; `role="button"` + `tabIndex={0}`
// + `aria-label` keep it keyboard-reachable and screen-reader-
// announced. Tooltip body has `role="tooltip"` and reveals on both
// hover and `focus-visible`. `direction="below"` flips the bubble
// when the trigger sits at the top of an `overflow-x-auto`
// container that would otherwise clip an above-positioned tooltip.
function KpiTooltipIcon({
  text,
  align = "center",
  direction = "above",
}: {
  text: string;
  align?: "left" | "center" | "right";
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

// Avg-position red-flag helper removed — the table no longer
// alarms on ranks ≥5 because later-rank values are just less-
// prominent, not data-quality issues. The composite Prominence
// Score column already encodes that signal numerically.

function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Already-in-pp formatter for the Change column.
function formatSignedPpRaw(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const pts = Math.round(v);
  if (pts === 0) return "0 pp";
  return `${pts > 0 ? "+" : ""}${pts} pp`;
}

// KPI polarity + tone helper. Mirrors the Visibility spoke's
// `toneByThreshold` so the briefing tiles on both spokes paint
// using the same success/warning/neutral semantics; kept module-
// local rather than imported because the Visibility spoke's
// version is declared inside its page-function scope.
type KpiPolarity = "higher_better" | "lower_better";
function toneByThreshold(
  value: number | null | undefined,
  polarity: KpiPolarity,
  good: number,
  bad: number,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "text-foreground";
  }
  if (polarity === "higher_better") {
    if (value >= good) return "text-success";
    if (value <= bad) return "text-warning";
    return "text-foreground";
  }
  // lower_better
  if (value <= good) return "text-success";
  if (value >= bad) return "text-warning";
  return "text-foreground";
}

function deltaToneClass(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0) return "text-muted-foreground";
  return v > 0 ? "text-success" : "text-warning";
}

// Status-pill semantics mirrored from the Visibility spoke's
// `platformStatus` helper so the Strong / Mixed / Weak verdict
// reads the same across both tables.
//
// Revised in this round to surface six descriptive states (Dominant,
// Strong visibility, Visible but late, Low visibility, Emerging,
// Declining) instead of the prior Strong / Mixed / Weak. The earlier
// scheme rendered "Mixed" for almost every row at this competitive
// snapshot, so the column carried no information. The new states
// combine SoV + first-mention + avg position + temporal change so
// each row reads as a distinct verdict.
// Replaced the prior single-column `entityStatus` (which mixed
// position-based verdicts with temporal ones) with two orthogonal
// columns: Current Position and Trend. Splitting them keeps the
// table honest — a Leader can be Declining, a Mid-tier entity can
// be Rising. Conflating the two into one verdict hid the cross-
// product.
type StatusTone = "success" | "warning" | "primary" | "neutral";
function currentPosition(row: {
  mention_rate: number | null;
  is_subject?: boolean;
  is_leader: boolean;
  leader_mention_rate: number | null;
}): { label: string; tone: StatusTone } {
  if (row.mention_rate === null) {
    return { label: "Insufficient data", tone: "neutral" };
  }
  if (row.is_leader) {
    return { label: "Leader", tone: "success" };
  }
  const leader = row.leader_mention_rate;
  if (leader === null || leader <= 0) {
    return { label: "Mid-tier", tone: "primary" };
  }
  const ratio = row.mention_rate / leader;
  if (ratio >= 0.6) {
    return { label: "Challenger", tone: "primary" };
  }
  if (ratio >= 0.25) {
    return { label: "Mid-tier", tone: "primary" };
  }
  return { label: "Low visibility", tone: "warning" };
}

function trendVerdict(deltaPp: number | null | undefined): {
  label: string;
  tone: StatusTone;
} {
  if (deltaPp === null || deltaPp === undefined || !Number.isFinite(deltaPp)) {
    return { label: "Insufficient data", tone: "neutral" };
  }
  if (deltaPp >= 10) return { label: "Rising", tone: "success" };
  if (deltaPp <= -10) return { label: "Declining", tone: "warning" };
  return { label: "Stable", tone: "primary" };
}

// First / last measured index in a sparse trajectory — used to
// compute Change values per-row when the underlying array has
// nulls (backfill gaps). Same approach as the Visibility spoke.
function measuredEndpoints(
  arr: (number | null)[],
): [number, number] | null {
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
}

// Returns the change-in-pp between the first and last measured value
// of an array, or null when there are fewer than two measured points.
function changeFromTrajectory(arr: (number | null)[] | undefined): number | null {
  if (!arr) return null;
  const endpoints = measuredEndpoints(arr);
  if (!endpoints) return null;
  const cur = arr[endpoints[1]];
  const pri = arr[endpoints[0]];
  if (cur === null || pri === null) return null;
  return (cur - pri) * 100;
}

type WhatChangedDelta = {
  label: string;
  deltaPp: number;
  kind: "overall" | "competitor";
};

// Composes the "What changed" footer for the Competition Trend chart.
// Same idea as the Visibility spoke's `composeWhatChanged`, but uses
// competitor mention-rate trajectories instead of topic trajectories
// so the deltas describe competitor movement, not topic movement.
function composeCompetitionWhatChanged({
  trajectoryWeeks,
  aiRecall,
  competitorTrajectories,
}: {
  trajectoryWeeks: SubjectOverview["trajectory"]["weeks"];
  aiRecall: (number | null)[];
  competitorTrajectories: SubjectOverview["competitor_trajectories"];
}): {
  deltas: WhatChangedDelta[];
  fallbackCopy: string | null;
  latestDate: string | null;
  priorDate: string | null;
} {
  const STABLE_COPY =
    "The comparison set is mostly stable across recent snapshots.";
  const len = trajectoryWeeks.length;
  if (len < 2) {
    return {
      deltas: [],
      fallbackCopy: STABLE_COPY,
      latestDate: trajectoryWeeks[len - 1] ?? null,
      priorDate: null,
    };
  }
  // Overall endpoints — define the visible-window range.
  const overallEndpoints = measuredEndpoints(aiRecall);
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

  const COMPETITOR_MIN_DELTA = 0.05;
  const OVERALL_MIN_DELTA = 0.01;

  const deltas: WhatChangedDelta[] = [];

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

  // Top competitor movers — each competitor uses its OWN first/last
  // measured indices so a sparse competitor still surfaces if it has
  // any two measured points in the window.
  const competitorMovers: WhatChangedDelta[] = [];
  for (const c of competitorTrajectories) {
    const endpoints = measuredEndpoints(c.mention_rate);
    if (!endpoints) continue;
    const [pIdx, lIdx] = endpoints;
    const cur = c.mention_rate[lIdx];
    const pri = c.mention_rate[pIdx];
    if (
      cur === null ||
      pri === null ||
      !Number.isFinite(cur) ||
      !Number.isFinite(pri)
    )
      continue;
    const d = (cur as number) - (pri as number);
    if (Math.abs(d) < COMPETITOR_MIN_DELTA) continue;
    competitorMovers.push({
      label: c.name,
      deltaPp: Math.round(d * 100),
      kind: "competitor",
    });
  }
  competitorMovers.sort((a, b) => Math.abs(b.deltaPp) - Math.abs(a.deltaPp));
  deltas.push(...competitorMovers.slice(0, 3));

  return {
    deltas,
    fallbackCopy: deltas.length === 0 ? STABLE_COPY : null,
    latestDate,
    priorDate,
  };
}

export default async function CompetitionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    prominence_topic?: string;
    landscape_platform?: string;
    trend_window?: string;
  }>;
}) {
  const { id: idStr } = await params;
  const sp = await searchParams;
  const prominenceTopic = sp.prominence_topic || "";
  const landscapePlatform = sp.landscape_platform || "";
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
  void subject;

  // URL-param sanitization — drop scope params whose value doesn't
  // match anything in the current payload (typos, stale links,
  // hand-tampered URLs). If any need dropping, redirect once to a
  // cleaned querystring so the dropdowns and URL agree on scope.
  {
    const validTopics = new Set(
      data.topic_leaderboard.map((t) => t.topic_label),
    );
    const validPlatforms = new Set(
      (data.per_platform_landscape?.platforms ?? []).map((p) => p.slug),
    );
    const sanitized: Record<string, string> = {
      prominence_topic: prominenceTopic,
      landscape_platform: landscapePlatform,
      trend_window: sp.trend_window || "",
    };
    let needsRedirect = false;
    if (prominenceTopic && !validTopics.has(prominenceTopic)) {
      sanitized.prominence_topic = "";
      needsRedirect = true;
    }
    if (
      landscapePlatform &&
      !validPlatforms.has(landscapePlatform)
    ) {
      sanitized.landscape_platform = "";
      needsRedirect = true;
    }
    // `trend_window` cleanup: drop unknown values + drop the
    // redundant "12w" default so link-shared URLs match the
    // toggle's own "no param = default" behavior.
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
      redirect(
        qs
          ? `/subjects/${subjectId}/competition?${qs}`
          : `/subjects/${subjectId}/competition`,
      );
    }
  }

  const subjectInitials = deriveInitials(data.subject_name);
  // headerMeta intentionally blank — the freshness / N indicator was
  // removed from the top bar at request. Small-sample advisories on
  // individual sections (Co-Mentions) still carry the responses count
  // where it's actionable.
  const headerMeta = "";

  const hasCompetitive = data.competitive.length > 0;
  const hasCoMentions =
    data.co_mention_frequency.subject_mention_count > 0 &&
    data.co_mention_frequency.co_mentions.length > 0;
  // `hasOwnership` is no longer derived here — the Platform
  // Ownership section now uses `hasOwnershipData`, computed later
  // from the scope-aware row/cell builders so a filter that empties
  // the heatmap (e.g. an unknown platform) still suppresses the
  // section instead of rendering an empty grid.

  // Canonical entity-color palette for the whole page. Building it
  // here (keyed by name) and threading it through every chart on the
  // page means the orange line in Trend, the orange dot in Scatter,
  // the orange bar in Competitive Share of Voice, and the orange
  // row-tint potential elsewhere all refer to the same entity.
  // Previously each chart picked its own colors, so a reader had to
  // re-read labels every time to map entity → series.
  //
  // Subject keeps the brand primary; competitors get one of the
  // muted-categorical hues by their order in data.competitive
  // (backend sorts by SoV desc, so the most-prominent competitor
  // gets the first hue every snapshot). Names that appear in
  // Co-Mentions but aren't in the comparison set (e.g. Joe Biden,
  // Richard Nixon) fall back to a neutral so they don't pull color
  // from a tracked competitor they aren't.
  // Lighter, lower-chroma variants so the competitor lines on the
  // Trend chart sit visibly behind the subject's primary line — the
  // categorical hues stay (each entity still has its own color), but
  // every competitor is closer to a pastel than to the prior muted
  // saturation. Combined with a lower stroke opacity on the chart
  // itself, the subject reads as the focal series and competitors
  // as supporting context.
  const COMPETITOR_LINE_COLORS = [
    "oklch(0.78 0.09 160)", // light teal
    "oklch(0.82 0.10 55)",  // light amber
    "oklch(0.74 0.08 310)", // light violet
    "oklch(0.76 0.10 25)",  // light red
    "oklch(0.78 0.08 240)", // light blue
    "oklch(0.76 0.08 130)", // light olive
  ];
  const ENTITY_FALLBACK_COLOR = "oklch(0.72 0.04 250)"; // muted slate
  const entityColorByName: Record<string, string> = {};
  {
    let competitorIdx = 0;
    for (const c of data.competitive) {
      if (c.is_subject) {
        entityColorByName[c.name] = "var(--primary)";
      } else {
        entityColorByName[c.name] =
          COMPETITOR_LINE_COLORS[competitorIdx % COMPETITOR_LINE_COLORS.length];
        competitorIdx++;
      }
    }
  }
  const colorForEntity = (name: string): string =>
    entityColorByName[name] ?? ENTITY_FALLBACK_COLOR;

  // ── Canonical entity set ─────────────────────────────────────────
  // One name set used by every chart on the page (Trend, SoV bars,
  // Scatter, Prominence table, Platform Ownership) so the same
  // competitors appear in the same order across all of them. Derived
  // from data.competitive (snapshot SoV ranking, subject pinned),
  // which the backend now ships at subject + 6 = 7 entries to match
  // LANDSCAPE_TOP_N. Co-Mentions stays outside this contract — it
  // legitimately shows entities beyond the comparison set, just
  // visually muted.
  const canonicalEntityNames = new Set(
    data.competitive.map((c) => c.name),
  );
  // Window-slicing helper mirrors the Visibility spoke's behavior —
  // `null` window = show everything; otherwise tail-slice to the
  // last N entries.
  const sliceTrendWindow = <T,>(arr: T[]): T[] => {
    if (trendWindowSize === null || trendWindowSize >= arr.length) return arr;
    return arr.slice(arr.length - trendWindowSize);
  };
  const trendWeeks = sliceTrendWindow(data.trajectory.weeks);
  const trendSubjectValues = sliceTrendWindow(data.trajectory.ai_recall);
  // Filter to the canonical entity set so the chart lines match the
  // SoV bars / Scatter / Prominence rows label-for-label. Without
  // this, competitor_trajectories' top-N ranking (by total
  // appearances across the window) can drift from data.competitive's
  // ranking (by latest-snapshot SoV) and surface a different
  // competitor in the chart than in the table.
  const trendOverlays = data.competitor_trajectories
    .filter((c) => canonicalEntityNames.has(c.name))
    .map((c) => ({
      name: c.name,
      color: colorForEntity(c.name),
      values: sliceTrendWindow(c.mention_rate),
    }));
  // Trimmed competitor trajectories for the "What changed" footer
  // so its deltas describe the same window the chart shows. Filter
  // through the canonical set too so a competitor that's in the
  // trajectory feed but not in the page's entity set can't surface
  // a delta the user can't see anywhere else.
  const trendCompetitorTrajectories = data.competitor_trajectories
    .filter((c) => canonicalEntityNames.has(c.name))
    .map((c) => ({
      ...c,
      mention_rate: sliceTrendWindow(c.mention_rate),
    }));
  const hasTrend =
    data.trajectory.weeks.length > 1 &&
    data.trajectory.ai_recall.some((v) => v !== null);

  // ── Landscape scoping ─────────────────────────────────────────
  // Compute one canonical entity list for all three Landscape
  // sub-cards (SoV bars · Scatter · Competitive Prominence table)
  // based on the active scope state:
  //   - platform set (with or without topic): use per_platform_landscape
  //   - topic only:                            use topic_leaderboard[t].entities
  //   - neither:                               use the aggregate data.competitive
  // Same shape across all three branches so the downstream renderers
  // don't need to know which branch fired.
  type LandscapeEntity = {
    name: string;
    sov: number;
    avg_rank: number | null;
    first_mention_rate: number;
    is_subject: boolean;
  };
  const landscapeByTopic = data.per_platform_landscape?.by_topic ?? [];
  const landscapePlatforms = data.per_platform_landscape?.platforms ?? [];
  const scopedLandscapePlatformName =
    landscapePlatforms.find((p) => p.slug === landscapePlatform)?.name ??
    null;
  const scopedLandscapeTopicEntry = prominenceTopic
    ? data.topic_leaderboard.find(
        (t) => t.topic_label === prominenceTopic,
      )
    : null;
  let landscapeEntities: LandscapeEntity[];
  let landscapeFellBackFromCombo = false;
  if (landscapePlatform) {
    const topicEntry = prominenceTopic
      ? landscapeByTopic.find(
          (t) => !t.is_all_topics && t.topic_label === prominenceTopic,
        )
      : landscapeByTopic.find((t) => t.is_all_topics);
    const platformEntry = topicEntry?.platforms.find(
      (p) => p.slug === landscapePlatform,
    );
    if (platformEntry) {
      landscapeEntities = platformEntry.entities.map((e) => ({
        name: e.name,
        sov: e.sov,
        avg_rank: e.avg_rank,
        first_mention_rate: e.first_mention_rate,
        is_subject: e.is_subject,
      }));
    } else {
      // (platform, topic) combo had zero responses — fall back to the
      // platform's all-topics entry so the section still renders
      // something useful, and surface a small advisory at the
      // section level (same pattern as the Visibility tab's Answer
      // Prominence fallback).
      const allTopicsEntry = landscapeByTopic.find(
        (t) => t.is_all_topics,
      );
      const fallbackPlatform = allTopicsEntry?.platforms.find(
        (p) => p.slug === landscapePlatform,
      );
      landscapeEntities = (fallbackPlatform?.entities ?? []).map((e) => ({
        name: e.name,
        sov: e.sov,
        avg_rank: e.avg_rank,
        first_mention_rate: e.first_mention_rate,
        is_subject: e.is_subject,
      }));
      if (prominenceTopic && allTopicsEntry && fallbackPlatform) {
        landscapeFellBackFromCombo = true;
      }
    }
  } else if (scopedLandscapeTopicEntry) {
    landscapeEntities = scopedLandscapeTopicEntry.entities.map((e) => ({
      name: e.name,
      sov: e.sov,
      avg_rank: e.avg_rank,
      first_mention_rate: e.first_mention_rate,
      is_subject: e.is_subject,
    }));
  } else {
    landscapeEntities = data.competitive.map((c) => ({
      name: c.name,
      sov: c.sov,
      avg_rank: c.avg_rank,
      first_mention_rate: c.first_mention_rate,
      is_subject: c.is_subject,
    }));
  }

  // Cap the section at top 5 entities by SoV desc, with the subject
  // force-included even if it would otherwise rank lower. Topic-
  // scoped data from `topic_leaderboard[t].entities` ships every
  // entity that appeared in that topic (often 15–20+), which made
  // the SoV bars, Scatter, and Prominence table balloon when the
  // dropdown was set — cap here so the same five-entity story holds
  // regardless of scope.
  // Canonical N for every entity-listing chart on the page. Picked
  // at 7 because the Trend chart starts to read as a tangle past 8
  // lines (subject + 7 = 8 max). All four charts (Trend, SoV bars,
  // Scatter, Prominence table, Platform Ownership rows) align to
  // this set so the same competitor always appears in the same
  // chart. Co-Mentions is the one place where entities outside the
  // canonical set legitimately appear — they get the muted slate
  // color so the comparison-set membership reads at a glance.
  const LANDSCAPE_TOP_N = 7;
  {
    const sortedBySov = [...landscapeEntities].sort(
      (a, b) => b.sov - a.sov,
    );
    const top = sortedBySov.slice(0, LANDSCAPE_TOP_N);
    const subjectAlreadyIn = top.some((e) => e.is_subject);
    if (!subjectAlreadyIn) {
      const subjectEntity = sortedBySov.find((e) => e.is_subject);
      if (subjectEntity) {
        // Replace the last slot so the list stays at LANDSCAPE_TOP_N
        // entries; mirrors the backend's top-N-with-subject-pinned
        // pattern in `_per_platform_entity_sov_for_refresh`.
        top[top.length - 1] = subjectEntity;
      }
    }
    landscapeEntities = top;
  }

  // ── Platform Ownership scoping ───────────────────────────────
  // The right-rail Filters panel is page-level, so the Platform
  // Ownership heatmap honors both dropdowns:
  //   - Topic only: rebuild rows/cells from per_platform_landscape's
  //     by_topic entry — same shape as the unscoped heatmap, just
  //     with mention rates aggregated within the chosen topic.
  //   - Platform only: filter to the chosen platform column. The
  //     heatmap collapses to one column showing per-entity SoV on
  //     that one LLM.
  //   - Both: combine both filters — single column, scoped to topic.
  //   - Neither: use the existing data.per_platform_entity_sov
  //     (unchanged for backward compatibility).
  type OwnershipRow = { name: string; is_subject: boolean };
  type OwnershipPlatform = {
    slug: string;
    name: string;
    n_responses: number;
  };
  type OwnershipCell = {
    platform_slug: string;
    entity_name: string;
    sov: number;
    n_appearances: number;
  };
  let ownershipRows: OwnershipRow[];
  let ownershipPlatforms: OwnershipPlatform[];
  let ownershipCells: OwnershipCell[];
  const hasOwnershipScope = Boolean(prominenceTopic || landscapePlatform);
  if (hasOwnershipScope) {
    const topicEntry = prominenceTopic
      ? landscapeByTopic.find(
          (t) => !t.is_all_topics && t.topic_label === prominenceTopic,
        )
      : landscapeByTopic.find((t) => t.is_all_topics);
    const platformEntries = (topicEntry?.platforms ?? []).filter((p) =>
      landscapePlatform ? p.slug === landscapePlatform : true,
    );

    // Aggregate per-entity appearances across the scoped platforms
    // so the row ordering matches the rest of the section (top by
    // total appearances; subject force-included).
    const appearancesByEntity: Record<string, number> = {};
    const isSubjectByEntity: Record<string, boolean> = {};
    let subjectName: string | null = null;
    for (const plat of platformEntries) {
      for (const ent of plat.entities) {
        appearancesByEntity[ent.name] =
          (appearancesByEntity[ent.name] ?? 0) + ent.n_appearances;
        isSubjectByEntity[ent.name] = ent.is_subject;
        if (ent.is_subject) subjectName = ent.name;
      }
    }
    const orderedNames = Object.keys(appearancesByEntity).sort(
      (a, b) => appearancesByEntity[b] - appearancesByEntity[a],
    );
    const topNames = orderedNames.slice(0, LANDSCAPE_TOP_N);
    if (
      subjectName &&
      !topNames.includes(subjectName) &&
      appearancesByEntity[subjectName]
    ) {
      if (topNames.length >= LANDSCAPE_TOP_N) {
        topNames[topNames.length - 1] = subjectName;
      } else {
        topNames.push(subjectName);
      }
    }

    ownershipRows = topNames.map((name) => ({
      name,
      is_subject: isSubjectByEntity[name] ?? false,
    }));

    const platformLookup = new Map(
      landscapePlatforms.map((p) => [p.slug, p]),
    );
    ownershipPlatforms = platformEntries.map((p) => ({
      slug: p.slug,
      name: platformLookup.get(p.slug)?.name ?? p.slug,
      n_responses: p.n_responses,
    }));

    ownershipCells = [];
    const topNamesSet = new Set(topNames);
    for (const plat of platformEntries) {
      for (const ent of plat.entities) {
        if (!topNamesSet.has(ent.name)) continue;
        ownershipCells.push({
          platform_slug: plat.slug,
          entity_name: ent.name,
          sov: ent.sov,
          n_appearances: ent.n_appearances,
        });
      }
    }
  } else {
    ownershipPlatforms = data.per_platform_entity_sov.platforms;
    ownershipRows = data.per_platform_entity_sov.entities.map((e) => ({
      name: e.name,
      is_subject: e.is_subject,
    }));
    ownershipCells = data.per_platform_entity_sov.cells;
  }
  const hasOwnershipData =
    ownershipPlatforms.length > 0 && ownershipRows.length > 0;

  // Head-to-head data flag. Today there's no backend builder for
  // per-(prompt × entity) co-occurrence, so this stays false and the
  // Wins & Losses section + its jump link are hidden. When the
  // builder lands, replace the literal with a real predicate on the
  // shipped data (e.g. `data.head_to_head?.rows.length > 0`).
  const hasWinsLossesData = false;

  // ── Competitive briefing KPIs ────────────────────────────────
  // Four tiles mirroring the Visibility spoke's briefing layout.
  // Each measures the subject RELATIVE to the comparison set —
  // not absolute presence — so the same visual frame carries a
  // different read on each spoke.
  const sortedBySovDesc = [...landscapeEntities].sort(
    (a, b) => b.sov - a.sov,
  );
  const subjectIdx = sortedBySovDesc.findIndex((e) => e.is_subject);
  const subjectEntity = subjectIdx >= 0 ? sortedBySovDesc[subjectIdx] : null;
  const competitiveRank = subjectIdx >= 0 ? subjectIdx + 1 : null;
  const competitiveSetSize = sortedBySovDesc.length;

  // Top Competitor — comparison-set entity whose Share of Voice
  // sits closest to the subject's. If the subject leads, this is
  // the nearest threat from below; if the subject trails, this is
  // the nearest rival from above. Names the specific competitor
  // to watch in one tile, which is information the abstract
  // counts/percents elsewhere on the page can't carry.
  let topCompetitorName: string | null = null;
  let topCompetitorGapPp: number | null = null;
  if (subjectEntity) {
    let nearest: (typeof sortedBySovDesc)[number] | null = null;
    let nearestDist = Infinity;
    for (const e of sortedBySovDesc) {
      if (e.is_subject) continue;
      const dist = Math.abs(e.sov - subjectEntity.sov);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = e;
      }
    }
    if (nearest) {
      topCompetitorName = nearest.name;
      topCompetitorGapPp = Math.round(
        (subjectEntity.sov - nearest.sov) * 100,
      );
    }
  }

  // Topic Win Rate — count of tracked topics where the subject is
  // the leading entity in the comparison set. Uses the same
  // `subject_is_leader` flag the topic-leaderboard rows carry,
  // so this number always agrees with the per-topic rows
  // elsewhere on the page.
  const topicsTracked = data.topic_leaderboard.length;
  const topicsLed = data.topic_leaderboard.filter(
    (t) => t.subject_is_leader,
  ).length;
  const topicWinRateFrac =
    topicsTracked > 0 ? topicsLed / topicsTracked : null;

  // Strongest Topic — the tracked topic where the subject has
  // its highest mention rate. Names the topic in the value slot
  // and surfaces the rate as the subtitle so the reader sees
  // "where you're most visible" at a glance.
  const strongestTopic =
    data.topic_leaderboard.length > 0
      ? [...data.topic_leaderboard].sort(
          (a, b) => b.subject_rate - a.subject_rate,
        )[0]
      : null;

  type CompetitionKpi = {
    label: string;
    value: string;
    helper: string;
    tooltip?: string;
    subtitle?: string;
    valueColor: string;
    polarity: KpiPolarity;
    anchor?: string;
  };
  const competitionKpis: CompetitionKpi[] = [
    {
      label: "Competitive Rank",
      value: competitiveRank ? `#${competitiveRank}` : "—",
      subtitle:
        competitiveSetSize > 0
          ? `of ${competitiveSetSize} tracked`
          : undefined,
      helper: "Subject's rank in the comparison set by Share of Voice.",
      tooltip:
        "Where the subject sits among the comparison-set entities when sorted by Share of Voice (1 = highest share). The same set powers the Landscape and Ranking sections below.",
      valueColor: toneByThreshold(competitiveRank, "lower_better", 2, 5),
      polarity: "lower_better",
      anchor: "ranking-table",
    },
    {
      label: "Top Competitor",
      value: topCompetitorName ?? "—",
      subtitle:
        topCompetitorName === null || topCompetitorGapPp === null
          ? undefined
          : topCompetitorGapPp === 0
            ? "tied on SoV"
            : topCompetitorGapPp > 0
              ? `${topCompetitorGapPp} pp behind subject`
              : `${Math.abs(topCompetitorGapPp)} pp ahead of subject`,
      helper: "Comparison entity closest to the subject in Share of Voice.",
      tooltip:
        "The single entity in the comparison set whose Share of Voice is nearest the subject's. Subtitle shows the gap in percentage points and which side of the subject they sit on. A larger gap = more breathing room from your nearest rival.",
      valueColor: toneByThreshold(
        topCompetitorGapPp,
        "higher_better",
        10,
        0,
      ),
      polarity: "higher_better",
      anchor: "landscape",
    },
    {
      label: "Topic Win Rate",
      value:
        topicsTracked > 0
          ? `${topicsLed} of ${topicsTracked}`
          : "—",
      subtitle: topicsTracked > 0 ? "topics led" : undefined,
      helper: "Topics where the subject ranks #1 in the comparison set.",
      tooltip:
        "Counts topics in the topic leaderboard where the subject is the leading entity. Pairs with the AI-platform view to give a where-you-win read across both axes.",
      valueColor: toneByThreshold(
        topicWinRateFrac,
        "higher_better",
        0.5,
        0.25,
      ),
      polarity: "higher_better",
      anchor: "landscape",
    },
    {
      label: "Strongest Topic",
      value: strongestTopic
        ? capitalizeFirst(strongestTopic.topic_label)
        : "—",
      subtitle:
        strongestTopic !== null
          ? `${Math.round(strongestTopic.subject_rate * 100)}% mention rate`
          : undefined,
      helper: "Topic where the subject's mention rate is highest.",
      tooltip:
        "Tracked topic where the subject's mention rate is highest in this snapshot. The subtitle shows that mention rate. Useful as a positive anchor when the rest of the briefing skews negative.",
      // Tone reflects the strongest topic's absolute mention rate
      // — even the "best" topic is worth flagging if it's still
      // below 40%. Mirrors the thresholds the Visibility spoke
      // uses for AI Mention Rate.
      valueColor: toneByThreshold(
        strongestTopic?.subject_rate ?? null,
        "higher_better",
        0.7,
        0.4,
      ),
      polarity: "higher_better",
      anchor: "landscape",
    },
  ];

  // Inline advisory used on sections that genuinely CAN'T scope on
  // the active filters (Trend chart's competitor lines, Co-Mentions
  // pairings) — surfacing it makes the data-limitation transparent
  // instead of silently ignoring the filters.
  const hasAnyFilter = Boolean(prominenceTopic || landscapePlatform);
  const filterAdvisoryText = (() => {
    const parts: string[] = [];
    if (prominenceTopic) parts.push(`Topic: ${prominenceTopic}`);
    if (scopedLandscapePlatformName) {
      parts.push(`Platform: ${scopedLandscapePlatformName}`);
    }
    return parts.join(" · ");
  })();

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar subjectId={subjectId} activeSection="competition" />

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

        <main className="flex-1 px-4 md:px-12 xl:pr-44 py-6 space-y-12 max-w-[1280px] w-full mx-auto">
          <Link
            href={`/subjects/${subjectId}`}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground hover:text-foreground transition-colors -mb-10"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back to {data.subject_name} Overview
          </Link>

          {/* Page H2 + subtitle removed at request. Sidebar's active
              "Competitive Visibility" pill and the breadcrumb above
              carry page identity; section eyebrows open content. */}

          {!hasCompetitive ? (
            <Card className="p-6 md:p-8 text-[13.5px] text-muted-foreground">
              No competitive set data in this snapshot yet.
            </Card>
          ) : (
            <>
              {/* ── COMPETITIVE BRIEFING ─────────────────────────── */}
              {/* Four KPI tiles that frame the rest of the page. The
                  Visibility spoke opens with four ABSOLUTE KPIs
                  (mention rate, avg position, first-mention share,
                  weakest topic); this spoke mirrors the visual frame
                  with four RELATIVE KPIs scoped to the comparison
                  set, so a reader switching between the two pages
                  sees the same hero layout but a different read. */}
              <section>
                <Card className="p-6 md:p-8">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {competitionKpis.map((k) => {
                      const tileInner = (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[12.5px] font-semibold uppercase tracking-[0.04em] text-foreground/65">
                              {k.label}
                            </span>
                            <KpiTooltipIcon
                              text={k.tooltip ?? k.helper}
                              align="right"
                            />
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
                          </div>
                        </>
                      );
                      const baseClasses =
                        "flex h-full flex-col rounded-lg border border-border/80 bg-background/60 p-5";
                      if (k.anchor) {
                        return (
                          <a
                            key={k.label}
                            href={`#${k.anchor}`}
                            className={`${baseClasses} transition-colors hover:border-primary/40 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40`}
                          >
                            {tileInner}
                          </a>
                        );
                      }
                      return (
                        <div key={k.label} className={baseClasses}>
                          {tileInner}
                        </div>
                      );
                    })}
                  </div>
                  {/* Current Platform Ownership — compact heatmap
                      inside the briefing card. Mirrors the Visibility
                      spoke's "Current Platform Snapshot" pattern:
                      same matrix as the standalone section once
                      lived in, visually de-emphasized so the four
                      KPI tiles above lead the read. The standalone
                      Platform Ownership section was retired in favor
                      of this in-briefing placement. */}
                  {hasOwnershipData && (
                    <div className="mt-8 border-t border-border/50 pt-6">
                      <div className="mb-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/55 inline-flex items-center gap-1">
                          Current Platform Ownership
                          <KpiTooltipIcon
                            text="Share of Voice for each comparison-set entity on each AI platform — share of that platform's monitored responses where the entity was mentioned. Darker cells mean stronger coverage."
                            align="left"
                          />
                        </div>
                        <p className="mt-1 text-[12.5px] text-muted-foreground">
                          Current Share of Voice by entity and AI platform.
                        </p>
                      </div>
                      <div className="overflow-x-auto">
                        <div
                          className="grid gap-1.5 min-w-fit"
                          style={{
                            gridTemplateColumns: `minmax(140px, auto) repeat(${ownershipPlatforms.length}, minmax(56px, 1fr))`,
                          }}
                        >
                          <div />
                          {ownershipPlatforms.map((p) => (
                            <div
                              key={p.slug}
                              className="px-1 text-center text-[10.5px] font-semibold uppercase tracking-[0.06em] text-foreground/60"
                            >
                              {p.name}
                            </div>
                          ))}
                          {ownershipRows.map((e) => (
                            <div
                              key={e.name}
                              style={{ display: "contents" }}
                            >
                              <div
                                className={`self-center pr-2 text-[12px] ${
                                  e.is_subject
                                    ? "font-semibold text-foreground"
                                    : "text-foreground/80"
                                }`}
                              >
                                {e.name}
                              </div>
                              {ownershipPlatforms.map((p) => {
                                const cell = ownershipCells.find(
                                  (c) =>
                                    c.platform_slug === p.slug &&
                                    c.entity_name === e.name,
                                );
                                const sov = cell?.sov ?? 0;
                                const bgAlphaPct = Math.round(
                                  (0.3 + sov * 0.45) * 100,
                                );
                                const titleLabel = `${p.name} × ${e.name}: ${Math.round(sov * 100)}% (${cell?.n_appearances ?? 0}/${p.n_responses})`;
                                return (
                                  <div
                                    key={p.slug}
                                    className={`relative flex h-8 items-center justify-center rounded-sm ${
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
                                      className={`text-[10.5px] font-semibold tabular-nums ${
                                        sov > 0.55
                                          ? "text-background"
                                          : "text-foreground"
                                      }`}
                                    >
                                      {Math.round(sov * 100)}%
                                    </span>
                                  </div>
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

              {/* ── 01. TREND ─────────────────────────────────────── */}
              {hasTrend && (
                <section id="trend" className="scroll-mt-20">
                  <SectionTitle
                    eyebrow="01 · Trend"
                    title="Competitive Visibility Over Time"
                    description={`How often ${data.subject_name} and comparison entities appear in AI answers over time.`}
                    className="mb-5"
                    right={<TrendWindowToggle />}
                  />
                  {/* When the page-level filters are active, the
                      Trend chart can't honor them yet — competitor
                      trajectories aren't broken down per topic or
                      per platform in the API. Surfacing the gap
                      keeps the global filter panel's intent honest
                      without silently ignoring the user's scope. */}
                  {hasAnyFilter && (
                    <div className="mb-4 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-[12.5px] leading-relaxed text-muted-foreground">
                      <span className="font-semibold text-foreground/85">
                        Filters not applied:
                      </span>{" "}
                      Trend trajectories aren&apos;t yet broken down
                      by ({filterAdvisoryText}) — showing the
                      all-snapshot view.
                    </div>
                  )}
                  {/* Chart + "What changed" footer share a single
                      card, same pattern as the Visibility trend. The
                      footer's deltas describe the chosen window
                      (overall subject delta + top 3 competitor
                      movers) so the chart and the prose stay in
                      sync as the user toggles 4w/8w/12w/All. */}
                  {/* Chart + "What changed" callout share a single
                      card. The callout is separated from the chart
                      with a thin top border so it reads as an
                      annotation of the chart rather than a sibling
                      card. Two stacked bordered surfaces felt heavy;
                      one card with an internal divider feels more
                      cohesive. */}
                  <Card className="p-6 md:p-8">
                    <TrendOverTime
                      subjectName={data.subject_name}
                      trajectoryWeeks={trendWeeks}
                      subjectValues={trendSubjectValues}
                      overlays={trendOverlays}
                      helperText="Mention rate shows the share of AI answers that mentioned each entity in the tracked prompt set."
                      overlayOpacity={0.5}
                      height={340}
                    />
                    {(() => {
                      const result = composeCompetitionWhatChanged({
                        trajectoryWeeks: trendWeeks,
                        aiRecall: trendSubjectValues,
                        competitorTrajectories: trendCompetitorTrajectories,
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
                      // Single-line eyebrow matching the Visibility
                      // spoke's "What changed · <prior> → <latest>"
                      // pattern. The prior version stacked the
                      // label and date on separate rows and led with
                      // a summary sentence — both removed so the
                      // footer reads as a one-line caption above the
                      // delta chips, identical to Visibility.
                      const eyebrow =
                        latestStr && priorStr
                          ? `What changed · ${priorStr} → ${latestStr}`
                          : latestStr
                            ? `What changed · since ${latestStr}`
                            : "What changed";
                      return (
                        <div className="mt-6 border-t border-border/60 pt-5">
                          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/55">
                            {eyebrow}
                          </div>
                          {result.deltas.length > 0 ? (
                            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2.5">
                              {result.deltas.map((d) => (
                                <li
                                  key={`${d.kind}:${d.label}`}
                                  className="inline-flex max-w-full items-baseline gap-2"
                                >
                                  <span
                                    className={`max-w-[260px] truncate text-[13px] ${
                                      d.kind === "overall"
                                        ? "font-medium text-foreground"
                                        : "text-foreground/80"
                                    }`}
                                    title={d.label}
                                  >
                                    {d.label}
                                  </span>
                                  <span
                                    className={`shrink-0 text-[13px] font-semibold tabular-nums ${deltaToneClass(
                                      d.deltaPp,
                                    )}`}
                                  >
                                    {formatSignedPpRaw(d.deltaPp)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-3 text-[13.5px] leading-relaxed text-foreground/85">
                              {result.fallbackCopy}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </Card>
                </section>
              )}
              {/* ── 02. LANDSCAPE ─────────────────────────────────── */}
              <section id="landscape" className="scroll-mt-20">
                <SectionTitle
                  eyebrow="02 · Landscape"
                  title="Competitive Visibility Landscape"
                  description={(() => {
                    const parts: string[] = [];
                    if (prominenceTopic) {
                      parts.push(`scoped to ${prominenceTopic}`);
                    }
                    if (scopedLandscapePlatformName) {
                      parts.push(`on ${scopedLandscapePlatformName}`);
                    }
                    if (parts.length === 0) {
                      return "Who dominates AI answers, and whether they appear early or late in the response.";
                    }
                    return `Who dominates AI answers ${parts.join(", ")}, and whether they appear early or late in the response.`;
                  })()}
                />
                {landscapeFellBackFromCombo && scopedLandscapePlatformName && (
                  <div className="mb-4 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-[12.5px] leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-foreground/85">
                      No responses
                    </span>{" "}
                    for this topic on{" "}
                    {scopedLandscapePlatformName} in the latest snapshot
                    — showing{" "}
                    {scopedLandscapePlatformName}{" "}
                    totals across all topics.
                  </div>
                )}
                <div className="grid gap-5 lg:grid-cols-2">
                  <Card className="p-5 md:p-6">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/55">
                      Competitive Share of Voice
                    </div>
                    <p className="mb-4 text-[12.5px] text-muted-foreground">
                      Share of AI answers mentioning each entity in
                      the selected comparison set.
                    </p>
                    <CompetitorBarsFromData
                      data={landscapeEntities.map((c) => ({
                        name: c.name,
                        sov: c.sov,
                        is_subject: c.is_subject,
                      }))}
                      colorByName={entityColorByName}
                      height={280}
                    />
                  </Card>

                  <Card className="p-5 md:p-6">
                    <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/55">
                      Visibility vs. Prominence
                    </div>
                    <CompetitiveScatter
                      entities={landscapeEntities.map((c) => ({
                        name: c.name,
                        sov: c.sov,
                        avg_rank: c.avg_rank,
                        is_subject: c.is_subject,
                      }))}
                      colorByName={entityColorByName}
                    />
                  </Card>
                </div>
              </section>

              {/* ── 03. RANKING TABLE ───────────────────────────── */}
              <section id="ranking-table" className="scroll-mt-20">
                <SectionTitle
                  eyebrow="03 · Ranking"
                  title="Competitive Ranking Table"
                  description="Competitive prominence combines visibility, average answer position, and first-mention rate into a single comparison score."
                  className="mb-5"
                />
                <Card className="p-5 md:p-6">
                  {/* No `overflow-x-auto` wrapper — the table already
                      fits at common card widths after the column
                      headers were tightened to short labels (Avg.
                      Position, 1st Mention). Removing the scroll
                      wrapper drops the gray scrollbar that was
                      otherwise pinned to the bottom of the card.
                      The text-wrap on the Entity column absorbs the
                      occasional narrow-viewport squeeze without
                      data being clipped. */}
                  <div>
                    {(() => {
                      // Row source is the section-level canonical
                      // `landscapeEntities` — already reflects the
                      // active (platform, topic) scope, so the table
                      // doesn't have to recompute it. Sort desc by
                      // Share of Voice (the table's leading metric
                      // column) since the composite Prominence Score
                      // column was retired.
                      const rows = [...landscapeEntities].sort(
                        (a, b) => b.sov - a.sov,
                      );
                      // Leader = entity with the highest SoV in the
                      // current scope. Used by `currentPosition` to
                      // compute Challenger / Mid-tier / Low-visibility
                      // thresholds as a fraction of the leader.
                      const leaderRow = [...landscapeEntities].sort(
                        (a, b) => b.sov - a.sov,
                      )[0];
                      const leaderName = leaderRow?.name ?? null;
                      const leaderSov = leaderRow?.sov ?? null;
                      return (
                        <table className="w-full text-left">
                          <thead>
                            <tr className="border-b border-border/60 text-[10px] uppercase tracking-[0.06em] text-foreground/65">
                              <th className="py-3 pr-4 font-semibold">
                                <span className="inline-flex items-center gap-1">
                                  Entity
                                  <KpiTooltipIcon
                                    text="The subject (highlighted with a Selected pill) plus the top competitor entities AI surfaced alongside them in this snapshot. Names come from the competitors_mentioned extraction; name variants are not deduped."
                                    align="left"
                                    direction="below"
                                  />
                                </span>
                              </th>
                              <th className="py-3 px-3 text-right font-semibold whitespace-nowrap">
                                <span className="inline-flex items-center justify-end gap-1">
                                  Share of Voice
                                  <KpiTooltipIcon
                                    text="Share of Voice — fraction of unnamed-layer responses where this entity appeared. Same definition for every row, so each entity's value is comparable to every other."
                                    align="right"
                                    direction="below"
                                  />
                                </span>
                              </th>
                              <th className="py-3 px-3 text-right font-semibold whitespace-nowrap">
                                <span className="inline-flex items-center justify-end gap-1">
                                  Avg. Position
                                  <KpiTooltipIcon
                                    text="Average answer position when this entity was mentioned. Lower is better; 1.0 means always listed first. Renders an em-dash when the entity was never measured at a known rank in this snapshot."
                                    align="right"
                                    direction="below"
                                  />
                                </span>
                              </th>
                              <th className="py-3 px-3 text-right font-semibold whitespace-nowrap">
                                <span className="inline-flex items-center justify-end gap-1">
                                  First Mention Rate
                                  <KpiTooltipIcon
                                    text="Share of responses where this entity was AI's first-named entity (rank #1). Pole-position visibility — different from Share, which counts any mention regardless of rank."
                                    align="right"
                                    direction="below"
                                  />
                                </span>
                              </th>
                              <th className="py-3 px-3 text-right font-semibold whitespace-nowrap">
                                <span className="inline-flex items-center justify-end gap-1">
                                  {trendWindowKey === "all"
                                    ? "Change vs all"
                                    : `Change vs ${trendWindowKey}`}
                                  <KpiTooltipIcon
                                    text={`Mention-rate change across the selected ${trendWindowKey === "all" ? "all-time" : trendWindowKey} trend window (first vs latest measured snapshot for this entity), in percentage points. Renders an em-dash when there's fewer than two measured snapshots, or when scoped to a single topic (per-topic per-entity trajectories aren't tracked yet).`}
                                    align="right"
                                    direction="below"
                                  />
                                </span>
                              </th>
                              <th className="py-3 px-3 text-right font-semibold whitespace-nowrap">
                                <span className="inline-flex items-center justify-end gap-1">
                                  Current Position
                                  <KpiTooltipIcon
                                    text="Where this entity sits in the comparison set today, by share of voice. Leader = highest share. Challenger ≥60% of the leader's share. Mid-tier ≥25%. Low visibility below that."
                                    align="right"
                                    direction="below"
                                  />
                                </span>
                              </th>
                              <th className="py-3 pl-3 text-right font-semibold whitespace-nowrap">
                                <span className="inline-flex items-center justify-end gap-1">
                                  Trend
                                  <KpiTooltipIcon
                                    text="Direction across the tracked window: Rising = +10 pp or more, Declining = -10 pp or worse, Stable = within ±10 pp, Insufficient data = fewer than two measured snapshots."
                                    align="right"
                                    direction="below"
                                  />
                                </span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((c) => {
                              // Change column: pull from the
                              // window-aware trajectories — subject
                              // uses ai_recall, everyone else looks
                              // up by name. When the section is
                              // scoped to a topic OR a platform,
                              // skip the change calc entirely (no
                              // per-(scope × entity) trajectories
                              // exist) so we don't show a misleading
                              // all-topics / all-platforms delta in
                              // a scoped table.
                              const change =
                                prominenceTopic || landscapePlatform
                                  ? null
                                  : c.is_subject
                                    ? changeFromTrajectory(
                                        data.trajectory.ai_recall,
                                      )
                                    : changeFromTrajectory(
                                        data.competitor_trajectories.find(
                                          (ct) => ct.name === c.name,
                                        )?.mention_rate,
                                    );
                              const position = currentPosition({
                                mention_rate: c.sov,
                                is_subject: c.is_subject,
                                is_leader: c.name === leaderName,
                                leader_mention_rate: leaderSov,
                              });
                              const trend = trendVerdict(change);
                              return (
                                <tr
                                  key={c.name}
                                  className={`border-b border-border/30 last:border-0 text-[13.5px] ${c.is_subject ? "bg-primary/[0.04]" : ""}`}
                                >
                                  <td className="py-3.5 pr-4 font-medium text-foreground">
                                    <span className="inline-flex items-center gap-2">
                                      {c.name}
                                      {c.is_subject && (
                                        <Pill tone="primary">Selected</Pill>
                                      )}
                                    </span>
                                  </td>
                                  <td className="py-3.5 px-3 text-right tabular-nums text-foreground/85">
                                    {Math.round(c.sov * 100)}%
                                  </td>
                                  {/* Avg position renders plain —
                                      the red-warning-triangle
                                      treatment for ranks ≥5 made
                                      ordinary later-rank values
                                      read as errors. Lower rank
                                      is just less-prominent, not a
                                      data-quality issue. */}
                                  <td className="py-3.5 px-3 text-right tabular-nums text-foreground/85">
                                    {c.avg_rank === null
                                      ? "—"
                                      : c.avg_rank.toFixed(1)}
                                  </td>
                                  <td className="py-3.5 px-3 text-right tabular-nums text-foreground/85">
                                    {Math.round(c.first_mention_rate * 100)}%
                                  </td>
                                  <td className="py-3.5 px-3 text-right tabular-nums">
                                    {change === null ? (
                                      <span className="text-muted-foreground">
                                        —
                                      </span>
                                    ) : (
                                      <span
                                        className={`font-semibold ${deltaToneClass(change)}`}
                                      >
                                        {formatSignedPpRaw(change)}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3.5 px-3 text-right whitespace-nowrap">
                                    <Pill tone={position.tone}>
                                      {position.label}
                                    </Pill>
                                  </td>
                                  <td className="py-3.5 pl-3 text-right whitespace-nowrap">
                                    <Pill tone={trend.tone}>
                                      {trend.label}
                                    </Pill>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                </Card>
              </section>

              {/* ── 04. COMPETITIVE WINS & LOSSES ────────────────── */}
              {/* Head-to-head comparisons. Hidden from the public
                  dashboard unless real comparable prompt-level data
                  exists — showing only a "data not available" card
                  with no underlying numbers reads as incomplete
                  rather than informative. When the backend builder
                  ships per-(prompt × entity) co-occurrence data,
                  set `hasWinsLossesData` from that source and the
                  section (and its jump link) will surface. */}
              {hasWinsLossesData && (
                <section id="wins-losses" className="scroll-mt-20">
                  <SectionTitle
                    eyebrow="04 · Wins & Losses"
                    title="Competitive Wins & Losses"
                    description={`Head-to-head comparisons showing where ${data.subject_name} appears more often or more prominently than each competitor.`}
                    className="mb-5"
                  />
                  {/* Real table renders here once data ships. */}
                </section>
              )}

              {/* ── 05. CO-MENTIONS ──────────────────────────────── */}
              <section id="co-mentions" className="scroll-mt-20">
                <SectionTitle
                  eyebrow="05 · Co-Mentions"
                  title={`Entities Mentioned Alongside ${data.subject_name}`}
                  description={`Figures that appear in the same AI answers as ${data.subject_name}.`}
                />
                {/* Filter advisory shown when topic/platform scope is
                    active — Co-Mentions data isn't yet broken down
                    per scope so the global filters can't apply here. */}
                {hasAnyFilter && (
                  <div className="mb-4 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-[12.5px] leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-foreground/85">
                      Filters not applied:
                    </span>{" "}
                    Co-mentions aren&apos;t yet broken down by (
                    {filterAdvisoryText}) — showing the all-snapshot
                    view.
                  </div>
                )}
                {hasCoMentions ? (
                  <Card className="p-5 md:p-6">
                    <p className="mb-4 max-w-3xl text-[13px] leading-relaxed text-foreground/75">
                      Co-mentions show which figures appear in the
                      same AI answers as {data.subject_name}. They do
                      not imply favorability, endorsement, or ranking.
                    </p>
                    <ul className="space-y-3">
                      {data.co_mention_frequency.co_mentions.map((row) => {
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
                                  background: colorForEntity(row.name),
                                  opacity: 0.85,
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
                      })}
                    </ul>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
                      <span>
                        Higher values mean the figure more often appears
                        in the same response as {data.subject_name}.
                      </span>
                      <span>
                        Muted bars = figures outside the tracked
                        comparison set.
                      </span>
                    </div>
                  </Card>
                ) : (
                  <Card className="p-5 md:p-6 text-[13px] text-muted-foreground">
                    Not enough subject-mention responses in this snapshot
                    to compute co-mentions.
                  </Card>
                )}
              </section>
            </>
          )}
        </main>

        {hasCompetitive && (
          <SectionNav
            hasWinsLossesData={hasWinsLossesData}
            summary={(() => {
              // Competitive Summary card — four executive-read
              // takeaways computed from the same filtered data the
              // page below shows. Each row falls back gracefully
              // when the underlying metric can't be computed.
              type SummaryRow = { label: string; value: string };

              // Visibility leader: highest current SoV in the
              // active scope.
              const sortedBySov = [...landscapeEntities].sort(
                (a, b) => b.sov - a.sov,
              );
              const visibilityLeader = sortedBySov[0]?.name ?? "—";

              // Biggest gainer: largest positive change in mention
              // rate across the trend window.
              const deltaForName = (name: string): number | null => {
                if (name === data.subject_name) {
                  return changeFromTrajectory(trendSubjectValues);
                }
                const t = trendCompetitorTrajectories.find(
                  (c) => c.name === name,
                );
                return t ? changeFromTrajectory(t.mention_rate) : null;
              };
              const movers = landscapeEntities
                .map((c) => ({
                  name: c.name,
                  delta: deltaForName(c.name),
                }))
                .filter(
                  (m): m is { name: string; delta: number } =>
                    m.delta !== null && Number.isFinite(m.delta),
                );
              const biggestGainer = [...movers]
                .filter((m) => m.delta > 0)
                .sort((a, b) => b.delta - a.delta)[0];
              const gainerValue = biggestGainer
                ? `${biggestGainer.name} +${Math.round(biggestGainer.delta)} pp`
                : "Not enough history";

              // Closest competitor: prominence-score nearest to
              // subject's. Use the indexFor formula from the table.
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
              const subjectEntity = landscapeEntities.find(
                (e) => e.is_subject,
              );
              const subjectScore = subjectEntity
                ? indexFor(subjectEntity)
                : null;
              let closestCompetitorName = "—";
              if (subjectScore !== null) {
                const competitors = landscapeEntities
                  .filter((e) => !e.is_subject)
                  .map((e) => ({ name: e.name, score: indexFor(e) }))
                  .sort(
                    (a, b) =>
                      Math.abs(a.score - subjectScore) -
                      Math.abs(b.score - subjectScore),
                  );
                if (competitors[0]) {
                  closestCompetitorName = competitors[0].name;
                }
              }

              const rows: SummaryRow[] = [
                {
                  label: "Visibility leader",
                  value: visibilityLeader,
                },
                { label: "Biggest gainer", value: gainerValue },
                {
                  label: "Closest competitor",
                  value:
                    closestCompetitorName === "—"
                      ? "Not enough data"
                      : closestCompetitorName,
                },
              ];

              // SummaryRow pattern — muted 11px label above a
              // semibold 14px value, spaced for at-a-glance scan in
              // the narrow right rail. Truncates long entity names
              // gracefully and surfaces the full string via `title`.
              const SummaryRow = ({
                label,
                value,
              }: {
                label: string;
                value: string;
              }) => (
                <div className="space-y-1">
                  <div className="text-[11px] leading-none text-muted-foreground">
                    {label}
                  </div>
                  <div
                    className="truncate text-sm font-semibold leading-snug text-foreground"
                    title={value}
                  >
                    {value}
                  </div>
                </div>
              );

              return (
                <div>
                  <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Competitive Summary
                  </div>
                  <div className="space-y-4">
                    {rows.map((r) => (
                      <SummaryRow
                        key={r.label}
                        label={r.label}
                        value={r.value}
                      />
                    ))}
                  </div>
                </div>
              );
            })()}
            filters={
              <>
                <TopicProminenceFilter
                  topics={data.topic_leaderboard.map((t) => ({
                    label: t.topic_label,
                  }))}
                />
                <LandscapePlatformFilter
                  platforms={landscapePlatforms.map((p) => ({
                    slug: p.slug,
                    name: p.name,
                  }))}
                />
              </>
            }
          />
        )}
      </div>
    </div>
  );
}
