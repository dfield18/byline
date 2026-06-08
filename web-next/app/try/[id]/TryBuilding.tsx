"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Building state for a try-subject whose refresh is still running. Polls the
 * public status endpoint; when the job succeeds it calls router.refresh() so
 * the server component re-fetches and swaps in the real Overview brief. On
 * failure it shows an inline message + retry.
 *
 * A full refresh runs all active models + the analysis/cross-analysis chain,
 * so this typically takes 1–3 minutes — hence the ticking elapsed counter and
 * staged checklist so it never reads as frozen.
 */

const STEPS = [
  { at: 0, label: "Querying the major AI assistants" },
  { at: 25, label: "Scoring sentiment, mentions, and risk framing" },
  { at: 55, label: "Clustering narratives and ranking sources" },
  { at: 80, label: "Assembling your brief" },
];

export function TryBuilding({
  subjectId,
  subjectName,
}: {
  subjectId: number;
  subjectName: string;
}) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const t0 = Date.now();
    // Hard cutoff so a stuck/queued job (e.g. worker down) can't spin forever.
    const MAX_SECONDS = 360;
    const stop = (cleanup: () => void) => {
      alive = false;
      cleanup();
    };
    const tick = window.setInterval(() => {
      if (!alive) return;
      const e = Math.floor((Date.now() - t0) / 1000);
      setElapsed(e);
      if (e >= MAX_SECONDS) {
        setFailed(
          "This is taking longer than expected. The brief may still be building — refresh in a minute, or try another topic.",
        );
        window.clearInterval(tick);
        window.clearInterval(poll);
        alive = false;
      }
    }, 1000);
    const poll = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/try/${subjectId}/status`, { cache: "no-store" });
        const j = await res.json();
        if (!alive) return;
        // Any terminal status → stop polling and let the server component
        // re-render (it shows the brief if data landed, or a failure state).
        // Stopping first prevents a refresh loop if the run came back partial.
        if (j.status === "succeeded" || j.status === "failed" || j.status === "none") {
          stop(() => {
            window.clearInterval(tick);
            window.clearInterval(poll);
          });
          router.refresh();
        }
      } catch {
        /* transient — keep polling */
      }
    }, 4000);
    return () => {
      alive = false;
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, [subjectId, router]);

  if (failed) {
    return (
      <div className="try-state">
        <div className="eyebrow">Live demo</div>
        <h1>{subjectName}</h1>
        <p className="try-failed">{failed}</p>
        <Link href="/" className="dash-btn dash-btn-accent">
          ← Try another topic
        </Link>
      </div>
    );
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(1, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="try-state">
      <div className="eyebrow">Building your live narrative brief</div>
      <h1>{subjectName}</h1>
      <p className="try-sub">
        Running a full snapshot across the major AI assistants — sentiment,
        narrative clusters, competitive standing, and the sources they cite.
        This usually takes 1–3 minutes.
      </p>

      <div className="try-steps">
        {STEPS.map((s, i) => {
          const next = STEPS[i + 1];
          const done = next ? elapsed >= next.at : false;
          const active = elapsed >= s.at && !done;
          return (
            <div
              key={s.label}
              className={`try-step${done ? " done" : active ? " active" : ""}`}
            >
              <span className="try-step-dot" aria-hidden />
              {s.label}
            </div>
          );
        })}
      </div>

      <div className="try-elapsed">
        <span className="lc-dots" aria-hidden>
          <i></i>
          <i></i>
          <i></i>
        </span>
        Analyzing — {mm}:{ss}
      </div>
    </div>
  );
}
