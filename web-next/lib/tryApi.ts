/**
 * Server-side fetch helpers for the PUBLIC "try it" flow.
 *
 * Unlike lib/api.ts, these attach NO auth — they hit the backend's public
 * /api/try endpoints, which are scoped to the throwaway public-demo org.
 * Server-only (imported by the /try/[id] server component).
 */
import type { SubjectOverview } from "@/lib/api";

const API_URL = process.env.BYLINE_API_URL ?? "http://localhost:8000";

export async function getTryOverview(id: number): Promise<SubjectOverview | null> {
  const res = await fetch(`${API_URL}/api/try/${id}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`try overview ${id} → HTTP ${res.status}`);
  }
  return (await res.json()) as SubjectOverview;
}

export type TryStatus = {
  status: string; // queued | running | succeeded | failed | none | unknown
  job_id: number | null;
  error: string | null;
};

export async function getTryStatus(id: number): Promise<TryStatus | null> {
  const res = await fetch(`${API_URL}/api/try/${id}/status`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) return { status: "unknown", job_id: null, error: null };
  return (await res.json()) as TryStatus;
}
