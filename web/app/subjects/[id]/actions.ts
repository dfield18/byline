"use server";

import { revalidatePath } from "next/cache";
import { regenerateRecommendedActions, triggerRefresh } from "@/lib/api";

export async function triggerRefreshAction(subjectId: number) {
  const job = await triggerRefresh(subjectId);
  // Don't revalidate yet — the job is just queued, no new refresh row to
  // show. The client polls the job and revalidates when it finishes.
  return job;
}

export async function revalidateSubjectPage(subjectId: number) {
  revalidatePath(`/subjects/${subjectId}`);
}

// Drops the cached recommendations and revalidates the page so the
// next render re-calls the LLM. Returns a discriminated result so the
// client component can surface errors inline rather than throwing.
export async function regenerateRecommendedActionsAction(
  subjectId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await regenerateRecommendedActions(subjectId);
    revalidatePath(`/subjects/${subjectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
