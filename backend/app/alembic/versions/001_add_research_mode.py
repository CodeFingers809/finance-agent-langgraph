"""Add research mode: UserQuota.last_research_request_date and ResearchReport table."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text

revision = "001_add_research_mode"
down_revision = "000_add_app_tables"
branch_labels = None
depends_on = None

def upgrade() -> None:
    with op.batch_alter_table("userquota", schema=None) as batch_op:
        batch_op.add_column(sa.Column("last_research_request_date", sa.String(), nullable=True))

    op.create_table(
        "researchreport",
        # sa.Uuid(), not sa.String(): user.id is a UUID as of d98dd8ec85a3, and
        # Postgres rejects a varchar -> uuid foreign key outright. The original
        # String() typing only ever worked because SQLite ignores FK types.
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("symbol", sa.String(length=50), nullable=False),
        sa.Column("query", sa.String(length=1000), nullable=False),
        sa.Column("markdown_report", sa.String(length=50000), nullable=False),
        sa.Column("analyst_reports_json", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_model", sa.String(length=100), nullable=False, server_default="gpt-5.6-luna"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id")
    )
    op.create_index(op.f("ix_researchreport_user_id"), "researchreport", ["user_id"], unique=False)

def downgrade() -> None:
    op.drop_index(op.f("ix_researchreport_user_id"), table_name="researchreport")
    op.drop_table("researchreport")

    with op.batch_alter_table("userquota", schema=None) as batch_op:
        batch_op.drop_column("last_research_request_date")
