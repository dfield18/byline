"""app/api/routes/subjects.py — subject list + detail endpoints.

Mirrors `dashboard/lib/queries.list_subjects` and `get_subject`. Reads
only; subject creation/refresh-trigger endpoints will land in a
separate `subjects_write.py` (or here when they're added).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.api.auth import User, current_user
from dashboard.lib.queries import get_subject, list_subjects


router = APIRouter(prefix="/api/subjects", tags=["subjects"])


@router.get("")
async def list_all_subjects(user: User = Depends(current_user)):
    """List every subject the caller can see. v0: no per-user filtering;
    once `subjects.org_id` lands, filter to `user.org_id`."""
    return list_subjects()


@router.get("/{subject_id}")
async def get_subject_detail(subject_id: int, user: User = Depends(current_user)):
    """One subject with its setup_inputs + refresh history."""
    s = get_subject(subject_id)
    if not s:
        raise HTTPException(status_code=404, detail=f"subject {subject_id} not found")
    return s
