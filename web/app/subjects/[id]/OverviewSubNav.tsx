"use client";

/**
 * Horizontal sticky sub-nav for the Overview spoke. Pins directly
 * below the page Header (which is `sticky top-0 z-20 h-16`) and
 * stays visible as the user scrolls through the five bands. Replaces
 * the prior right-rail OverviewSectionNav, which lived in a separate
 * grid column and forced every band to render at ~80% width with
 * empty gutter to its right.
 *
 * Active-section highlighting is driven by IntersectionObserver
 * watching the band `<section>` ids. Anchored navigation works with
 * JS disabled — the links are real `href="#vitals"` anchors and the
 * matching sections carry `scroll-margin-top` equal to (header
 * height + sub-nav height) so anchored sections don't hide under
 * the pinned bars.
 */
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

type Item = { id: string; label: string; num: string };

export function OverviewSubNav({
  items,
  right,
}: {
  items: Item[];
  // Optional right-aligned slot on the same row as the nav links.
  // Used by the Visibility spoke to host its topic + platform
  // filter dropdowns so the sub-nav carries both navigation and
  // page-scope state in one persistent bar.
  right?: ReactNode;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // Stable content-derived key so the IntersectionObserver only
  // reattaches when the set of observed band ids ACTUALLY changes,
  // not on every parent render that produces a fresh `items` array
  // reference. Without this, the observer was tearing down +
  // rebuilding on every Overview re-render even though the bands
  // hadn't changed — minor perf, but free to fix.
  const itemsKey = items.map((i) => i.id).join("|");

  useEffect(() => {
    const observed: HTMLElement[] = [];
    const observer = new IntersectionObserver(
      (entries) => {
        // Bias toward the topmost section once its top edge crosses
        // just below the pinned header + sub-nav (~110px). The
        // bottom margin is heavily negative so only the section
        // currently dominating the visible viewport "wins" the
        // active state — same intent as the prior right-rail rail.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        rootMargin: "-115px 0px -55% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );
    // itemsKey carries the same ids as `items`; reading `items`
    // here is correct since it's the snapshot the observer was
    // wired up against. ESLint exhaustive-deps may complain about
    // missing `items` in the dep array — the content-stable key
    // is the intentional dep, and items is referenced for the
    // current snapshot.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  return (
    <nav
      aria-label="Page sections"
      // top-16 matches the Header's h-16 (64px). z-10 puts the sub-nav
      // above band content but below the Header (z-20) so the Header's
      // dropdowns (subject picker, etc.) layer correctly on top.
      className="sticky top-16 z-10 border-b border-border bg-card"
    >
      {/* Inner width capped to match the main content's max-w (1280px)
          so the links align with the bands below, while the outer
          <nav> background + border still span the full viewport.
          Two-column flex row: items list on the left, optional
          right slot anchored right via ml-auto on the same h-11
          row. When `right` is absent (e.g. Overview spoke), the
          list takes the full row. */}
      <div className="max-w-[1280px] mx-auto px-4 md:px-12 flex items-center gap-4 h-11">
        <ul className="flex items-center gap-6 min-w-max overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((i) => {
            const isActive = activeId === i.id;
            return (
              <li key={i.id}>
                <a
                  href={`#${i.id}`}
                  aria-current={isActive ? "true" : undefined}
                  className={`group relative inline-flex items-center gap-1.5 h-11 text-[12.5px] transition-colors ${
                    isActive
                      ? "font-semibold text-primary"
                      : "text-foreground/70 hover:text-foreground"
                  }`}
                >
                  <span
                    className={`tabular-nums text-[11px] ${
                      isActive
                        ? "text-primary"
                        : "text-foreground/40 group-hover:text-foreground/65"
                    }`}
                  >
                    {i.num}
                  </span>
                  <span>{i.label}</span>
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute inset-x-0 -bottom-px h-[2px] bg-primary rounded-full"
                    />
                  )}
                </a>
              </li>
            );
          })}
        </ul>
        {right && (
          <div className="ml-auto shrink-0 flex items-center gap-3">
            {right}
          </div>
        )}
      </div>
    </nav>
  );
}
