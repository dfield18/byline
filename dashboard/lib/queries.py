"""dashboard/lib/queries.py — read-only query layer for the internal dashboard.

All DB access for the dashboard goes through this module. Functions return
dicts/lists of plain Python values (no Streamlit imports here), which makes
them easy to test and to reuse if we ever migrate the UI off Streamlit.

Reads from the same Postgres connection as `app/db.py`.
"""
from __future__ import annotations

import json
import re
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
            "n_mentioned": b["n_mentioned"],
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
            # 1 other: compare directly by name (avoids the awkward
            #          "average across other topic areas" phrasing).
            # 2+ others: hand off to _format_comparator, which names
            #          short labels inline and buckets long labels
            #          (e.g. "figures shaping the current Republican
            #          administration") into "and N more" so a single
            #          verbose topic name doesn't blow up the sentence.
            #          Falls back to a pure count when no labels are
            #          short enough.
            if len(others) == 1:
                other = others[0]
                body = (
                    f"AI surfaces {subj_inline} in {lowest_pct}% of "
                    f"{lowest['label']} prompts, vs "
                    f"{round(other['recall'] * 100)}% on "
                    f"{other['label']} prompts."
                )
            else:
                others_named = _format_comparator([t["label"] for t in others])
                body = (
                    f"AI surfaces {subj_inline} in {lowest_pct}% of "
                    f"{lowest['label']} prompts. Recall averages "
                    f"{round(other_mean * 100)}% across {others_named}."
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
            # Per-topic recall + mean sentiment, surfaced as structured
            # fields so downstream consumers (e.g., _compute_bottom_line)
            # can quote them without re-querying or regex-parsing the
            # body string. Specific to this topic — distinct from the
            # overall kpis["ai_recall"] / ["avg_sentiment"] which
            # aggregate across the full response set.
            "recall": strong["recall"],
            "mean_sentiment": strong["mean_sentiment"],
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


def _format_list(labels: list[str]) -> str:
    """Plain-English list joiner with Oxford comma. Returns "" for
    empty, the single label for 1, "A and B" for 2, "A, B, and C"
    for 3+. Mirrors the TS `joinList` helper in the subject overview
    page so backend and frontend phrasing stay consistent."""
    if not labels:
        return ""
    if len(labels) == 1:
        return labels[0]
    if len(labels) == 2:
        return f"{labels[0]} and {labels[1]}"
    return ", ".join(labels[:-1]) + f", and {labels[-1]}"


# Topic labels above this length are bucketed into "and N more"
# rather than listed inline — keeps gap-sentence length readable
# when a topic name runs long (e.g. "figures shaping the current
# Republican administration", 54 chars).
_MAX_INLINE_LABEL_CHARS = 40
_MAX_INLINE_LABELS = 4


def _format_comparator(labels: list[str]) -> str:
    """Build the comparator phrase for a gap-led Bottom Line / Message
    Gap takeaway body. Names topics inline when their labels are
    short enough, buckets long labels into "and N more", and falls
    back to a pure count when inline naming would produce an
    unreadable sentence. Mirrors the TS `formatComparator` helper."""
    short = [l for l in labels if len(l) <= _MAX_INLINE_LABEL_CHARS]
    long_count = len(labels) - len(short)

    # No short labels, or too many topics to name even if short.
    if not short or len(short) > _MAX_INLINE_LABELS:
        return f"{len(labels)} other tracked topics"
    # All short and within the inline cap — name them all.
    if long_count == 0:
        return _format_list(short)
    # Mix: name the short ones, bucket the long ones.
    tail = f"and {long_count} more"
    if len(short) == 1:
        return f"{short[0]} {tail}"
    return f"{', '.join(short)}, {tail}"


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


# ─── recommended actions (LLM-generated concrete recommendations) ──────

# Bump suffix to invalidate every cached actions row at once after a
# meaningful prompt or schema change.
# v2: added subject role + recent_news + audience to payload; filtered
#     out "Current events" bucket from topics; added prompt guardrails
#     against assuming subject's role.
# v3: banned named publications/podcasts/journalists/conferences/
#     locations as pitch surfaces (Wikipedia still allowed); added
#     `why` field to every recommendation (short rationale tying the
#     action back to the data).
# v4: added canonical_url to the payload (gates the "own website"
#     surface); added explicit null-current_role branch to the prompt
#     so non-person subjects (organizations, issues, policies, events)
#     don't trigger fictitious-office hallucinations.
_RECOMMENDED_ACTIONS_TYPE = "recommended_actions_v4"

_RECOMMENDED_ACTIONS_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "primary": {
            "type": "OBJECT",
            "properties": {
                "label": {"type": "STRING"},
                "action": {"type": "STRING"},
                "why": {"type": "STRING"},
            },
            "required": ["label", "action", "why"],
        },
        "secondary": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "label": {"type": "STRING"},
                    "action": {"type": "STRING"},
                    "why": {"type": "STRING"},
                },
                "required": ["label", "action", "why"],
            },
        },
    },
    "required": ["primary", "secondary"],
}

