"""CLI entry point: run a refresh on a subject.

Usage:
    python -m app.refresh "Bernie Sanders"

If the subject doesn't already exist, you'll be prompted to pick a category
and fill in the setup inputs for it. The script then runs all active prompts
across all active models for that subject and stores the responses.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import typer
import yaml

from app.db import get_cursor
from app.query_engine import run_refresh


PROMPTS_DIR = Path("prompts")


def _find_subject_by_name(name: str) -> Optional[int]:
    with get_cursor(commit=False) as cur:
        cur.execute("SELECT id FROM subjects WHERE name = %s", (name,))
        row = cur.fetchone()
        return row[0] if row else None


def _pick_category() -> tuple[int, str]:
    """Interactively pick a category. Returns (category_id, slug)."""
    with get_cursor(commit=False) as cur:
        cur.execute(
            "SELECT id, slug, name FROM categories WHERE active = TRUE ORDER BY id"
        )
        cats = cur.fetchall()

    if not cats:
        typer.echo(
            "error: no active categories in the database. "
            "Run `python -m app.seed` first.",
            err=True,
        )
        raise typer.Exit(code=1)

    typer.echo("\nAvailable categories:")
    for i, (_, slug, name) in enumerate(cats, start=1):
        typer.echo(f"  {i}. {name} ({slug})")

    while True:
        choice = typer.prompt("\nPick a category number", type=int)
        if 1 <= choice <= len(cats):
            cat_id, slug, _ = cats[choice - 1]
            return cat_id, slug
        typer.echo(f"  Please pick a number between 1 and {len(cats)}.")


def _load_setup_inputs_def(slug: str) -> list[dict]:
    yaml_path = PROMPTS_DIR / f"{slug}.yaml"
    if not yaml_path.exists():
        typer.echo(
            f"error: no prompts file found at {yaml_path}. "
            f"This category has no prompts configured yet, "
            f"so a refresh would have nothing to run.",
            err=True,
        )
        raise typer.Exit(code=1)
    with yaml_path.open() as f:
        data = yaml.safe_load(f)
    return data.get("setup_inputs", [])


def _prompt_for_setup_inputs(setup_inputs_def: list[dict], name: str) -> dict:
    """Prompt for each setup_input field. Returns the dict to store as JSONB."""
    values: dict[str, str] = {"name": name}
    typer.echo(
        "\nFill in the setup inputs (these get substituted into prompt templates):"
    )
    for si in setup_inputs_def:
        key = si["key"]
        if key == "name":
            continue  # already provided as the CLI argument
        label = si.get("label", key)
        description = (si.get("description") or "").strip()
        example = si.get("example")

        header = label + (f"  (e.g. {example})" if example else "")
        typer.echo(f"\n{header}")
        if description:
            typer.echo(f"  {description}")
        values[key] = typer.prompt(">")
    return values


def _create_subject(category_id: int, name: str, setup_inputs: dict) -> int:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO subjects (category_id, name, setup_inputs)
            VALUES (%s, %s, %s::jsonb)
            RETURNING id
            """,
            (category_id, name, json.dumps(setup_inputs)),
        )
        return cur.fetchone()[0]


def _summarize(refresh_run_id: int):
    with get_cursor(commit=False) as cur:
        cur.execute(
            """
            SELECT s.name, r.status, r.successful_queries, r.total_queries,
                   r.total_cost_usd,
                   EXTRACT(EPOCH FROM (r.completed_at - r.started_at))::int AS seconds
            FROM refresh_runs r
            JOIN subjects s ON r.subject_id = s.id
            WHERE r.id = %s
            """,
            (refresh_run_id,),
        )
        return cur.fetchone()


def main(
    name: str = typer.Argument(..., help="Subject name (e.g. 'Bernie Sanders')"),
) -> None:
    subject_id = _find_subject_by_name(name)
    if subject_id is None:
        typer.echo(f"\nNo subject named '{name}' found. Let's create one.")
        category_id, slug = _pick_category()
        setup_inputs_def = _load_setup_inputs_def(slug)
        setup_inputs = _prompt_for_setup_inputs(setup_inputs_def, name)
        subject_id = _create_subject(category_id, name, setup_inputs)
        typer.echo(f"\nCreated subject id={subject_id}: {name}")
    else:
        typer.echo(f"\nFound existing subject id={subject_id}: {name}")

    refresh_run_id = run_refresh(subject_id)
    subject_name, status, successful, total, cost, seconds = _summarize(refresh_run_id)

    typer.echo(
        f"\nCompleted refresh for {subject_name}: "
        f"{successful}/{total} successful, ${cost:.2f} total cost, "
        f"{seconds} seconds elapsed"
    )


if __name__ == "__main__":
    typer.run(main)
