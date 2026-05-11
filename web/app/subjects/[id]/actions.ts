"use server";

import { revalidatePath } from "next/cache";
import { triggerRefresh } from "@/lib/api";

export async function triggerRefreshAction(subjectId: number) {
  const job = await triggerRefresh(subjectId);
  // Don't revalidate yet — the job is just queued, no new refresh row to
  // show. The client polls the job and revalidates when it finishes.
  return job;
}

export async function revalidateSubjectPage(subjectId: number) {
  revalidatePath(`/subjects/${subjectId}`);
}
