"""Category-agnostic prompt runner.

Reads active prompts and active models from the DB, queries each (prompt × model)
pair, and stores every raw response. No category-specific logic anywhere — adding
a new category later is a YAML + a row insert.
"""
from __future__ import annotations

import json
from decimal import Decimal

from app.db import get_connection
from app.providers import get_provider


def run_refresh(subject_id: int, *, verbose: bool = True) -> int:
    """Run all active prompts × all active models for a subject.

    Returns the new refresh_runs.id.
    """
    request_params: dict = {}

    with get_connection() as conn:
        cur = conn.cursor()

        cur.execute(
            "SELECT id, category_id, name, setup_inputs FROM subjects WHERE id = %s",
            (subject_id,),
        )
        row = cur.fetchone()
        if row is None:
            raise ValueError(f"subject {subject_id} not found")
        _, category_id, subject_name, setup_inputs = row

        cur.execute(
            """
            SELECT id, layer, position, dimension, template, version
            FROM prompts
            WHERE category_id = %s AND active = TRUE
            ORDER BY layer DESC, position
            """,
            (category_id,),
        )
        prompts = cur.fetchall()

        cur.execute(
            """
            SELECT id, slug, provider, display_name, model_identifier
            FROM models
            WHERE active = TRUE
            ORDER BY id
            """
        )
        models = cur.fetchall()

        if not prompts:
            raise RuntimeError(f"no active prompts found for category {category_id}")
        if not models:
            raise RuntimeError("no active models")

        cur.execute(
            "INSERT INTO refresh_runs (subject_id, status) VALUES (%s, 'in_progress') RETURNING id",
            (subject_id,),
        )
        refresh_run_id = cur.fetchone()[0]
        conn.commit()

        provider_instances = {
            model_id: get_provider(provider_slug, model_identifier)
            for model_id, _slug, provider_slug, _display, model_identifier in models
        }

        total_queries = len(prompts) * len(models)
        successful = 0
        total_cost = Decimal(0)
        index = 0

        if verbose:
            print(
                f"refresh_run {refresh_run_id}: '{subject_name}' "
                f"— {len(prompts)} prompts × {len(models)} models = {total_queries} queries"
            )

        for prompt_id, layer, position, _dimension, template, prompt_version in prompts:
            rendered = template.format(**setup_inputs)

            for model_id, model_slug, _provider, _display, model_identifier in models:
                index += 1
                provider = provider_instances[model_id]
                response = provider.query(rendered, request_params)

                cur.execute(
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
                        response.text, json.dumps(response.metadata, default=str),
                        response.success, response.error, response.latency_ms, response.cost_usd,
                        prompt_version, model_identifier,
                    ),
                )
                conn.commit()

                if response.success:
                    successful += 1
                total_cost += response.cost_usd

                if verbose:
                    mark = "✓" if response.success else "✗"
                    print(
                        f"  [{index}/{total_queries}] {layer}/{position} {mark} {model_slug} "
                        f"{response.latency_ms}ms ${response.cost_usd}"
                        + (f" — {response.error}" if response.error else "")
                    )

        if successful == total_queries:
            status = "completed"
        elif successful == 0:
            status = "failed"
        else:
            status = "partial"

        cur.execute(
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
        conn.commit()

        if verbose:
            print(f"refresh_run {refresh_run_id}: {status} — {successful}/{total_queries} successful, ${total_cost} total")

    return refresh_run_id
