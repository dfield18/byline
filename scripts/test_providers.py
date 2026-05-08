# scripts/test_providers.py
import asyncio

from app.providers.openai_provider import OpenAIProvider
from app.providers.gemini_provider import GeminiProvider


prompt = "What is the Inflation Reduction Act?"

PROVIDERS_TO_TEST = [
    (OpenAIProvider, "gpt-5-mini"),
    (GeminiProvider, "gemini-2.5-flash"),
]


async def main() -> None:
    for ProviderClass, model_identifier in PROVIDERS_TO_TEST:
        provider = ProviderClass(model_identifier)
        response = await provider.query(prompt, params={})
        print(f"\n{'='*60}")
        print(f"Provider: {ProviderClass.__name__}")
        print(f"Success: {response.success}")
        print(f"Latency: {response.latency_ms}ms")
        print(f"Cost: ${response.cost_usd}")
        print(f"Text (first 300 chars): {response.text[:300] if response.text else 'NONE'}")
        if not response.success:
            print(f"Error: {response.error}")


if __name__ == "__main__":
    asyncio.run(main())
