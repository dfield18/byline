"use client";

import { useState, useTransition } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { regenerateRecommendedActionsAction } from "./actions";

type Action = { label: string; action: string };

export type RecommendedActions = {
  primary: Action;
  secondary: Action[];
  warning?: string | null;
};

export function RecommendedActionsBlock({
  actions,
  subjectId,
}: {
  actions: RecommendedActions;
  subjectId: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onRegenerate() {
    setError(null);
    startTransition(async () => {
      const result = await regenerateRecommendedActionsAction(subjectId);
      if (!result.ok) setError(result.error);
    });
  }

  const { primary, secondary, warning } = actions;

  return (
    <div className="mt-6">
      {/* Header row: Recommended Actions eyebrow + Regenerate button.
          Button uses a soft inline style so it doesn't compete with
          the primary recommendation card immediately below. */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/55">
          Recommended Actions
        </div>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={pending}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground/60 hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Re-run the LLM to generate a fresh set of recommendations for this snapshot"
        >
          <RefreshCw
            className={`h-3 w-3 ${pending ? "animate-spin" : ""}`}
            aria-hidden
          />
          {pending ? "Regenerating…" : "Regenerate"}
        </button>
      </div>

      {/* Warning banner — surfaces when the fallback fired (LLM
          unavailable or response failed validation). Subtle so it
          doesn't dominate the brief, but visible enough that the user
          knows the recommendations below are generic guidance. */}
      {warning && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-[12px] text-warning">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
          <span>{warning}</span>
        </div>
      )}

      {/* Primary recommendation — same prominent slot as the prior
          Recommended Focus card. Label as eyebrow, action as the
          body sentence. */}
      <div className="rounded-md overflow-hidden border border-border/40">
        <div className="relative pl-5 pr-4 py-3.5 bg-card">
          <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-foreground/40" />
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/55 mb-1.5">
            {primary.label}
          </div>
          <p className="text-[14.5px] leading-relaxed text-foreground/90">
            {primary.action}
          </p>
        </div>
      </div>

      {/* Secondary recommendations — 2-column compact grid below the
          primary, styled like Strategic Takeaways insight cards but
          smaller. Same border + bg treatment, lighter visual weight. */}
      {secondary.length > 0 && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {secondary.map((s, i) => (
            <div
              key={`${s.label}-${i}`}
              className="rounded-md border border-border/60 bg-muted/30 p-3"
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-foreground/55 mb-1">
                {s.label}
              </div>
              <p className="text-[13px] leading-relaxed text-foreground/85">
                {s.action}
              </p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-2 text-[11px] text-destructive">
          Regenerate failed: {error}
        </p>
      )}
    </div>
  );
}
