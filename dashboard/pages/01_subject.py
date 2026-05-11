"""dashboard/pages/01_subject.py — one subject's detail view.

Shows: subject's setup_inputs, list of refreshes, latest refresh's
cross-analyzer findings (asymmetry / top_quotes / share_of_voice /
narrative_drift), and a per-response drill-down list."""
from __future__ import annotations

import sys
from pathlib import Path

# Repo-root path injection — see dashboard/Home.py for the explanation.
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import json
import streamlit as st

from dashboard.lib.queries import (
    get_subject, get_refresh_responses, get_cross_findings, list_subjects,
)


st.set_page_config(page_title="byline · subject", layout="wide")


# Subject picker (sidebar)
@st.cache_data(ttl=60)
def _subjects():
    return list_subjects()


subjects = _subjects()
ids = {f'{s["name"]} ({s["category"]})': s["id"] for s in subjects}

# Prefer query-param / session-state value
default_sid = st.session_state.get("subject_id")
if default_sid is None and "subject_id" in st.query_params:
    try:
        default_sid = int(st.query_params["subject_id"])
    except (ValueError, TypeError):
        default_sid = None

default_choice = None
if default_sid is not None:
    for label, sid in ids.items():
        if sid == default_sid:
            default_choice = label
            break

choice = st.sidebar.selectbox(
    "Subject",
    options=list(ids.keys()),
    index=list(ids.keys()).index(default_choice) if default_choice else 0,
)
sid = ids[choice]
st.session_state["subject_id"] = sid


@st.cache_data(ttl=60)
def _subject(subject_id: int):
    return get_subject(subject_id)


@st.cache_data(ttl=60)
def _responses(refresh_run_id: int):
    return get_refresh_responses(refresh_run_id)


@st.cache_data(ttl=60)
def _findings(refresh_run_id: int):
    return get_cross_findings(refresh_run_id)


subj = _subject(sid)
if not subj:
    st.error(f"Subject id={sid} not found")
    st.stop()

# ─── header ────────────────────────────────────────────────────────────

st.title(subj["name"])
st.caption(f"Category: **{subj['category']}** · subject id={subj['id']} · created {subj['created_at']:%Y-%m-%d}")

si = subj["setup_inputs"] or {}
cols = st.columns(4)
fields = [
    ("role", si.get("role") or si.get("type") or si.get("date_or_period") or "—"),
    ("primary domain", si.get("primary_domain") or si.get("domain") or "—"),
    ("contextual domain", si.get("contextual_domain") or "—"),
    ("canonical_url", si.get("canonical_url") or "—"),
]
for col, (label, value) in zip(cols, fields):
    col.markdown(f"**{label}**  \n{value}")

with st.expander("Full setup_inputs"):
    st.json(si)

st.divider()

# ─── refreshes ─────────────────────────────────────────────────────────

st.subheader("Refreshes")
if not subj["refreshes"]:
    st.info("No refreshes yet.")
    st.stop()

refresh_rows = [
    {
        "id": r["id"],
        "started_at": r["started_at"].strftime("%Y-%m-%d %H:%M") if r["started_at"] else "",
        "status": r["status"],
        "responses": f"{r['n_ok']}/{r['n_responses']}",
        "cost": f"${float(r['cost_usd']):.4f}",
    }
    for r in subj["refreshes"]
]
st.dataframe(refresh_rows, hide_index=True, use_container_width=True)

picked_rr_id = st.selectbox(
    "Pick a refresh to drill into",
    options=[r["id"] for r in subj["refreshes"]],
    format_func=lambda rid: f"refresh_run {rid} ({next(r['started_at'].strftime('%Y-%m-%d %H:%M') for r in subj['refreshes'] if r['id'] == rid)})",
    index=0,
)

st.divider()

# ─── cross-analyzer findings ───────────────────────────────────────────

st.subheader(f"Cross-analyzer findings — refresh_run {picked_rr_id}")

findings = _findings(picked_rr_id)
if not findings:
    st.info("No cross-analyzer findings for this refresh. Run `python -m app.cross_analyzer "
            f"{picked_rr_id}` to generate them.")
