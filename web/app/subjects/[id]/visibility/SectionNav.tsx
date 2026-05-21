"use client";

/**
 * Floating section-jump nav for the Visibility hub. Fixed to the
 * right edge of the viewport at xl+ widths only — narrower viewports
 * can't afford the horizontal real estate, so it hides cleanly.
 *
 * Scroll-spy: uses IntersectionObserver to watch each section's
 * boundaries and highlights whichever section currently dominates
 * the viewport. The highlighted entry gets a primary text color +
 * a small left bar so a reader can locate themselves on the page
 * without scrolling back up to confirm.
 */
import { useEffect, useState } from "react";

// Co-Mentions and Platform Ownership are tabs inside the Competitive
// section, not standalone — they don't get their own nav entries.
// Topic Battleground was removed entirely.
const ITEMS = [
  { id: "trend", label: "Trend", num: "01" },
  { id: "platforms", label: "Platforms", num: "02" },
  { id: "topics", label: "Topics", num: "03" },
  { id: "position", label: "Position", num: "04" },
  { id: "competitive", label: "Competitive", num: "05" },
];

export function SectionNav() {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    // Watch each section. `rootMargin: -40% 0 -50% 0` shifts the
    // observer's "active zone" to roughly the upper-middle of the
    // viewport — so a section is considered "active" once its top
    // crosses ~40% from the top of the viewport, and stays active
    // until its bottom passes that line. Avoids the flash-from-
    // section-to-section behavior a strict 0/100 threshold causes.
    const observed: HTMLElement[] = [];
    const observer = new IntersectionObserver(
      (entries) => {
        // Find the entry with the largest intersection ratio that
        // is currently intersecting. Falls through to the highest
        // entry that just became visible if none intersect.
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
    <aside className="hidden xl:block fixed right-6 top-28 z-30">
      <nav
        aria-label="Visibility sections"
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
                  {/* Active-section left bar. Only renders when
                      active; positioned absolute so it doesn't push
                      the text when it appears/disappears. */}
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
    </aside>
  );
}
