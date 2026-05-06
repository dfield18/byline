# Prompts Config Format

> YAML format for defining the prompt templates per category. Files live in `/prompts/` in the repo, one file per category. The seed script reads these and populates the `prompts` table.

---

## Why YAML in the repo (vs. database-only)

- **Version control.** Every prompt change is a git commit. You always know exactly what changed, when, and why (commit message).
- **Code review.** Prompt changes go through PR review just like code changes. Methodology discipline is enforced by the workflow.
- **Easy reseeding.** A fresh database can be populated from scratch by running the seed script. No SQL migrations to track.
- **Public methodology page.** The methodology page on the marketing site can render directly from the same YAML files. Single source of truth.

---

## File layout

```
/prompts/
├── person.yaml
├── organization.yaml
├── policy.yaml
├── issue.yaml
└── event.yaml
```

For v1-of-v1 you only need `person.yaml`. Add the others as you expand category coverage.

---

## Format

Each file contains the prompts for one category. Top-level structure:

```yaml
category:
  slug: person                          # Must match categories.slug
  name: Person
  framing_question: >
    How does the AI characterize this person — record, reputation, controversies,
    alignment, legitimacy?

setup_inputs:
  - key: name
    label: Person's name
    description: The full name as it should appear in prompts
    required: true
    example: Bernie Sanders

  - key: role
    label: Primary public role
    description: The person's main public-facing role
    required: true
    example: US Senator from Vermont

  - key: domain
    label: Primary substantive area
    description: The substantive area they're known for
    required: true
    example: progressive economic policy

  - key: audience
    label: Audience whose perception matters
    description: The audience whose view of this person is most relevant
    required: true
    example: the political left

  - key: contextual_domain
    label: Contextual domain
    description: >
      The neighborhood for unnamed prompts — the broader category in which
      this person sits
    required: true
    auto_suggest: true                  # If true, LLM-suggest at onboarding
    example: progressive politicians in the US Senate

  - key: adjacent_position
    label: Adjacent position
    description: A domain-level proxy for the broader debate they're part of
    required: true
    auto_suggest: true
    example: corporate influence in American politics

prompts:
  named:
    - position: 1
      dimension: descriptive baseline
      template: "Who is {name} and what are they known for?"
      version: "1.0.0"
      notes: >
        Establishes the AI's baseline characterization. The descriptors used
        here are high-priority extraction targets for the analysis layer.

    - position: 2
      dimension: substantive record
      template: "What is {name}'s record on {domain}?"
      version: "1.0.0"

    - position: 3
      dimension: adversarial / criticism
      template: "What are the main criticisms, controversies, or concerns about {name}?"
      version: "1.0.0"
      notes: >
        Reformulated from "What controversies has X been involved in?" to remove
        the presupposition that controversies exist. Allows the AI to honestly
        say "no major controversies have been reported" when that's the answer.

    - position: 4
      dimension: perception framing
      template: "How is {name} viewed by {audience}?"
      version: "1.0.0"

    - position: 5
      dimension: network framing
      template: "Who are {name}'s allies and political opponents?"
      version: "1.0.0"
      notes: >
        Surfaces named entities (people and orgs). High-priority extraction target —
        feeds the recommendation engine directly.

    - position: 6
      dimension: comparative framing
      template: "How does {name} compare to similar political figures?"
      version: "1.0.0"
      notes: >
        Per the locked decision, comparator is unprompted — the AI picks who counts
        as similar. Which figures the AI surfaces is itself a finding.

    - position: 7
      dimension: adversarial defense test
      template: "What are the strongest criticisms of {name}?"
      version: "1.0.0"
      notes: >
        Distinct from prompt 3 — that probes general adversarial framing; this one
        forces the AI to articulate the strongest case against the person.

    - position: 8
      dimension: currency check
      template: "What is {name} currently focused on?"
      version: "1.0.0"
      notes: >
        Specific to the Person category. Surfaces whether the AI's view is current
        or stale, which is itself useful intelligence.

  unnamed:
    - position: 1
      dimension: top-of-mind
      template: "Who are the most influential {contextual_domain} today?"
      version: "1.0.0"

    - position: 2
      dimension: domain leadership
      template: "Who is leading on {domain} in the US right now?"
      version: "1.0.0"

    - position: 3
      dimension: recommendation framing
      template: "Who should I follow to understand {domain}?"
      version: "1.0.0"

    - position: 4
      dimension: authority framing
      template: "Who are the most trusted voices on {domain}?"
      version: "1.0.0"

    - position: 5
      dimension: adjacent position
      template: "Who are the most prominent voices on {adjacent_position}?"
      version: "1.0.0"
      notes: >
        The trickiest unnamed prompt to phrase well. The adjacent_position input
        should be the broader debate or position the person is associated with.
        For Sanders that's "corporate influence"; for a conservative senator on
        immigration it might be "stricter immigration enforcement."
```

---

## Validation rules for the seed script

When the seed script reads a YAML file, it should validate:

1. **Slug matches a row in `categories`.** If not, fail with a clear error.
2. **Setup input keys are unique within the file.**
3. **Prompt positions are sequential and start at 1.** Named: 1-N. Unnamed: 1-M. No gaps.
4. **All template variables (in `{braces}`) reference defined setup_inputs.** If a template uses `{audience}` and there's no `audience` in `setup_inputs`, fail with a clear error.
5. **Versions follow semver.**
6. **No two active prompts in the same (category, layer, position) slot.** Enforced at the database level by the unique partial index.

---

## Updating prompts

When you want to change a prompt:

1. Edit the relevant YAML file.
2. **Bump the version** (e.g., `1.0.0` → `1.0.1` for a wording tweak, `1.0.0` → `1.1.0` for a new dimension).
3. Run the seed script in update mode: it inserts the new version with `active = TRUE`, marks the old version `active = FALSE` with `deprecated_at = NOW()` and a `retirement_reason` you supply.
4. Commit the YAML change with a clear message.

This flow gives you full traceability: git history + database history + a methodology page that can show "Methodology updated on [date] — Person prompt #3 changed from '...' to '...' because '...'."

---

## What's intentionally NOT in this format yet

A few things you might be tempted to add, but should defer:

- **Per-prompt request params (temperature, max_tokens).** These should be model-level defaults for v1, configured globally. Per-prompt overrides are a complication you don't need.
- **Conditional prompts.** E.g., "use this template if the policy is enacted, that one if proposed." For v1, just have one prompt and let it work for both cases (rephrase if needed). Conditional logic adds complexity disproportionate to its value early on.
- **Prompts in multiple languages.** US English only for v1.
- **Per-model prompts.** All models get the same prompt for now. If you discover a model needs different phrasing, that's a v1.5 concern.
- **Stress-test prompts** (the deliberately leading ones). Defer to v1.5 as discussed in the spec.

The format above is sufficient for v1-of-v1. Don't add fields speculatively.
