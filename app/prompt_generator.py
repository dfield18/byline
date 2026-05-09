"""Meta-LLM helper for generating natural-sounding prompts at refresh time.

Used by the engine when a prompt has type='generated': the prompts.template
field contains an instruction (rendered with the subject's setup_inputs),
and this helper sends that instruction to a small, fast LLM to produce the
actual question that gets sent to measurement providers.

Intentionally:
- No grounding (the meta-LLM shouldn't add web facts; it just rephrases what
  it's given).
- No reasoning (saves cost; the task is generation, not analysis).
- Low temperature (some reproducibility, but generated prompts are not
  expected to be byte-identical across runs).
"""
from __future__ import annotations

from app.providers import get_provider


# Pinned generation model. If this changes, methodology comparisons across
# runs that used different generators become apples-to-oranges — capture
# this in metadata per row so that's traceable.
_GENERATION_PROVIDER_SLUG = "google"
_GENERATION_MODEL_IDENTIFIER = "gemini-2.5-flash"


def get_generation_model() -> str:
    """Returns the model identifier currently used for prompt generation."""
    return _GENERATION_MODEL_IDENTIFIER


async def generate_natural_prompt(instruction: str) -> str | None:
    """Send a generation instruction to the meta-LLM. Returns the produced
    question, or None on failure. Failure is non-fatal at the call site —
    the engine should record it as a failed query and continue.
    """
    provider = get_provider(_GENERATION_PROVIDER_SLUG, _GENERATION_MODEL_IDENTIFIER)
    try:
        response = await provider.query(
            instruction,
            {"temperature": 0.3},
            enable_grounding=False,
            reasoning_enabled=False,
        )
    except Exception:
        return None
    if response.success and response.text:
        return response.text.strip()
    return None
