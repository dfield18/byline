/**
 * Narrative spoke.
 *
 * Four stacked sections covering how AI characterizes the subject:
 *   1. Sentiment Trend       — sentiment + lean / criticism / certainty
 *                              trajectories
 *   2. Topic Sentiment        — per-topic sentiment matrix
 *   3. Narrative Clusters    — LLM-grouped narrative buckets
 *   4. Strategic Takeaways   — opposition_frame / strongest_asset /
 *                              message_gap one-liners
 *
 * Right-rail: Narrative Summary + Topic / Platform filter dropdowns
 * (URL-driven). Hero briefing card with four KPI tiles up top, same
 * structural language the Visibility spoke uses.
 */
import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { Card, SectionTitle, Pill } from "@/components/dashboard/ui";
import { SectionNav } from "./SectionNav";
import { VisibilityTopicFilter } from "../visibility/VisibilityTopicFilter";
import { VisibilityPlatformFilter } from "../visibility/VisibilityPlatformFilter";
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
    <span
      tabIndex={0}
      role="button"
      aria-label={text}
      className="group relative inline-flex rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <Info className="h-3.5 w-3.5 opacity-70 hover:opacity-100 group-focus-visible:opacity-100 transition-opacity cursor-help text-foreground/65" />
      <span
        role="tooltip"
        className={`pointer-events-none absolute ${pos} bottom-full mb-2 w-60 rounded-md border border-border bg-popover px-3 py-2 text-[11.5px] leading-snug text-popover-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity z-30 shadow-lg`}
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

function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function formatSignedNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const rounded = Number(v.toFixed(digits));
  if (rounded === 0) return "0.00";
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(digits)}`;
}

function formatPct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${Math.round(v * 100)}%`;
}

// Tone helper — same semantics the Visibility / Competition spokes use.
type KpiPolarity = "higher_better" | "lower_better" | "neutral";
function toneByThreshold(
  value: number | null | undefined,
  polarity: KpiPolarity,
  good: number,
  bad: number,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "text-foreground";
  }
  if (polarity === "neutral") return "text-foreground";
  if (polarity === "higher_better") {
    if (value >= good) return "text-success";
    if (value <= bad) return "text-warning";
    return "text-foreground";
  }
  if (value <= good) return "text-success";
  if (value >= bad) return "text-warning";
  return "text-foreground";
}

