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

  let label = "Trigger refresh";
  if (job?.status === "queued") label = "Queued…";
  else if (job?.status === "running") label = "Running…";
  else if (job?.status === "succeeded") label = "Done";
  else if (job?.status === "failed") label = "Failed — retry";

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={inFlight}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-700 disabled:bg-zinc-400 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {label}
      </button>
      {job && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          job #{job.id}
          {job.refresh_run_id ? ` → refresh ${job.refresh_run_id}` : ""}
        </p>
      )}
      {error && (
        <p className="max-w-md text-right text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {job?.status === "failed" && job.error && (
        <p className="max-w-md text-right text-xs text-red-600 dark:text-red-400">
          {job.error}
        </p>
      )}
    </div>
  );
}
