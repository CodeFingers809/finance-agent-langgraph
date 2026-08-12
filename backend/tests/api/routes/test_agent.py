from fastapi.testclient import TestClient
from app.core.config import settings
from app.api.routes.agent import ResearchRequestPayload


def test_research_request_payload_pydantic_schema():
    payload = ResearchRequestPayload(
        query="Test Indian Defense Stocks",
        model_name="claude-haiku-4-5-20251001",
        conversation_id="18f54180-9c77-46dc-9400-c9ab72871bc5"
    )
    assert payload.query == "Test Indian Defense Stocks"
    assert payload.conversation_id == "18f54180-9c77-46dc-9400-c9ab72871bc5"


def test_research_request_payload_optional_conversation_id():
    payload = ResearchRequestPayload(
        query="Test Indian Defense Stocks"
    )
    assert payload.query == "Test Indian Defense Stocks"
    assert payload.conversation_id is None
