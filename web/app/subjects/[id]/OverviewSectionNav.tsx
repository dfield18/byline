"use client";

/**
 * Floating right-rail nav for the Overview spoke. Mirrors the
 * Visibility / Narrative / Competition spokes' SectionNav pattern
 * — scroll-spy jump links + optional filters card. Section ids
 * map to the `<section id="…">` wrappers added on the Overview
 * page. Filters persist via URL params so navigating from Overview
 * into a deeper spoke carries the scope forward.
 */
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

type Item = { id: string; label: string; num: string };

export function OverviewSectionNav({
  items,
  filters,
}: {
  // Items can vary by what the Overview chose to render — some
  // sections (Trends, Evidence, Competition) are conditional on
  // data being present. The page passes the filtered list.
  items: Item[];
  filters?: ReactNode;
}) {
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
    for (const item of items) {
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
    // Items array identity comes from the parent's render — fine
    // because the parent computes it from the same source-of-truth
    // SubjectOverview payload that drives the rest of the page.
  }, [items]);

  return (
    <aside className="hidden xl:block fixed right-6 top-28 z-30 w-[220px] space-y-3 max-h-[calc(100vh-7rem)] overflow-y-auto">
      <nav
        aria-label="Overview sections"
        className="rounded-lg border border-border/70 bg-card/95 p-3 shadow-sm backdrop-blur"
      >
        <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Jump to
        </div>
        <ul className="space-y-1.5">
          {items.map((i) => {
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
          <div className="space-y-2.5">{filters}</div>
        </div>
      )}
    </aside>
  );
}
