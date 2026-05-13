"""dashboard/lib/queries.py — read-only query layer for the internal dashboard.

All DB access for the dashboard goes through this module. Functions return
dicts/lists of plain Python values (no Streamlit imports here), which makes
them easy to test and to reuse if we ever migrate the UI off Streamlit.

Reads from the same Postgres connection as `app/db.py`.
"""
from __future__ import annotations

import json
from typing import Any

from app.db import get_cursor


# ─── helpers ───────────────────────────────────────────────────────────


def _maybe_json(v: Any) -> Any:
    """JSONB columns come back as Python objects from psycopg; older queries
    can return strings. Normalize."""
    if v is None or isinstance(v, (dict, list)):
        return v
    if isinstance(v, str):
        try:
            return json.loads(v)
        except json.JSONDecodeError:
            return v
    return v


def _latest_per_column_sql(col: str) -> str:
    """Mirror of cross_analyzer's _latest_per_column — picks the most recent
    non-null value of `col` from response_extractions for the outer query's
    `mr.id`. Used so the dashboard sees the same aggregated view as the
    cross-analyzers do (Issue 1 from the QA pass)."""
    return (
        f"(SELECT {col} FROM response_extractions "
        f"WHERE model_response_id = mr.id AND {col} IS NOT NULL "
        f"ORDER BY analysis_run_id DESC LIMIT 1)"
    )


# ─── subject + refresh queries ─────────────────────────────────────────


def list_subjects(org_id: str | None = None) -> list[dict[str, Any]]:
    """All subjects with category, refresh count, latest refresh metadata,
    and a couple of cross-analyzer signals for the index view.

    Multi-tenancy: when `org_id` is passed, returns only that org's
    subjects (the customer-facing API path). When None, returns every
    subject including NULL-org seed rows (the operator path used by the
    Streamlit dashboard).
    """
    where_clause = "WHERE s.org_id = %s" if org_id is not None else ""
    params: tuple = (org_id,) if org_id is not None else ()
    with get_cursor(commit=False) as cur:
        cur.execute(f"""
            WITH per_subject AS (
                SELECT s.id, s.name, c.slug AS category, s.setup_inputs, s.created_at,
                       COUNT(rr.id) AS n_refreshes,
                       MAX(rr.id) AS latest_refresh_id,
                       MAX(rr.started_at) AS latest_refresh_at
                FROM subjects s
                JOIN categories c ON c.id = s.category_id
                LEFT JOIN refresh_runs rr ON rr.subject_id = s.id
                {where_clause}
                GROUP BY s.id, s.name, c.slug, s.setup_inputs, s.created_at
            )
            SELECT ps.id, ps.name, ps.category, ps.setup_inputs,
                   ps.n_refreshes, ps.latest_refresh_id, ps.latest_refresh_at,
                   (SELECT COUNT(*) FROM refresh_analyses ra
                    WHERE ra.subject_id = ps.id) AS n_findings
            FROM per_subject ps
            ORDER BY ps.name
        """, params)
        rows = cur.fetchall()
    return [
        {
            "id": r[0],
            "name": r[1],
            "category": r[2],
            "setup_inputs": _maybe_json(r[3]) or {},
            "n_refreshes": r[4] or 0,
            "latest_refresh_id": r[5],
            "latest_refresh_at": r[6],
            "n_findings": r[7] or 0,
        }
        for r in rows
    ]


