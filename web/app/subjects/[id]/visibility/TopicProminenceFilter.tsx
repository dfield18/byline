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

export function TopicProminenceFilter({
  topics,
}: {
  topics: { label: string }[];
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
