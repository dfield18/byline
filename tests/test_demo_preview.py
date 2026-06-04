"""Tests for the PUBLIC landing-demo endpoint (POST /api/demo/preview).

This endpoint is unauthenticated and triggers paid LLM calls, so the
safety-critical behavior here is the guardrails: input validation, the forced
model set (callers can't widen it), and the per-IP rate limit. These tests pin
all three. run_prompt_against_models is patched, so no live keys / DB needed.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import app.api.routes.demo as demo
from app.api.main import app
from app.prompt_preview import ModelRunResult


@pytest.fixture
def client(monkeypatch):
    """A TestClient with the model runner stubbed and limiter state reset."""
    captured: dict[str, object] = {}

    async def fake_run(text, models, subject, *, grounded=True, timeout_s=30.0):
        captured["text"] = text
        captured["models"] = list(models)
        captured["subject"] = subject
        captured["grounded"] = grounded
        return [
            ModelRunResult(
                model=m,
                response=f"stub answer about {subject}",
                sentiment=0.0,
                subject_mentioned=True,
                mention_rank=1,
                grounded=grounded,
                error=None,
            )
            for m in models
        ]

    monkeypatch.setattr(demo, "run_prompt_against_models", fake_run)
    # Reset the in-memory limiters so tests don't bleed into each other.
    demo._ip_state.clear()
    demo._global_state.update({"day": -1, "count": 0})

    c = TestClient(app)
    c._captured = captured  # type: ignore[attr-defined]
    return c


def test_valid_topic_runs_forced_models(client):
    res = client.post("/api/demo/preview", json={"topic": "Donald Trump"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["topic"] == "Donald Trump"
    assert [r["model"] for r in body["results"]] == demo.DEMO_MODELS
    # The endpoint runs its OWN fixed model set, names the topic in the prompt,
    # and runs grounded — regardless of what a caller might try to inject.
    cap = client._captured  # type: ignore[attr-defined]
    assert cap["models"] == demo.DEMO_MODELS
    assert cap["subject"] == "Donald Trump"
    assert "Donald Trump" in cap["text"]
    assert cap["grounded"] is True


def test_extra_fields_cannot_widen_model_set(client):
    # A caller passing their own `models` can't expand the run — the endpoint
    # ignores unknown fields and always uses DEMO_MODELS.
    res = client.post(
        "/api/demo/preview",
        json={"topic": "AI regulation", "models": ["chatgpt", "gemini", "claude", "perplexity"]},
    )
    assert res.status_code == 200, res.text
    assert client._captured["models"] == demo.DEMO_MODELS  # type: ignore[attr-defined]


@pytest.mark.parametrize("topic", ["", "a", " "])
def test_too_short_topic_rejected(client, topic):
    res = client.post("/api/demo/preview", json={"topic": topic})
    assert res.status_code == 422


def test_per_ip_rate_limit(client):
    headers = {"X-Forwarded-For": "203.0.113.7"}
    for _ in range(demo._PER_IP_LIMIT):
        ok = client.post("/api/demo/preview", json={"topic": "inflation"}, headers=headers)
        assert ok.status_code == 200
    # One past the limit from the same IP → 429.
    blocked = client.post("/api/demo/preview", json={"topic": "inflation"}, headers=headers)
    assert blocked.status_code == 429
    # A different IP is unaffected.
    other = client.post(
        "/api/demo/preview", json={"topic": "inflation"}, headers={"X-Forwarded-For": "198.51.100.4"}
    )
    assert other.status_code == 200


def test_global_daily_cap(client, monkeypatch):
    monkeypatch.setattr(demo, "_GLOBAL_DAILY_CAP", 2)
    demo._global_state.update({"day": -1, "count": 0})
    # Two runs from distinct IPs exhaust the global cap...
    for i in range(2):
        ok = client.post(
            "/api/demo/preview", json={"topic": "inflation"}, headers={"X-Forwarded-For": f"10.0.0.{i}"}
        )
        assert ok.status_code == 200
    # ...a third, even from a fresh IP, is blocked by the cost ceiling.
    blocked = client.post(
        "/api/demo/preview", json={"topic": "inflation"}, headers={"X-Forwarded-For": "10.0.0.99"}
    )
    assert blocked.status_code == 429
