"""Add the application tables that were never migrated.

The inherited template chain only ever created ``user`` and ``item``. Every
app-specific table (conversations, chat, portfolios, watchlists, quota) was
created implicitly by ``SQLModel.metadata.create_all()`` in ``init_db`` and in
the test fixtures, so ``alembic upgrade head`` could never build a database from
scratch -- ``001_add_research_mode`` then failed altering a ``userquota`` table
that nothing had created.

This revision backfills those seven tables so the chain is runnable end to end.
``userquota.last_research_request_date`` is intentionally omitted here because
``001_add_research_mode`` adds that column immediately afterwards.

Revision ID: 000_add_app_tables
Revises: fe56fa70289e
"""
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

revision = "000_add_app_tables"
down_revision = "fe56fa70289e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "conversation",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "chatmessage",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("sender", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column("content", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("metadata_json", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversation.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "portfolio",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "portfolioitem",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("portfolio_id", sa.Uuid(), nullable=False),
        sa.Column("symbol", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("buy_price", sa.Float(), nullable=False),
        sa.Column("avg_price", sa.Float(), nullable=False),
        sa.Column("bought_at", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["portfolio_id"], ["portfolio.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "watchlist",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "watchlistitem",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("watchlist_id", sa.Uuid(), nullable=False),
        sa.Column("symbol", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["watchlist_id"], ["watchlist.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # last_research_request_date is added by 001_add_research_mode.
    op.create_table(
        "userquota",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("last_request_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("daily_standard_count", sa.Integer(), nullable=False),
        sa.Column("daily_upgraded_count", sa.Integer(), nullable=False),
        sa.Column("last_reset_date", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )


def downgrade() -> None:
    op.drop_table("userquota")
    op.drop_table("watchlistitem")
    op.drop_table("watchlist")
    op.drop_table("portfolioitem")
    op.drop_table("portfolio")
    op.drop_table("chatmessage")
    op.drop_table("conversation")
