"use client";

/**
 * Interactive AI Narrative Brief preview for the landing page's
 * "What you see" section. Mirrors the full live dashboard hero
 * card — the briefing triad (Bottom Line · Strongest Asset ·
 * Recommended Move), the Narrative Mix cluster bars in the right
 * column, and the four-tile KPI strip below — with a toggle to
 * switch between two real political figures (one Republican,
 * one Democrat).
 *
 * Content for J.D. Vance mirrors the live brief on the user's
 * dashboard at the time of writing; AOC's content is a plausible
 * composition matching the same format. Kept neutral and
 * data-led — no editorializing.
 */

import { useState } from "react";

import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Card } from "@/components/dashboard/ui";

type Cluster = { name: string; pct: number; negative?: boolean };

type KPI = {
  label: string;
  value: string;
  valueColor: string;
  delta: string | null;
  trend: "up" | "down" | "flat";
  subtitle?: string;
};

type SubjectBrief = {
  id: string;
  name: string;
  party: "D" | "R";
  bottomLineTitle: string;
  bottomLineBody: string;
  strongestAssetTitle: string;
  strongestAssetBody: string;
  recommendedMove: string;
  clusters: Cluster[];
  kpis: KPI[];
};

const SUBJECTS: SubjectBrief[] = [
  {
    id: "vance",
    name: "J.D. Vance",
    party: "R",
    bottomLineTitle:
      "AI underweights J.D. Vance on the future of American conservatism.",
    bottomLineBody:
      "0% mention rate vs 67% average across other tracked topics.",
    strongestAssetTitle:
      "Strongest association: figures shaping the Republican administration.",
    strongestAssetBody: "100% mention rate, neutral overall sentiment.",
    recommendedMove:
      "Author an op-ed defining a vision for ‘the future of American conservatism.’",
    clusters: [
      { name: "Administration Role and Influence", pct: 40 },
      { name: "Conservative Populism and Policies", pct: 35 },
      { name: "Author and Commentator", pct: 10 },
      { name: "Political Opportunism Critiques", pct: 10, negative: true },
    ],
    kpis: [
      {
        label: "Unprompted mentions",
        value: "50%",
        valueColor: "text-success",
        delta: "10 pts vs prior",
        trend: "up",
      },
      {
        label: "Positive vs negative",
        value: "−5%",
        valueColor: "text-warning",
        delta: "6.7 pts vs prior",
        trend: "up",
      },
      {
        label: "Weakest topic visibility",
        value: "0%",
        valueColor: "text-warning",
        delta: null,
        trend: "flat",
        subtitle: "The future of American conservatism",
      },
      {
        label: "% citing own site",
        value: "0%",
        valueColor: "text-foreground",
        delta: null,
        trend: "flat",
      },
    ],
  },
  {
    id: "aoc",
    name: "Alexandria Ocasio-Cortez",
    party: "D",
    bottomLineTitle:
      "AI consistently associates Alexandria Ocasio-Cortez with progressive leadership in Congress.",
    bottomLineBody:
      "90% mention rate across tracked topic areas, favorable overall sentiment.",
    strongestAssetTitle:
      "Strongest association: progressive members of Congress.",
    strongestAssetBody: "100% mention rate, favorable overall sentiment.",
    recommendedMove:
      "Brief independent sources on federal housing policy — the largest visibility gap in this snapshot.",
    clusters: [
      { name: "Progressive Policy Champion", pct: 73 },
      { name: "Criticism and Controversy", pct: 15, negative: true },
      { name: "Progressive Network Influence", pct: 12 },
    ],
    kpis: [
      {
        label: "Unprompted mentions",
        value: "90%",
        valueColor: "text-success",
        delta: "8 pts vs prior",
        trend: "up",
      },
      {
        label: "Positive vs negative",
        value: "+30%",
        valueColor: "text-success",
        delta: "4 pts vs prior",
        trend: "up",
      },
      {
        label: "Weakest topic visibility",
        value: "45%",
        valueColor: "text-warning",
        delta: null,
        trend: "flat",
        subtitle: "Federal housing policy",
      },
      {
        label: "% citing own site",
        value: "12%",
        valueColor: "text-foreground",
        delta: null,
        trend: "flat",
      },
    ],
  },
];

