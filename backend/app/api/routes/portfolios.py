import uuid
from typing import Annotated

import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.agent.tools import normalize_indian_symbol
from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Portfolio,
    PortfolioItem,
    PortfolioItemCreate,
    PortfolioItemPublic,
    PortfolioMetricsPublic,
    PortfolioPublic,
)

router = APIRouter(prefix="/portfolios", tags=["portfolios"])


@router.get("", response_model=list[PortfolioPublic])
async def list_portfolios(session: SessionDep, current_user: CurrentUser) -> list[PortfolioPublic]:
    statement = (
        select(Portfolio)
        .where(Portfolio.user_id == current_user.id)
        .order_by(Portfolio.created_at.desc())
    )
    portfolios = session.exec(statement).all()

    # Auto-create single Main Portfolio if none exists
    if not portfolios:
        main_portfolio = Portfolio(user_id=current_user.id, name="Main Portfolio")
        session.add(main_portfolio)
        session.commit()
        session.refresh(main_portfolio)
        portfolios = [main_portfolio]

    results = []
    for p in portfolios:
        items_stmt = select(PortfolioItem).where(PortfolioItem.portfolio_id == p.id)
        items = session.exec(items_stmt).all()
        p_dict = PortfolioPublic(
            id=p.id,
            name=p.name,
            created_at=p.created_at,
            items=[PortfolioItemPublic.model_validate(item) for item in items],
        )
        results.append(p_dict)
    return results


