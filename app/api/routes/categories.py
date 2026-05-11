"""app/api/routes/categories.py — category-scoped metadata.

Exposes the active prompt slots (5+5 layout) and the setup_inputs
schema per category. The frontend uses the schema to render the
new-subject form with the right fields per chosen category.
"""
from __future__ import annotations

from pathlib import Path

import yaml
from fastapi import APIRouter, Depends, HTTPException

from app.api.auth import User, current_user
from dashboard.lib.queries import list_active_slots


router = APIRouter(prefix="/api/categories", tags=["categories"])

_VALID_CATEGORIES = {"person", "organization", "issue", "policy", "event"}
_PROMPTS_DIR = Path(__file__).resolve().parents[3] / "prompts"


@router.get("/{category_slug}/slots")
async def list_slots(category_slug: str, user: User = Depends(current_user)):
    """Active prompt slots (the 5+5 layout) for a category, ordered
    named-first then by position."""
    if category_slug not in _VALID_CATEGORIES:
        raise HTTPException(
            status_code=404,
            detail=f"category '{category_slug}' not found. valid: {sorted(_VALID_CATEGORIES)}",
        )
    return list_active_slots(category_slug)


@router.get("/{category_slug}/setup-inputs")
async def get_setup_inputs(
    category_slug: str, user: User = Depends(current_user)
):
    """Setup-inputs schema from prompts/{slug}.yaml — drives the form
    fields on the new-subject page. `type: generated` fields (e.g.,
    recent_news, which is fetched via web search at refresh time) are
    filtered out — the user shouldn't fill them in."""
    if category_slug not in _VALID_CATEGORIES:
        raise HTTPException(
            status_code=404,
            detail=f"category '{category_slug}' not found",
        )

    yaml_path = _PROMPTS_DIR / f"{category_slug}.yaml"
    if not yaml_path.exists():
        raise HTTPException(
            status_code=500,
            detail=f"prompts file not found for category '{category_slug}'",
        )

    with yaml_path.open() as f:
        data = yaml.safe_load(f)

    schema = []
    for si in data.get("setup_inputs", []):
        # Hide generated inputs (LLM-populated at refresh time) — the
        # user shouldn't see them in the form.
        if si.get("type") == "generated":
            continue
        schema.append({
            "key": si["key"],
            "label": si.get("label", si["key"]),
            "description": si.get("description"),
            "required": bool(si.get("required", False)),
            "example": si.get("example"),
            "type": si.get("type", "string"),
        })

    return {"category": category_slug, "setup_inputs": schema}
