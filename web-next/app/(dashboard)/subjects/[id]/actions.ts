"use server";

import { revalidatePath } from "next/cache";
import { triggerRefresh, type Job } from "@/lib/api";

/**
 * Enqueue a refresh job for the subject. Returns the created Job so the
 * client can start polling GET /api/jobs/{id}. Org scoping + auth happen
 * on the backend via the caller's session (lib/api.ts attaches the JWT).
 */
export async function triggerRefreshAction(subjectId: number): Promise<Job> {
  return triggerRefresh(subjectId);
}

/**
 * Revalidate the subject Overview after a refresh succeeds so the server
 * component re-fetches and the new snapshot's brief replaces the prior
 * render (and the first-run state flips to the full brief on the first
 * successful refresh).
 */
export async function revalidateSubjectPage(subjectId: number): Promise<void> {
  revalidatePath(`/subjects/${subjectId}`);
}
