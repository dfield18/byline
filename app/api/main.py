"""app/api/main.py — FastAPI entry point for the byline public API.

The customer-facing Next.js frontend calls this. The internal Streamlit
dashboard could also migrate to call this instead of reading Postgres
directly (one query layer to rule them all).

Run locally (dev):
    BYLINE_AUTH=disabled uvicorn app.api.main:app --reload --port 8000

The `BYLINE_AUTH=disabled` env var puts auth in mock-user mode so curl /
the internal dashboard / local Next.js dev can hit the API without
needing a real JWT. Production removes that flag — all calls must
present a valid bearer token (Clerk JWT, to be wired in
`app/api/auth.py`).

Endpoints (v0):
    GET  /healthz
    GET  /api/subjects
    GET  /api/subjects/{id}
    GET  /api/refreshes/{id}/responses
    GET  /api/refreshes/{id}/findings
    GET  /api/responses/{id}
    GET  /api/categories/{slug}/slots

Pending (write-side, scaffold for later):
    POST /api/subjects                  — create new subject
    POST /api/subjects/{id}/refresh     — kick off a refresh (async)

Once those land, the worker process picks the queued refresh up,
runs app/refresh.py + app/analyzer.py + app/cross_analyzer.py, and
updates a jobs table the frontend can poll.
"""
from __future__ import annotations

import os

# Load .env BEFORE importing routes — `app.api.auth` reads CLERK_ISSUER
# at module-load time when BYLINE_AUTH != "disabled".
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from app.api.routes import categories, jobs, prompts, refreshes, responses, subjects  # noqa: E402


app = FastAPI(
    title="byline API",
    description=(
        "AI search visibility data layer. v0 scaffold — read-only endpoints "
        "mirror the dashboard query helpers. Auth currently in mock-user "
        "mode when BYLINE_AUTH=disabled; production must wire Clerk JWT "
        "validation in app/api/auth.py."
    ),
    version="0.1.0",
)


# CORS — allow the Next.js frontend (local dev + production) to call.
# Tighten this list before any production traffic.
_DEFAULT_ORIGINS = [
    "http://localhost:3000",    # Next.js dev
    "http://localhost:3001",    # alt port
    "http://localhost:8501",    # internal Streamlit (if it migrates here)
]
_origins_env = os.environ.get("BYLINE_CORS_ORIGINS", "")
_origins = (
    [o.strip() for o in _origins_env.split(",") if o.strip()]
    if _origins_env
    else _DEFAULT_ORIGINS
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/healthz", tags=["meta"])
async def healthz():
    """Liveness probe for deployment platforms (Render, Fly, etc.)."""
    return {"status": "ok", "service": "byline-api", "version": "0.1.0"}


# Route registration
app.include_router(subjects.router)
app.include_router(refreshes.router)
app.include_router(responses.router)
app.include_router(categories.router)
app.include_router(jobs.router)
app.include_router(prompts.router)
