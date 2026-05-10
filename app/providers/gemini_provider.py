from __future__ import annotations

import os
import time
import warnings
from decimal import Decimal
from typing import Any

from dotenv import load_dotenv
from google import genai
from google.genai import types

from app.providers._retry import retry_async
from app.providers.base import Provider, ProviderResponse


_RETRYABLE_GEMINI_SUBSTRINGS = (
    "429",
    "rate limit",
    "resource_exhausted",
    "503",
    "502",
    "504",
    "unavailable",
    "deadline_exceeded",
    "timeout",
)


def _is_retryable_gemini(exc: Exception) -> bool:
    """The google-genai SDK raises generic errors with HTTP-style messages; we
    inspect the stringified error rather than depend on a specific class.
    """
    message = str(exc).lower()
    return any(s in message for s in _RETRYABLE_GEMINI_SUBSTRINGS)


load_dotenv()

# Per-1M-token pricing for gemini-2.5-flash (paid tier, standard).
# Source: https://ai.google.dev/pricing — update when pricing changes.
_PRICE_PER_1M_INPUT = Decimal("0.30")
_PRICE_PER_1M_OUTPUT = Decimal("2.50")
_PER_TOKEN = Decimal(1_000_000)

# US-focused system instruction. Applied to every query so the model defaults
# to US context. Gemini's GoogleSearch grounding doesn't have a clean country
# parameter, so the system_instruction is the main lever here.
_US_SYSTEM_INSTRUCTION = (
    "Focus your responses on the United States context. When citing examples, "
    "sources, or comparisons, prioritize US-based ones unless the question "
    "explicitly asks about other countries."
)


class GeminiProvider(Provider):
    def __init__(self, model_identifier: str) -> None:
        super().__init__(model_identifier)
        self._client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

    async def query(
        self,
        prompt: str,
        params: dict[str, Any],
        *,
        enable_grounding: bool = True,
        reasoning_enabled: bool = False,
    ) -> ProviderResponse:
        start = time.perf_counter()

        config_kwargs: dict[str, Any] = {
            "system_instruction": _US_SYSTEM_INSTRUCTION,
        }
        if "temperature" in params:
            config_kwargs["temperature"] = params["temperature"]
        if "max_tokens" in params:
            config_kwargs["max_output_tokens"] = params["max_tokens"]
        if enable_grounding:
            config_kwargs["tools"] = [types.Tool(google_search=types.GoogleSearch())]

        # Disable internal thinking on Flash variants when reasoning_enabled=False.
        # Pro variants don't fully support disabling thinking; warn and pass through.
        thinking_config_applied: dict[str, Any] | None = None
        if not reasoning_enabled:
            if "flash" in self.model_identifier.lower():
                config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=0)
                thinking_config_applied = {"thinking_budget": 0}
            else:
                warnings.warn(
                    f"reasoning_enabled=False is not fully supported on "
                    f"{self.model_identifier!r} (non-Flash variant); passing through "
                    f"without thinking_config",
                    UserWarning,
                    stacklevel=2,
                )

        config = types.GenerateContentConfig(**config_kwargs) if config_kwargs else None

        try:
            # genai.Client.aio.* exposes true async methods backed by aiohttp.
            response, retry_count = await retry_async(
                lambda: self._client.aio.models.generate_content(
                    model=self.model_identifier,
                    contents=prompt,
                    config=config,
                ),
                is_retryable=_is_retryable_gemini,
            )
        except Exception as e:
            return ProviderResponse(
                text=None,
                metadata={
                    "grounding_enabled": enable_grounding,
                    "reasoning_enabled": reasoning_enabled,
                    "thinking_config_applied": thinking_config_applied,
                    "us_focused": True,
                },
                success=False,
                error=str(e),
                latency_ms=int((time.perf_counter() - start) * 1000),
                cost_usd=Decimal(0),
            )

        elapsed_ms = int((time.perf_counter() - start) * 1000)

        text = response.text
        usage = getattr(response, "usage_metadata", None)
        input_tokens = getattr(usage, "prompt_token_count", 0) or 0
        output_tokens = getattr(usage, "candidates_token_count", 0) or 0
        cost = (
            Decimal(input_tokens) * _PRICE_PER_1M_INPUT / _PER_TOKEN
            + Decimal(output_tokens) * _PRICE_PER_1M_OUTPUT / _PER_TOKEN
        )

        search_queries: list[str] = []
        citations: list[dict[str, Any]] = []
        finish_reason: str | None = None

        if response.candidates:
            candidate = response.candidates[0]
            finish_reason_obj = getattr(candidate, "finish_reason", None)
            if finish_reason_obj is not None:
                finish_reason = str(finish_reason_obj)

            grounding = getattr(candidate, "grounding_metadata", None)
            if grounding is not None:
                queries = getattr(grounding, "web_search_queries", None) or []
                search_queries = list(queries)

                chunks = getattr(grounding, "grounding_chunks", None) or []
                for chunk in chunks:
                    web = getattr(chunk, "web", None)
                    if web is not None:
                        citations.append(
                            {
                                "uri": getattr(web, "uri", None),
                                "title": getattr(web, "title", None),
                            }
                        )

        metadata: dict[str, Any] = {
            "model": self.model_identifier,
            "prompt_tokens": input_tokens,
            "completion_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
            "finish_reason": finish_reason,
            "grounding_enabled": enable_grounding,
            "search_queries": search_queries,
            "citations": citations,
            "reasoning_enabled": reasoning_enabled,
            "thinking_config_applied": thinking_config_applied,
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
