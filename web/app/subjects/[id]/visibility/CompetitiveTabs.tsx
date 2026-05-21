"use client";

/**
 * Tab strip for the Competitive Visibility section. Folds the
 * Co-Mentions and Platform Ownership views into the same section so
 * the page reads as one competitive analysis stop instead of three
 * stacked sections. URL-state-driven (?competitive_tab=…) so the
 * page stays server-rendered and the tab selection is bookmarkable.
 *
 * Topic Battleground is intentionally NOT a tab here — it sits as
 * its own section by request.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export type CompetitiveTab = "overview" | "co-mentions" | "ownership";

const TABS: { id: CompetitiveTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "co-mentions", label: "Co-Mentions" },
  { id: "ownership", label: "Platform Ownership" },
];

export function CompetitiveTabs({
  active,
}: {
  active: CompetitiveTab;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setTab = useCallback(
    (next: CompetitiveTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "overview") params.delete("competitive_tab");
      else params.set("competitive_tab", next);
      const qs = params.toString();
      // scroll: false so switching tabs doesn't yank the page back
      // to the top.
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <div
      role="tablist"
      aria-label="Competitive views"
      className="inline-flex rounded-full border border-border/80 bg-muted/40 p-1"
    >
      {TABS.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${
              isActive
                ? "bg-background text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
