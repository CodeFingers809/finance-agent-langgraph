import uuid
from datetime import UTC, datetime
from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.models import UserQuota, User


def check_and_update_quota(session: Session, user_id: uuid.UUID, model_name: str) -> UserQuota:
    user = session.get(User, user_id)
    if user and user.is_superuser:
        quota = session.exec(select(UserQuota).where(UserQuota.user_id == user_id)).first()
        if not quota:
            quota = UserQuota(
                user_id=user_id,
                last_request_at=None,
                daily_standard_count=0,
                daily_upgraded_count=0,
                last_reset_date=datetime.now(UTC).strftime("%Y-%m-%d"),
            )
            session.add(quota)
            session.commit()
            session.refresh(quota)
        return quota

    today_str = datetime.now(UTC).strftime("%Y-%m-%d")
    now = datetime.now(UTC)

    quota = session.exec(select(UserQuota).where(UserQuota.user_id == user_id)).first()

    if not quota:
        quota = UserQuota(
            user_id=user_id,
            last_request_at=None,
            daily_standard_count=0,
            daily_upgraded_count=0,
            last_reset_date=today_str,
        )
        session.add(quota)
        session.commit()
        session.refresh(quota)

    # Check daily reset
    if quota.last_reset_date != today_str:
        quota.daily_standard_count = 0
        quota.daily_upgraded_count = 0
        quota.last_reset_date = today_str

    is_upgraded = "flash" in model_name.lower() and "lite" not in model_name.lower()

    if is_upgraded:
        if quota.daily_upgraded_count >= 3:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Daily limit reached for upgraded Gemini Flash model (3 requests/day).",
            )
        quota.daily_upgraded_count += 1
    else:
        if quota.daily_standard_count >= 10:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Daily quota reached for standard Gemini Flash Lite model (10 requests/day).",
            )
        quota.daily_standard_count += 1

    quota.last_request_at = now
    session.add(quota)
    session.commit()
    session.refresh(quota)
    return quota


def get_user_quota_status(session: Session, user_id: uuid.UUID) -> dict[str, int]:
    user = session.get(User, user_id)
    if user and user.is_superuser:
        return {
            "standard_count": 0,
            "standard_remaining_today": 999,
            "standard_limit_today": 999,
            "upgraded_count": 0,
            "upgraded_remaining_today": 999,
            "upgraded_limit_today": 999,
            "is_limited": False,
        }

    today_str = datetime.now(UTC).strftime("%Y-%m-%d")

    quota = session.exec(select(UserQuota).where(UserQuota.user_id == user_id)).first()
    if not quota:
        return {
            "standard_count": 0,
            "standard_remaining_today": 10,
            "standard_limit_today": 10,
            "upgraded_count": 0,
            "upgraded_remaining_today": 3,
            "upgraded_limit_today": 3,
            "is_limited": False,
        }

    standard_count = quota.daily_standard_count if quota.last_reset_date == today_str else 0
    upgraded_count = quota.daily_upgraded_count if quota.last_reset_date == today_str else 0

    return {
        "standard_count": standard_count,
        "standard_remaining_today": max(0, 10 - standard_count),
        "standard_limit_today": 10,
        "upgraded_count": upgraded_count,
        "upgraded_remaining_today": max(0, 3 - upgraded_count),
        "upgraded_limit_today": 3,
        "is_limited": standard_count >= 10,
    }
