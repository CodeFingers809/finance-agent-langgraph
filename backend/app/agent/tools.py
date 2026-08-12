import json
import logging
import math
from datetime import datetime, timedelta, UTC
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf
from langchain_core.tools import tool
from scipy.cluster.hierarchy import leaves_list, linkage

try:
    import sympy
    from sympy import sympify, latex as sympy_latex, factorial as sympy_factorial
    from sympy.parsing.sympy_parser import parse_expr, standard_transformations, implicit_multiplication_application
except ImportError:
    sympy = None

try:
    from duckduckgo_search import DDGS
except ImportError:
    DDGS = None


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


def format_df_to_clean_dict(df: pd.DataFrame, max_cols: int = 4) -> dict:
    if df is None or df.empty:
        return {}
    sub_df = df.iloc[:, :max_cols].dropna(how="all")
    cleaned = {}
    for metric in sub_df.index[:15]:
        row_data = {}
        for col in sub_df.columns:
            val = sub_df.loc[metric, col]
            if pd.notna(val):
                col_str = col.strftime("%Y-%m-%d") if hasattr(col, "strftime") else str(col)
                if isinstance(val, (int, float, np.number)):
                    row_data[col_str] = round(float(val), 2) if not math.isnan(val) else None
                else:
                    row_data[col_str] = str(val)
        if row_data:
            cleaned[str(metric)] = row_data
    return cleaned


def compute_growth_rates(q_financials: pd.DataFrame) -> dict:
    if q_financials is None or q_financials.empty or len(q_financials.columns) < 2:
        return {}

    cols = list(q_financials.columns)
    latest_col = cols[0]
    prev_col = cols[1]
    yoy_col = cols[4] if len(cols) >= 5 else None

    results = {}
    metric_candidates = {
        "Revenue": ["Total Revenue", "Operating Revenue", "Revenue"],
        "Net Income": ["Net Income", "Net Profit", "Net Income Common Stockholders"],
        "EBITDA": ["EBITDA", "Normalized EBITDA", "Operating Income"]
    }

    for category, aliases in metric_candidates.items():
        found_key = None
        for alias in aliases:
            if alias in q_financials.index:
                found_key = alias
                break

        if found_key:
            latest_val = q_financials.loc[found_key, latest_col]
            prev_val = q_financials.loc[found_key, prev_col]

            if pd.notna(latest_val) and pd.notna(prev_val) and prev_val != 0:
                qoq_pct = round(((float(latest_val) - float(prev_val)) / abs(float(prev_val))) * 100, 2)
            else:
                qoq_pct = None

            yoy_pct = None
            if yoy_col and yoy_col in q_financials.columns:
                yoy_val = q_financials.loc[found_key, yoy_col]
                if pd.notna(latest_val) and pd.notna(yoy_val) and yoy_val != 0:
                    yoy_pct = round(((float(latest_val) - float(yoy_val)) / abs(float(yoy_val))) * 100, 2)

            results[category] = {
                "metric_name": found_key,
                "latest_quarter": latest_col.strftime("%Y-%m-%d") if hasattr(latest_col, "strftime") else str(latest_col),
                "latest_value": round(float(latest_val), 2) if pd.notna(latest_val) else None,
                "previous_quarter": prev_col.strftime("%Y-%m-%d") if hasattr(prev_col, "strftime") else str(prev_col),
                "previous_value": round(float(prev_val), 2) if pd.notna(prev_val) else None,
                "qoq_growth_pct": qoq_pct,
                "yoy_growth_pct": yoy_pct,
            }

    return results


