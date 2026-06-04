"use server";

import { previewPrompt, type PromptPreviewResult } from "@/lib/api";

export type PreviewActionResult =
  | { ok: true; data: PromptPreviewResult }
  | { ok: false; error: string };

/**
 * Runs a prompt against the selected models for `subject` and returns the
 * per-model results. Read-only — the backend persists nothing. Errors (auth,
 * network, validation) are returned for inline display rather than thrown.
 */
export async function previewPromptAction(
  text: string,
  models: string[],
  subject: string,
): Promise<PreviewActionResult> {
  const t = text.trim();
  if (t.length < 10) {
    return { ok: false, error: "Prompt must be at least 10 characters." };
  }
  if (models.length === 0) {
    return { ok: false, error: "Pick at least one model." };
  }
  try {
    const data = await previewPrompt(t, models, subject);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
