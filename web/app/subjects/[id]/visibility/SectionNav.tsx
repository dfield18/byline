"use client";

/**
 * Floating section-jump nav for the Visibility hub. Fixed to the
 * right edge of the viewport at xl+ widths only — narrower viewports
 * can't afford the horizontal real estate, so it hides cleanly.
 *
 * Scroll-spy: uses IntersectionObserver on each item to highlight
 * whichever section currently dominates the viewport. Competitive
 * lives on its own /competition spoke and is reachable from the
 * left-rail sidebar — listing it here too just duplicated the entry
 * and broke the in-page navigation contract.
 */
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

type NavItem = { id: string; label: string; num: string };

export function SectionNav({
  subjectId,
  summary,
  filters,
}: {
  subjectId: number;
  // Optional summary card rendered above the Jump-to nav, mirroring
  // the Competition spoke's "Competitive Summary" right-rail block.
  // Composed on the page from the active scope's data so the rail
  // surfaces 3-4 executive-read facts without the reader having to
  // scroll the main column.
  summary?: ReactNode;
  // Optional filters card rendered below the Jump-to nav, mirroring
  // the Competition spoke's right-rail filter slot. Children stack
  // vertically — the page composes per-dimension dropdowns (e.g.
  // topic + platform) so the rail carries one dropdown per row.
  filters?: ReactNode;
}) {
  void subjectId;
  const items: NavItem[] = [
    { id: "trend", label: "Trend", num: "01" },
    { id: "platforms", label: "Platforms", num: "02" },
    { id: "topics", label: "Topics", num: "03" },
    { id: "position", label: "Prominence", num: "04" },
  ];
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
    // The items array is module-local and stable across renders, so
    // skipping it from deps avoids a re-observation loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const itemClass = (isActive: boolean) =>
    `group relative flex items-center gap-2 pl-2 text-[12px] transition-colors ${
      isActive
        ? "font-semibold text-primary"
        : "text-foreground/70 hover:text-foreground"
    }`;
  const numClass = (isActive: boolean) =>
    `tabular-nums ${
      isActive
        ? "text-primary"
        : "text-foreground/40 group-hover:text-foreground/65"
    }`;
  const ActiveBar = () => (
    <span
      className="absolute -left-1 top-0.5 bottom-0.5 w-[2px] rounded-full bg-primary"
      aria-hidden
    />
  );

  return (
    <aside className="hidden xl:block fixed right-6 top-28 z-30 w-[220px] space-y-3 max-h-[calc(100vh-7rem)] overflow-y-auto">
      {summary && (
        <div
          aria-label="Visibility summary"
          className="rounded-lg border border-border/70 bg-card/95 p-3 shadow-sm backdrop-blur"
        >
          {summary}
        </div>
      )}
      <nav
        aria-label="Visibility sections"
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
                  className={itemClass(isActive)}
                >
                  {isActive && <ActiveBar />}
                  <span className={numClass(isActive)}>{i.num}</span>
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
