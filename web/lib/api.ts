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

// POST that doesn't expect a JSON response body (e.g., 204 No Content).
// On error, extracts FastAPI's `{detail: "..."}` field when present so
// the thrown Error message is human-readable (matters for rate-limit
// 429s and validation errors that surface inline in the UI).
async function apiPostNoContent(path: string, body: unknown = {}): Promise<void> {
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
    let message = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      if (typeof parsed?.detail === "string") {
        message = parsed.detail;
      }
    } catch {
      // Body wasn't JSON; fall through with the raw text.
    }
    throw new Error(message);
  }
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

// Drops the cached LLM recommendations for the subject's latest
// snapshot. The next page render will re-call the LLM. Caller is
// expected to revalidate the subject page after this resolves.
export const regenerateRecommendedActions = (subjectId: number) =>
  apiPostNoContent(`/api/subjects/${subjectId}/recommended-actions/regenerate`);

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
    citation_rate: (number | null)[];
    // Pie-share definition: subject's mentions / (subject + deduped
    // competitor mentions) per refresh. Differs from
    // competitive[].sov (which is subject_mentions / total_responses,
    // i.e. mention rate); this is the "of the entity pie, what slice
    // is me" definition that the Visibility Trend chart uses.
    share_of_voice: (number | null)[];
    // Share of unnamed-layer responses where the subject was
    // mentioned at rank 1 — same methodology as
    // competitive[].first_mention_rate, plotted over time.
    top_result_rate: (number | null)[];
  };
  sources: { name: string; score: number; type: string; n_citations: number }[];
  topic_coverage: {
    label: string;
    source_field: string;
    n_responses: number;
    n_mentioned: number;
    n_unique_slots: number;
    share_of_set: number;
    ai_recall: number | null;
  }[];
  strategic_takeaways: {
    kind: "message_gap" | "opposition_frame" | "strongest_asset";
    tone: "warning" | "muted" | "primary";
    eyebrow: string;
    title: string;
    body: string;
  }[];
  bottom_line: string | null;
  recommended_focus: string | null;
  // Always populated by the backend (even on LLM failure it returns the
  // generic fallback shape), but marked nullable defensively so a
  // deployment skew or API contract regression can't crash the
  // dashboard via a destructure on undefined.
  recommended_actions: {
    primary: { label: string; action: string; why: string };
    secondary: { label: string; action: string; why: string }[];
    warning?: string | null;
  } | null;
  narrative_clusters: {
    name: string;
    description: string;
    response_ids: number[];
    sample_labels: string[];
    n_responses: number;
    share: number;
  }[];
  competitive: {
    name: string;
    sov: number;            // 0..1
    avg_rank: number | null;
    first_mention_rate: number;  // 0..1
    is_subject: boolean;
  }[];
  // Top-N competitors' per-week metric arrays, parallel to
  // trajectory.weeks. Powers the lighter overlay lines on the
  // Visibility Trend chart so the subject's line can be compared
  // against persistent rivals on each of the three metric tabs.
  // Competitor selection is "top by total appearances across the
  // window," so a one-week fly-by won't show up.
  competitor_trajectories: {
    name: string;
    mention_rate: (number | null)[];
    share_of_voice: (number | null)[];
    top_result_rate: (number | null)[];
  }[];
  // Platform × Topic mention-rate matrix for the Visibility hero
  // mini-heatmap (and the argmax/argmin combos the triad calls out).
  // Cells are sparse — only populated (platform, topic) intersections
  // appear; the frontend joins on platform_slug + topic_label to
  // render a dense grid. mention_rate uses the unnamed-layer AI
  // Recall methodology.
  platform_topic_matrix: {
    platforms: { slug: string; name: string; n_responses: number }[];
    topics: { label: string; source_field: string }[];
    cells: {
      platform_slug: string;
      topic_label: string;
      mention_rate: number | null;
      n_responses: number;
      n_mentioned: number;
    }[];
  };
  // Per-platform matrix: the four headline visibility metrics broken
  // out by model. Backend computes in one query so the Visibility tab
  // can render a 4×N matrix without per-platform fan-out. mention_rate
  // / avg_rank / first_mention_rate use the unnamed-layer-only
  // methodology (matches AI Recall); avg_sentiment uses all layers
  // (matches the headline Avg Sentiment KPI).
  per_platform_kpis: {
    name: string;          // display name, e.g. "ChatGPT"
    slug: string;          // model.slug, e.g. "chatgpt"
    n_responses: number;   // unnamed-layer count (denominator)
    mention_rate: number | null;       // 0..1
    avg_rank: number | null;           // mean rank when mentioned
    first_mention_rate: number | null; // 0..1
    avg_sentiment: number | null;      // -1..+1
  }[];
  // Position histogram for the subject across all unnamed-layer
  // responses where they were mentioned. Always exactly four buckets
  // (#1, #2, #3, #4+) so the UI can render fixed-position bars.
  // `share` sums to 1.0 when total mentioned > 0.
  rank_distribution: {
    rank: number;            // 1, 2, 3, or 4
    label: string;           // "#1", "#2", "#3", "#4+"
    n: number;
    share: number;           // 0..1
    is_aggregate?: boolean;  // true for the #4+ bucket
  }[];
  // Sentiment-of-mentions lens: pos/neu/neg counts among responses
  // where the subject was actually mentioned (or where the prompt
  // named them). Different question from the avg_sentiment KPI —
  // this answers "when AI talks about me, how does it talk about
  // me?". `threshold` is the band around 0 that counts as neutral
  // (±0.1 today).
  sentiment_distribution: {
    positive: number;
    neutral: number;
    negative: number;
    total: number;
    mean: number | null;
    threshold: number;
  };
  // Who beats the subject to rank #1, and how often. `subject_first_count`
  // and `stolen_count` sum (with `no_first_count`) to total_responses;
  // `share` for each stealer is share of total responses (so a reader
  // can compare "you won 20%" against "Stephen Miller stole 35%").
  first_mention_steal_share: {
    total_responses: number;
    subject_first_count: number;
    stolen_count: number;
    no_first_count: number;
    stealers: {
      name: string;
      count: number;
      share: number;
      sample_prompts: string[];
    }[];
  };
  // When the subject IS mentioned, how crowded is the company they
  // keep? Solo / paired / group decomposition tells the comms reader
  // whether mentions are "AI calls you out by name" or "AI lists you
  // in a group of 8 figures" — very different signals.
  mention_quality: {
    total_mentioned: number;
    solo: { count: number; share: number };
    paired: { count: number; share: number };
    group: { count: number; share: number };
  };
  // How aligned are the platforms? For each prompt that ran on
  // multiple platforms, did they all agree (mention or all miss) or
  // diverge? High alignment = systemic gaps; low = platform-specific
  // blind spots.
  cross_platform_divergence: {
    total_multi_platform: number;
    agreed: number;
    diverged: number;
    alignment_score: number | null;
    divergent_prompts: {
      prompt_id: number;
      template: string;
      rendered: string;
      platform_states: { slug: string; name: string; mentioned: boolean }[];
    }[];
  };
  // One row per tracked unnamed-layer prompt — each with per-platform
  // mention status. `present` distinguishes "platform didn't run this
  // prompt" from "platform ran it but didn't mention the subject"
  // (otherwise both would read as blank cells). Rows sorted with
  // fully-missed prompts first so the actionable rows lead.
  per_prompt_coverage: {
    prompt_id: number;
    template: string;        // raw template with {variable} placeholders
    rendered: string;        // rendered prompt with placeholders substituted
    topic_label: string | null;
    platform_results: {
      slug: string;
      name: string;
      present: boolean;
      mentioned: boolean | null;
      rank: number | null;
    }[];
  }[];
  // One mention-rate series per topic, aligned to trajectory.weeks.
  // Powers the Topic Trends multi-line chart so a reader sees which
  // topic is rising/falling over time rather than just snapshot bars.
  // Topics ranked by total appearances across the window.
  topic_trajectories: {
    label: string;
    source_field: string;
    mention_rate: (number | null)[];
  }[];
  // What changed since the prior snapshot — overall mention-rate
  // delta + biggest topic-level and competitor-level swings. Null
  // when there's no prior snapshot. Only changes ≥5pp surface (the
  // backend filters sub-prompt jitter out so the banner doesn't
  // surface noise).
  snapshot_diff: {
    prior_refresh_at: string | null;
    overall_recall_delta: number | null;
    topic_changes: {
      label: string;
      current_rate: number;
      prior_rate: number;
      delta: number;
    }[];
    competitor_changes: {
      name: string;
      current_sov: number;
      prior_sov: number;
      delta: number;
    }[];
  } | null;
  evidence_cards: {
    model_response_id: number;
    model_slug: string;
    slot: string;
    dimension: string;
    prompt_text: string;
    excerpt: string;
    rationale: string;
    type: string;  // characterization | criticism | praise | factual_claim | narrative_frame | model_difference
    mention_status: { mentioned: boolean; rank: number | null } | null;
    frame_label: string | null;
    layer: string;
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
