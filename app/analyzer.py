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
from dataclasses import dataclass, field
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
    """One extractor's output for one model_response.

    `output` populates the extractor's primary output_column as JSON.
    `extra_columns` lets an extractor also write to scalar columns on the
    same response_extractions row — e.g., the sources extractor writes to
    `total_sources_cited` (int) and `cited_own_site` (bool) alongside the
    `sources` JSONB blob. Values in extra_columns are written as-is.
    """

    output: Any                      # The JSONB-shaped result; None on failure
    error: str | None                # None on success
    cost_usd: Decimal
    latency_ms: int
    extra_columns: dict[str, Any] = field(default_factory=dict)


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
    response_metadata: dict          # Citations, search_queries, etc.


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


# ─── sources extractor ─────────────────────────────────────────────────

# Curated domain → source_type slug. Suffix-matched: a citation domain
# matches an entry if it equals the entry or ends with ".<entry>". So
# "en.wikipedia.org" matches "wikipedia.org", and "matt.substack.com"
# matches "substack.com". Add new domains here as they're observed.
_DOMAIN_TO_SOURCE_TYPE: dict[str, str] = {
    # news — mainstream outlets
    "nytimes.com": "news",
    "washingtonpost.com": "news",
    "wsj.com": "news",
    "ft.com": "news",
    "reuters.com": "news",
    "apnews.com": "news",
    "ap.org": "news",
    "bloomberg.com": "news",
    "cnn.com": "news",
    "foxnews.com": "news",
    "msnbc.com": "news",
    "nbcnews.com": "news",
    "cbsnews.com": "news",
    "abcnews.go.com": "news",
    "npr.org": "news",
    "pbs.org": "news",
    "bbc.com": "news",
    "bbc.co.uk": "news",
    "theguardian.com": "news",
    "economist.com": "news",
    "politico.com": "news",
    "axios.com": "news",
    "thehill.com": "news",
    "rollcall.com": "news",
    "newyorker.com": "news",
    "theatlantic.com": "news",
    "newsweek.com": "news",
    "time.com": "news",
    "usatoday.com": "news",
    "latimes.com": "news",
    "miamiherald.com": "news",
    "boston.com": "news",
    "chicagotribune.com": "news",
    "huffpost.com": "news",
    "vox.com": "news",
    "slate.com": "news",
    "salon.com": "news",
    "motherjones.com": "news",
    "propublica.org": "news",
    "nationalreview.com": "news",
    "washingtonexaminer.com": "news",
    "dailycaller.com": "news",
    "breitbart.com": "news",
    "thedailybeast.com": "news",
    "cnbc.com": "news",
    "marketwatch.com": "news",
    "businessinsider.com": "news",
    "semafor.com": "news",
    "punchbowl.news": "news",
    "courthousenews.com": "news",
    "lawfareblog.com": "news",
    "lawfaremedia.org": "news",
    "yahoo.com": "news",
    "aljazeera.com": "news",
    "ctpost.com": "news",
    "bloomberglaw.com": "news",
    "forbes.com": "news",
    "fortune.com": "news",
    "japantimes.co.jp": "news",
    "dw.com": "news",
    "scmp.com": "news",
    "elpais.com": "news",
    "upi.com": "news",
    "voanews.com": "news",  # US-government-funded but operates as news
    "middleeasteye.net": "news",
    "fairobserver.com": "news",
    "realclearpolitics.com": "news",
    "techcrunch.com": "news",
    "arstechnica.com": "news",
    "cnet.com": "news",
    "securityweek.com": "news",
    "economictimes.indiatimes.com": "news",
    "sfgate.com": "news",
    "thewirechina.com": "news",
    "inkstickmedia.com": "news",
    "wlrn.org": "news",  # NPR affiliate (South Florida)
    "floridapolitics.com": "news",
    "calmatters.org": "news",
    "theweek.com": "news",
    "reason.com": "news",  # libertarian-leaning news mag
    "thenation.com": "news",  # progressive-leaning
    "vanityfair.com": "news",
    "washingtonmonthly.com": "news",
    "vtdigger.org": "news",  # Vermont news outlet
    "truthout.org": "news",  # progressive news/advocacy hybrid; classifying as news
    "jacobin.com": "news",  # leftist news mag
    "notus.org": "news",
    "newrepublic.com": "news",
    "independent.co.uk": "news",
    "edweek.org": "news",  # Education Week
    "chalkbeat.org": "news",  # education news
    "techpolicy.press": "news",
    "commondreams.org": "news",  # progressive news
    "jdsupra.com": "news",  # legal news/analysis

    # reference
    "wikipedia.org": "reference",
    "britannica.com": "reference",
    "ballotpedia.org": "reference",
    "factcheck.org": "reference",
    "snopes.com": "reference",
    "politifact.com": "reference",
    "opensecrets.org": "reference",
    "votesmart.org": "reference",
    "govtrack.us": "reference",
    "fec.gov": "government",  # also gov; gov takes priority via TLD

    # think_tank
    "brookings.edu": "think_tank",
    "heritage.org": "think_tank",
    "americanprogress.org": "think_tank",
    "aei.org": "think_tank",
    "cato.org": "think_tank",
    "hudson.org": "think_tank",
    "csis.org": "think_tank",
    "carnegieendowment.org": "think_tank",
    "rand.org": "think_tank",
    "urban.org": "think_tank",
    "epi.org": "think_tank",
    "manhattan-institute.org": "think_tank",
    "manhattan.institute": "think_tank",
    "aspeninstitute.org": "think_tank",
    "newamerica.org": "think_tank",
    "thirdway.org": "think_tank",
    "atlanticcouncil.org": "think_tank",
    "cnas.org": "think_tank",
    "cfr.org": "think_tank",
    "wilsoncenter.org": "think_tank",
    "piie.com": "think_tank",
    "fpri.org": "think_tank",
    "stimson.org": "think_tank",
    "millercenter.org": "academic",  # UVA Miller Center
    "atlasinstitute.org": "think_tank",
    "cis.org": "think_tank",  # Center for Immigration Studies
    "as-coa.org": "think_tank",  # Americas Society/Council of the Americas
    "hoover.org": "think_tank",  # Hoover Institution
    "caspianpolicy.org": "think_tank",
    "brennancenter.org": "think_tank",  # Brennan Center for Justice
    "fp4america.org": "advocacy",  # Foreign Policy for America
    "bruegel.org": "think_tank",  # European economic think tank
    "eppc.org": "think_tank",  # Ethics and Public Policy Center
    "arabcenterdc.org": "think_tank",  # Arab Center DC
    "kff.org": "think_tank",  # KFF (Kaiser Family Foundation)
    "weforum.org": "think_tank",  # World Economic Forum
    "morningconsult.com": "think_tank",  # research/polling firm

    # advocacy
    "aclu.org": "advocacy",
    "sierraclub.org": "advocacy",
    "nra.org": "advocacy",
    "naacp.org": "advocacy",
    "splcenter.org": "advocacy",
    "humanrightswatch.org": "advocacy",
    "amnesty.org": "advocacy",
    "amnestyusa.org": "advocacy",
    "plannedparenthood.org": "advocacy",
    "nrlc.org": "advocacy",
    "moveon.org": "advocacy",
    "heritageaction.org": "advocacy",
    "clubforgrowth.org": "advocacy",
    "sba-list.org": "advocacy",
    "judicialwatch.org": "advocacy",
    "fairus.org": "advocacy",
    "edf.org": "advocacy",
    "nrdc.org": "advocacy",
    "ncai.org": "advocacy",
    "afl-cio.org": "advocacy",
    "uschamber.com": "advocacy",
    "businessroundtable.org": "advocacy",
    "aila.org": "advocacy",  # American Immigration Lawyers Association
    "publicknowledge.org": "advocacy",  # Public Knowledge (tech advocacy)
    "boundless.com": "advocacy",  # immigration services / advocacy
    "floridadems.org": "campaign",  # Florida Democrats
    "feelthebern.org": "campaign",  # Bernie Sanders campaign artifact
    "jeffmerkley.com": "campaign",
    "ocasiocortez.com": "campaign",  # AOC official campaign site
    "peoplesworld.org": "advocacy",  # leftist political publication
    "demlist.com": "advocacy",  # progressive list/coordination
    "progressivepunch.org": "advocacy",  # progressive scoring
    "asn-online.org": "academic",  # Association for the Study of Nationalities
    "juancole.com": "personal",  # Juan Cole's blog

    # social_media
    "twitter.com": "social_media",
    "x.com": "social_media",
    "youtube.com": "social_media",
    "youtu.be": "social_media",
    "facebook.com": "social_media",
    "fb.com": "social_media",
    "instagram.com": "social_media",
    "tiktok.com": "social_media",
    "linkedin.com": "social_media",
    "reddit.com": "social_media",
    "threads.net": "social_media",
    "bsky.app": "social_media",
    "podcasts.apple.com": "social_media",
    "open.spotify.com": "social_media",
    "quora.com": "social_media",

    # personal — substack/medium subdomains land here via suffix match
    "substack.com": "personal",
    "medium.com": "personal",
}


