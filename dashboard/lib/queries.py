"""dashboard/lib/queries.py — read-only query layer for the internal dashboard.

All DB access for the dashboard goes through this module. Functions return
dicts/lists of plain Python values (no Streamlit imports here), which makes
them easy to test and to reuse if we ever migrate the UI off Streamlit.

Reads from the same Postgres connection as `app/db.py`.
"""
from __future__ import annotations

import json
from typing import Any

from psycopg.types.json import Json

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


def _is_operator_org(org_id: str | None) -> bool:
    """True when the caller's Clerk org_id matches BYLINE_OPERATOR_ORG_ID
    in the environment. Operator orgs get a relaxed scope on the read
    paths: they can see NULL-org subjects (seed/operator-owned content)
    in addition to their own org's subjects. Single-tenant for now —
    one operator org per deployment, configured via env."""
    import os
    if not org_id:
        return False
    configured = os.environ.get("BYLINE_OPERATOR_ORG_ID", "").strip()
    return bool(configured) and org_id == configured


def list_subjects(org_id: str | None = None) -> list[dict[str, Any]]:
    """All subjects with category, refresh count, latest refresh metadata,
    and a couple of cross-analyzer signals for the index view.

    Multi-tenancy:
      - org_id=None: no scoping. Operator path used by Streamlit.
      - org_id is the operator's: relaxed scope — own org + NULL-org
        seed subjects all visible (Option A: operator-bypass).
      - org_id is any other customer's: strict scope to that org only.
    """
    if org_id is None:
        where_clause = ""
        params: tuple = ()
    elif _is_operator_org(org_id):
        where_clause = "WHERE (s.org_id = %s OR s.org_id IS NULL)"
        params = (org_id,)
    else:
        where_clause = "WHERE s.org_id = %s"
        params = (org_id,)
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

    Multi-tenancy (same three cases as list_subjects):
      - org_id=None: no scoping (operator/Streamlit path).
      - org_id is the operator's: own org + NULL-org seed subjects.
      - any other org: strict scope, returns None for foreign subjects.
    """
    with get_cursor(commit=False) as cur:
        if org_id is None:
            cur.execute("""
                SELECT s.id, s.name, c.slug, s.setup_inputs, s.created_at
                FROM subjects s
                JOIN categories c ON c.id = s.category_id
                WHERE s.id = %s
            """, (subject_id,))
        elif _is_operator_org(org_id):
            cur.execute("""
                SELECT s.id, s.name, c.slug, s.setup_inputs, s.created_at
                FROM subjects s
                JOIN categories c ON c.id = s.category_id
                WHERE s.id = %s AND (s.org_id = %s OR s.org_id IS NULL)
            """, (subject_id, org_id))
        else:
            cur.execute("""
                SELECT s.id, s.name, c.slug, s.setup_inputs, s.created_at
                FROM subjects s
                JOIN categories c ON c.id = s.category_id
                WHERE s.id = %s AND s.org_id = %s
            """, (subject_id, org_id))
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


# ─── topic coverage (Phase 2 wiring) ───────────────────────────────────

# Order of preference when a prompt uses multiple topic-bearing
# variables. The first one wins as that prompt's topic.
_TOPIC_VAR_PRIORITY = [
    "primary_domain",
    "secondary_domain",
    "tertiary_domain",
    "contextual_domain",
    "adjacent_position",
]

# Always-present-in-templates variables that aren't real topics
# (identity, grammar, configuration, generation seed). Mapped to
# special-case labels or skipped entirely.
_RECENT_NEWS_LABEL = "Current events"


def _extract_template_vars(template: str) -> set[str]:
    """Pull the set of {variable_name} substitutions out of a prompt
    template. Used to derive a prompt's topic from which setup_input
    variable it invokes."""
    import re

    return set(re.findall(r"\{(\w+)\}", template or ""))


def _topic_for_prompt(
    template: str, setup_inputs: dict[str, Any]
) -> tuple[str, str] | None:
    """Determine the topic label for a (prompt, subject) pair.

    Returns (label, source_field) where:
      - label is the subject-specific topic string (e.g. "progressive
        governance and healthcare reform")
      - source_field is the setup_input key that supplied it (e.g.
        "primary_domain") — useful for surfacing in the UI

    Returns None for prompts whose template doesn't reference any
    topic-bearing variable (e.g. named/1 "descriptive baseline" which
    only uses {name}, {pronoun_be}, {pronoun_subject}).

    Recent-news prompts (`{recent_news}` in the template) are bucketed
    under a single "Current events" label since recent_news is volatile
    and doesn't map to a stable topic across refreshes.
    """
    vars_in_template = _extract_template_vars(template)

    if "recent_news" in vars_in_template:
        return (_RECENT_NEWS_LABEL, "recent_news")

    for var in _TOPIC_VAR_PRIORITY:
        if var in vars_in_template:
            value = setup_inputs.get(var)
            if value:
                return (str(value), var)

    return None


def _topic_coverage_for_refresh(
    cur, refresh_run_id: int, setup_inputs: dict[str, Any],
) -> list[dict[str, Any]]:
    """Group prompts run in this refresh by topic, compute share of
    unnamed-layer test set + AI recall per topic.

    Why unnamed-layer only:
      - Named-layer prompts include the subject's name in the prompt
        text. AI recall is trivially 100% on them (the subject is in
        the question). They tell us nothing about "does AI surface
        this subject organically?"
      - Unnamed-layer prompts probe the topic area without naming the
        subject. AI recall measures whether the subject is surfaced.
        This is the meaningful per-topic visibility metric.
    """
    cur.execute(
        """
        SELECT
          p.id, p.template,
          sm.subject_mentioned
        FROM model_responses mr
        JOIN prompts p ON p.id = mr.prompt_id
        JOIN LATERAL (
            SELECT subject_mentioned
            FROM response_extractions
            WHERE model_response_id = mr.id AND subject_mentioned IS NOT NULL
            ORDER BY analysis_run_id DESC LIMIT 1
        ) sm ON TRUE
        WHERE mr.refresh_run_id = %s
          AND p.layer = 'unnamed'
          AND mr.success = TRUE
        """,
        (refresh_run_id,),
    )
    rows = cur.fetchall()

    # Group by topic label
    buckets: dict[str, dict[str, Any]] = {}
    for prompt_id, template, mentioned in rows:
        topic = _topic_for_prompt(template, setup_inputs)
        if topic is None:
            continue  # prompts without a topic variable are skipped
        label, source_field = topic
        if label not in buckets:
            buckets[label] = {
                "label": label,
                "source_field": source_field,
                "n_responses": 0,
                "n_mentioned": 0,
                "prompt_slots": set(),
            }
        buckets[label]["n_responses"] += 1
        if mentioned:
            buckets[label]["n_mentioned"] += 1
        buckets[label]["prompt_slots"].add(prompt_id)

    total = sum(b["n_responses"] for b in buckets.values())
    if total == 0:
        return []

    return [
        {
            "label": b["label"],
            "source_field": b["source_field"],
            "n_responses": b["n_responses"],
            "n_unique_slots": len(b["prompt_slots"]),
            "share_of_set": b["n_responses"] / total,
            "ai_recall": (
                b["n_mentioned"] / b["n_responses"]
                if b["n_responses"] else None
            ),
        }
        for b in sorted(buckets.values(), key=lambda x: -x["n_responses"])
    ]


# ─── strategic takeaways (Phase 2 wiring) ──────────────────────────────


def _compute_strategic_takeaways(
    cur,
    refresh_run_id: int,
    setup_inputs: dict[str, Any],
    subject_name: str,
    category: str = "",
    *,
    min_recall_gap_pp: float = 15.0,
    high_criticism_threshold: float = 0.30,
    strong_asset_min_recall: float = 0.50,
) -> list[dict[str, Any]]:
    """Produce up to three executive takeaways from per-topic metrics
    for a single refresh. Each takeaway type is emitted only when a
    real signal exists — no manufactured insights when the data is
    flat. Returns 0-3 items in display order (gap, frame, asset).

    Rules:
      Message Gap     — lowest-recall topic at least `min_recall_gap_pp`
                        below the mean of the other topics' recall
      Opposition Frame — topic with mean criticism_severity at or above
                        `high_criticism_threshold`
      Strongest Asset  — topic with the highest recall (tiebreak by
                        sentiment) at or above `strong_asset_min_recall`

    Rules tuned so an Obama-like subject (high recall everywhere, low
    criticism) gets a single Message Gap takeaway; a Warren-like subject
    with stronger topic differentiation gets all three.
    """
    cur.execute(
        """
        SELECT
          p.template,
          p.layer,
          sm.subject_mentioned,
          (sc.scores->>'sentiment')::numeric AS sentiment,
          (sc.scores->>'criticism_severity')::numeric AS criticism
        FROM model_responses mr
        JOIN prompts p ON p.id = mr.prompt_id
        LEFT JOIN LATERAL (
            SELECT subject_mentioned
            FROM response_extractions
            WHERE model_response_id = mr.id AND subject_mentioned IS NOT NULL
            ORDER BY analysis_run_id DESC LIMIT 1
        ) sm ON TRUE
        LEFT JOIN LATERAL (
            SELECT scores
            FROM response_extractions
            WHERE model_response_id = mr.id AND scores IS NOT NULL
            ORDER BY analysis_run_id DESC LIMIT 1
        ) sc ON TRUE
        WHERE mr.refresh_run_id = %s AND mr.success = TRUE
        """,
        (refresh_run_id,),
    )

    buckets: dict[str, dict[str, Any]] = {}
    for template, layer, mentioned, sentiment, criticism in cur.fetchall():
        topic = _topic_for_prompt(template, setup_inputs)
        if topic is None:
            continue
        label, source = topic
        if label not in buckets:
            buckets[label] = {
                "label": label,
                "source": source,
                "recall_responses": [],
                "sentiments": [],
                "criticisms": [],
            }
        if layer == "unnamed" and mentioned is not None:
            buckets[label]["recall_responses"].append(bool(mentioned))
        if sentiment is not None:
            buckets[label]["sentiments"].append(float(sentiment))
        if criticism is not None:
            buckets[label]["criticisms"].append(float(criticism))

    topic_metrics = []
    for b in buckets.values():
        recall = (
            sum(b["recall_responses"]) / len(b["recall_responses"])
            if b["recall_responses"] else None
        )
        mean_sent = (
            sum(b["sentiments"]) / len(b["sentiments"])
            if b["sentiments"] else None
        )
        mean_crit = (
            sum(b["criticisms"]) / len(b["criticisms"])
            if b["criticisms"] else None
        )
        topic_metrics.append({
            "label": b["label"],
            "source": b["source"],
            "recall": recall,
            "mean_sentiment": mean_sent,
            "mean_criticism": mean_crit,
        })

    takeaways: list[dict[str, Any]] = []

    # Short-form reference used in body copy. Equals subject_name for
    # short-named subjects; collapses to "this event" / "this policy"
    # for long descriptive names so the body lines don't sprawl.
    subj_inline = _format_subject_inline(subject_name, category)
    subj_inline_cap = (
        subj_inline[0].upper() + subj_inline[1:] if subj_inline else subj_inline
    )

    # ── Message Gap ─────────────────────────────────────────
    with_recall = [t for t in topic_metrics if t["recall"] is not None]
    if len(with_recall) >= 2:
        lowest = min(with_recall, key=lambda t: t["recall"])
        others = [t for t in with_recall if t["label"] != lowest["label"]]
        other_recalls = [t["recall"] for t in others]
        other_mean = sum(other_recalls) / len(other_recalls)
        gap_pp = (other_mean - lowest["recall"]) * 100
        if gap_pp >= min_recall_gap_pp:
            lowest_pct = round(lowest["recall"] * 100)
            # When there's a single other topic, compare directly to it
            # by name (avoids the awkward "average across other topic
            # areas" phrasing for 2-topic subjects). With 2+ others,
            # keep the average phrasing but fix the pluralization.
            if len(others) == 1:
                other = others[0]
                body = (
                    f"AI surfaces {subj_inline} in {lowest_pct}% of "
                    f"{lowest['label']} prompts, vs "
                    f"{round(other['recall'] * 100)}% on "
                    f"{other['label']} prompts."
                )
            else:
                body = (
                    f"AI surfaces {subj_inline} in {lowest_pct}% of "
                    f"{lowest['label']} prompts. Recall averages "
                    f"{round(other_mean * 100)}% across the other "
                    f"{len(others)} tracked topic areas."
                )
            takeaways.append({
                "kind": "message_gap",
                "tone": "warning",
                "eyebrow": "Message gap",
                "title": f"AI underweights {lowest['label']}",
                "body": body,
            })

    # ── Opposition Frame ────────────────────────────────────
    with_crit = [t for t in topic_metrics if t["mean_criticism"] is not None]
    if with_crit:
        highest_crit = max(with_crit, key=lambda t: t["mean_criticism"])
        if highest_crit["mean_criticism"] >= high_criticism_threshold:
            label_cap = _cap_first(highest_crit["label"])
            takeaways.append({
                "kind": "opposition_frame",
                "tone": "muted",
                "eyebrow": "Opposition frame",
                "title": f"{label_cap} prompts trigger heavier criticism",
                "body": (
                    f"Average criticism severity is "
                    f"{highest_crit['mean_criticism']:.2f} on these prompts, "
                    f"the highest among tracked topic areas for {subj_inline}."
                ),
            })

    # ── Strongest Asset ─────────────────────────────────────
    # Exclude the "Current events" bucket (source: recent_news) from
    # Strongest Asset eligibility. It collects responses to volatile
    # recent-news-driven prompts; celebrating it as a strength is
    # tautological ("AI surfaces you when asked about recent news
    # about you"). Other rules (Message Gap, Topic Coverage panel)
    # still include it — under-coverage on current events IS a real
    # signal, so it stays eligible for the gap rule.
    candidates = [
        t for t in topic_metrics
        if t["recall"] is not None
        and t["recall"] >= strong_asset_min_recall
        and t["source"] != "recent_news"
    ]
    if candidates:
        strong = max(
            candidates,
            key=lambda t: (t["recall"], t["mean_sentiment"] or 0),
        )
        sent = strong["mean_sentiment"] or 0
        sent_label = (
            "favorable" if sent > 0.1
            else "critical" if sent < -0.1
            else "neutral"
        )
        # Use "Strongest association: [topic]" rather than
        # "[Topic] is the strongest association" — avoids subject-verb
        # agreement issues when the topic label is a plural noun phrase
        # (e.g. "former US presidents and Democratic Party leaders").
        takeaways.append({
            "kind": "strongest_asset",
            "tone": "primary",
            "eyebrow": "Strongest asset",
            "title": f"Strongest association: {strong['label']}",
            "body": (
                f"{subj_inline_cap} appears in {round(strong['recall'] * 100)}% "
                f"of {strong['label']} prompts with {sent_label} overall "
                f"sentiment."
            ),
        })

    # Display order for the dashboard: Strongest Asset on the left
    # (anchors the section with what's working), Message Gap on the
    # right (the action item to address), Opposition Frame after
    # those, then future types. Don't rely on the order takeaways
    # were appended — sort by an explicit table so the editorial
    # hierarchy is stable.
    _takeaway_order = {
        "strongest_asset": 1,
        "message_gap": 2,
        "opposition_frame": 3,
        "what_changed": 4,
        "coverage_caveat": 5,
    }
    takeaways.sort(key=lambda t: _takeaway_order.get(t["kind"], 99))

    return takeaways


def _cap_first(s: str) -> str:
    """Capitalize the first character without lowercasing the rest. Used
    for topic labels that need to start a sentence."""
    return s[:1].upper() + s[1:] if s else s


# ─── LLM polish for executive summary (Phase 3a refinement) ────────────


_POLISH_PROMPT = """You are a public-affairs analyst polishing two sentences \
for an executive dashboard about {subject_name}.

Rule-based rough draft (these capture the underlying findings):
- Bottom line: {raw_bottom_line}
- Recommended focus: {raw_recommended_focus}

Context (do not restate as numbers; use only for grounding):
- AI Mention Rate: {recall_str}
- Average Tone: {sentiment_str}
- Risk Frame Rate: {risk_str}

Task: Rewrite each sentence in a natural, declarative analyst voice.

Overriding principle: the final sentence MUST read like a senior comms \
director wrote it, not like a model trying to satisfy a rubric. If a \
rule below would force unnatural phrasing, prefer naturalness — the \
goal is text that gets quoted in client emails, not text that passes \
an audit.

Rules:
- Preserve the underlying CLAIM faithfully (the gap, the asset, the \
direction of the recommendation). You may rephrase the supporting \
concepts so they read naturally — e.g., "progressive politicians in \
the US Senate" can become "his progressive Senate identity" or "the \
Senate progressive bloc." Don't invent new facts or shift the claim's \
direction.
- Each output must be ONE sentence, ≤30 words.
- Bottom line should cite ONE specific value drawn from the rough \
draft or context (a percentage, a topic with a value, a cluster \
share) — woven in naturally, often parenthetically. If no value flows \
naturally, omit it rather than bolting it on. Don't restate the full \
KPI panel.
- Recommended Focus should lead with an actionable imperative verb a \
comms director could put in a plan (e.g., Connect, Draft, Pitch, \
Publish, Brief, Reframe, Lead, Target, Schedule, Prepare, Surface, \
Counter). The clearer the action, the better.
- BANNED: stacked compound noun phrases (e.g., "US Senate politician \
association", "policy expertise narrative pattern", "corporate \
influence messaging strategy"). If you find yourself stringing 3+ \
nouns together with no preposition between them, rewrite using "of", \
"on", "around", "in", or recast as a verb phrase.
- BANNED: marketing speak ("powerful", "stunning", "incredible", \
"strong association", "established association").
- BANNED: internal/technical metric names. When citing a metric, use \
the customer-facing label: say "AI Mention Rate" not "AI Recall" or \
"recall"; say "Average Tone" not "Avg Sentiment" or "sentiment score"; \
"Risk Frame Rate" stays as-is. Better still, paraphrase the metric in \
plain English ("mention rate" or "share of AI answers"; "tone"; \
"critical framing").
- BANNED: meta-commentary preambles ("AI analysis indicates...", \
"AI analysis shows...", "AI analysis confirms...", "Analysis suggests..."). \
The reader knows this is AI analysis — don't restate it. Instead: \
(a) lead with the subject name ("Bernie Sanders is firmly linked to..."), \
or (b) use a tight AI-attribution verb ("AI links X to Y", "AI \
underweights X on Y", "AI surfaces X in..."). Save the words for \
the actual finding.
- For subjects with names longer than ~30 characters (typically \
events, policies, issues — e.g., "the November 2023 firing of Sam \
Altman by the OpenAI board"), aggressively shorten the subject in \
mid-sentence references. Acceptable shortenings: take a defining \
noun phrase ("Sam Altman's firing", "the OpenAI board firing", "the \
IRA"), or use a category noun if the context is unambiguous ("this \
event", "this policy"). Avoid stringing the full long name through \
the sentence; it forces awkward prepositional chains. The full name \
appears in the hero title elsewhere on the page, so a shortened \
reference is unambiguous to the reader.
- The subject's full name MUST appear at least once across the two \
sentences (so pronouns like "he"/"his" have a clear antecedent). \
Once is ideal; twice is acceptable; pronouns-only is NOT acceptable.
- If the rough draft for a field is "(none)", return an empty string \
for that field.
"""

_POLISH_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "bottom_line": {"type": "STRING"},
        "recommended_focus": {"type": "STRING"},
    },
    "required": ["bottom_line", "recommended_focus"],
}


def _format_subject_inline(name: str, category: str) -> str:
    """Python mirror of the React `formatSubjectInline` helper. Swaps
    very long subject names (>40 chars — typically events, policies,
    issues with descriptive titles like "the November 2023 firing of
    Sam Altman by the OpenAI board") for a category-aware short form
    when used in mid-sentence references. Short-named subjects pass
    through unchanged. The full name still appears in the hero title;
    these substitutions only apply inside body copy where width and
    readability matter."""
    if len(name) <= 40:
        return name
    short_forms = {
        "event": "this event",
        "policy": "this policy",
        "issue": "this issue",
        "organization": "this organization",
        "person": name,  # person names rarely this long; pass through
    }
    return short_forms.get(category, name)


# Bump this string to invalidate every cached polish row at once
# (e.g., after a meaningful prompt change). Format keeps it sortable.
_POLISH_CACHE_TYPE = "executive_polish_v5"


def _polish_cache_read(
    refresh_run_id: int,
    raw_bottom_line: str | None,
    raw_recommended_focus: str | None,
) -> dict[str, str | None] | None:
    """Look for a cached polish on this refresh. Cache hit only if the
    stored raw inputs match the current ones — if the rule-based draft
    changed (e.g., takeaway generator updated), we must re-polish.
    Returns None on miss or any error so the caller falls through to
    a fresh LLM call."""
    try:
        with get_cursor(commit=False) as cur:
            cur.execute(
                """
                SELECT findings
                FROM refresh_analyses
                WHERE refresh_run_id = %s
                  AND analysis_type = %s
                ORDER BY id DESC
                LIMIT 1
                """,
                (refresh_run_id, _POLISH_CACHE_TYPE),
            )
            row = cur.fetchone()
    except Exception:
        return None
    if not row:
        return None
    findings = _maybe_json(row[0]) or {}
    if (
        findings.get("raw_bottom_line") != raw_bottom_line
        or findings.get("raw_recommended_focus") != raw_recommended_focus
    ):
        return None
    return {
        "bottom_line": findings.get("polished_bottom_line"),
        "recommended_focus": findings.get("polished_recommended_focus"),
    }


def _polish_cache_write(
    refresh_run_id: int,
    subject_id: int,
    raw_bottom_line: str | None,
    raw_recommended_focus: str | None,
    polished_bottom_line: str | None,
    polished_recommended_focus: str | None,
) -> None:
    """Persist polish output keyed by refresh. Attaches to the most
    recent analysis_run for the refresh; if none exists yet (refresh
    without a cross-analysis pass), skip silently — polish still runs
    on each read, just isn't cached. All errors swallowed so a write
    failure can't break page render."""
    try:
        with get_cursor(commit=True) as cur:
            cur.execute(
                """
                SELECT id FROM analysis_runs
                WHERE refresh_run_id = %s
                ORDER BY id DESC
                LIMIT 1
                """,
                (refresh_run_id,),
            )
            row = cur.fetchone()
            if not row:
                return
            analysis_run_id = row[0]
            # Delete any prior polish rows for this refresh before
            # inserting the new one. Keeps the table at most one row
            # per (refresh_run_id, analysis_type) — prevents unbounded
            # growth when raw inputs change repeatedly, and lets the
            # read path safely use ORDER BY id DESC LIMIT 1 without
            # worrying about stale duplicates.
            cur.execute(
                """
                DELETE FROM refresh_analyses
                WHERE refresh_run_id = %s
                  AND analysis_type = %s
                """,
                (refresh_run_id, _POLISH_CACHE_TYPE),
            )
            cur.execute(
                """
                INSERT INTO refresh_analyses (
                    analysis_run_id, refresh_run_id, subject_id,
                    analysis_type, findings, methodology_version
                ) VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    analysis_run_id,
                    refresh_run_id,
                    subject_id,
                    _POLISH_CACHE_TYPE,
                    Json({
                        "raw_bottom_line": raw_bottom_line,
                        "raw_recommended_focus": raw_recommended_focus,
                        "polished_bottom_line": polished_bottom_line,
                        "polished_recommended_focus": polished_recommended_focus,
                    }),
                    _POLISH_CACHE_TYPE,
                ),
            )
    except Exception:
        pass


def _polish_executive_summary(
    subject_name: str,
    kpis: dict[str, dict[str, Any]],
    raw_bottom_line: str | None,
    raw_recommended_focus: str | None,
    *,
    refresh_run_id: int | None = None,
    subject_id: int | None = None,
) -> dict[str, str | None]:
    """LLM polish pass. Returns {bottom_line, recommended_focus} dict.
    On any failure (no API key, network error, malformed response)
    returns the rule-based inputs unchanged so the page never breaks.

    Caching: when refresh_run_id + subject_id are passed, the result
    is cached in refresh_analyses keyed by `executive_polish_v1`. A
    subsequent call with the same raw inputs hits cache and skips the
    LLM call entirely. The raw inputs are stored alongside the
    polished output so changes to the rule-based draft (from a code
    update) bust the cache automatically.
    """
    if not raw_bottom_line and not raw_recommended_focus:
        return {
            "bottom_line": raw_bottom_line,
            "recommended_focus": raw_recommended_focus,
        }

    # Cache check
    if refresh_run_id is not None:
        cached = _polish_cache_read(
            refresh_run_id, raw_bottom_line, raw_recommended_focus,
        )
        if cached is not None:
            return {
                "bottom_line": cached["bottom_line"] or raw_bottom_line,
                "recommended_focus": cached["recommended_focus"] or raw_recommended_focus,
            }

    try:
        import json as _json
        import os
        from google import genai
        from google.genai import types
    except ImportError:
        return {
            "bottom_line": raw_bottom_line,
            "recommended_focus": raw_recommended_focus,
        }

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return {
            "bottom_line": raw_bottom_line,
            "recommended_focus": raw_recommended_focus,
        }

    def fmt_pct(v: float | None) -> str:
        return f"{round(v * 100)}%" if v is not None else "n/a"

    def fmt_sent(v: float | None) -> str:
        return (f"+{v:.2f}" if v >= 0 else f"{v:.2f}") if v is not None else "n/a"

    prompt = _POLISH_PROMPT.format(
        subject_name=subject_name,
        raw_bottom_line=raw_bottom_line or "(none)",
        raw_recommended_focus=raw_recommended_focus or "(none)",
        recall_str=fmt_pct(kpis.get("ai_recall", {}).get("value")),
        sentiment_str=fmt_sent(kpis.get("avg_sentiment", {}).get("value")),
        risk_str=fmt_pct(kpis.get("risk_frame_rate", {}).get("value")),
    )

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=_POLISH_SCHEMA,
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
        )
        parsed = _json.loads(response.text or "{}")
        if not isinstance(parsed, dict):
            raise ValueError("non-object response")
    except Exception:
        return {
            "bottom_line": raw_bottom_line,
            "recommended_focus": raw_recommended_focus,
        }

    polished_bl = (parsed.get("bottom_line") or "").strip() or None
    polished_rf = (parsed.get("recommended_focus") or "").strip() or None

    # Cache the successful LLM output so we never make this call again
    # for the same (refresh, raw inputs) pair. Cache write is fire-and-
    # forget — failure here doesn't affect the response.
    if refresh_run_id is not None and subject_id is not None:
        _polish_cache_write(
            refresh_run_id, subject_id,
            raw_bottom_line, raw_recommended_focus,
            polished_bl, polished_rf,
        )

    # If LLM returned nothing usable, fall back to rule-based
    return {
        "bottom_line": polished_bl or raw_bottom_line,
        "recommended_focus": polished_rf or raw_recommended_focus,
    }


# ─── executive synthesis (Phase 3 wiring) ──────────────────────────────


def _find_takeaway(
    takeaways: list[dict[str, Any]], kind: str,
) -> dict[str, Any] | None:
    """Return the first takeaway of the given kind, or None."""
    for t in takeaways:
        if t["kind"] == kind:
            return t
    return None


def _extract_topic_from_takeaway(takeaway: dict[str, Any]) -> str | None:
    """Pull the topic label out of a takeaway's title. The strategic
    takeaway titles embed the topic, so we re-extract here rather than
    passing it through as a separate field."""
    # Title patterns from _compute_strategic_takeaways:
    #   "AI underweights {topic}"
    #   "{Topic} prompts trigger heavier criticism"  (capitalized first letter)
    #   "Strongest association: {topic}"
    title = takeaway["title"]
    if title.startswith("AI underweights "):
        return title[len("AI underweights "):]
    if title.startswith("Strongest association: "):
        return title[len("Strongest association: "):]
    if " prompts trigger heavier criticism" in title:
        return title.split(" prompts trigger heavier criticism")[0]
    return None


def _compute_bottom_line(
    subject_name: str,
    kpis: dict[str, dict[str, Any]],
    takeaways: list[dict[str, Any]],
) -> str | None:
    """One-sentence declarative summary of the refresh. Built from the
    strategic_takeaways output + the headline KPI values. Rule-based
    rather than LLM-generated so output is deterministic, free, and
    auditable. An LLM-polish pass could come later if needed.

    Cases (in order of richness):
      strong + gap → "AI strongly associates X with [asset] but
                      underweights [gap]."
      strong only  → "AI strongly associates X with [asset], with
                      [recall]% mention rate and [sentiment label] sentiment."
      gap only     → "AI underweights X on [gap topic] — only [recall]%
                      of [topic] prompts mention X."
      neither      → None (no actionable summary to synthesize)
    """
    strong = _find_takeaway(takeaways, "strongest_asset")
    gap = _find_takeaway(takeaways, "message_gap")
    strong_topic = _extract_topic_from_takeaway(strong) if strong else None
    gap_topic = _extract_topic_from_takeaway(gap) if gap else None

    if strong_topic and gap_topic:
        return (
            f"AI strongly associates {subject_name} with {strong_topic}, "
            f"but underweights {gap_topic}."
        )
    if strong_topic:
        recall = kpis.get("ai_recall", {}).get("value")
        sent = kpis.get("avg_sentiment", {}).get("value")
        sent_label = (
            "favorable" if (sent or 0) > 0.1
            else "critical" if (sent or 0) < -0.1
            else "neutral"
        )
        recall_str = (
            f"{round(recall * 100)}% mention rate"
            if recall is not None else "consistent visibility"
        )
        return (
            f"AI strongly associates {subject_name} with {strong_topic} "
            f"({recall_str}, {sent_label} sentiment)."
        )
    if gap_topic:
        return (
            f"AI underweights {subject_name} on {gap_topic} — coverage "
            f"is materially lower there than on the other tested topic areas."
        )
    return None


def _read_competitive_snapshot(
    cur, refresh_run_id: int, subject_name: str,
) -> list[dict[str, Any]]:
    """Build the Competitive Snapshot table: the focal subject + the
    top 4 competitor entities aggregated across all unnamed-layer
    responses for this refresh. Returns up to 5 rows sorted by share-
    of-voice desc, with `is_subject` flag on the focal subject's row
    so the UI can highlight it.

    SOV = share of unnamed-layer responses where the entity appears.
    Avg pos = mean rank when the entity is mentioned.
    First mention = share of unnamed-layer responses where the entity
                    appears at rank 1.

    All three metrics computed from raw mention_detection data
    (subject_mentioned/mention_rank for the focal subject;
    competitors_mentioned JSONB for everyone else). No new refreshes
    needed — the data has been there since mention_detection v1.0
    landed.
    """
    cur.execute(
        """
        SELECT
          sm.subject_mentioned,
          sm.mention_rank,
          sm.competitors_mentioned
        FROM model_responses mr
        JOIN prompts p ON p.id = mr.prompt_id
        LEFT JOIN LATERAL (
            SELECT subject_mentioned, mention_rank, competitors_mentioned
            FROM response_extractions
            WHERE model_response_id = mr.id
              AND (
                subject_mentioned IS NOT NULL
                OR competitors_mentioned IS NOT NULL
              )
            ORDER BY analysis_run_id DESC LIMIT 1
        ) sm ON TRUE
        WHERE mr.refresh_run_id = %s
          AND p.layer = 'unnamed'
          AND mr.success = TRUE
        """,
        (refresh_run_id,),
    )
    rows = cur.fetchall()
    total = len(rows)
    if total == 0:
        return []

    # Focal subject aggregation
    subject_mentions = sum(1 for r in rows if r[0])
    subject_ranks = [r[1] for r in rows if r[0] and r[1] is not None]
    subject_first = sum(1 for r in rows if r[0] and r[1] == 1)

    # Competitors: count appearances and collect ranks per name
    competitors: dict[str, dict[str, Any]] = {}
    for _, _, comps in rows:
        if not comps:
            continue
        comp_list = _maybe_json(comps) or []
        if not isinstance(comp_list, list):
            continue
        # A competitor entity might appear in the same response's list
        # more than once (the extractor's structured output sometimes
        # repeats). Dedupe within a response so a single response can't
        # double-count the same competitor's appearance.
        seen_in_response: set[str] = set()
        for c in comp_list:
            if not isinstance(c, dict):
                continue
            name = c.get("name")
            if not name or not isinstance(name, str):
                continue
            if name in seen_in_response:
                continue
            seen_in_response.add(name)
            if name not in competitors:
                competitors[name] = {"appearances": 0, "ranks": []}
            competitors[name]["appearances"] += 1
            r = c.get("rank")
            if isinstance(r, (int, float)):
                competitors[name]["ranks"].append(float(r))

    competitor_rows: list[dict[str, Any]] = []
    for name, d in competitors.items():
        ranks = d["ranks"]
        appearances = d["appearances"]
        avg_rank = sum(ranks) / len(ranks) if ranks else None
        first_count = sum(1 for r in ranks if r == 1)
        competitor_rows.append({
            "name": name,
            "sov": appearances / total,
            "avg_rank": avg_rank,
            "first_mention_rate": first_count / total,
            "is_subject": False,
        })

    competitor_rows.sort(key=lambda c: -c["sov"])
    top_competitors = competitor_rows[:4]

    # Build final table: focal subject + top 4 competitors, sorted by
    # SOV descending so the chart renders in rank order.
    table: list[dict[str, Any]] = [{
        "name": subject_name,
        "sov": subject_mentions / total,
        "avg_rank": (
            sum(subject_ranks) / len(subject_ranks)
            if subject_ranks else None
        ),
        "first_mention_rate": subject_first / total,
        "is_subject": True,
    }]
    table.extend(top_competitors)
    table.sort(key=lambda c: -c["sov"])
    return table


def _read_evidence_cards(
    cur, refresh_run_id: int, narrative_clusters: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Compose the Evidence section's cards from TopQuotesAnalyzer's
    output. Each card pulls together: the AI's verbatim quote, the
    prompt that elicited it, the mention status (for unnamed-layer
    prompts only), and the narrative cluster the response was assigned
    to (the "Frame:" label).

    Returns up to 5 cards in the order TopQuotesAnalyzer ranked them.
    Returns [] when top_quotes hasn't run on this refresh yet — handled
    as an empty state in the UI.
    """
    cur.execute(
        """
        SELECT ra.findings->'quotes'
        FROM refresh_analyses ra
        JOIN analysis_runs ar ON ar.id = ra.analysis_run_id
        WHERE ar.refresh_run_id = %s
          AND ra.analysis_type = 'top_quotes'
          AND ar.methodology_version LIKE 'cross-analysis-%%'
          AND ar.status IN ('completed', 'partial')
        ORDER BY ar.id DESC
        LIMIT 1
        """,
        (refresh_run_id,),
    )
    row = cur.fetchone()
    if not row or not row[0]:
        return []
    quotes_raw = _maybe_json(row[0]) or []
    if not isinstance(quotes_raw, list) or not quotes_raw:
        return []

    # Build response_id → cluster_name lookup so each card gets its
    # "Frame:" label without an extra DB roundtrip per quote.
    response_to_cluster: dict[int, str] = {}
    for cluster in narrative_clusters:
        for rid in cluster.get("response_ids", []) or []:
            if isinstance(rid, int):
                response_to_cluster[rid] = cluster["name"]

    response_ids = [
        q.get("model_response_id") for q in quotes_raw
        if isinstance(q, dict) and isinstance(q.get("model_response_id"), int)
    ]
    if not response_ids:
        return []

    # Bulk-fetch the source-response context for all the quoted
    # responses in one query: rendered prompt + layer + mention status.
    cur.execute(
        """
        SELECT
          mr.id,
          mr.rendered_prompt,
          p.layer,
          sm.subject_mentioned,
          sm.mention_rank
        FROM model_responses mr
        JOIN prompts p ON p.id = mr.prompt_id
        LEFT JOIN LATERAL (
            SELECT subject_mentioned, mention_rank
            FROM response_extractions
            WHERE model_response_id = mr.id
              AND subject_mentioned IS NOT NULL
            ORDER BY analysis_run_id DESC LIMIT 1
        ) sm ON TRUE
        WHERE mr.id = ANY(%s)
        """,
        (response_ids,),
    )
    by_id: dict[int, tuple] = {r[0]: r for r in cur.fetchall()}

    cards: list[dict[str, Any]] = []
    # One card per prompt. TopQuotesAnalyzer can emit multiple quotes
    # against the same prompt (e.g., a criticism + a praise frame on
    # the same "controversies" question); rendering both as separate
    # cards visually duplicates the prompt and reads like a layout
    # bug. Quotes are already ranked by importance, so keep the first
    # quote per prompt and drop the rest.
    seen_prompts: set[str] = set()
    for q in quotes_raw:
        if not isinstance(q, dict):
            continue
        mr_id = q.get("model_response_id")
        if not isinstance(mr_id, int) or mr_id not in by_id:
            continue
        _, rendered_prompt, layer, mentioned, rank = by_id[mr_id]

        prompt_key = (rendered_prompt or "").strip().lower()
        if prompt_key in seen_prompts:
            continue
        seen_prompts.add(prompt_key)

        # Mention status only meaningful on unnamed-layer responses.
        # Named-layer responses include the subject in the prompt
        # itself, so a "mentioned" pill is redundant and confusing.
        if layer == "unnamed" and mentioned is not None:
            mention_status: dict[str, Any] | None = {
                "mentioned": bool(mentioned),
                "rank": int(rank) if rank is not None else None,
            }
        else:
            mention_status = None

        cards.append({
            "model_response_id": mr_id,
            "model_slug": q.get("model_slug", "?"),
            "slot": q.get("slot", ""),
            "dimension": q.get("dimension", ""),
            "prompt_text": rendered_prompt or "",
            "excerpt": q.get("text", ""),
            "rationale": q.get("rationale", ""),
            "type": q.get("type", ""),  # characterization / criticism / etc
            "mention_status": mention_status,
            "frame_label": response_to_cluster.get(mr_id),
            "layer": layer,
        })

    return cards


def _read_narrative_clusters(
    cur, refresh_run_id: int,
) -> list[dict[str, Any]]:
    """Read the latest narrative_clusters cross-analyzer output for this
    refresh. Returns the cluster list ranked by share desc, or [] if
    the analyzer hasn't run yet.

    Computed by `NarrativeClusterAnalyzer` in `app/cross_analyzer.py` —
    one LLM call per refresh, persisted in refresh_analyses keyed by
    analysis_type='narrative_clusters'. The dashboard just reads here;
    it does not trigger the LLM call.
    """
    cur.execute(
        """
        SELECT ra.findings
        FROM refresh_analyses ra
        JOIN analysis_runs ar ON ar.id = ra.analysis_run_id
        WHERE ar.refresh_run_id = %s
          AND ra.analysis_type = 'narrative_clusters'
          AND ar.methodology_version LIKE 'cross-analysis-%%'
          AND ar.status IN ('completed', 'partial')
        ORDER BY ar.id DESC
        LIMIT 1
        """,
        (refresh_run_id,),
    )
    row = cur.fetchone()
    if not row:
        return []
    findings = _maybe_json(row[0]) or {}
    clusters = findings.get("clusters", [])
    # Cluster list is already ranked share-desc by the analyzer, but
    # defensively re-sort here so the dashboard can rely on order.
    clusters.sort(key=lambda c: -(c.get("share") or 0))
    return clusters


def _compute_recommended_focus(
    subject_name: str,
    takeaways: list[dict[str, Any]],
) -> str | None:
    """One-sentence prescriptive recommendation. Fires in two cases,
    in order of preference:

      1. Strongest Asset + Message Gap both present → the constructive
         "Connect [gap] messaging to your established [asset]" story.
      2. Opposition Frame present (with or without an asset) → the
         defensive "Address the critical framing on [topic]" pattern.
         Surfaces when AI volunteers critical framing but no
         message-gap exists to redirect toward (Heritage's case).

    Returns None when neither pattern can be assembled. Subject-name-
    aware copy, no LLM.
    """
    strong = _find_takeaway(takeaways, "strongest_asset")
    gap = _find_takeaway(takeaways, "message_gap")
    opp = _find_takeaway(takeaways, "opposition_frame")

    # Pattern 1: the connect-asset-to-gap story is the most constructive,
    # so prefer it when the data supports it.
    if strong and gap:
        strong_topic = _extract_topic_from_takeaway(strong)
        gap_topic = _extract_topic_from_takeaway(gap)
        if strong_topic and gap_topic:
            return (
                f"Connect {gap_topic} messaging to {subject_name}'s established "
                f"association with {strong_topic}."
            )

    # Pattern 2: defensive "address the criticism" when an opposition
    # frame is the dominant signal.
    if opp:
        opp_topic = _extract_topic_from_takeaway(opp)
        if opp_topic:
            # Topic comes through capitalized (the title applies
            # _cap_first); lowercase the first letter so it reads
            # naturally in the middle of a sentence.
            opp_topic_natural = (
                opp_topic[0].lower() + opp_topic[1:] if opp_topic else opp_topic
            )
            return (
                f"Address the critical framing of {subject_name} "
                f"on {opp_topic_natural} prompts."
            )

    return None


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
    # Three-case scoping, mirroring get_subject:
    #   org_id None      → no filter (Streamlit path)
    #   operator org     → own org + NULL-org seed subjects
    #   any other org    → strict to that org
    if org_id is None:
        where_subject_org = "WHERE s.id = %s"
        subject_params: tuple = (subject_id,)
    elif _is_operator_org(org_id):
        where_subject_org = "WHERE s.id = %s AND (s.org_id = %s OR s.org_id IS NULL)"
        subject_params = (subject_id, org_id)
    else:
        where_subject_org = "WHERE s.id = %s AND s.org_id = %s"
        subject_params = (subject_id, org_id)

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
                # Multiply delta by 100 so the frontend can render the
                # whole tone metric in percentage-point units. The raw
                # value (which stays -1..+1) is multiplied at display
                # time via formatPct.
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

        # ── Topic coverage (Phase 2) ────────────────────────────
        topic_coverage = _topic_coverage_for_refresh(
            cur, latest_refresh_id, setup_inputs,
        )

        # ── Strategic takeaways (Phase 2) ───────────────────────
        strategic_takeaways = _compute_strategic_takeaways(
            cur, latest_refresh_id, setup_inputs, sname, category,
        )

        # ── Executive synthesis (Phase 3 — rule-based + LLM polish) ─
        rule_bottom_line = _compute_bottom_line(sname, kpis, strategic_takeaways)
        rule_recommended_focus = _compute_recommended_focus(sname, strategic_takeaways)
        polished = _polish_executive_summary(
            sname, kpis, rule_bottom_line, rule_recommended_focus,
            refresh_run_id=latest_refresh_id,
            subject_id=sid,
        )
        bottom_line = polished["bottom_line"]
        recommended_focus = polished["recommended_focus"]

        # ── Narrative clusters (Phase 3b — read pre-computed) ───
        narrative_clusters = _read_narrative_clusters(cur, latest_refresh_id)

        # ── Evidence cards (Phase 3c — TopQuotes + cluster mapping) ─
        evidence_cards = _read_evidence_cards(
            cur, latest_refresh_id, narrative_clusters,
        )

        # ── Competitive snapshot (Phase 4 — single-subject path) ────
        competitive = _read_competitive_snapshot(
            cur, latest_refresh_id, sname,
        )

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
        "topic_coverage": topic_coverage,
        "strategic_takeaways": strategic_takeaways,
        "bottom_line": bottom_line,
        "recommended_focus": recommended_focus,
        "narrative_clusters": narrative_clusters,
        "evidence_cards": evidence_cards,
        "competitive": competitive,
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
    """Returned when the subject has no completed refreshes yet. Shape
    MUST match the populated overview exactly — the frontend reads
    nested arrays/objects without null-guards (e.g.,
    trajectory.is_historical[i]), so missing keys here translate to
    runtime errors there."""
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
        "trajectory": {
            "weeks": [],
            "refresh_ids": [],
            "is_historical": [],
            "ai_recall": [],
            "avg_sentiment": [],
            "risk_frame_rate": [],
            "citation_rate": [],
        },
        "sources": [],
        "topic_coverage": [],
        "strategic_takeaways": [],
        "bottom_line": None,
        "recommended_focus": None,
        "narrative_clusters": [],
        "evidence_cards": [],
        "competitive": [],
        "meta": {
            "latest_refresh_id": None,
            "last_refresh_at": None,
            "n_responses": 0,
            "n_platforms": 0,
            "risk_frame_threshold": 0.5,
            "canonical_url": None,
        },
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

    # Avg Sentiment uses ALL responses (named + unnamed) — sentiment
    # toward the subject is meaningful in both layers.
    # Risk Frame Rate uses UNNAMED-LAYER ONLY because the named layer
    # includes prompts that explicitly elicit criticism (e.g. "What
    # are the main criticisms of {subject}?"). Including those would
    # measure "did AI answer the criticism question?" rather than
    # "did AI volunteer a critical framing?". The unnamed-layer-only
    # version captures the latter, which is the comms-relevant signal.
    cur.execute(
        f"""
        SELECT
          AVG((s.scores->>'sentiment')::numeric),
          AVG(
            CASE WHEN (s.scores->>'criticism_severity')::numeric > %s
                 THEN 1.0 ELSE 0.0 END
          ) FILTER (WHERE p.layer = 'unnamed')
        FROM model_responses mr
        JOIN prompts p ON p.id = mr.prompt_id
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


def _kpis_per_refresh_bulk(
    cur, refresh_ids: list[int], risk_frame_threshold: float,
) -> dict[int, dict[str, float | None]]:
    """Compute AI Recall + Avg Sentiment + Risk Frame Rate + Citation
    Rate for many refreshes in three grouped queries. Returns a
    {refresh_id: {ai_recall, avg_sentiment, risk_frame_rate,
    citation_rate}} map; missing refreshes (no matching responses) get
    None values.

    Replaces N×4 queries from looping `_compute_kpis_for_refresh` with
    3 total queries. For Obama (13 refreshes) that's 52 → 3."""
    if not refresh_ids:
        return {}

    out: dict[int, dict[str, float | None]] = {
        rid: {
            "ai_recall": None,
            "avg_sentiment": None,
            "risk_frame_rate": None,
            "citation_rate": None,
        }
        for rid in refresh_ids
    }

    # AI Recall — restricted to unnamed-layer prompts. INNER JOIN to
    # the extractions lateral excludes responses without subject_mentioned.
    cur.execute(
        """
        SELECT
          mr.refresh_run_id,
          AVG(CASE WHEN sm.subject_mentioned THEN 1.0 ELSE 0.0 END)
        FROM model_responses mr
        JOIN prompts p ON p.id = mr.prompt_id
        JOIN LATERAL (
            SELECT subject_mentioned
            FROM response_extractions
            WHERE model_response_id = mr.id AND subject_mentioned IS NOT NULL
            ORDER BY analysis_run_id DESC LIMIT 1
        ) sm ON TRUE
        WHERE mr.refresh_run_id = ANY(%s)
          AND p.layer = 'unnamed'
          AND mr.success = TRUE
        GROUP BY mr.refresh_run_id
        """,
        (refresh_ids,),
    )
    for rid, recall in cur.fetchall():
        out[rid]["ai_recall"] = float(recall) if recall is not None else None

    # Avg Sentiment uses ALL responses (named + unnamed).
    # Risk Frame Rate uses UNNAMED-LAYER ONLY — see commentary in
    # _compute_kpis_for_refresh for the full rationale. Short version:
    # named-layer "criticisms-eliciting" prompts mechanically inflate
    # the rate by asking AI to enumerate criticisms.
    cur.execute(
        """
        SELECT
          mr.refresh_run_id,
          AVG((s.scores->>'sentiment')::numeric),
          AVG(
            CASE WHEN (s.scores->>'criticism_severity')::numeric > %s
                 THEN 1.0 ELSE 0.0 END
          ) FILTER (WHERE p.layer = 'unnamed')
        FROM model_responses mr
        JOIN prompts p ON p.id = mr.prompt_id
        JOIN LATERAL (
            SELECT scores
            FROM response_extractions
            WHERE model_response_id = mr.id AND scores IS NOT NULL
            ORDER BY analysis_run_id DESC LIMIT 1
        ) s ON TRUE
        WHERE mr.refresh_run_id = ANY(%s)
          AND mr.success = TRUE
        GROUP BY mr.refresh_run_id
        """,
        (risk_frame_threshold, refresh_ids),
    )
    for rid, sentiment, risk in cur.fetchall():
        out[rid]["avg_sentiment"] = float(sentiment) if sentiment is not None else None
        out[rid]["risk_frame_rate"] = float(risk) if risk is not None else None

    # Citation Rate — share of responses where AI cited the subject's
    # canonical site. Mirrors `_compute_kpis_for_refresh`'s singular
    # version but grouped across many refreshes.
    cur.execute(
        """
        SELECT
          mr.refresh_run_id,
          AVG(CASE WHEN sc.cited_own_site THEN 1.0 ELSE 0.0 END)
        FROM model_responses mr
        JOIN LATERAL (
            SELECT cited_own_site
            FROM response_extractions
            WHERE model_response_id = mr.id AND cited_own_site IS NOT NULL
            ORDER BY analysis_run_id DESC LIMIT 1
        ) sc ON TRUE
        WHERE mr.refresh_run_id = ANY(%s) AND mr.success = TRUE
        GROUP BY mr.refresh_run_id
        """,
        (refresh_ids,),
    )
    for rid, citation in cur.fetchall():
        out[rid]["citation_rate"] = float(citation) if citation is not None else None

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
    refresh_ids: list[int] = []
    is_historical: list[bool] = []
    for rid, hist, as_of, started in refreshes:
        date_val = as_of if hist else started.date()
        weeks_labels.append(date_val.isoformat())
        refresh_ids.append(rid)
        is_historical.append(hist)

    # Bulk-compute KPIs for all refreshes in 3 queries instead of N×4
    kpi_map = _kpis_per_refresh_bulk(cur, refresh_ids, risk_frame_threshold)
    ai_recall = [kpi_map.get(rid, {}).get("ai_recall") for rid in refresh_ids]
    avg_sentiment = [kpi_map.get(rid, {}).get("avg_sentiment") for rid in refresh_ids]
    risk_frame_rate = [kpi_map.get(rid, {}).get("risk_frame_rate") for rid in refresh_ids]
    citation_rate = [kpi_map.get(rid, {}).get("citation_rate") for rid in refresh_ids]

    return {
        "weeks": weeks_labels,
        "refresh_ids": refresh_ids,
        "is_historical": is_historical,
        "ai_recall": ai_recall,
        "avg_sentiment": avg_sentiment,
        "risk_frame_rate": risk_frame_rate,
        "citation_rate": citation_rate,
    }


def _canonical_domain(domain: str) -> str:
    """Collapse multi-subdomain projects to a single registrable name
    so the Sources list doesn't double-count them. Today this only
    handles language-keyed Wikimedia projects (`en.wikipedia.org`,
    `es.wikipedia.org`, `commons.wikimedia.org` → `wikipedia.org` /
    `wikimedia.org`); extend this map as additional multi-subdomain
    sources show up in the data.

    Generic public-suffix-aware collapsing isn't done — it would
    flatten distinctions that matter (e.g., `news.bbc.co.uk` vs
    `bbc.co.uk` vs `bbc.com` are arguably the same outlet but might
    want to be tracked separately in some analyses). Better to be
    explicit about the merges than apply a blanket rule.
    """
    if not domain:
        return domain
    d = domain.lower()
    if d == "wikipedia.org" or d.endswith(".wikipedia.org"):
        return "wikipedia.org"
    if d == "wikimedia.org" or d.endswith(".wikimedia.org"):
        return "wikimedia.org"
    return d


def _top_sources_for_refresh(
    cur, refresh_run_id: int, *, limit: int = 7,
) -> list[dict[str, Any]]:
    """Aggregate citations from `sources` JSONB across responses,
    rank by occurrence count, surface top N with a normalized 0-100
    'influence' score and the source_type. Subdomain variants of the
    same source (e.g. `en.wikipedia.org` + `wikipedia.org`) are
    collapsed via `_canonical_domain` before ranking — fetching
    without a SQL LIMIT so post-merge totals don't miss subdomains
    that individually fell below the cutoff."""
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
        """,
        (refresh_run_id,),
    )
    rows = cur.fetchall()
    if not rows:
        return []

    # Merge by canonical domain. Sum n_citations across subdomains;
    # take the source_type from the highest-cited variant (it's the
    # most "representative" classification).
    merged: dict[str, dict[str, Any]] = {}
    for domain, source_type, n_citations in rows:
        canon = _canonical_domain(domain)
        n = int(n_citations or 0)
        if canon not in merged:
            merged[canon] = {
                "name": canon,
                "source_type": source_type,
                "n_citations": n,
                "_top_n": n,  # tracks the largest contributor's count
            }
        else:
            merged[canon]["n_citations"] += n
            if n > merged[canon]["_top_n"]:
                merged[canon]["_top_n"] = n
                merged[canon]["source_type"] = source_type

    ranked = sorted(
        merged.values(), key=lambda r: r["n_citations"], reverse=True,
    )[:limit]
    if not ranked:
        return []
    max_n = ranked[0]["n_citations"] or 1
    return [
        {
            "name": r["name"],
            "score": round((r["n_citations"] / max_n) * 100),
            "type": (r["source_type"] or "unknown").replace("_", " ").title(),
            "n_citations": r["n_citations"],
        }
        for r in ranked
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
