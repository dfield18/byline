"""app/api/routes/prompts.py — prompt preview endpoint.

POST /api/prompts/preview runs a prompt once against the selected models and
returns per-model results (raw response + sentiment + subject-mention signal)
WITHOUT persisting anything. Scoring reuses the exact scheduled-pipeline
scorer via app.prompt_preview.run_prompt_against_models (no drift).
"""
from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.auth import User, current_user
from app.prompt_preview import (
    ModelRunResult,
    resolve_model_specs,
    run_prompt_against_models,
)


router = APIRouter(prefix="/api/prompts", tags=["prompts"])


# ─── request / response ────────────────────────────────────────────────


class PromptPreviewRequest(BaseModel):
    text: str = Field(min_length=10)
    models: list[str] = Field(min_length=1)
    subject: str = Field(min_length=1)  # the client/entity this prompt is about


class PromptPreviewResponse(BaseModel):
    results: list[ModelRunResult]


# ─── rate limit ────────────────────────────────────────────────────────
#
# Light per-user fixed-window limiter so preview can't be used to run
# unbounded free model calls. In-memory + per-process (resets on restart,
# not shared across workers) — adequate as a guardrail for a low-volume,
# auth-gated endpoint; swap for a shared store (Redis) if the API scales out.

_PREVIEW_LIMIT = 10          # previews
_PREVIEW_WINDOW_S = 60.0     # per minute, per user
_rate_state: dict[str, deque] = defaultdict(deque)


def _enforce_rate_limit(user_id: str) -> None:
    now = time.monotonic()
    dq = _rate_state[user_id]
    while dq and now - dq[0] > _PREVIEW_WINDOW_S:
        dq.popleft()
    if len(dq) >= _PREVIEW_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"rate limit: max {_PREVIEW_LIMIT} previews per minute",
        )
    dq.append(now)


# ─── endpoint ──────────────────────────────────────────────────────────


@router.post("/preview", response_model=PromptPreviewResponse)
async def preview_prompt(
    req: PromptPreviewRequest,
    user: User = Depends(current_user),
) -> PromptPreviewResponse:
    _enforce_rate_limit(user.user_id)

    # Cap to supported providers: only models present (and active) in the
    # `models` table are runnable. Anything else is a 422.
    specs = resolve_model_specs(req.models)
    unknown = [m for m in req.models if m not in specs]
    if unknown:
        supported = sorted(specs.keys()) or "(none configured)"
        raise HTTPException(
            status_code=422,
            detail=f"unknown model(s): {unknown}. Supported: {supported}",
        )

    results = await run_prompt_against_models(
        req.text, req.models, req.subject, grounded=True
    )
    return PromptPreviewResponse(results=results)
