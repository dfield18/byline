/**
 * Thin fetch wrapper for the byline FastAPI. Server-side only.
 *
 * Every request forwards the caller's Clerk session JWT to the backend.
 * The backend (`app/api/auth.py`) validates that JWT against Clerk's
 * JWKS and uses `org_id` from the claims to scope all queries.
 *
 * If `BYLINE_API_TOKEN` is set, it overrides the Clerk path — used when
 * the backend runs with `BYLINE_AUTH=disabled` and accepts any bearer.
 */
import { auth } from "@clerk/nextjs/server";

const API_URL = process.env.BYLINE_API_URL ?? "http://localhost:8000";
const DEV_TOKEN_OVERRIDE = process.env.BYLINE_API_TOKEN ?? "";

async function bearerToken(): Promise<string> {
  if (DEV_TOKEN_OVERRIDE) return DEV_TOKEN_OVERRIDE;
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) {
    throw new Error(
      "No Clerk session token available — user is not signed in"
    );
  }
  return token;
}

async function apiGet<T>(path: string): Promise<T> {
  const token = await bearerToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
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

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const token = await bearerToken();
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `byline API POST ${path} → HTTP ${res.status}: ${text.slice(0, 300)}`
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

export type SetupInput = {
  key: string;
  label: string;
  description: string | null;
  required: boolean;
  example: string | null;
  type: "string" | "boolean" | string;
};

export type SetupInputsSchema = {
  category: string;
  setup_inputs: SetupInput[];
};

export const getSetupInputsSchema = (categorySlug: string) =>
  apiGet<SetupInputsSchema>(`/api/categories/${categorySlug}/setup-inputs`);

// Write paths

export type CreateSubjectPayload = {
  name: string;
  category: Subject["category"];
  setup_inputs: Record<string, unknown>;
};

export type CreatedSubject = {
  id: number;
  name: string;
  category: Subject["category"];
  setup_inputs: Record<string, unknown>;
  created_at: string;
  org_id: string;
};

export const createSubject = (payload: CreateSubjectPayload) =>
  apiPost<CreatedSubject>("/api/subjects", payload);

// Jobs

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export type Job = {
  id: number;
  subject_id: number;
  org_id: string;
  kind: "refresh";
  status: JobStatus;
  enqueued_at: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  refresh_run_id: number | null;
  result: Record<string, unknown> | null;
};

export const triggerRefresh = (subjectId: number) =>
  apiPost<Job>(`/api/subjects/${subjectId}/refresh`, {});

export const getJob = (jobId: number) => apiGet<Job>(`/api/jobs/${jobId}`);

// Dashboard overview (Phase 1 wiring)

export type KpiValue = {
  value: number | null;
  delta: number | null;
  trend: "up" | "down" | "flat";
};

export type PlatformRecall = KpiValue & {
  name: string;
  n_responses: number;
  lowest?: boolean;
};

export type SubjectOverview = {
  subject_id: number;
  subject_name: string;
  category: string;
  kpis: {
    ai_recall: KpiValue;
    avg_sentiment: KpiValue;
    risk_frame_rate: KpiValue;
    citation_rate: KpiValue;
  };
  platform_recall: PlatformRecall[];
  trajectory: {
    weeks: string[];
    refresh_ids: number[];
    is_historical: boolean[];
    ai_recall: (number | null)[];
    avg_sentiment: (number | null)[];
    risk_frame_rate: (number | null)[];
  };
  sources: { name: string; score: number; type: string; n_citations: number }[];
  topic_coverage: {
    label: string;
    source_field: string;
    n_responses: number;
    n_unique_slots: number;
    share_of_set: number;
    ai_recall: number | null;
  }[];
  meta: {
    latest_refresh_id: number | null;
    last_refresh_at: string | null;
    n_responses: number;
    n_platforms: number;
    risk_frame_threshold?: number;
    canonical_url?: string;
  };
};

export const getSubjectOverview = (subjectId: number, weeks = 12) =>
  apiGet<SubjectOverview>(
    `/api/subjects/${subjectId}/overview?weeks=${weeks}`,
  );
