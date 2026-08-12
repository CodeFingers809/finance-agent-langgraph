"""Clerk webhook receiver.

Keeps the local User/Organization mirrors in sync with Clerk, and enforces the
two membership rules the product needs:
  - a personal organization exists for every user
  - leaving/being removed from an org drops you back to your personal org
"""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from sqlmodel import Session, select
from svix.webhooks import Webhook, WebhookVerificationError

from app.core.clerk import ClerkAPIError, clerk_request
from app.core.config import settings
from app.core.db import engine
from app.models import Organization, User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def _primary_email(data: dict[str, Any]) -> str | None:
    """The user's primary email, falling back to the first on file."""
    addresses = data.get("email_addresses") or []
    primary_id = data.get("primary_email_address_id")
    for addr in addresses:
        if addr.get("id") == primary_id:
            return addr.get("email_address")
    return addresses[0].get("email_address") if addresses else None


async def _ensure_personal_org(session: Session, clerk_user_id: str, email: str) -> None:
    """Create the user's personal org in Clerk if they have no membership.

    This is what "removed from an org -> back to your own org" relies on: Clerk
    has no concept of a default org, so we materialize one.
    """
    try:
        mems = await clerk_request(
            "GET", f"/users/{clerk_user_id}/organization_memberships?limit=10"
        )
        if mems.get("data"):
            return  # already belongs somewhere
        org = await clerk_request(
            "POST",
            "/organizations",
            json={
                "name": f"{email.split('@')[0]}'s Workspace",
                "created_by": clerk_user_id,
            },
        )
        org_id = org.get("id")
        if not org_id:
            return

        # Add the user as admin to the newly created org
        await clerk_request(
            "POST",
            f"/organizations/{org_id}/memberships",
            json={
                "user_id": clerk_user_id,
                "role": "org:admin",
            },
        )
        logger.info("Created personal org %s for user %s", org_id, clerk_user_id)
    except ClerkAPIError:
        logger.exception("Could not ensure personal org for %s", clerk_user_id)
        return

    org_id = org.get("id")
    if org_id and not session.get(Organization, org_id):
        session.add(
            Organization(
                id=org_id,
                name=org.get("name") or "Workspace",
                slug=org.get("slug"),
                is_personal=True,
            )
        )
        session.commit()


@router.post("/clerk")
async def clerk_webhook(request: Request) -> dict[str, str]:
    """Svix-verified Clerk event receiver."""
    if not settings.CLERK_WEBHOOK_SECRET:
        # Refuse rather than accept unverified events -- an open webhook endpoint
        # lets anyone forge user/org records.
        logger.error("CLERK_WEBHOOK_SECRET not set; rejecting webhook")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook receiver not configured",
        )

    payload = await request.body()
    try:
        event = Webhook(settings.CLERK_WEBHOOK_SECRET).verify(
            payload, dict(request.headers)
        )
    except WebhookVerificationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid webhook signature",
        ) from e

    event_type = event.get("type")
    data = event.get("data", {})
    logger.info("Clerk webhook: %s", event_type)

    with Session(engine) as session:
        if event_type in ("user.created", "user.updated"):
            await _handle_user_upsert(session, data, event_type)
        elif event_type == "user.deleted":
            _handle_user_deleted(session, data)
        elif event_type in ("organization.created", "organization.updated"):
            _handle_org_upsert(session, data)
        elif event_type == "organization.deleted":
            _handle_org_deleted(session, data)
        elif event_type == "organizationMembership.created":
            await _handle_membership_created(session, data)
        elif event_type == "organizationMembership.deleted":
            await _handle_membership_deleted(session, data)

    return {"status": "ok"}


