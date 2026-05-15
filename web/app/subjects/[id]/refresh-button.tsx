"use client";

import { useEffect, useState } from "react";
import { triggerRefreshAction, revalidateSubjectPage } from "./actions";
import type { Job, JobStatus } from "@/lib/api";

const TERMINAL: JobStatus[] = ["succeeded", "failed"];

export function RefreshButton({ subjectId }: { subjectId: number }) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = job !== null && !TERMINAL.includes(job.status);

  async function onClick() {
    setError(null);
    try {
      const newJob = await triggerRefreshAction(subjectId);
      setJob(newJob);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    if (!job || TERMINAL.includes(job.status)) return;
    const tick = async () => {
      try {
        const res = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
        if (!res.ok) {
          setError(`poll error: HTTP ${res.status}`);
          return;
        }
        const next: Job = await res.json();
        setJob(next);
        if (next.status === "succeeded") {
          await revalidateSubjectPage(subjectId);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    const handle = window.setInterval(tick, 2000);
    return () => window.clearInterval(handle);
  }, [job, subjectId]);

  let label = "Take snapshot";
  if (job?.status === "queued") label = "Queued…";
  else if (job?.status === "running") label = "Running…";
  else if (job?.status === "succeeded") label = "Done";
  else if (job?.status === "failed") label = "Failed — retry";

  // Stay inline with the rest of the Header chrome so the row height
  // doesn't break. Job ID and any error surface via the button's title
  // attribute instead of stacking visible text below the button.
  const tooltipParts: string[] = [];
  if (job) {
    tooltipParts.push(
      `job #${job.id}${job.refresh_run_id ? ` → snapshot ${job.refresh_run_id}` : ""}`,
    );
  }
  if (error) tooltipParts.push(error);
  if (job?.status === "failed" && job.error) tooltipParts.push(job.error);
  const tooltip = tooltipParts.join(" · ") || undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={inFlight}
      title={tooltip}
      className="flex items-center gap-1.5 rounded-md border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {inFlight && (
        <span
          aria-hidden
          className="h-2 w-2 rounded-full bg-primary-foreground/80 animate-pulse"
        />
      )}
      {label}
    </button>
  );
}