def get_subject(
    subject_id: int, org_id: str | None = None,
) -> dict[str, Any] | None:
    """Subject + setup_inputs + all refreshes for it.

    Multi-tenancy: when `org_id` is passed, returns None if the subject
    doesn't belong to that org. When None, no scoping (operator path).
    """
    with get_cursor(commit=False) as cur:
        if org_id is not None:
            cur.execute("""
                SELECT s.id, s.name, c.slug, s.setup_inputs, s.created_at
                FROM subjects s
                JOIN categories c ON c.id = s.category_id
                WHERE s.id = %s AND s.org_id = %s
            """, (subject_id, org_id))
        else:
            cur.execute("""
                SELECT s.id, s.name, c.slug, s.setup_inputs, s.created_at
                FROM subjects s
                JOIN categories c ON c.id = s.category_id
                WHERE s.id = %s
            """, (subject_id,))
        row = cur.fetchone()
        if not row:
            return None
        subj = {
            "id": row[0], "name": row[1], "category": row[2],
            "setup_inputs": _maybe_json(row[3]) or {},
            "created_at": row[4],
        }

        cur.execute("""
            SELECT rr.id, rr.started_at, rr.completed_at, rr.status,
                   COUNT(mr.id) AS n_responses,
                   COUNT(mr.id) FILTER (WHERE mr.success) AS n_ok,
                   COALESCE(SUM(mr.cost_usd), 0) AS cost
            FROM refresh_runs rr
            LEFT JOIN model_responses mr ON mr.refresh_run_id = rr.id
            WHERE rr.subject_id = %s
            GROUP BY rr.id, rr.started_at, rr.completed_at, rr.status
            ORDER BY rr.id DESC
        """, (subject_id,))
        refreshes = [
            {
                "id": r[0], "started_at": r[1], "completed_at": r[2], "status": r[3],
                "n_responses": r[4] or 0, "n_ok": r[5] or 0, "cost_usd": r[6] or 0,
            }
            for r in cur.fetchall()
        ]
    subj["refreshes"] = refreshes
    return subj


def create_subject(
    org_id: str,
    category_slug: str,
    name: str,
    setup_inputs: dict[str, Any],
) -> dict[str, Any]:
    """Create a new subject. Caller is responsible for providing valid
    setup_inputs for the category — the API layer should validate the
    required fields against the category's YAML before calling this.

    Returns the created subject (id + name + category + setup_inputs +
    created_at) so the caller can immediately redirect to its detail page.

    Raises ValueError if the category slug is invalid or a subject with
    the same (org_id, name) pair already exists. The duplicate check is
    enforced both at the application level (SELECT-then-INSERT below) and
    at the DB level via the partial unique index added in migration 006 —
    the application check gives a clean error message in the common case,
    the DB index catches the SELECT-then-INSERT race.
    """
    import psycopg.errors

    # Make sure 'name' is in setup_inputs (mirrors the existing CLI flow
    # in app/refresh.py which seeds it there from the CLI argument).
    if "name" not in setup_inputs:
        setup_inputs = {**setup_inputs, "name": name}

    try:
        with get_cursor() as cur:
            cur.execute("SELECT id FROM categories WHERE slug = %s", (category_slug,))
            row = cur.fetchone()
            if not row:
                raise ValueError(f"category '{category_slug}' not found")
            cat_id = row[0]

            cur.execute(
                "SELECT id FROM subjects WHERE org_id = %s AND name = %s",
                (org_id, name),
            )
            if cur.fetchone():
                raise ValueError(
                    f"a subject named '{name}' already exists for this org"
                )

            cur.execute(
                """
                INSERT INTO subjects (category_id, name, setup_inputs, org_id)
                VALUES (%s, %s, %s::jsonb, %s)
                RETURNING id, name, created_at
                """,
                (cat_id, name, json.dumps(setup_inputs), org_id),
            )
            sid, sname, created = cur.fetchone()
    except psycopg.errors.UniqueViolation:
        # The partial unique index on (org_id, name) fired — concurrent
        # request beat us to the INSERT after both passed the SELECT.
        # Convert to ValueError so callers see the same message they'd
        # get from the application-level duplicate check.
        raise ValueError(
            f"a subject named '{name}' already exists for this org"
        )

    return {
        "id": sid,
        "name": sname,
        "category": category_slug,
        "setup_inputs": setup_inputs,
        "created_at": created,
        "org_id": org_id,
    }


def list_active_slots(category_slug: str) -> list[dict[str, Any]]:
    """All active prompt slots for a category — the canonical 5+5 layout.
    Returns rows ordered named-first then by position.

    Slots are stable per category (every refresh of any subject in that
    category uses the same 10 active prompts), so the Response page can
    show this as a filter independent of which specific refresh is
    being viewed.
    """
    with get_cursor(commit=False) as cur:
        cur.execute("""
            SELECT p.layer, p.position, p.dimension, p.type
            FROM prompts p
            JOIN categories c ON c.id = p.category_id
            WHERE c.slug = %s AND p.active = TRUE
            ORDER BY (CASE WHEN p.layer = 'named' THEN 0 ELSE 1 END), p.position
        """, (category_slug,))
        return [
            {"layer": r[0], "position": r[1], "dimension": r[2], "type": r[3]}
            for r in cur.fetchall()
        ]


