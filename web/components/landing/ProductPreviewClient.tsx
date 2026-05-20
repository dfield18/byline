"use client";

/**
 * Interactive AI Narrative Brief preview for the landing page's
 * "What you see" section. Renders the same briefing triad (Bottom
 * Line · Strongest Asset · Recommended Move) the live dashboard
 * hero uses, with a small toggle to switch between two real
 * political figures — one Democrat, one Republican — so a visitor
 * sees the product output for subjects they recognize.
 *
 * Content for J.D. Vance mirrors the live brief on the user's
 * dashboard at the time of writing; AOC's content is a plausible
 * composition matching the same format. Kept neutral and
 * data-led — no editorializing.
 */

import { useState } from "react";

import { Card } from "@/components/dashboard/ui";

type SubjectBrief = {
  id: string;
  name: string;
  party: "D" | "R";
  bottomLineTitle: string;
  bottomLineBody: string;
  strongestAssetTitle: string;
  strongestAssetBody: string;
  recommendedMove: string;
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
      "Brief independent sources on housing affordability — the largest visibility gap in this snapshot.",
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
        className="inline-flex rounded-md border border-border/80 bg-card/40 p-1"
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
          hero card chrome (same header layout + briefing triad
          structure) so the marketing visual reads as authentic
          product output rather than a stylized illustration. */}
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

          {/* Briefing triad — same chrome as the live subject
              overview hero. Bottom Line carries the largest title
              (15px); Strongest Asset and Recommended Move sit at
              13.5/14px so the lead claim still anchors visually. */}
          <div className="mt-6 space-y-5">
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
        </div>
      </Card>
    </div>
  );
}
