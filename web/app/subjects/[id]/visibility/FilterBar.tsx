"use client";

/**
 * Compare-to selector at the top of the Visibility hub. Previously
 * also held Platform and Topic filters that scoped the Prompt-Level
 * Evidence table; that section was removed at request and the
 * filters had nothing left to scope, so this bar is now just the
 * Compare-to dropdown. URL-state (?compare=Name) drives the page's
 * inline Compare card — keeps the page bookmarkable and rendered
 * server-side.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export function FilterBar({
  competitors,
}: {
  competitors: { name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const compareValue = searchParams.get("compare") ?? "";

  // router.replace (not push) so the back button doesn't fill up with
  // every dropdown change. `scroll: false` keeps the current scroll
  // position instead of jumping to the top.
  const setCompare = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set("compare", value);
      else next.delete("compare");
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  if (competitors.length === 0) return null;

  // Non-sticky: the bar only carries one Compare-to dropdown now,
  // so the cost of keeping it pinned (overlapping the page Header
  // at top-0 and obscuring scrolled content) outweighs the benefit.
  return (
    <div className="-mx-4 -mt-6 mb-2 border-b border-border/60 bg-background/95 px-4 py-3 md:-mx-12 md:px-12">
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/55">
          Scope
        </span>

        <label className="inline-flex items-center gap-1.5">
          <span className="text-foreground/60">Compare to</span>
          <select
            className="rounded-md border border-border/70 bg-card px-2 py-1 text-[12.5px] text-foreground"
            value={compareValue}
            onChange={(e) => setCompare(e.target.value)}
          >
            <option value="">— none —</option>
            {competitors.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        {compareValue && (
          <button
            type="button"
            onClick={() => router.replace("?", { scroll: false })}
            className="ml-auto rounded-md border border-border/70 px-2.5 py-1 text-[11.5px] font-medium text-foreground/70 transition-colors hover:bg-card"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