def _classify_domain(domain: str) -> str:
    """Map a normalized hostname → source_type slug. Returns 'unknown' on miss.

    Order:
      1. Government TLDs (.gov, .gov.uk, .gc.ca, etc.)
      2. Academic TLDs (.edu) — except known think tanks
      3. Exact match in _DOMAIN_TO_SOURCE_TYPE
      4. Suffix match (e.g., en.wikipedia.org → wikipedia.org)
      5. 'unknown'
    """
    if not domain:
        return "unknown"
    d = domain.lower().strip()
    if d.startswith("www."):
        d = d[4:]

    # Government — broad TLD heuristic
    if d.endswith(".gov") or ".gov." in d or d.endswith(".mil"):
        return "government"
    if d.endswith(".gov.uk") or d.endswith(".gc.ca") or d.endswith(".gov.au"):
        return "government"

    # Exact match takes precedence (catches think tanks on .edu like brookings.edu)
    if d in _DOMAIN_TO_SOURCE_TYPE:
        return _DOMAIN_TO_SOURCE_TYPE[d]

    # Suffix match — handles subdomains (en.wikipedia.org, matt.substack.com)
    for known, slug in _DOMAIN_TO_SOURCE_TYPE.items():
        if d.endswith("." + known):
            return slug

    # Academic TLD as last-resort heuristic
    if d.endswith(".edu") or d.endswith(".ac.uk"):
        return "academic"

    return "unknown"


def _domain_from_citation(cite: dict) -> str | None:
    """Extract a hostname from a citation dict, handling both provider shapes.

    OpenAI citations: {url, title, start_index, end_index}.
    Gemini citations: {uri, title} where title IS the domain (e.g.,
    'wikipedia.org') and uri is a Google grounding redirect handle.
    """
    from urllib.parse import urlparse

    # Gemini: title is the domain; uri is a redirect we can't decode.
    title = cite.get("title")
    if isinstance(title, str) and "." in title and " " not in title.strip():
        # Looks like a bare domain — Gemini shape.
        return title.strip().lower()

    # OpenAI: url is the direct publisher URL.
    url = cite.get("url") or cite.get("uri")
    if not url:
        return None
    try:
        host = urlparse(url).hostname
        return host.lower() if host else None
    except Exception:
        return None


def _canonical_domain(url: str | None) -> str | None:
    """Return the registered hostname of a URL, lowercased and www-stripped.
    Used by `cited_own_site` matching."""
    if not url:
        return None
    from urllib.parse import urlparse
    try:
        host = urlparse(url).hostname
    except Exception:
        return None
    if not host:
        return None
    h = host.lower()
    return h[4:] if h.startswith("www.") else h


