"""app/public_demo.py — shared constants + maintenance for the public "try it"
flow.

The try-it endpoints create throwaway subjects in a dedicated public org. This
module owns that org constant (single source of truth, imported by the API
route) and the periodic prune the worker runs to delete stale throwaway
subjects so they don't accumulate forever.
"""
from __future__ import annotations

import logging

from app.db import get_cursor

logger = logging.getLogger(__name__)

# All throwaway try-subjects live here, walled off from real customer tenancy.
ORG_PUBLIC_TRY = "org_public_try"

# How long a try-subject is kept after its last refresh (or creation if never
# refreshed). Comfortably longer than the 7-day reuse cache so a cached topic is
# never pruned out from under a returning visitor.
TRY_TTL_DAYS = 14

# Tables that reference subjects, in child-before-parent delete order so the
# NO ACTION foreign keys are satisfied. Every one carries a subject_id column.
_DELETE_ORDER = (
    "response_extractions",
    "refresh_analyses",
    "model_responses",
    "analysis_runs",
    "jobs",
    "refresh_runs",
)


def prune_old_try_subjects(ttl_days: int = TRY_TTL_DAYS) -> int:
    """Delete public try-subjects with no activity in `ttl_days`. Returns the
    number of subjects removed. Scoped strictly to ORG_PUBLIC_TRY so it can
    never touch a real customer's subject."""
    with get_cursor(commit=True) as cur:
        cur.execute(
            """
            SELECT s.id
            FROM subjects s
            WHERE s.org_id = %s
              AND COALESCE(
                    (SELECT max(rr.started_at) FROM refresh_runs rr
                     WHERE rr.subject_id = s.id),
                    s.created_at
                  ) < NOW() - make_interval(days => %s)
            """,
            (ORG_PUBLIC_TRY, ttl_days),
        )
        ids = [r[0] for r in cur.fetchall()]
        if not ids:
            return 0

        for table in _DELETE_ORDER:
            cur.execute(
                f"DELETE FROM {table} WHERE subject_id = ANY(%s)",  # noqa: S608 (table is a fixed literal)
                (ids,),
            )
        cur.execute("DELETE FROM subjects WHERE id = ANY(%s)", (ids,))

    logger.info("Pruned %d stale try-subject(s) (ttl=%dd).", len(ids), ttl_days)
    return len(ids)
