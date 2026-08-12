"""Organization dashboard: members, roles, invitations, and usage.

Clerk owns org membership and roles; these routes are a thin authorization layer
over Clerk's Backend API plus locally-owned data (saved reports, AI usage).
"""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlmodel import func, select

from app.api.deps import CurrentAuth, OrgAdmin, SessionDep
from app.core.clerk import ROLE_ADMIN, ROLE_MEMBER, ClerkAPIError, clerk_request
from app.models import Organization, ResearchReport, User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/organizations", tags=["organizations"])

ASSIGNABLE_ROLES = (ROLE_ADMIN, ROLE_MEMBER)


class InviteRequest(BaseModel):
    email_address: EmailStr
    role: str = ROLE_MEMBER


class RoleUpdateRequest(BaseModel):
    role: str


class CreateOrgRequest(BaseModel):
    name: str


def _require_active_org(auth: CurrentAuth) -> str:
    if not auth.org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active organization. Select one first.",
        )
    return auth.org_id


def _validate_role(role: str) -> str:
    if role not in ASSIGNABLE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Role must be one of: {', '.join(ASSIGNABLE_ROLES)}",
        )
    return role


@router.get("/me")
async def get_my_organization(
    session: SessionDep,
    auth: CurrentAuth,
) -> dict[str, Any]:
    """The caller's active organization, their role in it, and its members."""
    if not auth.org_id:
        return {
            "organization": None,
            "role": None,
            "members": [],
            "user_email": auth.user.email,
        }

    org = session.get(Organization, auth.org_id)
    org_name = org.name if org else None
    org_slug = org.slug if org else None

    # If org not in local DB, fetch from Clerk to get its details
    if not org:
        try:
            clerk_org = await clerk_request("GET", f"/organizations/{auth.org_id}")
            org_name = clerk_org.get("name")
            org_slug = clerk_org.get("slug")
            # Sync to local DB for future requests
            session.add(
                Organization(
                    id=auth.org_id,
                    name=org_name or auth.org_id,
                    slug=org_slug,
                )
            )
            session.commit()
        except ClerkAPIError:
            # If Clerk fetch fails, at least return something with the org_id
            logger.warning("Could not fetch org %s from Clerk", auth.org_id)

    members: list[dict[str, Any]] = []
    try:
        data = await clerk_request(
            "GET", f"/organizations/{auth.org_id}/memberships?limit=100"
        )
        for mem in data.get("data", []):
            pub = mem.get("public_user_data") or {}
            members.append(
                {
                    "membership_id": mem.get("id"),
                    "clerk_user_id": pub.get("user_id"),
                    "email": pub.get("identifier"),
                    "first_name": pub.get("first_name"),
                    "last_name": pub.get("last_name"),
                    "image_url": pub.get("image_url"),
                    "role": mem.get("role"),
                }
            )
    except ClerkAPIError as e:
        logger.exception("Failed to list members for %s", auth.org_id)
        raise HTTPException(status_code=502, detail=f"Clerk error: {e.detail}") from e

    return {
        "organization": {
            "id": auth.org_id,
            "name": org_name or auth.org_id,
            "slug": org_slug,
        },
        "role": auth.org_role,
        "members": members,
        "user_email": auth.user.email,
    }


@router.post("", status_code=201)
async def create_organization(
    payload: CreateOrgRequest,
    session: SessionDep,
    auth: CurrentAuth,
) -> dict[str, Any]:
    """Create a new organization and add the current user as admin."""
    if not auth.user.clerk_user_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Your account is not linked to Clerk yet; sign out and back in.",
        )

    try:
        # Create org in Clerk (created_by automatically assigns caller as org:admin)
        org = await clerk_request(
            "POST",
            "/organizations",
            json={
                "name": payload.name,
                "created_by": auth.user.clerk_user_id,
            },
        )
        org_id = org.get("id")
        if not org_id:
            raise HTTPException(
                status_code=502,
                detail="Clerk returned no organization ID",
            )

        # Sync to local DB
        if not session.get(Organization, org_id):
            session.add(
                Organization(
                    id=org_id,
                    name=org.get("name") or payload.name,
                    slug=org.get("slug"),
                )
            )
            session.commit()

        return {
            "id": org_id,
            "name": org.get("name") or payload.name,
            "slug": org.get("slug"),
        }
    except ClerkAPIError as e:
        logger.exception("Failed to create organization in Clerk for %s", auth.user.clerk_user_id)
        raise HTTPException(status_code=502, detail=f"Clerk error: {e.detail}") from e



