"""app/api/routes/try_.py — PUBLIC "try it" flow for the landing page.

A landing visitor types a topic; we create (or reuse) a throwaway subject in
a dedicated public org, run the full refresh pipeline against it, and let the
visitor watch a real Overview dashboard fill in — no login.

This is unauthenticated and runs the FULL pipeline (all active models +
analysis + cross-analysis, ~2-5 min, ~$0.30-0.80 a run), so cost/abuse control
matters a lot:
  - a 7-day topic-reuse cache: the SAME topic reuses an existing refreshed
    subject instead of re-running the pipeline (the main cost lever);
  - a hard GLOBAL daily cap on NEW runs, DB-backed via the jobs table (truly
    global across workers + restarts; counted only when we actually spend —
    reuses are free), plus a per-IP window (in-process, best-effort friction);
  - a forced public org so these never touch real customer tenancy;
  - an optional Cloudflare Turnstile gate (enforced when TURNSTILE_SECRET_KEY
    is set; skipped in dev);
  - the dev exemption keys on the real socket peer, not a spoofable header.

Endpoints:
  POST /api/try            {topic} -> {subject_id, job_id, reused, status}
  GET  /api/try/{id}               -> Overview JSON (public-org scoped)
  GET  /api/try/{id}/status        -> {status, job_id, error}
"""
from __future__ import annotations

import json
import os
import time
from collections import defaultdict, deque
from pathlib import Path

import yaml
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.api.turnstile import verify_turnstile
from app.db import get_cursor
from app.providers import get_provider
from app.public_demo import ORG_PUBLIC_TRY
from dashboard.lib.queries import create_subject, get_subject, get_subject_overview


router = APIRouter(prefix="/api/try", tags=["try"])

# byline/prompts/<category>.yaml holds each category's setup_inputs schema.
_PROMPTS_DIR = Path(__file__).resolve().parents[3] / "prompts"
# Filled by the pipeline (news step) or genuinely optional — we don't infer.
_SKIP_SETUP_KEYS = {"name", "recent_news", "canonical_url"}


# ORG_PUBLIC_TRY imported from app.public_demo (single source of truth).
REUSE_WINDOW_DAYS = 7
TOPIC_MAX_LEN = 80
_VALID_CATEGORIES = {"person", "organization", "issue", "policy", "event"}

# Each NEW run is a full, minutes-long, paid pipeline — so the limits are
# tighter than the lightweight /api/demo endpoint.
_PER_IP_LIMIT = 3
_PER_IP_WINDOW_S = 3600.0  # 1 hour
_GLOBAL_DAILY_CAP = int(os.environ.get("TRY_DAILY_CAP", "20"))
# Only the REAL socket peer (un-spoofable) is trusted for the dev exemption —
# never the X-Forwarded-For header, which a remote client can forge to claim
# loopback and bypass the cap entirely.
_DEV_LOOPBACK = {"127.0.0.1", "::1"}

_ip_state: dict[str, deque] = defaultdict(deque)


class TryRequest(BaseModel):
    topic: str = Field(min_length=2, max_length=TOPIC_MAX_LEN)
    turnstile_token: str | None = None


class TryResponse(BaseModel):
    subject_id: int
    job_id: int | None
    reused: bool
    status: str  # "building" | "ready"


# ─── helpers ───────────────────────────────────────────────────────────


def _client_ip(request: Request) -> str:
    # Rate-limit KEY (best-effort): behind a trusted proxy the client is the
    # first X-Forwarded-For hop; otherwise the socket peer.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _is_dev_exempt(request: Request) -> bool:
    """Local dev only — keyed on the real socket peer + an explicit dev flag,
    so a remote client can't forge X-Forwarded-For to dodge the cap."""
    if os.environ.get("BYLINE_AUTH") != "disabled":
        return False
    peer = request.client.host if request.client else ""
    return peer in _DEV_LOOPBACK


