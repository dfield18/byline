"use client";

import { useTransition } from "react";
import { regenerateRecommendedAction } from "../actions";

/**
 * Drops the cached LLM recommendations and revalidates. useTransition
 * keeps the button in its pending state through the server action AND
 * the route revalidation (which re-computes the recommendations on the
 * next overview fetch), so "Regenerating…" stays up until fresh actions
 * are on screen.
 */
export function RegenerateButton({ subjectId }: { subjectId: number }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="dash-btn dash-btn-ghost"
      disabled={pending}
      onClick={() =>
        startTransition(() => regenerateRecommendedAction(subjectId))
      }
    >
      {pending ? "Regenerating…" : "Regenerate"}
    </button>
  );
}
