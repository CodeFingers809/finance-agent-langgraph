from datetime import datetime

from sqlalchemy import DateTime
from sqlmodel import Field, SQLModel

from app.models.base import get_datetime_utc


# Organization Models
#
# This table is a read-only local mirror of a Clerk Organization. Clerk owns the
# lifecycle (create/rename/delete + membership + roles); rows here are written
# only by the Clerk webhook handler so that tenant-scoped tables have a real
# foreign key to point at. The primary key is Clerk's own org id (org_...), so
# there is no second identifier to keep in sync.
class Organization(SQLModel, table=True):
    id: str = Field(primary_key=True, max_length=255)
    name: str = Field(max_length=255)
    slug: str | None = Field(default=None, max_length=255)
    # Clerk auto-creates a personal organization per user on signup; flagged so
    # the UI can distinguish "your own workspace" from a real shared org.
    is_personal: bool = Field(default=False)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class OrganizationPublic(SQLModel):
    id: str
    name: str
    slug: str | None
    is_personal: bool
    created_at: datetime | None
