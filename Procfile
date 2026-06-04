# Python backend processes (the Next.js frontend in web-next/ deploys
# separately, e.g. to Vercel). Both MUST run in production:
#   web    — the FastAPI app the frontend calls
#   worker — runs queued refresh jobs (incl. the public "try it" pipeline)
#            and prunes stale try-subjects. Without it, refreshes never run.
web: uvicorn app.api.main:app --host 0.0.0.0 --port ${PORT:-8000}
worker: python -m app.worker