@router.post("/{portfolio_id}/items", response_model=PortfolioItemPublic)
async def add_portfolio_item(
    portfolio_id: uuid.UUID,
    payload: PortfolioItemCreate,
    session: SessionDep,
    current_user: CurrentUser,
) -> PortfolioItemPublic:
    portfolio = session.get(Portfolio, portfolio_id)
    if not portfolio or portfolio.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portfolio not found")

    norm_symbol = normalize_indian_symbol(payload.symbol)
    if norm_symbol.startswith("^"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Indices cannot be added to portfolios. Stock equities only.",
        )
    avg_p = payload.avg_price if payload.avg_price is not None else payload.buy_price


    item = PortfolioItem(
        portfolio_id=portfolio_id,
        symbol=norm_symbol,
        quantity=payload.quantity,
        buy_price=payload.buy_price,
        avg_price=avg_p,
        bought_at=payload.bought_at,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return PortfolioItemPublic.model_validate(item)


@router.delete("/{portfolio_id}/items/{item_id}")
async def delete_portfolio_item(
    portfolio_id: uuid.UUID,
    item_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
):
    item = session.get(PortfolioItem, item_id)
    if not item or item.portfolio_id != portfolio_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    portfolio = session.get(Portfolio, portfolio_id)
    if not portfolio or portfolio.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    session.delete(item)
    session.commit()
    return {"message": "Portfolio item deleted"}


@router.put("/{portfolio_id}/items/{item_id}", response_model=PortfolioItemPublic)
async def update_portfolio_item(
    portfolio_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: PortfolioItemCreate,
    session: SessionDep,
    current_user: CurrentUser,
) -> PortfolioItemPublic:
    portfolio = session.get(Portfolio, portfolio_id)
    if not portfolio or portfolio.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portfolio not found")

    item = session.get(PortfolioItem, item_id)
    if not item or item.portfolio_id != portfolio_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    norm_symbol = normalize_indian_symbol(payload.symbol)
    if norm_symbol.startswith("^"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Indices cannot be added to portfolios. Stock equities only.",
        )

    item.symbol = norm_symbol
    item.quantity = payload.quantity
    item.buy_price = payload.buy_price
    item.avg_price = payload.avg_price if payload.avg_price is not None else payload.buy_price
    if payload.bought_at is not None:
        item.bought_at = payload.bought_at

    session.add(item)
    session.commit()
    session.refresh(item)
    return PortfolioItemPublic.model_validate(item)



@router.get("/{portfolio_id}/metrics", response_model=PortfolioMetricsPublic)
async def get_portfolio_metrics(
    portfolio_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> PortfolioMetricsPublic:
    portfolio = session.get(Portfolio, portfolio_id)
    if not portfolio or portfolio.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portfolio not found")

    items_stmt = select(PortfolioItem).where(PortfolioItem.portfolio_id == portfolio_id)
    items = session.exec(items_stmt).all()

    if not items:
        return PortfolioMetricsPublic(
            total_invested=0.0,
            current_value=0.0,
            total_return=0.0,
            total_return_pct=0.0,
            cagr=None,
            sharpe_ratio=None,
            sortino_ratio=None,
            beta=None,
            alpha=None,
        )

    symbols = [item.symbol for item in items]
    total_invested = sum(item.quantity * item.buy_price for item in items)
    current_value = 0.0

    try:
        data = yf.download(symbols + ["^NSEI"], period="1y")["Close"]
        latest_prices = {}
        for item in items:
            sym = item.symbol
            try:
                t = yf.Ticker(sym)
                price = t.info.get("currentPrice") or t.info.get("regularMarketPrice")
                if not price and sym in data.columns and not data[sym].dropna().empty:
                    price = float(data[sym].dropna().iloc[-1])
                price = price or item.buy_price
            except Exception:
                price = item.buy_price
            latest_prices[sym] = price
            current_value += item.quantity * price

        total_return = current_value - total_invested
        total_return_pct = (total_return / total_invested * 100) if total_invested > 0 else 0.0

        returns_df = data.pct_change().dropna()
        if "^NSEI" in returns_df.columns:
            benchmark_returns = returns_df["^NSEI"]
        else:
            benchmark_returns = pd.Series(0.0005, index=returns_df.index)

        weights = [ (item.quantity * latest_prices[item.symbol]) / current_value for item in items ] if current_value > 0 else [1/len(items)]*len(items)
        stock_cols = [s for s in symbols if s in returns_df.columns]

        if stock_cols and len(stock_cols) == len(weights):
            port_returns = (returns_df[stock_cols] * weights).sum(axis=1)
        else:
            port_returns = benchmark_returns

        mean_ret = port_returns.mean() * 252
        volatility = port_returns.std() * np.sqrt(252)
        risk_free_rate = 0.065

        sharpe = float((mean_ret - risk_free_rate) / volatility) if volatility > 0 else None

        downside_returns = port_returns[port_returns < 0]
        downside_std = downside_returns.std() * np.sqrt(252)
        sortino = float((mean_ret - risk_free_rate) / downside_std) if downside_std > 0 else None

        cov = np.cov(port_returns, benchmark_returns)[0][1]
        bench_var = np.var(benchmark_returns)
        beta = float(cov / bench_var) if bench_var > 0 else 1.0

        bench_mean_ret = benchmark_returns.mean() * 252
        alpha = float(mean_ret - (risk_free_rate + beta * (bench_mean_ret - risk_free_rate)))

        return PortfolioMetricsPublic(
            total_invested=round(total_invested, 2),
            current_value=round(current_value, 2),
            total_return=round(total_return, 2),
            total_return_pct=round(total_return_pct, 2),
            cagr=round(total_return_pct, 2),
            sharpe_ratio=round(sharpe, 2) if sharpe is not None else None,
            sortino_ratio=round(sortino, 2) if sortino is not None else None,
            beta=round(beta, 2) if beta is not None else None,
            alpha=round(alpha, 2) if alpha is not None else None,
        )
    except Exception:
        total_return = current_value - total_invested
        total_return_pct = (total_return / total_invested * 100) if total_invested > 0 else 0.0
        return PortfolioMetricsPublic(
            total_invested=round(total_invested, 2),
            current_value=round(current_value, 2),
            total_return=round(total_return, 2),
            total_return_pct=round(total_return_pct, 2),
            cagr=None,
            sharpe_ratio=None,
            sortino_ratio=None,
            beta=None,
            alpha=None,
        )
