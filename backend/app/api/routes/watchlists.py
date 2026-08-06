import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.agent.tools import normalize_indian_symbol
from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Watchlist,
    WatchlistCreate,
    WatchlistItem,
    WatchlistItemCreate,
    WatchlistItemPublic,
    WatchlistPublic,
)

router = APIRouter(prefix="/watchlists", tags=["watchlists"])


@router.get("", response_model=list[WatchlistPublic])
async def list_watchlists(session: SessionDep, current_user: CurrentUser) -> list[WatchlistPublic]:
    statement = (
        select(Watchlist)
        .where(Watchlist.user_id == current_user.id)
        .order_by(Watchlist.created_at.desc())
    )
    watchlists = session.exec(statement).all()
    results = []
    for w in watchlists:
        items_stmt = select(WatchlistItem).where(WatchlistItem.watchlist_id == w.id)
        items = session.exec(items_stmt).all()
        w_dict = WatchlistPublic(
            id=w.id,
            name=w.name,
            created_at=w.created_at,
            items=[WatchlistItemPublic.model_validate(item) for item in items],
        )
        results.append(w_dict)
    return results


@router.post("", response_model=WatchlistPublic)
async def create_watchlist(
    payload: WatchlistCreate, session: SessionDep, current_user: CurrentUser
) -> WatchlistPublic:
    # Check limit of 10 watchlists per user
    existing_stmt = select(Watchlist).where(Watchlist.user_id == current_user.id)
    existing_count = len(session.exec(existing_stmt).all())
    if existing_count >= 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum limit of 10 watchlists per user reached.",
        )

    watchlist = Watchlist(user_id=current_user.id, name=payload.name)
    session.add(watchlist)
    session.commit()
    session.refresh(watchlist)
    return WatchlistPublic(id=watchlist.id, name=watchlist.name, created_at=watchlist.created_at, items=[])


@router.delete("/{watchlist_id}")
async def delete_watchlist(
    watchlist_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
):
    watchlist = session.get(Watchlist, watchlist_id)
    if not watchlist or watchlist.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Watchlist not found")
    session.delete(watchlist)
    session.commit()
    return {"message": "Watchlist deleted"}


@router.post("/{watchlist_id}/items", response_model=WatchlistItemPublic)
async def add_watchlist_item(
    watchlist_id: uuid.UUID,
    payload: WatchlistItemCreate,
    session: SessionDep,
    current_user: CurrentUser,
) -> WatchlistItemPublic:
    watchlist = session.get(Watchlist, watchlist_id)
    if not watchlist or watchlist.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Watchlist not found")

    # Check max limit of 50 items per watchlist
    items_stmt = select(WatchlistItem).where(WatchlistItem.watchlist_id == watchlist_id)
    items_count = len(session.exec(items_stmt).all())
    if items_count >= 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum limit of 50 stocks per watchlist reached.",
        )

    norm_symbol = normalize_indian_symbol(payload.symbol)

    item = WatchlistItem(watchlist_id=watchlist_id, symbol=norm_symbol)
    session.add(item)
    session.commit()
    session.refresh(item)
    return WatchlistItemPublic.model_validate(item)


@router.delete("/{watchlist_id}/items/{item_id}")
async def delete_watchlist_item(
    watchlist_id: uuid.UUID,
    item_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
):
    item = session.get(WatchlistItem, item_id)
    if not item or item.watchlist_id != watchlist_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    watchlist = session.get(Watchlist, watchlist_id)
    if not watchlist or watchlist.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    session.delete(item)
    session.commit()
    return {"message": "Watchlist item deleted"}
