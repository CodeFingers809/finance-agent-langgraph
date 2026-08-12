import logging
import uuid
from datetime import UTC, datetime, timedelta
import redis
from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.config import settings
from app.models import User

logger = logging.getLogger(__name__)

# Deprecated: UserQuota SQLModel table is preserved in database schema for backward compatibility,
# but active daily quota rate-limiting is now Redis-backed (`quota:{user_id}:{utc_date}:{tier}`).

_sync_redis_client: redis.Redis | None = None


def get_sync_redis() -> redis.Redis:
    """Return singleton synchronous Redis client for rate limiting."""
    global _sync_redis_client
    if _sync_redis_client is None:
        _sync_redis_client = redis.Redis.from_url(
            settings.REDIS_URL, decode_responses=True, socket_connect_timeout=2
        )
    return _sync_redis_client


def get_seconds_to_utc_midnight() -> int:
    """Calculate remaining seconds until UTC midnight for Redis key EXPIRE."""
    now = datetime.now(UTC)
    midnight = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(1, int((midnight - now).total_seconds()))


def check_and_update_quota(
    session: Session,
    user_id: uuid.UUID | str,
    model_name: str,
    is_admin: bool = False,
) -> dict:
    """
    Enforces daily quota using Redis keys `quota:{user_id}:{utc_date}:{tier}`.
    Standard: 10/day, Upgraded: 3/day. Admin bypass allowed.
    Raises HTTPException(429) if daily limit exceeded.
    """
    if is_admin:
        return {"status": "admin_bypass"}

    if isinstance(user_id, uuid.UUID) and session is not None:
        user = session.get(User, user_id)
        if user and user.is_superuser:
            return {"status": "admin_bypass"}

    today_str = datetime.now(UTC).strftime("%Y-%m-%d")
    is_upgraded = "flash" in model_name.lower() and "lite" not in model_name.lower()
    tier = "upgraded" if is_upgraded else "standard"
    limit = 3 if is_upgraded else 10

    key = f"quota:{str(user_id)}:{today_str}:{tier}"
    try:
        r = get_sync_redis()
        count = r.incr(key)
        if count == 1:
            ttl = get_seconds_to_utc_midnight()
            r.expire(key, ttl, nx=True)

        if count > limit:
            r.decr(key)
            if is_upgraded:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Daily limit reached for upgraded Gemini 3.6 Flash model (3 requests/day).",
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Daily quota reached for standard Gemini 3.5 Flash-Lite model (10 requests/day).",
                )

        return {"status": "allowed", "count": count, "limit": limit}
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("Redis quota check failed, executing fallback: %s", e)
        return {"status": "allowed", "count": 0, "limit": limit}


def check_research_mode_quota(
    session: Session,
    user_id: uuid.UUID | str,
    is_admin: bool = False,
) -> None:
    """
    Enforces strict 1 research report per user per day using Redis.
    Raises HTTPException(429) if daily limit exceeded.
    """
    if is_admin:
        return

    if isinstance(user_id, uuid.UUID) and session is not None:
        user = session.get(User, user_id)
        if user and user.is_superuser:
            return

    today_str = datetime.now(UTC).strftime("%Y-%m-%d")
    key = f"quota:{str(user_id)}:{today_str}:research"
    try:
        r = get_sync_redis()
        count = r.incr(key)
        if count == 1:
            ttl = get_seconds_to_utc_midnight()
            r.expire(key, ttl, nx=True)

        if count > 1:
            r.decr(key)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Research mode limited to 1 report per day (resets at UTC midnight).",
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("Redis research quota check failed, executing fallback: %s", e)


def get_user_quota_status(
    session: Session,
    user_id: uuid.UUID | str,
    is_admin: bool = False,
) -> dict[str, int | bool]:
    """Return user's remaining quota status from Redis."""
    if is_admin:
        return {
            "standard_count": 0,
            "standard_remaining_today": 999,
            "standard_limit_today": 999,
            "upgraded_count": 0,
            "upgraded_remaining_today": 999,
            "upgraded_limit_today": 999,
            "research_count": 0,
            "research_remaining_today": 999,
            "research_limit_today": 999,
            "seconds_until_next_allowed": 0,
            "is_limited": False,
        }

    if isinstance(user_id, uuid.UUID) and session is not None:
        user = session.get(User, user_id)
        if user and user.is_superuser:
            return {
                "standard_count": 0,
                "standard_remaining_today": 999,
                "standard_limit_today": 999,
                "upgraded_count": 0,
                "upgraded_remaining_today": 999,
                "upgraded_limit_today": 999,
                "research_count": 0,
                "research_remaining_today": 999,
                "research_limit_today": 999,
                "seconds_until_next_allowed": 0,
                "is_limited": False,
            }

    today_str = datetime.now(UTC).strftime("%Y-%m-%d")
    standard_count = 0
    upgraded_count = 0
    research_count = 0

    try:
        r = get_sync_redis()
        std_val = r.get(f"quota:{str(user_id)}:{today_str}:standard")
        upg_val = r.get(f"quota:{str(user_id)}:{today_str}:upgraded")
        res_val = r.get(f"quota:{str(user_id)}:{today_str}:research")

        standard_count = int(std_val) if std_val else 0
        upgraded_count = int(upg_val) if upg_val else 0
        research_count = int(res_val) if res_val else 0
    except Exception as e:
        logger.warning("Redis quota lookup failed, returning default status: %s", e)

    return {
        "standard_count": standard_count,
        "standard_remaining_today": max(0, 10 - standard_count),
        "standard_limit_today": 10,
        "upgraded_count": upgraded_count,
        "upgraded_remaining_today": max(0, 3 - upgraded_count),
        "upgraded_limit_today": 3,
        "research_count": research_count,
        "research_remaining_today": max(0, 1 - research_count),
        "research_limit_today": 1,
        "seconds_until_next_allowed": get_seconds_to_utc_midnight(),
        "is_limited": standard_count >= 10,
    }