# ─── refresh detail + responses ────────────────────────────────────────


def get_refresh_responses(refresh_run_id: int) -> list[dict[str, Any]]:
    """All successful model_responses for a refresh with their latest-non-null
    extractor outputs (aggregated across analysis_runs, same semantics as
    cross_analyzer)."""
    sql = f"""
        SELECT
            mr.id, mr.model_id, m.slug, mr.model_identifier,
            p.id, p.layer, p.position, p.dimension, p.type AS prompt_type,
            mr.response_text, mr.cost_usd, mr.latency_ms, mr.response_metadata,
            {_latest_per_column_sql('descriptors')} AS descriptors,
            {_latest_per_column_sql('entities')} AS entities,
            {_latest_per_column_sql('sources')} AS sources,
            {_latest_per_column_sql('total_sources_cited')} AS total_sources_cited,
            {_latest_per_column_sql('cited_own_site')} AS cited_own_site,
            {_latest_per_column_sql('scores')} AS scores,
            {_latest_per_column_sql('narrative_themes')} AS narrative_themes,
            {_latest_per_column_sql('dominant_theme')} AS dominant_theme,
            {_latest_per_column_sql('subject_mentioned')} AS subject_mentioned,
            {_latest_per_column_sql('mention_rank')} AS mention_rank,
            {_latest_per_column_sql('mention_strength')} AS mention_strength,
            {_latest_per_column_sql('mention_excerpt')} AS mention_excerpt,
            {_latest_per_column_sql('competitors_mentioned')} AS competitors_mentioned
        FROM model_responses mr
        JOIN prompts p ON p.id = mr.prompt_id
        JOIN models m ON m.id = mr.model_id
        WHERE mr.refresh_run_id = %s AND mr.success = TRUE
        ORDER BY p.layer, p.position, m.slug
    """
    with get_cursor(commit=False) as cur:
        cur.execute(sql, (refresh_run_id,))
        rows = cur.fetchall()
    cols = [
        "model_response_id", "model_id", "model_slug", "model_identifier",
        "prompt_id", "layer", "position", "dimension", "prompt_type",
        "response_text", "cost_usd", "latency_ms", "response_metadata",
        "descriptors", "entities", "sources", "total_sources_cited",
        "cited_own_site", "scores", "narrative_themes", "dominant_theme",
        "subject_mentioned", "mention_rank", "mention_strength",
        "mention_excerpt", "competitors_mentioned",
    ]
    out = []
    for r in rows:
        d = dict(zip(cols, r))
        for k in (
            "response_metadata", "descriptors", "entities", "sources",
            "scores", "narrative_themes", "competitors_mentioned",
        ):
            d[k] = _maybe_json(d[k])
        out.append(d)
    return out