class SourcesExtractor(Extractor):
    """Classify the citations a model_response cited against the source_types
    vocabulary. Pure Python — no LLM call. Reads from response_metadata
    (already populated by the providers at refresh time).

    Writes:
      - sources (jsonb): [{url, domain, source_type_slug, source_type_id,
                           classified_via, title, is_own_site}, ...]
      - total_sources_cited (int): count of citations
      - cited_own_site (bool): True if any citation's hostname matches the
        subject's canonical_url hostname (or a subdomain thereof). NULL if
        the subject has no canonical_url configured.

    Version history:
    - v1.0: domain-dict + TLD heuristic classification; cited_own_site
      always NULL (deferred).
    - v1.1: cited_own_site populated from `setup_inputs.canonical_url`.
      Per-source `is_own_site` flag added to each entry in the sources
      JSONB array, alongside the row-level `cited_own_site` bool. Stored
      as a setup_input rather than a new column on `subjects` to keep
      with the existing per-subject-config pattern (no migration needed;
      backfill is a setup_inputs UPDATE).

    `cited_own_site` matching: the citation's hostname is `endswith`-
    matched against the canonical hostname so subdomain links count
    (e.g., a citation to `press.heritage.org` counts as own-site for a
    subject whose canonical_url is `https://www.heritage.org`).
    """

    name = "sources"
    version = "1.1"
    output_column = "sources"

    def __init__(self, source_type_ids: dict[str, int]) -> None:
        # Pass in pre-fetched slug → id map so we can populate FK-ish ids
        # without re-querying per-row.
        self._source_type_ids = source_type_ids

    async def extract(self, response: ResponseToAnalyze) -> ExtractionResult:
        start = time.perf_counter()
        meta = response.response_metadata or {}
        citations = meta.get("citations") or []

        # Pull canonical_url for the subject, normalize to a hostname for
        # the matching test below.
        subj_inputs = response.subject_setup_inputs or {}
        canonical_url = subj_inputs.get("canonical_url")
        canonical_host = _canonical_domain(canonical_url) if canonical_url else None

        sources_out: list[dict[str, Any]] = []
        any_own_site = False
        for c in citations:
            if not isinstance(c, dict):
                continue
            domain = _domain_from_citation(c)
            slug = _classify_domain(domain or "")

            is_own = False
            if canonical_host and domain:
                d = domain.lower()
                if d.startswith("www."):
                    d = d[4:]
                # Match exact or subdomain (e.g., press.heritage.org → heritage.org)
                if d == canonical_host or d.endswith("." + canonical_host):
                    is_own = True
                    any_own_site = True

            sources_out.append({
                "url": c.get("url") or c.get("uri"),
                "domain": domain,
                "title": c.get("title"),
                "source_type_slug": slug,
                "source_type_id": self._source_type_ids.get(slug),
                "classified_via": "domain_lookup",
                "is_own_site": is_own if canonical_host else None,
            })

        elapsed_ms = int((time.perf_counter() - start) * 1000)

        # cited_own_site: True/False if canonical_url is set; None if the
        # subject hasn't configured one (we can't tell either way).
        cited_own_site = any_own_site if canonical_host else None

        return ExtractionResult(
            output=sources_out,
            error=None,
            cost_usd=Decimal(0),
            latency_ms=elapsed_ms,
            extra_columns={
                "total_sources_cited": len(sources_out),
                "cited_own_site": cited_own_site,
            },
        )


# ─── entities extractor ────────────────────────────────────────────────

_ENTITIES_PROMPT = """\
You will be given an AI assistant's response about {subject_name}.

Extract every named entity (specific person, organization, policy, event, \
or location) that appears in the response — but EXCLUDE {subject_name} \
themselves and any direct variant of their name. The goal is to capture \
WHO and WHAT else is named in the discussion of {subject_name}, so we can \
later analyze co-mention patterns and competitive positioning.

For each entity:
- name: a clean canonical form of the entity name (e.g., "Donald Trump", \
not "Trump"; "Inflation Reduction Act", not "the IRA").

  IMPORTANT — distributive modifiers: when a list shares an implicit \
head noun, EXPAND the modifier to every item in the list. Each item \
becomes its own entity with the full canonical name.

    "Departments of Homeland Security, Labor, and Justice"
      → THREE entities, each canonicalized:
         - "Department of Homeland Security"
         - "Department of Labor"
         - "Department of Justice"
      NOT: one "Departments of Homeland Security" plus bare "Labor" \
and "Justice".

    "Senators Sanders, Warren, and Markey"
      → "Senator Bernie Sanders", "Senator Elizabeth Warren", \
"Senator Edward Markey".

    "the Trump and Biden administrations"
      → "Trump administration" and "Biden administration".

  Same principle when context strongly implies a category — \
"Hegseth at Defense, Bondi at Justice" should yield "Department of \
Defense" and "Department of Justice", not bare "Defense" and \
"Justice", since the surrounding sentence is clearly about cabinet \
departments.
- type: one of "person" | "organization" | "policy" | "event" | "location"
- role: a SHORT phrase (under 10 words) describing how this entity relates \
to {subject_name} in this response. E.g., "appointed Rubio as SecState", \
"foreign rival Rubio criticizes", "policy Rubio co-sponsored"
- valence: -1.0 to 1.0 — how the entity is portrayed in this response \
(unflattering treatment → negative; favorable treatment → positive; \
neutral mention → ~0)
- excerpt: the exact sentence containing the most informative mention

Examples of what TO extract:
- "Trump appointed Rubio Secretary of State" → \
{{name: "Donald Trump", type: "person", role: "appointed Rubio as SecState"}}
- "Rubio has consistently called for sanctions against Iran" → \
{{name: "Iran", type: "location", role: "regime Rubio targets with sanctions"}}
- "He co-sponsored the Uyghur Human Rights Policy Act" → \
{{name: "Uyghur Human Rights Policy Act", type: "policy", role: \
"legislation Rubio co-sponsored"}}

Examples of what NOT to extract:
- {subject_name} themselves (or pronoun references to them)
- Generic categories without a specific name ("Republicans", "voters", \
"the administration", "experts", "critics", "his base")
- Job titles without a person attached ("the Senator", "the President")
- Vague references ("some lawmakers", "many in the GOP")

Return an empty array if no qualifying entities are present.

RESPONSE TO ANALYZE:
{response_text}
"""