def _global_runs_today() -> int:
    """Count of NEW try-runs enqueued today (UTC), read from the jobs table.

    Every paid run is a `jobs` row in the public org, so this is a SHARED,
    restart-safe global counter — no per-process drift, no reset on deploy.
    (Reuse/cache hits don't enqueue, so they correctly don't count.)
    """
    with get_cursor(commit=False) as cur:
        cur.execute(
            """
            SELECT count(*) FROM jobs
            WHERE org_id = %s AND kind = 'refresh'
              AND enqueued_at >= date_trunc('day', (now() AT TIME ZONE 'utc'))
            """,
            (ORG_PUBLIC_TRY,),
        )
        return cur.fetchone()[0]


def _enforce_limits(request: Request) -> None:
    """Bound spend on NEW pipeline runs. Local dev (real loopback peer) exempt.

    Global daily cap is DB-backed (truly global across workers + restarts); the
    per-IP window stays in-process (best-effort friction — the global cap is the
    hard cost ceiling).
    """
    if _is_dev_exempt(request):
        return

    if _global_runs_today() >= _GLOBAL_DAILY_CAP:
        raise HTTPException(
            status_code=429,
            detail="The live demo is at capacity for today — please try again tomorrow.",
        )

    now = time.monotonic()
    ip = _client_ip(request)
    dq = _ip_state[ip]
    while dq and now - dq[0] > _PER_IP_WINDOW_S:
        dq.popleft()
    if len(dq) >= _PER_IP_LIMIT:
        raise HTTPException(
            status_code=429,
            detail="You've reached the live-demo limit — try again in a little while.",
        )

    dq.append(now)


def _find_try_subject(name: str) -> int | None:
    """Existing try-subject id for this topic (case-insensitive), or None."""
    with get_cursor(commit=False) as cur:
        cur.execute(
            "SELECT id FROM subjects WHERE org_id = %s AND lower(name) = lower(%s) LIMIT 1",
            (ORG_PUBLIC_TRY, name),
        )
        row = cur.fetchone()
        return row[0] if row else None


def _latest_refresh_job(subject_id: int) -> dict | None:
    """Most recent refresh job for the subject, with freshness, or None."""
    with get_cursor(commit=False) as cur:
        cur.execute(
            """
            SELECT id, status, completed_at,
                   completed_at > NOW() - make_interval(days => %s) AS fresh
            FROM jobs
            WHERE subject_id = %s AND kind = 'refresh'
            ORDER BY enqueued_at DESC
            LIMIT 1
            """,
            (REUSE_WINDOW_DAYS, subject_id),
        )
        row = cur.fetchone()
    if not row:
        return None
    return {"id": row[0], "status": row[1], "completed_at": row[2], "fresh": bool(row[3])}


