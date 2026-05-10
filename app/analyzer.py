"""app/analyzer.py — Analysis layer extractors and runner.

Reads model_responses (immutable raw layer); writes response_extractions and
analysis_runs. Every output row tagged with methodology_version (currently
'analysis-1.0.0'). Re-running on the same refresh creates a NEW analysis_run
and a NEW set of extraction rows; old rows stay intact for historical
comparison.

CLI:
    python -m app.analyzer <refresh_run_id> [--limit N] [--max-concurrency N]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

import psycopg
from dotenv import load_dotenv
from google import genai
from google.genai import types
from psycopg.types.json import Json

from app.db import get_database_url
from app.providers._retry import retry_async

load_dotenv()

METHODOLOGY_VERSION = "analysis-1.0.0"
DEFAULT_MAX_CONCURRENCY = 26

# Per-1M-token pricing for the Gemini models we use in extraction.
# Source: https://ai.google.dev/pricing — update when pricing changes.
_PRICING: dict[str, dict[str, Decimal]] = {
    "gemini-2.5-flash-lite": {"input": Decimal("0.075"), "output": Decimal("0.30")},
    "gemini-2.5-flash":      {"input": Decimal("0.30"),  "output": Decimal("2.50")},
}
_PER_TOKEN = Decimal(1_000_000)


# ─── data shapes ───────────────────────────────────────────────────────


@dataclass
class ExtractionResult:
    """One extractor's output for one model_response."""

    output: Any                      # The JSONB-shaped result; None on failure
    error: str | None                # None on success
    cost_usd: Decimal
    latency_ms: int


@dataclass
class ResponseToAnalyze:
    """A model_response row joined with its subject and prompt context."""

    id: int
    subject_id: int
    subject_name: str
    subject_setup_inputs: dict
    model_id: int
    prompt_id: int
    layer: str                       # 'named' | 'unnamed'
    response_text: str


# ─── extractor abstraction ─────────────────────────────────────────────


class Extractor(ABC):
    """Subclass and implement extract() to add a new extractor.

    Each extractor maps to one JSONB column on response_extractions
    (via output_column). The runner collects results from all extractors
    for a given response and writes a single row.
    """

    name: str
    version: str
    output_column: str

    @abstractmethod
    async def extract(self, response: ResponseToAnalyze) -> ExtractionResult:
        ...


# ─── descriptor extractor ──────────────────────────────────────────────

_RETRYABLE_GEMINI_SUBSTRINGS = (
    "429", "rate limit", "resource_exhausted",
    "503", "502", "504", "unavailable", "deadline_exceeded", "timeout",
)


def _is_retryable_gemini(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(s in msg for s in _RETRYABLE_GEMINI_SUBSTRINGS)


_DESCRIPTOR_PROMPT = """\
You will be given an AI assistant's response about {subject_name}.

Extract every adjective or descriptive noun phrase that the response uses to \
characterize {subject_name} as a person — but ONLY if BOTH of the following \
are true:

(A) VERBATIM: The descriptor appears word-for-word in the response text.
(B) GRAMMATICALLY ATTACHED TO THE SUBJECT: The descriptor is being used to \
describe {subject_name} the person, not to describe something they did, made, \
or are associated with.

Test for each candidate descriptor: ask "Is this adjective describing \
{subject_name} the person, or is it describing something else (their policies, \
their record, their actions, their initiatives, their positions, other people, \
or anything else adjacent)?" If the adjective is describing anything OTHER THAN \
the person directly, do NOT extract it.

Examples of what NOT to extract (even though the words appear verbatim):
- "He has advanced progressive policies" → do NOT extract "progressive" \
(it describes the policies)
- "Pragmatic governance is his hallmark" → do NOT extract "pragmatic" \
(it describes the governance)
- "Critics call his moderate positions disappointing" → do NOT extract \
"moderate" (it describes the positions)
- "Many progressives criticize him" → do NOT extract "progressive" \
(it describes the critics)
- "He launched an innovative initiative" → do NOT extract "innovative" \
(it describes the initiative)
- "The aggressive climate law was signed by him" → do NOT extract "aggressive" \
(it describes the law)
- "Strong support from his base" → do NOT extract "strong" (it describes the support)

Examples of what DOES count (verbatim AND grammatically attached to the subject):
- "Sanders is a progressive" → extract "progressive"
- "Critics call him a firebrand" → extract "firebrand"
- "He has been described as polarizing" → extract "polarizing"
- "Newsom is widely seen as ambitious" → extract "ambitious"
- "Some commentators call him pragmatic" → extract "pragmatic" (said of him directly)
- "Bernie remains the conscience of the progressive left" → extract "conscience of \
the progressive left"

Also do NOT extract:
- Job titles or factual roles ("Senator", "Governor", "businessman") on their own
- Generic action verbs or events
- Descriptors attached to OTHER people, not {subject_name}

For each qualifying descriptor:
- word: the descriptor exactly as it appeared (or a clean form if awkwardly inflected)
- valence: -1.0 to 1.0 — sentiment of the descriptor in this context
- confidence: 0.0 to 1.0 — confidence the descriptor is verbatim AND directly \
describes the subject
- excerpt: the sentence containing the descriptor verbatim attached to the subject

Return an empty array if no qualifying descriptors are present. Empty arrays \
are correct and expected for many responses (e.g., responses describing actions \
or reactions rather than the person themselves).

RESPONSE TO ANALYZE:
{response_text}
"""

_DESCRIPTOR_SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "word":       {"type": "STRING"},
            "valence":    {"type": "NUMBER"},
            "confidence": {"type": "NUMBER"},
            "excerpt":    {"type": "STRING"},
        },
        "required": ["word", "valence", "confidence", "excerpt"],
    },
}