else:
    by_type: dict[str, list] = {}
    for f in findings:
        by_type.setdefault(f["analysis_type"], []).append(f)

    tab_labels = [t for t in ("asymmetry", "top_quotes", "share_of_voice", "narrative_drift") if t in by_type]
    if tab_labels:
        tabs = st.tabs([t.replace("_", " ").title() for t in tab_labels])
        for tab, t in zip(tabs, tab_labels):
            with tab:
                for f in by_type[t]:
                    head_parts = []
                    if f["model_slug"]:
                        head_parts.append(f"**{f['model_slug']}**")
                    if f["analysis_key"]:
                        head_parts.append(f"*{f['analysis_key']}*")
                    if head_parts:
                        st.markdown(" · ".join(head_parts))
                    if f["summary"]:
                        st.write(f["summary"])

                    # Type-specific drill-down
                    fd = f["findings"]
                    if t == "asymmetry":
                        if "gaps" in fd:
                            with st.expander("Gap detail"):
                                gap_rows = [
                                    {"dimension": k, "value": v}
                                    for k, v in fd["gaps"].items() if v is not None
                                ]
                                st.dataframe(gap_rows, hide_index=True, use_container_width=True)
                        if "left" in fd and "right" in fd:
                            with st.expander("Per-side detail"):
                                c1, c2 = st.columns(2)
                                with c1:
                                    st.markdown(f"**LEFT — {fd['pair']['left']['layer']}/{fd['pair']['left']['position']}** *({fd['pair']['left']['dimension']})*")
                                    st.json(fd["left"])
                                with c2:
                                    st.markdown(f"**RIGHT — {fd['pair']['right']['layer']}/{fd['pair']['right']['position']}** *({fd['pair']['right']['dimension']})*")
                                    st.json(fd["right"])

                    elif t == "top_quotes":
                        for q in fd.get("quotes", []):
                            quote_head = f"[{q.get('type','?')}] **{q.get('model_slug','?')} {q.get('slot','?')}**"
                            st.markdown(quote_head)
                            st.markdown(f"> {q.get('text','')}")
                            if q.get("rationale"):
                                st.caption(f"*rationale:* {q['rationale']}")
                            st.markdown("---")

                    elif t == "share_of_voice":
                        c1, c2, c3 = st.columns(3)
                        c1.metric("Mention rate", f"{(fd.get('mention_rate', 0) or 0)*100:.0f}%")
                        c2.metric("Avg rank", fd.get("average_rank") or "—")
                        c3.metric("Responses evaluated", fd.get("responses_evaluated", 0))
                        top = fd.get("top_competitors", [])
                        if top:
                            st.markdown("**Top competitors:**")
                            st.dataframe(
                                [
                                    {
                                        "name": c["name"], "type": c["type"],
                                        "appears in": c["appears_in_responses"],
                                        "avg rank": c["avg_rank"],
                                    } for c in top
                                ],
                                hide_index=True, use_container_width=True,
                            )

                    elif t == "narrative_drift":
                        c1, c2 = st.columns(2)
                        c1.markdown(f"**Current refresh:** {fd.get('current_refresh_id')}")
                        c2.markdown(f"**Prior refresh:** {fd.get('prior_refresh_id')} ({fd.get('interval_days')} days ago)")
                        if fd.get("score_deltas"):
                            st.markdown("**Score deltas:**")
                            st.dataframe(
                                [{"dimension": k, "delta": v} for k, v in fd["score_deltas"].items()],
                                hide_index=True, use_container_width=True,
                            )
                        # Theme/descriptor/entity turnover
                        for kind in ("themes", "descriptors", "entities"):
                            if kind in fd:
                                d = fd[kind]
                                with st.expander(f"{kind.title()} turnover (stable / added / dropped)"):
                                    st.markdown(f"**Stable ({len(d.get('stable', []))}):** {', '.join(d.get('stable', [])[:20])}")
                                    st.markdown(f"**Added ({len(d.get('added', []))}):** {', '.join(d.get('added', [])[:20])}")
                                    st.markdown(f"**Dropped ({len(d.get('dropped', []))}):** {', '.join(d.get('dropped', [])[:20])}")

                    st.markdown(" ")

st.divider()

# ─── responses drill-down list ─────────────────────────────────────────

st.subheader(f"Responses — refresh_run {picked_rr_id}")

responses = _responses(picked_rr_id)
if not responses:
    st.info("No responses for this refresh.")
else:
    rows = []
    for r in responses:
        scores = r["scores"] or {}
        rows.append({
            "id": r["model_response_id"],
            "slot": f"{r['layer']}/{r['position']}",
            "dimension": r["dimension"],
            "model": r["model_slug"],
            "len": len(r["response_text"] or ""),
            "descriptors": len(r["descriptors"] or []),
            "entities": len(r["entities"] or []),
            "citations": (r["total_sources_cited"] or 0),
            "own_site": r["cited_own_site"],
            "sentiment": scores.get("sentiment"),
            "criticism": scores.get("criticism_severity"),
            "lean": scores.get("directional_lean"),
            "subj_mentioned": r["subject_mentioned"],
            "mention_rank": r["mention_rank"],
        })
    st.dataframe(rows, hide_index=True, use_container_width=True)

    st.caption("Click a row to copy its `id`; open it on the **Response detail** page (sidebar) or use the picker below.")
    picked_mr_id = st.selectbox(
        "Pick a response to inspect",
        options=[r["model_response_id"] for r in responses],
        format_func=lambda mid: next(
            f"mr {mid} — {r['layer']}/{r['position']} ({r['model_slug']})"
            for r in responses if r["model_response_id"] == mid
        ),
    )
    if picked_mr_id:
        st.session_state["model_response_id"] = picked_mr_id
        st.page_link(f"pages/02_response.py?model_response_id={picked_mr_id}",
                     label=f"→ Open response detail for mr {picked_mr_id}")
