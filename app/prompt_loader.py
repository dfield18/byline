"""Read a prompts YAML file, validate it, and upsert into the prompts table.

Update behavior, per docs/prompts-config-format.md:
- New slot (no active row): INSERT.
- Same version, identical content: no-op.
- Same version, content changed: ERROR — you must bump the version when editing a prompt.
- Different version: deprecate the old active row, INSERT the new one. Single transaction.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml

from app.db import get_connection


SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")
TEMPLATE_VAR_RE = re.compile(r"\{(\w+)\}")


class PromptLoaderError(Exception):
    pass


def _load_yaml(path: Path) -> dict[str, Any]:
    with path.open() as f:
        return yaml.safe_load(f)


def _validate(data: dict[str, Any]) -> None:
    if "category" not in data or "slug" not in data["category"]:
        raise PromptLoaderError("missing 'category.slug'")

    if "setup_inputs" not in data or not isinstance(data["setup_inputs"], list):
        raise PromptLoaderError("missing or malformed 'setup_inputs'")

    keys = [si["key"] for si in data["setup_inputs"]]
    if len(keys) != len(set(keys)):
        raise PromptLoaderError("setup_input keys must be unique within the file")
    valid_vars = set(keys)

    if "prompts" not in data:
        raise PromptLoaderError("missing 'prompts'")

    for layer in ("named", "unnamed"):
        if layer not in data["prompts"]:
            raise PromptLoaderError(f"missing 'prompts.{layer}'")
        prompts_list = data["prompts"][layer]

        # Positions must be unique positive integers. Gaps are allowed —
        # deactivated prompts can be omitted entirely from YAML rather than
        # kept around with active:false placeholders. The DB rows for
        # historically-used positions persist regardless of YAML presence.
        positions = [p["position"] for p in prompts_list]
        if len(positions) != len(set(positions)):
            raise PromptLoaderError(
                f"{layer} positions must be unique within layer; got {positions}"
            )
        if any(not isinstance(pos, int) or pos < 1 for pos in positions):
            raise PromptLoaderError(
                f"{layer} positions must be positive integers; got {positions}"
            )

        for p in prompts_list:
            if not SEMVER_RE.match(p["version"]):
                raise PromptLoaderError(
                    f"{layer} #{p['position']}: version '{p['version']}' is not semver"
                )
            prompt_type = p.get("type", "fixed")
            if prompt_type not in ("fixed", "generated"):
                raise PromptLoaderError(
                    f"{layer} #{p['position']}: type must be 'fixed' or 'generated', "
                    f"got {prompt_type!r}"
                )
            template_vars = set(TEMPLATE_VAR_RE.findall(p["template"]))
            unknown = template_vars - valid_vars
            if unknown:
                raise PromptLoaderError(
                    f"{layer} #{p['position']}: template references undefined variables: {sorted(unknown)}"
                )


def _normalize_notes(notes: str | None) -> str | None:
    if notes is None:
        return None
    return notes.strip() or None


def _upsert(data: dict[str, Any]) -> dict[str, int]:
    slug = data["category"]["slug"]
    counts = {
        "inserted": 0,
        "noop": 0,
        "versioned": 0,
        "deactivated": 0,
        "inactive_noop": 0,
    }

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM categories WHERE slug = %s", (slug,))
            row = cur.fetchone()
            if not row:
                raise PromptLoaderError(
                    f"category slug '{slug}' not found. Run `python -m app.seed` first."
                )
            category_id = row[0]

            for layer in ("named", "unnamed"):
                for p in data["prompts"][layer]:
                    position = p["position"]
                    new_version = p["version"]
                    new_template = p["template"]
                    new_dimension = p["dimension"]
                    new_notes = _normalize_notes(p.get("notes"))
                    new_type = p.get("type", "fixed")
                    new_active = p.get("active", True)

                    cur.execute(
                        """
                        SELECT id, version, template, dimension, notes, type
                        FROM prompts
                        WHERE category_id = %s AND layer = %s AND position = %s AND active = TRUE
                        """,
                        (category_id, layer, position),
                    )
                    existing = cur.fetchone()

                    # Handle YAML-side deactivation: prompt entry marked
                    # active: false. Deactivate any existing active row for
                    # this slot; never insert a new row in this state.
                    if not new_active:
                        if existing is None:
                            counts["inactive_noop"] += 1
                        else:
                            retire_reason = (
                                p.get("retirement_reason")
                                or "Removed via active:false in YAML"
                            )
                            cur.execute(
                                """
                                UPDATE prompts
                                SET active = FALSE,
                                    deprecated_at = NOW(),
                                    retirement_reason = %s
                                WHERE id = %s
                                """,
                                (retire_reason, existing[0]),
                            )
                            counts["deactivated"] += 1
                        continue

                    if existing is None:
                        cur.execute(
                            """
                            INSERT INTO prompts (
                                category_id, layer, position, dimension,
                                template, version, notes, type
                            )
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                            """,
                            (
                                category_id, layer, position, new_dimension,
                                new_template, new_version, new_notes, new_type,
                            ),
                        )
                        counts["inserted"] += 1
                        continue

                    old_id, old_version, old_template, old_dimension, old_notes, old_type = existing
                    same_content = (
                        old_template == new_template
                        and old_dimension == new_dimension
                        and _normalize_notes(old_notes) == new_notes
                        and old_type == new_type
                    )

                    if old_version == new_version:
                        if not same_content:
                            raise PromptLoaderError(
                                f"{layer} #{position}: content changed but version is still {old_version}. "
                                "Bump the version when editing a prompt."
                            )
                        counts["noop"] += 1
                    else:
                        cur.execute(
                            """
                            UPDATE prompts
                            SET active = FALSE,
                                deprecated_at = NOW(),
                                retirement_reason = %s
                            WHERE id = %s
                            """,
                            (f"Superseded by version {new_version}", old_id),
                        )
                        cur.execute(
                            """
                            INSERT INTO prompts (
                                category_id, layer, position, dimension,
                                template, version, notes, type
                            )
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                            """,
                            (
                                category_id, layer, position, new_dimension,
                                new_template, new_version, new_notes, new_type,
                            ),
                        )
                        counts["versioned"] += 1

            conn.commit()

    return counts


def load_prompts_file(path: Path) -> dict[str, int]:
    data = _load_yaml(path)
    _validate(data)
    return _upsert(data)
