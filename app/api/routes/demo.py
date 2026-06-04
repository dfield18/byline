"""app/api/routes/demo.py — PUBLIC hero-demo endpoint for the landing page.

POST /api/demo/preview runs a typed topic against the live models and returns
real per-model results, so the landing console shows real narrative analysis
instead of canned text. Reuses app.prompt_preview.run_prompt_against_models
(same scorer as scheduled runs) and persists nothing.

This is UNAUTHENTICATED (the landing is public), so it is also a paid + abusable
surface. Guardrails here:
  - per-IP rate limit (strict);
  - a hard GLOBAL daily run cap, so total cost can't run away even under IP
    rotation;
  - a forced, fixed model set (callers can't pick expensive/extra models);
  - a length-capped topic.
In-memory + per-process (resets on restart; not shared across workers). For a
real public launch add a bot-protection layer (Cloudflare Turnstile / hCaptcha)
in front of this and move the counters to a shared store.
"""
from __future__ import annotations

import os
import time
from collections import defaultdict, deque

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.api.turnstile import verify_turnstile
from app.prompt_preview import ModelRunResult, run_prompt_against_models


router = APIRouter(prefix="/api/demo", tags=["demo"])


# Only models with keys configured run in the public demo (no error cards on
# the landing). Add to this set as keys land.
DEMO_MODELS = ["chatgpt", "gemini"]
TOPIC_MAX_LEN = 80

# Per-IP: N runs per window. Global: a hard daily ceiling on total runs so the
# bill is bounded regardless of distinct IPs.
_PER_IP_LIMIT = 3
_PER_IP_WINDOW_S = 600.0  # 10 minutes
_GLOBAL_DAILY_CAP = int(os.environ.get("DEMO_DAILY_CAP", "150"))

_ip_state: dict[str, deque] = defaultdict(deque)
_global_state = {"day": -1, "count": 0}


class DemoPreviewRequest(BaseModel):
    topic: str = Field(min_length=2, max_length=TOPIC_MAX_LEN)
    turnstile_token: str | None = None


class DemoPreviewResponse(BaseModel):
    topic: str
    results: list[ModelRunResult]


def _client_ip(request: Request) -> str:
    # Behind a reverse proxy the real client is the first X-Forwarded-For hop.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# Dev exemption keys on the REAL socket peer + an explicit dev flag — never the
# spoofable X-Forwarded-For header (a remote client could forge loopback there
# to bypass the cap).
_DEV_LOOPBACK = {"127.0.0.1", "::1"}


def _is_dev_exempt(request: Request) -> bool:
    if os.environ.get("BYLINE_AUTH") != "disabled":
        return False
    peer = request.client.host if request.client else ""
    return peer in _DEV_LOOPBACK


def _enforce_limits(request: Request) -> None:
    # Local dev (real loopback peer) is exempt so the demo can be exercised
    # freely. In production the limits always apply.
    if _is_dev_exempt(request):
        return

    now = time.monotonic()
    ip = _client_ip(request)

    # Global daily cap (cost ceiling).
    day = int(time.time() // 86400)
    if _global_state["day"] != day:
        _global_state["day"] = day
        _global_state["count"] = 0
    if _global_state["count"] >= _GLOBAL_DAILY_CAP:
        raise HTTPException(
            status_code=429,
            detail="The live demo is taking a breather — please try again later.",
        )

    # Per-IP window.
    dq = _ip_state[ip]
    while dq and now - dq[0] > _PER_IP_WINDOW_S:
        dq.popleft()
    if len(dq) >= _PER_IP_LIMIT:
        raise HTTPException(
            status_code=429,
            detail="You've hit the demo limit — try again in a few minutes.",
        )

    dq.append(now)
    _global_state["count"] += 1


@router.post("/preview", response_model=DemoPreviewResponse)
async def demo_preview(req: DemoPreviewRequest, request: Request) -> DemoPreviewResponse:
    topic = req.topic.strip()
    if not topic:
        raise HTTPException(status_code=422, detail="topic is required")

    # Bot challenge (no-op until TURNSTILE_SECRET_KEY is set; skipped in dev).
    if not _is_dev_exempt(request) and not await verify_turnstile(
        req.turnstile_token, _client_ip(request)
    ):
        raise HTTPException(status_code=403, detail="Verification failed — please try again.")

    _enforce_limits(request)

    # Keep the ask tight: a short answer generates faster, which matters for a
    # hero interaction where the visitor is staring at a spinner. The landing
    # only shows the first sentence per model anyway.
    text = (
        f"In two sentences, how is {topic} currently being characterized in "
        f"public discourse, and what is the prevailing tone? Be concise."
    )
    results = await run_prompt_against_models(text, DEMO_MODELS, topic, grounded=True)
    return DemoPreviewResponse(topic=topic, results=results)
