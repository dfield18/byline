from __future__ import annotations

import time
from decimal import Decimal
from typing import Any

from dotenv import load_dotenv
from openai import (
    APIConnectionError,
    APITimeoutError,
    AsyncOpenAI,
    InternalServerError,
    RateLimitError,
)

from app.providers._retry import retry_async
from app.providers.base import Provider, ProviderResponse


_RETRYABLE_OPENAI_EXC = (
    RateLimitError,
    APIConnectionError,
    APITimeoutError,
    InternalServerError,
)


def _is_retryable_openai(exc: Exception) -> bool:
    return isinstance(exc, _RETRYABLE_OPENAI_EXC)


load_dotenv()

# Approximate per-1M-token pricing for gpt-5-mini. Estimate — calibrate against
# the OpenAI billing dashboard after a few runs and update if needed.
_PRICE_PER_1M_INPUT = Decimal("0.25")
_PRICE_PER_1M_OUTPUT = Decimal("2.00")
_PER_TOKEN = Decimal(1_000_000)

# US-focused system instruction. Applied to every query so the model defaults
# to US context for political/policy subjects without putting "US" in any
# rendered prompt. To support non-US subjects later, plumb this through a
# subject-level scope override (geography_or_scope) instead of hardcoding.
_US_INSTRUCTIONS = (
    "Focus your responses on the United States context. When citing examples, "
    "sources, or comparisons, prioritize US-based ones unless the question "
    "explicitly asks about other countries."
)


class OpenAIProvider(Provider):
    """OpenAI provider using the Responses API.

    Uses the Responses API (not Chat Completions) because OpenAI's built-in
    web_search tool is only available there. The provider abstraction is
    unchanged; callers see the same ProviderResponse shape regardless.
    """

    def __init__(self, model_identifier: str) -> None:
        super().__init__(model_identifier)
        # AsyncOpenAI uses httpx.AsyncClient internally — true async I/O.
        self._client = AsyncOpenAI()

    async def query(
        self,
        prompt: str,
        params: dict[str, Any],
        *,
        enable_grounding: bool = True,
        reasoning_enabled: bool = False,
    ) -> ProviderResponse:
        start = time.perf_counter()

        kwargs: dict[str, Any] = {
            "model": self.model_identifier,
            "input": prompt,
            "instructions": _US_INSTRUCTIONS,
        }
        if "temperature" in params:
            kwargs["temperature"] = params["temperature"]
        if "max_tokens" in params:
            kwargs["max_output_tokens"] = params["max_tokens"]
        if enable_grounding:
            kwargs["tools"] = [{
                "type": "web_search",
                "user_location": {"type": "approximate", "country": "US"},
            }]

        # Pick the lowest reasoning effort compatible with the request when
        # reasoning_enabled=False, on gpt-5 family. The web_search tool rejects
        # effort="minimal" with a 400, so use "low" when grounding is on; "minimal"
        # otherwise. Other model families silently omit the param to avoid 400.
        reasoning_param_applied: dict[str, Any] | None = None
        if not reasoning_enabled and self.model_identifier.startswith("gpt-5"):
            effort = "low" if enable_grounding else "minimal"
            kwargs["reasoning"] = {"effort": effort}
            reasoning_param_applied = {"effort": effort}

        try:
            response, retry_count = await retry_async(
                lambda: self._client.responses.create(**kwargs),
                is_retryable=_is_retryable_openai,
            )
        except Exception as e:
            return ProviderResponse(
                text=None,
                metadata={
                    "grounding_enabled": enable_grounding,
                    "reasoning_enabled": reasoning_enabled,
                    "reasoning_param_applied": reasoning_param_applied,
                    "us_focused": True,
                    "search_user_location_country": "US" if enable_grounding else None,
                },
                success=False,
                error=str(e),
                latency_ms=int((time.perf_counter() - start) * 1000),
                cost_usd=Decimal(0),
            )

        elapsed_ms = int((time.perf_counter() - start) * 1000)

        text = getattr(response, "output_text", None) or ""

        usage = getattr(response, "usage", None)
        input_tokens = getattr(usage, "input_tokens", 0) or 0
        output_tokens = getattr(usage, "output_tokens", 0) or 0
        cost = (
            Decimal(input_tokens) * _PRICE_PER_1M_INPUT / _PER_TOKEN
            + Decimal(output_tokens) * _PRICE_PER_1M_OUTPUT / _PER_TOKEN
        )

        search_queries: list[str] = []
        citations: list[dict[str, Any]] = []
        finish_reason: str | None = None

        for item in (response.output or []):
            item_type = getattr(item, "type", None)

            if item_type == "web_search_call":
                action = getattr(item, "action", None)
                if action is not None:
                    q = getattr(action, "query", None) or getattr(action, "search_query", None)
                    if q:
                        search_queries.append(q)
                    else:
                        search_queries.append(str(action))

            elif item_type == "message":
                content = getattr(item, "content", None) or []
                for c in content:
                    annotations = getattr(c, "annotations", None) or []
                    for ann in annotations:
                        if getattr(ann, "type", None) == "url_citation":
                            citations.append(
                                {
                                    "url": getattr(ann, "url", None),
                                    "title": getattr(ann, "title", None),
                                    "start_index": getattr(ann, "start_index", None),
                                    "end_index": getattr(ann, "end_index", None),
                                }
                            )
                status = getattr(item, "status", None)
                if status:
                    finish_reason = str(status)

        metadata: dict[str, Any] = {
            "model": getattr(response, "model", self.model_identifier),
            "prompt_tokens": input_tokens,
            "completion_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
            "finish_reason": finish_reason or "stop",
            "grounding_enabled": enable_grounding,
            "search_queries": search_queries,
            "citations": citations,
            "reasoning_enabled": reasoning_enabled,
            "reasoning_param_applied": reasoning_param_applied,
            "retry_count": retry_count,
            "us_focused": True,
            "search_user_location_country": "US" if enable_grounding else None,
        }

        return ProviderResponse(
            text=text or None,
            metadata=metadata,
            success=True,
            error=None,
            latency_ms=elapsed_ms,
            cost_usd=cost,
        )