export function ProductPreviewClient() {
  const [activeId, setActiveId] = useState<string>(SUBJECTS[0].id);
  const subject = SUBJECTS.find((s) => s.id === activeId) ?? SUBJECTS[0];

  return (
    <div>
      {/* Subject toggle — two-button tab control. Active subject
          gets the primary-button treatment; inactive sits as a
          ghost label so the choice is unambiguous on first scan. */}
      <div
        role="tablist"
        aria-label="Switch between sample subjects"
        className="inline-grid grid-cols-2 rounded-md border border-border/80 bg-card/40 p-1"
      >
        {SUBJECTS.map((s) => {
          const active = s.id === activeId;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveId(s.id)}
              className={`rounded-sm px-3.5 py-1.5 text-[13.5px] font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                  : "text-foreground/65 hover:text-foreground"
              }`}
            >
              {s.name}
              <span
                className={`ml-1.5 text-[10px] font-semibold ${
                  active ? "opacity-80" : "opacity-60"
                }`}
              >
                ({s.party})
              </span>
            </button>
          );
        })}
      </div>

      {/* AI Narrative Brief card — mirrors the live dashboard's
          hero card chrome: header → 2-col (briefing triad +
          narrative mix) → KPI strip. */}
      <Card className="relative mt-6 overflow-hidden p-6 md:p-8">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklab, var(--primary) 4%, transparent) 0%, transparent 60%)",
          }}
        />
        <div className="relative">
          {/* Card header — eyebrow + subject name + meta line. */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-border/80 pb-5">
            <div>
              <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-foreground/80">
                AI Narrative Brief
              </div>
              <div className="font-display text-[24px] font-semibold tracking-[-0.01em] text-foreground">
                {subject.name}
              </div>
            </div>
            <div className="text-[11.5px] font-medium text-foreground/75">
              Last 7 days &middot; 4 platforms
            </div>
          </div>

          {/* Two-column grid: briefing triad (col-span-3) + narrative
              mix (col-span-2). Stacks on mobile, splits on lg+. */}
          <div className="mt-6 grid gap-8 lg:grid-cols-5 lg:gap-12">
            {/* Left col: briefing triad. Bottom Line carries the
                largest title (15px); Strongest Asset and Recommended
                Move sit at 13.5/14px so the lead claim anchors. */}
            <div className="space-y-5 lg:col-span-3">
              <div className="border-l-2 border-l-primary pl-3.5">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-primary">
                  Bottom line
                </div>
                <div className="mt-0.5 text-[15px] font-semibold leading-snug text-foreground">
                  {subject.bottomLineTitle}
                </div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-foreground/75">
                  {subject.bottomLineBody}
                </p>
              </div>

              <div className="border-l-2 border-l-primary pl-3.5">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-primary">
                  Strongest asset
                </div>
                <div className="mt-0.5 text-[13.5px] font-semibold leading-snug text-foreground">
                  {subject.strongestAssetTitle}
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-foreground/70">
                  {subject.strongestAssetBody}
                </p>
              </div>

              <div className="border-l-2 border-l-primary pl-3.5">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-primary">
                  Recommended move
                </div>
                <div className="mt-0.5 text-[14px] font-semibold leading-snug text-foreground">
                  {subject.recommendedMove}
                </div>
              </div>
            </div>

            {/* Right col: Narrative Mix cluster bars. Mirrors the
                live DominantNarrativePanel — same opacity ramp by
                position (0.6 / 0.45 / 0.3 / 0.2), same warning-
                color override for risk-frame clusters. */}
            <div className="lg:col-span-2 lg:border-l lg:border-border/80 lg:pl-8">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/50">
                Narrative mix
              </div>
              <ul className="mt-6 space-y-5">
                {subject.clusters.map((c, i) => {
                  const opacity =
                    i === 0 ? 0.6 : i === 1 ? 0.45 : i === 2 ? 0.3 : 0.2;
                  return (
                    <li key={c.name}>
                      <div className="mb-1 flex items-center justify-between text-[12.5px]">
                        <span className="text-foreground/65">{c.name}</span>
                        <span className="tabular-nums text-[11.5px] text-foreground/55">
                          {c.pct}%
                        </span>
                      </div>
                      <div className="relative h-1 w-full overflow-hidden rounded-full bg-muted/80">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full"
                          style={{
                            width: `${c.pct}%`,
                            background: c.negative
                              ? "var(--warning)"
                              : "var(--primary)",
                            opacity: c.negative ? 0.75 : opacity,
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* KPI strip — 4 tiles below the briefing + narrative pair.
              Same chrome as the live HeroKpis (rounded card, min-h
              for uniform height, title up top + value/delta/subtitle
              stack at the bottom). */}
          <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-4">
            {subject.kpis.map((k) => {
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
              const deltaText =
                k.delta === null ? "no prior data" : `${k.delta}`;
              return (
                <div
                  key={k.label}
                  className="flex min-h-[140px] flex-col rounded-lg border border-border/80 bg-background/60 p-5"
                >
                  <div className="truncate text-sm font-medium text-foreground">
                    {k.label}
                  </div>
                  <div className="mt-auto space-y-1.5 pt-4">
                    {/* Subtitle (topic name) sits ABOVE the value so it
                        reads as the label of what the number applies to —
                        e.g., "Federal housing policy" → "45%". Empty
                        min-h placeholder for tiles without a subtitle
                        preserves vertical alignment of the value across
                        the strip. */}
                    <div className="min-h-[14px] truncate text-[11px] text-muted-foreground">
                      {k.subtitle ?? ""}
                    </div>
                    <div
                      className={`text-2xl font-semibold leading-none tracking-tight ${k.valueColor}`}
                    >
                      {k.value}
                    </div>
                    <div
                      className={`flex items-center gap-1 text-xs leading-none ${deltaColor}`}
                    >
                      <TrendIcon className="h-3 w-3 shrink-0" aria-hidden />
                      <span>{deltaText}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}