def _enqueue_refresh(subject_id: int) -> int:
    with get_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO jobs (subject_id, org_id, kind, status)
            VALUES (%s, %s, 'refresh', 'queued')
            RETURNING id
            """,
            (subject_id, ORG_PUBLIC_TRY),
        )
        return cur.fetchone()[0]


def _has_fresh_completed_refresh(subject_id: int) -> bool:
    """True if a status='completed' refresh exists within the reuse window —
    i.e. the Overview would actually be populated. The cache hit gates on THIS,
    not mere job success, since a 'partial' refresh leaves the brief empty."""
    with get_cursor(commit=False) as cur:
        cur.execute(
            """
            SELECT 1 FROM refresh_runs
            WHERE subject_id = %s AND status = 'completed'
              AND started_at > NOW() - make_interval(days => %s)
            LIMIT 1
            """,
            (subject_id, REUSE_WINDOW_DAYS),
        )
        return cur.fetchone() is not None


def _subject_category(subject_id: int) -> str | None:
    with get_cursor(commit=False) as cur:
        cur.execute(
            """
            SELECT c.slug FROM subjects s
            JOIN categories c ON c.id = s.category_id
            WHERE s.id = %s AND s.org_id = %s
            """,
            (subject_id, ORG_PUBLIC_TRY),
        )
        row = cur.fetchone()
        return row[0] if row else None


def _update_setup_inputs(subject_id: int, setup_inputs: dict) -> None:
    with get_cursor(commit=True) as cur:
        cur.execute(
            "UPDATE subjects SET setup_inputs = %s::jsonb WHERE id = %s AND org_id = %s",
            (json.dumps(setup_inputs), subject_id, ORG_PUBLIC_TRY),
        )


def _load_setup_def(category: str) -> list[dict]:
    """The category's setup_inputs schema (key/label/description/required).
    Degrades to [] on a missing or malformed YAML file rather than 500."""
    path = _PROMPTS_DIR / f"{category}.yaml"
    if not path.exists():
        return []
    try:
        with path.open() as f:
            data = yaml.safe_load(f) or {}
    except yaml.YAMLError:
        return []
    inputs = data.get("setup_inputs", [])
    return inputs if isinstance(inputs, list) else []


async def _infer_setup_inputs(topic: str, category: str) -> dict:
    """LLM-fill the category's setup_inputs for `topic`.

    A refresh only counts as 'completed' (and thus populates the Overview) if
    EVERY referenced template variable is present — the authed product collects
    these from the user; here we infer them. The result always contains every
    required key (LLM value, or "" fallback) so prompt rendering never KeyErrors
    and the refresh completes.
    """
    fields = _load_setup_def(category)
    base: dict = {"name": topic}
    if not fields:
        return base

    wanted = [f for f in fields if f.get("key") not in _SKIP_SETUP_KEYS]
    valid_keys = {f["key"] for f in wanted}
    lines = []
    for f in wanted:
        desc = (f.get("description") or f.get("label") or "").strip().replace("\n", " ")
        example = f.get("example")
        suffix = f" (e.g. {example})" if example is not None else ""
        lines.append(f'- {f["key"]}: {desc}{suffix}')
    guide = "\n".join(lines)
    prompt = (
        f'Build a concise factual profile of "{topic}" (type: {category}).\n'
        f"Return ONLY a JSON object with exactly these keys:\n{guide}\n\n"
        "Rules: each value is a short string. For pronoun_subject use he/she/they; "
        "pronoun_be use is/are; pronoun_possessive use his/her/their. For yes/no "
        "questions answer \"yes\" or \"no\". If unsure, give your best single guess."
    )

    provider = get_provider("google", "gemini-2.5-flash")
    parsed: dict = {}
    try:
        resp = await provider.query(
            prompt, {"temperature": 0.2}, enable_grounding=False, reasoning_enabled=False
        )
        if resp.success and resp.text:
            # Robust extraction: pull the first {...} object out of the reply,
            # tolerating markdown fences or stray prose around it.
            import re as _re
            m = _re.search(r"\{.*\}", resp.text, _re.DOTALL)
            if m:
                parsed = json.loads(m.group(0))
    except Exception:
        parsed = {}

    for k, v in (parsed.items() if isinstance(parsed, dict) else []):
        if k in valid_keys and v is not None:
            base[k] = str(v).strip()
    # Safety net: every REQUIRED key must exist so rendering can't KeyError.
    for f in wanted:
        if f.get("required", True) and f["key"] not in base:
            base[f["key"]] = ""
    return base


async def _infer_category(topic: str) -> str:
    """One cheap Gemini-flash call to bucket the topic so prompts render
    sensibly (an issue shouldn't be treated as a person). Defaults to
    'person' on any failure."""
    provider = get_provider("google", "gemini-2.5-flash")
    prompt = (
        "Classify the following topic into exactly one of these categories: "
        "person, organization, issue, policy, event.\n"
        f'Topic: "{topic}"\n'
        "Reply with only the single category word, lowercase."
    )
    try:
        resp = await provider.query(
            prompt, {"temperature": 0.0}, enable_grounding=False, reasoning_enabled=False
        )
    except Exception:
        return "person"
    if resp.success and resp.text:
        word = resp.text.strip().lower().split()[0].strip(".,") if resp.text.strip() else ""
        if word in _VALID_CATEGORIES:
            return word
    return "person"


# ─── endpoints ─────────────────────────────────────────────────────────


@router.post("", response_model=TryResponse)
async def create_try(req: TryRequest, request: Request) -> TryResponse:
    topic = req.topic.strip()
    if not topic:
        raise HTTPException(status_code=422, detail="topic is required")

    # Bot challenge (no-op until TURNSTILE_SECRET_KEY is set; skipped in dev).
    if not _is_dev_exempt(request) and not await verify_turnstile(
        req.turnstile_token, _client_ip(request)
    ):
        raise HTTPException(status_code=403, detail="Verification failed — please try again.")

    existing = _find_try_subject(topic)
    if existing is not None:
        job = _latest_refresh_job(existing)
        if job and job["status"] in ("queued", "running"):
            return TryResponse(subject_id=existing, job_id=job["id"], reused=True, status="building")
        if _has_fresh_completed_refresh(existing):
            # Cache hit — a real completed brief within the window. No new spend.
            # job_id=None: the overview is what matters, and the latest job may
            # be a later failed/stale one whose status would mislead the poller.
            return TryResponse(
                subject_id=existing, job_id=None, reused=True, status="ready"
            )
        subject_id = existing
        is_new = False
    else:
        subject_id = None
        is_new = True

    # We're about to spend money (new subject, or stale/incomplete re-run) — gate it.
    _enforce_limits(request)

    # Always (re)infer setup_inputs so the refresh can complete — a bare {name}
    # leaves most prompts un-renderable → partial → empty brief.
    category = (
        await _infer_category(topic) if is_new else (_subject_category(subject_id) or "person")
    )
    setup_inputs = await _infer_setup_inputs(topic, category)

    if is_new:
        try:
            subject_id = create_subject(
                org_id=ORG_PUBLIC_TRY,
                category_slug=category,
                name=topic,
                setup_inputs=setup_inputs,
            )["id"]
        except ValueError:
            # Lost a create race: the winner already inserted the row (and
            # likely enqueued a refresh). Defer to its in-flight job instead of
            # launching a second, redundant paid run.
            subject_id = _find_try_subject(topic)
            if subject_id is None:
                raise HTTPException(status_code=409, detail="Could not start the demo, please retry.")
            job = _latest_refresh_job(subject_id)
            if job and job["status"] in ("queued", "running", "succeeded"):
                return TryResponse(
                    subject_id=subject_id, job_id=job["id"], reused=True, status="building"
                )
    else:
        _update_setup_inputs(subject_id, setup_inputs)

    job_id = _enqueue_refresh(subject_id)
    return TryResponse(subject_id=subject_id, job_id=job_id, reused=not is_new, status="building")


@router.get("/{subject_id}")
async def get_try_overview(subject_id: int, weeks: int = 12):
    """Overview JSON for a try-subject — scoped to the public org so this can
    never read a real customer's subject."""
    weeks = max(1, min(weeks, 52))  # clamp — unauthenticated DB-work amplifier
    overview = get_subject_overview(subject_id, org_id=ORG_PUBLIC_TRY, weeks=weeks)
    if not overview:
        raise HTTPException(status_code=404, detail=f"try subject {subject_id} not found")
    return overview


@router.get("/{subject_id}/status")
async def get_try_status(subject_id: int):
    """Latest refresh-job status for the building-state poller."""
    if not get_subject(subject_id, org_id=ORG_PUBLIC_TRY):
        raise HTTPException(status_code=404, detail=f"try subject {subject_id} not found")
    job = _latest_refresh_job(subject_id)
    if not job:
        return {"status": "none", "job_id": None, "error": None}
    err = None
    if job["status"] == "failed":
        with get_cursor(commit=False) as cur:
            cur.execute("SELECT error FROM jobs WHERE id = %s", (job["id"],))
            row = cur.fetchone()
            err = row[0] if row else None
    return {"status": job["status"], "job_id": job["id"], "error": err}
