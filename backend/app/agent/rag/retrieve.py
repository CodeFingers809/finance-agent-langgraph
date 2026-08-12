"""Semantic search over an organization's saved research reports."""

import json
import logging
from contextvars import ContextVar

from langchain_core.tools import tool
from llama_index.core.vector_stores import (
    FilterOperator,
    MetadataFilter,
    MetadataFilters,
)

from app.agent.rag.store import get_index

logger = logging.getLogger(__name__)

# The agent invokes tools without arguments beyond the query string, so the
# active org travels out-of-band. Set per request in the agent route.
current_org_id: ContextVar[str | None] = ContextVar("current_org_id", default=None)

TOP_K = 5


@tool
def search_org_research_reports(query: str) -> str:
    """Search your organization's previously saved research reports.

    Use this for questions about past analyses, prior conclusions on a stock, or
    what the team has already researched. Returns matching excerpts with titles
    and symbols. Only searches reports saved by your own organization.
    """
    org_id = current_org_id.get()
    if not org_id:
        return json.dumps(
            {
                "results": [],
                "message": "No active organization, so there are no saved reports to search.",
            }
        )

    try:
        retriever = get_index().as_retriever(
            similarity_top_k=TOP_K,
            # Tenant isolation: never return another org's reports.
            filters=MetadataFilters(
                filters=[
                    MetadataFilter(
                        key="org_id", value=org_id, operator=FilterOperator.EQ
                    )
                ]
            ),
        )
        nodes = retriever.retrieve(query)
    except Exception as exc:
        logger.exception("RAG retrieval failed for org %s", org_id)
        return json.dumps(
            {"results": [], "error": f"Report search unavailable: {exc}"}
        )

    if not nodes:
        return json.dumps(
            {
                "results": [],
                "message": "No saved research reports matched this query.",
            }
        )

    return json.dumps(
        {
            "results": [
                {
                    "title": n.metadata.get("title") or "Research Report",
                    "symbol": n.metadata.get("symbol") or "N/A",
                    "report_id": n.metadata.get("report_id"),
                    "relevance": round(n.score, 4) if n.score is not None else None,
                    "excerpt": n.get_content()[:600],
                }
                for n in nodes
            ],
            "total_matched": len(nodes),
            "source": "Organization saved research reports",
        }
    )
