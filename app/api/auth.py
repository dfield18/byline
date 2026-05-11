"""app/api/auth.py — auth dependency for FastAPI routes.

Two modes:

  Dev mode  (BYLINE_AUTH=disabled): all requests resolve to a fixed mock
            User. Lets the internal Streamlit dashboard, curl, and local
            Next.js dev hit the API without a Clerk account. Mock org_id
            is "org_internal" — all dev-created subjects land in that
            org, separate from the 11 seed subjects (which have NULL
            org_id).

  Prod mode (BYLINE_AUTH unset/anything else): every request must
            present an `Authorization: Bearer <jwt>` header. The JWT is
            validated against Clerk's JWKS (TODO — see below) and the
            User shape is populated from the standard Clerk claims.

The User shape is intentionally minimal — user_id, org_id, email. Routes
declare `Depends(current_user)` and the multi-tenancy filter in the
query layer uses `user.org_id`.

Wiring Clerk (when you sign up for Clerk and have a project):

  1. Get the Frontend API URL from Clerk dashboard → API Keys → "JWT
     issuer". Looks like https://<your-app>.clerk.accounts.dev or
     similar.
  2. Set env vars:
         CLERK_ISSUER=https://<your-app>.clerk.accounts.dev
         CLERK_AUDIENCE=<your-frontend-api-key>   # optional but recommended
  3. Implement the TODO below — fetch JWKS from
     `${CLERK_ISSUER}/.well-known/jwks.json`, cache it, use
     python-jose to validate the bearer token against it. Extract
     `sub` → user_id and `org_id` → org_id from the claims.

The placeholder version below accepts ANY bearer token and resolves to
the mock User. This keeps the contract in place so routes can declare
the Depends and the frontend can already pass bearer tokens; production
deploy MUST replace the TODO before going live.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

from fastapi import Header, HTTPException, status


@dataclass
class User:
    """Identity for an authenticated caller. Populated from the Clerk
    JWT in prod; populated as a fixed mock in dev.
    """

    user_id: str
    org_id: str | None = None
    email: str | None = None


# Switch off for local dev / internal scripts: BYLINE_AUTH=disabled
_AUTH_DISABLED = os.environ.get("BYLINE_AUTH", "").lower() == "disabled"

# Dev mode mock user. The org_id here separates dev-created subjects
# from the 11 NULL-org seed subjects, so the operator (Streamlit) and
# the API see distinct scopes:
#   - Streamlit (unscoped queries) → 11 seed + any dev-created
#   - API in dev mode (scoped to org_internal) → only dev-created
# In production, Clerk org_ids look like "org_2abc...".
_MOCK_USER = User(
    user_id="user_dev",
    org_id="org_internal",
    email="dev@local",
)


def assert_refresh_in_org(refresh_run_id: int, user: User) -> None:
    """Raise 404 if the refresh_run's subject doesn't belong to user.org_id.
    Defensive check used by routes that take a refresh_run_id as input
    so a customer can't poke around guessing refresh IDs."""
    from fastapi import HTTPException
    from app.db import get_cursor

    if not user.org_id:
        raise HTTPException(status_code=403, detail="Org-scoped endpoint")

    with get_cursor(commit=False) as cur:
        cur.execute(
            """
            SELECT s.org_id FROM refresh_runs rr
            JOIN subjects s ON s.id = rr.subject_id
            WHERE rr.id = %s
            """,
            (refresh_run_id,),
        )
        row = cur.fetchone()
    # Use 404 (not 403) — don't leak that the refresh exists elsewhere.
    if not row or row[0] != user.org_id:
        raise HTTPException(
            status_code=404,
            detail=f"refresh_run {refresh_run_id} not found",
        )


def assert_response_in_org(model_response_id: int, user: User) -> None:
    """Same as assert_refresh_in_org but for model_responses."""
    from fastapi import HTTPException
    from app.db import get_cursor

    if not user.org_id:
        raise HTTPException(status_code=403, detail="Org-scoped endpoint")

    with get_cursor(commit=False) as cur:
        cur.execute(
            """
            SELECT s.org_id FROM model_responses mr
            JOIN subjects s ON s.id = mr.subject_id
            WHERE mr.id = %s
            """,
            (model_response_id,),
        )
        row = cur.fetchone()
    if not row or row[0] != user.org_id:
        raise HTTPException(
            status_code=404,
            detail=f"model_response {model_response_id} not found",
        )


async def current_user(authorization: str | None = Header(default=None)) -> User:
    """FastAPI dependency. Returns the authenticated user, or 401s."""
    if _AUTH_DISABLED:
        return _MOCK_USER

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization: Bearer <token> required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # token = authorization[len("Bearer "):]
    #
    # TODO (production): validate `token` against Clerk's JWKS.
    #
    #   from jose import jwt
    #   issuer = os.environ["CLERK_ISSUER"]
    #   jwks = _load_jwks_cached(issuer + "/.well-known/jwks.json")
    #   claims = jwt.decode(token, jwks, algorithms=["RS256"], issuer=issuer,
    #                       audience=os.environ.get("CLERK_AUDIENCE"))
    #   return User(
    #       user_id=claims["sub"],
    #       org_id=claims.get("org_id"),
    #       email=claims.get("email"),
    #   )
    #
    # Until that's wired, ANY bearer token resolves to the mock user.
    # This keeps the bearer-token contract in place and lets the
    # frontend pass dev tokens without errors, but it MUST be replaced
    # before any production traffic. Refuse to start with
    # BYLINE_AUTH=production set if Clerk env vars are missing.
    return _MOCK_USER
