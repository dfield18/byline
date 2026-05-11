"""app/api/routes/responses.py — single model_response detail.

Returns one response with all six extractor outputs aggregated across
analysis_runs (latest non-null per column).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.api.auth import User, current_user
from dashboard.lib.queries import get_response


router = APIRouter(prefix="/api/responses", tags=["responses"])


@router.get("/{model_response_id}")
async def get_response_detail(
    model_response_id: int, user: User = Depends(current_user),
):
    """One model_response with prompt, response text, all extractor
    outputs, and citations metadata."""
    r = get_response(model_response_id)
    if not r:
        raise HTTPException(
            status_code=404,
            detail=f"model_response {model_response_id} not found",
        )
    return r