@router.get("/me/stats")
async def get_org_stats(session: SessionDep, auth: CurrentAuth) -> dict[str, Any]:
    """Dashboard counters: saved reports and per-member AI usage."""
    org_id = _require_active_org(auth)

    report_count = session.exec(
        select(func.count())
        .select_from(ResearchReport)
        .where(ResearchReport.org_id == org_id)
    ).one()

    # Per-user report counts, joined to emails for display.
    rows = session.exec(
        select(User.email, func.count(ResearchReport.id))
        .join(ResearchReport, ResearchReport.user_id == User.id)
        .where(ResearchReport.org_id == org_id)
        .group_by(User.email)
    ).all()

    return {
        "saved_reports": report_count,
        "usage_by_member": [
            {"email": email, "reports": count} for email, count in rows
        ],
    }


@router.get("/me/invitations")
async def list_invitations(auth: OrgAdmin) -> dict[str, Any]:
    """Pending invitations. Admin-only: reveals who has been invited."""
    org_id = _require_active_org(auth)
    try:
        data = await clerk_request(
            "GET", f"/organizations/{org_id}/invitations?status=pending&limit=100"
        )
    except ClerkAPIError as e:
        raise HTTPException(status_code=502, detail=f"Clerk error: {e.detail}") from e

    return {
        "invitations": [
            {
                "id": inv.get("id"),
                "email_address": inv.get("email_address"),
                "role": inv.get("role"),
                "status": inv.get("status"),
                "created_at": inv.get("created_at"),
            }
            for inv in data.get("data", [])
        ]
    }


@router.post("/me/invitations", status_code=201)
async def invite_member(payload: InviteRequest, auth: OrgAdmin) -> dict[str, Any]:
    """Invite an email to this org. Clerk sends the invitation email."""
    org_id = _require_active_org(auth)
    role = _validate_role(payload.role)

    if not auth.user.clerk_user_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Your account is not linked to Clerk yet; sign out and back in.",
        )

    try:
        inv = await clerk_request(
            "POST",
            f"/organizations/{org_id}/invitations",
            json={
                "email_address": payload.email_address,
                "role": role,
                # Clerk requires the inviter for org invitations.
                "inviter_user_id": auth.user.clerk_user_id,
            },
        )
    except ClerkAPIError as e:
        # Surface Clerk's message (already-a-member, already-invited, etc.)
        # instead of a generic failure -- these are user-actionable.
        raise HTTPException(status_code=400, detail=e.detail) from e

    return {
        "id": inv.get("id"),
        "email_address": inv.get("email_address"),
        "role": inv.get("role"),
        "status": inv.get("status"),
    }


@router.delete("/me/invitations/{invitation_id}")
async def revoke_invitation(invitation_id: str, auth: OrgAdmin) -> dict[str, str]:
    org_id = _require_active_org(auth)
    try:
        await clerk_request(
            "POST",
            f"/organizations/{org_id}/invitations/{invitation_id}/revoke",
            json={"requesting_user_id": auth.user.clerk_user_id},
        )
    except ClerkAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail) from e
    return {"message": "Invitation revoked"}


@router.patch("/me/members/{clerk_user_id}")
async def update_member_role(
    clerk_user_id: str, payload: RoleUpdateRequest, auth: OrgAdmin
) -> dict[str, Any]:
    """Change a member's role. Admins cannot demote themselves."""
    org_id = _require_active_org(auth)
    role = _validate_role(payload.role)

    if clerk_user_id == auth.user.clerk_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot change your own role.",
        )

    try:
        mem = await clerk_request(
            "PATCH",
            f"/organizations/{org_id}/memberships/{clerk_user_id}",
            json={"role": role},
        )
    except ClerkAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail) from e

    return {"clerk_user_id": clerk_user_id, "role": mem.get("role")}


@router.delete("/me/members/{clerk_user_id}")
async def remove_member(clerk_user_id: str, auth: OrgAdmin) -> dict[str, str]:
    """Remove a member. Clerk's membership-deleted webhook moves them back to
    their personal org."""
    org_id = _require_active_org(auth)

    if clerk_user_id == auth.user.clerk_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot remove yourself. Use Leave organization instead.",
        )

    try:
        await clerk_request(
            "DELETE", f"/organizations/{org_id}/memberships/{clerk_user_id}"
        )
    except ClerkAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail) from e
    return {"message": "Member removed"}


@router.post("/me/leave")
async def leave_organization(auth: CurrentAuth) -> dict[str, str]:
    """Leave the active org. The webhook restores the caller's personal org."""
    org_id = _require_active_org(auth)
    if not auth.user.clerk_user_id:
        raise HTTPException(status_code=409, detail="Account not linked to Clerk.")

    try:
        await clerk_request(
            "DELETE",
            f"/organizations/{org_id}/memberships/{auth.user.clerk_user_id}",
        )
    except ClerkAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail) from e
    return {"message": "Left organization"}
