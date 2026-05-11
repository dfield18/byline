"""app/api/auth.py — auth dependency for FastAPI routes.

v0 scaffold: returns a mock user when the env var BYLINE_AUTH=disabled,
otherwise validates a JWT (placeholder — wire Clerk JWKS validation here
when the frontend ships).

The intent is that every endpoint declares `Depends(current_user)` and
gets a `User` object back. The mock-user dev path lets us build the
frontend before the production auth stack is wired.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

from fastapi import Header, HTTPException, status


@dataclass
class User:
    """Identity for an authenticated caller. In v0 scaffold this is a
    minimal shape; once Clerk is wired the Clerk JWT will populate it.
    """

    user_id: str
    org_id: str | None = None
    email: str | None = None


# Switch off for local dev / internal scripts: BYLINE_AUTH=disabled
_AUTH_DISABLED = os.environ.get("BYLINE_AUTH", "").lower() == "disabled"

_MOCK_USER = User(
    user_id="dev-user",
    org_id="dev-org",
    email="dev@local",
)


async def current_user(authorization: str | None = Header(default=None)) -> User:
    """FastAPI dependency. Returns the authenticated user, or 401s.

    v0 behavior:
      - If `BYLINE_AUTH=disabled` in the environment, returns a mock user
        (useful for local dev / curl / internal dashboard).
      - Otherwise expects `Authorization: Bearer <jwt>` and rejects if
        missing. JWT validation is a TODO — wire Clerk JWKS here.
    """
    if _AUTH_DISABLED:
        return _MOCK_USER

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization: Bearer <token> required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # token = authorization[len("Bearer "):]
    # TODO: validate against Clerk JWKS; extract user_id + org_id.
    # For now any bearer token is accepted but resolves to the mock user
    # — this keeps the scaffold runnable while keeping the contract
    # in place. Replace before any real customer traffic.
    return _MOCK_USER