_RECOMMENDED_ACTIONS_PROMPT = """You are a senior public-affairs strategist generating concrete, executable
recommendations from AI search visibility data for one tracked subject.

Your output is read by a comms director who needs to know what to DO this
week — not what the data says. Every recommendation you produce must be
something a person could put on a calendar, hand to a junior staffer, or
write into a project plan.

For each recommendation, specify:
  1. A SURFACE — where the action lands. ALLOWED surfaces include:
       - Wikipedia edits (the subject's own page, related entries, or
         pages on topics the subject is associated with). Wikipedia is
         the ONLY named outlet you may pitch directly.
       - An op-ed authored by the subject or their office, generically
         described ("an op-ed in a major foreign-policy publication,"
         "an op-ed in a national outlet covering immigration policy")
         — DO NOT name the publication.
       - A backgrounder, briefing memo, or talking points prepared for
         journalists covering a topic, generically described ("a
         backgrounder for reporters covering Latin America policy") —
         DO NOT name the journalist or outlet.
       - A statement, press release, or policy memo the subject's
         office could publish under its own banner.
       - An SEO / content update on the subject's own canonical
         website.
       - An issue brief or framing document for the subject's audience.
       - A FOIA-style information request, public-records publication,
         or congressional testimony preparation when role-appropriate.
     BANNED surfaces:
       - Specific publication names (e.g., The Guardian, PBS NewsHour,
         Foreign Affairs, Reuters, the Washington Post, the Atlantic,
         Politico, Axios, etc.). Use a generic category instead.
       - Specific podcast or radio show names.
       - Specific named journalists or hosts.
       - Specific conferences, panels, or events.
       - Specific geographic locations to "petition," "visit," or
         "lobby" (no "petition the Iowa State Capitol" or "host an
         event in Manchester, NH").
       - Specific paid ad placements or campaign-style buys.
       - Wikipedia is the SOLE exception to the named-outlet ban.
  2. AN ANGLE — the specific message or framing the surface delivers.
  3. A LEVERAGED ENTITY — at least one specific item from the input
     payload: a tracked topic name, the dominant narrative cluster
     name, a recent_news event, or Wikipedia. Reference it by name in
     the action sentence. (Source domains in `top_sources` are
     analytical context — you may reference them as "cited
     frequently by AI" or similar, but DO NOT pitch to them as
     publication targets.)

Each recommendation must also include a WHY — one sentence explaining
the reasoning for this specific move, anchored in the snapshot data
("AI rarely surfaces the subject on X," "the dominant narrative
cluster is Y," "the recent news event Z creates an opening," etc.).
The why explains the strategic logic; it should NOT just paraphrase
the action.

Hard constraints:
- Every action sentence must reference at least one specific entity by
  name from the input payload (or Wikipedia). Generic verbs without
  named entities ("improve messaging," "build presence," "amplify the
  narrative") fail this rule.
- BANNED phrases anywhere in the action or why: "messaging,"
  "alignment," "positioning," "narrative connection," "brand
  presence," "thought leadership," "awareness building," "value
  proposition," "key stakeholder." If you find yourself reaching for
  these, you're describing the data instead of prescribing an action.
- BANNED pattern: restating the visibility gap as the recommendation.
  "Close the gap on {{topic}}" is not an action. "Edit Wikipedia's
  {{topic}} page to add citations to {{recent_news_event}}" is an
  action.
- BANNED pattern: hedging verbs like "consider," "explore," "look
  into," "potentially." Use direct imperatives: edit, draft, publish,
  brief, file, prepare, update, send, request.
- One sentence per `action`. Under 30 words. The `why` is also one
  sentence, under 30 words.
- Output exactly 1 primary + 2 secondary. The primary should be the
  single highest-leverage move given this snapshot's signals;
  secondaries are alternative angles, not lower-priority versions of
  the primary.

CRITICAL — grounding in subject's actual context:
- The input payload includes `current_role` and `recent_news` describing
  what the subject is doing TODAY. Treat these as authoritative. Do NOT
  rely on prior knowledge of who the subject is, what office they
  hold, or what they've worked on historically — that knowledge may be
  out of date.
- Every recommendation must be PLAUSIBLE for the subject's current
  role as stated in the payload. A recommendation that contradicts
  the role (e.g., suggesting legislative action for someone not in
  the legislature, or campaign moves for someone not running) is a
  failure regardless of how well-crafted the surface and angle are.
- If `recent_news` describes specific events, prefer recommendations
  that connect to those events rather than generic moves on the topic.
- If a topic name in the payload sounds operational or methodological
  rather than substantive (e.g. "Current events," "General overview"),
  do NOT treat it as a real topic area to act on. Recommend on the
  named substantive topics instead.

CRITICAL — when `current_role` is null:
- A null `current_role` means the subject is NOT a person — it's an
  organization, issue, policy, or event (look at `subject_category`).
- Do NOT invent a fictitious role, office, spokesperson, or leadership
  position for the subject. Do not say "Secretary Foundation" or
  "Director of Inflation Reduction Act."
- Instead, treat `subject_category` + `subject_name` as the subject's
  identity, and lean entirely on tracked topic names + recent_news to
  ground recommendations.
- Surface choices for non-person subjects should fit the category:
    - organization: op-eds authored by its leadership (generically),
      statements published under its banner, Wikipedia edits to the
      organization's page.
    - issue: explainer briefs for journalists covering the issue,
      Wikipedia edits to the issue's page, expert commentary.
    - policy: analyst briefings on policy implementation, Wikipedia
      edits to the policy's page, FAQ updates if the subject has a
      canonical site.
    - event: backgrounders for journalists covering the event,
      Wikipedia edits to the event's page, retrospective commentary
      tied to anniversaries.

CRITICAL — when `canonical_url` is null:
- The subject does not have an owned canonical website. Do NOT
  recommend "SEO updates," "content updates on the subject's website,"
  or any action that requires controlling a website. Pick a different
  surface from the allowed list.

Output JSON only, matching this schema:
{{
  "primary": {{
    "label":  "3-5 word action label",
    "action": "one-sentence specific recommendation",
    "why":    "one-sentence rationale anchored in the snapshot data"
  }},
  "secondary": [
    {{"label": "...", "action": "...", "why": "..."}},
    {{"label": "...", "action": "...", "why": "..."}}
  ]
}}

Input data for this snapshot:
{payload_json}
"""

