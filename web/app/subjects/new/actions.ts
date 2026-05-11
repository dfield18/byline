"use server";

import { redirect } from "next/navigation";
import { createSubject, type CreateSubjectPayload } from "@/lib/api";

/**
 * Server Action that creates a subject via the FastAPI and redirects to
 * its detail page. Field validation is intentionally lightweight here —
 * the API enforces the canonical rules (valid category, unique name in
 * org, required setup_inputs at refresh time).
 */
export async function createSubjectAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "") as
    CreateSubjectPayload["category"];

  if (!name) {
    return { error: "Name is required" };
  }
  const validCategories = ["person", "organization", "issue", "policy", "event"];
  if (!validCategories.includes(category)) {
    return { error: "Pick a category" };
  }

  // Collect setup_inputs from every form field prefixed with si__.
  // Format inputs by category at render time; passing them through
  // unprefixed means the form schema is owned by the form, not by this
  // action.
  const setup_inputs: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("si__")) continue;
    const cleanKey = key.slice("si__".length);
    const stringVal = String(value ?? "").trim();
    if (!stringVal) continue;
    // presidential_candidate_2028 is the one boolean we currently
    // have in person setup_inputs. Coerce.
    if (cleanKey === "presidential_candidate_2028") {
      setup_inputs[cleanKey] = stringVal === "true" || stringVal === "yes";
    } else {
      setup_inputs[cleanKey] = stringVal;
    }
  }

  let created;
  try {
    created = await createSubject({ name, category, setup_inputs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error creating subject";
    return { error: msg };
  }

  redirect(`/subjects/${created.id}`);
}
