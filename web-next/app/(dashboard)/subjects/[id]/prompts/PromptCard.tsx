"use client";

import { useState } from "react";
import type { PromptResponse } from "@/lib/api";

type PlatformResult = {
  slug: string;
  name: string;
  present: boolean;
  mentioned: boolean | null;
  rank: number | null;
};

// Per-platform status chip in the prompt header: mentioned (#rank),
// ran-but-missed (✕), or not-run (·) — same vocabulary as the
// Visibility coverage grid.
function StatusChip({ r }: { r: PlatformResult }) {
  if (r.present && r.mentioned) {
    return (
      <span className="pstat yes" title={r.rank ? `Rank ${r.rank}` : "Mentioned"}>
        {r.name} {r.rank ? `#${r.rank}` : "✓"}
      </span>
    );
  }
  if (r.present && !r.mentioned) {
    return (
      <span className="pstat miss" title="Ran, not mentioned">
        {r.name} ✕
      </span>
    );
  }
  return (
    <span className="pstat absent" title="Not run">
      {r.name} ·
    </span>
  );
}

function RespBadge({ r }: { r: PromptResponse }) {
  if (!r.success) return <span className="pstat absent">No response</span>;
  if (r.mentioned) {
    return (
      <span className="pstat yes">
        Mentioned{r.rank ? ` #${r.rank}` : ""}
      </span>
    );
  }
  return <span className="pstat miss">Not mentioned</span>;
}

export function PromptCard({
  subjectId,
  promptId,
  rendered,
  topicLabel,
  platformResults,
}: {
  subjectId: number;
  promptId: number;
  rendered: string;
  topicLabel: string | null;
  platformResults: PlatformResult[];
}) {
  const [open, setOpen] = useState(false);
  const [responses, setResponses] = useState<PromptResponse[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    // Lazy-fetch once, on first expand.
    if (next && responses === null && !loading) {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/subjects/${subjectId}/prompts/${promptId}/responses`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { responses?: PromptResponse[] } = await res.json();
        setResponses(data.responses ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="prompt-card">
      <div className="prompt-head">
        <div className="prompt-body">
          <div className="prompt-text">{rendered}</div>
          {topicLabel && <div className="prompt-topic">{topicLabel}</div>}
        </div>
        <div className="prompt-status">
          {platformResults.map((r) => (
            <StatusChip key={r.slug} r={r} />
          ))}
        </div>
      </div>

      <button
        type="button"
        className="prompt-toggle"
        onClick={toggle}
        aria-expanded={open}
      >
        {open ? "Hide responses" : "Show responses"}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="prompt-responses">
          {loading && <div className="prompt-meta">Loading responses…</div>}
          {error && <div className="prompt-meta err">{error}</div>}
          {responses?.length === 0 && (
            <div className="prompt-meta">No responses recorded for this prompt.</div>
          )}
          {responses?.map((r) => (
            <div key={r.platform_slug}>
              <div className="resp-head">
                <span className="resp-plat">{r.platform_name}</span>
                <RespBadge r={r} />
              </div>
              <p className="resp-text">{r.response_text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
