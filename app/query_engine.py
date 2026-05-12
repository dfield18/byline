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
from datetime import date
from decimal import Decimal

from psycopg_pool import AsyncConnectionPool

from app.db import get_database_url
from app.prompt_generator import generate_natural_prompt, get_generation_model
from app.providers import get_provider


# Versioned so we can iterate the prefix wording later without losing
# the audit trail. Stamped on each historical model_responses row in
# response_metadata.historical_prompt_prefix_version.
HISTORICAL_PROMPT_PREFIX_VERSION = "v1"


def _retrospective_prefix(as_of_date: date) -> str:
    """The exact prefix prepended to each rendered prompt for historical
    estimates. Instructs the model to (a) frame the answer as if it were
    `as_of_date`, (b) constrain its web search queries to `before:` that
    date. Validated in Phase 0 round 3: gpt-5-mini reliably emits the
    `before:` operator on every search query when this prefix is in
    place."""
    iso = as_of_date.isoformat()
    human = as_of_date.strftime("%B %-d, %Y")  # e.g. "April 14, 2026"
    return (
        f"For this question, answer as if today's date were {human}. "
        f"When you use web search, restrict your queries to sources "
        f"published on or before {human} by adding a `before:{iso}` "
        f"filter to your search queries (for example: "
        f"`Barack Obama criticism before:{iso}`). Ignore any results "
        f"dated after {human}. If pre-date sources are insufficient to "
        f"answer, say so explicitly rather than relying on your post-"
        f"date knowledge.\n\nQuestion: "
    )


