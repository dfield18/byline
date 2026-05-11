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
from dashboard.lib.queries import create_subject, get_subject, list_subjects


router = APIRouter(prefix="/api/subjects", tags=["subjects"])


_VALID_CATEGORIES = {"person", "organization", "issue", "policy", "event"}


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