_FALLBACK_RECOMMENDED_ACTIONS = {
    "primary": {
        "label": "Review snapshot signals",
        "action": "Review the per-topic recall chart and Sources panel below to identify the strongest moves for this snapshot.",
        "why": "Automated recommendations were unavailable, so the next-best step is a manual scan of the dashboard's structured signals.",
    },
    "secondary": [
        {
            "label": "Audit source mix",
            "action": "Audit the Sources Shaping AI Answers section for outlets where presence could be increased.",
            "why": "Source mix shows which domains AI is drawing from and points to the venues where added content is most likely to surface.",
        },
        {
            "label": "Cross-check narrative",
            "action": "Cross-check the Dominant Narrative panel against your current public-affairs strategy.",
            "why": "The dominant narrative captures how AI is currently characterizing the subject; alignment gaps surface drift early.",
        },
    ],
    "warning": "Recommendations could not be generated for this snapshot — showing generic guidance.",
}


def _build_recommended_actions_payload(
    *,
    subject_name: str,
    subject_category: str | None,
    setup_inputs: dict[str, Any],
    kpis: dict[str, dict[str, Any]],
    topic_coverage: list[dict[str, Any]],
    narrative_clusters: list[dict[str, Any]],
    sources: list[dict[str, Any]],
    n_responses: int,
    n_platforms: int,
) -> dict[str, Any] | None:
    """Assemble the structured payload for the LLM. Returns None when
    the snapshot is too thin to recommend on (no topics scored, no
    sources, etc.) — caller falls back to generic guidance in that
    case.

    Two grounding sources surface in the payload:
      - `current_role` + `audience` from the subject's setup_inputs,
        so the LLM knows who the subject is TODAY (Cabinet member vs
        legislator vs candidate, etc.) rather than defaulting to its
        training-data prior.
      - `recent_news` from setup_inputs (truncated), so the LLM can
        connect recommendations to actual current events the subject
        is involved in.

    Topic-level filtering: the "Current events" bucket (sourced from
    recent_news prompts) is excluded from the topics passed to the
    LLM. It's not a substantive topic area a comms director should
    act on — it's an internal mechanism for testing visibility on
    whatever's in the news that week. Letting the LLM see it as a
    "topic" produces nonsense recommendations like "edit the Wikipedia
    page about Current events.\""""
    # Filter out the recent_news / "Current events" bucket — it's not
    # a real topic area, and surfacing it as one anchors the LLM on
    # the wrong thing. Real subject-matter topics are what we want
    # recommendations to act on.
    real_topics = [
        t for t in topic_coverage
        if t.get("ai_recall") is not None
        and t.get("source_field") != "recent_news"
        and t.get("label") != _RECENT_NEWS_LABEL
    ]
    if not real_topics:
        return None

    weakest = min(real_topics, key=lambda t: t["ai_recall"])
    others_sorted = sorted(
        (t for t in real_topics if t is not weakest),
        key=lambda t: -t["ai_recall"],
    )
    strongest = others_sorted[:3]

    tone_value = (kpis.get("avg_sentiment") or {}).get("value")
    if tone_value is None:
        tone_dir = "neutral"
    elif tone_value > 0.005:
        tone_dir = "positive"
    elif tone_value < -0.005:
        tone_dir = "negative"
    else:
        tone_dir = "neutral"

    # Truncate recent_news so the payload doesn't balloon. ~500 chars
    # is enough for the LLM to anchor on specific events while keeping
    # token cost predictable.
    recent_news_raw = (setup_inputs.get("recent_news") or "").strip()
    recent_news = (
        recent_news_raw[:500] + ("…" if len(recent_news_raw) > 500 else "")
        if recent_news_raw else None
    )

    return {
        "subject_name": subject_name,
        "subject_category": subject_category,
        "current_role": setup_inputs.get("role") or None,
        "audience": setup_inputs.get("audience") or None,
        # Gates the "SEO update on the subject's own canonical website"
        # surface in the prompt. When null, prompt forbids site-update
        # recommendations (otherwise the LLM cheerfully suggests
        # updating a site the subject doesn't own).
        "canonical_url": setup_inputs.get("canonical_url") or None,
        "recent_news": recent_news,
        "weakest_topic": {
            "name": weakest["label"],
            "mention_rate": round(weakest["ai_recall"], 3),
            "raw_fraction": f"{weakest['n_mentioned']}/{weakest['n_responses']}",
        },
        "strongest_topics": [
            {"name": t["label"], "mention_rate": round(t["ai_recall"], 3)}
            for t in strongest
        ],
        "dominant_narrative_cluster": (
            {
                "name": narrative_clusters[0]["name"],
                "share": round(narrative_clusters[0].get("share", 0), 3),
            }
            if narrative_clusters else None
        ),
        "top_sources": [
            {
                "domain": s["name"],
                "influence_score": s.get("score"),
                "type": s.get("type"),
            }
            for s in sources[:7]
        ],
        "average_tone": {
            "value": round(tone_value, 3) if tone_value is not None else None,
            "direction": tone_dir,
        },
        "n_responses": n_responses,
        "n_platforms": n_platforms,
    }


