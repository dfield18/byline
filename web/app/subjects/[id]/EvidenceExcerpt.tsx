"use client";

/**
 * Click-to-expand excerpt for the Evidence cards on the Overview
 * spoke. The stored excerpt always renders line-clamped at ~4 lines;
 * the only expansion action is "Show full AI response", which
 * lazy-fetches the actual full per-platform response text for this
 * card's prompt + model_slug and renders it inline. The prior
 * "Show more" toggle on the clamped excerpt was removed — the
 * stored excerpt is often truncated mid-sentence by the cross-
 * analyzer extractor, so the full AI response is what readers
 * actually want when they expand.
 *
 * Fetch hits the same-origin proxy at
 * /api/subjects/{subjectId}/prompts/{promptId}/responses, which
 * forwards to the FastAPI through the user's session cookie.
 * Page stays server-rendered; only this interactive island is
 * client-side.
 */
import { useState } from "react";
import type { PromptResponse } from "@/lib/api";

export function EvidenceExcerpt({
  excerpt,
  rationale,
  subjectId,
  promptId,
  modelSlug,
}: {
  excerpt: string;
  rationale?: string | null;
  subjectId: number;
  promptId: number;
  modelSlug: string;
}) {
  const [fullResponse, setFullResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadFullResponse() {
    if (fullResponse !== null || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/subjects/${subjectId}/prompts/${promptId}/responses`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        setError(
          res.status === 404
            ? "Full response not available for this prompt."
            : `Couldn't load response (status ${res.status}).`,
        );
        return;
      }
      const data = (await res.json()) as { responses: PromptResponse[] };
      // Pick the response from the same platform as this card. Match
      // on platform_slug; fall back to model name only if slug doesn't
      // match (defensive — should always match).
      const match =
        data.responses.find((r) => r.platform_slug === modelSlug) ||
        data.responses.find(
          (r) => r.platform_name.toLowerCase() === modelSlug.toLowerCase(),
        );
      if (!match) {
        setError("No response from this platform was stored.");
        return;
      }
      setFullResponse(match.response_text || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p
        className="line-clamp-4 text-sm leading-relaxed text-foreground/80"
        title={rationale || undefined}
      >
        {excerpt}
      </p>

      <div className="mt-2">
        <button
          type="button"
          onClick={() => {
            if (fullResponse === null) loadFullResponse();
            else setFullResponse(null);
          }}
          className="text-[12px] font-medium text-primary hover:text-primary/80 transition-colors"
          disabled={loading}
        >
          {loading
            ? "Loading…"
            : fullResponse !== null
              ? "Hide full AI response"
              : "Show full AI response"}
        </button>
      </div>

      {error && (
        <div className="mt-2 text-[12px] text-warning leading-relaxed">
          {error}
        </div>
      )}
      {fullResponse !== null && !error && (
        <div className="mt-2 rounded-md bg-muted/40 px-3 py-2.5 max-h-[260px] overflow-y-auto">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1.5">
            Full AI response
          </div>
          <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-foreground/80">
            {fullResponse || "(empty response)"}
          </p>
        </div>
      )}
    </div>
  );
}
