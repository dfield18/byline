from __future__ import annotations

import os
import time
from decimal import Decimal
from typing import Any

from dotenv import load_dotenv
from google import genai
from google.genai import types

from app.providers.base import Provider, ProviderResponse


load_dotenv()

# Approximate per-1M-token pricing for Gemini 2.5 Pro. Update when pricing changes.
_PRICE_PER_1M_INPUT = Decimal("1.25")
_PRICE_PER_1M_OUTPUT = Decimal("10.00")
_PER_TOKEN = Decimal(1_000_000)


class GeminiProvider(Provider):
    def __init__(self, model_identifier: str) -> None:
        super().__init__(model_identifier)
        self._client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

    def query(self, prompt: str, params: dict[str, Any]) -> ProviderResponse:
        start = time.perf_counter()

        config: types.GenerateContentConfig | None = None
        config_kwargs: dict[str, Any] = {}
        if "temperature" in params:
            config_kwargs["temperature"] = params["temperature"]
        if "max_tokens" in params:
            config_kwargs["max_output_tokens"] = params["max_tokens"]
        if config_kwargs:
            config = types.GenerateContentConfig(**config_kwargs)

        try:
            response = self._client.models.generate_content(
                model=self.model_identifier,
                contents=prompt,
                config=config,
            )
        except Exception as e:
            return ProviderResponse(
                text=None,
                metadata={},
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

        metadata: dict[str, Any] = {
            "model": self.model_identifier,
            "prompt_tokens": input_tokens,
            "completion_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
        }
        if response.candidates:
            metadata["finish_reason"] = str(response.candidates[0].finish_reason)

        return ProviderResponse(
            text=text,
            metadata=metadata,
            success=True,
            error=None,
            latency_ms=elapsed_ms,
            cost_usd=cost,
        )
