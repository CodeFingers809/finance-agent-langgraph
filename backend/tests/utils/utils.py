import random
import string

from fastapi.testclient import TestClient

from app.core.config import settings


def random_lower_string() -> str:
    return "".join(random.choices(string.ascii_lowercase, k=32))


def random_email() -> str:
    return f"{random_lower_string()}@{random_lower_string()}.com"


def get_superuser_token_headers(client: TestClient) -> dict[str, str]:
    # Clerk owns real auth; the test get_auth override resolves this header to a
    # local user by email (see tests/conftest.py).
    return {"Authorization": f"Bearer {settings.FIRST_SUPERUSER}"}
