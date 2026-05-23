"use client";

/**
 * Floating section-jump nav for the Competition hub. Same scroll-spy
 * + IntersectionObserver pattern as the Visibility hub's nav, but
 * scoped to the three sections that live here.
 *
 * Accepts a `filters` slot rendered as a separate card below the
 * Jump-to nav so page-level filter dropdowns (e.g. Landscape topic +
 * platform) can live in the right rail instead of inline in the
 * section header. Both cards are `hidden xl:block`, so at narrower
 * widths the filters disappear with the nav — the URL still drives
 * scope, so a saved/shared link still applies.
 */
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

// The Platform Ownership section was folded into the briefing
// card at the top of the page (mirroring the Visibility spoke's
// "Current Platform Snapshot" pattern) — it lives inside the hero
// Card now, not as its own scroll target, so it's intentionally
// not listed here.
const ALL_ITEMS = [
  { id: "trend", label: "Trend", num: "01" },
  { id: "landscape", label: "Landscape", num: "02" },
  { id: "ranking-table", label: "Ranking", num: "03" },
  { id: "wins-losses", label: "Wins & Losses", num: "04" },
  { id: "co-mentions", label: "Co-Mentions", num: "05" },
];

export function SectionNav({
  filters,
  summary,
  hasWinsLossesData = false,
}: {
  filters?: ReactNode;
  // Optional Competitive Summary card rendered above the Jump-to
  // nav. Composed on the page from filtered data so it always
  // reflects the active topic / platform scope.
  summary?: ReactNode;
  // Whether the Wins & Losses section is rendered on the page.
  // The nav drops the matching jump link when false so the rail
  // can't point at a missing anchor.
  hasWinsLossesData?: boolean;
}) {
  // Filter the jump-link items by the section-availability flags so
  // a missing section never leaves a dangling rail entry. Memoized
  // so the IntersectionObserver effect below doesn't re-observe on
  // every render — the array identity only changes when an
  // availability flag flips.
  const ITEMS = useMemo(
    () =>
      ALL_ITEMS.filter(
        (i) => i.id !== "wins-losses" || hasWinsLossesData,
      ),
    [hasWinsLossesData],
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const observed: HTMLElement[] = [];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        rootMargin: "-40% 0px -50% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );
    for (const item of ITEMS) {
      const el = document.getElementById(item.id);
      if (el) {
        observer.observe(el);
        observed.push(el);
      }
    }
    return () => {
      for (const el of observed) observer.unobserve(el);
      observer.disconnect();
    };
  }, [ITEMS]);

  return (
    <aside className="hidden xl:block fixed right-6 top-28 z-30 w-[220px] space-y-3 max-h-[calc(100vh-7rem)] overflow-y-auto">
      {summary && (
        <div
          aria-label="Competitive summary"
          className="rounded-lg border border-border/70 bg-card/95 p-3 shadow-sm backdrop-blur"
        >
          {summary}
        </div>
      )}
      <nav
        aria-label="Competition sections"
        className="rounded-lg border border-border/70 bg-card/95 p-3 shadow-sm backdrop-blur"
      >
        <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Jump to
        </div>
        <ul className="space-y-1.5">
          {ITEMS.map((i) => {
            const isActive = activeId === i.id;
            return (
              <li key={i.id}>
                <a
                  href={`#${i.id}`}
                  aria-current={isActive ? "true" : undefined}
                  className={`group relative flex items-center gap-2 pl-2 text-[12px] transition-colors ${
                    isActive
                      ? "font-semibold text-primary"
                      : "text-foreground/70 hover:text-foreground"
                  }`}
                >
                  {isActive && (
                    <span
                      className="absolute -left-1 top-0.5 bottom-0.5 w-[2px] rounded-full bg-primary"
                      aria-hidden
                    />
                  )}
                  <span
                    className={`tabular-nums ${
                      isActive
                        ? "text-primary"
                        : "text-foreground/40 group-hover:text-foreground/65"
                    }`}
                  >
                    {i.num}
                  </span>
                  <span>{i.label}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      {filters && (
        <div
          aria-label="Page filters"
          className="rounded-lg border border-border/70 bg-card/95 p-3 shadow-sm backdrop-blur"
        >
          <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Filters
          </div>
          {/* Children stack vertically — the page passes one
              dropdown per child so each scope sits on its own row
              in the right rail. */}
          <div className="space-y-2.5">{filters}</div>
        </div>
      )}
    </aside>
  );
}
