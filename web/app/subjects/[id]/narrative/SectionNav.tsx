"use client";

/**
 * Floating section-jump nav for the Narrative spoke. Same scroll-spy
 * + IntersectionObserver pattern the Visibility / Competition spokes
 * use, scoped to the narrative sections that live here.
 *
 * Accepts a `summary` slot (executive snapshot card rendered above
 * the nav) and a `filters` slot (topic + platform dropdowns rendered
 * below the nav) so the page-level scope state lives in the right
 * rail and applies to every section that supports it.
 */
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

// Sentiment Trend section was retired — the sparkline now lives
// inline as the 4th briefing tile on the page. The remaining
// sections renumber down by one.
const ITEMS = [
  { id: "mix", label: "Sentiment Mix", num: "01" },
  { id: "topics", label: "Topic Sentiment", num: "02" },
  { id: "clusters", label: "Narrative Clusters", num: "03" },
  { id: "quotes", label: "Representative Quotes", num: "04" },
];

export function SectionNav({
  summary,
  filters,
}: {
  summary?: ReactNode;
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
  }, []);

  return (
    <aside className="hidden xl:block fixed right-6 top-28 z-30 w-[220px] space-y-3 max-h-[calc(100vh-7rem)] overflow-y-auto">
      {summary && (
        <div
          aria-label="Narrative summary"
          className="rounded-lg border border-border/70 bg-card/95 p-3 shadow-sm backdrop-blur"
        >
          {summary}
        </div>
      )}
      <nav
        aria-label="Narrative sections"
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
          <div className="space-y-2.5">{filters}</div>
        </div>
      )}
    </aside>
  );
}
