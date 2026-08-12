from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi import Depends, HTTPException, Request
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, delete, select

from app.api.deps import AuthContext, get_auth, get_db
from app.core.config import settings
from app.core.db import init_db
from app.main import app
from app.models import Item, Organization, User
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

    def override_get_auth(request: Request, session: Session = Depends(get_db)):
        """Resolve the test's Authorization header to a local user.

        Production auth verifies a Clerk session token; tests can't mint those,
        so the header carries the target user's email instead (see
        tests/utils/user.py) and the org role is derived from is_superuser.
        """
        email = (request.headers.get("authorization") or "").removeprefix("Bearer ")
        user = session.exec(select(User).where(User.email == email)).first()
        if user is None:
            if not email or "@" not in email:
                raise HTTPException(status_code=401, detail="Not authenticated")
            # Some tests delete the account their module-scoped token fixture
            # points at (e.g. test_delete_user_me); re-provision so later tests
            # in the module aren't collateral damage.
            user = User(email=email, is_active=True, hashed_password=None)
            session.add(user)
            session.commit()
            session.refresh(user)
        org_id = f"org_test_{'admin' if user.is_superuser else 'member'}"
        if session.get(Organization, org_id) is None:
            session.add(Organization(id=org_id, name="Test Org"))
            session.commit()
        return AuthContext(
            user=user,
            org_id=org_id,
            # Superusers act as org admins so existing admin-path tests still
            # exercise the mutating endpoints.
            org_role="org:admin" if user.is_superuser else "org:member",
        )

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_auth] = override_get_auth
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
