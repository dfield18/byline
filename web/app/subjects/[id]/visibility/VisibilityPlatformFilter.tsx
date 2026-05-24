"use client";

/**
 * Page-level platform-scope selector for the Visibility spoke.
 * Pushes `?platform=<slug>` so every section that supports
 * platform-scoping re-renders against the chosen AI platform.
 * Mirrors the Competition spoke's LandscapePlatformFilter pattern
 * but uses the broader `platform` URL param because the filter is
 * global, not section-scoped.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export function VisibilityPlatformFilter({
  platforms,
  inline = false,
}: {
  platforms: { slug: string; name: string }[];
  // inline=true renders label + select on one horizontal row
  // (used by the sub-nav right slot). See VisibilityTopicFilter
  // for the same option.
  inline?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const value = searchParams.get("platform") ?? "";

  const setValue = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set("platform", next);
      else params.delete("platform");
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  if (platforms.length === 0) return null;

  const wrapperClass = inline
    ? "flex items-center gap-1.5 text-[12px]"
    : "flex flex-col gap-1 text-[12px]";
  const selectClass = inline
    ? "max-w-[160px] truncate rounded-md border border-border/70 bg-card px-2 py-1 text-[12px] text-foreground"
    : "w-full truncate rounded-md border border-border/70 bg-card px-2 py-1 text-[12px] text-foreground";

  return (
    <label className={wrapperClass}>
      <span className="text-foreground/60">Platform</span>
      <select
        className={selectClass}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      >
        <option value="">All platforms</option>
        {platforms.map((p) => (
          <option key={p.slug} value={p.slug}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
