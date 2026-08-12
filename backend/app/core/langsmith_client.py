"""
LangSmith observability client with free-tier optimization.

Free tier limits:
- ~100 traces/month
- No large payloads
- Sampling: only trace research mode & portfolio ops, skip routine chat

Integration points:
1. Set env vars on startup (if config present)
2. Call enable_langsmith_tracing() in main.py
3. LLM calls auto-traced if env vars set (LangChain built-in)
4. get_langsmith_stats() called by admin endpoint (cached 5min)
"""

import hashlib
import logging
import os
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)


def enable_langsmith_tracing() -> None:
    """
    Enable LangSmith tracing by setting environment variables.

    Called once at app startup. If credentials missing, silently no-op.
    LangChain auto-traces all LLM + tool calls when env vars are set.
    """
    if not (settings.LANGSMITH_API_KEY and settings.LANGSMITH_PROJECT):
        logger.info("LangSmith credentials not configured. Observability disabled.")
        return

    try:
        # Set LangChain tracing env vars
        os.environ["LANGCHAIN_TRACING_V2"] = "true"
        os.environ["LANGCHAIN_ENDPOINT"] = settings.LANGSMITH_ENDPOINT
        os.environ["LANGCHAIN_API_KEY"] = settings.LANGSMITH_API_KEY
        os.environ["LANGCHAIN_PROJECT"] = settings.LANGSMITH_PROJECT

        logger.info(
            f"LangSmith tracing enabled. Project: {settings.LANGSMITH_PROJECT}, "
            f"Endpoint: {settings.LANGSMITH_ENDPOINT}"
        )
    except Exception as e:
        logger.warning(f"Failed to enable LangSmith tracing: {e}")


# ==============================================================================
# FREE TIER OPTIMIZATION: Fetch & Cache Stats
# ==============================================================================

class LangSmithStatsCache:
    """Simple in-memory cache for LangSmith stats (5 min TTL)."""

    def __init__(self):
        self.cached_stats: dict[str, Any] | None = None
        self.cached_at: datetime | None = None
        self.cache_ttl_seconds = 300  # 5 minutes

    def is_expired(self) -> bool:
        """Check if cache is stale."""
        if self.cached_at is None:
            return True
        return datetime.utcnow() - self.cached_at > timedelta(seconds=self.cache_ttl_seconds)

    def get(self) -> dict[str, Any] | None:
        """Return cached stats if fresh, else None."""
        if self.is_expired():
            return None
        return self.cached_stats

    def set(self, stats: dict[str, Any]) -> None:
        """Cache stats with current timestamp."""
        self.cached_stats = stats
        self.cached_at = datetime.utcnow()


_stats_cache = LangSmithStatsCache()


