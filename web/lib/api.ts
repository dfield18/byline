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
    // Narrative-spoke per-refresh score means. directional_lean and
    // sentiment share the -1..+1 range (signed); criticism_severity
    // (mean intensity, distinct from risk_frame_rate) and certainty
    // are unsigned 0..1. net_sentiment is a SIGNED COUNT (positive
    // count − negative count per refresh, ±0.1 neutral band) —
    // domain varies with response volume so charts should compute
    // axis bounds dynamically rather than assuming -1..+1.
    directional_lean: (number | null)[];
    criticism_severity: (number | null)[];
    certainty: (number | null)[];
    net_sentiment: (number | null)[];
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
  sources: {
    name: string;
    score: number;
    type: string;
    n_citations: number;
    // % of successful responses in the snapshot that cited this
    // source (distinct response_ids / total responses). Distinct
    // from n_citations — a single response citing the same source
    // twice counts as 2 citations but 1 covered response.
    response_coverage: number;
    // Per-AI-platform citation count. Sorted by count desc. Lets
    // the Sources tab show which platforms favor which sources.
    platforms: {
      slug: string;
      name: string;
      n_citations: number;
    }[];
  }[];
  topic_coverage: {
    label: string;
    source_field: string;
    n_responses: number;
    n_mentioned: number;
    n_unique_slots: number;
    share_of_set: number;
    ai_recall: number | null;
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
    // Mean sentiment of the cluster's response_ids (-1..+1). Lets
    // the Narrative spoke distinguish a laudatory cluster from a
    // hostile one at a glance. Null when none of the cluster's
    // responses have a measured sentiment score.
    sentiment_mean: number | null;
    // Topic + platform distributions across the cluster's
    // response_ids. Empty when the underlying data can't resolve
    // a topic (e.g. setup_inputs missing). Lets the Narrative
    // spoke narrow the Clusters list by the active global filter.
    topic_distribution: { label: string; count: number }[];
    platform_distribution: { slug: string; count: number }[];
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
  // Same per-platform breakdown but scoped to each tracked topic,
  // plus a per-topic delta vs the prior snapshot. Powers the topic
  // dropdown on the Visibility tab's Platform Change Detail table.
  //   - `delta` is ALREADY IN PERCENTAGE POINTS, matching the
  //     convention used by `platform_recall.delta`.
  //   - topics ordered by total response volume desc; platforms
  //     within each topic sorted by mention_rate desc.
  per_platform_kpis_by_topic: {
    topic_label: string;
    source_field: string;
    platforms: {
      slug: string;
      name: string;
      n_responses: number;
      mention_rate: number | null;
      avg_rank: number | null;
      first_mention_rate: number | null;
      delta: number | null;  // pp units, already × 100
    }[];
  }[];
  // Position distribution across ALL unnamed-layer responses
  // (including the "Not mentioned" bucket so bars sum to 100% of
  // total responses, not just mentioned ones). Five fixed buckets
  // for stable rendering even when some buckets are empty.
  rank_distribution: {
    total_responses: number;
    n_mentioned: number;
    buckets: {
      rank: number;           // 1, 2, 4, 6, or 0 (not mentioned)
      label: string;
      n: number;
      share: number;          // 0..1, normalized to total_responses
      is_absence?: boolean;   // true for the "Not mentioned" bucket
    }[];
  };
  // Per-(platform × topic) rank distribution. Powers the platform
  // and topic dropdowns on the Answer Prominence section — both
  // filters can be combined.
  //   - `all_topics` is the platform's rank distribution across all
  //     tracked topics (used when only the platform filter is set).
  //   - `by_topic[]` is one entry per topic for that platform (used
  //     when both filters are set). Same bucket schema as
  //     `rank_distribution` so the renderer doesn't branch on shape.
  // Platforms ordered by total responses desc; topics within each
  // platform ordered by total responses desc.
  rank_distribution_by_platform: {
    slug: string;
    name: string;
    all_topics: {
      total_responses: number;
      n_mentioned: number;
      buckets: {
        rank: number;
        label: string;
        n: number;
        share: number;
        is_absence?: boolean;
      }[];
    };
    by_topic: {
      topic_label: string;
      source_field: string;
      total_responses: number;
      n_mentioned: number;
      buckets: {
        rank: number;
        label: string;
        n: number;
        share: number;
        is_absence?: boolean;
      }[];
    }[];
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
  // Per-topic sentiment + auxiliary score means for the Narrative
  // spoke's topic-axis matrix. Same mention-scoped denominators as
  // sentiment_distribution. Sorted by n_responses desc.
  topic_sentiment_matrix: {
    topic_label: string;
    source_field: string;
    n_responses: number;
    sentiment_positive: number;
    sentiment_neutral: number;
    sentiment_negative: number;
    sentiment_mean: number | null;
    directional_lean_mean: number | null;
    certainty_mean: number | null;
  }[];
  // Per-platform sentiment distribution — the platform-axis analog
  // of sentiment_distribution. Powers the Narrative spoke's
  // Sentiment Mix section when the platform filter is active.
  platform_sentiment_distribution: {
    platform_slug: string;
    platform_name: string;
    positive: number;
    neutral: number;
    negative: number;
    total: number;
    mean: number | null;
    threshold: number;
  }[];
  // Per-topic and per-platform versions of the 4 narrative-score
  // trajectories (avg_sentiment / directional_lean /
  // criticism_severity / certainty). Arrays are parallel to
  // trajectory.weeks. Used to swap the per-week sparklines in the
  // Sentiment Trend section to the active scope when one filter is
  // set; both arrays empty when no measured data exists.
  trajectory_by_topic: {
    topic_label: string;
    avg_sentiment: (number | null)[];
    directional_lean: (number | null)[];
    criticism_severity: (number | null)[];
    certainty: (number | null)[];
    net_sentiment: (number | null)[];
  }[];
  trajectory_by_platform: {
    platform_slug: string;
    avg_sentiment: (number | null)[];
    directional_lean: (number | null)[];
    criticism_severity: (number | null)[];
    certainty: (number | null)[];
    net_sentiment: (number | null)[];
  }[];
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
  // Per-LLM mention rate per refresh, aligned to trajectory.weeks.
  // Powers the lighter "by platform" overlay lines on the Visibility
  // Trend chart so the reader sees which model is gaining or losing
  // visibility for this subject. Platforms ranked by total
  // appearances across the window; refreshes where a platform had
  // zero responses come through as null in that slot.
  platform_trajectories: {
    slug: string;
    name: string;
    mention_rate: (number | null)[];
  }[];
  // Per-(platform × topic) mention rate per refresh — the cross of
  // topic_trajectories and platform_trajectories. Feeds the platform
  // dropdown on the Topic Visibility section so its Largest Movement
  // card can scope first-vs-latest deltas to a chosen LLM. Platforms
  // ordered by total appearances; topics within each platform
  // ordered by total appearances on that platform.
  topic_trajectories_by_platform: {
    slug: string;
    name: string;
    topics: {
      label: string;
      source_field: string;
      mention_rate: (number | null)[];
    }[];
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
  // Per-topic leader entity + the subject's standing on each topic.
  // Powers a "Topic Battleground" view — surfaces who is beating
  // the subject on each tracked topic and by how much. Sorted with
  // the biggest gap_to_leader first so the topics where the subject
  // is most behind lead the list.
  topic_leaderboard: {
    topic_label: string;
    source_field: string;
    n_responses: number;
    subject_rate: number;            // 0..1
    leader_name: string;
    leader_rate: number;             // 0..1
    subject_is_leader: boolean;
    gap_to_leader: number;           // 0..1, ≥0
    top_competitors: { name: string; rate: number }[];
    // Full per-entity prominence within this topic — powers the
    // topic-scoped Prominence dropdown so the table can recompute
    // Score / Share / Avg Rank / First Mention against just this
    // topic's response subset.
    entities: {
      name: string;
      mentions: number;              // raw count
      sov: number;                   // 0..1 (mention rate within this topic)
      avg_rank: number | null;       // mean rank when mentioned in topic
      first_mention_rate: number;    // 0..1 (rank-1 share within topic)
      is_subject: boolean;
    }[];
    // Subject's rank-bucket distribution scoped to just this
    // topic's responses — same shape as the top-level
    // `rank_distribution`. Powers the Answer Position "scope to
    // topic" dropdown so the same histogram + Avg Rank callout
    // can re-render against one topic's response subset.
    subject_rank_buckets: {
      total_responses: number;
      n_mentioned: number;
      buckets: {
        rank: number;
        label: string;
        n: number;
        share: number;
        is_absence?: boolean;
      }[];
    };
  }[];
  // "When AI mentions the subject, who else shares the answer?"
  // Denominator is subject_mention_count (responses where the
  // subject was mentioned), so `share` is "what fraction of my
  // mentions also named this competitor."
  co_mention_frequency: {
    subject_mention_count: number;
    co_mentions: {
      name: string;
      count: number;
      share: number;                 // 0..1
    }[];
  };
  // Per-platform entity SoV grid — rows × columns × cell shape so
  // the UI can render a heatmap directly. Top N entities by total
  // appearances (subject always included); cells are sparse (only
  // measured combos appear).
  per_platform_entity_sov: {
    platforms: { slug: string; name: string; n_responses: number }[];
    entities: {
      name: string;
      total_appearances: number;
      is_subject: boolean;
    }[];
    cells: {
      platform_slug: string;
      entity_name: string;
      sov: number;                   // 0..1
      n_appearances: number;
    }[];
  };
  // Per-(topic × platform × entity) prominence — powers the
  // section-level platform/topic dropdowns on the Competition
  // spoke's Landscape section so all three sub-cards (SoV bars,
  // Scatter, Prominence table) can be scoped on both dimensions.
  //   - `by_topic[0]` is a synthetic "All topics" rollup
  //     (`is_all_topics: true`), so the same structure handles
  //     both platform-only and platform+topic scope paths.
  //   - subsequent entries are ordered by total volume desc.
  per_platform_landscape: {
    platforms: {
      slug: string;
      name: string;
      n_responses_total: number;
    }[];
    by_topic: {
      topic_label: string;
      source_field: string | null;
      is_all_topics: boolean;
      platforms: {
        slug: string;
        n_responses: number;
        entities: {
          name: string;
          is_subject: boolean;
          sov: number;                  // 0..1
          avg_rank: number | null;
          first_mention_rate: number;   // 0..1
          n_appearances: number;
        }[];
      }[];
    }[];
  };
  // Cross-subject benchmarks so the Briefing KPIs can render a
  // "vs subject-set avg" annotation under each card — context the
  // raw percentage alone can't provide.
  subject_set_benchmarks: {
    n_subjects: number;
    ai_mention_rate_avg: number | null;     // 0..1
    avg_mention_rank_avg: number | null;    // ranks (lower better)
    first_mention_rate_avg: number | null;  // 0..1
    // Median (max_topic_recall - min_topic_recall) across subjects in
    // the set. Powers the "vs subject-set median" caption on the
    // Largest Visibility Gap KPI card. Median (not mean) keeps a
    // single outlier subject from dragging the benchmark.
    topic_gap_median: number | null;        // 0..1
  };
  evidence_cards: {
    model_response_id: number;
    // Carries the underlying prompt so the Overview Evidence card
    // can lazy-fetch the full per-platform AI response via the
    // existing /api/subjects/{id}/prompts/{promptId}/responses
    // route — the cross-analyzer's quoted excerpt is often
    // truncated mid-sentence, and the full response is what
    // readers actually want when they click "Show full quote".
    prompt_id: number;
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

// Defensive normalizer for the trajectory object. Every per-snapshot
// series in `trajectory` is rendered by the Overview spoke's KPI
// strip, sparklines, and stat stack via index-aligned lookups
// against `trajectory.weeks` — so if any series array drifts out of
// sync with `weeks.length` (a backend bug producing e.g. a 5-element
// ai_recall while weeks has 6), the latest value silently binds to
// the wrong date. This caps that failure mode at the API boundary:
// any series shorter than weeks is left-padded with nulls (older
// snapshots assumed missing); any series longer is right-truncated.
// A console.warn surfaces the discrepancy in dev without breaking
// the page in prod.
//
// Series enumerated explicitly (not via Object.keys) so new fields
// added to the trajectory type don't silently bypass normalization
// when the type changes — TypeScript will flag the missing entry
// here on next build.
function normalizeTrajectory(t: SubjectOverview["trajectory"]): SubjectOverview["trajectory"] {
  const target = t.weeks.length;
  const numericSeries = [
    "ai_recall",
    "avg_sentiment",
    "risk_frame_rate",
    "citation_rate",
    "directional_lean",
    "criticism_severity",
    "certainty",
    "net_sentiment",
    "share_of_voice",
    "top_result_rate",
  ] as const;
  const out = { ...t } as SubjectOverview["trajectory"] & Record<string, unknown>;
  // refresh_ids + is_historical are non-nullable (number / boolean
  // arrays). On mismatch we still align length but pad with sentinels
  // (-1 for refresh_ids, false for is_historical) so downstream code
  // doesn't have to handle undefined indices.
  if (t.refresh_ids.length !== target) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `trajectory.refresh_ids length mismatch (${t.refresh_ids.length} vs weeks ${target}); normalizing.`,
      );
    }
    out.refresh_ids = padOrTruncate(t.refresh_ids, target, -1);
  }
  if (t.is_historical.length !== target) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `trajectory.is_historical length mismatch (${t.is_historical.length} vs weeks ${target}); normalizing.`,
      );
    }
    out.is_historical = padOrTruncate(t.is_historical, target, false);
  }
  for (const key of numericSeries) {
    const series = t[key];
    if (!Array.isArray(series)) continue;
    if (series.length === target) continue;
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `trajectory.${key} length mismatch (${series.length} vs weeks ${target}); normalizing.`,
      );
    }
    out[key] = padOrTruncate(series, target, null);
  }
  return out as SubjectOverview["trajectory"];
}

