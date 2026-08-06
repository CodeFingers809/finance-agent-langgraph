from fastapi import APIRouter

from app.api.routes import agent, items, login, portfolios, private, users, utils, watchlists
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
api_router.include_router(items.router)
api_router.include_router(agent.router)
api_router.include_router(portfolios.router)
api_router.include_router(watchlists.router)


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
