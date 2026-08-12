import uuid
from datetime import datetime

from sqlalchemy import DateTime
from sqlmodel import Field, Relationship, SQLModel

from app.models.base import get_datetime_utc
from app.models.organization import Organization


# RAG Models
#
# Ingestion bookkeeping only. The embeddings themselves live in the pgvector
# table that LlamaIndex's PGVectorStore creates and owns, so the embedding
# dimension is not pinned here -- this table answers "what has been ingested,
# for which org, and did it succeed", which the vector store cannot.
class RagDocument(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    org_id: str = Field(
        foreign_key="organization.id", nullable=False, ondelete="CASCADE", index=True
    )
    # "research_report" | "webpage" | "filing"
    source_type: str = Field(max_length=50)
    # Report UUID, or the URL for webpages/filings.
    source_ref: str = Field(max_length=2000)
    title: str = Field(max_length=500)
    # "pending" | "embedded" | "failed"
    status: str = Field(default="pending", max_length=20, index=True)
    node_count: int = Field(default=0)
    error_message: str | None = Field(default=None)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    organization: Organization | None = Relationship()


class RagDocumentPublic(SQLModel):
    id: uuid.UUID
    source_type: str
    source_ref: str
    title: str
    status: str
    node_count: int
    error_message: str | None
    created_at: datetime | None


class RagIngestRequest(SQLModel):
    url: str = Field(min_length=1, max_length=2000)
    title: str | None = Field(default=None, max_length=500)
