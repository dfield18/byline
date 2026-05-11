"""dashboard/pages/02_response.py — single response with all extractions inline.

Shows: the prompt sent (rendered), the model's response text, and every
extractor's output (descriptors / sources / entities / scores /
narrative_themes / mention_detection). Also shows the response's
citations from response_metadata and the per-source classification."""
from __future__ import annotations

import sys
from pathlib import Path

# Repo-root path injection — see dashboard/Home.py for the explanation.
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import streamlit as st

from dashboard.lib.queries import get_response


st.set_page_config(page_title="byline · response", layout="wide")


# pick model_response_id from session or query param
mr_id = st.session_state.get("model_response_id")
if mr_id is None and "model_response_id" in st.query_params:
    try:
        mr_id = int(st.query_params["model_response_id"])
    except (ValueError, TypeError):
        mr_id = None

mr_id_input = st.sidebar.number_input(
    "model_response_id",
    min_value=1, value=mr_id or 1, step=1,
)
mr_id = int(mr_id_input)
st.session_state["model_response_id"] = mr_id


@st.cache_data(ttl=60)
def _response(model_response_id: int):
    return get_response(model_response_id)


r = _response(mr_id)
if not r:
    st.error(f"model_response_id={mr_id} not found")
    st.stop()

# ─── header ────────────────────────────────────────────────────────────

st.title(f"{r['layer']}/{r['position']} — {r['dimension']}")
st.caption(
    f"Subject: **{r['subject_name']}** ({r['category']}) · refresh_run {r['refresh_run_id']} · "
    f"model `{r['model_identifier']}` ({r['model_slug']}) · prompt v{r['prompt_version']} ({r['prompt_type']})"
)

c1, c2, c3, c4 = st.columns(4)
c1.metric("Response length", f"{len(r['response_text'] or '')} chars")
c2.metric("Cost", f"${float(r['cost_usd']):.4f}")
c3.metric("Latency", f"{r['latency_ms']}ms")
meta = r["response_metadata"] or {}
c4.metric("US-focused", "yes" if meta.get("us_focused") else "no")

st.divider()

# ─── prompt + response ─────────────────────────────────────────────────

left, right = st.columns([1, 2])

with left:
    st.subheader("Prompt")
    st.caption(f"Template (v{r['prompt_version']}):")
    st.code(r["template"] or "", language=None)
    st.caption("Rendered prompt sent to the model:")
    st.code(r["rendered_prompt"] or "", language=None)

with right:
    st.subheader("Response")
    st.write(r["response_text"] or "_(empty)_")

st.divider()

# ─── scores ────────────────────────────────────────────────────────────

st.subheader("Scores")
scores = r["scores"] or {}
if scores:
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Sentiment", f"{float(scores.get('sentiment', 0)):+.2f}")
    c2.metric("Directional lean", f"{float(scores.get('directional_lean', 0)):+.2f}")
    c3.metric("Certainty", f"{float(scores.get('certainty', 0)):.2f}")
    c4.metric("Criticism severity", f"{float(scores.get('criticism_severity', 0)):.2f}")
    if scores.get("rationale"):
        st.caption(f"_Rationale:_ {scores['rationale']}")
else:
    st.info("No scores extracted for this response yet.")

st.divider()

# ─── extractor outputs (tabs) ──────────────────────────────────────────

tab_d, tab_e, tab_s, tab_t, tab_m, tab_c = st.tabs([
    "Descriptors", "Entities", "Sources", "Themes", "Mention detection", "Citations (raw)",
])

with tab_d:
    descs = r["descriptors"] or []
    if not descs:
        st.info("No descriptors extracted.")
    else:
        st.dataframe(
            [
                {
                    "word": d.get("word"),
                    "valence": d.get("valence"),
                    "confidence": d.get("confidence"),
                    "excerpt": (d.get("excerpt") or "")[:200],
                }
                for d in descs
            ],
            hide_index=True, use_container_width=True,
        )

with tab_e:
    ents = r["entities"] or []
    if not ents:
        st.info("No entities extracted.")
    else:
        st.dataframe(
            [
                {
                    "name": e.get("name"),
                    "type": e.get("type"),
                    "role": e.get("role"),
                    "valence": e.get("valence"),
                    "excerpt": (e.get("excerpt") or "")[:150],
                }
                for e in ents
            ],
            hide_index=True, use_container_width=True,
        )

with tab_s:
    srcs = r["sources"] or []
    if not srcs:
        st.info("No sources extracted.")
    else:
        c1, c2 = st.columns([1, 2])
        c1.metric("Total citations", r.get("total_sources_cited") or 0)
        c1.metric("Cited own site", str(r.get("cited_own_site"))
                  if r.get("cited_own_site") is not None else "—")
        st.dataframe(
            [
                {
                    "domain": s.get("domain"),
                    "type": s.get("source_type_slug"),
                    "is_own_site": s.get("is_own_site"),
                    "title": (s.get("title") or "")[:80],
                    "url": s.get("url"),
                }
                for s in srcs
            ],
            hide_index=True, use_container_width=True,
            column_config={
                "url": st.column_config.LinkColumn("url", width="medium"),
            },
        )

with tab_t:
    themes = r["narrative_themes"] or []
    if not themes:
        st.info("No themes extracted.")
    else:
        if r.get("dominant_theme"):
            st.markdown(f"**Dominant theme:** *{r['dominant_theme']}*")
        st.dataframe(
            [
                {
                    "label": t.get("label"),
                    "weight": t.get("weight"),
                    "excerpt": (t.get("excerpt") or "")[:200],
                }
                for t in themes
            ],
            hide_index=True, use_container_width=True,
        )

with tab_m:
    sm = r.get("subject_mentioned")
    if sm is None:
        st.info("Mention detection hasn't run on this response (named-layer responses are no-op for mention detection).")
    else:
        c1, c2, c3 = st.columns(3)
        c1.metric("Subject mentioned", "yes" if sm else "no")
        c2.metric("Rank", r.get("mention_rank") or "—")
        c3.metric("Strength", r.get("mention_strength") or "—")
        if r.get("mention_excerpt"):
            st.caption("Mention excerpt:")
            st.markdown(f"> {r['mention_excerpt']}")

        comps = r.get("competitors_mentioned") or []
        if comps:
            st.markdown("**Competitors named in this response:**")
            st.dataframe(
                [{"name": c.get("name"), "type": c.get("type"), "rank": c.get("rank")} for c in comps],
                hide_index=True, use_container_width=True,
            )

with tab_c:
    cites = meta.get("citations") or []
    if not cites:
        st.info("No citations in the model's response_metadata.")
    else:
        st.caption(
            "Raw citations from the model's `response_metadata.citations`. "
            "OpenAI provides direct `url`; Gemini provides a redirect-style `uri` and a domain-only `title`."
        )
        st.dataframe(
            [
                {
                    "title": (c.get("title") or "")[:80],
                    "url_or_uri": c.get("url") or c.get("uri"),
                    "char_span": (
                        f"{c['start_index']}–{c['end_index']}"
                        if c.get("start_index") is not None else None
                    ),
                }
                for c in cites
            ],
            hide_index=True, use_container_width=True,
            column_config={
                "url_or_uri": st.column_config.LinkColumn("url / uri", width="large"),
            },
        )
