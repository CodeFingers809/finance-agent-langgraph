from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, delete

from app.api.deps import get_db
from app.core.config import settings
from app.core.db import init_db
from app.main import app
from app.models import Item, User
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import get_superuser_token_headers

# Isolated file-backed SQLite database for tests (completely separate from app.db)
BASE_DIR = Path(__file__).resolve().parent.parent
TEST_DB_PATH = BASE_DIR / "test.db"
TEST_DATABASE_URL = f"sqlite:///{TEST_DB_PATH}"

test_engine = create_engine(
    TEST_DATABASE_URL, connect_args={"check_same_thread": False}
)


@pytest.fixture(scope="session", autouse=True)
def db() -> Generator[Session, None, None]:
    SQLModel.metadata.create_all(test_engine)
    with Session(test_engine) as session:
        init_db(session)
        yield session
        # Clean up test database tables after test suite completes (never touches app.db)
        session.execute(delete(Item))
        session.execute(delete(User))
        session.commit()


@pytest.fixture(scope="module")
def client() -> Generator[TestClient, None, None]:
    def override_get_db():
        with Session(test_engine) as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(scope="module")
def superuser_token_headers(client: TestClient) -> dict[str, str]:
    return get_superuser_token_headers(client)


@pytest.fixture(scope="module")
def normal_user_token_headers(client: TestClient, db: Session) -> dict[str, str]:
    return authentication_token_from_email(
        client=client, email=settings.EMAIL_TEST_USER, db=db
    )
