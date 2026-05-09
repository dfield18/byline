"""CLI entry point: run a refresh on a subject.

Usage:
    python -m app.refresh "Bernie Sanders"

If the subject doesn't already exist, you'll be prompted to pick a category
and fill in the setup inputs for it. The script then runs all active prompts
across all active models for that subject and stores the responses.
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import typer
import yaml

from app.db import get_cursor
from app.providers import get_provider
from app.query_engine import run_refresh


# Recent news is re-fetched if the cached value is older than this.
_RECENT_NEWS_MAX_AGE = timedelta(days=7)


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


def _solicit_one_input(si: dict) -> tuple[bool, object]:
    """Prompt the user for one setup_input. Returns (skipped, value).

    - For type=boolean: typer.confirm, returns Python bool.
    - For optional fields where the user enters nothing: returns (skipped=True, None).
    - Otherwise: typer.prompt, returns string.
    """
    key = si["key"]
    label = si.get("label", key)
    description = (si.get("description") or "").strip()
    example = si.get("example")
    required = si.get("required", True)
    field_type = si.get("type", "string")

    header = label
    if example is not None and field_type != "boolean":
        header += f"  (e.g. {example})"
    if not required and field_type != "boolean":
        header += "  [optional, press Enter to skip]"

    typer.echo(f"\n{header}")
    if description:
        typer.echo(f"  {description}")

    if field_type == "boolean":
        default = bool(example) if isinstance(example, bool) else False
        return False, typer.confirm(">", default=default)

    if required:
        return False, typer.prompt(">")

    v = typer.prompt(">", default="", show_default=False)
    if v.strip():
        return False, v
    return True, None


def _prompt_for_setup_inputs(setup_inputs_def: list[dict], name: str) -> dict:
    """Prompt for each setup_input field. Returns the dict to store as JSONB.

    Skips: 'name' (already from CLI arg) and 'recent_news' (auto-populated
    later via web search). Optional fields allow empty input. Boolean fields
    use typer.confirm.
    """
    values: dict = {"name": name}
    typer.echo(
        "\nFill in the setup inputs (these get substituted into prompt templates):"
    )
    for si in setup_inputs_def:
        key = si["key"]
        if key == "name":
            continue
        if key == "recent_news":
            continue  # populated later by _ensure_recent_news_fresh
        skipped, value = _solicit_one_input(si)
        if not skipped:
            values[key] = value
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


def _ensure_setup_inputs_complete(subject_id: int, name: str) -> None:
    """If the subject's setup_inputs is missing keys that the active YAML now
    declares as required, prompt the user interactively and persist the
    missing values. This handles the case where a prompts YAML evolves
    (new variables added) after a subject was originally created.
    """
    with get_cursor(commit=False) as cur:
        cur.execute(
            """
            SELECT s.setup_inputs, c.slug
            FROM subjects s
            JOIN categories c ON s.category_id = c.id
            WHERE s.id = %s
            """,
            (subject_id,),
        )
        current_inputs, category_slug = cur.fetchone()

    setup_inputs_def = _load_setup_inputs_def(category_slug)
    missing = [
        si
        for si in setup_inputs_def
        if si.get("required", False) and si["key"] not in current_inputs
    ]
    if not missing:
        return

    typer.echo(
        f"\n'{name}' is missing {len(missing)} setup input(s) required by the "
        f"current prompts YAML. Fill them in to continue:"
    )
    new_values: dict = {}
    for si in missing:
        skipped, value = _solicit_one_input(si)
        if not skipped:
            new_values[si["key"]] = value

    if not new_values:
        return

    with get_cursor() as cur:
        cur.execute(
            "UPDATE subjects SET setup_inputs = setup_inputs || %s::jsonb WHERE id = %s",
            (json.dumps(new_values), subject_id),
        )
    typer.echo(
        f"\nUpdated '{name}' with {', '.join(new_values.keys())}."
    )


async def _fetch_recent_news_via_web(subject_name: str) -> str | None:
    """Fetch a short summary of recent news about the subject via grounded LLM.

    Uses Gemini Flash with Google Search grounding (cheapest grounded option).
    Returns None on any failure; the caller decides whether that's fatal.
    """
    provider = get_provider("google", "gemini-2.5-flash")
    meta_prompt = (
        f"Briefly summarize the most significant recent news or current events "
        f"involving {subject_name} from the past 30 days. Focus on substantive "
        f"policy actions, public statements, legislative work, or notable "
        f"controversies. Output 2-3 sentences. Just the summary text — no "
        f"preamble, no introductory phrases."
    )
    try:
        response = await provider.query(
            meta_prompt, {}, enable_grounding=True, reasoning_enabled=False
        )
    except Exception:
        return None
    if response.success and response.text:
        return response.text.strip()
    return None


def _ensure_recent_news_fresh(subject_id: int, name: str) -> None:
    """Ensure subject's recent_news is at most 7 days old. Re-fetch if stale or
    missing. Failures are non-fatal: the refresh continues with the previous
    value (or with the field absent) so a transient web-search outage doesn't
    block a refresh.
    """
    with get_cursor(commit=False) as cur:
        cur.execute(
            "SELECT setup_inputs FROM subjects WHERE id = %s",
            (subject_id,),
        )
        inputs = cur.fetchone()[0]

    cached_at_str = inputs.get("recent_news_fetched_at")
    cached_text = inputs.get("recent_news")
    if cached_text and cached_at_str:
        try:
            cached_at = datetime.fromisoformat(cached_at_str)
            if datetime.now(timezone.utc) - cached_at < _RECENT_NEWS_MAX_AGE:
                # Cache hit — within 7 days. No re-fetch.
                return
        except (ValueError, TypeError):
            pass  # malformed timestamp; fall through and refetch

    typer.echo(
        "\nRefreshing recent_news via web search "
        f"(cached >7d old or missing for '{name}')..."
    )
    fetched = asyncio.run(_fetch_recent_news_via_web(name))
    if not fetched:
        if cached_text:
            typer.echo("  (web search failed; keeping previous value)")
        else:
            typer.echo("  (web search failed; recent_news will remain unset)")
        return

    new_values = {
        "recent_news": fetched,
        "recent_news_fetched_at": datetime.now(timezone.utc).isoformat(),
    }
    with get_cursor() as cur:
        cur.execute(
            "UPDATE subjects SET setup_inputs = setup_inputs || %s::jsonb WHERE id = %s",
            (json.dumps(new_values), subject_id),
        )
    preview = fetched[:140] + ("..." if len(fetched) > 140 else "")
    typer.echo(f"  fetched: {preview}")


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
    max_concurrency: int = typer.Option(
        26,
        "--max-concurrency",
        help="Max queries running in parallel (default 26 — every query in a "
        "26-query refresh fires at once; floor is the slowest single call).",
    ),
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
        _ensure_setup_inputs_complete(subject_id, name)

    # Re-fetch recent_news if cached value is older than 7 days (or missing).
    # Non-fatal: a web-search failure doesn't block the refresh.
    _ensure_recent_news_fresh(subject_id, name)

    refresh_run_id = asyncio.run(
        run_refresh(subject_id, max_concurrency=max_concurrency)
    )
    subject_name, status, successful, total, cost, seconds = _summarize(refresh_run_id)

    typer.echo(
        f"\nCompleted refresh for {subject_name}: "
        f"{successful}/{total} successful, ${cost:.2f} total cost, "
        f"{seconds} seconds elapsed"
    )


if __name__ == "__main__":
    typer.run(main)
