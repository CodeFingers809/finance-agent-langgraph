import ast
import logging
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.api.deps import CurrentAuth, OrgAdmin, SessionDep
from app.models import (
    ResearchReport,
    ResearchReportCreate,
    ResearchReportListItem,
    ResearchReportPublic,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/research-reports", tags=["research-reports"])


def clean_llm_text(text: str | None) -> str:
    """Unwrap LangChain's list-of-content-blocks repr into plain text.

    Anthropic responses stream as [{'type': 'text', 'text': ...}]; when that
    reaches the client as a string, saving it verbatim stores the repr.
    """
    if not text:
        return ""
    s = text.strip()
    if s.startswith("[{'type':") or s.startswith('[{"type":'):
        try:
            parsed = ast.literal_eval(s)
        except (ValueError, SyntaxError):
            return s
        if isinstance(parsed, list):
            extracted = "".join(
                item.get("text", "") for item in parsed if isinstance(item, dict)
            )
            if extracted:
                return extracted.strip()
    return s


def _require_org(auth: CurrentAuth) -> str:
    if not auth.org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active organization. Select one first.",
        )
    return auth.org_id


@router.get("", response_model=list[ResearchReportListItem])
async def list_research_reports(
    session: SessionDep,
    auth: CurrentAuth,
) -> list[ResearchReportListItem]:
    """Reports saved by the caller's organization. Readable by any member."""
    org_id = _require_org(auth)
    reports = session.exec(
        select(ResearchReport)
        .where(ResearchReport.org_id == org_id)
        .order_by(ResearchReport.created_at.desc())
    ).all()
    return [ResearchReportListItem.model_validate(r) for r in reports]


@router.post("", response_model=ResearchReportPublic, status_code=201)
async def create_research_report(
    report_in: ResearchReportCreate,
    session: SessionDep,
    auth: OrgAdmin,
) -> ResearchReportPublic:
    """Save a chat message as an org research report and index it for RAG."""
    org_id = _require_org(auth)
    markdown = clean_llm_text(report_in.markdown_report)
    if not markdown:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot save an empty report",
        )

    report = ResearchReport(
        user_id=auth.user.id,
        org_id=org_id,
        title=clean_llm_text(report_in.title) or "Research Report",
        markdown_report=markdown,
        symbol=report_in.symbol,
        query=report_in.query,
        created_by_model=report_in.created_by_model,
        conversation_id=report_in.conversation_id,
        message_id=report_in.message_id,
    )
    session.add(report)
    session.commit()
    session.refresh(report)

    # RAG indexing must not fail the save, but a silent failure is why "is RAG
    # working?" was unanswerable -- record the outcome on the RagDocument row.
    try:
        from app.agent.rag.ingest import ingest_org_research_report

        await ingest_org_research_report(session, report)
    except Exception:
        logger.exception("RAG ingestion failed for report %s", report.id)

    return ResearchReportPublic.model_validate(report)


@router.get("/{report_id}", response_model=ResearchReportPublic)
async def get_research_report(
    report_id: uuid.UUID,
    session: SessionDep,
    auth: CurrentAuth,
) -> ResearchReportPublic:
    org_id = _require_org(auth)
    report = session.get(ResearchReport, report_id)
    if not report or report.org_id != org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Research report not found"
        )
    return ResearchReportPublic.model_validate(report)


@router.delete("/{report_id}", status_code=200)
async def delete_research_report(
    report_id: uuid.UUID,
    session: SessionDep,
    auth: OrgAdmin,
) -> dict[str, Any]:
    org_id = _require_org(auth)
    report = session.get(ResearchReport, report_id)
    if not report or report.org_id != org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Research report not found"
        )
    session.delete(report)
    session.commit()
    return {"status": "success", "message": "Research report deleted successfully"}