async def _handle_user_upsert(
    session: Session, data: dict[str, Any], event_type: str
) -> None:
    clerk_user_id = data.get("id")
    if not clerk_user_id:
        return
    email = _primary_email(data) or f"{clerk_user_id}@clerk.local"

    user = session.exec(
        select(User).where(User.clerk_user_id == clerk_user_id)
    ).first()
    if not user:
        # Adopt a pre-Clerk account with this email so existing data carries over.
        user = session.exec(select(User).where(User.email == email)).first()
        if user:
            user.clerk_user_id = clerk_user_id
        else:
            user = User(
                email=email,
                clerk_user_id=clerk_user_id,
                full_name=" ".join(
                    p for p in [data.get("first_name"), data.get("last_name")] if p
                )
                or None,
                is_active=True,
                hashed_password=None,
            )
    else:
        user.email = email

    session.add(user)
    session.commit()

    if event_type == "user.created":
        await _ensure_personal_org(session, clerk_user_id, email)


def _handle_user_deleted(session: Session, data: dict[str, Any]) -> None:
    clerk_user_id = data.get("id")
    if not clerk_user_id:
        return
    user = session.exec(
        select(User).where(User.clerk_user_id == clerk_user_id)
    ).first()
    if user:
        # Deactivate rather than delete: their reports/conversations stay
        # attributable to the org.
        user.is_active = False
        session.add(user)
        session.commit()


def _handle_org_upsert(session: Session, data: dict[str, Any]) -> None:
    org_id = data.get("id")
    if not org_id:
        return
    org = session.get(Organization, org_id)
    if org:
        org.name = data.get("name") or org.name
        org.slug = data.get("slug")
    else:
        org = Organization(
            id=org_id, name=data.get("name") or org_id, slug=data.get("slug")
        )
    session.add(org)
    session.commit()


def _handle_org_deleted(session: Session, data: dict[str, Any]) -> None:
    org_id = data.get("id")
    if not org_id:
        return
    org = session.get(Organization, org_id)
    if org:
        # Cascades to org-scoped watchlists/portfolios/reports by FK.
        session.delete(org)
        session.commit()


async def _handle_membership_created(session: Session, data: dict[str, Any]) -> None:
    """A user joined an org (typically by accepting an invitation).

    Business rule: accepting an invite *moves* you -- you end up in exactly the
    inviter's org, so any other memberships are dropped.
    """
    org_data = data.get("organization") or {}
    org_id = org_data.get("id")
    user_data = data.get("public_user_data") or {}
    clerk_user_id = user_data.get("user_id")

    if org_id and not session.get(Organization, org_id):
        session.add(
            Organization(
                id=org_id,
                name=org_data.get("name") or org_id,
                slug=org_data.get("slug"),
            )
        )
        session.commit()

    if not (org_id and clerk_user_id):
        return

    # Drop every other membership so the user belongs to exactly this org.
    try:
        mems = await clerk_request(
            "GET", f"/users/{clerk_user_id}/organization_memberships?limit=100"
        )
    except ClerkAPIError:
        logger.exception("Could not list memberships for %s", clerk_user_id)
        return

    for mem in mems.get("data", []):
        other_id = (mem.get("organization") or {}).get("id")
        if not other_id or other_id == org_id:
            continue
        try:
            await clerk_request(
                "DELETE", f"/organizations/{other_id}/memberships/{clerk_user_id}"
            )
            logger.info(
                "Moved %s into %s (left %s)", clerk_user_id, org_id, other_id
            )
        except ClerkAPIError:
            # Personal orgs where the user is the last admin can't be left;
            # that's expected and not fatal.
            logger.info("Could not leave %s for %s", other_id, clerk_user_id)


async def _handle_membership_deleted(session: Session, data: dict[str, Any]) -> None:
    """Removed or left an org -> ensure they land back in a personal org."""
    user_data = data.get("public_user_data") or {}
    clerk_user_id = user_data.get("user_id")
    if not clerk_user_id:
        return

    user = session.exec(
        select(User).where(User.clerk_user_id == clerk_user_id)
    ).first()
    email = user.email if user else user_data.get("identifier")
    if email:
        await _ensure_personal_org(session, clerk_user_id, email)