_ENTITIES_SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "name":     {"type": "STRING"},
            "type":     {
                "type": "STRING",
                "enum": ["person", "organization", "policy", "event", "location"],
            },
            "role":     {"type": "STRING"},
            "valence":  {"type": "NUMBER"},
            "excerpt":  {"type": "STRING"},
        },
        "required": ["name", "type", "role", "valence", "excerpt"],
    },
}


class EntitiesExtractor(Extractor):
    """Pulls named entities (other than the subject) mentioned in the response.

    Captures who/what else is named in discussions of the subject — feeds
    co-mention analysis and competitive positioning. Uses
    gemini-2.5-flash-lite with structured-output JSON schema; no web
    grounding. Flash-lite is ~4x cheaper than flash and quality on this
    task held in side-by-side testing — entities extraction is structured
    pattern matching, well within flash-lite's capabilities.

    Version history:
    - v1.0: gemini-2.5-flash baseline
    - v1.1: gemini-2.5-flash-lite (cost-tuned)
    - v1.2: prompt fix for DISTRIBUTIVE MODIFIERS — "Departments of X,
      Y, Z" was producing one "Departments of X" entity plus bare "Y"
      and "Z" entities. v1.2 adds an explicit rule + examples telling
      the model to expand the shared head noun across every item in
      the list.
    - v1.3: retry-on-parse-failure. flash-lite occasionally produces
      truncated structured-JSON output on long responses (~5%
      incidence on responses > 3K chars). v1.3 retries the call once
      on JSONDecodeError before giving up. The retry adds ~$0.0005
      per failed response on average; net effect is dropping the
      truncation failure rate from ~5% to roughly its square (~0.25%).
    """

    name = "entities"
    version = "1.3"
    output_column = "entities"
    model_identifier = "gemini-2.5-flash-lite"

    def __init__(self) -> None:
        self._client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

    async def _call_once(self, prompt: str, config: types.GenerateContentConfig):
        """Single Gemini call wrapped in the standard retry-async (handles
        429s, 5xx, etc.). Returns the API response object."""
        api_response, _ = await retry_async(
            lambda: self._client.aio.models.generate_content(
                model=self.model_identifier,
                contents=prompt,
                config=config,
            ),
            is_retryable=_is_retryable_gemini,
        )
        return api_response

    async def extract(self, response: ResponseToAnalyze) -> ExtractionResult:
        start = time.perf_counter()
        prompt = _ENTITIES_PROMPT.format(
            subject_name=response.subject_name,
            response_text=response.response_text,
        )
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_ENTITIES_SCHEMA,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        )

        prices = _PRICING[self.model_identifier]
        total_cost = Decimal(0)

        # Up to two attempts. The first failure cause we care about is
        # JSONDecodeError on truncated output — distinct from API-level
        # errors (which retry_async already handles inside _call_once).
        last_error: str | None = None
        for attempt in range(2):
            try:
                api_response = await self._call_once(prompt, config)
            except Exception as e:
                # API-level failure; we already retried in retry_async, so don't try again
                return ExtractionResult(
                    output=None,
                    error=str(e),
                    cost_usd=total_cost,
                    latency_ms=int((time.perf_counter() - start) * 1000),
                )

            usage = getattr(api_response, "usage_metadata", None)
            input_tokens = getattr(usage, "prompt_token_count", 0) or 0
            output_tokens = getattr(usage, "candidates_token_count", 0) or 0
            total_cost += (
                Decimal(input_tokens) * prices["input"] / _PER_TOKEN
                + Decimal(output_tokens) * prices["output"] / _PER_TOKEN
            )

            try:
                parsed = json.loads(api_response.text) if api_response.text else []
            except json.JSONDecodeError as e:
                last_error = f"JSON parse failed (attempt {attempt + 1}): {e}"
                continue  # retry once

            return ExtractionResult(
                output=parsed,
                error=None,
                cost_usd=total_cost,
                latency_ms=int((time.perf_counter() - start) * 1000),
            )

        return ExtractionResult(
            output=None,
            error=last_error or "JSON parse failed after retry",
            cost_usd=total_cost,
            latency_ms=int((time.perf_counter() - start) * 1000),
        )


# ─── scores extractor ──────────────────────────────────────────────────

_SCORES_PROMPT = """\
You will be given an AI assistant's response about {subject_name}.

Score the response on four dimensions. Each is a single number; return \
exactly one object. Use the full ranges — don't pile up at zero just \
because the response feels neutral. If a dimension genuinely doesn't \
apply (e.g., the subject is barely mentioned), score it close to 0.

1. sentiment (-1.0 to 1.0):
   Overall sentiment of the response toward {subject_name}.
   -1.0 = relentlessly negative; 0.0 = balanced or factual; +1.0 = \
relentlessly positive. Mixed responses with both praise and criticism \
should land between -0.3 and +0.3.

2. directional_lean (-1.0 to 1.0):
   How the response FRAMES {subject_name}, on a left/right political \
axis. -1.0 = framed from a strongly progressive/left perspective; \
0.0 = balanced or non-political; +1.0 = framed from a strongly \
conservative/right perspective. This is about the FRAMING of the \
response, not the subject's own politics. A neutral factual write-up \
of a conservative subject should score near 0; a progressive criticism \
of the same subject scores negative.

3. certainty (0.0 to 1.0):
   How confident vs. hedged the response sounds.
   0.0 = heavily hedged (lots of "some say", "critics argue", "may", \
"could be", "it depends"); 0.5 = mixed; 1.0 = stated as established \
fact with no hedging.

4. criticism_severity (0.0 to 1.0):
   How harshly the response criticizes {subject_name}.
   0.0 = no criticism at all (descriptive or favorable); 0.3 = mild \
critique woven in; 0.6 = sustained or pointed criticism; 1.0 = \
scathing, central focus on flaws or failures. On non-adversarial \
prompts this should usually land near 0; that is itself signal.

Return exactly one object with the four numeric fields and a brief \
`rationale` field (≤30 words) summarizing the most important reason \
the response landed where it did on these axes.

RESPONSE TO ANALYZE:
{response_text}
"""

