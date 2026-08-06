import json
import logging
import math
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf
from langchain_core.tools import tool
from scipy.cluster.hierarchy import leaves_list, linkage

logger = logging.getLogger(__name__)


def normalize_indian_symbol(symbol: str) -> str:
    s = symbol.strip().upper()
    if s.startswith("^") or s.endswith(".NS") or s.endswith(".BO"):
        return s
    return f"{s}.NS"


@tool
def get_stock_prices_and_metrics(symbols: list[str]) -> str:
    """Fetch current price, key metrics (PE, PB, Market Cap, EV/EBITDA, Dividend Yield) for Indian stocks (NSE/BSE)."""
    results = {}
    for sym in symbols:
        norm_sym = normalize_indian_symbol(sym)
        try:
            ticker = yf.Ticker(norm_sym)
            info = ticker.info
            results[sym] = {
                "normalized_symbol": norm_sym,
                "currentPrice": info.get("currentPrice") or info.get("regularMarketPrice"),
                "currency": info.get("currency", "INR"),
                "marketCap": info.get("marketCap"),
                "peRatio": info.get("trailingPE"),
                "forwardPE": info.get("forwardPE"),
                "pbRatio": info.get("priceToBook"),
                "enterpriseToEbitda": info.get("enterpriseToEbitda"),
                "dividendYield": info.get("dividendYield"),
                "fiftyTwoWeekHigh": info.get("fiftyTwoWeekHigh"),
                "fiftyTwoWeekLow": info.get("fiftyTwoWeekLow"),
                "sector": info.get("sector"),
                "industry": info.get("industry"),
            }
        except Exception as e:
            results[sym] = {"error": f"Failed to fetch data for {sym}: {str(e)}"}
    return json.dumps(results, indent=2)


@tool
def get_financial_statements(symbol: str) -> str:
    """Fetch balance sheet, income statement, and cash flow summary for a specific Indian stock."""
    norm_sym = normalize_indian_symbol(symbol)
    try:
        ticker = yf.Ticker(norm_sym)
        financials = ticker.financials
        balance_sheet = ticker.balance_sheet
        cashflow = ticker.cashflow

        summary = {
            "symbol": norm_sym,
            "financials_keys": list(financials.index[:10]) if financials is not None and not financials.empty else [],
            "balance_sheet_keys": list(balance_sheet.index[:10]) if balance_sheet is not None and not balance_sheet.empty else [],
            "cashflow_keys": list(cashflow.index[:10]) if cashflow is not None and not cashflow.empty else [],
            "latest_financials": financials.iloc[:, :2].to_dict() if financials is not None and not financials.empty else {},
        }
        return json.dumps(summary, default=str, indent=2)
    except Exception as e:
        return json.dumps({"error": f"Failed to fetch financial statements for {symbol}: {str(e)}"})


@tool
def get_stock_news(symbol: str) -> str:
    """Fetch latest news articles related to an Indian stock."""
    norm_sym = normalize_indian_symbol(symbol)
    try:
        ticker = yf.Ticker(norm_sym)
        news = ticker.news
        cleaned_news = []
        if news:
            for item in news[:5]:
                content = item.get("content", {})
                cleaned_news.append({
                    "title": content.get("title") or item.get("title"),
                    "publisher": content.get("provider", {}).get("displayName") or item.get("publisher"),
                    "link": content.get("canonicalUrl", {}).get("url") or item.get("link"),
                    "pubDate": content.get("pubDate") or item.get("providerPublishTime"),
                })
        return json.dumps({"symbol": norm_sym, "news": cleaned_news}, indent=2)
    except Exception as e:
        return json.dumps({"error": f"Failed to fetch news for {symbol}: {str(e)}"})


@tool
def get_analyst_predictions(symbol: str) -> str:
    """Fetch analyst recommendations and target prices for an Indian stock."""
    norm_sym = normalize_indian_symbol(symbol)
    try:
        ticker = yf.Ticker(norm_sym)
        info = ticker.info
        recommendations = {
            "targetHighPrice": info.get("targetHighPrice"),
            "targetLowPrice": info.get("targetLowPrice"),
            "targetMeanPrice": info.get("targetMeanPrice"),
            "targetMedianPrice": info.get("targetMedianPrice"),
            "recommendationMean": info.get("recommendationMean"),
            "recommendationKey": info.get("recommendationKey"),
            "numberOfAnalystOpinions": info.get("numberOfAnalystOpinions"),
        }
        return json.dumps({"symbol": norm_sym, "recommendations": recommendations}, indent=2)
    except Exception as e:
        return json.dumps({"error": f"Failed to fetch analyst predictions for {symbol}: {str(e)}"})


