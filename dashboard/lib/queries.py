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
    the same (org_id, name) pair already exists.
    """
    # Make sure 'name' is in setup_inputs (mirrors the existing CLI flow
    # in app/refresh.py which seeds it there from the CLI argument).
    if "name" not in setup_inputs:
        setup_inputs = {**setup_inputs, "name": name}

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
