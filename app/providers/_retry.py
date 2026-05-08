"""Small retry-with-backoff helper for provider API calls.

Retries on rate-limit (429) and transient server/network errors. Re-raises
non-retryable errors immediately. Each provider supplies its own
`is_retryable` predicate so we don't need to know exception types
across providers in one place.
"""
from __future__ import annotations

import asyncio
import random
from typing import Awaitable, Callable, TypeVar


T = TypeVar("T")


DEFAULT_MAX_ATTEMPTS = 4
DEFAULT_BASE_DELAY = 1.0  # seconds


async def retry_async(
    fn: Callable[[], Awaitable[T]],
    *,
    is_retryable: Callable[[Exception], bool],
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    base_delay: float = DEFAULT_BASE_DELAY,
    on_retry: Callable[[int, Exception], None] | None = None,
) -> tuple[T, int]:
    """Call `fn()` up to `max_attempts` times with exponential backoff + jitter.

    Returns `(result, retry_count)` where retry_count is how many retries
    happened before success (0 means succeeded on first attempt).

    Retries when `is_retryable(exception)` returns True. Re-raises otherwise.
    Backoff: base_delay * 2**n + jitter (0–0.5s) between attempts.
    """
    last_error: Exception | None = None
    for attempt in range(max_attempts):
        try:
            result = await fn()
            return result, attempt
        except Exception as e:
            last_error = e
            if not is_retryable(e) or attempt + 1 == max_attempts:
                raise
            delay = base_delay * (2 ** attempt) + random.uniform(0, 0.5)
            if on_retry is not None:
                on_retry(attempt + 1, e)
            await asyncio.sleep(delay)

    # Unreachable in practice — the loop either returns or raises.
    assert last_error is not None
    raise last_error
