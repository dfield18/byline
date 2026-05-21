"use client";

/**
 * Sticky filter bar at the top of the Visibility hub. Holds Platform
 * + Topic + Compare-to selectors that scope the page via URL search
 * params; selecting an option pushes a new URL and the page re-
 * renders server-side with the filter applied.
 *
 * URL-state (rather than local React state) keeps the hub
 * bookmarkable, shareable, and lets the server do the actual
 * filtering inside its existing rendering — no client refactor of
 * the whole 1200-line page needed.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export function FilterBar({
  platforms,
  topics,
  competitors,
}: {
  platforms: { slug: string; name: string }[];
  topics: { label: string }[];
  competitors: { name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const platformValue = searchParams.get("platform") ?? "";
  const topicValue = searchParams.get("topic") ?? "";
  const compareValue = searchParams.get("compare") ?? "";

  // Push a single param change while preserving the others. Using
  // router.replace (not push) so filter changes don't pile up in
  // browser history — the user shouldn't have to hit Back 12 times
  // to escape a filter session.
  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "?");
    },
    [router, searchParams],
  );

  const hasAnyFilter =
    Boolean(platformValue) || Boolean(topicValue) || Boolean(compareValue);

  return (
    <div className="sticky top-0 z-30 -mx-4 -mt-6 mb-2 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur md:-mx-12 md:px-12">
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/55">
          Scope
        </span>

        <label className="inline-flex items-center gap-1.5">
          <span className="text-foreground/60">Platform</span>
          <select
            className="rounded-md border border-border/70 bg-card px-2 py-1 text-[12.5px] text-foreground"
            value={platformValue}
            onChange={(e) => setParam("platform", e.target.value)}
          >
            <option value="">All</option>
            {platforms.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="inline-flex items-center gap-1.5">
          <span className="text-foreground/60">Topic</span>
          <select
            className="max-w-[260px] truncate rounded-md border border-border/70 bg-card px-2 py-1 text-[12.5px] text-foreground"
            value={topicValue}
            onChange={(e) => setParam("topic", e.target.value)}
          >
            <option value="">All</option>
            {topics.map((t) => (
              <option key={t.label} value={t.label}>
                {t.label.length > 50
                  ? t.label.slice(0, 50) + "…"
                  : t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="inline-flex items-center gap-1.5">
          <span className="text-foreground/60">Compare to</span>
          <select
            className="rounded-md border border-border/70 bg-card px-2 py-1 text-[12.5px] text-foreground"
            value={compareValue}
            onChange={(e) => setParam("compare", e.target.value)}
          >
            <option value="">— none —</option>
            {competitors.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        {hasAnyFilter && (
          <button
            type="button"
            onClick={() => router.replace("?")}
            className="ml-auto rounded-md border border-border/70 px-2.5 py-1 text-[11.5px] font-medium text-foreground/70 transition-colors hover:bg-card"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
