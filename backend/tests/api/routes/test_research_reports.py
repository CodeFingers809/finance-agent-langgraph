from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models import ResearchReport


def test_create_and_list_research_report(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    payload = {
        "title": "TCS Q3 Financial Report & Valuation",
        "markdown_report": "# TCS Q3 Analysis\nRevenue grew by 8.5% YoY with margins expanding to 24.5%.",
        "symbol": "TCS.NS",
        "created_by_model": "financial-agent-v1",
    }
    response = client.post(
        f"{settings.API_V1_STR}/research-reports",
        headers=superuser_token_headers,
        json=payload,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "TCS Q3 Financial Report & Valuation"
    assert data["symbol"] == "TCS.NS"
    assert "id" in data

    # List reports
    list_resp = client.get(
        f"{settings.API_V1_STR}/research-reports",
        headers=superuser_token_headers,
    )
    assert list_resp.status_code == 200
    reports = list_resp.json()
    assert len(reports) >= 1
    assert reports[0]["title"] == "TCS Q3 Financial Report & Valuation"
