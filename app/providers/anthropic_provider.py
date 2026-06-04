from __future__ import annotations

import os
import time
from decimal import Decimal
from typing import Any

from dotenv import load_dotenv

from app.providers._retry import retry_async
from app.providers.base import Provider, ProviderResponse


load_dotenv()

# Approximate per-1M-token pricing for Claude Sonnet-class models. Estimate —
# Anthropic also bills per web search (~$10 / 1k searches) which we don't model
# here. Calibrate against the Anthropic console after a few runs.
_PRICE_PER_1M_INPUT = Decimal("3.00")
_PRICE_PER_1M_OUTPUT = Decimal("15.00")
_PER_TOKEN = Decimal(1_000_000)

# Anthropic's server-side web search tool. Versioned tool type per the
# Messages API. max_uses bounds how many searches a single answer can run.
_WEB_SEARCH_TOOL = {"type": "web_search_20250305", "name": "web_search", "max_uses": 5}
_DEFAULT_MAX_TOKENS = 2048

# Same US-focus system instruction the other providers apply.
_US_INSTRUCTIONS = (
    "Focus your responses on the United States context. When citing examples, "
    "sources, or comparisons, prioritize US-based ones unless the question "
    "explicitly asks about other countries."
)


class AnthropicProvider(Provider):
    """Anthropic (Claude) provider via the Messages API + server-side web search.

    Grounding uses Anthropic's `web_search` server tool. The SDK is
    lazy-imported inside query() so the app still imports cleanly before
    `anthropic` is installed; a missing SDK or ANTHROPIC_API_KEY returns
    success=False with a clear error rather than raising (Provider contract).
    """

    def __init__(self, model_identifier: str) -> None:
        super().__init__(model_identifier)

    def _is_retryable(self, exc: Exception) -> bool:
        try:
            from anthropic import (
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
        base_meta = {"grounding_enabled": enable_grounding, "provider": "anthropic"}

        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            return ProviderResponse(
                text=None, metadata=base_meta, success=False,
                error="ANTHROPIC_API_KEY not set",
                latency_ms=int((time.perf_counter() - start) * 1000),
                cost_usd=Decimal(0),
            )

        try:
            from anthropic import AsyncAnthropic
        except Exception as e:
            return ProviderResponse(
                text=None, metadata=base_meta, success=False,
                error=f"anthropic SDK not installed: {e}",
                latency_ms=int((time.perf_counter() - start) * 1000),
                cost_usd=Decimal(0),
            )

        client = AsyncAnthropic(api_key=api_key)

        kwargs: dict[str, Any] = {
            "model": self.model_identifier,
            "max_tokens": params.get("max_tokens", _DEFAULT_MAX_TOKENS),
            "system": _US_INSTRUCTIONS,
            "messages": [{"role": "user", "content": prompt}],
        }
        if "temperature" in params:
            kwargs["temperature"] = params["temperature"]
        if enable_grounding:
            kwargs["tools"] = [_WEB_SEARCH_TOOL]

        try:
            response, retry_count = await retry_async(
                lambda: client.messages.create(**kwargs),
                is_retryable=self._is_retryable,
            )
        except Exception as e:
            return ProviderResponse(
                text=None, metadata=base_meta, success=False, error=str(e),
                latency_ms=int((time.perf_counter() - start) * 1000),
                cost_usd=Decimal(0),
            )

        elapsed_ms = int((time.perf_counter() - start) * 1000)

        # Concatenate text blocks; collect citations from both the per-text
        # `citations` (web_search_result_location) and any
        # `web_search_tool_result` blocks. Dedupe by URL. Shape ({url, title})
        # matches what SourcesExtractor already parses.
        text_parts: list[str] = []
        citations: list[dict[str, Any]] = []
        seen_urls: set[str] = set()

        def _add_citation(url: Any, title: Any) -> None:
            if isinstance(url, str) and url and url not in seen_urls:
                seen_urls.add(url)
                citations.append({"url": url, "title": title})

        for block in getattr(response, "content", None) or []:
            btype = getattr(block, "type", None)
            if btype == "text":
                t = getattr(block, "text", None)
                if t:
                    text_parts.append(t)
                for cit in getattr(block, "citations", None) or []:
                    _add_citation(getattr(cit, "url", None), getattr(cit, "title", None))
            elif btype == "web_search_tool_result":
                for result in getattr(block, "content", None) or []:
                    _add_citation(
                        getattr(result, "url", None), getattr(result, "title", None)
                    )

        text = "".join(text_parts) or None

        usage = getattr(response, "usage", None)
        input_tokens = getattr(usage, "input_tokens", 0) or 0
        output_tokens = getattr(usage, "output_tokens", 0) or 0
        cost = (
            Decimal(input_tokens) * _PRICE_PER_1M_INPUT / _PER_TOKEN
            + Decimal(output_tokens) * _PRICE_PER_1M_OUTPUT / _PER_TOKEN
        )

        metadata: dict[str, Any] = {
            "provider": "anthropic",
            "model": getattr(response, "model", self.model_identifier),
            "prompt_tokens": input_tokens,
            "completion_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
            "finish_reason": getattr(response, "stop_reason", None),
            "grounding_enabled": enable_grounding,
            "search_queries": [],
            "citations": citations,
            "reasoning_enabled": reasoning_enabled,
            "retry_count": retry_count,
            "us_focused": True,
        }

        return ProviderResponse(
            text=text,
            metadata=metadata,
            success=True,
            error=None,
            latency_ms=elapsed_ms,
            cost_usd=cost,
        )
