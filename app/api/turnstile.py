"""app/api/turnstile.py — Cloudflare Turnstile verification for public endpoints.

Config-gated bot challenge. When TURNSTILE_SECRET_KEY is set, the public demo /
try endpoints require a valid Turnstile token; when it is NOT set (local dev,
and until keys are provisioned) verification is skipped so the flow works
without friction.

Provision:
  - Create a Turnstile widget at https://dash.cloudflare.com → Turnstile.
  - Backend:  TURNSTILE_SECRET_KEY=<secret>   (this module)
  - Frontend: NEXT_PUBLIC_TURNSTILE_SITE_KEY=<sitekey>  (renders the widget)
Both must be set for the gate to engage end-to-end.
"""
from __future__ import annotations

import os

import httpx

_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def turnstile_enabled() -> bool:
    return bool(os.environ.get("TURNSTILE_SECRET_KEY"))


async def verify_turnstile(token: str | None, remote_ip: str | None = None) -> bool:
    """True if the token is valid (or if Turnstile isn't configured → skipped).

    Fails closed only when configured: a missing/invalid token returns False so
    the caller can reject. Network errors against Cloudflare also fail closed.
    """
    secret = os.environ.get("TURNSTILE_SECRET_KEY")
    if not secret:
        return True  # not configured — skip the gate (dev / pre-provision)
    if not token:
        return False
    data = {"secret": secret, "response": token}
    if remote_ip:
        data["remoteip"] = remote_ip
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(_VERIFY_URL, data=data)
        return bool(resp.json().get("success", False))
    except Exception:
        return False