_SCORES_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "sentiment":            {"type": "NUMBER"},
        "directional_lean":     {"type": "NUMBER"},
        "certainty":            {"type": "NUMBER"},
        "criticism_severity":   {"type": "NUMBER"},
        "rationale":            {"type": "STRING"},
    },
    "required": [
        "sentiment", "directional_lean", "certainty",
        "criticism_severity", "rationale",
    ],
}


class ScoresExtractor(Extractor):
    """Four response-level scores: sentiment, directional_lean, certainty,
    criticism_severity. One LLM call per response producing one numeric
    object (not a list).

    Methodology note: scores apply to every response uniformly. Read them
    in context downstream — e.g., criticism_severity on a named/criticism
    prompt should be high; if it's low, that itself is a finding.

    Version history:
    - v1.0: gemini-2.5-flash baseline
    - v1.1: gemini-2.5-flash-lite (tested, reverted — calibration drift
      was meaningful: criticism_severity on adversarial-defense slots
      weakened from 0.90 to 0.70, and certainty drifted by up to -0.50
      on individual responses).
    - v1.2: gemini-2.5-flash (current). Functionally identical to v1.0;
      kept the version monotonic so the analysis_runs audit trail stays
      coherent. The flash-lite v1.1 analysis_run on Rubio's refresh-18
      remains in the DB as a reference for the side-by-side.
    """

    name = "scores"
    version = "1.2"
    output_column = "scores"
    model_identifier = "gemini-2.5-flash"

    def __init__(self) -> None:
        self._client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

    async def extract(self, response: ResponseToAnalyze) -> ExtractionResult:
        start = time.perf_counter()
        prompt = _SCORES_PROMPT.format(
            subject_name=response.subject_name,
            response_text=response.response_text,
        )
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_SCORES_SCHEMA,
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
            parsed = json.loads(api_response.text) if api_response.text else None
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


# ─── narrative themes extractor ────────────────────────────────────────

_THEMES_PROMPT = """\
You will be given an AI assistant's response about {subject_name}.

Identify the 1-3 dominant NARRATIVE THEMES the response uses to frame \
{subject_name}. A narrative theme is a recurring frame or angle the \
response leans on, not just any topic mentioned. Themes are what makes \
two responses about the same subject feel DIFFERENT.

Examples of good narrative themes (free-form labels, 2-5 words each):
- "presidential ambition"
- "foreign policy hawkishness"
- "MAGA loyalty test"
- "establishment vs. populist"
- "ideological inconsistency"
- "policy substance over personality"
- "identity politics framing"
- "scandal management"
- "generational change"
- "Cuban-American immigrant story"

For each theme:
- label: a short noun phrase (2-5 words). Use clear, journalistic \
phrasing rather than abstract sociology terms.
- weight: 0.0 to 1.0 — how prominent this theme is in the response. \
Don't be afraid of low values for secondary themes (0.2-0.4 is normal).
- excerpt: a representative sentence or phrase from the response that \
illustrates this theme.

Then pick a `dominant_theme` (string) — the SINGLE most prominent theme. \
This is just the label of one of the themes you returned (the one with \
the highest weight, typically). It must match exactly.

Avoid:
- Themes that just restate the subject's job ("Secretary of State", \
"is a senator") — these are facts, not framings.
- Themes that are just topics ("foreign policy", "Cuba") without a frame \
or angle attached.
- More than 3 themes — pick the strongest 1-3 and let weaker ones go.

Return up to 3 themes plus the dominant_theme label.

RESPONSE TO ANALYZE:
{response_text}
"""

_THEMES_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "themes": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "label":    {"type": "STRING"},
                    "weight":   {"type": "NUMBER"},
                    "excerpt":  {"type": "STRING"},
                },
                "required": ["label", "weight", "excerpt"],
            },
        },
        "dominant_theme": {"type": "STRING"},
    },
    "required": ["themes", "dominant_theme"],
}


class NarrativeThemesExtractor(Extractor):
    """1-3 free-form narrative theme labels per response, plus a single
    dominant_theme string.

    Free-form labels in v1.0 — taxonomy will fragment across runs but we
    don't yet know what themes to pre-define. Once a corpus exists, a
    future version can constrain the vocabulary via clustering. Cross-run
    aggregation requires post-hoc clustering for now.

    Writes to two columns: narrative_themes (jsonb list of {label, weight,
    excerpt}) and dominant_theme (text).

    v1.1 onward: gemini-2.5-flash-lite (cheaper tier). Free-form theme
    labeling is already a noisy task; lite produced labels of comparable
    quality at lower cost in side-by-side testing.
    """

    name = "narrative_themes"
    version = "1.1"
    output_column = "narrative_themes"
    model_identifier = "gemini-2.5-flash-lite"

    def __init__(self) -> None:
        self._client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

    async def extract(self, response: ResponseToAnalyze) -> ExtractionResult:
        start = time.perf_counter()
        prompt = _THEMES_PROMPT.format(
            subject_name=response.subject_name,
            response_text=response.response_text,
        )
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_THEMES_SCHEMA,
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
            parsed = json.loads(api_response.text) if api_response.text else {}
        except Exception as e:
            return ExtractionResult(
                output=None,
                error=f"JSON parse failed: {e}",
                cost_usd=cost,
                latency_ms=elapsed_ms,
            )

        themes_list = parsed.get("themes") if isinstance(parsed, dict) else None
        dominant = parsed.get("dominant_theme") if isinstance(parsed, dict) else None

        return ExtractionResult(
            output=themes_list,
            error=None,
            cost_usd=cost,
            latency_ms=elapsed_ms,
            extra_columns={"dominant_theme": dominant},
        )