class DescriptorExtractor(Extractor):
    """Pulls characterizing adjectives/labels attached to the subject.

    Uses gemini-2.5-flash-lite with structured-output JSON schema. No web
    grounding; the response is parsed-only.
    """

    name = "descriptors"
    version = "1.3"
    output_column = "descriptors"
    model_identifier = "gemini-2.5-flash"

    def __init__(self) -> None:
        self._client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

    async def extract(self, response: ResponseToAnalyze) -> ExtractionResult:
        start = time.perf_counter()
        prompt = _DESCRIPTOR_PROMPT.format(
            subject_name=response.subject_name,
            response_text=response.response_text,
        )
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_DESCRIPTOR_SCHEMA,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        )

        try:
            api_response, _ = await retry_async(
                lambda: self._client.aio.models.generate_content(
                    model=self.model_identifier,
                    contents=prompt,
                    config=config,
                ),
                is_retryable=_is_retryable_gemini,
            )
        except Exception as e:
            return ExtractionResult(
                output=None,
                error=str(e),
                cost_usd=Decimal(0),
                latency_ms=int((time.perf_counter() - start) * 1000),
            )

        elapsed_ms = int((time.perf_counter() - start) * 1000)

        usage = getattr(api_response, "usage_metadata", None)
        input_tokens = getattr(usage, "prompt_token_count", 0) or 0
        output_tokens = getattr(usage, "candidates_token_count", 0) or 0
        prices = _PRICING[self.model_identifier]
        cost = (
            Decimal(input_tokens) * prices["input"] / _PER_TOKEN
            + Decimal(output_tokens) * prices["output"] / _PER_TOKEN
        )

        try:
            parsed = json.loads(api_response.text) if api_response.text else []
        except Exception as e:
            return ExtractionResult(
                output=None,
                error=f"JSON parse failed: {e}",
                cost_usd=cost,
                latency_ms=elapsed_ms,
            )

        return ExtractionResult(
            output=parsed,
            error=None,
            cost_usd=cost,
            latency_ms=elapsed_ms,
        )


# ─── runner ────────────────────────────────────────────────────────────


def _load_responses(
    refresh_run_id: int, *, limit: int | None = None
) -> tuple[int, list[ResponseToAnalyze]]:
    """Load the refresh's successful responses (with subject + prompt context)."""
    with psycopg.connect(get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT subject_id FROM refresh_runs WHERE id = %s",
                (refresh_run_id,),
            )
            row = cur.fetchone()
            if not row:
                raise ValueError(f"refresh_run_id {refresh_run_id} not found")
            subject_id = row[0]

            sql = """
                SELECT
                    mr.id, mr.subject_id, s.name, s.setup_inputs,
                    mr.model_id, mr.prompt_id, p.layer, mr.response_text
                FROM model_responses mr
                JOIN subjects s ON s.id = mr.subject_id
                JOIN prompts p ON p.id = mr.prompt_id
                WHERE mr.refresh_run_id = %s AND mr.success = TRUE
                ORDER BY mr.id
            """
            params: tuple[Any, ...] = (refresh_run_id,)
            if limit is not None:
                sql += " LIMIT %s"
                params = (refresh_run_id, limit)
            cur.execute(sql, params)
            rows = cur.fetchall()

    responses = [
        ResponseToAnalyze(
            id=r[0],
            subject_id=r[1],
            subject_name=r[2],
            subject_setup_inputs=r[3],
            model_id=r[4],
            prompt_id=r[5],
            layer=r[6],
            response_text=r[7],
        )
        for r in rows
    ]
    return subject_id, responses


