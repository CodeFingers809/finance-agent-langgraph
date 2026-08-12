import uuid
from datetime import datetime

from sqlalchemy import DateTime
from sqlmodel import Field, Relationship, SQLModel

from app.models.base import get_datetime_utc
from app.models.user import User


# Watchlist Models
class Watchlist(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # Tenant boundary: queries scope on org_id. user_id is retained as
    # "created by" for audit, and is no longer an isolation boundary.
    org_id: str | None = Field(
        default=None, foreign_key="organization.id", ondelete="CASCADE", index=True
    )
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, ondelete="CASCADE")
    name: str = Field(max_length=255)
    created_at: datetime | None = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))
    user: User | None = Relationship(back_populates="watchlists")
    items: list["WatchlistItem"] = Relationship(back_populates="watchlist", cascade_delete=True)


class WatchlistItem(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    watchlist_id: uuid.UUID = Field(foreign_key="watchlist.id", nullable=False, ondelete="CASCADE")
    symbol: str = Field(max_length=50)
    added_at: datetime | None = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))
    watchlist: Watchlist | None = Relationship(back_populates="items")


class WatchlistCreate(SQLModel):
    name: str = Field(min_length=1, max_length=255)


class WatchlistItemCreate(SQLModel):
    symbol: str = Field(min_length=1, max_length=50)


class WatchlistItemPublic(SQLModel):
    id: uuid.UUID
    watchlist_id: uuid.UUID
    symbol: str
    added_at: datetime | None


class WatchlistPublic(SQLModel):
    id: uuid.UUID
    name: str
    created_at: datetime | None
    items: list[WatchlistItemPublic] = []
