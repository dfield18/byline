"""app/api/routes/categories.py — category-scoped metadata.

Currently exposes the active prompt slots per category (the canonical
5+5 layout that powers the Response page's slot filter on the frontend).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.api.auth import User, current_user
from dashboard.lib.queries import list_active_slots


router = APIRouter(prefix="/api/categories", tags=["categories"])

_VALID_CATEGORIES = {"person", "organization", "issue", "policy", "event"}


@router.get("/{category_slug}/slots")
async def list_slots(category_slug: str, user: User = Depends(current_user)):
    """Active prompt slots (the 5+5 layout) for a category, ordered
    named-first then by position."""
    if category_slug not in _VALID_CATEGORIES:
        raise HTTPException(
            status_code=404,
            detail=f"category '{category_slug}' not found. valid: {sorted(_VALID_CATEGORIES)}",
        )
    return list_active_slots(category_slug)