def get_response(model_response_id: int) -> dict[str, Any] | None:
    """A single response with its extractions + prompt + subject context."""
    sql = f"""
        SELECT
            mr.id, mr.refresh_run_id, mr.subject_id, s.name AS subject_name,
            c.slug AS category, s.setup_inputs,
            mr.model_id, m.slug, mr.model_identifier,
            p.id, p.layer, p.position, p.dimension, p.template, p.version, p.type,
            mr.rendered_prompt, mr.response_text, mr.response_metadata,
            mr.cost_usd, mr.latency_ms, mr.queried_at,
            {_latest_per_column_sql('descriptors')} AS descriptors,
            {_latest_per_column_sql('entities')} AS entities,
            {_latest_per_column_sql('sources')} AS sources,
            {_latest_per_column_sql('total_sources_cited')} AS total_sources_cited,
            {_latest_per_column_sql('cited_own_site')} AS cited_own_site,
            {_latest_per_column_sql('scores')} AS scores,
            {_latest_per_column_sql('narrative_themes')} AS narrative_themes,
            {_latest_per_column_sql('dominant_theme')} AS dominant_theme,
            {_latest_per_column_sql('subject_mentioned')} AS subject_mentioned,
            {_latest_per_column_sql('mention_rank')} AS mention_rank,
            {_latest_per_column_sql('mention_strength')} AS mention_strength,
            {_latest_per_column_sql('mention_excerpt')} AS mention_excerpt,
            {_latest_per_column_sql('competitors_mentioned')} AS competitors_mentioned
        FROM model_responses mr
        JOIN subjects s ON s.id = mr.subject_id
        JOIN categories c ON c.id = s.category_id
        JOIN prompts p ON p.id = mr.prompt_id
        JOIN models m ON m.id = mr.model_id
        WHERE mr.id = %s
    """
    with get_cursor(commit=False) as cur:
        cur.execute(sql, (model_response_id,))
        r = cur.fetchone()
    if not r:
        return None
    cols = [
        "model_response_id", "refresh_run_id", "subject_id", "subject_name",
        "category", "setup_inputs",
        "model_id", "model_slug", "model_identifier",
        "prompt_id", "layer", "position", "dimension", "template", "prompt_version", "prompt_type",
        "rendered_prompt", "response_text", "response_metadata",
        "cost_usd", "latency_ms", "queried_at",
        "descriptors", "entities", "sources", "total_sources_cited", "cited_own_site",
        "scores", "narrative_themes", "dominant_theme",
        "subject_mentioned", "mention_rank", "mention_strength",
        "mention_excerpt", "competitors_mentioned",
    ]
    d = dict(zip(cols, r))
    for k in (
        "setup_inputs", "response_metadata", "descriptors", "entities",
        "sources", "scores", "narrative_themes", "competitors_mentioned",
    ):
        d[k] = _maybe_json(d[k])
    return d


# ─── dashboard overview (Phase 1 wiring) ───────────────────────────────


def _kpi_with_trend(
    current: float | None,
    prior: float | None,
    *,
    pp_scale: bool = True,
) -> dict[str, Any]:
    """Build a {value, delta, trend} dict given the current period
    and prior period values.

    pp_scale=True means the underlying value is a 0..1 fraction we'll
    render as a percentage; the delta is in percentage-points.
    pp_scale=False means the value is already in raw units (e.g.
    sentiment -1..+1); the delta is in raw points.
    """
    if current is None:
        return {"value": None, "delta": None, "trend": "flat"}
    if prior is None:
        return {"value": current, "delta": None, "trend": "flat"}
    raw_delta = current - prior
    if pp_scale:
        raw_delta *= 100  # to percentage points
    trend = "up" if raw_delta > 0 else "down" if raw_delta < 0 else "flat"
    return {
        "value": current,
        "delta": round(raw_delta, 1),
        "trend": trend,
    }


