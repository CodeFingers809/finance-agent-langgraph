import uuid
from datetime import datetime

from sqlalchemy import DateTime
from sqlmodel import Field, Relationship, SQLModel

from app.models.base import get_datetime_utc
from app.models.user import User


# Portfolio Models
class Portfolio(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # Tenant boundary: queries scope on org_id. user_id is retained as
    # "created by" for audit, and is no longer an isolation boundary.
    org_id: str | None = Field(
        default=None, foreign_key="organization.id", ondelete="CASCADE", index=True
    )
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
