from app.providers.base import Provider, ProviderResponse
from app.providers.openai_provider import OpenAIProvider
from app.providers.gemini_provider import GeminiProvider
from app.providers.anthropic_provider import AnthropicProvider
from app.providers.perplexity_provider import PerplexityProvider


PROVIDERS: dict[str, type[Provider]] = {
    "openai": OpenAIProvider,
    "google": GeminiProvider,
    "anthropic": AnthropicProvider,
    "perplexity": PerplexityProvider,
}


def get_provider(provider_slug: str, model_identifier: str) -> Provider:
    cls = PROVIDERS.get(provider_slug)
    if cls is None:
        raise ValueError(f"unknown provider: {provider_slug!r}")
    return cls(model_identifier)


__all__ = ["Provider", "ProviderResponse", "PROVIDERS", "get_provider"]