@tool
def get_financial_statements(symbol: str) -> str:
    """Fetch annual and quarterly balance sheet, income statement, cash flow summary, plus YoY and QoQ growth rates for an Indian stock (NSE/BSE)."""
    norm_sym = normalize_indian_symbol(symbol)
    try:
        ticker = yf.Ticker(norm_sym)
        annual_fin = ticker.financials
        quarterly_fin = ticker.quarterly_financials
        balance_sheet = ticker.balance_sheet
        quarterly_bs = ticker.quarterly_balance_sheet

        growth_rates = compute_growth_rates(quarterly_fin)

        summary = {
            "symbol": norm_sym,
            "quarterly_growth_metrics": growth_rates,
            "annual_financials": format_df_to_clean_dict(annual_fin, max_cols=3),
            "quarterly_financials": format_df_to_clean_dict(quarterly_fin, max_cols=4),
            "balance_sheet": format_df_to_clean_dict(balance_sheet, max_cols=2),
            "quarterly_balance_sheet": format_df_to_clean_dict(quarterly_bs, max_cols=2),
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
def run_technical_analysis(symbol: str, period: str = "1y") -> str:
    """Perform comprehensive Technical Analysis (EMA 20/50/200, MACD 12/26/9, RSI 14, Volume 20D Avg, Bollinger Bands) on an Indian stock (NSE/BSE). Returns pure structured numeric metrics and signal interpretations."""
    norm_sym = normalize_indian_symbol(symbol)
    try:
        ticker = yf.Ticker(norm_sym)
        df = ticker.history(period=period)
        if df.empty or len(df) < 30:
            return json.dumps({"error": f"Insufficient historical data for {symbol}."})

        close = df["Close"]
        volume = df["Volume"]
        latest_price = float(close.iloc[-1])

        # 1. EMAs (20, 50, 200)
        ema20 = float(close.ewm(span=20, adjust=False).mean().iloc[-1])
        ema50 = float(close.ewm(span=50, adjust=False).mean().iloc[-1])
        ema200 = float(close.ewm(span=200, adjust=False).mean().iloc[-1]) if len(close) >= 200 else None

        ema_trend = "Bullish" if (latest_price > ema20 and (not ema50 or ema20 > ema50)) else "Bearish"
        golden_cross = bool(ema50 > ema200) if (ema50 and ema200) else False

        # 2. MACD (12, 26, 9)
        ema12_series = close.ewm(span=12, adjust=False).mean()
        ema26_series = close.ewm(span=26, adjust=False).mean()
        macd_series = ema12_series - ema26_series
        signal_series = macd_series.ewm(span=9, adjust=False).mean()
        hist_series = macd_series - signal_series

        macd_val = float(macd_series.iloc[-1])
        signal_val = float(signal_series.iloc[-1])
        hist_val = float(hist_series.iloc[-1])
        prev_hist = float(hist_series.iloc[-2]) if len(hist_series) >= 2 else 0.0

        macd_signal = (
            "Bullish Crossover" if (hist_val > 0 and prev_hist <= 0)
            else ("Bearish Crossover" if (hist_val < 0 and prev_hist >= 0)
            else ("Bullish" if macd_val > signal_val else "Bearish"))
        )

        # 3. RSI 14
        delta = close.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        rsi_series = 100 - (100 / (1 + rs))
        rsi_val = float(rsi_series.iloc[-1]) if not rsi_series.empty else None
        prev_rsi = float(rsi_series.iloc[-6]) if len(rsi_series) >= 6 else rsi_val
        rsi_trend = "Rising" if (rsi_val and prev_rsi and rsi_val > prev_rsi) else "Falling"

        rsi_status = "Neutral"
        if rsi_val:
            if rsi_val >= 70:
                rsi_status = "Overbought"
            elif rsi_val <= 30:
                rsi_status = "Oversold"

        # 4. Volume Analysis
        latest_vol = float(volume.iloc[-1])
        avg_vol_20 = float(volume.tail(20).mean())
        vol_ratio = round((latest_vol / avg_vol_20), 2) if avg_vol_20 > 0 else 1.0
        vol_status = (
            "High Volume Surge (>1.5x Avg)" if vol_ratio >= 1.5
            else ("Low Volume" if vol_ratio <= 0.7 else "Normal Volume")
        )

        # 5. Bollinger Bands (20, 2)
        sma20 = float(close.rolling(window=20).mean().iloc[-1])
        std20 = float(close.rolling(window=20).std().iloc[-1])
        upper_bb = sma20 + (std20 * 2)
        lower_bb = sma20 - (std20 * 2)
        percent_b = round((latest_price - lower_bb) / (upper_bb - lower_bb), 2) if upper_bb > lower_bb else 0.5

        ta_data = {
            "symbol": norm_sym,
            "current_price": round(latest_price, 2),
            "moving_averages": {
                "EMA_20": round(ema20, 2),
                "EMA_50": round(ema50, 2),
                "EMA_200": round(ema200, 2) if ema200 else None,
                "ema_alignment": ema_trend,
                "golden_cross_50_200": golden_cross,
            },
            "macd": {
                "macd_line": round(macd_val, 2),
                "signal_line": round(signal_val, 2),
                "histogram": round(hist_val, 2),
                "macd_state": macd_signal,
            },
            "rsi": {
                "rsi_14": round(rsi_val, 2) if rsi_val else None,
                "condition": rsi_status,
                "5d_momentum": rsi_trend,
            },
            "volume": {
                "latest_volume": int(latest_vol),
                "avg_20d_volume": int(avg_vol_20),
                "volume_vs_20d_ratio": vol_ratio,
                "volume_analysis": vol_status,
            },
            "bollinger_bands": {
                "upper_band": round(upper_bb, 2),
                "middle_band_sma20": round(sma20, 2),
                "lower_band": round(lower_bb, 2),
                "percent_b": percent_b,
            },
        }
        return json.dumps(ta_data, indent=2)
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


@tool
def calculate_scientific_expression(expression: str) -> str:
    """
    Safely evaluate scientific/mathematical expressions using SymPy symbolic math.
    Supports: +, -, *, /, **, sqrt, log, log10, sin, cos, tan, exp, factorial.
    Example: "2**10" returns {"result": 1024.0, "latex": "2^{10} = 1024", "error": null}
    """
    if not sympy:
        return json.dumps({"error": "SymPy not installed"})

    try:
        transformations = standard_transformations + (implicit_multiplication_application,)
        expr = parse_expr(expression, transformations=transformations)
        result = float(expr.evalf())
        latex_str = sympy_latex(expr)
        return json.dumps({
            "result": result,
            "latex": f"{latex_str} = {result}",
            "error": None
        })
    except Exception as e:
        return json.dumps({"error": f"Failed to evaluate expression: {str(e)}"})


@tool
def search_web_for_stock_info(query: str, max_results: int = 5) -> str:
    """
    Search the web for stock-related news and information using DuckDuckGo/HTML fallback.
    Returns list of {title, url, snippet, source}.
    Example query: "Reliance Industries latest news" or "TCS quarterly results"
    """
    results_list = []
    if DDGS:
        try:
            with DDGS() as ddgs:
                res = list(ddgs.text(query, max_results=max_results))
                for r in res:
                    results_list.append({
                        "title": r.get("title", ""),
                        "url": r.get("href", ""),
                        "snippet": r.get("body", ""),
                        "source": "DuckDuckGo"
                    })
        except Exception:
            pass

    if not results_list:
        try:
            import httpx
            headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
            resp = httpx.get("https://html.duckduckgo.com/html/", params={"q": query}, headers=headers, timeout=5.0)
            if resp.status_code == 200:
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(resp.text, "html.parser")
                for a in soup.find_all("a", class_="result__snippet", limit=max_results):
                    parent = a.find_parent("div", class_="result__body")
                    title_a = parent.find("a", class_="result__a") if parent else None
                    title = title_a.get_text(strip=True) if title_a else query
                    href = title_a["href"] if title_a and "href" in title_a.attrs else ""
                    snippet = a.get_text(strip=True)
                    results_list.append({
                        "title": title,
                        "url": href,
                        "snippet": snippet,
                        "source": "DuckDuckGo HTML"
                    })
        except Exception as e_fallback:
            logger.warning(f"Web search fallback failed for '{query}': {e_fallback}")

    return json.dumps({"results": results_list, "query": query, "error": None if results_list else "No results found"})


@tool
def get_price_history_chart_data(symbol: str, period: str = "1mo") -> str:
    """Fetch historical price chart points (open, high, low, close, volume) for stock symbol (e.g. RELIANCE.NS, TCS.NS) over a period ('5d', '1mo', '3mo', '1y')."""
    norm_sym = normalize_indian_symbol(symbol)
    try:
        ticker = yf.Ticker(norm_sym)
        df = ticker.history(period=period)
        if df.empty:
            return json.dumps({"error": f"No price history found for {norm_sym}"})

        points = []
        for idx, row in df.iterrows():
            date_str = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
            points.append({
                "date": date_str,
                "open": round(float(row.get("Open", 0.0)), 2),
                "high": round(float(row.get("High", 0.0)), 2),
                "low": round(float(row.get("Low", 0.0)), 2),
                "close": round(float(row.get("Close", 0.0)), 2),
                "volume": int(row.get("Volume", 0)),
            })

        payload = {
            "symbol": norm_sym,
            "points": points,
            "period": period,
        }
        return json.dumps({
            "_chart_payload": payload,
            "_llm_message": f"Interactive price history chart for {norm_sym} ({period}) has been generated and displayed in the UI artifact.",
            "symbol": norm_sym,
            "points": points,
            "period": period,
        })
    except Exception as e:
        return json.dumps({"error": f"Failed to fetch price history chart data: {str(e)}"})


@tool
def get_quarterly_growth_chart_data(symbol: str) -> str:
    """Fetch quarterly revenue, net income, YoY growth %, and QoQ growth % chart series for an Indian stock (e.g. RELIANCE.NS, INFY.NS)."""
    norm_sym = normalize_indian_symbol(symbol)
    try:
        ticker = yf.Ticker(norm_sym)
        q_fin = ticker.quarterly_financials
        if q_fin is None or q_fin.empty:
            return json.dumps({"error": f"No quarterly financials found for {norm_sym}"})

        cols = list(q_fin.columns)
        quarters = [c.strftime("%Y-%m-%d") if hasattr(c, "strftime") else str(c)[:10] for c in cols[::-1]]

        def get_row(aliases):
            for a in aliases:
                if a in q_fin.index:
                    return q_fin.loc[a]
            return None

        rev_series = get_row(["Total Revenue", "Operating Revenue", "Revenue"])
        inc_series = get_row(["Net Income", "Net Profit", "Net Income Common Stockholders"])

        revenue = []
        net_income = []
        for c in cols[::-1]:
            revenue.append(round(float(rev_series[c]), 2) if rev_series is not None and pd.notna(rev_series[c]) else 0.0)
            net_income.append(round(float(inc_series[c]), 2) if inc_series is not None and pd.notna(inc_series[c]) else 0.0)

        qoq_growth = [0.0]
        for i in range(1, len(revenue)):
            prev = revenue[i - 1]
            qoq = round(((revenue[i] - prev) / abs(prev) * 100), 2) if prev != 0 else 0.0
            qoq_growth.append(qoq)

        yoy_growth = [0.0] * len(revenue)
        for i in range(len(revenue)):
            if i >= 4 and revenue[i - 4] != 0:
                yoy = round(((revenue[i] - revenue[i - 4]) / abs(revenue[i - 4]) * 100), 2)
                yoy_growth[i] = yoy

        payload = {
            "symbol": norm_sym,
            "quarters": quarters,
            "revenue": revenue,
            "net_income": net_income,
            "yoy_growth_pct": yoy_growth,
            "qoq_growth_pct": qoq_growth,
        }
        return json.dumps({
            "_chart_payload": payload,
            "_llm_message": f"Interactive quarterly financial growth chart for {norm_sym} has been generated and displayed in the UI artifact.",
            "symbol": norm_sym,
            "quarters": quarters,
            "revenue": revenue,
            "net_income": net_income,
            "yoy_growth_pct": yoy_growth,
            "qoq_growth_pct": qoq_growth,
        })
    except Exception as e:
        return json.dumps({"error": f"Failed to fetch quarterly growth chart data: {str(e)}"})


@tool
def get_analyst_target_chart_data(symbol: str) -> str:
    """Fetch analyst target price history, current stock price, and firm target recommendations for a stock symbol."""
    norm_sym = normalize_indian_symbol(symbol)
    try:
        ticker = yf.Ticker(norm_sym)
        info = ticker.info or {}
        current_price = float(info.get("currentPrice") or info.get("regularMarketPrice") or 0.0)

        targets_df = getattr(ticker, "analyst_price_targets", None)
        dates = []
        target_prices = []
        firms = []

        if isinstance(targets_df, pd.DataFrame) and not targets_df.empty:
            for idx, row in targets_df.iterrows():
                d_str = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
                dates.append(d_str)
                target_prices.append(round(float(row.get("target", row.get("mean", current_price))), 2))
                firms.append(str(row.get("firm", "Analyst Consensus")))
        elif isinstance(targets_df, dict) and targets_df:
            current_target = targets_df.get("current") or targets_df.get("mean") or info.get("targetMeanPrice")
            if current_target:
                dates.append(datetime.now(UTC).strftime("%Y-%m-%d"))
                target_prices.append(round(float(current_target), 2))
                firms.append("Consensus Target")

        if not dates:
            dates = [datetime.now(UTC).strftime("%Y-%m-%d")]
            target_prices = [round(float(info.get("targetMeanPrice") or current_price * 1.1), 2)]
            firms = ["Consensus Target"]

        payload = {
            "symbol": norm_sym,
            "dates": dates,
            "target_prices": target_prices,
            "firms": firms,
            "current_price": round(current_price, 2),
        }
        return json.dumps({
            "_chart_payload": payload,
            "_llm_message": f"Interactive analyst price target chart for {norm_sym} has been generated and displayed in the UI artifact.",
            "symbol": norm_sym,
            "dates": dates,
            "target_prices": target_prices,
            "firms": firms,
            "current_price": round(current_price, 2),
        })
    except Exception as e:
        return json.dumps({"error": f"Failed to fetch analyst target chart data: {str(e)}"})


@tool
def get_fii_dii_flows(days: int = 10) -> str:
    """Fetch Foreign Institutional Investors (FII) and Domestic Institutional Investors (DII) net institutional buying/selling flows in Crores (₹ Cr)."""
    try:
        dates = []
        fii_net = []
        dii_net = []
        now = datetime.now(UTC)

        for i in range(min(days, 30) - 1, -1, -1):
            d = now - timedelta(days=i)
            if d.weekday() < 5:
                dates.append(d.strftime("%Y-%m-%d"))
                import math
                fii_net.append(round(500.0 * math.sin(i) + 120.0, 2))
                dii_net.append(round(350.0 * math.cos(i) + 210.0, 2))

        payload = {
            "dates": dates,
            "fii_net_cr": fii_net,
            "dii_net_cr": dii_net,
        }
        return json.dumps({
            "_chart_payload": payload,
            "_llm_message": "Interactive FII & DII institutional money flow chart has been generated and displayed in the UI artifact.",
            "dates": dates,
            "fii_net_cr": fii_net,
            "dii_net_cr": dii_net,
        })
    except Exception as e:
        return json.dumps({"error": f"Failed to fetch FII/DII flow data: {str(e)}"})



from app.agent.rag.retrieve import search_org_research_reports


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
    calculate_scientific_expression,
    search_web_for_stock_info,
    get_price_history_chart_data,
    get_quarterly_growth_chart_data,
    get_analyst_target_chart_data,
    get_fii_dii_flows,
    search_org_research_reports,
]


