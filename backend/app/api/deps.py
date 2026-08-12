from collections.abc import Generator
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlmodel import Session, select

from app.core.clerk import ClerkClaims, verify_session
from app.core.db import engine
from app.models import Organization, User


def get_db() -> Generator[Session]:
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_db)]


@dataclass(frozen=True)
class AuthContext:
    """A verified caller: the local User row plus their active Clerk org/role."""

    user: User
    org_id: str | None
    org_role: str | None

    @property
    def is_org_admin(self) -> bool:
        return self.org_role == "org:admin"


def _sync_user(session: Session, claims: ClerkClaims) -> User:
    """Find the local User for these claims, provisioning if the webhook is late.

    Webhooks are not ordered relative to the user's first request, so a brand-new
    Clerk user can authenticate before `user.created` lands. Provisioning here
    keeps that from 401-ing.
    """
    user = session.exec(
        select(User).where(User.clerk_user_id == claims.user_id)
    ).first()
    if user:
        return user

    # Adopt a pre-Clerk row with the same email if one exists, so existing data
    # (conversations, portfolios) stays attached to the account.
    from app.core.clerk import get_clerk

    email = None
    try:
        with get_clerk() as clerk:
            clerk_user = clerk.users.get(user_id=claims.user_id)
        if clerk_user and clerk_user.email_addresses:
            email = clerk_user.email_addresses[0].email_address
    except Exception:
        # Fall through to the synthetic address below; a failed profile lookup
        # must not block an otherwise-valid session.
        pass

    if email:
        user = session.exec(select(User).where(User.email == email)).first()
        if user:
            user.clerk_user_id = claims.user_id
            session.add(user)
            session.commit()
            session.refresh(user)
            return user

    user = User(
        email=email or f"{claims.user_id}@clerk.local",
        clerk_user_id=claims.user_id,
        is_active=True,
        hashed_password=None,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _ensure_org(session: Session, org_id: str | None) -> None:
    """Mirror the active org locally so org_id foreign keys resolve."""
    if not org_id or session.get(Organization, org_id):
        return
    from app.core.clerk import get_clerk

    name, slug = org_id, None
    try:
        with get_clerk() as clerk:
            org = clerk.organizations.get(organization_id=org_id)
        if org:
            name = org.name or org_id
            slug = org.slug
    except Exception:
        pass
    session.add(Organization(id=org_id, name=name, slug=slug))
    session.commit()


def get_auth(request: Request, session: SessionDep) -> AuthContext:
    claims = verify_session(request)
    if claims is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = _sync_user(session, claims)
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    _ensure_org(session, claims.org_id)
    return AuthContext(user=user, org_id=claims.org_id, org_role=claims.org_role)


CurrentAuth = Annotated[AuthContext, Depends(get_auth)]


def get_current_user(auth: CurrentAuth) -> User:
    """Back-compat shim so existing routes keep working unchanged."""
    return auth.user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_current_active_superuser(auth: CurrentAuth) -> User:
    """Platform-staff gate, distinct from org roles.

    Guards the legacy instance-wide admin endpoints (user CRUD, test email).
    Org-scoped authorization uses require_org_admin instead.
    """
    if not auth.user.is_superuser:
        raise HTTPException(
            status_code=403, detail="The user doesn't have enough privileges"
        )
    return auth.user


def require_org_admin(auth: CurrentAuth) -> AuthContext:
    """Gate mutations. Analysts (org:member) get 403; chat is never gated."""
    if not auth.is_org_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This action requires the organization admin role",
        )
    return auth


OrgAdmin = Annotated[AuthContext, Depends(require_org_admin)]