def get_subject_overview(
    subject_id: int,
    *,
    org_id: str | None = None,
    weeks: int = 12,
    risk_frame_threshold: float = 0.5,
) -> dict[str, Any] | None:
    """All summary data for the customer-facing Overview dashboard.

    Returns:
      {
        subject_id, subject_name, category,
        kpis: { ai_recall, avg_sentiment, risk_frame_rate, citation_rate },
        platform_recall: [{name, value, delta, trend, n_responses}],
        trajectory: { weeks: [...], ai_recall: [...], avg_sentiment: [...],
                      risk_frame_rate: [...] },
        sources: [{name, score, type}],
        meta: { n_responses, n_platforms, last_refresh_at, ... }
      }

    Methodology:
      - AI Recall = mention rate on unnamed-layer responses (per the
        mention_detection extractor). Named-layer recall is trivially
        100% (the subject is in the prompt).
      - Avg Sentiment = mean of scores.sentiment across all responses.
      - Risk Frame Rate = share of responses where criticism_severity >
        `risk_frame_threshold` (default 0.5).
      - Citation Rate = share of responses where cited_own_site = TRUE,
        among responses where canonical_url is configured for the subject.
      - Per-platform recall = the same AI Recall computation grouped by
        model.
      - Trajectory = the latest live refresh + the most recent N
        historical refreshes, ordered chronologically. Each week's
        snapshot uses the same metrics. Live refresh + historical
        refreshes BOTH plotted; the methodology caveat lives in the
        UI (historical are date-filtered parametric estimates).
      - Sources = aggregate of the `sources` JSONB across all
        successful responses, grouping by hostname, counting citations,
        deriving a 0-100 "influence" score by normalizing against the
        most-cited domain.

    org_id filter: if set, returns None when the subject doesn't belong
    to that org. If None, no scoping (operator mode).
    """
    where_subject_org = (
        "WHERE s.id = %s AND s.org_id = %s"
        if org_id is not None
        else "WHERE s.id = %s"
    )
    subject_params = (subject_id, org_id) if org_id is not None else (subject_id,)

    with get_cursor(commit=False) as cur:
        # ── Subject metadata ─────────────────────────────────────
        cur.execute(
            f"""
            SELECT s.id, s.name, c.slug, s.setup_inputs
            FROM subjects s
            JOIN categories c ON c.id = s.category_id
            {where_subject_org}
            """,
            subject_params,
        )
        row = cur.fetchone()
        if not row:
            return None
        sid, sname, category, setup_inputs_raw = row
        setup_inputs = _maybe_json(setup_inputs_raw) or {}

        # ── Identify latest live refresh + recent historical refreshes ─
        # status='completed' only — partial refreshes have unstable data
        # (e.g., setup_inputs incomplete → many failed queries) and would
        # distort prior-period deltas and trajectory points.
        cur.execute(
            """
            SELECT id, started_at, completed_at, is_historical_estimate,
                   historical_as_of
            FROM refresh_runs
            WHERE subject_id = %s
              AND status = 'completed'
            ORDER BY
              COALESCE(historical_as_of, started_at::date) DESC,
              id DESC
            LIMIT %s
            """,
            (sid, weeks + 1),
        )
        all_refreshes = cur.fetchall()
        if not all_refreshes:
            # Subject has never had a successful refresh; return empty shape
            return _empty_overview(sid, sname, category)

        # Most recent overall (live preferred if same date)
        latest = all_refreshes[0]
        latest_refresh_id = latest[0]
        latest_completed = latest[2]

        # Prior live refresh for delta computation: pick the second most
        # recent NON-historical refresh; if none, fall back to the second
        # row regardless.
        prior = None
        for r in all_refreshes[1:]:
            if not r[3]:  # not historical
                prior = r
                break
        if prior is None and len(all_refreshes) > 1:
            prior = all_refreshes[1]
        prior_refresh_id = prior[0] if prior else None

        # ── Current-period KPIs ──────────────────────────────────
        current_kpis = _compute_kpis_for_refresh(
            cur, latest_refresh_id, risk_frame_threshold,
        )
        prior_kpis = (
            _compute_kpis_for_refresh(
                cur, prior_refresh_id, risk_frame_threshold,
            )
            if prior_refresh_id
            else {}
        )

        kpis = {
            "ai_recall": _kpi_with_trend(
                current_kpis.get("ai_recall"),
                prior_kpis.get("ai_recall"),
            ),
            "avg_sentiment": _kpi_with_trend(
                current_kpis.get("avg_sentiment"),
                prior_kpis.get("avg_sentiment"),
                pp_scale=False,  # raw -1..+1 scale
            ),
            "risk_frame_rate": _kpi_with_trend(
                current_kpis.get("risk_frame_rate"),
                prior_kpis.get("risk_frame_rate"),
            ),
            "citation_rate": _kpi_with_trend(
                current_kpis.get("citation_rate"),
                prior_kpis.get("citation_rate"),
            ),
        }

        # ── Per-platform AI Recall ───────────────────────────────
        platform_recall = _platform_recall_for_refresh(
            cur, latest_refresh_id, prior_refresh_id,
        )

        # ── Trajectory (latest N refreshes, chronological) ───────
        trajectory = _trajectory_for_subject(
            cur, sid, weeks=weeks, risk_frame_threshold=risk_frame_threshold,
        )

        # ── Top cited sources ───────────────────────────────────
        sources = _top_sources_for_refresh(cur, latest_refresh_id, limit=7)

        # ── Meta counts ─────────────────────────────────────────
        cur.execute(
            """
            SELECT COUNT(*), COUNT(DISTINCT model_id)
            FROM model_responses
            WHERE refresh_run_id = %s AND success = TRUE
            """,
            (latest_refresh_id,),
        )
        n_responses, n_platforms = cur.fetchone()

    return {
        "subject_id": sid,
        "subject_name": sname,
        "category": category,
        "kpis": kpis,
        "platform_recall": platform_recall,
        "trajectory": trajectory,
        "sources": sources,
        "meta": {
            "latest_refresh_id": latest_refresh_id,
            "last_refresh_at": latest_completed.isoformat() if latest_completed else None,
            "n_responses": n_responses or 0,
            "n_platforms": n_platforms or 0,
            "risk_frame_threshold": risk_frame_threshold,
            "canonical_url": setup_inputs.get("canonical_url"),
        },
    }


