import uuid
from datetime import datetime

from sqlalchemy import DateTime
from sqlmodel import Field, Relationship, SQLModel

from app.models.base import get_datetime_utc
from app.models.user import User


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
