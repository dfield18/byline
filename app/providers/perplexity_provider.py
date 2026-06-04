from __future__ import annotations

import os
import time
from decimal import Decimal
from typing import Any

from dotenv import load_dotenv

from app.providers._retry import retry_async
from app.providers.base import Provider, ProviderResponse


load_dotenv()

# Approximate per-1M-token pricing for Perplexity `sonar` models. Estimate —
# Perplexity also bills a small per-request search fee that we don't model
# here. Calibrate against the Perplexity dashboard after a few runs.
_PRICE_PER_1M_INPUT = Decimal("1.00")
_PRICE_PER_1M_OUTPUT = Decimal("1.00")
_PER_TOKEN = Decimal(1_000_000)

_PERPLEXITY_BASE_URL = "https://api.perplexity.ai"

# Same US-focus system instruction the other providers apply, so political /
# policy subjects default to US context without baking "US" into the prompt.
_US_INSTRUCTIONS = (
    "Focus your responses on the United States context. When citing examples, "
    "sources, or comparisons, prioritize US-based ones unless the question "
    "explicitly asks about other countries."
)


class PerplexityProvider(Provider):
    """Perplexity provider via the OpenAI-compatible Chat Completions API.

    Perplexity's `sonar` models are inherently web-grounded — every answer is
    produced from a live search, so there is no "ungrounded" mode. We record
    `grounding_enabled` in metadata for parity with the other providers but
    the model always searches.

    Reuses the already-installed `openai` SDK pointed at Perplexity's base
    URL, so no extra dependency. Requires PERPLEXITY_API_KEY; when it's
    absent the provider returns success=False with a clear error rather than
    raising (matching the Provider contract).
    """

    def __init__(self, model_identifier: str) -> None:
        super().__init__(model_identifier)

    def _is_retryable(self, exc: Exception) -> bool:
        # The openai SDK error classes apply to the Perplexity endpoint too
        # (same client). Import lazily so a partial install can't break import.
        try:
            from openai import (
                APIConnectionError,
                APITimeoutError,
                InternalServerError,
                RateLimitError,
            )
        except Exception:
            return False
        return isinstance(
            exc,
            (RateLimitError, APIConnectionError, APITimeoutError, InternalServerError),
        )

    async def query(
        self,
        prompt: str,
        params: dict[str, Any],
        *,
        enable_grounding: bool = True,
        reasoning_enabled: bool = False,
    ) -> ProviderResponse:
        start = time.perf_counter()

        api_key = os.environ.get("PERPLEXITY_API_KEY")
        if not api_key:
            return ProviderResponse(
                text=None,
                metadata={"grounding_enabled": enable_grounding, "provider": "perplexity"},
                success=False,
                error="PERPLEXITY_API_KEY not set",
                latency_ms=int((time.perf_counter() - start) * 1000),
                cost_usd=Decimal(0),
            )

        try:
            from openai import AsyncOpenAI
        except Exception as e:  # pragma: no cover — openai is a hard dep
            return ProviderResponse(
                text=None,
                metadata={"grounding_enabled": enable_grounding, "provider": "perplexity"},
                success=False,
                error=f"openai SDK unavailable: {e}",
                latency_ms=int((time.perf_counter() - start) * 1000),
                cost_usd=Decimal(0),
            )

        client = AsyncOpenAI(api_key=api_key, base_url=_PERPLEXITY_BASE_URL)

        kwargs: dict[str, Any] = {
            "model": self.model_identifier,
            "messages": [
                {"role": "system", "content": _US_INSTRUCTIONS},
                {"role": "user", "content": prompt},
            ],
        }
        if "temperature" in params:
            kwargs["temperature"] = params["temperature"]
        if "max_tokens" in params:
            kwargs["max_tokens"] = params["max_tokens"]

        try:
            response, retry_count = await retry_async(
                lambda: client.chat.completions.create(**kwargs),
                is_retryable=self._is_retryable,
            )
        except Exception as e:
            return ProviderResponse(
                text=None,
                metadata={"grounding_enabled": enable_grounding, "provider": "perplexity"},
                success=False,
                error=str(e),
                latency_ms=int((time.perf_counter() - start) * 1000),
                cost_usd=Decimal(0),
            )

        elapsed_ms = int((time.perf_counter() - start) * 1000)

        try:
            text = response.choices[0].message.content if response.choices else None
        except Exception:
            text = None

        usage = getattr(response, "usage", None)
        input_tokens = getattr(usage, "prompt_tokens", 0) or 0
        output_tokens = getattr(usage, "completion_tokens", 0) or 0
        cost = (
            Decimal(input_tokens) * _PRICE_PER_1M_INPUT / _PER_TOKEN
            + Decimal(output_tokens) * _PRICE_PER_1M_OUTPUT / _PER_TOKEN
        )

        # Perplexity returns sources two ways depending on API version:
        # `search_results` (list of {title, url, date}) and/or `citations`
        # (list of bare URL strings). Prefer search_results (has titles);
        # fall back to citations. Shape matches what SourcesExtractor's
        # `_domain_from_citation` already understands ({url, title}).
        citations: list[dict[str, Any]] = []
        search_results = getattr(response, "search_results", None)
        if isinstance(search_results, list):
            for sr in search_results:
                url = sr.get("url") if isinstance(sr, dict) else getattr(sr, "url", None)
                title = sr.get("title") if isinstance(sr, dict) else getattr(sr, "title", None)
                if url:
                    citations.append({"url": url, "title": title})
        if not citations:
            raw_citations = getattr(response, "citations", None)
            if isinstance(raw_citations, list):
                for c in raw_citations:
                    if isinstance(c, str):
                        citations.append({"url": c, "title": None})
                    elif isinstance(c, dict) and c.get("url"):
                        citations.append({"url": c["url"], "title": c.get("title")})

        metadata: dict[str, Any] = {
            "provider": "perplexity",
            "model": getattr(response, "model", self.model_identifier),
            "prompt_tokens": input_tokens,
            "completion_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
            "grounding_enabled": enable_grounding,
            "search_queries": [],
            "citations": citations,
            "reasoning_enabled": reasoning_enabled,
            "retry_count": retry_count,
            "us_focused": True,
        }

        return ProviderResponse(
            text=text or None,
            metadata=metadata,
            success=True,
            error=None,
            latency_ms=elapsed_ms,
            cost_usd=cost,
        )
