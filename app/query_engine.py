"""Category-agnostic prompt runner.

Reads active prompts and active models from the DB, queries each (prompt × model)
pair concurrently, and stores every raw response. No category-specific logic
anywhere — adding a new category later is a YAML + a row insert.

Concurrency: each (prompt × model) is a coroutine; up to max_concurrency run at
once via an asyncio.Semaphore. Each model_responses INSERT is its own small
transaction borrowed from a psycopg connection pool, so writes don't serialize.
asyncio.gather(return_exceptions=True) ensures one query failing doesn't crash
the others.
"""
from __future__ import annotations

import asyncio
import json
import time
from decimal import Decimal

from psycopg_pool import AsyncConnectionPool

from app.db import get_database_url
from app.providers import get_provider


async def run_refresh(
    subject_id: int,
    *,
    verbose: bool = True,
    enable_grounding: bool = True,
    reasoning_enabled: bool = False,
    max_concurrency: int = 26,
) -> int:
    """Run all active prompts × all active models for a subject, concurrently.

    Returns the new refresh_runs.id.
    """
    request_params: dict = {}

    # Pool sized a bit larger than max_concurrency so DB writes never block on
    # a busy pool, plus a couple spares for the bookkeeping connections.
    pool_max = max(max_concurrency + 4, 16)

    async with AsyncConnectionPool(
        get_database_url(), max_size=pool_max, open=False
    ) as pool:
        await pool.open()

        # 1. Read subject, prompts, models; create refresh_runs row.
        async with pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT id, category_id, name, setup_inputs FROM subjects WHERE id = %s",
                    (subject_id,),
                )
                row = await cur.fetchone()
                if row is None:
                    raise ValueError(f"subject {subject_id} not found")
                _, category_id, subject_name, setup_inputs = row

                await cur.execute(
                    """
                    SELECT id, layer, position, dimension, template, version
                    FROM prompts
                    WHERE category_id = %s AND active = TRUE
                    ORDER BY layer DESC, position
                    """,
                    (category_id,),
                )
                prompts = await cur.fetchall()

                await cur.execute(
                    """
                    SELECT id, slug, provider, display_name, model_identifier
                    FROM models
                    WHERE active = TRUE
                    ORDER BY id
                    """
                )
                models = await cur.fetchall()

                if not prompts:
                    raise RuntimeError(
                        f"no active prompts found for category {category_id}"
                    )
                if not models:
                    raise RuntimeError("no active models")

                await cur.execute(
                    """
                    INSERT INTO refresh_runs (subject_id, status, grounding_enabled)
                    VALUES (%s, 'in_progress', %s)
                    RETURNING id
                    """,
                    (subject_id, enable_grounding),
                )
                refresh_run_id = (await cur.fetchone())[0]
            await conn.commit()

        # 2. One provider instance per model row; reused across all prompts.
        provider_instances = {
            model_id: get_provider(provider_slug, model_identifier)
            for model_id, _slug, provider_slug, _display, model_identifier in models
        }

        total_queries = len(prompts) * len(models)
        semaphore = asyncio.Semaphore(max_concurrency)
        completion_state = {"count": 0}
        wall_start = time.perf_counter()

        if verbose:
            print(
                f"refresh_run {refresh_run_id}: '{subject_name}' "
                f"— {len(prompts)} prompts × {len(models)} models = {total_queries} queries "
                f"(max_concurrency={max_concurrency})"
            )

        # 3. Per-(prompt, model) coroutine. Bounded by the semaphore.
        async def run_one(prompt_row, model_row) -> tuple[bool, Decimal]:
            prompt_id, layer, position, _dimension, template, prompt_version = prompt_row
            model_id, model_slug, _provider, _display, model_identifier = model_row

            response = None
            unexpected_error: str | None = None

            async with semaphore:
                try:
                    rendered = template.format(**setup_inputs)
                    provider = provider_instances[model_id]
                    response = await provider.query(
                        rendered,
                        request_params,
                        enable_grounding=enable_grounding,
                        reasoning_enabled=reasoning_enabled,
                    )

                    async with pool.connection() as conn:
                        async with conn.cursor() as cur:
                            await cur.execute(
                                """
                                INSERT INTO model_responses (
                                    refresh_run_id, subject_id, prompt_id, model_id,
                                    rendered_prompt, request_params,
                                    response_text, response_metadata,
                                    success, error_message, latency_ms, cost_usd,
                                    prompt_version, model_identifier
                                ) VALUES (
                                    %s, %s, %s, %s,
                                    %s, %s::jsonb,
                                    %s, %s::jsonb,
                                    %s, %s, %s, %s,
                                    %s, %s
                                )
                                """,
                                (
                                    refresh_run_id, subject_id, prompt_id, model_id,
                                    rendered, json.dumps(request_params),
                                    response.text,
                                    json.dumps(response.metadata, default=str),
                                    response.success, response.error,
                                    response.latency_ms, response.cost_usd,
                                    prompt_version, model_identifier,
                                ),
                            )
                        await conn.commit()
                except Exception as e:
                    unexpected_error = f"unexpected error: {e}"

            # Bookkeeping after lock release. asyncio is single-threaded, so the
            # increment + read are atomic between awaits.
            completion_state["count"] += 1
            n = completion_state["count"]

            if response is not None:
                success = response.success
                cost = response.cost_usd
                latency_ms = response.latency_ms
                err = response.error
            else:
                success = False
                cost = Decimal(0)
                latency_ms = 0
                err = unexpected_error

            if verbose:
                mark = "✓" if success else "✗"
                line = (
                    f"  [{n}/{total_queries}] {layer}/{position} {mark} {model_slug} "
                    f"{latency_ms}ms ${cost}"
                )
                if err:
                    line += f" — {err}"
                print(line)

            return success, cost

        # 4. Dispatch concurrently. return_exceptions=True keeps gather alive
        # even if one task crashes hard (shouldn't happen — run_one catches all).
        tasks = [run_one(p, m) for p in prompts for m in models]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # 5. Aggregate.
        successful = 0
        total_cost = Decimal(0)
        for r in results:
            if isinstance(r, BaseException):
                # run_one shouldn't raise, but if it did, treat as failure.
                continue
            success, cost = r
            if success:
                successful += 1
            total_cost += cost

        if successful == total_queries:
            status = "completed"
        elif successful == 0:
            status = "failed"
        else:
            status = "partial"

        async with pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    UPDATE refresh_runs
                    SET completed_at = NOW(),
                        status = %s,
                        total_queries = %s,
                        successful_queries = %s,
                        total_cost_usd = %s
                    WHERE id = %s
                    """,
                    (status, total_queries, successful, total_cost, refresh_run_id),
                )
            await conn.commit()

        wall_seconds = time.perf_counter() - wall_start
        if verbose:
            print(
                f"refresh_run {refresh_run_id}: {status} — "
                f"{successful}/{total_queries} successful, ${total_cost} total, "
                f"{wall_seconds:.1f}s wall time"
            )

    return refresh_run_id
