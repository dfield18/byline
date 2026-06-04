"""Tests for the PUBLIC "try it" endpoint (POST /api/try).

This is unauthenticated and each NEW run triggers a full, paid, minutes-long
pipeline — so the cost/abuse guardrails are the safety-critical surface: the
7-day reuse cache (no re-spend on a fresh topic), the forced public org, the
per-IP rate limit, and the global daily cap (counted only on NEW spend).

The DB helpers and the LLM inference are monkeypatched, so these need no DB and
no live keys.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import app.api.routes.try_ as try_
from app.api.main import app


@pytest.fixture
def client(monkeypatch):
    calls: dict = {"enqueued": [], "created": [], "updated": []}

    # Default world: topic is brand-new, inference is stubbed, create/enqueue
    # are recorded instead of touching the DB.
    monkeypatch.setattr(try_, "_find_try_subject", lambda name: None)
    monkeypatch.setattr(try_, "_latest_refresh_job", lambda sid: None)
    monkeypatch.setattr(try_, "_has_fresh_completed_refresh", lambda sid: False)
    monkeypatch.setattr(try_, "_subject_category", lambda sid: "person")

    async def fake_infer_category(topic):
        return "person"

    async def fake_infer_setup(topic, category):
        return {"name": topic, "role": "x"}

    def fake_create_subject(*, org_id, category_slug, name, setup_inputs):
        calls["created"].append({"org_id": org_id, "category": category_slug, "name": name})
        return {"id": 999}

    def fake_enqueue(sid):
        calls["enqueued"].append(sid)
        return 12345

    def fake_update(sid, si):
        calls["updated"].append(sid)

    monkeypatch.setattr(try_, "_infer_category", fake_infer_category)
    monkeypatch.setattr(try_, "_infer_setup_inputs", fake_infer_setup)
    monkeypatch.setattr(try_, "create_subject", fake_create_subject)
    monkeypatch.setattr(try_, "_enqueue_refresh", fake_enqueue)
    monkeypatch.setattr(try_, "_update_setup_inputs", fake_update)

    # Reset the in-memory limiters.
    try_._ip_state.clear()
    try_._global_state.update({"day": -1, "count": 0})

    c = TestClient(app)
    c._calls = calls  # type: ignore[attr-defined]
    return c


def test_new_topic_creates_in_public_org_and_enqueues(client):
    res = client.post("/api/try", json={"topic": "Some New Politician"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["subject_id"] == 999
    assert body["reused"] is False
    assert body["status"] == "building"
    # Created in the walled-off public org, and a refresh was enqueued.
    assert client._calls["created"] == [
        {"org_id": try_.ORG_PUBLIC_TRY, "category": "person", "name": "Some New Politician"}
    ]
    assert client._calls["enqueued"] == [999]


@pytest.mark.parametrize("topic", ["", "a", " "])
def test_short_topic_rejected(client, topic):
    assert client.post("/api/try", json={"topic": topic}).status_code == 422


def test_cache_hit_does_not_respend(client, monkeypatch):
    # An existing subject with a fresh COMPLETED refresh → reuse, no enqueue.
    monkeypatch.setattr(try_, "_find_try_subject", lambda name: 42)
    monkeypatch.setattr(try_, "_latest_refresh_job", lambda sid: {"id": 7, "status": "succeeded", "completed_at": None, "fresh": True})
    monkeypatch.setattr(try_, "_has_fresh_completed_refresh", lambda sid: True)

    res = client.post("/api/try", json={"topic": "Cached Person"})
    assert res.status_code == 200, res.text
    body = res.json()
    # job_id is None on a cache hit — the overview is what matters, and the
    # latest job may be a later stale/failed one whose status would mislead.
    assert body == {"subject_id": 42, "job_id": None, "reused": True, "status": "ready"}
    # The cost-critical assertion: NO new pipeline run.
    assert client._calls["enqueued"] == []
    assert client._calls["created"] == []


def test_in_progress_subject_returns_building_without_respend(client, monkeypatch):
    monkeypatch.setattr(try_, "_find_try_subject", lambda name: 42)
    monkeypatch.setattr(try_, "_latest_refresh_job", lambda sid: {"id": 8, "status": "running", "completed_at": None, "fresh": False})

    body = client.post("/api/try", json={"topic": "Building Person"}).json()
    assert body["status"] == "building" and body["reused"] is True
    assert client._calls["enqueued"] == []


def test_stale_existing_subject_reinfers_and_reenqueues(client, monkeypatch):
    # Existing subject, no fresh completed refresh → re-infer setup + re-run,
    # reusing the subject row (no create).
    monkeypatch.setattr(try_, "_find_try_subject", lambda name: 42)
    monkeypatch.setattr(try_, "_latest_refresh_job", lambda sid: {"id": 9, "status": "failed", "completed_at": None, "fresh": False})

    body = client.post("/api/try", json={"topic": "Stale Person"}).json()
    assert body["subject_id"] == 42 and body["status"] == "building"
    assert client._calls["created"] == []          # reused the row
    assert client._calls["updated"] == [42]        # refreshed its setup_inputs
    assert client._calls["enqueued"] == [42]


def test_per_ip_rate_limit_on_new_runs(client):
    headers = {"X-Forwarded-For": "203.0.113.9"}
    for _ in range(try_._PER_IP_LIMIT):
        assert client.post("/api/try", json={"topic": "Fresh Topic Xyz"}, headers=headers).status_code == 200
    assert client.post("/api/try", json={"topic": "Fresh Topic Xyz"}, headers=headers).status_code == 429


def test_xforwarded_loopback_cannot_bypass_limit(client):
    # A remote client forging X-Forwarded-For: 127.0.0.1 must NOT be exempted —
    # the dev exemption keys on the real socket peer, not the spoofable header.
    headers = {"X-Forwarded-For": "127.0.0.1"}
    for _ in range(try_._PER_IP_LIMIT):
        assert client.post("/api/try", json={"topic": "Spoof Topic"}, headers=headers).status_code == 200
    assert client.post("/api/try", json={"topic": "Spoof Topic"}, headers=headers).status_code == 429


def test_create_race_does_not_double_enqueue(client, monkeypatch):
    # Two requests race on the same new topic: the loser's create_subject raises
    # ValueError; it must defer to the winner's in-flight job, not enqueue again.
    # _find_try_subject: None at the top (so we take the create path), then the
    # winner's id inside the except branch.
    seen = {"n": 0}

    def find(name):
        seen["n"] += 1
        return None if seen["n"] == 1 else 77

    def boom(*, org_id, category_slug, name, setup_inputs):
        raise ValueError("duplicate")

    monkeypatch.setattr(try_, "_find_try_subject", find)
    monkeypatch.setattr(try_, "create_subject", boom)
    monkeypatch.setattr(try_, "_latest_refresh_job", lambda sid: {"id": 5, "status": "queued", "completed_at": None, "fresh": False})

    body = client.post("/api/try", json={"topic": "Racy Topic"}).json()
    assert body["subject_id"] == 77 and body["status"] == "building" and body["reused"] is True
    assert client._calls["enqueued"] == []  # no redundant second pipeline run


def test_global_daily_cap(client, monkeypatch):
    monkeypatch.setattr(try_, "_GLOBAL_DAILY_CAP", 2)
    try_._global_state.update({"day": -1, "count": 0})
    for i in range(2):
        assert client.post("/api/try", json={"topic": "Topic"}, headers={"X-Forwarded-For": f"10.1.0.{i}"}).status_code == 200
    assert client.post("/api/try", json={"topic": "Topic"}, headers={"X-Forwarded-For": "10.1.0.250"}).status_code == 429