# ─── mention detection extractor ───────────────────────────────────────

_MENTION_PROMPT = """\
You will be given an AI assistant's response. Your task: determine whether \
{subject_name} is mentioned, where they appear in the order of named \
entities, and who else is named.

Context: this response came from asking the AI a question about a topic \
area WITHOUT naming {subject_name}. We're testing whether the AI \
organically surfaces {subject_name} when asked about adjacent topics — \
this is the share-of-voice signal.

For {subject_name} specifically:
- subject_mentioned: true if {subject_name} (or a clear variant of their \
name) appears anywhere in the response. Pronoun references alone (e.g., \
"he said") without a name don't count.
- mention_rank: positional order — 1 if {subject_name} is the FIRST named \
entity in the response (or first in a list); 2 if second, etc. Count only \
distinct named entities (don't repeat for re-mentions of the same entity).
- mention_strength:
  - "primary": {subject_name} is the focus of a paragraph or section, \
discussed at length
  - "listed": {subject_name} is named in a series/list with others (most common)
  - "aside": brief mention, parenthetical, one-line
- mention_excerpt: the exact sentence containing the most informative \
mention of {subject_name}.
- disambiguation_confidence: 0.0 to 1.0, how confident you are that the \
"{subject_name}" mentioned is the SAME {subject_name} we're asking about \
(some names are shared — context usually disambiguates). 1.0 = certain; \
0.5 = ambiguous; 0.0 = clearly the wrong person/thing.

If subject_mentioned is false, do NOT include mention_rank, \
mention_strength, mention_excerpt, or disambiguation_confidence in your \
response.

For competitors_mentioned (every named entity in the response OTHER than \
{subject_name}, with positional rank):
- name: a clean canonical form (e.g., "Donald Trump", not "Trump"; \
"Heritage Foundation", not "Heritage").
- rank: positional order in the response — same numbering scheme as \
mention_rank. If {subject_name} is listed second after Warren, then \
{subject_name}'s mention_rank=2 and Warren's rank=1.
- type: one of:
  - "person": a specific named individual ("Elizabeth Warren", "Joe Biden")
  - "organization": a specific named org ("Heritage Foundation", "AFL-CIO")
  - "position": a role/title without a person attached ("Secretary of \
State", "Speaker of the House", "the Senate Majority Leader")
  - "other": anything else (locations, policies, events, etc.)

Return an empty competitors_mentioned array if no other entities are named.

RESPONSE TO ANALYZE:
{response_text}
"""

_MENTION_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "subject_mentioned":         {"type": "BOOLEAN"},
        "mention_rank":              {"type": "INTEGER"},
        "mention_strength":          {
            "type": "STRING",
            "enum": ["primary", "listed", "aside"],
        },
        "mention_excerpt":           {"type": "STRING"},
        "disambiguation_confidence": {"type": "NUMBER"},
        "competitors_mentioned": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "name": {"type": "STRING"},
                    "rank": {"type": "INTEGER"},
                    "type": {
                        "type": "STRING",
                        "enum": ["person", "organization", "position", "other"],
                    },
                },
                "required": ["name", "rank", "type"],
            },
        },
    },
    "required": ["subject_mentioned", "competitors_mentioned"],
}


class MentionDetectionExtractor(Extractor):
    """Detects whether and how the subject is mentioned in unnamed-layer
    responses. Skips named-layer responses (subject is in the prompt; mention
    detection is meaningless there).

    Writes:
      - competitors_mentioned (jsonb): [{name, rank, type}, ...] every other
        named entity in the response, ordered by appearance
      - subject_mentioned (bool): primary signal
      - mention_rank (int | null): positional order if mentioned
      - mention_strength (text | null): 'primary' | 'listed' | 'aside'
      - mention_excerpt (text | null): supporting snippet
      - disambiguation_confidence (numeric | null): 0..1

    For named-layer responses, returns a no-op (output=None, empty
    extra_columns) so all six columns stay NULL on the row, matching the
    schema's intent.

    Uses gemini-2.5-flash-lite with structured-object JSON output. Mostly
    comprehension + ordinal counting + light disambiguation — well within
    flash-lite's capability per the same reasoning that put EntitiesExtractor
    on flash-lite.
    """

    name = "mention_detection"
    version = "1.0"
    output_column = "competitors_mentioned"
    model_identifier = "gemini-2.5-flash-lite"

    def __init__(self) -> None:
        self._client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

    async def extract(self, response: ResponseToAnalyze) -> ExtractionResult:
        start = time.perf_counter()

        if response.layer != "unnamed":
            return ExtractionResult(
                output=None,
                error=None,
                cost_usd=Decimal(0),
                latency_ms=0,
            )

        prompt = _MENTION_PROMPT.format(
            subject_name=response.subject_name,
            response_text=response.response_text,
        )
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_MENTION_SCHEMA,
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
            parsed = json.loads(api_response.text) if api_response.text else {}
        except Exception as e:
            return ExtractionResult(
                output=None,
                error=f"JSON parse failed: {e}",
                cost_usd=cost,
                latency_ms=elapsed_ms,
            )

        if not isinstance(parsed, dict):
            return ExtractionResult(
                output=None,
                error=f"Mention output not a dict: {type(parsed).__name__}",
                cost_usd=cost,
                latency_ms=elapsed_ms,
            )

        mentioned = bool(parsed.get("subject_mentioned", False))
        competitors = parsed.get("competitors_mentioned") or []

        extra: dict[str, Any] = {
            "subject_mentioned": mentioned,
            "mention_rank":      parsed.get("mention_rank") if mentioned else None,
            "mention_strength":  parsed.get("mention_strength") if mentioned else None,
            "mention_excerpt":   parsed.get("mention_excerpt") if mentioned else None,
            "disambiguation_confidence": (
                parsed.get("disambiguation_confidence") if mentioned else None
            ),
        }

        return ExtractionResult(
            output=competitors,
            error=None,
            cost_usd=cost,
            latency_ms=elapsed_ms,
            extra_columns=extra,
        )


