/**
 * Competition spoke.
 *
 * Five stacked sections (Vitals / Trend / Landscape / Ranking /
 * Co-Mentions) with a sticky horizontal sub-nav at the top, same
 * pattern as the Visibility spoke — one continuous read, no tabs
 * hiding two-thirds of the content behind a click.
 *
 * Backed by the same `SubjectOverview` payload as Visibility, so no
 * new endpoint. Topic-scope dropdown on the Prominence table is
 * URL-driven via ?prominence_topic=.
 */
import { Info } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { Card, SectionTitle, Pill, KpiGauge } from "@/components/dashboard/ui";
import { CompetitiveScatter } from "./CompetitiveScatter";
import { TopicProminenceFilter } from "./TopicProminenceFilter";
import { LandscapePlatformFilter } from "./LandscapePlatformFilter";
import { OverviewSubNav } from "../OverviewSubNav";
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
import { getKpiValueColor } from "@/lib/kpiThresholds";
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

// Already-in-pp formatter for the Change column. Renders as "pts"
// (points) for consistency with the Visibility spoke's wording.
function formatSignedPpRaw(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const pts = Math.round(v);
  if (pts === 0) return "0 pts";
  return `${pts > 0 ? "+" : ""}${pts} pts`;
}

// KPI polarity is documentation-only after the shared
// getKpiValueColor resolver from @/lib/kpiThresholds replaced the
// local toneByThreshold helper. Kept on the KPI config shape so
// new metrics can still declare their direction-of-better intent.
type KpiPolarity = "higher_better" | "lower_better";

function deltaToneClass(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0) return "text-muted-foreground";
  return v > 0 ? "text-success" : "text-warning";
}

type StatusTone = "success" | "warning" | "primary" | "neutral";

// Tier verdict for a single entity based on its share of voice
// relative to the comparison-set leader. Mirrors the original
// Status-column semantics so the subject row's pill reads with the
// same Leader / Challenger / Mid-tier / Low-visibility language the
// Bottom Line sentence uses. Peer rows intentionally don't render a
// pill today (user chose to keep the peer table slim); this helper
// is kept symmetric in case peer pills come back.
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

// Inline SVG sparkline sized to fit the bottom of a KPI tile. Matches
// the Overview Vitals TinySpark visually (~22px tall, asymmetric pad
// 40/15 so flat lines don't graze the floor). Connects only adjacent
// finite points and renders nothing when fewer than two finite values
// exist — preserves vertical rhythm via the parent's reserved slot.
function TinySpark({
  values,
  color = "var(--primary)",
}: {
  values: (number | null)[];
  color?: string;
}) {
  const numeric = values.filter(
    (v): v is number => v !== null && Number.isFinite(v),
  );
  if (numeric.length < 2) return null;
  const dataMin = Math.min(...numeric);
  const dataMax = Math.max(...numeric);
  const rawRange = dataMax - dataMin || 1;
  const plotMin = dataMin - rawRange * 0.4;
  const plotMax = dataMax + rawRange * 0.15;
  const range = plotMax - plotMin || 1;
  const w = 120;
  const h = 22;
  const pad = 2;
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const path: string[] = [];
  let lastWasNull = false;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      lastWasNull = true;
      return;
    }
    const x = pad + i * step;
    const y = h - pad - ((v - plotMin) / range) * (h - pad * 2);
    path.push(path.length === 0 || lastWasNull ? `M${x},${y}` : `L${x},${y}`);
    lastWasNull = false;
  });
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="w-full h-[22px]"
      aria-hidden
    >
      <path d={path.join(" ")} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
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

  // Field-wide consolidation: when every rendered delta carries the
  // SAME rounded value (e.g. overall -10 pts, Wes Moore -10 pts,
  // J.B. Pritzker -10 pts, Gretchen Whitmer -10 pts), the per-entity
  // strip becomes "-10 pts" four times in a row — no new signal
  // after the first chip. Collapse to a single field-wide line so
  // the section carries new information rather than the same number
  // repeated. Requires ≥3 deltas to trigger; smaller strips keep
  // the per-entity rows because the comparison is short enough to
  // read at a glance.
  const finalDeltas: WhatChangedDelta[] = (() => {
    if (deltas.length < 3) return deltas;
    const first = deltas[0].deltaPp;
    if (first === 0) return deltas;
    const allMatch = deltas.every((d) => d.deltaPp === first);
    if (!allMatch) return deltas;
    return [
      {
        label: `All ${deltas.length} tracked movers`,
        deltaPp: first,
        kind: "overall",
      },
    ];
  })();

  return {
    deltas: finalDeltas,
    fallbackCopy: finalDeltas.length === 0 ? STABLE_COPY : null,
    latestDate,
    priorDate,
  };
}

// SoV-tuned heatmap tiers for the Current Platform Ownership grid.
// Same 3-tier + null pattern as the Visibility spoke's `heatTier`,
// but the breakpoints differ — mention-rate's 60%/30% bands don't
// translate to SoV (in a 5-competitor field even a dominant subject
// sits around 25-40% share). Thresholds match the spec's recommended
// SoV-appropriate breakpoints: dominant ≥40%, contested 15-40%,
// marginal <15%. Color treatment mirrors Visibility for cross-spoke
// consistency (warning amber on the loss cell, calm primary tint on
// dominance), so a reader who learned the heatmap palette on one
// spoke reads the other identically.
const SOV_DOMINANT = 0.4;
const SOV_MARGINAL = 0.15;
type SovTier = "dominant" | "contested" | "marginal" | "none";
function sovTier(sov: number | null): SovTier {
  if (sov === null || !Number.isFinite(sov)) return "none";
  if (sov >= SOV_DOMINANT) return "dominant";
  if (sov < SOV_MARGINAL) return "marginal";
  return "contested";
}
function sovTierStyle(tier: SovTier): {
  background: string;
  border: string;
  textClass: string;
} {
  switch (tier) {
    case "dominant":
      // Strong primary fill (was 18% — too close to contested). The
      // Competition heatmap inverts the Visibility heatmap's intent:
      // here the dominant cells SHOULD pop because they're the wins.
      // 55% primary + primary-toned border gives an obvious step up
      // from contested's neutral gray; the border doubles as a
      // weight cue so the separation survives in grayscale.
      return {
        background: "color-mix(in oklab, var(--primary) 55%, transparent)",
        border: "1px solid color-mix(in oklab, var(--primary) 75%, transparent)",
        // Light text on the saturated fill — the % stays legible.
        textClass: "text-background font-bold",
      };
    case "contested":
      // Mid-gray neutral tint, clearly weaker than dominant's strong
      // primary, clearly stronger than the marginal warning tint.
      // 75% muted (was 65%) widens the gap from no-data's hatched
      // treatment below.
      return {
        background: "color-mix(in oklab, var(--muted) 75%, transparent)",
        border: "1px solid transparent",
        textClass: "text-foreground/75 font-medium",
      };
    case "marginal":
      // Warning amber + border. Distinct COLOR family from the
      // calm primary/muted dominant/contested cells, not just a
      // lightness step — signals "weakest non-empty state" by hue,
      // which survives colorblind perception better than alpha alone.
      return {
        background: "color-mix(in oklab, var(--warning) 22%, transparent)",
        border: "1px solid color-mix(in oklab, var(--warning) 55%, transparent)",
        textClass: "text-warning font-bold",
      };
    case "none":
      // Diagonal hatch pattern via repeating-linear-gradient —
      // visually distinct from "low value" so a 0% cell (which can't
      // happen here since 0 collapses to marginal) and a no-data
      // cell never look identical. The hatch reads as "empty slot,
      // intentionally" rather than as a faint fill.
      return {
        background:
          "repeating-linear-gradient(45deg, color-mix(in oklab, var(--muted) 25%, transparent), color-mix(in oklab, var(--muted) 25%, transparent) 4px, color-mix(in oklab, var(--muted-foreground) 12%, transparent) 4px, color-mix(in oklab, var(--muted-foreground) 12%, transparent) 8px)",
        border:
          "1px dashed color-mix(in oklab, var(--muted-foreground) 45%, transparent)",
        textClass: "text-muted-foreground",
      };
  }
}

