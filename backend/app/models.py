import uuid
from datetime import UTC, datetime

from pydantic import EmailStr
from sqlalchemy import DateTime
from sqlmodel import Field, Relationship, SQLModel


def get_datetime_utc() -> datetime:
    return datetime.now(UTC)


from typing import Optional

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
    hashed_password: str
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    items: list[Item] = Relationship(back_populates="owner", cascade_delete=True)
    conversations: list["Conversation"] = Relationship(back_populates="user", cascade_delete=True)
    portfolios: list["Portfolio"] = Relationship(back_populates="user", cascade_delete=True)
    watchlists: list["Watchlist"] = Relationship(back_populates="user", cascade_delete=True)
    quota: Optional["UserQuota"] = Relationship(back_populates="user", cascade_delete=True)


# Properties to return via API, id is always required
class UserPublic(UserBase):
    id: uuid.UUID
    created_at: datetime | None = None


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


# Shared properties
class ItemBase(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)


# Properties to receive on item creation
class ItemCreate(ItemBase):
    pass


# Properties to receive on item update
class ItemUpdate(SQLModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)


# Database model, database table inferred from class name
class Item(ItemBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    owner: User | None = Relationship(back_populates="items")


# Properties to return via API, id is always required
class ItemPublic(ItemBase):
    id: uuid.UUID
    owner_id: uuid.UUID
    created_at: datetime | None = None


class ItemsPublic(SQLModel):
    data: list[ItemPublic]
    count: int


# Generic message
class Message(SQLModel):
    message: str


# JSON payload containing access token
class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


# Contents of JWT token
class TokenPayload(SQLModel):
    sub: str | None = None


class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


# Quota Model
class UserQuota(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, unique=True, ondelete="CASCADE")
    last_request_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    daily_standard_count: int = Field(default=0)
    daily_upgraded_count: int = Field(default=0)
    last_reset_date: str = Field(default="")
    user: User | None = Relationship(back_populates="quota")


class QuotaStatusPublic(SQLModel):
    standard_count: int = 0
    standard_remaining_today: int
    standard_limit_today: int = 10
    upgraded_count: int = 0
    upgraded_remaining_today: int
    upgraded_limit_today: int = 3
    seconds_until_next_allowed: int = 0
    is_limited: bool = False



# Conversation Models
class Conversation(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, ondelete="CASCADE")
    title: str = Field(default="New Conversation", max_length=255)
    created_at: datetime | None = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))
    updated_at: datetime | None = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))
    user: User | None = Relationship(back_populates="conversations")
    messages: list["ChatMessage"] = Relationship(back_populates="conversation", cascade_delete=True)


class ChatMessage(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    conversation_id: uuid.UUID = Field(foreign_key="conversation.id", nullable=False, ondelete="CASCADE")
    sender: str = Field(max_length=50) # "user" or "agent"
    content: str
    metadata_json: str | None = Field(default=None) # JSONB / text storing tool calls or HRP matrix
    created_at: datetime | None = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))
    conversation: Conversation | None = Relationship(back_populates="messages")


class ConversationPublic(SQLModel):
    id: uuid.UUID
    title: str
    created_at: datetime | None
    updated_at: datetime | None


class ChatMessagePublic(SQLModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    sender: str
    content: str
    metadata_json: str | None
    created_at: datetime | None


# Portfolio Models
class Portfolio(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, ondelete="CASCADE")
    name: str = Field(max_length=255)
    created_at: datetime | None = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))
    user: User | None = Relationship(back_populates="portfolios")
    items: list["PortfolioItem"] = Relationship(back_populates="portfolio", cascade_delete=True)


class PortfolioItem(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    portfolio_id: uuid.UUID = Field(foreign_key="portfolio.id", nullable=False, ondelete="CASCADE")
    symbol: str = Field(max_length=50) # e.g. RELIANCE.NS
    quantity: float = Field(gt=0)
    buy_price: float = Field(gt=0)
    avg_price: float = Field(gt=0)
    bought_at: str | None = Field(default=None, max_length=50)
    created_at: datetime | None = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))
    portfolio: Portfolio | None = Relationship(back_populates="items")


class PortfolioCreate(SQLModel):
    name: str = Field(min_length=1, max_length=255)


class PortfolioItemCreate(SQLModel):
    symbol: str = Field(min_length=1, max_length=50)
    quantity: float = Field(gt=0)
    buy_price: float = Field(gt=0)
    avg_price: float | None = None
    bought_at: str | None = Field(default=None, max_length=50)



class PortfolioItemPublic(SQLModel):
    id: uuid.UUID
    portfolio_id: uuid.UUID
    symbol: str
    quantity: float
    buy_price: float
    avg_price: float
    bought_at: str | None
    created_at: datetime | None


class PortfolioPublic(SQLModel):
    id: uuid.UUID
    name: str
    created_at: datetime | None
    items: list[PortfolioItemPublic] = []


class PortfolioMetricsPublic(SQLModel):
    total_invested: float
    current_value: float
    total_return: float
    total_return_pct: float
    cagr: float | None
    sharpe_ratio: float | None
    sortino_ratio: float | None
    beta: float | None
    alpha: float | None


# Watchlist Models
class Watchlist(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
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
