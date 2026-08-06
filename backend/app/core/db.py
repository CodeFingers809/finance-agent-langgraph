from sqlmodel import Session, create_engine, select

from app import crud
from app.core.config import settings
from app.core.security import get_password_hash
from app.models import User, UserCreate

connect_args = {"check_same_thread": False} if str(settings.SQLALCHEMY_DATABASE_URI).startswith("sqlite") else {}
engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI), connect_args=connect_args)


def init_db(session: Session) -> None:
    from sqlmodel import SQLModel

    # Auto-create tables for local embedded DB (SQLite)
    SQLModel.metadata.create_all(engine)

    try:
        user = session.exec(
            select(User).where(User.email == settings.FIRST_SUPERUSER)
        ).first()
        if not user:
            user_in = UserCreate(
                email=settings.FIRST_SUPERUSER,
                password=settings.FIRST_SUPERUSER_PASSWORD,
                is_superuser=True,
            )
            crud.create_user(session=session, user_create=user_in)
        else:
            user.hashed_password = get_password_hash(settings.FIRST_SUPERUSER_PASSWORD)
            user.is_superuser = True
            session.add(user)
            session.commit()
    except Exception as e:
        session.rollback()

