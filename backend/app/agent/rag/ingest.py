"""Ingest org research reports into pgvector.

Scope: an organization's own saved research reports only. External company data
is fetched live by the agent's tools, so storing it here would be redundant.
"""

import logging

from llama_index.core import Document
from llama_index.core.node_parser import SentenceSplitter
from sqlmodel import Session, select

from app.agent.rag.store import get_embed_model, get_vector_store
from app.models import RagDocument, ResearchReport

logger = logging.getLogger(__name__)


async def ingest_org_research_report(
    session: Session, report: ResearchReport
) -> RagDocument:
    """Chunk, embed, and store a report. Returns the tracking row.

    The RagDocument row records the real outcome -- a "failed" status with an
    error message, not a silent success -- so ingestion health is inspectable.
    """
    if not report.org_id:
        raise ValueError("Cannot ingest a report with no org_id")

    # Re-ingesting an edited report should replace, not duplicate.
    rag_doc = session.exec(
        select(RagDocument).where(
            RagDocument.org_id == report.org_id,
            RagDocument.source_ref == str(report.id),
        )
    ).first()
    if rag_doc is None:
        rag_doc = RagDocument(
            org_id=report.org_id,
            source_type="research_report",
            source_ref=str(report.id),
            title=report.title or "Research Report",
            status="pending",
        )
    else:
        rag_doc.status = "pending"
        rag_doc.error_message = None
    session.add(rag_doc)
    session.commit()
    session.refresh(rag_doc)

    try:
        document = Document(
            text=f"# {report.title or 'Research Report'}\n"
            f"Symbol: {report.symbol or 'N/A'}\n\n{report.markdown_report}",
            metadata={
                "report_id": str(report.id),
                "title": report.title or "",
                "symbol": report.symbol or "",
                # org_id is the tenant filter applied at query time.
                "org_id": report.org_id,
                "source_type": "research_report",
            },
        )

        nodes = SentenceSplitter(
            chunk_size=512, chunk_overlap=50
        ).get_nodes_from_documents([document])
        if not nodes:
            raise ValueError("Report produced no chunks to embed")

        embed_model = get_embed_model()
        texts = [n.get_content(metadata_mode="all") for n in nodes]
        embeddings = await embed_model.aget_text_embedding_batch(texts)
        for node, embedding in zip(nodes, embeddings, strict=True):
            node.embedding = embedding

        get_vector_store().add(nodes)

        rag_doc.status = "embedded"
        rag_doc.node_count = len(nodes)
        session.add(rag_doc)
        session.commit()
        session.refresh(rag_doc)
        logger.info(
            "Ingested report %s for org %s (%d chunks)",
            report.id,
            report.org_id,
            len(nodes),
        )
        return rag_doc

    except Exception as exc:
        rag_doc.status = "failed"
        rag_doc.error_message = str(exc)[:500]
        session.add(rag_doc)
        session.commit()
        logger.exception("RAG ingestion failed for report %s", report.id)
        raise