export default async function NarrativePage({
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

  // URL-param sanitization — drop topic / platform values that don't
  // match anything in the payload so the rail dropdowns never claim a
  // scope the data can't honor.
  const validTopicSet = new Set([
    ...data.topic_leaderboard.map((t) => t.topic_label),
    ...data.topic_coverage.map((t) => t.label),
    ...data.topic_sentiment_matrix.map((r) => r.topic_label),
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

  // ── Briefing KPIs ────────────────────────────────────────────
  // Four tiles: Avg Sentiment value, Net Sentiment count, Top
  // Narrative Cluster name, Sentiment trajectory sparkline (inline
  // — see the JSX render below the .map). The first three use the
  // shared value+helper template; the trajectory tile renders
  // separately because its interior shape is a chart, not a value.
  const trajectory = data.trajectory;
  // Use the mention-scoped mean (same source as the Sentiment Mix
  // bar's "Mean sentiment ±0.1" caption) so the briefing tile and
  // the bar agree to the same decimal. `data.kpis.avg_sentiment`
  // averages across ALL responses including unnamed-layer ones
  // where the subject wasn't mentioned, so it can read slightly
  // different from sentiment_distribution.mean. The tile's
  // description ("Mean sentiment of AI answers that mention this
  // entity") matches the mention-scoped value, not the broader one.
  const sentimentMean =
    data.sentiment_distribution.mean ?? data.kpis.avg_sentiment.value;

  type KpiCard = {
    label: string;
    value: string;
    helper: string;
    tooltip?: string;
    subtitle?: string;
    valueColor: string;
    polarity: KpiPolarity;
    anchor?: string;
  };
  const kpis: KpiCard[] = [
    {
      label: "Avg. Sentiment",
      value: formatSignedNum(sentimentMean),
      subtitle: "−1 negative · +1 positive",
      helper: "Mean sentiment of AI answers that mention this entity.",
      tooltip:
        "Average sentiment score across mention-bearing responses. −1.0 = relentlessly negative; 0 = balanced or factual; +1.0 = relentlessly positive. ±0.1 around 0 counts as neutral.",
      valueColor: toneByThreshold(sentimentMean, "higher_better", 0.2, -0.2),
      polarity: "higher_better",
      anchor: "trend",
    },
    (() => {
      // Most Positive Topic — tracked topic with the highest
      // sentiment_mean from the topic_sentiment_matrix. Surfaces
      // the subject area where AI talks about the subject most
      // favorably, paired with the actual mean value as a subtitle
      // so the reader sees both "where" and "how positive."
      const positive = [...data.topic_sentiment_matrix]
        .filter((r) => r.sentiment_mean !== null)
        .sort(
          (a, b) => (b.sentiment_mean ?? 0) - (a.sentiment_mean ?? 0),
        )[0];
      return {
        label: "Most Positive Topic",
        value: positive
          ? capitalizeFirst(positive.topic_label)
          : "—",
        subtitle: positive
          ? `${formatSignedNum(positive.sentiment_mean)} sentiment`
          : undefined,
        helper:
          "Tracked topic where AI's mean sentiment about this entity is highest.",
        tooltip:
          "Topic from the per-topic sentiment matrix with the highest mean sentiment. Same mention-scoped methodology as Avg. Sentiment — only counts responses where the subject was actually mentioned. Click to jump to the full matrix below.",
        valueColor: toneByThreshold(
          positive?.sentiment_mean ?? null,
          "higher_better",
          0.2,
          -0.2,
        ),
        polarity: "higher_better" as const,
        anchor: "topics",
      };
    })(),
    (() => {
      // Top Narrative Cluster — leading bucket from
      // data.narrative_clusters (already sorted share-desc). Value
      // is the cluster name; subtitle carries the share %. Color-
      // tones by the cluster's own sentiment_mean so the tile reads
      // green when the dominant narrative is laudatory, warning
      // when hostile, and neutral otherwise — high cluster share
      // alone is neither good nor bad without knowing the framing.
      const cluster = data.narrative_clusters[0] ?? null;
      const sentiment = cluster?.sentiment_mean ?? null;
      const tone =
        sentiment === null
          ? "text-foreground"
          : sentiment > 0.1
            ? "text-success"
            : sentiment < -0.1
              ? "text-warning"
              : "text-foreground";
      return {
        label: "Top Narrative Cluster",
        value: cluster ? cluster.name : "—",
        subtitle: cluster
          ? `${Math.round(cluster.share * 100)}% of responses`
          : undefined,
        helper:
          "Leading narrative bucket AI grouped responses into for this snapshot.",
        tooltip:
          "The largest narrative cluster from the LLM-grouped responses on the latest refresh. Color tone reflects the cluster's own mean sentiment — green = laudatory cluster dominates; warning = hostile cluster dominates; neutral = balanced or unscored.",
        valueColor: tone,
        // Polarity is genuinely context-dependent (high share is
        // good for a laudatory cluster, bad for a hostile one), so
        // omit the directional arrow.
        polarity: "neutral" as const,
        anchor: "clusters",
      };
    })(),
  ];
  // Briefing tile #4 — Sentiment Δ vs first measured snapshot in
  // the trend window. Pushed below the kpis array because it depends
  // on the trend computation that follows. Pushed onto the array
  // once that data is ready (line below).

  // Sentiment trajectory for the inline briefing sparkline tile.
  // When the global topic / platform filter is active, swap the
  // overall trajectory for the scoped one (from trajectory_by_topic
  // / trajectory_by_platform). When BOTH filters are active, fall
  // back to overall — no per-(topic × platform) trajectory exists
  // in the payload, and surfacing an advisory inside a briefing
  // tile would crowd it.
  // Sentiment delta vs the first measured snapshot in the trend
  // window. Powers the 4th briefing tile (which previously was an
  // inline sparkline — replaced with this scalar because the
  // sparkline rendered too small in a tile slot to convey shape).
  // Honors the active topic / platform filter using the same
  // scoped-trajectory pick the matrix uses elsewhere.
  const scopedTrajForDelta = (() => {
    if (topic && platform) return null;
    if (topic) {
      return (
        data.trajectory_by_topic.find((r) => r.topic_label === topic) ??
        null
      );
    }
    if (platform) {
      return (
        data.trajectory_by_platform.find(
          (r) => r.platform_slug === platform,
        ) ?? null
      );
    }
    return null;
  })();
  const sentimentSeries = scopedTrajForDelta
    ? scopedTrajForDelta.avg_sentiment
    : trajectory.avg_sentiment;
  const sentimentDelta = (() => {
    const measured: { v: number; i: number }[] = [];
    for (let i = 0; i < sentimentSeries.length; i++) {
      const v = sentimentSeries[i];
      if (v !== null && Number.isFinite(v)) {
        measured.push({ v, i });
      }
    }
    if (measured.length < 2) return null;
    const first = measured[0];
    const last = measured[measured.length - 1];
    return {
      delta: last.v - first.v,
      firstDate: trajectory.weeks[first.i],
    };
  })();
  const fmtShortDate = (iso: string | undefined): string => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  // Push the Sentiment Δ tile onto the kpis array now that the
  // trend computation has resolved. Polarity follows sentiment's —
  // positive delta is good, negative delta is warning, tones at
  // ±0.05 to match the relatively small range sentiment values
  // typically move in week-over-week.
  kpis.push({
    label: "Sentiment Δ",
    value:
      sentimentDelta === null
        ? "—"
        : formatSignedNum(sentimentDelta.delta),
    subtitle:
      sentimentDelta === null
        ? "Not enough history"
        : `vs ${fmtShortDate(sentimentDelta.firstDate)}`,
    helper:
      "Change in mean sentiment since the start of the trend window.",
    tooltip:
      "First → last delta of the mean-sentiment trajectory across the active trend window. Honors the global topic / platform filter when one is set; falls back to overall when both filters are active.",
    valueColor: toneByThreshold(
      sentimentDelta?.delta ?? null,
      "higher_better",
      0.05,
      -0.05,
    ),
    polarity: "higher_better",
    anchor: "mix",
  });

  // ── Topic sentiment matrix scope ────────────────────────────
  // When the topic filter is active, narrow to that row only; when
  // platform is active, the matrix can't currently slice by platform
  // (no per-(topic × platform) sentiment in the payload yet), so we
  // surface that gap inline rather than silently showing the
  // unscoped data.
  const topicMatrix = topic
    ? data.topic_sentiment_matrix.filter((r) => r.topic_label === topic)
    : data.topic_sentiment_matrix;
  const platformAdvisory = platform
    ? "Topic sentiment isn't broken down by platform yet — values shown are aggregated across all platforms."
    : null;

  // ── Right-rail summary computation ──────────────────────────
  // Three rows: most positive topic / most negative topic / mean
  // criticism intensity. The positive-topic row duplicates the
  // briefing tile by design — the rail's symmetry between positive
  // and negative reads more cleanly to executives than asymmetric
  // novelty would.
  type SummaryRow = { label: string; value: string };
  const topicsRanked = [...data.topic_sentiment_matrix]
    .filter((r) => r.sentiment_mean !== null)
    .sort(
      (a, b) => (b.sentiment_mean ?? 0) - (a.sentiment_mean ?? 0),
    );
  const mostPositiveTopic = topicsRanked[0] ?? null;
  const mostNegativeTopic = topicsRanked[topicsRanked.length - 1] ?? null;
  // Mean criticism intensity — latest measured value of the
  // trajectory series. Surfaces a score the briefing doesn't
  // show directly but that's still in the payload.
  const criticismLatest = (() => {
    for (let i = trajectory.criticism_severity.length - 1; i >= 0; i--) {
      const v = trajectory.criticism_severity[i];
      if (v !== null && Number.isFinite(v)) return v;
    }
    return null;
  })();

  const summaryRows: SummaryRow[] = [
    {
      label: "Most positive topic",
      value: mostPositiveTopic
        ? `${capitalizeFirst(mostPositiveTopic.topic_label)} · ${formatSignedNum(mostPositiveTopic.sentiment_mean)}`
        : "Not enough data",
    },
    {
      label: "Most negative topic",
      value:
        mostNegativeTopic && mostNegativeTopic !== mostPositiveTopic
          ? `${capitalizeFirst(mostNegativeTopic.topic_label)} · ${formatSignedNum(mostNegativeTopic.sentiment_mean)}`
          : "Not enough data",
    },
    {
      label: "Mean criticism intensity",
      value:
        criticismLatest === null
          ? "Not enough data"
          : `${(Math.round(criticismLatest * 100) / 100).toFixed(2)} · 0 mild · 1 severe`,
    },
  ];

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
        className="line-clamp-2 text-sm font-semibold leading-snug text-foreground [overflow-wrap:anywhere]"
        title={value}
      >
        {value}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar subjectId={subjectId} activeSection="narrative" />

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

        <main className="flex-1 px-4 md:px-12 xl:pr-44 py-6 space-y-12 max-w-[1400px] w-full mx-auto">
          <SectionNav
            summary={
              <div>
                <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Narrative Summary
                </div>
                <div className="space-y-4">
                  {summaryRows.map((r) => (
                    <SummaryRow
                      key={r.label}
                      label={r.label}
                      value={r.value}
                    />
                  ))}
                </div>
              </div>
            }
            filters={
              <>
                <VisibilityTopicFilter
                  topics={data.topic_coverage.map((t) => ({
                    label: t.label,
                  }))}
                />
                <VisibilityPlatformFilter
                  platforms={data.platform_topic_matrix.platforms.map(
                    (p) => ({ slug: p.slug, name: p.name }),
                  )}
                />
              </>
            }
          />

          <Link
            href={`/subjects/${subjectId}`}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground hover:text-foreground transition-colors -mb-6"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back to {data.subject_name} Overview
          </Link>

          {/* ── BRIEFING ─────────────────────────────────────────── */}
          <section>
            <Card className="p-6 md:p-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {kpis.map((k) => {
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
                        {/* Font scales down for long string values
                            (e.g., topic / cluster names that ran 3
                            lines at the default text-[28px]). Drops
                            tracking-tight and adds text-balance so
                            wrapping splits more evenly when the
                            value still has to break. tabular-nums
                            stays on since it's a no-op for text. */}
                        <span
                          className={`font-semibold leading-tight [text-wrap:balance] tabular-nums ${
                            k.value.length > 24
                              ? "text-[18px]"
                              : k.value.length > 16
                                ? "text-[22px]"
                                : "text-[28px] leading-none tracking-tight"
                          } ${k.valueColor}`}
                        >
                          {k.value}
                        </span>
                      </div>
                      {k.subtitle && (
                        <div className="mt-2 text-[12.5px] leading-snug text-foreground/70">
                          {k.subtitle}
                        </div>
                      )}
                      <div className="mt-auto pt-3 space-y-1 text-[11.5px] leading-snug text-muted-foreground">
                        <div>{k.helper}</div>
                        {k.polarity !== "neutral" && (
                          <div className="text-foreground/55">
                            {k.polarity === "higher_better"
                              ? "↑ higher is better"
                              : "↓ lower is better"}
                          </div>
                        )}
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
            </Card>
          </section>

          {/* ── 01. SENTIMENT MIX ────────────────────────────────── */}
          {/* Single horizontal stacked bar showing the pos / neu /
              neg split of mention-bearing responses. Same scoping
              as the Avg. Sentiment KPI tile above (±0.1 neutral
              band, mention-scoped responses only) so the bar reads
              as a direct breakdown of that headline number. */}
          {(() => {
            // Pick the right sentiment distribution slice based on
            // the active filter scope. Topic-scoped data comes from
            // the per-topic matrix; platform-scoped comes from the
            // new platform distribution list. When BOTH filters are
            // active, fall back to overall + an advisory (we don't
            // ship a per-(topic × platform) intersection yet).
            const overall = data.sentiment_distribution;
            const scopedTopicRow = topic
              ? data.topic_sentiment_matrix.find(
                  (r) => r.topic_label === topic,
                )
              : null;
            const scopedPlatformRow = platform
              ? data.platform_sentiment_distribution.find(
                  (r) => r.platform_slug === platform,
                )
              : null;
            const bothActive = Boolean(topic && platform);
            // Normalize the chosen slice to the {pos, neu, neg, total,
            // mean} shape used by the bar below — the per-topic and
            // per-platform shapes have slightly different field names
            // but carry the same numbers.
            const d = bothActive
              ? overall
              : scopedTopicRow
                ? {
                    positive: scopedTopicRow.sentiment_positive,
                    neutral: scopedTopicRow.sentiment_neutral,
                    negative: scopedTopicRow.sentiment_negative,
                    total: scopedTopicRow.n_responses,
                    mean: scopedTopicRow.sentiment_mean,
                    threshold: overall.threshold,
                  }
                : scopedPlatformRow
                  ? {
                      positive: scopedPlatformRow.positive,
                      neutral: scopedPlatformRow.neutral,
                      negative: scopedPlatformRow.negative,
                      total: scopedPlatformRow.total,
                      mean: scopedPlatformRow.mean,
                      threshold: scopedPlatformRow.threshold,
                    }
                  : overall;
            const total = d.total;
            const pct = (n: number) =>
              total > 0 ? Math.round((n / total) * 100) : 0;
            const posPct = pct(d.positive);
            const neuPct = pct(d.neutral);
            const negPct = pct(d.negative);
            // Description reflects the active scope so the section
            // header reads correctly when filtered.
            const scopeNote =
              !bothActive && scopedTopicRow
                ? ` Filtered to topic: ${capitalizeFirst(topic)}.`
                : !bothActive && scopedPlatformRow
                  ? ` Filtered to platform: ${scopedPlatformRow.platform_name}.`
                  : "";
            return (
              <section id="mix" className="scroll-mt-20">
                <SectionTitle
                  eyebrow="01 · Mix"
                  title="Sentiment Mix"
                  description={`How AI talks about ${data.subject_name} when it mentions them at all — split across positive, neutral, and negative tone.${scopeNote}`}
                  className="mb-5"
                />
                <Card className="p-5 md:p-6">
                  {bothActive && (
                    <div className="mb-4 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
                      Sentiment mix can&apos;t intersect topic and
                      platform yet — the bar below shows the overall
                      split across all topics and platforms while one
                      filter is active. Honoring both requires a
                      per-(topic × platform) backend aggregation.
                    </div>
                  )}
                  {total === 0 ? (
                    <div className="text-[13px] text-muted-foreground">
                      Not enough mention-bearing responses in this
                      snapshot to compute a sentiment mix.
                    </div>
                  ) : (
                    <>
                      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
                        <span>
                          {total} mention-bearing{" "}
                          {total === 1 ? "response" : "responses"}
                        </span>
                        <span className="tabular-nums">
                          Mean sentiment{" "}
                          <span className="font-semibold text-foreground">
                            {formatSignedNum(d.mean)}
                          </span>
                          {"  ·  "}neutral band ±
                          {d.threshold.toFixed(1)}
                        </span>
                      </div>
                      <div
                        className="flex h-8 w-full overflow-hidden rounded-md"
                        role="img"
                        aria-label={`Sentiment mix: ${posPct}% positive, ${neuPct}% neutral, ${negPct}% negative`}
                      >
                        {posPct > 0 && (
                          <div
                            className="bg-success/85 flex items-center justify-center text-[11px] font-semibold text-background tabular-nums"
                            style={{ flexBasis: `${posPct}%` }}
                            title={`${d.positive} positive (${posPct}%)`}
                          >
                            {posPct >= 8 ? `${posPct}%` : ""}
                          </div>
                        )}
                        {neuPct > 0 && (
                          <div
                            className="bg-muted/80 flex items-center justify-center text-[11px] font-semibold text-foreground/75 tabular-nums"
                            style={{ flexBasis: `${neuPct}%` }}
                            title={`${d.neutral} neutral (${neuPct}%)`}
                          >
                            {neuPct >= 8 ? `${neuPct}%` : ""}
                          </div>
                        )}
                        {negPct > 0 && (
                          <div
                            className="bg-warning/85 flex items-center justify-center text-[11px] font-semibold text-background tabular-nums"
                            style={{ flexBasis: `${negPct}%` }}
                            title={`${d.negative} negative (${negPct}%)`}
                          >
                            {negPct >= 8 ? `${negPct}%` : ""}
                          </div>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px]">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="h-2.5 w-2.5 rounded-sm bg-success/85"
                            aria-hidden
                          />
                          <span className="text-foreground/80">
                            Positive
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {d.positive}
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="h-2.5 w-2.5 rounded-sm bg-muted/80"
                            aria-hidden
                          />
                          <span className="text-foreground/80">
                            Neutral
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {d.neutral}
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="h-2.5 w-2.5 rounded-sm bg-warning/85"
                            aria-hidden
                          />
                          <span className="text-foreground/80">
                            Negative
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {d.negative}
                          </span>
                        </span>
                      </div>
                    </>
                  )}
                </Card>
              </section>
            );
          })()}

          {/* ── 02. TOPIC SENTIMENT ──────────────────────────────── */}
          <section id="topics" className="scroll-mt-20">
            <SectionTitle
              eyebrow="02 · Topics"
              title="Topic Sentiment Matrix"
              description={
                topic
                  ? `Sentiment + auxiliary scores scoped to ${capitalizeFirst(topic)}.`
                  : "How AI sentiment differs by tracked topic. Higher mention counts come first."
              }
              className="mb-5"
            />
            <Card className="p-5 md:p-6">
              {platformAdvisory && (
                <div className="mb-4 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
                  {platformAdvisory}
                </div>
              )}
              {topicMatrix.length === 0 ? (
                <div className="text-[13px] text-muted-foreground">
                  No measured topic-level sentiment in this snapshot.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border/60 text-[10px] uppercase tracking-[0.06em] text-foreground/65">
                        <th className="py-3 pr-4 font-semibold">Topic</th>
                        <th className="py-3 px-3 text-right font-semibold whitespace-nowrap">
                          Responses
                        </th>
                        <th className="py-3 px-3 text-right font-semibold whitespace-nowrap">
                          Mean Sentiment
                        </th>
                        <th className="py-3 px-3 text-right font-semibold whitespace-nowrap">
                          Pos / Neu / Neg
                        </th>
                        <th className="py-3 pl-3 text-right font-semibold whitespace-nowrap">
                          Certainty
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {topicMatrix.map((row) => {
                        const sentimentTone =
                          row.sentiment_mean === null
                            ? "text-muted-foreground"
                            : row.sentiment_mean > 0.1
                              ? "text-success"
                              : row.sentiment_mean < -0.1
                                ? "text-warning"
                                : "text-foreground";
                        return (
                          <tr
                            key={row.topic_label}
                            className="border-b border-border/30 last:border-0 text-[13.5px]"
                          >
                            <td className="py-3.5 pr-4 font-medium text-foreground">
                              <span className="inline-flex items-center gap-2">
                                {capitalizeFirst(row.topic_label)}
                                {topic === row.topic_label && (
                                  <Pill tone="primary">Filtered</Pill>
                                )}
                              </span>
                            </td>
                            <td className="py-3.5 px-3 text-right tabular-nums text-foreground/85">
                              {row.n_responses}
                            </td>
                            <td
                              className={`py-3.5 px-3 text-right tabular-nums font-semibold ${sentimentTone}`}
                            >
                              {formatSignedNum(row.sentiment_mean)}
                            </td>
                            <td className="py-3.5 px-3 text-right tabular-nums text-foreground/85">
                              <span className="inline-flex items-center justify-end gap-1">
                                <span className="text-success">
                                  {row.sentiment_positive}
                                </span>
                                <span className="text-muted-foreground">
                                  ·
                                </span>
                                <span>{row.sentiment_neutral}</span>
                                <span className="text-muted-foreground">
                                  ·
                                </span>
                                <span className="text-warning">
                                  {row.sentiment_negative}
                                </span>
                              </span>
                            </td>
                            <td className="py-3.5 pl-3 text-right tabular-nums text-foreground/85">
                              {row.certainty_mean === null
                                ? "—"
                                : row.certainty_mean.toFixed(2)}
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

          {/* ── 03. NARRATIVE CLUSTERS ──────────────────────────── */}
          <section id="clusters" className="scroll-mt-20">
            <SectionTitle
              eyebrow="03 · Clusters"
              title="Narrative Clusters"
              description="LLM-grouped narrative buckets distilled from the AI answers in this snapshot."
              className="mb-5"
            />
            <Card className="p-5 md:p-6">
              {(() => {
                // Filter clusters by the active global scope. Topic
                // matches a cluster when its topic_distribution
                // includes the selected label; platform matches
                // analogously on platform_distribution. Both filters
                // can be active simultaneously — a cluster has to
                // show responses in both buckets to survive.
                const filteredClusters = data.narrative_clusters.filter(
                  (c) => {
                    const topicOk =
                      !topic ||
                      c.topic_distribution.some((t) => t.label === topic);
                    const platformOk =
                      !platform ||
                      c.platform_distribution.some((p) => p.slug === platform);
                    return topicOk && platformOk;
                  },
                );
                if (data.narrative_clusters.length === 0) {
                  return (
                    <div className="text-[13px] text-muted-foreground">
                      Not enough narrative-theme data in this snapshot to
                      cluster.
                    </div>
                  );
                }
                if (filteredClusters.length === 0) {
                  return (
                    <div className="text-[13px] text-muted-foreground">
                      No narrative clusters surface in the active
                      filter scope. Try clearing the topic or platform
                      filter in the right rail.
                    </div>
                  );
                }
                return (
                <ul className="space-y-5">
                  {filteredClusters.map((cluster, i) => {
                    // Cluster sentiment tone — same ±0.1 neutral band
                    // the sentiment_distribution methodology uses. The
                    // bg+text pairing makes the laudatory / neutral /
                    // hostile read pop at the cluster-row level
                    // without taking up its own column.
                    const sentimentTone =
                      cluster.sentiment_mean === null
                        ? null
                        : cluster.sentiment_mean > 0.1
                          ? {
                              label: "Positive",
                              cls: "bg-success/10 text-success",
                            }
                          : cluster.sentiment_mean < -0.1
                            ? {
                                label: "Negative",
                                cls: "bg-warning/10 text-warning",
                              }
                            : {
                                label: "Neutral",
                                cls: "bg-muted/60 text-foreground/70",
                              };
                    return (
                    <li
                      key={`${i}:${cluster.name}`}
                      className="border-b border-border/30 last:border-0 pb-5 last:pb-0"
                    >
                      <div className="flex items-baseline justify-between gap-4">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="text-[14px] font-semibold text-foreground truncate">
                            {cluster.name}
                          </div>
                          {sentimentTone && (
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] tabular-nums ${sentimentTone.cls}`}
                              title={`Mean sentiment of cluster responses: ${formatSignedNum(cluster.sentiment_mean)}`}
                            >
                              {sentimentTone.label} ·{" "}
                              {formatSignedNum(cluster.sentiment_mean)}
                            </span>
                          )}
                        </div>
                        <div className="tabular-nums text-[12.5px] text-muted-foreground shrink-0">
                          {formatPct(cluster.share)}
                          <span className="ml-1.5 text-foreground/55">
                            ({cluster.n_responses})
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-foreground/85">
                        {cluster.description}
                      </p>
                      {cluster.sample_labels.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {cluster.sample_labels
                            .slice(0, 6)
                            .map((s, idx) => (
                              <span
                                key={`${i}:${idx}`}
                                className="rounded-full bg-muted/60 px-2.5 py-0.5 text-[11.5px] text-foreground/75"
                              >
                                {s}
                              </span>
                            ))}
                        </div>
                      )}
                    </li>
                    );
                  })}
                </ul>
                );
              })()}
            </Card>
          </section>

          {/* ── 04. REPRESENTATIVE QUOTES ───────────────────────── */}
          {/* Surfaces prose-quote evidence_cards — actual passages
              AI used in characterizing the subject. narrative_frame
              entries lead the order since they're the most on-theme
              for a Narrative spoke, but characterization / criticism
              / praise are pulled in too so the section reliably has
              at least 2 quotes whenever any prose evidence exists
              (a single-narrative_frame snapshot used to render a
              one-item card alone). factual_claim + model_difference
              are excluded since they're structural rather than prose
              opinion. Capped at 6 to stay scannable. */}
          {(() => {
            const QUOTE_TYPES = [
              "narrative_frame",
              "characterization",
              "criticism",
              "praise",
            ];
            const TYPE_PRIORITY: Record<string, number> = {
              narrative_frame: 0,
              characterization: 1,
              criticism: 2,
              praise: 2,
            };
            // Build response_id → cluster sentiment_mean lookup
            // from the narrative clusters' response_ids[] arrays so
            // each quote can render a sentiment pill that matches
            // the cluster card sentiment treatment elsewhere on
            // the page. When a response is in multiple clusters
            // (defensive — shouldn't happen) the first match wins.
            // Quotes whose model_response_id isn't in any cluster
            // get no pill (no false signal).
            const sentimentByResponseId = new Map<number, number>();
            for (const c of data.narrative_clusters) {
              if (c.sentiment_mean === null) continue;
              for (const rid of c.response_ids) {
                if (!sentimentByResponseId.has(rid)) {
                  sentimentByResponseId.set(rid, c.sentiment_mean);
                }
              }
            }
            // Platform filter wires via evidence_cards.model_slug
            // (real filter — narrows the quote feed to that AI
            // platform). Topic filter still needs a backend join
            // since evidence_cards don't carry topic labels; an
            // inline advisory below admits that gap when topic is
            // set.
            const quotes = data.evidence_cards
              .filter(
                (c) =>
                  QUOTE_TYPES.includes(c.type) &&
                  c.excerpt &&
                  c.excerpt.trim().length > 0 &&
                  (!platform || c.model_slug === platform),
              )
              .sort(
                (a, b) =>
                  (TYPE_PRIORITY[a.type] ?? 99) -
                  (TYPE_PRIORITY[b.type] ?? 99),
              )
              .slice(0, 6);
            return (
              <section id="quotes" className="scroll-mt-20">
                <SectionTitle
                  eyebrow="04 · Quotes"
                  title="Representative Quotes"
                  description={
                    platform
                      ? `AI passages from ${platform} that frame the narrative around ${data.subject_name}.`
                      : `Actual AI passages that frame the narrative around ${data.subject_name}.`
                  }
                  className="mb-5"
                />
                <Card className="p-5 md:p-6">
                  {topic && (
                    <div className="mb-4 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
                      Quotes aren&apos;t filtered by topic yet —
                      evidence cards don&apos;t carry topic labels in
                      the payload. The list below shows quotes from
                      across all topics.
                    </div>
                  )}
                  {quotes.length === 0 ? (
                    <div className="text-[13px] text-muted-foreground">
                      No narrative-frame quotes captured in this
                      snapshot.
                    </div>
                  ) : (
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {quotes.map((q, i) => {
                        // Eyebrow: prefer the LLM-supplied frame_label
                        // when present (narrative_frame entries
                        // typically have one). Fall back to a
                        // human-readable type label so mixed-type
                        // cards (criticism / praise / characterization)
                        // still get a categorical tag.
                        const typeLabel = q.type
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (m) => m.toUpperCase());
                        const eyebrowText = q.frame_label || typeLabel;
                        // Sentiment pill — inherited from the
                        // narrative cluster this response belongs
                        // to (matches the cluster-card sentiment
                        // labels). Quote-level sentiment isn't
                        // surfaced in the payload yet, but the
                        // cluster membership is a close proxy
                        // since clusters group responses by
                        // shared framing. Null when the response
                        // isn't in any cluster carrying sentiment.
                        const quoteSentiment =
                          sentimentByResponseId.get(q.model_response_id) ??
                          null;
                        const sentimentTone =
                          quoteSentiment === null
                            ? null
                            : quoteSentiment > 0.1
                              ? {
                                  label: "Positive",
                                  cls: "bg-success/10 text-success",
                                }
                              : quoteSentiment < -0.1
                                ? {
                                    label: "Negative",
                                    cls: "bg-warning/10 text-warning",
                                  }
                                : {
                                    label: "Neutral",
                                    cls: "bg-muted/60 text-foreground/70",
                                  };
                        return (
                        <li
                          key={`${i}:${q.model_response_id}`}
                          className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background/60 p-4"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/55 min-w-0 truncate">
                              {eyebrowText}
                            </div>
                            {sentimentTone && (
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] tabular-nums ${sentimentTone.cls}`}
                                title={`Cluster mean sentiment: ${formatSignedNum(quoteSentiment)}`}
                              >
                                {sentimentTone.label} ·{" "}
                                {formatSignedNum(quoteSentiment)}
                              </span>
                            )}
                          </div>
                          <blockquote className="border-l-2 border-border/70 pl-3 text-[13.5px] leading-relaxed text-foreground/90">
                            &ldquo;{q.excerpt}&rdquo;
                          </blockquote>
                          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
                            <span className="font-medium text-foreground/75">
                              {q.model_slug}
                            </span>
                            {q.prompt_text && (
                              <span
                                className="line-clamp-1"
                                title={q.prompt_text}
                              >
                                {q.prompt_text}
                              </span>
                            )}
                          </div>
                        </li>
                        );
                      })}
                    </ul>
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

