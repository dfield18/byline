"""Seed 5 plausible 2028 GOP presidential candidates as person subjects.

Run from the repo root:
    python -m scripts.seed_2028_gop

Creates subjects under org_id='org_internal' (the dev/operator org —
matches what the auth dep falls back to when no Clerk session is
present, so the dashboard at /subjects will list these immediately).

Idempotent: a duplicate (org_id, name) raises ValueError from
create_subject, which we catch and treat as a skip. Re-running the
script after a partial failure will only insert the missing rows.

This script does NOT trigger snapshots — that would cost real
OpenAI + Google tokens per subject. After it runs, kick off a
snapshot per subject from the dashboard "Take snapshot" button, or
via `python -m app.refresh "<name>"` from the CLI.
"""

from __future__ import annotations

from typing import Any

from dashboard.lib.queries import create_subject


_ORG_ID = "org_internal"

# Each entry is the per-subject setup_inputs dict that drives prompt
# rendering. The full schema for `person` lives in prompts/person.yaml
# (search for setup_inputs); fields below cover every required key.
#
# Values are short, factual, neutral characterizations of public
# political figures — the same kind of thing a user would type into
# the /subjects/new form themselves. No editorializing.
_CANDIDATES: list[dict[str, Any]] = [
    {
        "name": "J.D. Vance",
        "role": "US Vice President",
        "primary_domain": "populist conservative policy",
        "secondary_domain": "industrial policy",
        "tertiary_domain": "immigration enforcement",
        "audience": "the conservative movement",
        "contextual_domain": "Republican leaders shaping the post-Trump GOP",
        "adjacent_position": "the future of American conservatism",
        "role_category": "Republican presidential contenders",
        "presidential_candidate_2028": True,
        "pronoun_subject": "he",
        "pronoun_be": "is",
        "pronoun_possessive": "his",
        "canonical_url": "https://www.whitehouse.gov/administration/vice-president-vance/",
    },
    {
        "name": "Marco Rubio",
        "role": "US Secretary of State",
        "primary_domain": "foreign policy",
        "secondary_domain": "China policy",
        "tertiary_domain": "Latin America policy",
        "audience": "the Republican foreign-policy establishment",
        "contextual_domain": "Republican leaders shaping the post-Trump GOP",
        "adjacent_position": "American posture toward China",
        "role_category": "Republican presidential contenders",
        "presidential_candidate_2028": True,
        "pronoun_subject": "he",
        "pronoun_be": "is",
        "pronoun_possessive": "his",
        "canonical_url": "https://www.state.gov/biographies/marco-rubio/",
    },
    {
        "name": "Ron DeSantis",
        "role": "Governor of Florida",
        "primary_domain": "state-level conservative governance",
        "secondary_domain": "education policy",
        "tertiary_domain": "immigration enforcement",
        "audience": "the conservative movement",
        "contextual_domain": "Republican governors with national profiles",
        "adjacent_position": "the future of American conservatism",
        "role_category": "Republican presidential contenders",
        "presidential_candidate_2028": True,
        "pronoun_subject": "he",
        "pronoun_be": "is",
        "pronoun_possessive": "his",
        "canonical_url": "https://www.flgov.com/",
    },
    {
        "name": "Vivek Ramaswamy",
        "role": "Governor of Ohio",
        "primary_domain": "anti-ESG and corporate-governance reform",
        "secondary_domain": "deregulation",
        "tertiary_domain": "federal government restructuring",
        "audience": "the conservative movement",
        "contextual_domain": "Republican governors with national profiles",
        "adjacent_position": "the future of American conservatism",
        "role_category": "Republican presidential contenders",
        "presidential_candidate_2028": True,
        "pronoun_subject": "he",
        "pronoun_be": "is",
        "pronoun_possessive": "his",
    },
    {
        "name": "Glenn Youngkin",
        "role": "Former Governor of Virginia",
        "primary_domain": "suburban Republican coalition-building",
        "secondary_domain": "education policy",
        "tertiary_domain": "economic policy",
        "audience": "moderate and suburban conservatives",
        "contextual_domain": "Republican leaders shaping the post-Trump GOP",
        "adjacent_position": "the future of American conservatism",
        "role_category": "Republican presidential contenders",
        "presidential_candidate_2028": True,
        "pronoun_subject": "he",
        "pronoun_be": "is",
        "pronoun_possessive": "his",
    },
]


def main() -> None:
    created: list[tuple[int, str]] = []
    skipped: list[str] = []
    failed: list[tuple[str, str]] = []

    for entry in _CANDIDATES:
        name = entry["name"]
        try:
            row = create_subject(
                org_id=_ORG_ID,
                category_slug="person",
                name=name,
                setup_inputs=entry,
            )
            created.append((row["id"], name))
            print(f"  + created  [{row['id']}] {name}")
        except ValueError as e:
            # Either duplicate (already exists) or category lookup miss.
            # In practice for this script it's nearly always a duplicate.
            msg = str(e)
            if "already exists" in msg:
                skipped.append(name)
                print(f"  · skipped  {name} (already exists)")
            else:
                failed.append((name, msg))
                print(f"  ! failed   {name}: {msg}")

    print()
    print(f"Summary: created={len(created)} skipped={len(skipped)} failed={len(failed)}")
    if created:
        print()
        print("Next: trigger a snapshot for each new subject from the dashboard")
        print('  ("Take snapshot" button) or via the CLI:')
        for _, name in created:
            print(f'    python -m app.refresh "{name}"')


if __name__ == "__main__":
    main()
