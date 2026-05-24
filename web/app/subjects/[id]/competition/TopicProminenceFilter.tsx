"use client";

/**
 * Topic scope selector for the Prominence table. Pushes the chosen
 * topic into the URL as `?prominence_topic=<label>` so the page
 * stays server-rendered and the selection is bookmarkable. Empty
 * value (default) means "All topics" — the table aggregates across
 * everything, matching the prior behavior.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

// Display label only — keeps the option `value` (and therefore the
// URL param) as the raw backend label so the page-side
// `topic_label === prominenceTopic` match still works.
function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function TopicProminenceFilter({
  topics,
  inline = false,
}: {
  topics: { label: string }[];
  // inline=true renders label + select on one horizontal row
  // (used by OverviewSubNav's right slot). Default vertical stack
  // is for the prior right-rail placement.
  inline?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const value = searchParams.get("prominence_topic") ?? "";

  const setValue = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set("prominence_topic", next);
      else params.delete("prominence_topic");
      const qs = params.toString();
      // `scroll: false` so changing the topic doesn't yank the
      // user back to the top of the page.
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  if (topics.length === 0) return null;

  const wrapperClass = inline
    ? "flex items-center gap-1.5 text-[12px]"
    : "flex flex-col gap-1 text-[12px]";
  const selectClass = inline
    ? "max-w-[180px] truncate rounded-md border border-border/70 bg-card px-2 py-1 text-[12px] text-foreground"
    : "w-full truncate rounded-md border border-border/70 bg-card px-2 py-1 text-[12px] text-foreground";

  return (
    <label className={wrapperClass}>
      <span className="text-foreground/60">Topic</span>
      <select
        className={selectClass}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      >
        <option value="">All topics</option>
        {topics.map((t) => {
          const display = capitalizeFirst(t.label);
          return (
            <option key={t.label} value={t.label}>
              {display.length > 50 ? display.slice(0, 50) + "…" : display}
            </option>
          );
        })}
      </select>
    </label>
  );
}
