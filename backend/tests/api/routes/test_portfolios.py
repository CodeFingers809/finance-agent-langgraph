from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings


def test_single_portfolio_flow(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    # 1. List portfolios (auto-creates Main Portfolio)
    response = client.get(
        f"{settings.API_V1_STR}/portfolios",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 200
    content = response.json()
    assert len(content) == 1
    assert content[0]["name"] == "Main Portfolio"
    port_id = content[0]["id"]

    # 2. Add stock item (with optional date, no avg_price required)
    item_response = client.post(
        f"{settings.API_V1_STR}/portfolios/{port_id}/items",
        headers=normal_user_token_headers,
        json={
            "symbol": "RELIANCE.NS",
            "quantity": 10,
            "buy_price": 2500,
        },
    )
    assert item_response.status_code == 200
    item_content = item_response.json()
    assert item_content["symbol"] == "RELIANCE.NS"
    assert item_content["buy_price"] == 2500

    # 3. Get metrics
    metrics_response = client.get(
        f"{settings.API_V1_STR}/portfolios/{port_id}/metrics",
        headers=normal_user_token_headers,
    )
    assert metrics_response.status_code == 200
    metrics = metrics_response.json()
    assert metrics["total_invested"] == 25000.0