# ─── combined extractor ────────────────────────────────────────────────
#
# Issues ONE LLM call per response that returns all four LLM-extractor
# outputs together (descriptors, entities, scores, narrative_themes).
# Sources stays separate — it's pure Python and free, so combining it
# would only add complexity. The motivation is cost: each separate call
# repeats the response_text in its input, so 4 calls = 4× input tokens
# for the same content. One combined call keeps quality at flash-level
# (no flash-lite calibration drift on scores) while collapsing the
# token bill.
#
# The prompt embeds each individual extractor's full instruction text
# under a TASK heading, then asks for a single JSON object containing
# all four named outputs. The schema is the union of the four
# individual schemas.

_COMBINED_PROMPT = """\
You will be given an AI assistant's response about {subject_name}. \
Analyze it on FOUR independent dimensions and return ONE JSON object \
with all four results. Treat each dimension's rules independently — \
they're separate analytical tasks that happen to share input.

============================================================
TASK 1: descriptors
============================================================
Extract every adjective or descriptive noun phrase that the response \
uses to characterize {subject_name} as a person — but ONLY if BOTH of \
the following are true:

(A) VERBATIM: appears word-for-word in the response.
(B) GRAMMATICALLY ATTACHED TO THE SUBJECT: describing {subject_name} \
the person, not their policies, record, actions, initiatives, \
positions, or other people.

Test for each candidate: ask "Is this adjective describing \
{subject_name} the person, or something else (their policies, record, \
actions, initiatives, positions, other people)?" If anything else, \
do NOT extract.

NOT extracted (even though verbatim):
- "He has advanced progressive policies" → "progressive" describes \
the policies, not him
- "Pragmatic governance is his hallmark" → "pragmatic" describes the \
governance
- "Critics call his moderate positions disappointing" → "moderate" \
describes the positions
- "Many progressives criticize him" → "progressive" describes the \
critics
- Job titles or factual roles ("Senator", "businessman") on their own
- Descriptors attached to OTHER people, not {subject_name}

DOES count:
- "Sanders is a progressive" → extract "progressive"
- "Critics call him a firebrand" → extract "firebrand"
- "He has been described as polarizing" → extract "polarizing"

For each qualifying descriptor return:
- word, valence (-1..1), confidence (0..1), excerpt

Empty array is correct and expected for many responses (e.g., \
responses describing actions or reactions rather than the person).

============================================================
TASK 2: entities
============================================================
Extract every named entity (specific person, organization, policy, \
event, or location) — but EXCLUDE {subject_name} themselves and any \
direct variant of their name.

For each entity:
- name (canonical form: "Donald Trump", not "Trump")
- type: one of "person" | "organization" | "policy" | "event" | "location"
- role: short phrase (≤10 words) — how this entity relates to \
{subject_name} in this response
- valence (-1..1): how the entity is portrayed in this response
- excerpt: the sentence containing the most informative mention

Do NOT extract:
- {subject_name} themselves
- Generic categories ("Republicans", "voters", "the administration")
- Job titles without a specific named entity

Empty array is fine if no qualifying entities exist.

============================================================
TASK 3: scores
============================================================
Score the response on four dimensions. Use the full ranges. If a \
dimension genuinely doesn't apply (e.g., subject barely mentioned), \
score close to 0.

- sentiment (-1..1): overall sentiment toward {subject_name}.
- directional_lean (-1..1): how the response FRAMES {subject_name} on \
a left/right political axis. About the FRAMING, not the subject's \
politics. Neutral factual writeup of a conservative subject ≈ 0.
- certainty (0..1): low when hedged ("some say", "critics argue"), \
high when stated as established fact.
- criticism_severity (0..1): harshness of criticism. 0 = none, \
1 = scathing. On non-adversarial prompts this should usually be near 0; \
that is signal.

Plus a `rationale` field (≤30 words) summarizing why these landed \
where they did.

============================================================
TASK 4: narrative_themes
============================================================
Identify 1-3 dominant NARRATIVE THEMES the response uses to frame \
{subject_name}. A theme is a recurring frame or angle, not just any \
topic mentioned. Themes are what makes two responses about the same \
subject feel DIFFERENT.

Good theme examples (free-form labels, 2-5 words):
"presidential ambition", "foreign policy hawkishness", "MAGA loyalty \
test", "ideological inconsistency", "Cuban-American immigrant story", \
"scandal management", "generational change".

For each theme: label, weight (0..1, prominence — low values fine for \
secondary themes), excerpt (representative sentence/phrase).

Then pick a `dominant_theme` (string) — the single most prominent \
theme. Its label must EXACTLY match one of the labels in the themes \
array.

Avoid:
- Themes that just restate the subject's job ("Senator", "is a senator")
- Bare topics without a frame ("foreign policy", "Cuba")
- More than 3 themes — pick the strongest 1-3

============================================================
OUTPUT SHAPE
============================================================
Return one JSON object:

{{
  "descriptors": [...],
  "entities": [...],
  "scores": {{ ... }},
  "narrative_themes": {{
    "themes": [...],
    "dominant_theme": "..."
  }}
}}

============================================================
RESPONSE TO ANALYZE
============================================================
{response_text}
"""


