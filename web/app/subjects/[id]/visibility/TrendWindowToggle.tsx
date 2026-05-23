"use client";

/**
 * Segmented control for the Visibility Trend chart's time window.
 * URL-state pattern matches the other scope filters on this page —
 * pushes `?trend_window=` so the chosen window survives copy-paste,
 * back/forward, and refresh.
 *
 * Values: "4w" | "8w" | "12w" | "all"
 * Default (empty / missing) resolves to "12w" on the server.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const OPTIONS = [
  { value: "4w", label: "4w" },
  { value: "8w", label: "8w" },
  { value: "12w", label: "12w" },
  { value: "all", label: "All" },
] as const;

export function TrendWindowToggle() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Empty param defaults to 12w (the server resolves it the same way).
  const value = searchParams.get("trend_window") || "12w";

  const setValue = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      // 12w is the default — drop the param when picked so the URL
      // stays clean and link-sharing doesn't carry a redundant value.
      if (!next || next === "12w") params.delete("trend_window");
      else params.set("trend_window", next);
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <div
      role="group"
      aria-label="Trend window"
      className="inline-flex items-center rounded-md border border-border/70 bg-card p-0.5 text-[12px]"
    >
      {OPTIONS.map((o) => {
        const isActive = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => setValue(o.value)}
            aria-pressed={isActive}
            className={`rounded px-2.5 py-1 transition-colors ${
              isActive
                ? "bg-primary/10 font-semibold text-primary"
                : "text-foreground/70 hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
