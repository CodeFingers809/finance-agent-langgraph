import uuid
from datetime import datetime

from sqlalchemy import DateTime
from sqlmodel import Field, Relationship, SQLModel

from app.models.base import get_datetime_utc
from app.models.user import User


# Research Report Models
class ResearchReport(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # Tenant boundary: queries scope on org_id. user_id is retained as
    # "created by" for audit, and is no longer an isolation boundary.
    org_id: str | None = Field(
        default=None, foreign_key="organization.id", ondelete="CASCADE", index=True
    )
    user_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE", index=True
    )
    symbol: str = Field(max_length=50)
    query: str = Field(max_length=1000)
    markdown_report: str = Field(max_length=50000)
    analyst_reports_json: str | None = Field(default=None)
    # Provenance for the chat "Save" button: which message this was saved from.
    # Nullable because a report may be created outside a conversation.
    conversation_id: uuid.UUID | None = Field(
        default=None, foreign_key="conversation.id", ondelete="SET NULL", index=True
    )
    message_id: uuid.UUID | None = Field(
        default=None, foreign_key="chatmessage.id", ondelete="SET NULL"
    )
    title: str | None = Field(default=None, max_length=500)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    # No default: the caller records which model actually produced the report.
    created_by_model: str = Field(max_length=100)
    user: User | None = Relationship(back_populates="research_reports")


class ResearchReportCreate(SQLModel):
    """Payload for the chat 'Save as research report' action."""

    markdown_report: str = Field(min_length=1, max_length=50000)
    symbol: str = Field(default="", max_length=50)
    query: str = Field(default="", max_length=1000)
    title: str | None = Field(default=None, max_length=500)
    # The model that actually produced the text, supplied by the client. Empty
    # when unknown -- never substitute a placeholder name.
    created_by_model: str = Field(default="", max_length=100)
    conversation_id: uuid.UUID | None = None
    message_id: uuid.UUID | None = None


class ResearchReportPublic(SQLModel):
    id: uuid.UUID
    user_id: uuid.UUID
    org_id: str | None
    symbol: str
    query: str
    markdown_report: str
    title: str | None
    conversation_id: uuid.UUID | None
    message_id: uuid.UUID | None
    created_at: datetime | None
    created_by_model: str


class ResearchReportListItem(SQLModel):
    """List view -- omits markdown_report so listing many reports stays cheap."""

    id: uuid.UUID
    user_id: uuid.UUID
    symbol: str
    query: str
    title: str | None
    created_at: datetime | None
    created_by_model: str