_COMBINED_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "descriptors": {
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
        },
        "entities": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "name":     {"type": "STRING"},
                    "type":     {
                        "type": "STRING",
                        "enum": ["person", "organization", "policy", "event", "location"],
                    },
                    "role":     {"type": "STRING"},
                    "valence":  {"type": "NUMBER"},
                    "excerpt":  {"type": "STRING"},
                },
                "required": ["name", "type", "role", "valence", "excerpt"],
            },
        },
        "scores": {
            "type": "OBJECT",
            "properties": {
                "sentiment":          {"type": "NUMBER"},
                "directional_lean":   {"type": "NUMBER"},
                "certainty":          {"type": "NUMBER"},
                "criticism_severity": {"type": "NUMBER"},
                "rationale":          {"type": "STRING"},
            },
            "required": [
                "sentiment", "directional_lean", "certainty",
                "criticism_severity", "rationale",
            ],
        },
        "narrative_themes": {
            "type": "OBJECT",
            "properties": {
                "themes": {
                    "type": "ARRAY",
                    "items": {
                        "type": "OBJECT",
                        "properties": {
                            "label":   {"type": "STRING"},
                            "weight":  {"type": "NUMBER"},
                            "excerpt": {"type": "STRING"},
                        },
                        "required": ["label", "weight", "excerpt"],
                    },
                },
                "dominant_theme": {"type": "STRING"},
            },
            "required": ["themes", "dominant_theme"],
        },
    },
    "required": ["descriptors", "entities", "scores", "narrative_themes"],
}


class CombinedExtractor(Extractor):
    """One LLM call per response producing all four LLM-extractor outputs.

    Replaces DescriptorExtractor + EntitiesExtractor + ScoresExtractor +
    NarrativeThemesExtractor when registered. Uses gemini-2.5-flash
    (precision-preserving — flash-lite testing showed real calibration
    drift on scores; the unified prompt context is large enough that
    flash's output budget is the right tier).

    Writes the descriptors list to its primary output_column, then uses
    extra_columns to populate `entities`, `scores`, `narrative_themes`,
    and `dominant_theme` on the same response_extractions row.
    """

    name = "combined"
    version = "1.0"
    output_column = "descriptors"  # primary; the rest land via extra_columns
    model_identifier = "gemini-2.5-flash"

    def __init__(self) -> None:
        self._client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

    async def extract(self, response: ResponseToAnalyze) -> ExtractionResult:
        start = time.perf_counter()
        prompt = _COMBINED_PROMPT.format(
            subject_name=response.subject_name,
            response_text=response.response_text,
        )
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_COMBINED_SCHEMA,
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
            parsed = json.loads(api_response.text) if api_response.text else {}
        except Exception as e:
            return ExtractionResult(
                output=None,
                error=f"JSON parse failed: {e}",
                cost_usd=cost,
                latency_ms=elapsed_ms,
            )

        if not isinstance(parsed, dict):
            return ExtractionResult(
                output=None,
                error=f"Combined output not a dict: {type(parsed).__name__}",
                cost_usd=cost,
                latency_ms=elapsed_ms,
            )

        descriptors = parsed.get("descriptors") or []
        entities = parsed.get("entities") or []
        scores = parsed.get("scores")
        themes_obj = parsed.get("narrative_themes") or {}
        themes_list = themes_obj.get("themes") if isinstance(themes_obj, dict) else None
        dominant = themes_obj.get("dominant_theme") if isinstance(themes_obj, dict) else None

        return ExtractionResult(
            output=descriptors,
            error=None,
            cost_usd=cost,
            latency_ms=elapsed_ms,
            extra_columns={
                "entities": entities,
                "scores": scores,
                "narrative_themes": themes_list,
                "dominant_theme": dominant,
            },
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
                    mr.model_id, mr.prompt_id, p.layer, mr.response_text,
                    mr.response_metadata
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
            subject_setup_inputs=r[3] or {},
            model_id=r[4],
            prompt_id=r[5],
            layer=r[6],
            response_text=r[7],
            response_metadata=r[8] or {},
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
        # Extractors that span multiple columns (e.g., sources writes both
        # the sources JSONB and the total_sources_cited int) populate
        # extra_columns. Dict/list values are auto-wrapped for JSONB
        # columns; scalars pass through unchanged.
        for k, v in result.extra_columns.items():
            columns[k] = Json(v) if isinstance(v, (dict, list)) else v
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


def _fetch_source_type_ids() -> dict[str, int]:
    """Load the source_types vocabulary as a slug → id map."""
    with psycopg.connect(get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT slug, id FROM source_types WHERE active = TRUE")
            return {slug: sid for slug, sid in cur.fetchall()}


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
    parser.add_argument(
        "--combined", action="store_true",
        help=(
            "Use the combined extractor (one LLM call per response producing "
            "all four LLM-extractor outputs). Cheaper but consolidates 4 "
            "tasks into a single context. Sources still runs separately."
        ),
    )
    args = parser.parse_args()

    source_type_ids = _fetch_source_type_ids()
    if args.combined:
        extractors: list[Extractor] = [
            CombinedExtractor(),
            SourcesExtractor(source_type_ids),
            MentionDetectionExtractor(),
        ]
    else:
        extractors = [
            DescriptorExtractor(),
            SourcesExtractor(source_type_ids),
            EntitiesExtractor(),
            ScoresExtractor(),
            NarrativeThemesExtractor(),
            MentionDetectionExtractor(),
        ]
    print(
        f"Running {len(extractors)} extractor(s) "
        f"({', '.join(f'{e.name}@v{e.version}' for e in extractors)}) "
        f"over refresh_run {args.refresh_run_id}"
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