@tool
def get_indian_indices() -> str:
    """Fetch major Indian stock market indices status (NIFTY 50, SENSEX, NIFTY BANK, NIFTY IT)."""
    indices = {
        "NIFTY 50": "^NSEI",
        "SENSEX": "^BSESN",
        "NIFTY BANK": "^NSEBANK",
        "NIFTY IT": "^CNXIT",
    }
    results = {}
    for name, ticker_sym in indices.items():
        try:
            t = yf.Ticker(ticker_sym)
            info = t.info
            results[name] = {
                "symbol": ticker_sym,
                "currentPrice": info.get("regularMarketPrice") or info.get("previousClose"),
                "previousClose": info.get("previousClose"),
                "dayHigh": info.get("dayHigh"),
                "dayLow": info.get("dayLow"),
            }
        except Exception as e:
            results[name] = {"error": str(e)}
    return json.dumps(results, indent=2)


@tool
def run_technical_analysis(symbol: str, period: str = "6m") -> str:
    """Perform technical analysis (SMA 20/50/200, EMA 12/26, RSI 14, MACD, Bollinger Bands) on an Indian stock."""
    norm_sym = normalize_indian_symbol(symbol)
    try:
        ticker = yf.Ticker(norm_sym)
        df = ticker.history(period=period)
        if df.empty or len(df) < 20:
            return json.dumps({"error": "Insufficient historical data for TA calculation."})

        close = df["Close"]
        sma20 = float(close.rolling(window=20).mean().iloc[-1])
        sma50 = float(close.rolling(window=50).mean().iloc[-1]) if len(close) >= 50 else None
        sma200 = float(close.rolling(window=200).mean().iloc[-1]) if len(close) >= 200 else None

        ema12 = float(close.ewm(span=12, adjust=False).mean().iloc[-1])
        ema26 = float(close.ewm(span=26, adjust=False).mean().iloc[-1])
        macd = ema12 - ema26
        signal = float(pd.Series(macd).ewm(span=9, adjust=False).mean().iloc[-1]) if isinstance(macd, pd.Series) else macd

        # RSI 14
        delta = close.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        rsi = float(100 - (100 / (1 + rs.iloc[-1]))) if not rs.empty else None

        # Bollinger Bands
        std20 = float(close.rolling(window=20).std().iloc[-1])
        upper_bb = sma20 + (std20 * 2)
        lower_bb = sma20 - (std20 * 2)
        latest_price = float(close.iloc[-1])

        ta_summary = {
            "symbol": norm_sym,
            "latestPrice": latest_price,
            "indicators": {
                "SMA_20": round(sma20, 2),
                "SMA_50": round(sma50, 2) if sma50 else None,
                "SMA_200": round(sma200, 2) if sma200 else None,
                "RSI_14": round(rsi, 2) if rsi else None,
                "MACD": round(macd, 2),
                "MACD_Signal": round(signal, 2),
                "BollingerUpper": round(upper_bb, 2),
                "BollingerLower": round(lower_bb, 2),
            },
            "signals": {
                "rsi_condition": "Overbought" if rsi and rsi > 70 else ("Oversold" if rsi and rsi < 30 else "Neutral"),
                "trend_sma50": "Bullish" if sma50 and latest_price > sma50 else "Bearish",
            }
        }
        return json.dumps(ta_summary, indent=2)
    except Exception as e:
        return json.dumps({"error": f"Technical analysis failed for {symbol}: {str(e)}"})


