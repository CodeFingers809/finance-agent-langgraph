"""SQLModel table + schema definitions.

Split from the original single-file ``app/models.py`` into one module per domain.
Everything is re-exported here, so ``from app.models import X`` keeps working
unchanged for every existing call site (routes, crud, tests, and
``app/alembic/env.py``, which imports ``SQLModel`` from this package to populate
``SQLModel.metadata`` for autogenerate).

Importing this package must import *every* submodule that defines a table, both
so Alembic sees the full metadata and so SQLModel/SQLAlchemy can resolve the
string-annotated ``Relationship`` targets that cross module boundaries.
"""

import uuid
from datetime import UTC, datetime
from typing import Optional

from pydantic import EmailStr
from sqlalchemy import DateTime
from sqlmodel import Field, Relationship, SQLModel

from app.models.base import (
    Message,
    NewPassword,
    Token,
    TokenPayload,
    get_datetime_utc,
)
from app.models.conversation import (
    ChatMessage,
    ChatMessagePublic,
    Conversation,
    ConversationPublic,
)
from app.models.item import (
    Item,
    ItemBase,
    ItemCreate,
    ItemPublic,
    ItemsPublic,
    ItemUpdate,
)
from app.models.organization import Organization, OrganizationPublic
from app.models.portfolio import (
    Portfolio,
    PortfolioCreate,
    PortfolioItem,
    PortfolioItemCreate,
    PortfolioItemPublic,
    PortfolioMetricsPublic,
    PortfolioPublic,
)
from app.models.quota import QuotaStatusPublic, UserQuota
from app.models.rag import (
    RagDocument,
    RagDocumentPublic,
    RagIngestRequest,
)
from app.models.research_report import (
    ResearchReport,
    ResearchReportCreate,
    ResearchReportListItem,
    ResearchReportPublic,
    ResearchReportUpdate,
)
from app.models.user import (
    UpdatePassword,
    User,
    UserBase,
    UserCreate,
    UserPublic,
    UserRegister,
    UsersPublic,
    UserUpdate,
    UserUpdateMe,
)
from app.models.watchlist import (
    Watchlist,
    WatchlistCreate,
    WatchlistItem,
    WatchlistItemCreate,
    WatchlistItemPublic,
    WatchlistPublic,
)

# Resolve cross-module string annotations (e.g. User.items -> "Item") now that
# every submodule is loaded. Without this, a model whose forward refs point at a
# not-yet-imported module can fail to build on first use.
for _model in (
    User,
    Item,
    UserQuota,
    Conversation,
    ChatMessage,
    Portfolio,
    PortfolioItem,
    Watchlist,
    WatchlistItem,
    ResearchReport,
    Organization,
    RagDocument,
):
    _model.model_rebuild()

__all__ = [
    # base / shared
    "get_datetime_utc",
    "Message",
    "Token",
    "TokenPayload",
    "NewPassword",
    # user
    "UserBase",
    "UserCreate",
    "UserRegister",
    "UserUpdate",
    "UserUpdateMe",
    "UpdatePassword",
    "User",
    "UserPublic",
    "UsersPublic",
    # item
    "ItemBase",
    "ItemCreate",
    "ItemUpdate",
    "Item",
    "ItemPublic",
    "ItemsPublic",
    # quota
    "UserQuota",
    "QuotaStatusPublic",
    # conversation
    "Conversation",
    "ChatMessage",
    "ConversationPublic",
    "ChatMessagePublic",
    # portfolio
    "Portfolio",
    "PortfolioItem",
    "PortfolioCreate",
    "PortfolioItemCreate",
    "PortfolioItemPublic",
    "PortfolioPublic",
    "PortfolioMetricsPublic",
    # watchlist
    "Watchlist",
    "WatchlistItem",
    "WatchlistCreate",
    "WatchlistItemCreate",
    "WatchlistItemPublic",
    "WatchlistPublic",
    # organization (Clerk mirror)
    "Organization",
    "OrganizationPublic",
    # rag
    "RagDocument",
    "RagDocumentPublic",
    "RagIngestRequest",
    # research report
    "ResearchReport",
    "ResearchReportCreate",
    "ResearchReportListItem",
    "ResearchReportPublic",
    "ResearchReportUpdate",
    # re-exported third-party names, kept for backwards compatibility with
    # call sites that imported them from app.models (notably alembic/env.py).
    "SQLModel",
    "Field",
    "Relationship",
    "DateTime",
    "EmailStr",
    "Optional",
    "UTC",
    "datetime",
    "uuid",
]