def _create_analysis_run(
    refresh_run_id: int,
    subject_id: int,
    extractor_versions: dict,
    total_responses: int,
) -> int:
    with psycopg.connect(get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO analysis_runs (
                    refresh_run_id, subject_id, status,
                    methodology_version, extractor_versions, total_responses
                ) VALUES (%s, %s, 'in_progress', %s, %s, %s)
                RETURNING id
                """,
                (
                    refresh_run_id,
                    subject_id,
                    METHODOLOGY_VERSION,
                    Json(extractor_versions),
                    total_responses,
                ),
            )
            (analysis_run_id,) = cur.fetchone()
        conn.commit()
    return analysis_run_id


def _insert_extraction_row(
    cur: psycopg.Cursor,
    analysis_run_id: int,
    response: ResponseToAnalyze,
    extractors: list[Extractor],
    results: dict[str, ExtractionResult],
) -> None:
    """Insert one response_extractions row with all extractor outputs merged."""
    columns: dict[str, Any] = {
        "analysis_run_id": analysis_run_id,
        "model_response_id": response.id,
        "subject_id": response.subject_id,
        "model_id": response.model_id,
        "prompt_id": response.prompt_id,
        "layer": response.layer,
        "methodology_version": METHODOLOGY_VERSION,
    }

    errors: dict[str, str | None] = {}
    total_cost = Decimal(0)
    total_latency = 0

    for extractor in extractors:
        result = results[extractor.name]
        if result.output is not None:
            columns[extractor.output_column] = Json(result.output)
        errors[extractor.name] = result.error
        total_cost += result.cost_usd
        total_latency += result.latency_ms

    if any(v is not None for v in errors.values()):
        columns["extraction_errors"] = Json(errors)

    columns["extraction_cost_usd"] = total_cost
    columns["extraction_latency_ms"] = total_latency

    col_names = list(columns.keys())
    placeholders = ", ".join(["%s"] * len(col_names))
    col_str = ", ".join(col_names)
    cur.execute(
        f"INSERT INTO response_extractions ({col_str}) VALUES ({placeholders})",
        tuple(columns.values()),
    )


def _update_analysis_run(
    analysis_run_id: int,
    status: str,
    successful: int,
    total_cost: Decimal,
    error_message: str | None = None,
) -> None:
    with psycopg.connect(get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE analysis_runs
                SET completed_at = NOW(),
                    status = %s,
                    successful_extractions = %s,
                    total_cost_usd = %s,
                    error_message = %s
                WHERE id = %s
                """,
                (status, successful, total_cost, error_message, analysis_run_id),
            )
        conn.commit()


async def run_analysis(
    refresh_run_id: int,
    extractors: list[Extractor],
    *,
    max_concurrency: int = DEFAULT_MAX_CONCURRENCY,
    limit: int | None = None,
) -> int:
    """Run all extractors over every successful model_response in the refresh.

    Returns the new analysis_run_id.
    """
    subject_id, responses = _load_responses(refresh_run_id, limit=limit)
    if not responses:
        raise ValueError(
            f"No successful model_responses for refresh_run {refresh_run_id}"
        )

    extractor_versions = {e.name: e.version for e in extractors}
    analysis_run_id = _create_analysis_run(
        refresh_run_id, subject_id, extractor_versions, len(responses)
    )

    semaphore = asyncio.Semaphore(max_concurrency)

    async def analyze_one(
        resp: ResponseToAnalyze,
    ) -> tuple[ResponseToAnalyze, dict[str, ExtractionResult]]:
        async with semaphore:
            outcomes = await asyncio.gather(*[e.extract(resp) for e in extractors])
            results = {e.name: r for e, r in zip(extractors, outcomes)}
            return resp, results

    successful = 0
    total_cost = Decimal(0)
    failure_msg: str | None = None

    try:
        all_outcomes = await asyncio.gather(*[analyze_one(r) for r in responses])

        with psycopg.connect(get_database_url()) as conn:
            with conn.cursor() as cur:
                for resp, results in all_outcomes:
                    _insert_extraction_row(
                        cur, analysis_run_id, resp, extractors, results
                    )
                    if all(r.error is None for r in results.values()):
                        successful += 1
                    total_cost += sum(
                        (r.cost_usd for r in results.values()), Decimal(0)
                    )
            conn.commit()
    except Exception as e:
        failure_msg = str(e)

    if failure_msg:
        status = "failed"
    elif successful == len(responses):
        status = "completed"
    else:
        status = "partial"

    _update_analysis_run(
        analysis_run_id, status, successful, total_cost, failure_msg
    )
    return analysis_run_id


# ─── cli ───────────────────────────────────────────────────────────────


async def _cli_main() -> None:
    parser = argparse.ArgumentParser(
        description="Run analysis extractors over a refresh_run."
    )
    parser.add_argument(
        "refresh_run_id", type=int, help="ID of the refresh_run to analyze"
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Analyze only the first N responses (for testing).",
    )
    parser.add_argument(
        "--max-concurrency", type=int, default=DEFAULT_MAX_CONCURRENCY,
        help=f"Max concurrent extractor calls (default: {DEFAULT_MAX_CONCURRENCY}).",
    )
    args = parser.parse_args()

    extractors: list[Extractor] = [DescriptorExtractor()]
    print(
        f"Running {len(extractors)} extractor(s) over refresh_run "
        f"{args.refresh_run_id}"
        + (f" (limit {args.limit})" if args.limit else "")
        + "..."
    )
    analysis_run_id = await run_analysis(
        args.refresh_run_id,
        extractors,
        max_concurrency=args.max_concurrency,
        limit=args.limit,
    )
    print(f"Done. analysis_run_id = {analysis_run_id}")


if __name__ == "__main__":
    asyncio.run(_cli_main())
