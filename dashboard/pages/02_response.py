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

from dashboard.lib.queries import (
    get_response, list_subjects, get_subject, get_refresh_responses,
)


st.set_page_config(page_title="byline · response", layout="wide")


@st.cache_data(ttl=60)
def _subjects():
    return list_subjects()


@st.cache_data(ttl=60)
def _subject(subject_id: int):
    return get_subject(subject_id)


@st.cache_data(ttl=60)
def _responses(refresh_run_id: int):
    return get_refresh_responses(refresh_run_id)


@st.cache_data(ttl=60)
def _response(model_response_id: int):
    return get_response(model_response_id)


# ─── sidebar filters: category → subject → refresh → slot → model ──────
#
# When the user lands here from Subject page (or via session_state from
# another navigation), we pre-fill all the dropdowns from the response
# currently in session_state. Any filter change cascades downward and
# resolves to a new model_response_id.

st.sidebar.header("Find a response")

incoming_mr_id = st.session_state.get("model_response_id")
incoming = _response(incoming_mr_id) if incoming_mr_id else None

all_subjects = _subjects()

# Build categories list from what's actually present in the DB
categories = sorted({s["category"] for s in all_subjects})
CATEGORY_LABELS = {
    "person":       "Person (politician)",
    "organization": "Organization (group / institution)",
    "issue":        "Issue (contested topic)",
    "policy":       "Policy (legislation / regulation)",
    "event":        "Event (specific moment)",
}

default_cat = incoming["category"] if incoming else categories[0]
cat = st.sidebar.selectbox(
    "Category",
    options=categories,
    format_func=lambda c: CATEGORY_LABELS.get(c, c.title()),
    index=categories.index(default_cat) if default_cat in categories else 0,
)

# Subjects in that category
cat_subjects = [s for s in all_subjects if s["category"] == cat]
if not cat_subjects:
    st.sidebar.warning(f"No subjects in category '{cat}'")
    st.stop()

default_subj_id = incoming["subject_id"] if (incoming and incoming["category"] == cat) else cat_subjects[0]["id"]
subj_idx = next((i for i, s in enumerate(cat_subjects) if s["id"] == default_subj_id), 0)
subj = st.sidebar.selectbox(
    "Subject",
    options=cat_subjects,
    format_func=lambda s: s["name"],
    index=subj_idx,
)

# Refreshes for the chosen subject
subj_detail = _subject(subj["id"])
refreshes = subj_detail["refreshes"] if subj_detail else []
if not refreshes:
    st.sidebar.warning(f"{subj['name']} has no refreshes yet")
    st.stop()

default_rr_id = (
    incoming["refresh_run_id"]
    if (incoming and incoming["subject_id"] == subj["id"]
        and any(r["id"] == incoming["refresh_run_id"] for r in refreshes))
    else refreshes[0]["id"]
)
rr_idx = next((i for i, r in enumerate(refreshes) if r["id"] == default_rr_id), 0)
rr = st.sidebar.selectbox(
    "Refresh",
    options=refreshes,
    format_func=lambda r: (
        f"refresh {r['id']} "
        f"({r['started_at']:%Y-%m-%d %H:%M}, {r['n_ok']}/{r['n_responses']})"
    ),
    index=rr_idx,
)

# Responses in that refresh — slot picker
responses = _responses(rr["id"])
if not responses:
    st.sidebar.warning(f"No successful responses in refresh {rr['id']}")
    st.stop()

# Unique slots, sorted: named first, then unnamed; position ascending
slots = sorted(
    {(r["layer"], r["position"], r["dimension"]) for r in responses},
    key=lambda s: (0 if s[0] == "named" else 1, s[1]),
)

default_slot = None
if incoming and incoming["refresh_run_id"] == rr["id"]:
    default_slot = (incoming["layer"], incoming["position"], incoming["dimension"])
slot_idx = next((i for i, s in enumerate(slots) if s == default_slot), 0)
slot = st.sidebar.selectbox(
    "Slot (the question type)",
    options=slots,
    format_func=lambda s: f"{s[0]}/{s[1]} — {s[2]}",
    index=slot_idx,
)

# Models that ran on that slot in this refresh
models_in_slot = sorted({
    r["model_slug"] for r in responses
    if r["layer"] == slot[0] and r["position"] == slot[1]
})
if not models_in_slot:
    st.sidebar.warning("No model responses for this slot")
    st.stop()

default_model = incoming["model_slug"] if (incoming and incoming["model_slug"] in models_in_slot) else models_in_slot[0]
model_slug = st.sidebar.selectbox(
    "Model",
    options=models_in_slot,
    index=models_in_slot.index(default_model),
)

# Resolve filters → model_response_id
mr_id = next(
    (r["model_response_id"] for r in responses
     if r["layer"] == slot[0]
        and r["position"] == slot[1]
        and r["model_slug"] == model_slug),
    None,
)
if mr_id is None:
    st.sidebar.warning("No response matches the current filters")
    st.stop()

st.session_state["model_response_id"] = mr_id

# ── Fallback: direct ID picker, tucked under Advanced ──
with st.sidebar.expander("Advanced: select by ID"):
    direct_id = st.number_input(
        "model_response_id (overrides filters)",
        min_value=1, step=1, value=mr_id,
    )
    if direct_id != mr_id:
        # User overrode the filter-derived ID; honor it
        mr_id = int(direct_id)
        st.session_state["model_response_id"] = mr_id


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