def _empty_overview(sid: int, sname: str, category: str) -> dict[str, Any]:
    """Returned when the subject has no completed refreshes yet."""
    return {
        "subject_id": sid,
        "subject_name": sname,
        "category": category,
        "kpis": {
            "ai_recall": {"value": None, "delta": None, "trend": "flat"},
            "avg_sentiment": {"value": None, "delta": None, "trend": "flat"},
            "risk_frame_rate": {"value": None, "delta": None, "trend": "flat"},
            "citation_rate": {"value": None, "delta": None, "trend": "flat"},
        },
        "platform_recall": [],
        "trajectory": {"weeks": [], "ai_recall": [], "avg_sentiment": [], "risk_frame_rate": []},
        "sources": [],
        "meta": {"latest_refresh_id": None, "last_refresh_at": None, "n_responses": 0, "n_platforms": 0},
    }


def _compute_kpis_for_refresh(
    cur, refresh_run_id: int, risk_frame_threshold: float,
) -> dict[str, float | None]:
    """Compute the 4 headline KPIs for a single refresh, using
    latest-non-null aggregation across analysis_runs so the values
    survive methodology re-runs."""
    # AI Recall: subject_mentioned on unnamed-layer responses
    cur.execute(
        f"""
        SELECT
          AVG(CASE WHEN sm.subject_mentioned THEN 1.0 ELSE 0.0 END) AS recall
        FROM model_responses mr
        JOIN prompts p ON p.id = mr.prompt_id
        JOIN LATERAL (
            SELECT subject_mentioned
            FROM response_extractions
            WHERE model_response_id = mr.id AND subject_mentioned IS NOT NULL
            ORDER BY analysis_run_id DESC LIMIT 1
        ) sm ON TRUE
        WHERE mr.refresh_run_id = %s AND p.layer = 'unnamed' AND mr.success = TRUE
        """,
        (refresh_run_id,),
    )
    row = cur.fetchone()
    ai_recall = float(row[0]) if row and row[0] is not None else None

    # Avg Sentiment + Risk Frame Rate from scores (across ALL responses,
    # named + unnamed)
    cur.execute(
        f"""
        SELECT
          AVG((s.scores->>'sentiment')::numeric),
          AVG(
            CASE WHEN (s.scores->>'criticism_severity')::numeric > %s
                 THEN 1.0 ELSE 0.0 END
          )
        FROM model_responses mr
        JOIN LATERAL (
            SELECT scores
            FROM response_extractions
            WHERE model_response_id = mr.id AND scores IS NOT NULL
            ORDER BY analysis_run_id DESC LIMIT 1
        ) s ON TRUE
        WHERE mr.refresh_run_id = %s AND mr.success = TRUE
        """,
        (risk_frame_threshold, refresh_run_id),
    )
    row = cur.fetchone()
    avg_sentiment = float(row[0]) if row and row[0] is not None else None
    risk_frame_rate = float(row[1]) if row and row[1] is not None else None

    # Citation Rate: cited_own_site share, only if subject has canonical_url
    cur.execute(
        f"""
        SELECT
          AVG(CASE WHEN sc.cited_own_site THEN 1.0 ELSE 0.0 END)
        FROM model_responses mr
        JOIN LATERAL (
            SELECT cited_own_site
            FROM response_extractions
            WHERE model_response_id = mr.id AND cited_own_site IS NOT NULL
            ORDER BY analysis_run_id DESC LIMIT 1
        ) sc ON TRUE
        WHERE mr.refresh_run_id = %s AND mr.success = TRUE
        """,
        (refresh_run_id,),
    )
    row = cur.fetchone()
    citation_rate = float(row[0]) if row and row[0] is not None else None

    return {
        "ai_recall": ai_recall,
        "avg_sentiment": avg_sentiment,
        "risk_frame_rate": risk_frame_rate,
        "citation_rate": citation_rate,
    }


