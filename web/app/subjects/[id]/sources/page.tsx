/**
 * Sources spoke.
 *
 * Two sections — Top Sources table (with response coverage +
 * per-platform chips) and Authority Mix bar chart grouped by
 * source_type. Briefing tiles up top: Top Source, Sources Tracked,
 * Total Citations, Subject Self-Citation Rate. Data lifts the
 * existing `data.sources[]` payload after the backend extension
 * added `response_coverage` + `platforms[]` per source.
 */
import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { notFound } from "next/navigation";

import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { Card, SectionTitle } from "@/components/dashboard/ui";
import { SectionNav } from "./SectionNav";
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

function formatPct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${Math.round(v * 100)}%`;
}

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

export default async function SourcesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
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

  const subjectInitials = deriveInitials(data.subject_name);
  const updated = data.meta.last_refresh_at
    ? new Date(data.meta.last_refresh_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
  const headerMeta = updated ? `Updated ${updated}` : "";

  // ── Briefing KPI computation ────────────────────────────────
  const sources = data.sources;
  const topSource = sources[0] ?? null;
  const totalCitations = sources.reduce((s, r) => s + r.n_citations, 0);
  const citationRate = data.kpis.citation_rate.value;

  type KpiCard = {
    label: string;
    value: string;
    subtitle?: string;
    helper: string;
    tooltip?: string;
    valueColor: string;
    polarity: KpiPolarity;
    anchor?: string;
  };
  const kpis: KpiCard[] = [
    {
      label: "Top Source",
      value: topSource ? topSource.name : "—",
      subtitle: topSource
        ? `${formatPct(topSource.response_coverage)} of responses`
        : undefined,
      helper:
        "Domain most frequently cited by AI in responses about this subject.",
      tooltip:
        "Most-cited source on the latest snapshot. Subdomains (e.g. en.wikipedia.org / wikipedia.org) are merged into a single canonical domain. The subtitle shows what percent of mention-bearing responses cited this source.",
      valueColor: "text-foreground",
      polarity: "neutral",
      anchor: "top-sources",
    },
    {
      label: "Sources Tracked",
      value: String(sources.length),
      subtitle: sources.length === 1 ? "domain cited" : "domains cited",
      helper: "Distinct sources AI cited in this snapshot.",
      tooltip:
        "Count of canonical source domains AI cited across the snapshot. Higher = more diverse citation pool; lower = AI leans on a small set of sources for this subject.",
      valueColor: toneByThreshold(sources.length, "higher_better", 5, 2),
      polarity: "higher_better",
      anchor: "top-sources",
    },
    {
      label: "Total Citations",
      value: String(totalCitations),
      subtitle: "across top sources",
      helper:
        "Sum of citation occurrences across all tracked sources in this snapshot.",
      tooltip:
        "Raw citation count summed across the top sources. A single response citing the same source twice counts as 2 — Top Source's coverage % is the deduplicated reach.",
      valueColor: "text-foreground",
      polarity: "neutral",
      anchor: "top-sources",
    },
    {
      label: "Self-Citation Rate",
      value: formatPct(citationRate),
      subtitle: "subject's own site",
      helper:
        "Share of AI responses that cited the subject's own canonical URL.",
      tooltip:
        "How often AI grounds its answers in the subject's own published content (matches data.kpis.citation_rate). Higher = AI treats your owned media as authoritative; lower = AI is relying on third-party sources.",
      valueColor: toneByThreshold(citationRate, "higher_better", 0.2, 0.05),
      polarity: "higher_better",
    },
  ];

  // ── Authority Mix computation ───────────────────────────────
  // Group sources by `type` and sum n_citations. Sort by share
  // desc. The total denominator uses totalCitations from above so
  // each bar's share is interpretable as "of all citations in this
  // snapshot, X% came from <type>."
  const authorityByType = new Map<string, number>();
  for (const s of sources) {
    authorityByType.set(
      s.type,
      (authorityByType.get(s.type) ?? 0) + s.n_citations,
    );
  }
  const authorityRows = [...authorityByType.entries()]
    .map(([type, count]) => ({
      type,
      count,
      share: totalCitations > 0 ? count / totalCitations : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar subjectId={subjectId} activeSection="sources" />

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
          <SectionNav />

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

          {/* ── 01. TOP SOURCES ─────────────────────────────────── */}
          <section id="top-sources" className="scroll-mt-20">
            <SectionTitle
              eyebrow="01 · Sources"
              title="Top Cited Sources"
              description={`Domains AI most often cites when answering about ${data.subject_name}, with per-platform breakdown.`}
              className="mb-5"
            />
            <Card className="p-5 md:p-6">
              {sources.length === 0 ? (
                <div className="text-[13px] text-muted-foreground">
                  No cited sources captured in this snapshot.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border/60 text-[10px] uppercase tracking-[0.06em] text-foreground/65">
                        <th className="py-3 pr-3 font-semibold">Source</th>
                        <th className="py-3 px-3 font-semibold">Type</th>
                        <th className="py-3 px-3 text-right font-semibold whitespace-nowrap">
                          Citations
                        </th>
                        <th className="py-3 px-3 text-right font-semibold whitespace-nowrap">
                          Coverage
                        </th>
                        <th className="py-3 pl-3 font-semibold">
                          By Platform
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sources.map((s) => (
                        <tr
                          key={s.name}
                          className="border-b border-border/30 last:border-0 text-[13.5px]"
                        >
                          <td className="py-3.5 pr-3 font-medium text-foreground">
                            <a
                              href={`https://${s.name}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-primary hover:underline"
                            >
                              {s.name}
                            </a>
                          </td>
                          <td className="py-3.5 px-3 text-foreground/75">
                            {s.type}
                          </td>
                          <td className="py-3.5 px-3 text-right tabular-nums text-foreground/85">
                            {s.n_citations}
                          </td>
                          <td className="py-3.5 px-3 text-right tabular-nums font-semibold text-foreground">
                            {formatPct(s.response_coverage)}
                          </td>
                          <td className="py-3.5 pl-3">
                            <div className="flex flex-wrap gap-1">
                              {s.platforms.length === 0 ? (
                                <span className="text-[12px] text-muted-foreground">
                                  —
                                </span>
                              ) : (
                                s.platforms.map((p) => (
                                  <span
                                    key={p.slug}
                                    className="rounded-full bg-muted/60 px-2 py-0.5 text-[10.5px] font-medium text-foreground/75 tabular-nums"
                                    title={`${p.name} — ${p.n_citations} ${p.n_citations === 1 ? "citation" : "citations"}`}
                                  >
                                    {p.name}{" "}
                                    <span className="text-foreground/50">
                                      {p.n_citations}
                                    </span>
                                  </span>
                                ))
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </section>

          {/* ── 02. AUTHORITY MIX ───────────────────────────────── */}
          <section id="authority-mix" className="scroll-mt-20">
            <SectionTitle
              eyebrow="02 · Authority"
              title="Authority Mix"
              description="Citations grouped by source category. Shows whether AI leans on news, official, academic, or other source types when answering about this subject."
              className="mb-5"
            />
            <Card className="p-5 md:p-6">
              {authorityRows.length === 0 ? (
                <div className="text-[13px] text-muted-foreground">
                  No citation type breakdown available in this snapshot.
                </div>
              ) : (
                <ul className="space-y-3">
                  {authorityRows.map((row) => (
                    <li
                      key={row.type}
                      className="flex items-center gap-4"
                    >
                      <div className="w-32 shrink-0 text-[13px] font-medium text-foreground/85 truncate">
                        {row.type}
                      </div>
                      <div className="relative flex-1 h-6 rounded-md bg-muted/40 overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 bg-primary/70 rounded-md transition-all"
                          style={{ width: `${Math.max(2, row.share * 100)}%` }}
                          aria-hidden
                        />
                      </div>
                      <div className="w-32 shrink-0 text-right text-[12.5px] text-foreground/85 tabular-nums">
                        <span className="font-semibold text-foreground">
                          {formatPct(row.share)}
                        </span>
                        <span className="ml-1.5 text-muted-foreground">
                          ({row.count})
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        </main>
      </div>
    </div>
  );
}
