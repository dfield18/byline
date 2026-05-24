"use client";

/**
 * Platform-scope selector for the Competition spoke's Landscape
 * section. Pushes `?landscape_platform=` so it stays independent of
 * the topic scope (`?prominence_topic=`) — the two can be set
 * together to scope all three sub-cards (SoV bars, Scatter, and
 * Competitive Prominence table) to a (platform, topic) intersection.
 *
 * `value` is the platform slug (e.g. "chatgpt"); the page-side
 * lookup matches against `per_platform_landscape.platforms[].slug`.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export function LandscapePlatformFilter({
  platforms,
  inline = false,
}: {
  platforms: { slug: string; name: string }[];
  // inline=true renders label + select on one horizontal row
  // (used by OverviewSubNav's right slot). Default vertical stack
  // is for the prior right-rail placement.
  inline?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const value = searchParams.get("landscape_platform") ?? "";

  const setValue = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set("landscape_platform", next);
      else params.delete("landscape_platform");
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
    ? "max-w-[180px] truncate rounded-md border border-border/70 bg-card px-2 py-1 text-[12px] text-foreground"
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
