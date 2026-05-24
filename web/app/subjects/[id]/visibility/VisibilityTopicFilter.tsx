"use client";

/**
 * Page-level topic-scope selector for the Visibility spoke. Pushes
 * `?topic=<label>` so every section that supports topic-scoping
 * re-renders against the chosen topic. Mirrors the Competition
 * spoke's TopicProminenceFilter pattern but uses the broader
 * `topic` URL param because the filter is global, not section-
 * scoped — the four section-level topic filters that used to live
 * inline in their section headers were retired in favor of this.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function VisibilityTopicFilter({
  topics,
  inline = false,
}: {
  topics: { label: string }[];
  // inline=true renders label + select on one horizontal row
  // (used by the sub-nav right slot). Default vertical stack
  // is for the prior right-rail / inline-row placements.
  inline?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const value = searchParams.get("topic") ?? "";

  const setValue = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set("topic", next);
      else params.delete("topic");
      const qs = params.toString();
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
