"""app/api/routes/subjects.py — subject list, detail, and create endpoints.

Multi-tenancy: queries are scoped to `user.org_id` from the auth dep so
customer A can never read or write customer B's subjects. Refusal is
modeled as 404 (not 403) so the existence of someone else's subject is
not revealed.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.auth import User, current_user
from app.db import get_cursor
from dashboard.lib.queries import (
    _RECOMMENDED_ACTIONS_TYPE,
    create_subject,
    get_subject,
    get_subject_overview,
    invalidate_recommended_actions_cache,
    list_subjects,
)


router = APIRouter(prefix="/api/subjects", tags=["subjects"])


_VALID_CATEGORIES = {"person", "organization", "issue", "policy", "event"}


# Rate limits on POST /{subject_id}/refresh — a real refresh costs ~$0.11
# and takes ~60s, so we need both a per-subject cooldown (no spam-clicks
# on one subject) and a per-org cap (no spam across all subjects).
#
# Numbers are deliberately generous; tune later as we see real usage.
_REFRESH_PER_SUBJECT_COOLDOWN_MINUTES = 5
_REFRESH_PER_ORG_HOURLY_LIMIT = 20

# Cooldown between Regenerate clicks on the Recommended Actions for
# the same subject. Prevents spam-clicking the Regenerate button from
# firing back-to-back paid Gemini 2.5 Pro calls (~$0.05 each). The
# advisory lock around the LLM call serializes concurrent renders but
# does NOT bound rapid sequential clicks from a single user.
_REGENERATE_COOLDOWN_SECONDS = 30


class CreateSubjectRequest(BaseModel):
    """Subject creation payload. `setup_inputs` is the category-specific
    dict that drives prompt rendering (see prompts/*.yaml setup_inputs
    for the per-category required keys). Validation against the YAML
    schema is intentionally lenient at the API layer — the
    interactive CLI's _ensure_setup_inputs_complete will still prompt
    for missing required fields at refresh time."""

    name: str = Field(..., min_length=1, max_length=200)
    category: str = Field(..., description="One of person, organization, issue, policy, event")
    setup_inputs: dict[str, Any] = Field(default_factory=dict)


def _require_org(user: User) -> str:
    """Customer-facing endpoints require a real org_id. Operator paths
    (which don't go through these routes) can read with org_id=None."""
    if not user.org_id:
        raise HTTPException(
            status_code=403,
            detail="This endpoint requires an organization-scoped user",
        )
    return user.org_id


@router.get("")
async def list_all_subjects(user: User = Depends(current_user)):
    """List subjects owned by the requesting user's org."""
    org_id = _require_org(user)
    return list_subjects(org_id=org_id)


@router.get("/{subject_id}")
async def get_subject_detail(subject_id: int, user: User = Depends(current_user)):
    """One subject the requesting user's org owns. Returns 404 (not 403)
    if the subject exists but belongs to another org — don't leak its
    existence."""
    org_id = _require_org(user)
    s = get_subject(subject_id, org_id=org_id)
    if not s:
        raise HTTPException(status_code=404, detail=f"subject {subject_id} not found")
    return s


@router.get("/{subject_id}/overview")
async def get_overview(
    subject_id: int,
    weeks: int = 12,
    user: User = Depends(current_user),
):
    """All summary data the customer-facing Overview dashboard needs.

    Returns the latest live refresh's KPIs (AI Recall, Avg Sentiment,
    Risk Frame Rate, Citation Rate) with deltas vs the prior completed
    refresh, per-platform recall split, a weekly trajectory of those
    metrics across the most recent N refreshes (live + historical
    estimates), the top cited sources, and methodology metadata.

    See `dashboard/lib/queries.get_subject_overview` for the full data
    shape and computation rules.
    """
    org_id = _require_org(user)
    overview = get_subject_overview(subject_id, org_id=org_id, weeks=weeks)
    if not overview:
        raise HTTPException(status_code=404, detail=f"subject {subject_id} not found")
    return overview


@router.post("", status_code=201)
async def create_new_subject(
    req: CreateSubjectRequest, user: User = Depends(current_user),
):
    """Create a new subject under the requesting user's org. Returns the
    new subject so the frontend can immediately redirect to its detail
    page.

    Note: this does NOT trigger a refresh. The next step is to call
    `POST /api/subjects/{id}/refresh` (TODO — needs the async job
    pattern to land first), or run `python -m app.refresh "<name>"`
    from the CLI.
    """
    org_id = _require_org(user)

    if req.category not in _VALID_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"invalid category '{req.category}'. valid: {sorted(_VALID_CATEGORIES)}",
        )

    try:
        return create_subject(
            org_id=org_id,
            category_slug=req.category,
            name=req.name,
            setup_inputs=req.setup_inputs,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{subject_id}/refresh", status_code=202)
async def trigger_refresh(subject_id: int, user: User = Depends(current_user)):
    """Enqueue a refresh job for the subject. Returns the new job_id
    immediately — the worker process picks the job up and runs the
    refresh + analyzer + cross_analyzer chain. The frontend polls
    GET /api/jobs/{job_id} for status.

    Rate-limited to protect provider budgets:
      - per subject: 1 enqueue per _REFRESH_PER_SUBJECT_COOLDOWN_MINUTES
      - per org: _REFRESH_PER_ORG_HOURLY_LIMIT enqueues per rolling hour

    Both limits look at non-failed enqueues only (queued / running /
    succeeded). Failed jobs don't count toward the quota — a customer
    whose first attempt errors out shouldn't have to wait 5 minutes to
    retry.
    """
    org_id = _require_org(user)

    s = get_subject(subject_id, org_id=org_id)
    if not s:
        raise HTTPException(status_code=404, detail=f"subject {subject_id} not found")

    with get_cursor(commit=True) as cur:
        # Per-subject cooldown
        cur.execute(
            """
            SELECT EXTRACT(EPOCH FROM (
                NOW() - MAX(enqueued_at)
            ))::int AS seconds_since
            FROM jobs
            WHERE subject_id = %s
              AND kind = 'refresh'
              AND status IN ('queued', 'running', 'succeeded')
              AND enqueued_at > NOW() - make_interval(mins => %s)
            """,
            (subject_id, _REFRESH_PER_SUBJECT_COOLDOWN_MINUTES),
        )
        row = cur.fetchone()
        seconds_since = row[0] if row else None
        if seconds_since is not None:
            wait_s = max(
                1,
                _REFRESH_PER_SUBJECT_COOLDOWN_MINUTES * 60 - seconds_since,
            )
            raise HTTPException(
                status_code=429,
                detail=(
                    f"This subject was refreshed recently. Try again in "
                    f"~{wait_s} seconds "
                    f"(per-subject cooldown is "
                    f"{_REFRESH_PER_SUBJECT_COOLDOWN_MINUTES} minutes)."
                ),
                headers={"Retry-After": str(wait_s)},
            )

        # Per-org rolling-hour cap
        cur.execute(
            """
            SELECT COUNT(*) FROM jobs
            WHERE org_id = %s
              AND kind = 'refresh'
              AND status IN ('queued', 'running', 'succeeded')
              AND enqueued_at > NOW() - INTERVAL '1 hour'
            """,
            (org_id,),
        )
        recent_count = cur.fetchone()[0]
        if recent_count >= _REFRESH_PER_ORG_HOURLY_LIMIT:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Your organization has triggered "
                    f"{_REFRESH_PER_ORG_HOURLY_LIMIT} refreshes in the past "
                    f"hour. Wait for that window to roll over before "
                    f"triggering more."
                ),
                headers={"Retry-After": "3600"},
            )

        # Limits OK — enqueue.
        cur.execute(
            """
            INSERT INTO jobs (subject_id, org_id, kind, status)
            VALUES (%s, %s, 'refresh', 'queued')
            RETURNING id, status, enqueued_at
            """,
            (subject_id, org_id),
        )
        job_id, status, enqueued_at = cur.fetchone()

    return {
        "id": job_id,
        "subject_id": subject_id,
        "kind": "refresh",
        "status": status,
        "enqueued_at": enqueued_at.isoformat(),
    }


@router.post("/{subject_id}/recommended-actions/regenerate", status_code=204)
async def regenerate_recommended_actions(
    subject_id: int, user: User = Depends(current_user),
):
    """Drop the cached LLM recommendations for this subject's latest
    snapshot. The next page render will re-call the LLM and produce a
    fresh set of recommendations. Org-scoped; cross-org access 404s.

    Rate limit: refuses with 429 if the current cache row is younger
    than _REGENERATE_COOLDOWN_SECONDS so spam-clicking can't burn paid
    LLM calls.
    """
    org_id = _require_org(user)

    s = get_subject(subject_id, org_id=org_id)
    if not s:
        raise HTTPException(status_code=404, detail=f"subject {subject_id} not found")

    with get_cursor(commit=False) as cur:
        cur.execute(
            """
            SELECT id FROM refresh_runs
            WHERE subject_id = %s AND status = 'completed'
            ORDER BY id DESC LIMIT 1
            """,
            (subject_id,),
        )
        row = cur.fetchone()

        if row is None:
            # No snapshots yet — nothing to regenerate. 204 (no-op)
            # instead of 404 since the request itself was well-formed.
            return None

        refresh_run_id = row[0]

        # Cooldown check: how old is the current cache row? If it's
        # within the cooldown window, refuse. Reads from the
        # refresh_analyses row this regenerate would delete; if the
        # row doesn't exist (already deleted, or never written), we
        # allow the regenerate to proceed without enforcement.
        cur.execute(
            """
            SELECT EXTRACT(EPOCH FROM (NOW() - created_at))::int AS age_s
            FROM refresh_analyses
            WHERE refresh_run_id = %s AND analysis_type = %s
            ORDER BY id DESC LIMIT 1
            """,
            (refresh_run_id, _RECOMMENDED_ACTIONS_TYPE),
        )
        age_row = cur.fetchone()

    if age_row is not None and age_row[0] is not None:
        age_s = int(age_row[0])
        if age_s < _REGENERATE_COOLDOWN_SECONDS:
            wait_s = max(1, _REGENERATE_COOLDOWN_SECONDS - age_s)
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Recommendations were just generated for this "
                    f"snapshot. Try again in ~{wait_s} seconds (per-"
                    f"subject Regenerate cooldown is "
                    f"{_REGENERATE_COOLDOWN_SECONDS} seconds)."
                ),
                headers={"Retry-After": str(wait_s)},
            )

    invalidate_recommended_actions_cache(refresh_run_id)
    return None
