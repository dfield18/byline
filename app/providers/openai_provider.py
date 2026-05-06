from __future__ import annotations

import time
from decimal import Decimal
from typing import Any

from dotenv import load_dotenv
from openai import OpenAI

from app.providers.base import Provider, ProviderResponse


load_dotenv()

# Approximate per-1M-token pricing for GPT-5.2. Update when OpenAI changes pricing.
_PRICE_PER_1M_INPUT = Decimal("1.25")
_PRICE_PER_1M_OUTPUT = Decimal("10.00")
_PER_TOKEN = Decimal(1_000_000)


class OpenAIProvider(Provider):
    def __init__(self, model_identifier: str) -> None:
        super().__init__(model_identifier)
        self._client = OpenAI()

    def query(self, prompt: str, params: dict[str, Any]) -> ProviderResponse:
        start = time.perf_counter()
        kwargs: dict[str, Any] = {
            "model": self.model_identifier,
            "messages": [{"role": "user", "content": prompt}],
        }
        if "temperature" in params:
            kwargs["temperature"] = params["temperature"]
        if "max_tokens" in params:
            kwargs["max_tokens"] = params["max_tokens"]

        try:
            response = self._client.chat.completions.create(**kwargs)
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

        text = response.choices[0].message.content
        usage = response.usage
        input_tokens = getattr(usage, "prompt_tokens", 0) or 0
        output_tokens = getattr(usage, "completion_tokens", 0) or 0
        cost = (
            Decimal(input_tokens) * _PRICE_PER_1M_INPUT / _PER_TOKEN
            + Decimal(output_tokens) * _PRICE_PER_1M_OUTPUT / _PER_TOKEN
        )

        metadata: dict[str, Any] = {
            "model": response.model,
            "finish_reason": response.choices[0].finish_reason,
            "prompt_tokens": input_tokens,
            "completion_tokens": output_tokens,
            "total_tokens": getattr(usage, "total_tokens", input_tokens + output_tokens),
        }

        return ProviderResponse(
            text=text,
            metadata=metadata,
            success=True,
            error=None,
            latency_ms=elapsed_ms,
            cost_usd=cost,
        )
