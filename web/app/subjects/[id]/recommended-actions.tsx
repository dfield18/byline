"use client";

import { useState, useTransition } from "react";
import { RefreshCw, AlertTriangle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { regenerateRecommendedActionsAction } from "./actions";

type Action = { label: string; action: string; why: string };

export type RecommendedActions = {
  primary: Action;
  secondary: Action[];
  warning?: string | null;
};

export function RecommendedActionsBlock({
  actions,
  subjectId,
  variant = "full",
}: {
  actions: RecommendedActions | null | undefined;
  subjectId: number;
  // `full` renders primary + all secondaries (used on the dedicated
  // /recommendations spoke page). `primary-only` renders just the
  // primary card + a "View all recommendations" link to the spoke —
  // used on the Overview tab so the dashboard's executive briefing
  // surfaces the headline action without sprawling into the
  // alternatives.
  variant?: "full" | "primary-only";
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

  // Defensive: backend always returns at least the fallback shape, but
  // if the API contract regresses or a stale deployment serves a null,
  // skip rendering entirely rather than crashing on destructure.
  if (!actions || !actions.primary) return null;

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
          body sentence, why as a subtle italicized line below
          tying the action back to the snapshot data. */}
      <div className="rounded-md overflow-hidden border border-border/40">
        <div className="relative pl-5 pr-4 py-3.5 bg-card">
          <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-foreground/40" />
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/55 mb-1.5">
            {primary.label}
          </div>
          <p className="text-[14.5px] leading-relaxed text-foreground/90">
            {primary.action}
          </p>
          {primary.why && (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-foreground/55 italic">
              {primary.why}
            </p>
          )}
        </div>
      </div>

      {/* Secondary recommendations — full variant only. On the
          Overview tab (primary-only), the secondaries collapse into
          a single "View all recommendations" link to the dedicated
          /recommendations spoke so the briefing stays focused on the
          headline action. Flat bullet list under an "ALSO CONSIDER"
          eyebrow on the spoke: a simple list gives the primary clear
          priority and reads as supplementary options. Label sits
          inline with the action separated by an em-dash; why renders
          below in muted italic. */}
      {variant === "full" && secondary.length > 0 && (
        <div className="mt-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/55 mb-2.5">
            Also consider
          </div>
          <ul className="space-y-3">
            {secondary.map((s, i) => (
              <li key={`${s.label}-${i}`} className="flex gap-2.5">
                <span
                  aria-hidden
                  className="text-foreground/35 shrink-0 leading-relaxed text-[13px] mt-0.5"
                >
                  •
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-relaxed text-foreground/85">
                    <span className="font-semibold text-foreground">
                      {s.label}
                    </span>
                    <span className="text-foreground/40 mx-1.5" aria-hidden>
                      —
                    </span>
                    {s.action}
                  </p>
                  {s.why && (
                    <p className="mt-1 text-[11.5px] leading-relaxed text-foreground/55 italic">
                      {s.why}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Primary-only variant: link to the dedicated spoke page where
          the user can see all recommendations + future history /
          export controls. Rendered when at least one secondary
          exists — no point linking to "more" when there isn't more. */}
      {variant === "primary-only" && secondary.length > 0 && (
        <Link
          href={`/subjects/${subjectId}/recommendations`}
          className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:text-primary/80 transition-colors"
        >
          View all recommendations
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      )}

      {error && (
        <p className="mt-2 text-[11px] text-destructive">
          Regenerate failed: {error}
        </p>
      )}
    </div>
  );
}