async def get_langsmith_stats() -> dict[str, Any]:
    """
    Fetch LangSmith project stats (aggregated, no per-run details).

    Cached 5 minutes to avoid hammering free-tier quota.
    Returns safe default if LangSmith disabled or API fails.

    Returns:
        {
            "total_runs": int,
            "avg_latency_ms": float,
            "total_tokens_input": int,
            "total_tokens_output": int,
            "error_rate": float (0-100),
            "top_tools": [{"name": str, "count": int}, ...] (max 10),
            "top_models": [{"name": str, "count": int}, ...] (max 5),
            "error_message": str | None,
        }
    """
    # Check cache first
    cached = _stats_cache.get()
    if cached:
        logger.debug("LangSmith stats from cache")
        return cached

    # No LangSmith configured
    if not (settings.LANGSMITH_API_KEY and settings.LANGSMITH_PROJECT):
        default_stats = {
            "total_runs": 0,
            "avg_latency_ms": 0.0,
            "total_tokens_input": 0,
            "total_tokens_output": 0,
            "error_rate": 0.0,
            "top_tools": [],
            "top_models": [],
            "error_message": "LangSmith not configured (set LANGSMITH_API_KEY, LANGSMITH_PROJECT in .env)",
        }
        return default_stats

    try:
        from langsmith import Client

        # Initialize client with endpoint (AWS endpoint for free tier)
        client = Client(
            api_key=settings.LANGSMITH_API_KEY,
            api_url=settings.LANGSMITH_ENDPOINT,  # LangSmith Client uses api_url not endpoint
        )

        # Filter to recent 7 days to minimize data transfer safely with UTC aware datetimes
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=7)
        runs = list(
            client.list_runs(
                project_name=settings.LANGSMITH_PROJECT,
                execution_order=1,  # Start from earliest
                limit=100,  # Max 100 to avoid quota hammering
            )
        )

        def _to_utc(dt: datetime) -> datetime:
            if dt.tzinfo is None:
                return dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)

        # Filter to last 7 days safely
        recent_runs = [
            r
            for r in runs
            if r.start_time and _to_utc(r.start_time) > cutoff_date
        ]


        if not recent_runs:
            default_stats = {
                "total_runs": 0,
                "avg_latency_ms": 0.0,
                "total_tokens_input": 0,
                "total_tokens_output": 0,
                "error_rate": 0.0,
                "top_tools": [],
                "top_models": [],
                "error_message": None,
            }
            _stats_cache.set(default_stats)
            return default_stats

        # Aggregate stats
        total_runs = len(recent_runs)
        total_latency_ms = 0.0
        total_tokens_input = 0
        total_tokens_output = 0
        error_count = 0
        tool_counts: dict[str, int] = {}
        model_counts: dict[str, int] = {}

        for run in recent_runs:
            # Latency
            if run.start_time and run.end_time:
                latency_ms = (run.end_time - run.start_time).total_seconds() * 1000
                total_latency_ms += latency_ms

            # Error tracking
            if run.error:
                error_count += 1

            # Token usage extraction across all possible LangSmith trace locations
            in_tokens = getattr(run, "prompt_tokens", None)
            out_tokens = getattr(run, "completion_tokens", None)

            extra = getattr(run, "extra", {}) or {}
            outputs = getattr(run, "outputs", {}) or {}

            if in_tokens is None and isinstance(extra, dict):
                meta = extra.get("metadata", {}) or {}
                tu = extra.get("token_usage", {}) or meta.get("token_usage", {}) or meta.get("usage", {})
                if isinstance(tu, dict):
                    in_tokens = tu.get("prompt_tokens") or tu.get("input_tokens")
                    out_tokens = tu.get("completion_tokens") or tu.get("output_tokens")

            if in_tokens is None and isinstance(outputs, dict):
                llm_out = outputs.get("llm_output", {}) or outputs.get("usage", {}) or outputs.get("token_usage", {})
                if isinstance(llm_out, dict):
                    in_tokens = llm_out.get("prompt_tokens") or llm_out.get("input_tokens") or llm_out.get("prompt_token_count")
                    out_tokens = llm_out.get("completion_tokens") or llm_out.get("output_tokens") or llm_out.get("candidates_token_count")

            total_tokens_input += int(in_tokens or 0)
            total_tokens_output += int(out_tokens or 0)

            # Model extraction across metadata, invocation_params, tags, and serialized kwargs
            model_name = None
            if isinstance(extra, dict):
                meta = extra.get("metadata", {}) or {}
                inv = extra.get("invocation_params", {}) or {}
                model_name = (
                    meta.get("ls_model_name")
                    or meta.get("model_name")
                    or meta.get("model")
                    or inv.get("model_name")
                    or inv.get("model")
                )

            if not model_name and hasattr(run, "serialized") and isinstance(run.serialized, dict):
                kwargs = run.serialized.get("kwargs", {}) or {}
                model_name = kwargs.get("model") or run.serialized.get("name")

            if not model_name and hasattr(run, "tags") and run.tags:
                for tag in run.tags:
                    if any(m in tag.lower() for m in ["gpt", "gemini", "claude", "haiku", "pro", "flash"]):
                        model_name = tag
                        break

            if not model_name and getattr(run, "run_type", "") == "llm":
                model_name = run.name

            if model_name:
                clean_model = str(model_name)
                model_counts[clean_model] = model_counts.get(clean_model, 0) + 1

            # Tool extraction
            if run.name:
                if getattr(run, "run_type", "") == "tool" or any(
                    t in run.name.lower()
                    for t in [
                        "calculate",
                        "search",
                        "stock",
                        "portfolio",
                        "watchlist",
                        "news",
                        "technical",
                        "screen",
                        "hrp",
                    ]
                ):
                    tool_counts[run.name] = tool_counts.get(run.name, 0) + 1


        # Calculate averages
        avg_latency_ms = total_latency_ms / total_runs if total_runs > 0 else 0.0
        error_rate = (error_count / total_runs * 100) if total_runs > 0 else 0.0

        # Top tools & models
        top_tools = sorted(
            [{"name": k, "count": v} for k, v in tool_counts.items()],
            key=lambda x: x["count"],
            reverse=True,
        )[:10]

        top_models = sorted(
            [{"name": k, "count": v} for k, v in model_counts.items()],
            key=lambda x: x["count"],
            reverse=True,
        )[:5]

        stats = {
            "total_runs": total_runs,
            "avg_latency_ms": round(avg_latency_ms, 2),
            "total_tokens_input": total_tokens_input,
            "total_tokens_output": total_tokens_output,
            "error_rate": round(error_rate, 2),
            "top_tools": top_tools,
            "top_models": top_models,
            "error_message": None,
        }

        # Cache result
        _stats_cache.set(stats)
        logger.debug(f"LangSmith stats fetched: {total_runs} runs in last 7 days")

        return stats

    except ImportError:
        logger.warning("langsmith package not installed. Install with: pip install langsmith")
        return {
            "total_runs": 0,
            "avg_latency_ms": 0.0,
            "total_tokens_input": 0,
            "total_tokens_output": 0,
            "error_rate": 0.0,
            "top_tools": [],
            "top_models": [],
            "error_message": "langsmith package not installed",
        }
    except Exception as e:
        logger.error(f"LangSmith stats fetch failed: {e}", exc_info=True)
        return {
            "total_runs": 0,
            "avg_latency_ms": 0.0,
            "total_tokens_input": 0,
            "total_tokens_output": 0,
            "error_rate": 0.0,
            "top_tools": [],
            "top_models": [],
            "error_message": f"LangSmith API error: {str(e)[:100]}",
        }
