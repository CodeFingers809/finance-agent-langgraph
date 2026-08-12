"""Async Redis singleton backing per-user daily rate limiting (see app/core/quota.py).

Redis is reused from the existing install/container -- this module never spins
one up itself, it only connects to settings.REDIS_URL.
"""

import redis.asyncio as redis

from app.core.config import settings

_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    """Return the module-level Redis client, creating it on first call."""
    global _client
    if _client is None:
        _client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _client


async def close_redis() -> None:
    """Close the singleton connection, if one was ever created."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