// Force an array to `target` length: pad the FRONT with `fill` when
// shorter (older snapshots assumed missing — keeps the newest
// entries aligned to the right edge, matching how the UI reads
// "latest = last index"); right-truncate when longer (drops newest
// beyond what weeks covers — the alternative, dropping oldest,
// would shift the latest value's date alignment).
function padOrTruncate<T>(arr: T[], target: number, fill: T): T[] {
  if (arr.length === target) return arr;
  if (arr.length < target) {
    return [...Array(target - arr.length).fill(fill), ...arr];
  }
  return arr.slice(arr.length - target);
}

export const getSubjectOverview = async (
  subjectId: number,
  weeks = 12,
): Promise<SubjectOverview> => {
  const raw = await apiGet<SubjectOverview>(
    `/api/subjects/${subjectId}/overview?weeks=${weeks}`,
  );
  return { ...raw, trajectory: normalizeTrajectory(raw.trajectory) };
};

// Per-platform full response text for a single prompt on the
// subject's latest completed refresh. Used by the Prompts spoke's
// click-to-expand panel — lazy-loaded per prompt_id so the overview
// payload stays compact.
export type PromptResponse = {
  platform_slug: string;
  platform_name: string;
  response_text: string;
  success: boolean;
  mentioned: boolean | null;
  rank: number | null;
};

export const getPromptResponses = (
  subjectId: number,
  promptId: number,
) =>
  apiGet<{ responses: PromptResponse[] }>(
    `/api/subjects/${subjectId}/prompts/${promptId}/responses`,
  );
