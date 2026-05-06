"""Idempotent seed.

Usage:
    python -m app.seed                     # seed categories + models
    python -m app.seed prompts/person.yaml # load prompts for a category
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import typer

from app.db import get_cursor
from app.prompt_loader import PromptLoaderError, load_prompts_file


CATEGORIES: list[tuple[str, str, str]] = [
    (
        "person",
        "Person",
        "How does the AI characterize this person — record, reputation, controversies, alignment, legitimacy?",
    ),
    (
        "organization",
        "Organization",
        "How does the AI characterize this organization — mission, credibility, influence, alignment, track record?",
    ),
    (
        "policy",
        "Policy",
        "How does the AI describe what this policy does, its effects, who supports/opposes, and the tradeoffs?",
    ),
    (
        "issue",
        "Issue",
        "How does the AI characterize this contested topic — what frame dominates, whose narrative is centered?",
    ),
    (
        "event",
        "Event",
        "What happened, who's responsible, what does it mean, what's the lasting takeaway?",
    ),
]


# Update these identifiers as new stable models ship.
MODELS: list[tuple[str, str, str, str, str | None]] = [
    ("chatgpt", "openai", "ChatGPT (GPT-5.2)", "gpt-5.2", None),
    ("gemini", "google", "Gemini 2.5 Pro", "gemini-2.5-pro", None),
]


def seed_categories() -> int:
    with get_cursor() as cur:
        for slug, name, framing in CATEGORIES:
            cur.execute(
                """
                INSERT INTO categories (slug, name, framing_question)
                VALUES (%s, %s, %s)
                ON CONFLICT (slug) DO UPDATE SET
                    name = EXCLUDED.name,
                    framing_question = EXCLUDED.framing_question
                """,
                (slug, name, framing),
            )
        cur.execute("SELECT COUNT(*) FROM categories")
        return cur.fetchone()[0]


def seed_models() -> int:
    with get_cursor() as cur:
        for slug, provider, display_name, identifier, notes in MODELS:
            cur.execute(
                """
                INSERT INTO models (slug, provider, display_name, model_identifier, notes)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (slug) DO UPDATE SET
                    provider = EXCLUDED.provider,
                    display_name = EXCLUDED.display_name,
                    model_identifier = EXCLUDED.model_identifier,
                    notes = EXCLUDED.notes
                """,
                (slug, provider, display_name, identifier, notes),
            )
        cur.execute("SELECT COUNT(*) FROM models")
        return cur.fetchone()[0]


def main(
    yaml_path: Optional[Path] = typer.Argument(
        None,
        help="Path to a prompts YAML file. If omitted, seeds categories and models.",
        exists=False,
    ),
) -> None:
    if yaml_path is None:
        category_count = seed_categories()
        model_count = seed_models()
        typer.echo(f"categories: {category_count} rows")
        typer.echo(f"models: {model_count} rows")
        return

    if not yaml_path.exists():
        typer.echo(f"error: {yaml_path} does not exist", err=True)
        raise typer.Exit(code=1)

    try:
        counts = load_prompts_file(yaml_path)
    except PromptLoaderError as e:
        typer.echo(f"error: {e}", err=True)
        raise typer.Exit(code=1)

    typer.echo(
        f"prompts from {yaml_path}: "
        f"{counts['inserted']} inserted, {counts['versioned']} version-bumped, {counts['noop']} unchanged"
    )


if __name__ == "__main__":
    typer.run(main)
