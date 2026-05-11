# byline — internal dashboard

Read-only Streamlit dashboard over the local Postgres data. No auth — internal use only.

## Run

```bash
# from the repo root
streamlit run dashboard/Home.py
```

Opens at <http://localhost:8501>.

The Python dependencies (`streamlit`, `pandas`) live under the `dashboard` extra in `pyproject.toml`; if you're setting up fresh:

```bash
pip install -e ".[dashboard]"
```

## Layout

```
dashboard/
├── Home.py                # entry — subject list + headline metrics
├── pages/
│   ├── 01_subject.py      # one subject's refreshes + cross-analyzer findings + response list
│   └── 02_response.py     # one model_response with all six extractor outputs inline
└── lib/
    └── queries.py         # read-only query layer (DB access)
```

## Page descriptions

**Home** — lists all subjects with quick stats (refresh count, last refresh, finding count). Filter box, picker that deep-links to the subject page.

**Subject detail** — sidebar picker. Shows the subject's setup_inputs, its refresh history, cross-analyzer findings for the picked refresh (tabbed by analysis_type: asymmetry · top_quotes · share_of_voice · narrative_drift), and a per-response drill-down list.

**Response detail** — one model_response. Shows the rendered prompt sent + response text side-by-side, scores at the top, then tabs for descriptors / entities / sources / themes / mention_detection / raw citations.

## Read semantics

All data queries route through `dashboard/lib/queries.py`. The per-response extractor columns are aggregated **latest non-null per column across all analysis_runs** for a given model_response — same semantics as `app/cross_analyzer.py` post-Issue-1 fix. This means partial-backfill data (e.g., a `--only-extractor mention_detection` run that only populates mention columns) doesn't shadow earlier full-stack runs.

Cross-analyzer findings come from the latest analysis_run with methodology_version `cross-analysis-*` per refresh.

## What's not here yet (v0 scope)

- No write paths (refresh / analyze / cross-analyze are CLI tools, not buttons here)
- No auth — assumes local network only
- No comparison views across subjects or across refreshes (per-subject detail only)
- No charts or visualizations — just tables, metrics, and tabs
- Streamlit's built-in caching is set to 60 seconds; restart the server to bust cache after data changes

These are reasonable v0.x additions when the use case is clearer.