@tool
def screen_stocks(sector_or_theme: str) -> str:
    """Screen top Indian stocks by sector/theme (e.g., 'defense', 'it', 'banking', 'pharma', 'renewable')."""
    sector_map = {
        "defense": ["HAL.NS", "BEL.NS", "BDL.NS", "MAZDOCK.NS", "COCHINSHIP.NS"],
        "it": ["TCS.NS", "INFY.NS", "WIPRO.NS", "HCLTECH.NS", "TECHM.NS"],
        "banking": ["HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "KOTAKBANK.NS", "AXISBANK.NS"],
        "auto": ["TATAMOTORS.NS", "M&M.NS", "MARUTI.NS", "BAJAJ-AUTO.NS", "EICHERMOT.NS"],
        "pharma": ["SUNPHARMA.NS", "DRREDDY.NS", "CIPLA.NS", "DIVISLAB.NS", "APOLLOHOSP.NS"],
        "renewable": ["SUZLON.NS", "TATAPOWER.NS", "ADANIGREEN.NS", "IREDA.NS", "KPIGREEN.NS"],
    }

    key = sector_or_theme.lower().strip()
    symbols = sector_map.get(key, ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS"])

    screener_results = []
    for sym in symbols:
        try:
            t = yf.Ticker(sym)
            info = t.info
            screener_results.append({
                "symbol": sym,
                "name": info.get("shortName") or info.get("longName"),
                "price": info.get("currentPrice") or info.get("regularMarketPrice"),
                "peRatio": info.get("trailingPE"),
                "marketCapCr": round(info.get("marketCap", 0) / 1e7, 2) if info.get("marketCap") else None,
                "roe": info.get("returnOnEquity"),
            })
        except Exception:
            continue

    return json.dumps({"theme": sector_or_theme, "stocks": screener_results}, indent=2)


@tool
def recommend_portfolio_optimization(symbols: list[str]) -> str:
    """Perform Hierarchical Risk Parity (HRP) portfolio optimization for given Indian stock symbols and return weight allocation table."""
    norm_symbols = [normalize_indian_symbol(s) for s in symbols]
    try:
        data = yf.download(norm_symbols, period="1y")["Close"]
        if isinstance(data, pd.Series):
            data = data.to_frame()
        data = data.dropna(axis=1, how="all").ffill().bfill()
        returns = data.pct_change().dropna()

        if returns.empty or returns.shape[1] < 2:
            equal_weight = round(1.0 / len(symbols), 4)
            res = {s: equal_weight for s in symbols}
            return json.dumps({"symbols": symbols, "weights": [equal_weight]*len(symbols), "table": res, "notes": "Equal weight allocation fallback (insufficient data)"}, indent=2)

        cov = returns.cov()
        corr = returns.corr()

        # Distance matrix for HRP
        dist = np.sqrt(0.5 * (1 - corr))
        link = linkage(dist, method="single")
        sort_idx = leaves_list(link)
        ordered_symbols = returns.columns[sort_idx].tolist()

        # Recursive bisection
        weights = pd.Series(1.0, index=ordered_symbols)
        clusters = [ordered_symbols]

        while len(clusters) > 0:
            clusters = [c[j:k] for c in clusters for j, k in ((0, len(c) // 2), (len(c) // 2, len(c))) if len(c) > 1]
            for i in range(0, len(clusters), 2):
                if i + 1 < len(clusters):
                    c1, c2 = clusters[i], clusters[i+1]
                    var1 = np.dot(np.dot(np.ones(len(c1)) / len(c1), cov.loc[c1, c1]), np.ones(len(c1)) / len(c1))
                    var2 = np.dot(np.dot(np.ones(len(c2)) / len(c2), cov.loc[c2, c2]), np.ones(len(c2)) / len(c2))
                    alpha = 1 - var1 / (var1 + var2)
                    weights[c1] *= alpha
                    weights[c2] *= (1 - alpha)

        weights = weights / weights.sum()
        result_dict = {sym: round(float(weights[sym]), 4) for sym in weights.index}

        return json.dumps({
            "symbols": list(result_dict.keys()),
            "weights": list(result_dict.values()),
            "table": result_dict,
            "notes": "Hierarchical Risk Parity (HRP) portfolio optimization based on 1-year historical return covariance."
        }, indent=2)
    except Exception as e:
        equal_weight = round(1.0 / len(symbols), 4)
        return json.dumps({"symbols": symbols, "weights": [equal_weight]*len(symbols), "table": {s: equal_weight for s in symbols}, "notes": f"Fallback equal weighting due to error: {str(e)}"}, indent=2)


@tool
def get_market_news() -> str:
    """Fetch broader Indian market news and economic trends."""
    try:
        t = yf.Ticker("^NSEI")
        news = t.news
        articles = []
        if news:
            for item in news[:5]:
                content = item.get("content", {})
                articles.append({
                    "title": content.get("title") or item.get("title"),
                    "publisher": content.get("provider", {}).get("displayName") or item.get("publisher"),
                    "link": content.get("canonicalUrl", {}).get("url") or item.get("link"),
                })
        return json.dumps({"market": "Indian Market (NSE)", "news": articles}, indent=2)
    except Exception as e:
        return json.dumps({"error": f"Failed to fetch market news: {str(e)}"})


@tool
def get_user_portfolio(user_email_or_id: str = "main") -> str:
    """Fetch current user's saved portfolio holdings, stock quantities, buy prices, average prices, and current valuation from the platform database."""
    from sqlmodel import Session, select
    from app.core.db import engine
    from app.models import Portfolio, PortfolioItem

    try:
        with Session(engine) as session:
            stmt = select(Portfolio).order_by(Portfolio.created_at.desc())
            portfolio = session.exec(stmt).first()
            if not portfolio:
                return json.dumps({"message": "No portfolio holdings found for user."})

            items_stmt = select(PortfolioItem).where(PortfolioItem.portfolio_id == portfolio.id)
            items = session.exec(items_stmt).all()
            if not items:
                return json.dumps({
                    "portfolio_name": portfolio.name,
                    "holdings": [],
                    "message": "Portfolio exists but contains 0 stock holdings."
                })

            symbols = [i.symbol for i in items]
            quotes = {}
            try:
                data = yf.download(symbols, period="5d", progress=False)
                for sym in symbols:
                    t = yf.Ticker(sym)
                    info = t.info
                    price = info.get("currentPrice") or info.get("regularMarketPrice") or 0.0
                    quotes[sym] = price
            except Exception:
                pass

            holdings_list = []
            total_invested = 0.0
            total_current_val = 0.0
            for item in items:
                cur_price = quotes.get(item.symbol, item.avg_price)
                inv = item.quantity * item.avg_price
                cur_val = item.quantity * cur_price
                gain_loss = cur_val - inv
                ret_pct = ((cur_val - inv) / inv * 100) if inv > 0 else 0.0

                total_invested += inv
                total_current_val += cur_val

                holdings_list.append({
                    "symbol": item.symbol,
                    "quantity": item.quantity,
                    "avg_price": round(item.avg_price, 2),
                    "current_price": round(cur_price, 2),
                    "invested_value": round(inv, 2),
                    "current_value": round(cur_val, 2),
                    "gain_loss_inr": round(gain_loss, 2),
                    "return_pct": round(ret_pct, 2),
                })

            total_gain = total_current_val - total_invested
            total_ret_pct = ((total_current_val - total_invested) / total_invested * 100) if total_invested > 0 else 0.0

            return json.dumps({
                "portfolio_name": portfolio.name,
                "total_invested": round(total_invested, 2),
                "total_current_value": round(total_current_val, 2),
                "total_gain_loss_inr": round(total_gain, 2),
                "total_return_pct": round(total_ret_pct, 2),
                "holdings": holdings_list,
            }, indent=2)
    except Exception as e:
        return json.dumps({"error": f"Failed to fetch user portfolio holdings: {str(e)}"})


@tool
def create_user_watchlist(watchlist_name: str, symbols: list[str]) -> str:
    """Create a new custom watchlist with given stock symbols (e.g. ['MAZDOCK.NS', 'COCHINSHIP.NS']) in the user's account."""
    from sqlmodel import Session, select
    from app.core.db import engine
    from app.models import User, Watchlist, WatchlistItem

    try:
        with Session(engine) as session:
            user_stmt = select(User).order_by(User.id)
            user = session.exec(user_stmt).first()
            if not user:
                return json.dumps({"error": "No active user found to create watchlist"})

            wl = Watchlist(user_id=user.id, name=watchlist_name.strip())
            session.add(wl)
            session.commit()
            session.refresh(wl)

            added_symbols = []
            for sym in symbols:
                norm_sym = normalize_indian_symbol(sym)
                item = WatchlistItem(watchlist_id=wl.id, symbol=norm_sym)
                session.add(item)
                added_symbols.append(norm_sym)

            session.commit()
            return json.dumps({
                "message": f"Successfully created watchlist '{watchlist_name}'",
                "watchlist_id": str(wl.id),
                "symbols": added_symbols
            })
    except Exception as e:
        return json.dumps({"error": f"Failed to create user watchlist: {str(e)}"})


ALL_FINANCIAL_TOOLS = [
    get_stock_prices_and_metrics,
    get_financial_statements,
    get_stock_news,
    get_analyst_predictions,
    get_indian_indices,
    run_technical_analysis,
    screen_stocks,
    recommend_portfolio_optimization,
    get_market_news,
    get_user_portfolio,
    create_user_watchlist,
]

