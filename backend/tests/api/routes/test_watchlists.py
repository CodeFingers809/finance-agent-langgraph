from fastapi.testclient import TestClient
from app.core.config import settings


def test_create_and_manage_watchlist(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    # 1. Create watchlist
    response = client.post(
        f"{settings.API_V1_STR}/watchlists",
        headers=normal_user_token_headers,
        json={"name": "Test Watchlist"},
    )
    assert response.status_code == 200
    content = response.json()
    assert content["name"] == "Test Watchlist"
    assert "id" in content

    # 2. Add stock item
    wl_id = content["id"]
    item_res = client.post(
        f"{settings.API_V1_STR}/watchlists/{wl_id}/items",
        headers=normal_user_token_headers,
        json={"symbol": "TCS.NS"},
    )
    assert item_res.status_code == 200
    item_data = item_res.json()
    assert item_data["symbol"] == "TCS.NS"

    # 3. List watchlists
    list_res = client.get(
        f"{settings.API_V1_STR}/watchlists",
        headers=normal_user_token_headers,
    )
    assert list_res.status_code == 200
    watchlists = list_res.json()
    assert len(watchlists) >= 1