// Bottom-line summary for the Competition spoke's Vitals card.
// Mirrors the Visibility spoke's `composeBottomLine` pattern: a
// short data-derived paragraph that opens the section with the
// punchline before the KPI tiles + heatmap fill in detail. Two
// sentences: ranking + gap clause, then topic-win clause. Returns
// null when there aren't enough entities to say anything useful;
// callers fall back to a static line in that case.
//
// Filter-aware: when the user has scoped the page via the topic or
// platform dropdown in the sub-nav, the sentence prefixes with the
// active scope ("On ChatGPT, …" / "On ChatGPT in current events, …")
// so the reader knows the rank/SoV/gap numbers are scoped, not the
// unfiltered snapshot. The numbers themselves were already filter-
// aware (computed from `landscapeEntities`, which is scoped); only
// the framing copy was misleading.
function composeCompetitiveBottomLine({
  subjectName,
  subjectEntity,
  sortedBySovDesc,
  competitiveRank,
  competitiveSetSize,
  topicsLed,
  topicsTracked,
  scopedPlatformName,
  scopedTopicLabel,
}: {
  subjectName: string;
  subjectEntity: { name: string; sov: number; is_subject: boolean } | null;
  sortedBySovDesc: { name: string; sov: number; is_subject: boolean }[];
  competitiveRank: number | null;
  competitiveSetSize: number;
  topicsLed: number;
  topicsTracked: number;
  scopedPlatformName?: string | null;
  scopedTopicLabel?: string | null;
}): string | null {
  if (
    !subjectEntity ||
    competitiveRank === null ||
    competitiveSetSize < 2
  ) {
    return null;
  }
  const sovPct = Math.round(subjectEntity.sov * 100);
  const isLeader = competitiveRank === 1;
  // Gap reference: when leading, look DOWN to the runner-up; when
  // trailing, look UP to the leader. Either way the gap clause
  // contextualizes how secure / how distant the subject sits.
  const referenceEntity = isLeader
    ? sortedBySovDesc[1]
    : sortedBySovDesc[0];
  let gapClause = "";
  if (referenceEntity) {
    const gapPts = Math.round(
      Math.abs(subjectEntity.sov - referenceEntity.sov) * 100,
    );
    if (gapPts === 0) {
      gapClause = `, tied with ${referenceEntity.name}`;
    } else if (isLeader) {
      gapClause = `, ahead of ${referenceEntity.name} by ${gapPts} pts`;
    } else {
      gapClause = `, trailing ${referenceEntity.name} by ${gapPts} pts`;
    }
  }
  // Scope prefix: prepends an "On <platform> in <topic>, " clause
  // when filters are active so the rest of the sentence reads as a
  // filtered statement instead of a global one.
  const scopeParts: string[] = [];
  if (scopedPlatformName) scopeParts.push(`On ${scopedPlatformName}`);
  if (scopedTopicLabel) {
    scopeParts.push(
      scopedPlatformName ? `in ${scopedTopicLabel}` : `On ${scopedTopicLabel}`,
    );
  }
  const subjectPhrase =
    scopeParts.length > 0
      ? `${scopeParts.join(" ")}, ${subjectName}`
      : subjectName;
  const rankClause = isLeader
    ? `${subjectPhrase} leads its ${competitiveSetSize}-way comparison set`
    : `${subjectPhrase} ranks #${competitiveRank} of ${competitiveSetSize} in the comparison set`;
  const sentence1 = `${rankClause} with ${sovPct}% Share of Voice${gapClause}.`;
  // Sentence 2 (topic-win clause) is suppressed when a topic filter
  // is active — "Wins 3 of 4 tracked topics" reads as a global
  // claim, but the surrounding page is scoped to one topic, so the
  // clause would mislead. When unscoped, only render when topics
  // are tracked (skips the "0 of 0 topics" awkwardness on subjects
  // without a topic leaderboard).
  if (topicsTracked === 0 || scopedTopicLabel) return sentence1;
  const sentence2 = `Wins ${topicsLed} of ${topicsTracked} tracked topic${topicsTracked === 1 ? "" : "s"}.`;
  return `${sentence1} ${sentence2}`;
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

  // Strongest Topic — the tracked topic where the subject has its
  // highest mention rate. When all topics have effectively the same
  // rate (e.g. subject at 100% across every topic), picking ONE as
  // "strongest" is misleading; the suffix below switches to
  // "Tied across N topics" instead so the headline doesn't claim
  // false signal. Threshold: a 5 pp gap from the mean of the
  // remaining topics qualifies as meaningfully strongest.
  const topicsBySubjectRateDesc = [...data.topic_leaderboard].sort(
    (a, b) => b.subject_rate - a.subject_rate,
  );
  const strongestTopic = topicsBySubjectRateDesc[0] ?? null;
  const meanOfRestTopicRates = (() => {
    const rest = topicsBySubjectRateDesc.slice(1);
    if (rest.length === 0) return 0;
    return rest.reduce((s, t) => s + t.subject_rate, 0) / rest.length;
  })();
  const STRONGEST_GAP_MIN = 0.05;
  const hasMeaningfulStrongest =
    topicsBySubjectRateDesc.length > 1 &&
    strongestTopic !== null &&
    strongestTopic.subject_rate - meanOfRestTopicRates >= STRONGEST_GAP_MIN;

  // KPI tile shape mirrors the Visibility spoke's `KpiCard` so both
  // briefings render with one tile template. `value` is the headline
  // (rendered text-2xl tabular-nums); `valueSuffix` appends a smaller
  // qualifier inline (text-base, used by name-anchored tiles to fold
  // context into the headline); `gaugeValue` (0..1) drives the bar
  // fill — null = no gauge for tiles whose value isn't a fraction
  // (rank, name). `gaugeBenchmark` stays null on this spoke (no
  // per-tile benchmark data is shipped today; gauges render as
  // fill-only, no tick), matching the Visibility spoke's behavior on
  // tiles where the benchmark is null.
  type CompetitionKpi = {
    label: string;
    value: string;
    valueSuffix?: string | null;
    helper: string;
    tooltip?: string;
    subtitle?: string;
    valueColor: string;
    polarity: KpiPolarity;
    gaugeValue: number | null;
    gaugeBenchmark: number | null;
    caption: string | null;
    anchor?: string;
    // Pp change between the first and last measured value in the
    // KPI's trajectory. Null when no trajectory or fewer than two
    // measured points. Polarity determines tone (success/warning).
    deltaPp?: number | null;
    // Sparkline values aligned to data.trajectory.weeks. Null = no
    // sparkline (skipped slot still consumes the same vertical space
    // via the mt-auto footer so baselines align across tiles).
    sparkValues?: (number | null)[] | null;
  };

  // Trajectory + delta inputs for the four Standing KPI tiles.
  // Metric choice — everything on the Standing band is anchored on
  // mention rate (`competitive[].sov` per the API: "subject_mentions /
  // total_responses"), which is what the ranking table's "Share of
  // Voice" column actually shows. Headlines, inline row deltas,
  // these sparklines, AND the snapshot-diff strip below must all
  // pull from the same metric or chip values disagree numerically
  // with the table the user reads them against. So: subject series
  // uses `data.trajectory.ai_recall` (subject mention rate over
  // time); competitor series uses `competitor_trajectories[].mention_rate`
  // (peer mention rate over time). The sibling field
  // `trajectory.share_of_voice` is the *pie-share* definition used
  // by Visibility's Trend chart and is intentionally NOT used here.
  const competitiveRankSpark = data.trajectory.ai_recall;
  const competitiveRankDelta = changeFromTrajectory(competitiveRankSpark);
  // Card 2 (Closest Rival): gap = subject mention rate − current
  // closest rival's mention rate, pinned to whoever holds the slot
  // today. Trajectory is per-week so a reader can see whether the
  // gap to their CURRENT nearest rival is closing or widening —
  // different question from "who was nearest in the past" (the
  // name itself could change snapshot to snapshot).
  const topCompetitorTrajectory =
    topCompetitorName !== null
      ? data.competitor_trajectories.find((c) => c.name === topCompetitorName)
          ?.mention_rate ?? null
      : null;
  const topCompetitorGapSpark: (number | null)[] | null = topCompetitorTrajectory
    ? data.trajectory.ai_recall.map((sv, i) => {
        const rv = topCompetitorTrajectory[i];
        if (sv === null || rv === null || rv === undefined) return null;
        return sv - rv;
      })
    : null;
  const topCompetitorGapDelta = changeFromTrajectory(
    topCompetitorGapSpark ?? undefined,
  );
  // Card 4 (Strongest Topic): mention-rate trajectory for whichever
  // topic is strongest TODAY (pinned by label, so a reader sees how
  // that topic has trended — distinct from "what was my strongest
  // topic last week"). Null when the topic isn't present in
  // topic_trajectories (e.g. newly-added topic).
  const strongestTopicSpark = strongestTopic
    ? data.topic_trajectories.find(
        (t) => t.label === strongestTopic.topic_label,
      )?.mention_rate ?? null
    : null;
  const strongestTopicDelta = changeFromTrajectory(
    strongestTopicSpark ?? undefined,
  );

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
      // Rank is not a 0..100 strength value — coloring "#3" green or
      // amber misleads readers ("is third place good?"). Keep neutral
      // and let the "↓N pts" delta below carry direction. Matches
      // Visibility's Avg Mention Position policy on a non-rate metric.
      valueColor: "text-foreground",
      polarity: "lower_better",
      // Gauge fills to the subject's SoV (a 0..1 fraction) — gives a
      // visual sense of "how much of the comparison-set voice does
      // the subject own" alongside the ordinal rank in the headline.
      gaugeValue: subjectEntity?.sov ?? null,
      gaugeBenchmark: null,
      caption:
        competitiveSetSize > 0
          ? `${Math.round((subjectEntity?.sov ?? 0) * 100)}% Share of Voice`
          : null,
      anchor: "standing",
      // SoV-based read for the rank tile: rising SoV is success,
      // falling is warning — matches the polarity ("lower rank
      // better" is the headline, but the spark visualizes SoV).
      deltaPp: competitiveRankDelta,
      sparkValues: competitiveRankSpark,
    },
    {
      label: "Closest Rival",
      value: topCompetitorName ?? "—",
      // Caption framed from the SUBJECT'S perspective ("Newsom
      // leads by N", "Newsom trails by N") so it lines up with the
      // Bottom Line sentence above, which also describes the gap
      // from the subject's perspective ("ahead of Wes Moore by 40
      // pts"). Earlier framing inverted the perspective to the
      // competitor's ("Wes Moore is 40 pts behind subject"), which
      // described the same number twice but from opposite angles
      // — readers paused to confirm the two lines were saying the
      // same thing. "SoV pts" identifies the metric inline so the
      // unit is unambiguous.
      subtitle: (() => {
        if (topCompetitorName === null || topCompetitorGapPp === null) {
          return undefined;
        }
        if (topCompetitorGapPp === 0) {
          return "Tied on Share of Voice";
        }
        return topCompetitorGapPp > 0
          ? `${data.subject_name} leads by ${topCompetitorGapPp} SoV pts`
          : `${data.subject_name} trails by ${Math.abs(topCompetitorGapPp)} SoV pts`;
      })(),
      helper: "Comparison entity closest to the subject in Share of Voice.",
      tooltip:
        "The single entity in the comparison set whose Share of Voice is nearest the subject's. Caption shows the gap in Share-of-Voice percentage points and which side of the subject they sit on. A larger gap = more breathing room from your nearest rival.",
      // Neutral color: the value is a competitor's NAME, not a
      // performance metric. Painting the name green/amber by the
      // gap polarity created a visual mismatch — reader sees "Wes
      // Moore" in green and reads "Wes Moore is healthy", when the
      // green was meant to celebrate the subject's lead. The gap
      // direction + magnitude lives in the caption beneath; the
      // headline name stays tone-free.
      valueColor: "text-foreground",
      polarity: "higher_better",
      // Name-anchored tile (value is a competitor name) — skip the
      // gauge entirely; the caption carries the numeric context.
      gaugeValue: null,
      gaugeBenchmark: null,
      caption: (() => {
        if (topCompetitorName === null || topCompetitorGapPp === null) {
          return null;
        }
        if (topCompetitorGapPp === 0) {
          return "Tied on Share of Voice";
        }
        return topCompetitorGapPp > 0
          ? `${data.subject_name} leads by ${topCompetitorGapPp} SoV pts`
          : `${data.subject_name} trails by ${Math.abs(topCompetitorGapPp)} SoV pts`;
      })(),
      anchor: "positioning",
      // Gap trajectory: positive delta = subject pulling away from
      // the rival (success); negative = rival closing in (warning).
      deltaPp: topCompetitorGapDelta,
      sparkValues: topCompetitorGapSpark,
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
      // Routed through the shared mention_rate tier (strong ≥0.6,
      // weak <0.3) so "Topic Win Rate 25%" reads warning here the
      // same way "Mention Rate 25%" reads warning on Overview /
      // Visibility. The metric is a share over a small denominator
      // (topics-led / topics-tracked) so the mention-rate tier — a
      // share over a small denominator (subject-mentions / responses)
      // — is the right semantic fit.
      valueColor: getKpiValueColor("mention_rate", topicWinRateFrac),
      polarity: "higher_better",
      // Gauge fills to the topic-win fraction — a true 0..1 scale.
      gaugeValue: topicWinRateFrac,
      gaugeBenchmark: null,
      caption:
        topicWinRateFrac !== null
          ? `${Math.round(topicWinRateFrac * 100)}% of tracked topics`
          : null,
      anchor: "positioning",
    },
    {
      label: "Strongest Topic",
      value: strongestTopic
        ? `${Math.round(strongestTopic.subject_rate * 100)}%`
        : "—",
      // Suffix logic: when one topic is materially stronger than
      // the others, name it (same pattern as Visibility's Weakest
      // Topic). When topics are tied (subject hits the same rate
      // across every tracked topic), naming one as "strongest" is
      // misleading — switch to "Tied across N topics" so the
      // headline tells the truth about the cluster instead of
      // arbitrarily picking the first sort hit.
      valueSuffix: !strongestTopic
        ? null
        : hasMeaningfulStrongest ||
            topicsBySubjectRateDesc.length === 1
          ? capitalizeFirst(strongestTopic.topic_label)
          : `Tied across ${topicsBySubjectRateDesc.length} topics`,
      subtitle: undefined,
      helper: "Topic where the subject's mention rate is highest.",
      tooltip:
        "Tracked topic where the subject's mention rate is highest in this snapshot. The headline shows the rate; the topic name follows as a smaller qualifier (or 'Tied across N topics' when the rate is uniform). Useful as a positive anchor when the rest of the briefing skews negative.",
      // Routed through the shared mention_rate tier so a 100%
      // strongest topic reads success here the same way "Mention
      // Rate 100%" reads success on Overview/Visibility. Replaces
      // local 0.7/0.4 thresholds that diverged from the shared
      // 0.6/0.3 by ~10pp.
      valueColor: getKpiValueColor(
        "mention_rate",
        strongestTopic?.subject_rate ?? null,
      ),
      polarity: "higher_better",
      // Name-anchored tile (the topic name carries the read) — skip
      // the gauge, matching Visibility's Weakest Topic shape.
      gaugeValue: null,
      gaugeBenchmark: null,
      caption: null,
      anchor: "positioning",
      // Trajectory pinned to the CURRENT strongest topic's label
      // (so the spark answers "how has this topic been trending?").
      deltaPp: strongestTopicDelta,
      sparkValues: strongestTopicSpark,
    },
  ];

  // Vitals bottom-line text — composed once here so the briefing
  // card renders a single data-derived sentence above the KPI tiles,
  // matching the Visibility spoke's BOTTOM LINE eyebrow + paragraph
  // pattern. Returns null on subjects with no comparison set; the
  // render path falls back to a static line.
  const competitiveBottomLine = composeCompetitiveBottomLine({
    subjectName: data.subject_name,
    subjectEntity,
    sortedBySovDesc,
    competitiveRank,
    competitiveSetSize,
    topicsLed,
    topicsTracked,
    // Filter-aware framing — see helper comment. The rank/SoV/gap
    // numbers above are already scoped via landscapeEntities; this
    // tells the helper to add the matching prefix to the sentence.
    scopedPlatformName: scopedLandscapePlatformName,
    scopedTopicLabel: prominenceTopic
      ? capitalizeFirst(prominenceTopic).toLowerCase()
      : null,
  });

  // Snapshot-diff strip data for the Standing band. Reuses the same
  // composer the Trend section uses, on the same mention-rate metric
  // the ranking table column actually shows (see the metric-choice
  // comment above). Earlier this strip pulled `trajectory.share_of_voice`
  // (pie-share) — that surfaced a different mover set and the chip
  // values disagreed numerically with the table column they sat
  // under. Full-trajectory window (not the user-selected trend slice)
  // so the strip describes "across recorded history."
  const snapshotDiff = composeCompetitionWhatChanged({
    trajectoryWeeks: data.trajectory.weeks,
    aiRecall: data.trajectory.ai_recall,
    competitorTrajectories: data.competitor_trajectories,
  });
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

        {/* Horizontal sticky sub-nav pinned directly under the
            Header — same component the Visibility spoke uses. Hosts
            both the section jump-links (left) and the page-level
            filter dropdowns (right, via OverviewSubNav's optional
            `right` slot) on a single sticky row, so navigation and
            scope state ride together as the user scrolls. Replaces
            the prior right-rail SectionNav so the page reads top-to-
            bottom without a competing rail on the side. */}
        {hasCompetitive && (
          <OverviewSubNav
            items={[
              // Four question-driven bands replace the prior 5-item
              // layout (Vitals + Trend + Landscape + Ranking + Co-
              // Mentions). Each band answers one question — no
              // metric is shown twice across sections. Standing
              // absorbs Vitals + the Ranking table (with inline SoV
              // bars replacing the prior standalone bar chart);
              // Positioning absorbs the Position vs Share scatter
              // + the Platform Ownership matrix (out of Vitals);
              // Trend + Co-Mentions stay as their own bands.
              { id: "standing", label: "Standing", num: "01" },
              { id: "positioning", label: "Positioning", num: "02" },
              { id: "trend", label: "Trend", num: "03" },
              { id: "co-mentions", label: "Co-Mentions", num: "04" },
            ]}
            right={
              <>
                <TopicProminenceFilter
                  inline
                  topics={data.topic_leaderboard.map((t) => ({
                    label: t.topic_label,
                  }))}
                />
                <LandscapePlatformFilter
                  inline
                  platforms={landscapePlatforms.map((p) => ({
                    slug: p.slug,
                    name: p.name,
                  }))}
                />
              </>
            }
          />
        )}

        <main className="flex-1 px-4 md:px-12 py-6 space-y-10 max-w-[1280px] w-full mx-auto">
          {/* Page H2 + subtitle removed at request. Sidebar's active
              "Competitive Visibility" pill + the sub-nav above carry
              page identity; section eyebrows open content. */}

          {!hasCompetitive ? (
            <Card className="p-6 border-border/60 text-[13.5px] text-muted-foreground">
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
              {/* ── 01. STANDING — "Where do I stand?" ───────────── */}
              {/* First of four question-driven bands. Wraps two
                  cards: the Vitals briefing (BOTTOM LINE + 4 KPIs)
                  + the Competitive Ranking table (now the single
                  source of standings, with inline SoV bars
                  replacing the prior standalone bar chart). The
                  Current Platform Ownership matrix that used to
                  live inside the Vitals card moved to the
                  Positioning band below. Card chrome on the Vitals
                  card mirrors the Visibility spoke's Vitals card
                  exactly so the two spoke heroes read as the same
                  surface. */}
              <section id="standing" className="scroll-mt-28">
                <Card className="relative overflow-hidden p-6 md:p-7 border-border/60">
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        "linear-gradient(135deg, color-mix(in oklab, var(--primary) 6%, transparent), transparent 55%)",
                    }}
                    aria-hidden
                  />
                  <div className="relative">
                    <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-primary/80 mb-2">
                      Bottom Line
                    </div>
                    <p className="text-[15.5px] leading-relaxed text-foreground/90 max-w-3xl">
                      {competitiveBottomLine ??
                        `${data.subject_name}'s competitive position across AI answers in this snapshot.`}
                    </p>
                    {(() => {
                      // Filter-aware coverage caveat. Unfiltered: a
                      // simple "N platforms × M topics" frame. When
                      // filters are active, leads with the filter
                      // scope so the reader knows the briefing above
                      // is a filtered view, then surfaces the
                      // underlying snapshot dimensions in
                      // parentheses for context. Mirrors the
                      // bottom-line's scope-prefix pattern so the
                      // two lines tell the same scope story.
                      if (data.meta.n_platforms === 0) return null;
                      const topicCount = data.topic_leaderboard.length;
                      const filterParts: string[] = [];
                      if (scopedLandscapePlatformName) {
                        filterParts.push(
                          `${scopedLandscapePlatformName} only`,
                        );
                      }
                      if (prominenceTopic) {
                        filterParts.push(
                          `${capitalizeFirst(prominenceTopic)} only`,
                        );
                      }
                      const snapshotDims = `${data.meta.n_platforms} platform${
                        data.meta.n_platforms === 1 ? "" : "s"
                      }${topicCount > 0 ? ` × ${topicCount} topic${topicCount === 1 ? "" : "s"}` : ""}`;
                      const text =
                        filterParts.length > 0
                          ? `Filtered scope: ${filterParts.join(" · ")} (snapshot has ${snapshotDims}).`
                          : `Snapshot covers ${data.meta.n_platforms} AI platform${
                              data.meta.n_platforms === 1 ? "" : "s"
                            }${topicCount > 0 ? ` across ${topicCount} tracked topic${topicCount === 1 ? "" : "s"}` : ""}.`;
                      return (
                        <p className="mt-2 text-[12.5px] text-muted-foreground">
                          {text}
                        </p>
                      );
                    })()}
                    {/* Filter-not-applied advisory — the snapshot-diff
                        chip strip below + the KPI sparkline/delta
                        treatments both read from the full unfiltered
                        trajectory feed (no per-(topic × entity) or
                        per-(platform × entity) trajectory data is
                        shipped today). When the user has scoped to a
                        topic or platform, the snapshot diff and the
                        KPI deltas describe all-snapshot motion, not
                        the scoped slice. Surfacing the warning here
                        matches the same advisory pattern used by
                        the Trend chart (~L2337) and Co-Mentions
                        (~L2491) so the user can tell scoped sections
                        from unscoped ones at a glance instead of
                        silently reading filtered framing across
                        unfiltered numbers. */}
                    {hasAnyFilter && (
                      <div className="mt-3 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-[12.5px] leading-relaxed text-muted-foreground">
                        <span className="font-semibold text-foreground/85">
                          Filters not applied:
                        </span>{" "}
                        Trajectory deltas + sparklines below aren&apos;t
                        yet broken down by ({filterAdvisoryText}) —
                        showing the all-snapshot view.
                      </div>
                    )}
                    {/* Top-of-band movers pill row removed — it
                        duplicated the "What changed · prior → latest"
                        chip strip that already lives at the bottom of
                        the Trend chart further down the page. The
                        Trend footer wins because it sits next to the
                        lines themselves AND covers entities hidden
                        from the default chart view (top 3 + subject),
                        so a hidden entity's delta still surfaces in
                        text there. Snapshot diff data is still
                        composed once at the page level (no change to
                        composeCompetitionWhatChanged) — only this
                        duplicate render is gone. */}
                  </div>
                  <div className="relative mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                    {competitionKpis.map((k) => {
                      // Same fill-color derivation as Visibility — the
                      // gauge color tracks the value tone so the bar
                      // and the headline number agree visually.
                      const gaugeFill =
                        k.valueColor === "text-success"
                          ? "var(--success)"
                          : k.valueColor === "text-warning"
                            ? "var(--warning)"
                            : "var(--primary)";
                      const tileInner = (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[11px] uppercase tracking-wider text-muted-foreground truncate">
                                {k.label}
                              </div>
                            </div>
                            <KpiTooltipIcon
                              text={k.tooltip ?? k.helper}
                              align="right"
                            />
                          </div>
                          <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                            <span
                              className={`text-2xl font-semibold tracking-tight tabular-nums leading-tight ${k.valueColor}`}
                            >
                              {k.value}
                            </span>
                            {k.valueSuffix && (
                              <span
                                className={`text-base font-medium leading-tight ${k.valueColor}`}
                                title={k.valueSuffix}
                              >
                                {k.valueSuffix}
                              </span>
                            )}
                            {/* Pp delta vs first measured point in
                                the trajectory window. All three
                                metrics carried here (subject SoV,
                                gap-to-rival, topic mention rate)
                                share the convention positive=better,
                                so the tone rule is uniform across
                                tiles without per-tile polarity
                                inversion. */}
                            {k.deltaPp !== null &&
                              k.deltaPp !== undefined &&
                              Number.isFinite(k.deltaPp) && (
                                <span
                                  className={`text-[12px] font-medium tabular-nums ${
                                    k.deltaPp > 0
                                      ? "text-success"
                                      : k.deltaPp < 0
                                        ? "text-warning"
                                        : "text-muted-foreground"
                                  }`}
                                  aria-label={`Change vs start of window: ${k.deltaPp > 0 ? "up" : k.deltaPp < 0 ? "down" : "no change"} ${Math.abs(Math.round(k.deltaPp))} points`}
                                  title="vs start of trend window"
                                >
                                  {k.deltaPp > 0 ? "↑" : k.deltaPp < 0 ? "↓" : ""}
                                  {Math.abs(Math.round(k.deltaPp))} pts
                                </span>
                              )}
                          </div>
                          {k.gaugeValue !== null &&
                            Number.isFinite(k.gaugeValue) && (
                              <div className="mt-3">
                                <KpiGauge
                                  value={k.gaugeValue}
                                  benchmark={k.gaugeBenchmark}
                                  fillColor={gaugeFill}
                                  benchmarkLabel={k.caption ?? undefined}
                                />
                              </div>
                            )}
                          {/* Standalone caption only when the gauge
                              isn't consuming it AND no sparkline is
                              showing in the footer (sparkline takes
                              priority on no-gauge tiles since the
                              spark already conveys magnitude over
                              time; the caption would then duplicate
                              the headline + caption pair already
                              above the spark). */}
                          {k.caption &&
                            k.gaugeValue === null &&
                            !(k.sparkValues && k.sparkValues.length > 0) && (
                              <div
                                className="mt-auto pt-3 text-[11px] text-muted-foreground leading-snug line-clamp-2"
                                title={k.caption}
                              >
                                {k.caption}
                              </div>
                            )}
                          {/* Sparkline footer — mt-auto pushes it to
                              the tile floor so baselines align across
                              all four tiles (matches Overview Vitals).
                              Color matches the gauge fill / value tone
                              when set, falling back to primary. */}
                          {k.sparkValues && k.sparkValues.length > 0 && (
                            <div className="mt-auto pt-3">
                              <TinySpark
                                values={k.sparkValues}
                                color={gaugeFill}
                              />
                            </div>
                          )}
                        </>
                      );
                      // Tile chrome matches Visibility's: bg-muted/40
                      // rounded-md p-4. Anchored tiles wrap in an
                      // anchor with focus-visible ring; static tiles
                      // are plain divs.
                      const baseClasses =
                        "flex h-full flex-col rounded-md bg-muted/40 p-4";
                      if (k.anchor) {
                        return (
                          <a
                            key={k.label}
                            href={`#${k.anchor}`}
                            className={`${baseClasses} group transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm`}
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
                {/* Ranking table is now folded INTO the same Card as
                    the KPI strip above, separated by a hairline top
                    border, so the Standing band reads as one
                    continuous surface ("Vitals → ranking") instead
                    of two detached cards. Before this fold, mt-6
                    between two bordered cards made the table feel
                    like a sibling Competition section rather than
                    a tier-2 view of the KPI ranking right above
                    it. */}
                <div className="mt-6 pt-6 border-t border-border/40">
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
                      // Source data prep — keep leader rank +
                      // position computation off the FULL set
                      // (subject included) so peer position pills
                      // are still calculated relative to whoever
                      // leads the comparison set, even though the
                      // subject renders separately above the table.
                      const sortedAll = [...landscapeEntities].sort(
                        (a, b) => b.sov - a.sov,
                      );
                      const leaderRow = sortedAll[0];
                      const leaderName = leaderRow?.name ?? null;
                      const leaderSov = leaderRow?.sov ?? null;
                      const subjectRow = landscapeEntities.find(
                        (e) => e.is_subject,
                      ) ?? null;
                      // Subject's change pulls from the page's
                      // primary trajectory (ai_recall); competitors
                      // pull from competitor_trajectories. When
                      // scoped to a topic OR platform, skip the
                      // change calc entirely — no per-(scope ×
                      // entity) trajectories exist.
                      const subjectChange =
                        subjectRow && !(prominenceTopic || landscapePlatform)
                          ? changeFromTrajectory(
                              data.trajectory.ai_recall,
                            )
                          : null;
                      // Tier verdict for the subject row's Status cell.
                      // Computed against the leader's SoV so the pill
                      // reads consistently with the Bottom Line's
                      // ranks-trails-by phrasing. Null only when the
                      // subject row itself is absent (no data).
                      const subjectPosition = subjectRow
                        ? currentPosition({
                            mention_rate: subjectRow.sov,
                            is_subject: true,
                            is_leader: subjectRow.name === leaderName,
                            leader_mention_rate: leaderSov,
                          })
                        : null;
                      const peerRows = sortedAll.filter(
                        (r) => !r.is_subject,
                      );
                      // Inline-delta formatter shared by the subject
                      // row and the peer rows so the change column
                      // reads the same in both: "+5 pts" / "0 pts"
                      // / "-10 pts" (uses the page-wide
                      // formatSignedPpRaw, which already carries
                      // the "pts" suffix). Earlier the strip used
                      // "-10 pts" while peer rows used bare "-10";
                      // unifying matters now that the subject is
                      // an in-table row sitting directly above the
                      // peers — different formats would read as
                      // different metrics.
                      return (
                        <>
                          {/* Single table — the subject is now the
                              first row of the same grid as the
                              peers, not a floating stat strip
                              above. Browser handles native column
                              alignment so SoV sits over SoV,
                              Position over Position, etc. Subject
                              row distinguishes itself via
                              info-tinted background + left accent
                              + bolder weight; peer rows render in
                              muted text-foreground/75. Columns: 5
                              (Entity · SoV with bar + % + change
                              delta · Avg. Position · First Mention
                              Rate · Status). The dropped Trend
                              column was uniformly "Stable" — zero
                              information — and is not re-added. */}
                          <table className="w-full text-left table-fixed">
                            {/* Explicit column widths so headers
                                anchor predictably above their data
                                regardless of header-label vs cell-
                                content width variance. Without this
                                the browser auto-sizes each column to
                                its widest natural content (header
                                tooltip + bar+%+delta cluster), which
                                makes the SoV column wider than the
                                others and the right-aligned headers
                                feel inconsistently spaced relative
                                to their data. Widths sum to 100%
                                and use proportional units so the
                                grid scales cleanly across viewport
                                widths. table-fixed on the wrapper
                                lets the col widths govern instead
                                of auto-layout. */}
                            <colgroup>
                              <col style={{ width: "26%" }} />
                              <col style={{ width: "32%" }} />
                              <col style={{ width: "12%" }} />
                              <col style={{ width: "16%" }} />
                              <col style={{ width: "14%" }} />
                            </colgroup>
                            <thead>
                              <tr className="border-b border-border/60 text-[10.5px] uppercase tracking-[0.06em] text-foreground/65">
                                <th className="py-3 pr-4 font-semibold">
                                  <span className="inline-flex items-center gap-1">
                                    Entity
                                    <KpiTooltipIcon
                                      text="Top competitor entities AI surfaced alongside the subject in this snapshot. The subject itself appears in the stat strip above, not as a table row. Names come from the competitors_mentioned extraction; name variants are not deduped."
                                      align="left"
                                      direction="below"
                                    />
                                  </span>
                                </th>
                                <th className="py-3 px-3 text-right font-semibold whitespace-nowrap">
                                  <span className="inline-flex items-center justify-end gap-1">
                                    Share of Voice
                                    <KpiTooltipIcon
                                      text={`Share of Voice — fraction of unnamed-layer responses where this entity appeared. The small signed number next to the % is the entity's mention-rate change across the ${trendWindowKey === "all" ? "all-time" : trendWindowKey} trend window (positive green = up, negative amber = down).`}
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
                                {/* Status column renders the tier pill
                                    on the subject row only — peer rows
                                    keep an empty cell so the column
                                    grid stays aligned (the user opted
                                    to keep peer rows slim while
                                    surfacing the subject's tier where
                                    it matters most: at-a-glance
                                    answer to "where do I stand in the
                                    field?"). */}
                                <th className="py-3 pl-3 text-right font-semibold whitespace-nowrap">
                                  <span className="inline-flex items-center justify-end gap-1">
                                    Status
                                    <KpiTooltipIcon
                                      text="Where the subject sits in the comparison set today, by share of voice. Leader = highest share. Challenger ≥60% of the leader's share. Mid-tier ≥25%. Low visibility below that."
                                      align="right"
                                      direction="below"
                                    />
                                  </span>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {/* Subject row — first row of the
                                  same grid as the peers below, info-
                                  tinted + bolder so the subject
                                  visually leads the comparison
                                  without being a floating element.
                                  Uses the SAME 5-cell structure as
                                  peer rows so each column (SoV,
                                  Position, First Mention, Status)
                                  aligns vertically — a reader can
                                  drop straight down from the
                                  subject's value to any peer's. */}
                              {subjectRow && (
                                <tr className="border-b border-border/30 text-[14px] text-foreground bg-primary/[0.08] border-l-2 border-l-primary/50">
                                  <td className="py-3.5 pr-4 font-semibold">
                                    {subjectRow.name}
                                  </td>
                                  <td className="py-3.5 px-3 text-right tabular-nums">
                                    <div className="inline-flex items-center justify-end gap-2 w-full">
                                      <div
                                        className="relative h-2 w-20 overflow-hidden rounded-full bg-muted/70 shrink-0"
                                        aria-hidden
                                      >
                                        <div
                                          className="absolute inset-y-0 left-0 rounded-full"
                                          style={{
                                            width: `${Math.max(0, Math.min(100, subjectRow.sov * 100))}%`,
                                            background: colorForEntity(subjectRow.name),
                                            opacity: 0.85,
                                          }}
                                        />
                                      </div>
                                      <span className="shrink-0 min-w-[2.5rem] text-right font-semibold">
                                        {Math.round(subjectRow.sov * 100)}%
                                      </span>
                                      <span
                                        className={`shrink-0 min-w-[3rem] text-right text-[11px] tabular-nums ${
                                          subjectChange === null
                                            ? "text-muted-foreground/60"
                                            : deltaToneClass(subjectChange)
                                        }`}
                                      >
                                        {subjectChange === null
                                          ? ""
                                          : formatSignedPpRaw(subjectChange)}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-3.5 px-3 text-right tabular-nums font-medium">
                                    {subjectRow.avg_rank === null
                                      ? "—"
                                      : subjectRow.avg_rank.toFixed(1)}
                                  </td>
                                  <td className="py-3.5 px-3 text-right tabular-nums font-medium">
                                    {Math.round(subjectRow.first_mention_rate * 100)}%
                                  </td>
                                  <td className="py-3.5 pl-3 text-right whitespace-nowrap">
                                    {subjectPosition && (
                                      <Pill tone={subjectPosition.tone}>
                                        {subjectPosition.label}
                                      </Pill>
                                    )}
                                  </td>
                                </tr>
                              )}
                              {peerRows.map((c) => {
                                const change =
                                  prominenceTopic || landscapePlatform
                                    ? null
                                    : changeFromTrajectory(
                                        data.competitor_trajectories.find(
                                          (ct) => ct.name === c.name,
                                        )?.mention_rate,
                                      );
                                return (
                                  <tr
                                    key={c.name}
                                    className="border-b border-border/30 last:border-0 text-[14px] text-foreground/75"
                                  >
                                    <td className="py-3.5 pr-4 font-medium">
                                      {c.name}
                                    </td>
                                    <td className="py-3.5 px-3 text-right tabular-nums">
                                      <div className="inline-flex items-center justify-end gap-2 w-full">
                                        <div
                                          className="relative h-2 w-20 overflow-hidden rounded-full bg-muted/70 shrink-0"
                                          aria-hidden
                                        >
                                          <div
                                            className="absolute inset-y-0 left-0 rounded-full"
                                            style={{
                                              width: `${Math.max(0, Math.min(100, c.sov * 100))}%`,
                                              background: colorForEntity(c.name),
                                              opacity: 0.85,
                                            }}
                                          />
                                        </div>
                                        <span className="shrink-0 min-w-[2.5rem] text-right">
                                          {Math.round(c.sov * 100)}%
                                        </span>
                                        {/* Change delta beside the
                                            percent — uses the same
                                            formatSignedPpRaw ("-10
                                            pts") format as the
                                            subject row above so
                                            both rows render the
                                            metric identically.
                                            min-w-[3rem] reserves
                                            slot width for "-10 pts"
                                            so rows align even when
                                            a row has no measured
                                            change (slot stays,
                                            renders empty). */}
                                        <span
                                          className={`shrink-0 min-w-[3rem] text-right text-[11px] tabular-nums ${
                                            change === null
                                              ? "text-muted-foreground/60"
                                              : deltaToneClass(change)
                                          }`}
                                        >
                                          {change === null
                                            ? ""
                                            : formatSignedPpRaw(change)}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="py-3.5 px-3 text-right tabular-nums">
                                      {c.avg_rank === null
                                        ? "—"
                                        : c.avg_rank.toFixed(1)}
                                    </td>
                                    <td className="py-3.5 px-3 text-right tabular-nums">
                                      {Math.round(c.first_mention_rate * 100)}%
                                    </td>
                                    {/* Empty Status cell — peer rows
                                        intentionally don't render a
                                        tier pill (kept slim). The cell
                                        exists so the 5-column grid
                                        stays aligned with the header
                                        and subject row above. */}
                                    <td className="py-3.5 pl-3" aria-hidden />
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </>
                      );
                    })()}
                  </div>
                </div>
                </Card>
              </section>

              {/* ── 02. POSITIONING — "How is the field positioned?" ── */}
              {/* Pairs the Position vs Share scatter (subject + 7
                  competitor entities placed on a position × share
                  plane) with the Current Platform Ownership matrix
                  (per-(entity × AI platform) SoV grid). Both answer
                  "positioning / who owns what" rather than "ranking";
                  the matrix moved here from inside the Vitals card.
                  Scatter gets the wider column (3fr) because its
                  layout needs horizontal room for entity labels with
                  collision-aware leader lines; matrix gets the
                  narrower column (2fr) but its compact grid fits
                  comfortably. */}
              <section id="positioning" className="scroll-mt-28">
                <SectionTitle
                  eyebrow="Positioning"
                  title="How is the field positioned?"
                  description={(() => {
                    const parts: string[] = [];
                    if (prominenceTopic) {
                      parts.push(`scoped to ${prominenceTopic}`);
                    }
                    if (scopedLandscapePlatformName) {
                      parts.push(`on ${scopedLandscapePlatformName}`);
                    }
                    if (parts.length === 0) {
                      return "Where each entity sits on the position × share plane, and who owns each AI platform.";
                    }
                    return `Where each entity sits ${parts.join(", ")}, on the position × share plane and across AI platforms.`;
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
                {/* Single Card with internal divider — same one-
                    card-one-divider pattern the Trend chart + What-
                    changed footer share. Scatter takes 3fr (wider)
                    so its labels have horizontal breathing room;
                    matrix takes 2fr (narrower) since its content is
                    a compact grid. At narrow widths both stack with
                    a horizontal border between. */}
                <Card className="p-6 border-border/60">
                  <div className="grid gap-6 lg:grid-cols-[3fr_2fr] lg:divide-x divide-border/60">
                    <div className="lg:pr-6">
                      <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/55">
                        Position vs Share
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
                    </div>
                    <div className="lg:pl-6 border-t lg:border-t-0 border-border/60 pt-6 lg:pt-0">
                      {hasOwnershipData && (() => {
                        // Tiered cells (dominant ≥40% · contested
                        // 15-40% · marginal <15%) — same SoV-tuned
                        // sovTier system used before the move. The
                        // legend below the grid spells out tier
                        // colors; per-cell tooltips carry the
                        // numeric read. Subject row gets bold + a
                        // primary left accent so the eye lands on
                        // it first, matching the Ranking table's
                        // subject row emphasis.
                        return (
                          <div>
                            <div className="mb-3">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/55 inline-flex items-center gap-1">
                                Current Platform Ownership
                                <KpiTooltipIcon
                                  text="Share of Voice for each comparison-set entity on each AI platform. Amber cells flag marginal share (<15%); calm cells are at dominant share (≥40%)."
                                  align="left"
                                />
                              </div>
                              <p className="mt-1 text-[12.5px] text-muted-foreground">
                                Current Share of Voice by entity and AI platform.
                              </p>
                            </div>
                            <div className="overflow-x-auto">
                              <div
                                className="grid gap-1 min-w-fit"
                                style={{
                                  gridTemplateColumns: `minmax(140px, auto) repeat(${ownershipPlatforms.length}, minmax(56px, 1fr))`,
                                }}
                              >
                                <div />
                                {ownershipPlatforms.map((p) => (
                                  // Two-element nesting: outer flex
                                  // owns the reserved height +
                                  // alignment, inner span owns the
                                  // line-clamp. Combining flex +
                                  // line-clamp-* on one element
                                  // collides (line-clamp forces
                                  // display:-webkit-box).
                                  <div
                                    key={p.slug}
                                    className="flex items-end justify-center px-1 min-h-[26px]"
                                    title={p.name}
                                  >
                                    <span className="line-clamp-2 text-center text-[10.5px] font-semibold uppercase tracking-[0.06em] text-foreground/60">
                                      {p.name}
                                    </span>
                                  </div>
                                ))}
                                {ownershipRows.map((e) => (
                                  <div
                                    key={e.name}
                                    style={{ display: "contents" }}
                                  >
                                    {/* Subject row name cell: bold +
                                        primary left-accent border +
                                        slightly larger font so the
                                        subject's row reads as the
                                        row that matters. Matches
                                        the Ranking table's subject
                                        row emphasis. */}
                                    <div
                                      className={`self-center text-[12px] ${
                                        e.is_subject
                                          ? "font-bold text-foreground border-l-2 border-l-primary/60 pl-2 pr-2"
                                          : "pr-2 text-foreground/80"
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
                                      const sov = cell?.sov ?? null;
                                      const tier = sovTier(sov);
                                      const ts = sovTierStyle(tier);
                                      const titleLabel = `${p.name} × ${e.name}: ${
                                        sov === null
                                          ? "no data"
                                          : `${Math.round(sov * 100)}% (${cell?.n_appearances ?? 0}/${p.n_responses})`
                                      }`;
                                      return (
                                        <div
                                          key={p.slug}
                                          // Subject cell: bumped
                                          // ring from ring-1
                                          // ring-primary/30 to
                                          // ring-2 ring-primary/50
                                          // so the frame is clearly
                                          // visible against the
                                          // tier-colored fill.
                                          className={`relative flex h-7 items-center justify-center rounded-sm ${
                                            e.is_subject
                                              ? "ring-2 ring-primary/50"
                                              : ""
                                          }`}
                                          style={{
                                            background: ts.background,
                                            border: ts.border,
                                          }}
                                          title={titleLabel}
                                        >
                                          <span
                                            className={`text-[10.5px] tabular-nums ${ts.textClass} ${
                                              e.is_subject ? "font-bold" : ""
                                            }`}
                                          >
                                            {sov === null
                                              ? "—"
                                              : `${Math.round(sov * 100)}%`}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ))}
                              </div>
                            </div>
                            {/* Color legend — closes the loop on
                                the tiered background colors so the
                                reader doesn't need to hover a cell
                                to learn what each tint means.
                                Swatches match sovTierStyle exactly
                                so legend + grid stay in sync. */}
                            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  aria-hidden
                                  className="inline-block h-3 w-3 rounded-sm"
                                  style={{
                                    background:
                                      "color-mix(in oklab, var(--primary) 55%, transparent)",
                                    border:
                                      "1px solid color-mix(in oklab, var(--primary) 75%, transparent)",
                                  }}
                                />
                                Dominant ≥40% SoV
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  aria-hidden
                                  className="inline-block h-3 w-3 rounded-sm"
                                  style={{
                                    background:
                                      "color-mix(in oklab, var(--muted) 75%, transparent)",
                                  }}
                                />
                                Contested 15-40% SoV
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  aria-hidden
                                  className="inline-block h-3 w-3 rounded-sm"
                                  style={{
                                    background:
                                      "color-mix(in oklab, var(--warning) 22%, transparent)",
                                    border:
                                      "1px solid color-mix(in oklab, var(--warning) 55%, transparent)",
                                  }}
                                />
                                Marginal &lt;15% SoV
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  aria-hidden
                                  className="inline-block h-3 w-3 rounded-sm"
                                  style={{
                                    background:
                                      "repeating-linear-gradient(45deg, color-mix(in oklab, var(--muted) 25%, transparent), color-mix(in oklab, var(--muted) 25%, transparent) 2px, color-mix(in oklab, var(--muted-foreground) 12%, transparent) 2px, color-mix(in oklab, var(--muted-foreground) 12%, transparent) 4px)",
                                    border:
                                      "1px dashed color-mix(in oklab, var(--muted-foreground) 45%, transparent)",
                                  }}
                                />
                                No data
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </Card>
              </section>

              {/* ── 03. TREND — "Which way is it moving?" ─────────── */}
              {hasTrend && (
                <section id="trend" className="scroll-mt-28">
                  <SectionTitle
                    eyebrow="Trend"
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
                  <Card className="p-6 border-border/60">
                    <TrendOverTime
                      subjectName={data.subject_name}
                      trajectoryWeeks={trendWeeks}
                      subjectValues={trendSubjectValues}
                      overlays={trendOverlays}
                      helperText="Mention rate shows the share of AI answers that mentioned each entity in the tracked prompt set. Click any rival's chip to add or remove its line."
                      overlayOpacity={0.5}
                      // Explicit at 2 (also the TrendOverTime default) so
                      // a reader comparing this callsite to Visibility's
                      // (which passes 1.25) sees the stroke-width choice
                      // side-by-side rather than inferring "no prop =
                      // default 2". Competition's 6-competitor lines
                      // need the heavier stroke for legibility; the
                      // per-platform overlays on Visibility recede.
                      overlayStrokeWidth={2}
                      height={340}
                      // Default-visible set: top 3 rivals by current
                      // SoV (the same ranking that drives the
                      // ranking table's subject + top-N peer
                      // selection). Trend rendered all 7 entities by
                      // default produced an unreadable 7-line
                      // spaghetti chart, especially for non-technical
                      // readers; the new default surfaces the focal
                      // subject + the 3 most-mentioned rivals,
                      // anyone else opts in via the legend chips
                      // below. Hidden chips still render in the
                      // legend (muted + strikethrough) so the reader
                      // sees who's available to toggle on.
                      defaultVisibleOverlays={trendOverlays
                        .slice()
                        .sort((a, b) => {
                          // Use the latest-snapshot trajectory value
                          // as the "current SoV" proxy. Fall back to
                          // 0 when an overlay has no final-snapshot
                          // measurement (preserves the original
                          // order for tied/missing cases via the
                          // stable sort).
                          const latest = (vals: (number | null)[]) =>
                            vals[vals.length - 1] ?? 0;
                          return (
                            latest(b.values) -
                            latest(a.values)
                          );
                        })
                        .slice(0, 3)
                        .map((o) => o.name)}
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
                        // What-changed reads as the chart's own
                        // footer rather than a sibling section: no
                        // top border, no generous gap. Text dropped
                        // to 11.5px (same size as the legend chips)
                        // so the strip reads as chart chrome. Same
                        // shape as the Visibility spoke's footer.
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
              )}

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
                <section id="wins-losses" className="scroll-mt-28">
                  <SectionTitle
                    eyebrow="Wins & Losses"
                    title="Competitive Wins & Losses"
                    description={`Head-to-head comparisons showing where ${data.subject_name} appears more often or more prominently than each competitor.`}
                    className="mb-5"
                  />
                  {/* Real table renders here once data ships. */}
                </section>
              )}

              {/* ── 04. CO-MENTIONS — "Who shares the stage?" ─────── */}
              <section id="co-mentions" className="scroll-mt-28">
                <SectionTitle
                  eyebrow="Co-Mentions"
                  title={`Who Else Appears Alongside ${data.subject_name}`}
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
                  <Card className="p-6 border-border/60">
                    <p className="mb-4 max-w-3xl text-[13px] leading-relaxed text-foreground/75">
                      Co-mention rate ={" "}
                      <span className="font-medium text-foreground/85">
                        % of {data.subject_name}&apos;s answers that also
                        mention this figure
                      </span>
                      . Distinct from the Share of Voice column in the
                      Standing table — this measures co-appearance, not
                      visibility. Does not imply favorability,
                      endorsement, or ranking.
                    </p>
                    {/* Column header row — labels each value column
                        explicitly so a reader sees "Co-mention rate"
                        as a column title, not just buried in the
                        intro paragraph. Same grid as the rows below
                        so the labels sit over the right cells. */}
                    <div className="grid grid-cols-[180px_1fr_72px] items-center gap-4 mb-2 pb-2 border-b border-border/40 text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground/80">
                      <span>Figure</span>
                      <span>Co-mention rate</span>
                      <span className="text-right">%</span>
                    </div>
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
                            {/* Percent only — raw count was dropped
                                because the percent already conveys
                                the comparison ("X appears in 56% of
                                Newsom-mention answers") and is
                                comparable across snapshots with
                                different total response counts;
                                surfacing both was double signal. */}
                            <span className="text-right text-[13px] tabular-nums font-semibold text-foreground">
                              {sharePct}%
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
                  <Card className="p-6 border-border/60 text-[13px] text-muted-foreground">
                    Not enough subject-mention responses in this snapshot
                    to compute co-mentions.
                  </Card>
                )}
              </section>
            </>
          )}

          {/* Methodology footer — matches the Visibility + Overview
              spokes' terminal footer so every spoke ends with the
              same data-provenance line + product tagline. */}
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
