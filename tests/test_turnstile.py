"""Tests for the config-gated Cloudflare Turnstile verifier.

No network: the only path exercised is the config gate (unset → skip; set but
missing token → fail). The valid-token path would call Cloudflare and isn't
unit-tested here.
"""
from __future__ import annotations

from app.api.turnstile import turnstile_enabled, verify_turnstile


async def test_skipped_when_unconfigured(monkeypatch):
    monkeypatch.delenv("TURNSTILE_SECRET_KEY", raising=False)
    assert turnstile_enabled() is False
    # No secret → verification is a no-op (the flow works without keys).
    assert await verify_turnstile(None) is True
    assert await verify_turnstile("anything") is True


async def test_configured_requires_token(monkeypatch):
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", "test-secret")
    assert turnstile_enabled() is True
    # Configured but no token → fail closed (no network call made).
    assert await verify_turnstile(None) is False
    assert await verify_turnstile("") is False