_GROUNDING_HYPHEN_SPACE_CLASS = r"[\s\-]+"
"""Regex character class used inside grounding patterns to make
hyphens and whitespace interchangeable. See `_grounding_pattern_for`
for context."""


def _grounding_pattern_for(entity: str) -> str:
    """Build a word-boundary regex pattern for one grounding entity.

    Behavior:
    - Word boundary (`\\b`) on both ends — entity must appear as a
      standalone token, not as a fragment ("trade" doesn't match
      "trade-off").
    - Hyphens and whitespace inside the entity become
      `[\\s\\-]+` so the LLM's hyphen/space normalization doesn't
      cause spurious grounding failures. "post-presidency" matches
      both "post-presidency" and "post presidency"; "US foreign
      policy" matches both that and "US-foreign-policy".
    - Other punctuation (periods, ampersands, apostrophes, etc.)
      stays strict via re.escape — easier to fix at the prompt
      level if specific cases come up than to risk over-matching.
    """
    escaped = re.escape(entity)
    # re.escape escapes both `-` and space (space is escaped on
    # Python 3.7+ for safety). Replace both escaped forms with the
    # flexible separator class.
    flexible = escaped.replace(r"\-", _GROUNDING_HYPHEN_SPACE_CLASS)
    flexible = flexible.replace(r"\ ", _GROUNDING_HYPHEN_SPACE_CLASS)
    # Older Python re.escape didn't escape space; cover that too.
    flexible = flexible.replace(" ", _GROUNDING_HYPHEN_SPACE_CLASS)
    return r"\b" + flexible + r"\b"


_GROUNDING_MIN_ENTITY_LEN = 3
"""Minimum character length for an entity to count toward the
grounding check. Below this threshold (e.g. acronyms like 'AI',
'US', or stop-word topic names like 'a', 'to') the entity would
trivially appear in unrelated text and produce false positives even
under word-boundary matching, so we exclude them rather than rely on
them as grounding signals."""


def _validate_actions_grounding(
    actions: dict[str, Any], payload: dict[str, Any],
) -> bool:
    """Check that every action sentence references at least one
    specific entity by name from the payload using a word-boundary
    regex match (case-insensitive).

    Word-boundary matching (not bare substring) prevents false
    positives that the prior implementation accepted:
      - "trade" entity matching "trade-off" in unrelated text
      - "ap.org" entity matching "map" or "snap"
      - "Policy" topic name passing virtually any policy-adjacent
        sentence (now it must appear as a standalone word)

    Entities shorter than `_GROUNDING_MIN_ENTITY_LEN` chars are
    dropped — too generic to ground reliably even with boundary
    matching ("AI", "US", "EU" would still trivially appear in any
    serious comms recommendation).

    Returns True when there are no valid entities to ground against
    (extremely sparse payload) — the action sentences pass trivially
    rather than getting rejected for an issue that isn't the LLM's
    fault. Otherwise: every action sentence must contain at least
    one valid entity as a whole word/phrase."""
    raw_entities: list[str] = []
    weakest = payload.get("weakest_topic") or {}
    if weakest.get("name"):
        raw_entities.append(str(weakest["name"]).strip())
    for t in payload.get("strongest_topics") or []:
        if t.get("name"):
            raw_entities.append(str(t["name"]).strip())
    cluster = payload.get("dominant_narrative_cluster") or {}
    if cluster.get("name"):
        raw_entities.append(str(cluster["name"]).strip())
    for s in payload.get("top_sources") or []:
        if s.get("domain"):
            raw_entities.append(str(s["domain"]).strip())

    # Length filter + dedupe (case-insensitive) so duplicate entities
    # don't slow the matching loop.
    seen: set[str] = set()
    valid_entities: list[str] = []
    for ent in raw_entities:
        if len(ent) < _GROUNDING_MIN_ENTITY_LEN:
            continue
        key = ent.lower()
        if key in seen:
            continue
        seen.add(key)
        valid_entities.append(ent)

    if not valid_entities:
        return True  # nothing to ground against; pass

    # Compile boundary-match patterns once. re.escape handles
    # entities containing periods, hyphens, ampersands, etc.
    # Post-escape, we relax hyphens and spaces to mean "either a
    # hyphen or whitespace" so the LLM's frequent normalization
    # ("post-presidency" ↔ "post presidency", "US foreign policy" ↔
    # "US-foreign-policy") doesn't trigger spurious grounding
    # failures + retries. Entities WITHOUT a hyphen or space stay
    # strict — e.g., "trade" still rejects "trade-off" via the word
    # boundary, since the entity's pattern is just `\btrade\b` with
    # no flexible separator.
    patterns = [
        re.compile(_grounding_pattern_for(ent), re.IGNORECASE)
        for ent in valid_entities
    ]

    actions_to_check = [actions.get("primary") or {}] + list(
        actions.get("secondary") or []
    )
    for a in actions_to_check:
        text = a.get("action") or ""
        if not any(p.search(text) for p in patterns):
            return False
    return True


