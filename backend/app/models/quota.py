import uuid
from datetime import datetime

from sqlalchemy import DateTime
from sqlmodel import Field, Relationship, SQLModel

from app.models.user import User


# Quota Model
#
# NOTE (deprecated): rate limiting now lives in Redis (see app/core/quota.py).
# This table is retained so existing rows/migrations stay intact; it is no longer
# the source of truth for quota decisions and can be dropped in a later cleanup.
class UserQuota(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, unique=True, ondelete="CASCADE")
    last_request_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    daily_standard_count: int = Field(default=0)
    daily_upgraded_count: int = Field(default=0)
    last_reset_date: str = Field(default="")
    last_research_request_date: str | None = Field(default=None)
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