async def run_refresh(
    subject_id: int,
    *,
    verbose: bool = True,
    enable_grounding: bool = True,
    reasoning_enabled: bool = False,
    max_concurrency: int = 26,
    historical_as_of: date | None = None,
) -> int:
    """Run all active prompts × all active models for a subject, concurrently.

    Returns the new refresh_runs.id.

    Historical mode: when `historical_as_of` is set, this is a retrospective
    parametric+date-filtered refresh, not a live one. Concretely:
      - Grounding stays ON (web_search is the whole point — the model is
        instructed to constrain queries with `before:{date}` so results
        reflect pre-date sources).
      - Generated prompts (`type='generated'`) are skipped — they depend on
        `recent_news` which is fetched live and is meaningless retroactively.
      - Each rendered prompt gets the retrospective prefix prepended.
      - refresh_runs.is_historical_estimate = TRUE.
      - Each model_responses.response_metadata is stamped with
        historical_as_of + historical_prompt_prefix_version.
    """
    is_historical = historical_as_of is not None
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

                # Historical refreshes skip generated prompts entirely —
                # they depend on recent_news, which is live-fetched and has
                # no retrospective analog. Live refreshes run all active
                # prompts.
                if is_historical:
                    await cur.execute(
                        """
                        SELECT id, layer, position, dimension, template, version, type
                        FROM prompts
                        WHERE category_id = %s AND active = TRUE
                          AND type = 'fixed'
                        ORDER BY layer DESC, position
                        """,
                        (category_id,),
                    )
                else:
                    await cur.execute(
                        """
                        SELECT id, layer, position, dimension, template, version, type
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
                    INSERT INTO refresh_runs (
                        subject_id, status, grounding_enabled,
                        is_historical_estimate, historical_as_of
                    )
                    VALUES (%s, 'in_progress', %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        subject_id, enable_grounding,
                        is_historical, historical_as_of,
                    ),
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

        # Pre-render all prompts. type='fixed' uses str.format directly.
        # type='generated' renders the instruction with setup_inputs, then
        # calls a meta-LLM to produce the actual question. Generation is
        # done once per (subject, prompt) so both providers see the same
        # generated text for that slot.
        #
        # Historical mode: prepend the retrospective prefix to every
        # rendered prompt. Stamp historical_as_of in extra_metadata so
        # downstream queries can audit which prefix version produced
        # which response.
        prefix = _retrospective_prefix(historical_as_of) if is_historical else ""
        historical_meta = (
            {
                "historical_as_of": historical_as_of.isoformat(),
                "historical_prompt_prefix_version": HISTORICAL_PROMPT_PREFIX_VERSION,
            }
            if is_historical
            else {}
        )

        prerendered: dict[int, dict] = {}
        gen_tasks: list = []
        gen_prompt_ids: list = []
        for prompt_row in prompts:
            prompt_id, _layer, _pos, _dim, template, _ver, prompt_type = prompt_row
            try:
                instruction_or_prompt = template.format(**setup_inputs)
            except KeyError as e:
                prerendered[prompt_id] = {
                    "rendered": None,
                    "extra_metadata": {
                        "prompt_type": prompt_type,
                        "render_error": f"missing setup_input: {e}",
                        **historical_meta,
                    },
                    "error": f"missing setup_input: {e}",
                }
                continue
            if prompt_type == "generated":
                # Generated prompts should already have been filtered out
                # of the SELECT for historical refreshes, but defensive:
                # if one sneaks in, skip generation and record as failed.
                if is_historical:
                    prerendered[prompt_id] = {
                        "rendered": None,
                        "extra_metadata": {
                            "prompt_type": "generated",
                            "render_error": "generated prompts skipped in historical mode",
                            **historical_meta,
                        },
                        "error": "generated prompts skipped in historical mode",
                    }
                    continue
                gen_tasks.append(generate_natural_prompt(instruction_or_prompt))
                gen_prompt_ids.append((prompt_id, instruction_or_prompt))
            else:
                prerendered[prompt_id] = {
                    "rendered": prefix + instruction_or_prompt,
                    "extra_metadata": {"prompt_type": "fixed", **historical_meta},
                    "error": None,
                }

        if gen_tasks:
            if verbose:
                print(f"  pre-rendering {len(gen_tasks)} generated prompt(s) via meta-LLM...")
            gen_results = await asyncio.gather(*gen_tasks, return_exceptions=True)
            for (prompt_id, instruction), gen_result in zip(gen_prompt_ids, gen_results):
                if isinstance(gen_result, BaseException) or gen_result is None:
                    error_str = (
                        f"prompt generation crashed: {gen_result}"
                        if isinstance(gen_result, BaseException)
                        else "prompt generation returned empty"
                    )
                    prerendered[prompt_id] = {
                        "rendered": None,
                        "extra_metadata": {
                            "prompt_type": "generated",
                            "generation_instruction_rendered": instruction,
                            "generation_model": get_generation_model(),
                        },
                        "error": error_str,
                    }
                else:
                    prerendered[prompt_id] = {
                        "rendered": gen_result,
                        "extra_metadata": {
                            "prompt_type": "generated",
                            "generation_instruction_rendered": instruction,
                            "generation_model": get_generation_model(),
                        },
                        "error": None,
                    }

        # 3. Per-(prompt, model) coroutine. Bounded by the semaphore.
        async def run_one(prompt_row, model_row) -> tuple[bool, Decimal]:
            prompt_id, layer, position, _dimension, _template, prompt_version, _ptype = prompt_row
            model_id, model_slug, _provider, _display, model_identifier = model_row

            response = None
            unexpected_error: str | None = None
            pr = prerendered[prompt_id]
            extra_meta = pr["extra_metadata"]

            async with semaphore:
                if pr["error"] or pr["rendered"] is None:
                    # Pre-render failed (e.g., generated prompt's meta-LLM
                    # returned empty, or a setup_input was missing). Record
                    # a failed model_responses row for bookkeeping.
                    fallback_text = (
                        extra_meta.get("generation_instruction_rendered")
                        or "(prompt could not be rendered)"
                    )
                    failure_metadata = {**extra_meta, "render_error": pr["error"]}
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
                                    fallback_text, json.dumps(request_params),
                                    None, json.dumps(failure_metadata, default=str),
                                    False, pr["error"], 0, Decimal(0),
                                    prompt_version, model_identifier,
                                ),
                            )
                        await conn.commit()
                else:
                    try:
                        rendered = pr["rendered"]
                        provider = provider_instances[model_id]
                        response = await provider.query(
                            rendered,
                            request_params,
                            enable_grounding=enable_grounding,
                            reasoning_enabled=reasoning_enabled,
                        )

                        merged_metadata = {**response.metadata, **extra_meta}

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
                                        json.dumps(merged_metadata, default=str),
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
                err = unexpected_error or pr["error"]

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
