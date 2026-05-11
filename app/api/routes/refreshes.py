"""app/api/routes/refreshes.py — refresh-scoped data endpoints.

A refresh is the unit of "one run of all prompts × all models for a
subject." This module exposes its child data: the model responses (with
their extractions) and the cross-analyzer findings.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.api.auth import User, assert_refresh_in_org, current_user
from dashboard.lib.queries import get_cross_findings, get_refresh_responses


router = APIRouter(prefix="/api/refreshes", tags=["refreshes"])


@router.get("/{refresh_run_id}/responses")
async def list_refresh_responses(
    refresh_run_id: int, user: User = Depends(current_user),
):
    """All successful model_responses in a refresh, with their per-response
    extractor outputs aggregated latest-non-null across analysis_runs
    (the same semantics the dashboard uses).

    Multi-tenancy: 404s if the refresh's subject doesn't belong to the
    caller's org. Don't leak existence of refreshes the caller can't
    see."""
    assert_refresh_in_org(refresh_run_id, user)
    rows = get_refresh_responses(refresh_run_id)
    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"refresh_run {refresh_run_id} has no successful responses",
        )
    return rows


@router.get("/{refresh_run_id}/findings")
async def list_cross_findings(
    refresh_run_id: int, user: User = Depends(current_user),
):
    """Cross-analyzer findings (asymmetry / top_quotes / share_of_voice /
    narrative_drift) for the refresh, from the latest cross_analyzer
    pass. Returns [] if no cross_analyzer has run yet."""
    assert_refresh_in_org(refresh_run_id, user)
    return get_cross_findings(refresh_run_id)