def _platform_recall_for_refresh(
    cur, latest_refresh_id: int, prior_refresh_id: int | None,
) -> list[dict[str, Any]]:
    """Per-platform AI Recall + delta vs prior period."""
    cur.execute(
        """
        SELECT
          m.slug,
          AVG(CASE WHEN sm.subject_mentioned THEN 1.0 ELSE 0.0 END) AS recall,
          COUNT(*) AS n
        FROM model_responses mr
        JOIN prompts p ON p.id = mr.prompt_id
        JOIN models m ON m.id = mr.model_id
        JOIN LATERAL (
            SELECT subject_mentioned
            FROM response_extractions
            WHERE model_response_id = mr.id AND subject_mentioned IS NOT NULL
            ORDER BY analysis_run_id DESC LIMIT 1
        ) sm ON TRUE
        WHERE mr.refresh_run_id = %s AND p.layer = 'unnamed' AND mr.success = TRUE
        GROUP BY m.slug
        """,
        (latest_refresh_id,),
    )
    current = {slug: (float(rec) if rec is not None else None, n)
               for slug, rec, n in cur.fetchall()}

    prior: dict[str, float | None] = {}
    if prior_refresh_id:
        cur.execute(
            """
            SELECT
              m.slug,
              AVG(CASE WHEN sm.subject_mentioned THEN 1.0 ELSE 0.0 END)
            FROM model_responses mr
            JOIN prompts p ON p.id = mr.prompt_id
            JOIN models m ON m.id = mr.model_id
            JOIN LATERAL (
                SELECT subject_mentioned
                FROM response_extractions
                WHERE model_response_id = mr.id AND subject_mentioned IS NOT NULL
                ORDER BY analysis_run_id DESC LIMIT 1
            ) sm ON TRUE
            WHERE mr.refresh_run_id = %s AND p.layer = 'unnamed' AND mr.success = TRUE
            GROUP BY m.slug
            """,
            (prior_refresh_id,),
        )
        prior = {slug: (float(rec) if rec is not None else None)
                 for slug, rec in cur.fetchall()}

    # Display name normalization (chatgpt → ChatGPT, gemini → Gemini)
    display = {"chatgpt": "ChatGPT", "gemini": "Gemini",
               "claude": "Claude", "perplexity": "Perplexity"}

    out: list[dict[str, Any]] = []
    for slug, (rec, n) in sorted(
        current.items(), key=lambda kv: (kv[1][0] or 0), reverse=True,
    ):
        kpi = _kpi_with_trend(rec, prior.get(slug))
        kpi["name"] = display.get(slug, slug)
        kpi["n_responses"] = n
        out.append(kpi)

    if out:
        # Lowest non-null gets the "lowest" flag
        non_null = [o for o in out if o["value"] is not None]
        if non_null:
            min_idx = min(range(len(out)), key=lambda i: out[i]["value"] or 1)
            out[min_idx]["lowest"] = True

    return out


