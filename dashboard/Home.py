"""dashboard/Home.py — internal dashboard entry point.

Run with:
    streamlit run dashboard/Home.py

The dashboard is read-only on the Postgres DB. No auth (internal-only).
"""
from __future__ import annotations

import streamlit as st

from dashboard.lib.queries import list_subjects


st.set_page_config(
    page_title="byline — internal dashboard",
    page_icon="📡",
    layout="wide",
)


@st.cache_data(ttl=60)
def _subjects():
    return list_subjects()


st.title("byline — internal dashboard")
st.caption("AI search visibility for political + public-affairs subjects. Read-only view over the local Postgres data.")

subjects = _subjects()

if not subjects:
    st.info("No subjects in the DB yet. Run `python -m app.refresh \"<name>\"` to create one.")
    st.stop()

# ─── headline metrics ───────────────────────────────────────────────────

total_refreshes = sum(s["n_refreshes"] for s in subjects)
total_findings = sum(s["n_findings"] for s in subjects)
by_cat: dict[str, int] = {}
for s in subjects:
    by_cat[s["category"]] = by_cat.get(s["category"], 0) + 1

c1, c2, c3, c4 = st.columns(4)
c1.metric("Subjects", len(subjects))
c2.metric("Refreshes", total_refreshes)
c3.metric("Cross-analyzer findings", total_findings)
c4.metric("Categories", len(by_cat))

st.divider()

# ─── subjects table ────────────────────────────────────────────────────

st.subheader("Subjects")

rows = []
for s in subjects:
    si = s["setup_inputs"] or {}
    detail = si.get("role") or si.get("type") or si.get("primary_domain") or si.get("date_or_period") or ""
    rows.append({
        "id": s["id"],
        "name": s["name"],
        "category": s["category"],
        "detail": detail,
        "refreshes": s["n_refreshes"],
        "findings": s["n_findings"],
        "last refreshed": s["latest_refresh_at"].strftime("%Y-%m-%d %H:%M") if s["latest_refresh_at"] else "",
    })

# Filter row
search = st.text_input("Filter by name / category / detail", "")
if search:
    s = search.lower()
    rows = [r for r in rows if s in r["name"].lower() or s in r["category"].lower() or s in (r["detail"] or "").lower()]

st.dataframe(
    rows,
    column_config={
        "id": st.column_config.NumberColumn("id", width="small"),
        "name": st.column_config.TextColumn("name", width="large"),
        "category": st.column_config.TextColumn("category", width="small"),
        "detail": st.column_config.TextColumn("role / type / domain", width="medium"),
        "refreshes": st.column_config.NumberColumn("# refreshes", width="small"),
        "findings": st.column_config.NumberColumn("# findings", width="small"),
        "last refreshed": st.column_config.TextColumn("last refreshed", width="medium"),
    },
    hide_index=True,
    use_container_width=True,
)

st.caption(
    "Pick a subject by ID below to drill into its findings. "
    "(Streamlit's URL params will pre-fill the subject page if you bookmark a link.)"
)

# Subject picker
ids = {f'{s["name"]} ({s["category"]}, id={s["id"]})': s["id"] for s in subjects}
choice = st.selectbox("Subject", options=list(ids.keys()), index=None, placeholder="pick one…")
if choice:
    sid = ids[choice]
    st.page_link(f"pages/01_subject.py?subject_id={sid}", label=f"→ Open subject detail for id={sid}")
    # Streamlit handles query params via session_state on the destination page.
    st.session_state["subject_id"] = sid

st.divider()
st.caption(
    "Pages: **Subject detail** (left sidebar) shows one subject's cross-analyzer findings + per-response drill-down. "
    "**Response detail** shows one model_response with all six extractor outputs inline."
)