def _shape_actions(parsed: Any) -> dict[str, Any] | None:
    """Coerce parsed JSON to the expected shape: 1 primary +
    exactly 2 secondary, with non-empty label/action/why on each.
    Returns None on shape mismatch."""
    if not isinstance(parsed, dict):
        return None
    primary = parsed.get("primary")
    secondary = parsed.get("secondary")
    if not isinstance(primary, dict) or not isinstance(secondary, list):
        return None
    if len(secondary) != 2:
        return None
    def _ok(a: Any) -> bool:
        return (
            isinstance(a, dict)
            and isinstance(a.get("label"), str) and a["label"].strip()
            and isinstance(a.get("action"), str) and a["action"].strip()
            and isinstance(a.get("why"), str) and a["why"].strip()
        )
    if not _ok(primary):
        return None
    if not all(_ok(s) for s in secondary):
        return None
    return {
        "primary": {
            "label":  primary["label"].strip(),
            "action": primary["action"].strip(),
            "why":    primary["why"].strip(),
        },
        "secondary": [
            {
                "label":  s["label"].strip(),
                "action": s["action"].strip(),
                "why":    s["why"].strip(),
            }
            for s in secondary
        ],
    }


# Postgres advisory-lock class for the Recommended Actions cache
# window. `pg_advisory_xact_lock(class, refresh_run_id)` serializes
# concurrent renders for the same refresh — the first one fires the
# Gemini call and writes the cache row; the second waits on the lock,
# re-checks cache inside the lock, finds the row, and returns it
# without firing its own (paid) LLM call. Reserve class 1 for this
# system; new advisory-lock users in the future should pick distinct
# classes to avoid collisions.
_LOCK_CLASS_RECOMMENDED_ACTIONS = 1


def _recommended_actions_cache_read(
    refresh_run_id: int, payload: dict[str, Any],
) -> dict[str, Any] | None:
    """Return cached actions for this refresh if the cached input
    payload matches the current one. Mismatch (snapshot data changed
    since the LLM call) returns None and forces regeneration."""
    try:
        with get_cursor(commit=False) as cur:
            cur.execute(
                """
                SELECT findings FROM refresh_analyses
                WHERE refresh_run_id = %s AND analysis_type = %s
                ORDER BY id DESC LIMIT 1
                """,
                (refresh_run_id, _RECOMMENDED_ACTIONS_TYPE),
            )
            row = cur.fetchone()
    except Exception:
        return None
    if not row:
        return None
    findings = _maybe_json(row[0]) or {}
    cached_payload = findings.get("payload")
    if cached_payload != payload:
        return None
    actions = findings.get("actions")
    if not isinstance(actions, dict):
        return None
    return {
        "actions": actions,
        "warning": findings.get("warning"),
    }


def _recommended_actions_cache_write(
    refresh_run_id: int,
    subject_id: int,
    payload: dict[str, Any],
    actions: dict[str, Any],
    warning: str | None,
) -> None:
    """Persist actions keyed by refresh. Same DELETE-then-INSERT
    pattern as polish so the table holds at most one row per
    (refresh_run_id, analysis_type). Errors swallowed — a cache write
    failure must not break page render."""
    try:
        with get_cursor(commit=True) as cur:
            cur.execute(
                """
                SELECT id FROM analysis_runs
                WHERE refresh_run_id = %s
                ORDER BY id DESC LIMIT 1
                """,
                (refresh_run_id,),
            )
            row = cur.fetchone()
            if not row:
                return
            analysis_run_id = row[0]
            cur.execute(
                """
                DELETE FROM refresh_analyses
                WHERE refresh_run_id = %s AND analysis_type = %s
                """,
                (refresh_run_id, _RECOMMENDED_ACTIONS_TYPE),
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
                    _RECOMMENDED_ACTIONS_TYPE,
                    Json({
                        "payload": payload,
                        "actions": actions,
                        "warning": warning,
                    }),
                    _RECOMMENDED_ACTIONS_TYPE,
                ),
            )
    except Exception:
        pass


