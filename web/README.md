# byline — customer-facing web app

Next.js (App Router) + Tailwind frontend that calls the byline FastAPI for all data. v0 scaffold — auth is mocked, no write paths yet, two pages (home + subject detail).

## Stack

| layer | tech |
|---|---|
| framework | Next.js 16 (App Router, Turbopack) |
| language | TypeScript |
| styling | Tailwind v4 |
| data | server-side `fetch` from the FastAPI in `app/api/` (Python) |
| auth (future) | Clerk (placeholder bearer-token now) |

## Run locally

The web app talks to the FastAPI. Start that first:

```bash
# from the repo root, in a separate terminal
BYLINE_AUTH=disabled uvicorn app.api.main:app --reload --port 8000
```

Then in `web/`:

```bash
cp .env.example .env.local           # one-time: configure dev env
npm install                            # one-time
npm run dev                            # http://localhost:3000
```

Open <http://localhost:3000> — you should see the byline header, four metric tiles, and a table of all subjects pulled live from the FastAPI.

## Pages (v0)

- `/` — subject list with quick stats (refreshes, findings, last refreshed); category badges; row click → subject detail
- `/subjects/[id]` — subject profile + refresh history table

Drill-down into per-refresh findings and per-response detail will land here next. For now, the internal Streamlit dashboard at `dashboard/` covers those views.

## File layout

```
web/
├── app/
│   ├── page.tsx              # home — subject list
│   ├── subjects/[id]/page.tsx # subject detail
│   ├── layout.tsx            # root layout
│   └── globals.css           # tailwind setup
├── lib/
│   └── api.ts                # typed fetch client for the FastAPI
├── .env.example              # commit this
├── .env.local                # gitignored — actual dev config
└── package.json
```

## Env vars

See `.env.example`. Two vars:

- `BYLINE_API_URL` — where the FastAPI is reachable. Local dev: `http://localhost:8000`. Production: the deployed URL.
- `BYLINE_API_TOKEN` — bearer token sent on every API request. While the API runs with `BYLINE_AUTH=disabled`, any non-empty string works.

When Clerk lands, `BYLINE_API_TOKEN` is replaced by the user's session JWT passed through from Clerk.

## What's not in v0

- Auth (Clerk integration)
- Write paths (subject creation, refresh trigger forms)
- Cross-subject comparison views
- Charts / visualizations
- Production deployment (Vercel + a hosted FastAPI service)

See the repo-root `STATE.md` "Production stack" section for the broader plan.
