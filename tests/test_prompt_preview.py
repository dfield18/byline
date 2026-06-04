"""Tests for the prompt-preview run-and-score service.

The drift test is the important one: it pins, at the code level, that preview
scores a model response with the SAME scorer a scheduled run uses
(ScoresExtractor + MentionDetectionExtractor) — so the two can't silently
drift apart. The partial-failure test pins that one bad provider yields a
partial result, not a 500.

Both mock the model providers and the Gemini scorer transport, so they need
no live API keys and no database.
"""
from __future__ import annotations

import json
from decimal import Decimal

import pytest

from app.providers.base import ProviderResponse
from app.prompt_preview import run_prompt_against_models


# ─── fakes ─────────────────────────────────────────────────────────────

FIXED_RESPONSE = (
    "J.D. Vance is widely described as a populist conservative and a close "
    "ally of Donald Trump, with critics calling his shift opportunistic."
)
SUBJECT = "J.D. Vance"

# Deterministic scorer outputs the fake Gemini client returns.
SCORES_JSON = json.dumps(
    {
        "sentiment": -0.42,
        "directional_lean": 0.30,
        "certainty": 0.55,
        "criticism_severity": 0.40,
        "rationale": "test",
    }
)
MENTION_JSON = json.dumps(
    {"subject_mentioned": True, "mention_rank": 2, "competitors_mentioned": []}
)


class FakeProvider:
    """Stand-in for a real Provider; never raises (Provider contract)."""

    def __init__(self, *, text: str | None = FIXED_RESPONSE, success: bool = True, error: str | None = None):
        self._text, self._success, self._error = text, success, error

    async def query(self, prompt, params, *, enable_grounding=True, reasoning_enabled=False):
        return ProviderResponse(
            text=self._text if self._success else None,
            metadata={"grounding_enabled": enable_grounding},
            success=self._success,
            error=self._error,
            latency_ms=1,
            cost_usd=Decimal(0),
        )


class _FakeUsage:
    prompt_token_count = 0
    candidates_token_count = 0


class _FakeGeminiResponse:
    def __init__(self, text: str):
        self.text = text
        self.usage_metadata = _FakeUsage()


class _FakeModels:
    async def generate_content(self, *, model, contents, config):
        # Route by the extractor's prompt so each scorer gets its own JSON.
        if "Score the response" in contents:
            return _FakeGeminiResponse(SCORES_JSON)
        if "is mentioned" in contents:
            return _FakeGeminiResponse(MENTION_JSON)
        return _FakeGeminiResponse(json.dumps({}))


class _FakeAio:
    def __init__(self):
        self.models = _FakeModels()


class FakeGeminiClient:
    def __init__(self, *args, **kwargs):
        self.aio = _FakeAio()


@pytest.fixture
def deterministic_scorer(monkeypatch):
    """Make ScoresExtractor / MentionDetectionExtractor deterministic by
    swapping the google-genai client they construct."""
    monkeypatch.setattr("app.analyzer.genai.Client", FakeGeminiClient)


# ─── drift test ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_preview_scores_match_scheduled_scorer(monkeypatch, deterministic_scorer):
    """Preview and a scheduled run of the same (text, models, subject) must
    produce the same scores given the same model response.

    We run the full preview path, then run the EXACT extractor calls
    `analyzer.run_analysis` makes per response, and assert equality.
    """
    monkeypatch.setattr(
        "app.prompt_preview.get_provider", lambda slug, ident: FakeProvider()
    )
    monkeypatch.setattr(
        "app.prompt_preview.resolve_model_specs",
        lambda slugs: {s: ("openai", "gpt-x") for s in slugs},
    )

    # Preview path.
    results = await run_prompt_against_models(
        "Tell me about J.D. Vance and his record, please.", ["chatgpt"], SUBJECT
    )
    assert len(results) == 1
    r = results[0]
    assert r.error is None
    assert r.response == FIXED_RESPONSE

    # Scheduled scorer path — the exact calls run_analysis makes per response.
    from app.analyzer import (
        MentionDetectionExtractor,
        ResponseToAnalyze,
        ScoresExtractor,
    )

    resp = ResponseToAnalyze(
        id=0, subject_id=0, subject_name=SUBJECT, subject_setup_inputs={},
        model_id=0, prompt_id=0, layer="unnamed",
        response_text=FIXED_RESPONSE, response_metadata={},
    )
    scores = await ScoresExtractor().extract(resp)
    mention = await MentionDetectionExtractor().extract(resp)

    # Identical scores — no drift.
    assert r.sentiment == scores.output["sentiment"] == -0.42
    assert r.subject_mentioned == mention.extra_columns["subject_mentioned"] is True
    assert r.mention_rank == mention.extra_columns["mention_rank"] == 2


# ─── partial-failure test ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_single_failing_model_yields_partial_not_500(monkeypatch, deterministic_scorer):
    """One failing provider returns an error result; the others still score.
    The call never raises."""

    def fake_get_provider(provider_slug, ident):
        if provider_slug == "anthropic":
            return FakeProvider(success=False, error="provider exploded")
        return FakeProvider()

    monkeypatch.setattr("app.prompt_preview.get_provider", fake_get_provider)
    monkeypatch.setattr(
        "app.prompt_preview.resolve_model_specs",
        lambda slugs: {"chatgpt": ("openai", "gpt-x"), "claude": ("anthropic", "claude-x")},
    )

    results = await run_prompt_against_models(
        "Tell me about the subject, please.", ["chatgpt", "claude"], "Subject"
    )

    assert len(results) == 2
    by_model = {r.model: r for r in results}

    # Failing model: error captured, no response/scores — not an exception.
    assert by_model["claude"].error == "provider exploded"
    assert by_model["claude"].response is None
    assert by_model["claude"].sentiment is None
    assert by_model["claude"].subject_mentioned is None

    # Healthy model: full result alongside the failure.
    assert by_model["chatgpt"].error is None
    assert by_model["chatgpt"].response == FIXED_RESPONSE
    assert by_model["chatgpt"].sentiment == -0.42
    assert by_model["chatgpt"].subject_mentioned is True
