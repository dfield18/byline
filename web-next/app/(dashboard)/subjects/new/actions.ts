"use server";

import { createSubject, type CreateSubjectPayload } from "@/lib/api";

const VALID_CATEGORIES = [
  "person",
  "organization",
  "issue",
  "policy",
  "event",
] as const;

export type CreateSubjectResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

/**
 * Server Action invoked from the client form. Returning a value (rather
 * than wiring this to <form action={…}>) keeps Next.js 16 / React 19
 * happy with the void-action constraint and lets the client surface
 * errors inline. The subject is org-scoped on the backend via the
 * caller's session.
 */
export async function createSubjectAction(payload: {
  name: string;
  category: string;
  setup_inputs: Record<string, unknown>;
}): Promise<CreateSubjectResult> {
  const name = payload.name.trim();
  if (!name) return { ok: false, error: "Name is required" };

  const category = payload.category as CreateSubjectPayload["category"];
  if (!VALID_CATEGORIES.includes(category)) {
    return { ok: false, error: "Pick a category" };
  }

  try {
    const created = await createSubject({
      name,
      category,
      setup_inputs: payload.setup_inputs,
    });
    return { ok: true, id: created.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unknown error creating subject",
    };
  }
}
