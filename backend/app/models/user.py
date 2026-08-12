import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from pydantic import EmailStr
from sqlalchemy import DateTime
from sqlmodel import Field, Relationship, SQLModel

from app.models.base import get_datetime_utc

# Relationship targets are annotated as strings and resolved by SQLModel at
# runtime (see the model_rebuild() loop in app/models/__init__.py). A real
# import here would be circular -- Item/Conversation/Portfolio/Watchlist/
# UserQuota/ResearchReport each import User -- so they are TYPE_CHECKING-only.
if TYPE_CHECKING:
    from app.models.conversation import Conversation
    from app.models.item import Item
    from app.models.portfolio import Portfolio
    from app.models.quota import UserQuota
    from app.models.research_report import ResearchReport
    from app.models.watchlist import Watchlist


# Shared properties
class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on creation
class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on update, all are optional
class UserUpdate(SQLModel):
    email: EmailStr | None = Field(default=None, max_length=255)
    is_active: bool | None = None
    is_superuser: bool | None = None
    full_name: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, min_length=8, max_length=128)


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


# Database model, database table inferred from class name
class User(UserBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # Clerk's user id (user_...). The link between a Clerk session and this row;
    # nullable only so pre-Clerk rows survive the migration.
    clerk_user_id: str | None = Field(
        default=None, max_length=255, unique=True, index=True
    )
    # Nullable: Clerk-provisioned users authenticate through Clerk and never
    # have a local password hash.
    hashed_password: str | None = Field(default=None)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    items: list["Item"] = Relationship(back_populates="owner", cascade_delete=True)
    conversations: list["Conversation"] = Relationship(back_populates="user", cascade_delete=True)
    portfolios: list["Portfolio"] = Relationship(back_populates="user", cascade_delete=True)
    watchlists: list["Watchlist"] = Relationship(back_populates="user", cascade_delete=True)
    # NOTE: Optional[...] (not "UserQuota | None") -- SQLAlchemy evaluates this
    # annotation string when configuring mappers and cannot resolve the PEP 604
    # union form here. ruff's UP045 is suppressed for this package accordingly.
    quota: Optional["UserQuota"] = Relationship(back_populates="user", cascade_delete=True)
    research_reports: list["ResearchReport"] = Relationship(back_populates="user", cascade_delete=True)


# Properties to return via API, id is always required
class UserPublic(UserBase):
    id: uuid.UUID
    created_at: datetime | None = None


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int
