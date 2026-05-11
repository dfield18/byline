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
            validated against Clerk's JWKS and the User shape is
            populated from the standard Clerk claims.

The User shape is intentionally minimal — user_id, org_id, email. Routes
declare `Depends(current_user)` and the multi-tenancy filter in the
query layer uses `user.org_id`.

Required env vars in prod mode:
    CLERK_ISSUER   e.g., https://united-crayfish-78.clerk.accounts.dev
                   (the host portion of the publishable key, base64-
                   decoded — also visible on the Clerk dashboard).

Optional:
    CLERK_AUDIENCE — only set if you've configured a custom audience
                     claim in the Clerk dashboard. Most byline setups
                     leave this unset.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from dataclasses import dataclass

import httpx
from fastapi import Header, HTTPException, status
from jose import jwt
from jose.exceptions import JWTError

logger = logging.getLogger(__name__)


@dataclass
class User:
    """Identity for an authenticated caller. Populated from the Clerk
    JWT in prod; populated as a fixed mock in dev.
    """

    user_id: str
    org_id: str | None = None
    email: str | None = None


_AUTH_DISABLED = os.environ.get("BYLINE_AUTH", "").lower() == "disabled"

_MOCK_USER = User(
    user_id="user_dev",
    org_id="org_internal",
    email="dev@local",
)


# ─── Clerk JWKS cache ────────────────────────────────────────────────
#
# Clerk rotates signing keys infrequently. Strategy:
#   1. Fetch JWKS lazily on first request.
#   2. Cache in memory for _JWKS_TTL_SECONDS.
#   3. If a JWT carries a `kid` we don't have, refetch immediately
#      (handles rotation that happens between TTL refreshes).
# Single-process cache is fine — uvicorn workers each warm their own.

_JWKS_TTL_SECONDS = 3600
_jwks_cache: dict[str, list[dict]] = {}  # issuer -> list of JWK dicts
_jwks_fetched_at: dict[str, float] = {}
_jwks_lock = threading.Lock()


def _fetch_jwks(issuer: str) -> list[dict]:
    """Fetch JWKS for an issuer. Raises HTTPException(503) on network failure."""
    url = issuer.rstrip("/") + "/.well-known/jwks.json"
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(url)
            resp.raise_for_status()
            return resp.json()["keys"]
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        logger.error("Failed to fetch Clerk JWKS from %s: %s", url, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth provider unavailable",
        ) from exc


def _get_jwk_for_kid(issuer: str, kid: str) -> dict:
    """Return the JWK matching `kid`, refetching if the cached set doesn't have it."""
    with _jwks_lock:
        cached = _jwks_cache.get(issuer)
        fetched_at = _jwks_fetched_at.get(issuer, 0)
        stale = (time.time() - fetched_at) > _JWKS_TTL_SECONDS

        if not cached or stale:
            cached = _fetch_jwks(issuer)
            _jwks_cache[issuer] = cached
            _jwks_fetched_at[issuer] = time.time()

        for jwk in cached:
            if jwk.get("kid") == kid:
                return jwk

        # Unknown kid — could be a fresh rotation. Refetch once.
        cached = _fetch_jwks(issuer)
        _jwks_cache[issuer] = cached
        _jwks_fetched_at[issuer] = time.time()
        for jwk in cached:
            if jwk.get("kid") == kid:
                return jwk

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Unknown token signing key",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _require_env(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        raise RuntimeError(
            f"{name} is required when BYLINE_AUTH is not 'disabled'. "
            "Set it to your Clerk Frontend API URL "
            "(e.g., https://<your-app>.clerk.accounts.dev)."
        )
    return val


# Fail fast on startup if prod-mode env is incomplete.
if not _AUTH_DISABLED:
    _CLERK_ISSUER = _require_env("CLERK_ISSUER")
    _CLERK_AUDIENCE = os.environ.get("CLERK_AUDIENCE") or None
else:
    _CLERK_ISSUER = ""
    _CLERK_AUDIENCE = None


def assert_refresh_in_org(refresh_run_id: int, user: User) -> None:
    """Raise 404 if the refresh_run's subject doesn't belong to user.org_id.
    Defensive check used by routes that take a refresh_run_id as input
    so a customer can't poke around guessing refresh IDs."""
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
    if not row or row[0] != user.org_id:
        raise HTTPException(
            status_code=404,
            detail=f"refresh_run {refresh_run_id} not found",
        )


def assert_response_in_org(model_response_id: int, user: User) -> None:
    """Same as assert_refresh_in_org but for model_responses."""
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


def _validate_clerk_jwt(token: str) -> User:
    """Validate a Clerk JWT against the cached JWKS and return a User.

    Raises HTTPException(401) on any validation failure.
    """
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    kid = header.get("kid")
    if not kid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing 'kid' header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    jwk = _get_jwk_for_kid(_CLERK_ISSUER, kid)

    try:
        # Clerk default JWTs don't carry an `aud` claim, so we skip
        # audience verification unless CLERK_AUDIENCE is explicitly set.
        decode_kwargs: dict = {
            "algorithms": [jwk.get("alg", "RS256")],
            "issuer": _CLERK_ISSUER,
        }
        if _CLERK_AUDIENCE:
            decode_kwargs["audience"] = _CLERK_AUDIENCE
        else:
            decode_kwargs["options"] = {"verify_aud": False}

        claims = jwt.decode(token, jwk, **decode_kwargs)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    sub = claims.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing 'sub' claim",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Clerk v2 session tokens nest org info under `o.id`. Older versions
    # used a top-level `org_id`; we accept either so the code doesn't
    # break across token-format upgrades.
    org_claim = claims.get("o")
    org_id = org_claim.get("id") if isinstance(org_claim, dict) else None
    if not org_id:
        org_id = claims.get("org_id")

    return User(
        user_id=sub,
        org_id=org_id,
        email=claims.get("email"),
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

    token = authorization[len("Bearer "):].strip()
    return _validate_clerk_jwt(token)
