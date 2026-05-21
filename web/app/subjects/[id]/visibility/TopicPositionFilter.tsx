"use client";

/**
 * Topic-scope selector for the Answer Position section. Same URL-
 * state pattern as TopicProminenceFilter, but pushes a different
 * search param (`position_topic`) so the two dropdowns are
 * independent — a reader can filter Prominence to one topic and
 * Position to a different one without them stepping on each other.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export function TopicPositionFilter({
  topics,
}: {
  topics: { label: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const value = searchParams.get("position_topic") ?? "";

  const setValue = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set("position_topic", next);
      else params.delete("position_topic");
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  if (topics.length === 0) return null;

  return (
    <label className="inline-flex items-center gap-1.5 text-[12px]">
      <span className="text-foreground/60">Scope to topic</span>
      <select
        className="max-w-[240px] truncate rounded-md border border-border/70 bg-card px-2 py-1 text-[12px] text-foreground"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      >
        <option value="">All topics</option>
        {topics.map((t) => (
          <option key={t.label} value={t.label}>
            {t.label.length > 50 ? t.label.slice(0, 50) + "…" : t.label}
          </option>
        ))}
      </select>
    </label>
  );
}