def invalidate_recommended_actions_cache(refresh_run_id: int) -> None:
    """Public API: drop the cached actions row for a refresh so the
    next page render regenerates from the LLM. Called by the
    'Regenerate' button's server action."""
    try:
        with get_cursor(commit=True) as cur:
            cur.execute(
                """
                DELETE FROM refresh_analyses
                WHERE refresh_run_id = %s AND analysis_type = %s
                """,
                (refresh_run_id, _RECOMMENDED_ACTIONS_TYPE),
            )
    except Exception:
        pass


def _compute_recommended_actions(
    *,
    refresh_run_id: int | None,
    subject_id: int | None,
    subject_name: str,
    subject_category: str | None,
    setup_inputs: dict[str, Any],
    kpis: dict[str, dict[str, Any]],
    topic_coverage: list[dict[str, Any]],
    narrative_clusters: list[dict[str, Any]],
    sources: list[dict[str, Any]],
    n_responses: int,
    n_platforms: int,
) -> dict[str, Any]:
    """Generate concrete, executable recommendations from snapshot data
    via Gemini 2.5 Pro. Output: {primary, secondary, warning?}.

    Caching: keyed on (refresh_run_id, payload-shape). When the cached
    payload exactly matches the current snapshot's payload, returns
    cached actions without an LLM call. Any mismatch (new snapshot,
    schema change, manual invalidation) regenerates.

    Concurrency: when `refresh_run_id` is present, the read → LLM call
    → write window is serialized via a Postgres advisory lock keyed on
    (class=1, refresh_run_id). The first concurrent render fires the
    LLM call and writes the cache row; the second blocks on the lock,
    re-checks cache inside the lock, finds the freshly-written row,
    and returns it without firing a second (paid) LLM call. The lock
    auto-releases on transaction commit/rollback.

    Caveat: the LLM call (5-15s) happens with a DB connection open and
    the advisory lock held. Acceptable for typical render volume.
    If connection-pool pressure becomes a problem under load, the
    natural next step is precomputing actions in the worker when a
    refresh completes (decoupling generation from page render entirely).

    Failure handling: any exception path returns the subject-agnostic
    fallback. Two LLM attempts maximum (initial + one stricter retry
    when the first response fails grounding validation)."""
    payload = _build_recommended_actions_payload(
        subject_name=subject_name,
        subject_category=subject_category,
        setup_inputs=setup_inputs,
        kpis=kpis,
        topic_coverage=topic_coverage,
        narrative_clusters=narrative_clusters,
        sources=sources,
        n_responses=n_responses,
        n_platforms=n_platforms,
    )
    if payload is None:
        return _FALLBACK_RECOMMENDED_ACTIONS

    # LLM provider availability — checked before opening any
    # connection so we fail fast without holding a slot for nothing.
    try:
        import json as _json
        import os
        from google import genai
        from google.genai import types
    except ImportError:
        return _FALLBACK_RECOMMENDED_ACTIONS

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return _FALLBACK_RECOMMENDED_ACTIONS

    base_prompt = _RECOMMENDED_ACTIONS_PROMPT.format(
        payload_json=_json.dumps(payload, indent=2),
    )

    def _call(prompt: str) -> dict[str, Any] | None:
        try:
            # http_options.timeout is in milliseconds. 45s gives the
            # 2048-thinking-budget call enough headroom (typical
            # latency is 5-15s; tail can stretch to 20-30s under
            # quota pressure) while still failing fast on a hung
            # connection — which is the failure mode the advisory
            # lock around this call cannot tolerate (held lock +
            # held DB connection if the call never returns).
            client = genai.Client(
                api_key=api_key,
                http_options=types.HttpOptions(timeout=45_000),
            )
            response = client.models.generate_content(
                model="gemini-2.5-pro",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=_RECOMMENDED_ACTIONS_SCHEMA,
                    thinking_config=types.ThinkingConfig(thinking_budget=2048),
                ),
            )
            parsed = _json.loads(response.text or "{}")
            return _shape_actions(parsed)
        except Exception:
            return None

    def _run_llm_with_retry() -> dict[str, Any] | None:
        """Initial call + one stricter retry on grounding failure.
        Returns valid actions dict on success, None on total failure."""
        actions = _call(base_prompt)
        if actions is not None and _validate_actions_grounding(actions, payload):
            return actions
        retry_prompt = base_prompt + (
            "\n\nYour previous response did not reference any specific entity "
            "from the input data. Every action MUST mention a specific source "
            "domain, topic name, or narrative cluster name from the payload "
            "above, by name. Try again."
        )
        retry_actions = _call(retry_prompt)
        if retry_actions is not None and _validate_actions_grounding(
            retry_actions, payload,
        ):
            return retry_actions
        return None

    # Synthetic/no-cache path: a render without a refresh_run_id can't
    # cache anything, so skip the lock and call the LLM directly.
    if refresh_run_id is None:
        actions = _run_llm_with_retry()
        return actions if actions is not None else _FALLBACK_RECOMMENDED_ACTIONS

    # Cached + locked path. Everything from the cache re-check to the
    # cache write runs inside one transaction holding the advisory lock,
    # so concurrent renders for the same refresh_run_id serialize:
    # second render blocks → first finishes & writes → second wakes
    # up, finds the cached row, skips its LLM call.
    try:
        with get_cursor(commit=True) as cur:
            # Session-level timeouts before the lock acquisition:
            #
            #   lock_timeout       — cap the time we'll wait at the
            #                        `pg_advisory_xact_lock` call below.
            #                        Without this, a wedged peer holding
            #                        the lock could make us wait
            #                        indefinitely.
            #   statement_timeout  — cap individual SQL statements.
            #                        Doesn't cancel the Python-side LLM
            #                        call (that's bounded by the
            #                        HttpOptions(timeout=...) in
            #                        genai.Client), but does cancel any
            #                        SQL within this transaction that
            #                        runs longer than expected.
            #
            # Both are SET LOCAL so they revert at transaction end and
            # don't affect other code paths sharing the connection.
            cur.execute("SET LOCAL lock_timeout = '30s'")
            cur.execute("SET LOCAL statement_timeout = '60s'")
            cur.execute(
                "SELECT pg_advisory_xact_lock(%s, %s)",
                (_LOCK_CLASS_RECOMMENDED_ACTIONS, refresh_run_id),
            )

            # Re-check cache inside the lock. The row may have been
            # populated by a concurrent render while we were waiting
            # on the lock — if so, return its result and skip the
            # LLM call entirely.
            cur.execute(
                """
                SELECT findings FROM refresh_analyses
                WHERE refresh_run_id = %s AND analysis_type = %s
                ORDER BY id DESC LIMIT 1
                """,
                (refresh_run_id, _RECOMMENDED_ACTIONS_TYPE),
            )
            row = cur.fetchone()
            if row is not None:
                findings = _maybe_json(row[0]) or {}
                cached_payload = findings.get("payload")
                if cached_payload == payload:
                    cached_actions = findings.get("actions")
                    if isinstance(cached_actions, dict):
                        out = dict(cached_actions)
                        if findings.get("warning"):
                            out["warning"] = findings["warning"]
                        return out

            # Cache miss inside the lock → we're the first/only writer
            # for this (refresh, payload). Fire the LLM call.
            actions = _run_llm_with_retry()
            if actions is None:
                return _FALLBACK_RECOMMENDED_ACTIONS

            # Write the cache row inside the same transaction. DELETE
            # any stale row (different payload-shape from an earlier
            # render); INSERT the fresh one. Both under the lock so
            # no other writer can interleave.
            if subject_id is not None:
                cur.execute(
                    """
                    SELECT id FROM analysis_runs
                    WHERE refresh_run_id = %s
                    ORDER BY id DESC LIMIT 1
                    """,
                    (refresh_run_id,),
                )
                ar_row = cur.fetchone()
                if ar_row is not None:
                    analysis_run_id = ar_row[0]
                    # Sweep up orphan rows from prior cache versions
                    # for THIS refresh. The partial unique index
                    # constrains (refresh_run_id, analysis_type) so
                    # different version strings co-exist legally —
                    # `recommended_actions_v3` and v4 can both live
                    # in the table for the same refresh. That's how
                    # storage waste accumulates over version bumps.
                    # Self-cleaning at write time keeps the table
                    # tidy without a separate cleanup job. Bounded
                    # to this refresh's rows so it stays cheap.
                    cur.execute(
                        """
                        DELETE FROM refresh_analyses
                        WHERE refresh_run_id = %s
                          AND analysis_type LIKE 'recommended_actions_%%'
                          AND analysis_type != %s
                        """,
                        (refresh_run_id, _RECOMMENDED_ACTIONS_TYPE),
                    )
                    # INSERT ... ON CONFLICT DO UPDATE, leveraging the
                    # partial unique index `idx_recommended_actions_unique`
                    # on (refresh_run_id, analysis_type) WHERE
                    # analysis_type LIKE 'recommended_actions_%'. The
                    # advisory lock above already serializes writers,
                    # but the upsert pattern makes the write idempotent
                    # under any race that bypasses the lock, and
                    # guarantees the table holds at most one row per
                    # (refresh, type) by schema rather than by
                    # convention.
                    #
                    # `created_at = clock_timestamp()` on UPDATE so the
                    # Regenerate cooldown's age check measures time
                    # since the actual wall-clock write moment.
                    #
                    # `NOW()` (and `CURRENT_TIMESTAMP`) return the
                    # transaction START time. Since this transaction
                    # holds the advisory lock across a 5-15s LLM call,
                    # `NOW()` would back-date the write by however
                    # long the call took — effectively shortening the
                    # Regenerate cooldown by the same amount. The same
                    # pitfall already bit the worker's job timing
                    # (STATE.md / Phase B: switched job started_at /
                    # completed_at writes to clock_timestamp() for the
                    # same reason).
                    # The `WHERE analysis_type LIKE 'recommended_actions_%%'`
                    # predicate selects the matching partial unique index
                    # (`idx_recommended_actions_unique` from migration
                    # 011) for ON CONFLICT inference. The predicate text
                    # MUST match the index's WHERE clause exactly.
                    #
                    # The `%%` (double percent) is psycopg's escape for a
                    # literal `%` inside a parameterized query — psycopg
                    # treats `%s` as a placeholder, so we double the
                    # literal percents to disambiguate. After psycopg
                    # substitutes parameters, the SQL Postgres actually
                    # receives is `... LIKE 'recommended_actions_%'`,
                    # which matches the index's predicate.
                    #
                    # If you ever copy this SQL to run manually (psql,
                    # ORM, etc.), strip one of the percents back to a
                    # single `%`, or you'll get "there is no unique or
                    # exclusion constraint matching the ON CONFLICT
                    # specification". Alternative form that avoids the
                    # escape: `ON CONFLICT ON CONSTRAINT
                    # idx_recommended_actions_unique DO UPDATE …`.
                    cur.execute(
                        """
                        INSERT INTO refresh_analyses (
                            analysis_run_id, refresh_run_id, subject_id,
                            analysis_type, findings, methodology_version
                        ) VALUES (%s, %s, %s, %s, %s, %s)
                        ON CONFLICT (refresh_run_id, analysis_type)
                        WHERE analysis_type LIKE 'recommended_actions_%%'
                        DO UPDATE SET
                            analysis_run_id = EXCLUDED.analysis_run_id,
                            subject_id = EXCLUDED.subject_id,
                            findings = EXCLUDED.findings,
                            methodology_version = EXCLUDED.methodology_version,
                            created_at = clock_timestamp()
                        """,
                        (
                            analysis_run_id,
                            refresh_run_id,
                            subject_id,
                            _RECOMMENDED_ACTIONS_TYPE,
                            Json({
                                "payload": payload,
                                "actions": actions,
                                "warning": None,
                            }),
                            _RECOMMENDED_ACTIONS_TYPE,
                        ),
                    )

            return actions
    except Exception:
        # If the DB layer fails (connection error, lock acquisition
        # timeout, etc.), fall back to a naked LLM call without cache.
        # Better to pay for an extra LLM call than break the page.
        actions = _run_llm_with_retry()
        return actions if actions is not None else _FALLBACK_RECOMMENDED_ACTIONS


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
        # Quote the PER-TOPIC recall + sentiment from the strongest_asset
        # takeaway (those values pertain to `strong_topic` specifically),
        # NOT the overall kpis["ai_recall"] / ["avg_sentiment"] (which
        # aggregate across the full response set). Using the overall
        # numbers here produced sentences like "AI strongly associates
        # X with TOPIC (90% mention rate)" where 90% was the cross-topic
        # average — a reader naturally parses the % as the rate on the
        # named topic, which it isn't. Falls back to the overall recall
        # only if the takeaway didn't carry a structured value (older
        # cached strongest_asset rows without the `recall` field).
        recall = strong.get("recall")
        if recall is None:
            recall = kpis.get("ai_recall", {}).get("value")
        sent = strong.get("mean_sentiment")
        if sent is None:
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

    # ── Recommended actions (LLM-generated, post-cursor close) ──
    # Outside the `with get_cursor` block: _compute_recommended_actions
    # opens its own short-lived connections for cache read/write so the
    # ~5–15s LLM call doesn't hold the page-render cursor open.
    recommended_actions = _compute_recommended_actions(
        refresh_run_id=latest_refresh_id,
        subject_id=sid,
        subject_name=sname,
        subject_category=category,
        setup_inputs=setup_inputs,
        kpis=kpis,
        topic_coverage=topic_coverage,
        narrative_clusters=narrative_clusters,
        sources=sources,
        n_responses=n_responses,
        n_platforms=n_platforms,
    )

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
        "recommended_actions": recommended_actions,
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
        "recommended_actions": _FALLBACK_RECOMMENDED_ACTIONS,
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
    # Strip leading `www.` so `pbs.org` and `www.pbs.org` aren't
    # treated as two distinct sources. AI assistants cite the same
    # underlying site with/without the prefix interchangeably; from
    # the dashboard reader's standpoint they're one source. Done
    # before the Wikimedia checks so a `www.wikipedia.org` (rare but
    # possible) is normalized too.
    if d.startswith("www."):
        d = d[4:]
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
        -- Tiebreak by domain ASC so the row order is fully deterministic.
        -- Without this, two domains tied on citation count flip
        -- positions arbitrarily between calls — fine for display but
        -- catastrophic for the Recommended Actions cache key, which
        -- includes the full payload (incl. top_sources) via JSON
        -- equality. Order flips → JSON mismatch → cache miss → paid
        -- Gemini 2.5 Pro call on every page render.
        ORDER BY n_citations DESC, domain ASC
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
            # Fallback label for sources whose source_type classifier
            # returned null — renamed from "Unknown" to "Other" per
            # user request (reads cleaner in the donut category list
            # and the Sources table type column).
            "type": (r["source_type"] or "other").replace("_", " ").title(),
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
