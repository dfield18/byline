from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any


@dataclass
class ProviderResponse:
    text: str | None
    metadata: dict[str, Any]
    success: bool
    error: str | None
    latency_ms: int
    cost_usd: Decimal


class Provider(ABC):
    """Uniform interface for AI model providers.

    Implementations must never raise on API errors; capture them in
    ProviderResponse.error and set success=False.
    """

    def __init__(self, model_identifier: str) -> None:
        self.model_identifier = model_identifier

    @abstractmethod
    async def query(
        self,
        prompt: str,
        params: dict[str, Any],
        *,
        enable_grounding: bool = True,
        reasoning_enabled: bool = False,
    ) -> ProviderResponse:
        ...
