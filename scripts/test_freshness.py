"""One-off diagnostic: how fresh is grounded news from each provider?

Runs a current-events prompt through both providers (grounding default ON,
reasoning default OFF) and prints model id, full response text, citation URLs,
and the most recent publication date found in citation metadata if present.

No database writes. Invoke with:
    python -m scripts.test_freshness
"""
from __future__ import annotations

import asyncio
from datetime import date, datetime
from typing import Any

from app.providers.openai_provider import OpenAIProvider
from app.providers.gemini_provider import GeminiProvider


PROMPT = (
    "What significant news happened in US politics this week? "
    "Please be specific about the dates and events."
)

PROVIDERS_TO_TEST: list[tuple[type, str]] = [
    (OpenAIProvider, "gpt-5-mini"),
    (GeminiProvider, "gemini-2.5-flash"),
]

# Citation-payload field names that might carry a publication date.
DATE_KEYS = ("published_date", "publication_date", "date", "published_at", "pubDate")


def _try_parse_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
        except ValueError:
            pass
        for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d %b %Y", "%b %d, %Y"):
            try:
                return datetime.strptime(value, fmt).date()
            except ValueError:
                continue
    return None


def _collect_pub_dates(citations: list[dict[str, Any]]) -> list[date]:
    found: list[date] = []
    for c in citations:
        for key in DATE_KEYS:
            d = _try_parse_date(c.get(key))
            if d is not None:
                found.append(d)
                break
    return found


async def run_one(ProviderClass: type, model_identifier: str) -> None:
    print()
    print("=" * 70)
    print(f"Provider: {ProviderClass.__name__}")
    print(f"Model:    {model_identifier}")
    print("=" * 70)

    provider = ProviderClass(model_identifier)
    response = await provider.query(PROMPT, params={})

    if not response.success:
        print(f"FAILED: {response.error}")
        return

    print()
    print("--- Response (full) ---")
    print(response.text or "(no text)")

    citations: list[dict[str, Any]] = response.metadata.get("citations") or []
    print()
    print(f"--- Citations ({len(citations)}) ---")
    if not citations:
        print("(no citations returned)")
    else:
        for i, c in enumerate(citations, start=1):
            url = c.get("url") or c.get("uri") or "(no url)"
            title = c.get("title") or "(no title)"
            print(f"{i}. {title}")
            print(f"   {url}")

    pub_dates = _collect_pub_dates(citations)
    print()
    print("--- Most recent publication date in citation metadata ---")
    if pub_dates:
        most_recent = max(pub_dates)
        print(f"{most_recent.isoformat()}  (across {len(pub_dates)} dated citations)")
    else:
        print("(no publication-date fields present in citation metadata)")


async def main() -> None:
    for ProviderClass, model_identifier in PROVIDERS_TO_TEST:
        await run_one(ProviderClass, model_identifier)


if __name__ == "__main__":
    asyncio.run(main())
