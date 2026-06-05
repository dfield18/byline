"use server";

import { revalidatePath, updateTag } from "next/cache";
import {
  triggerRefresh,
  regenerateRecommendedActions,
  subjectOverviewTag,
  type Job,
} from "@/lib/api";

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
  // Bust the 1-week overview cache so the new snapshot is reflected on both the
  // Overview brief and the Overview Dashboard, then revalidate the routes.
  updateTag(subjectOverviewTag(subjectId));
  revalidatePath(`/subjects/${subjectId}`);
  revalidatePath(`/subjects/${subjectId}/dashboard`);
}

/**
 * Drop the cached LLM recommendations for the subject's latest snapshot,
 * then revalidate so the next render re-computes them. Costs one LLM
 * call on the subsequent overview fetch. Revalidates both the Overview
 * (which shows the primary recommended action) and the Recommendations
 * spoke.
 */
export async function regenerateRecommendedAction(
  subjectId: number,
): Promise<void> {
  await regenerateRecommendedActions(subjectId);
  updateTag(subjectOverviewTag(subjectId));
  revalidatePath(`/subjects/${subjectId}`);
  revalidatePath(`/subjects/${subjectId}/dashboard`);
  revalidatePath(`/subjects/${subjectId}/recommendations`);
}
