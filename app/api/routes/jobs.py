"""app/api/routes/jobs.py — async job status endpoint.

Jobs are enqueued by other routes (today: POST /api/subjects/{id}/refresh
in subjects.py) and executed by the worker process (app.worker). The
frontend polls this endpoint every 1-2 seconds until status flips to
`succeeded` or `failed`.

Multi-tenancy: jobs are scoped to user.org_id. The worker stores org_id
on the row at enqueue time, so this endpoint can filter without a join.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.api.auth import User, current_user
from app.db import get_cursor


router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/{job_id}")
async def get_job(job_id: int, user: User = Depends(current_user)):
    """Return current status of a job. Returns 404 (not 403) if the job
    exists but belongs to another org — don't leak its existence."""
    if not user.org_id:
        raise HTTPException(
            status_code=403,
            detail="This endpoint requires an organization-scoped user",
        )

    with get_cursor(commit=False) as cur:
        cur.execute(
            """
            SELECT id, subject_id, org_id, kind, status,
                   enqueued_at, started_at, completed_at,
                   error, refresh_run_id, result
            FROM jobs
            WHERE id = %s
            """,
            (job_id,),
        )
        row = cur.fetchone()

    if not row or row[2] != user.org_id:
        raise HTTPException(status_code=404, detail=f"job {job_id} not found")

    return {
        "id": row[0],
        "subject_id": row[1],
        "org_id": row[2],
        "kind": row[3],
        "status": row[4],
        "enqueued_at": row[5].isoformat() if row[5] else None,
        "started_at": row[6].isoformat() if row[6] else None,
        "completed_at": row[7].isoformat() if row[7] else None,
        "error": row[8],
        "refresh_run_id": row[9],
        "result": row[10],
    }
