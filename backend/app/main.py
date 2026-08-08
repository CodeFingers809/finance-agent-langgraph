from contextlib import asynccontextmanager
from pathlib import Path

import sentry_sdk
from fastapi import FastAPI
from fastapi.routing import APIRoute
from fastapi.staticfiles import StaticFiles
from sqlmodel import SQLModel, Session
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.api.main import api_router
from app.core.config import settings
from app.core.db import engine, init_db

FRONTEND_DIR = Path(__file__).parent / "frontend"


def custom_generate_unique_id(route: APIRoute) -> str:
    if route.tags:
        return f"{route.tags[0]}-{route.name}"
    return route.name



if settings.SENTRY_DSN and settings.ENVIRONMENT != "local":
    sentry_sdk.init(dsn=str(settings.SENTRY_DSN), enable_tracing=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        init_db(session)
    
    # Initialize LangSmith observability (free tier: only if configured)
    from app.core.langsmith_client import enable_langsmith_tracing
    enable_langsmith_tracing()
    
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    generate_unique_id_function=custom_generate_unique_id,
    lifespan=lifespan,
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        if not response.headers.get("Content-Security-Policy"):
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                "font-src 'self' https://fonts.gstatic.com data:; "
                "img-src 'self' data: https: blob:; "
                "connect-src 'self' http://localhost:3001 http://127.0.0.1:3001 ws://localhost:3001;"
            )
        return response


app.add_middleware(SecurityHeadersMiddleware)

# Add CORS middleware with regex pattern matching all origins for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


import logging
import traceback
from fastapi.responses import FileResponse, Response, JSONResponse

logger = logging.getLogger(__name__)

# Global 500 Exception Handler for transparent error logging & responses
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(
        f"Unhandled Exception on {request.method} {request.url.path}: {str(exc)}\n{traceback.format_exc()}"
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": f"Internal Server Error: {str(exc)}",
            "path": str(request.url.path),
        },
    )

# Include API Router under /api/v1 prefix
app.include_router(api_router, prefix=settings.API_V1_STR)

# Mount static frontend files and serve SPA routes safely
if FRONTEND_DIR.exists():
    if (FRONTEND_DIR / "assets").exists():
        app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Exclude API endpoints, docs, openapi, and assets from SPA fallback
        if (
            full_path.startswith("api/")
            or full_path == "api"
            or full_path.startswith("docs")
            or full_path.startswith("openapi")
            or full_path.startswith("redoc")
            or full_path.startswith("assets/")
        ):
            return JSONResponse(status_code=404, content={"detail": f"API endpoint '{full_path}' not found"})

        file_path = FRONTEND_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        index_file = FRONTEND_DIR / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        return JSONResponse(status_code=404, content={"detail": "Not Found"})