def _trajectory_for_subject(
    cur, subject_id: int, *, weeks: int, risk_frame_threshold: float,
) -> dict[str, Any]:
    """Weekly time series of AI Recall, Avg Sentiment, Risk Frame Rate
    across the most recent N refreshes (live + historical estimates).
    Ordered chronologically."""
    cur.execute(
        """
        SELECT id, is_historical_estimate, historical_as_of, started_at
        FROM refresh_runs
        WHERE subject_id = %s
          AND status = 'completed'
        ORDER BY
          COALESCE(historical_as_of, started_at::date) DESC,
          id DESC
        LIMIT %s
        """,
        (subject_id, weeks),
    )
    refreshes = cur.fetchall()
    # Reverse to chronological order (oldest first)
    refreshes = list(reversed(refreshes))

    weeks_labels: list[str] = []
    ai_recall: list[float | None] = []
    avg_sentiment: list[float | None] = []
    risk_frame_rate: list[float | None] = []
    refresh_ids: list[int] = []
    is_historical: list[bool] = []

    for rid, hist, as_of, started in refreshes:
        date_val = as_of if hist else started.date()
        weeks_labels.append(date_val.isoformat())
        refresh_ids.append(rid)
        is_historical.append(hist)
        k = _compute_kpis_for_refresh(cur, rid, risk_frame_threshold)
        ai_recall.append(k["ai_recall"])
        avg_sentiment.append(k["avg_sentiment"])
        risk_frame_rate.append(k["risk_frame_rate"])

    return {
        "weeks": weeks_labels,
        "refresh_ids": refresh_ids,
        "is_historical": is_historical,
        "ai_recall": ai_recall,
        "avg_sentiment": avg_sentiment,
        "risk_frame_rate": risk_frame_rate,
    }


def _top_sources_for_refresh(
    cur, refresh_run_id: int, *, limit: int = 7,
) -> list[dict[str, Any]]:
    """Aggregate citations from `sources` JSONB across responses,
    rank by occurrence count, surface top N with a normalized 0-100
    'influence' score and the source_type."""
    cur.execute(
        """
        WITH per_response_sources AS (
            SELECT
              sc.sources
            FROM model_responses mr
            JOIN LATERAL (
                SELECT sources
                FROM response_extractions
                WHERE model_response_id = mr.id AND sources IS NOT NULL
                ORDER BY analysis_run_id DESC LIMIT 1
            ) sc ON TRUE
            WHERE mr.refresh_run_id = %s AND mr.success = TRUE
        ),
        flat AS (
            SELECT
              src->>'domain' AS domain,
              src->>'source_type_slug' AS source_type
            FROM per_response_sources, jsonb_array_elements(sources) src
            WHERE src->>'domain' IS NOT NULL
        ),
        counts AS (
            SELECT
              domain,
              MAX(source_type) AS source_type,
              COUNT(*) AS n_citations
            FROM flat
            GROUP BY domain
        )
        SELECT domain, source_type, n_citations
        FROM counts
        ORDER BY n_citations DESC
        LIMIT %s
        """,
        (refresh_run_id, limit),
    )
    rows = cur.fetchall()
    if not rows:
        return []
    max_n = rows[0][2] or 1
    return [
        {
            "name": domain,
            "score": round((n / max_n) * 100),
            "type": (source_type or "unknown").replace("_", " ").title(),
            "n_citations": n,
        }
        for domain, source_type, n in rows
    ]


# ─── cross-analyzer findings ───────────────────────────────────────────


def get_cross_findings(refresh_run_id: int) -> list[dict[str, Any]]:
    """All refresh_analyses rows for a refresh, from the latest cross-analyzer
    pass."""
    with get_cursor(commit=False) as cur:
        cur.execute("""
            SELECT id FROM analysis_runs
            WHERE refresh_run_id = %s
              AND methodology_version LIKE 'cross-analysis-%%'
              AND status IN ('completed', 'partial')
            ORDER BY id DESC LIMIT 1
        """, (refresh_run_id,))
        row = cur.fetchone()
        if not row:
            return []
        ar_id = row[0]

        cur.execute("""
            SELECT ra.id, ra.analysis_type, ra.analysis_key, ra.model_id,
                   m.slug AS model_slug, ra.summary, ra.findings,
                   ra.source_response_ids, ra.created_at
            FROM refresh_analyses ra
            LEFT JOIN models m ON m.id = ra.model_id
            WHERE ra.analysis_run_id = %s
            ORDER BY ra.analysis_type, ra.model_id NULLS LAST, ra.analysis_key
        """, (ar_id,))
        rows = cur.fetchall()
    return [
        {
            "id": r[0],
            "analysis_type": r[1],
            "analysis_key": r[2],
            "model_id": r[3],
            "model_slug": r[4],
            "summary": r[5],
            "findings": _maybe_json(r[6]) or {},
            "source_response_ids": _maybe_json(r[7]) or [],
            "created_at": r[8],
        }
        for r in rows
    ]
