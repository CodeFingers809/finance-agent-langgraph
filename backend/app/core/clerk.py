"""Clerk session verification and Backend API access.

Clerk is the source of truth for identity, organizations, and roles. This module
verifies incoming session tokens and exposes a typed view of the claims the rest
of the app cares about (user id, active org, role).
"""

import logging
from dataclasses import dataclass
from typing import Any

import httpx
from clerk_backend_api import AuthenticateRequestOptions, Clerk, authenticate_request

from app.core.config import settings

logger = logging.getLogger(__name__)

CLERK_API_BASE = "https://api.clerk.com/v1"

ROLE_ADMIN = "org:admin"
ROLE_MEMBER = "org:member"


@dataclass(frozen=True)
class ClerkClaims:
    """The subset of Clerk session claims the backend authorizes against."""

    user_id: str
    org_id: str | None
    org_role: str | None

    @property
    def is_org_admin(self) -> bool:
        return self.org_role == ROLE_ADMIN


def verify_session(request: Any) -> ClerkClaims | None:
    """Verify a request's Clerk session token.

    Returns None when the request carries no valid session -- callers turn that
    into a 401. Raises nothing on bad tokens by design.
    """
    if not settings.CLERK_SECRET_KEY:
        logger.error("CLERK_SECRET_KEY is not configured; rejecting request")
        return None

    state = authenticate_request(
        request,
        AuthenticateRequestOptions(secret_key=settings.CLERK_SECRET_KEY),
    )
    if not state.is_signed_in:
        logger.debug("Clerk auth rejected request: %s", state.reason)
        return None

    payload = state.payload or {}
    user_id = payload.get("sub")
    if not user_id:
        return None

    # Clerk sends the active org as `o` (v2 claims) or flat `org_*` (v1).
    org = payload.get("o") or {}
    org_id = org.get("id") or payload.get("org_id")
    org_role = org.get("rol") or payload.get("org_role")
    # v2 abbreviates the role ("admin"); normalize to the `org:` form used
    # everywhere else, including Clerk's own Backend API.
    if org_role and not org_role.startswith("org:"):
        org_role = f"org:{org_role}"

    return ClerkClaims(user_id=user_id, org_id=org_id, org_role=org_role)


def get_clerk() -> Clerk:
    """Clerk Backend API SDK client."""
    return Clerk(bearer_auth=settings.CLERK_SECRET_KEY)


async def clerk_request(
    method: str, path: str, *, json: dict[str, Any] | None = None
) -> Any:
    """Call the Clerk Backend API directly.

    Used for the handful of endpoints the SDK doesn't cover cleanly. Raises on
    non-2xx so callers surface real errors instead of silently degrading.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.request(
            method,
            f"{CLERK_API_BASE}{path}",
            json=json,
            headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
        )
    if resp.status_code >= 400:
        # Clerk returns structured errors; surface the message rather than a bare status.
        detail = resp.text
        try:
            errors = resp.json().get("errors", [])
            if errors:
                detail = "; ".join(
                    e.get("long_message") or e.get("message", "") for e in errors
                )
        except Exception:
            pass
        raise ClerkAPIError(resp.status_code, detail)
    return resp.json() if resp.content else None


class ClerkAPIError(Exception):
    """A non-2xx response from Clerk's Backend API."""

    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"Clerk API {status_code}: {detail}")
