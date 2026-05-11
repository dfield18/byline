/**
 * Thin fetch wrapper for the byline FastAPI. Server-side only.
 *
 * In v0 the bearer token is read from `BYLINE_API_TOKEN` (works because
 * the API is in mock-user mode when `BYLINE_AUTH=disabled`). Once Clerk
 * lands, the frontend will pass the user's Clerk JWT through here
 * instead.
 */

const API_URL = process.env.BYLINE_API_URL ?? "http://localhost:8000";
const API_TOKEN = process.env.BYLINE_API_TOKEN ?? "";

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
    },
    // No caching during dev so changes show up immediately.
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `byline API ${path} → HTTP ${res.status}: ${body.slice(0, 200)}`
    );
  }
  return (await res.json()) as T;
}

// ─── types ───────────────────────────────────────────────────────────

export type Subject = {
  id: number;
  name: string;
  category: "person" | "organization" | "issue" | "policy" | "event";
  setup_inputs: Record<string, unknown>;
  n_refreshes: number;
  latest_refresh_id: number | null;
  latest_refresh_at: string | null;
  n_findings: number;
};

export type RefreshSummary = {
  id: number;
  started_at: string;
  completed_at: string | null;
  status: string;
  n_responses: number;
  n_ok: number;
  cost_usd: number | string;
};

export type SubjectDetail = Subject & {
  created_at: string;
  refreshes: RefreshSummary[];
};

export type Slot = {
  layer: "named" | "unnamed";
  position: number;
  dimension: string;
  type: "fixed" | "generated";
};

// ─── endpoint wrappers ───────────────────────────────────────────────

export const listSubjects = () => apiGet<Subject[]>("/api/subjects");

export const getSubject = (id: number) =>
  apiGet<SubjectDetail>(`/api/subjects/${id}`);

export const listSlots = (categorySlug: string) =>
  apiGet<Slot[]>(`/api/categories/${categorySlug}/slots`);

// More wrappers (responses, findings) added when the corresponding pages are built.
