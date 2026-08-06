from fastapi import APIRouter, Depends, Query
from pydantic.networks import EmailStr
from pydantic import BaseModel
import yfinance as yf

from app.api.deps import get_current_active_superuser
from app.models import Message
from app.utils import generate_test_email, send_email

router = APIRouter(prefix="/utils", tags=["utils"])


class StockQuoteRequest(BaseModel):
    symbols: list[str]


@router.post(
    "/test-email/",
    dependencies=[Depends(get_current_active_superuser)],
    status_code=201,
)
async def test_email(email_to: EmailStr) -> Message:
    """
    Test emails.
    """
    email_data = generate_test_email(email_to=email_to)
    send_email(
        email_to=email_to,
        subject=email_data.subject,
        html_content=email_data.html_content,
    )
    return Message(message="Test email sent")


@router.get("/health-check/")
async def health_check() -> bool:
    return True


@router.get("/stock-search")
async def search_stocks(q: str = Query(..., min_length=1)):
    """
    Query yfinance.Search API live per official yfinance reference.
    Filtered exclusively for Indian Equities (NSE/BSE) and Indian Indices.
    """
    query = q.strip()[:100]
    if not query:
        return []

    try:
        search_obj = yf.Search(query, max_results=25)
        quotes = getattr(search_obj, "quotes", [])
        results = []
        for item in quotes:
            sym = item.get("symbol", "").upper()
            name = item.get("longname") or item.get("shortname") or sym
            quote_type = item.get("quoteType", "")
            exchange = (item.get("exchDisp") or item.get("exchange", "")).upper()

            is_indian = (
                sym.endswith(".NS")
                or sym.endswith(".BO")
                or sym.startswith("^")
                or exchange in ["NSE", "BSE", "NSI"]
            )
            if is_indian and quote_type in ["EQUITY", "ETF", "INDEX"]:
                results.append({
                    "symbol": sym,
                    "name": name,
                    "exchange": "NSE" if sym.endswith(".NS") else ("BSE" if sym.endswith(".BO") else exchange),
                    "quote_type": quote_type,
                })
        if results:
            return results
    except Exception as e:
        print(f"yfinance.Search error: {e}")

    # Fallback ticker lookup if search yielded empty
    try:
        sym = query.upper()
        if not sym.endswith(".NS") and not sym.endswith(".BO") and not sym.startswith("^"):
            sym = f"{sym}.NS"
        ticker = yf.Ticker(sym)
        info = ticker.info
        name = info.get("longName") or info.get("shortName") or sym
        price = info.get("currentPrice") or info.get("regularMarketPrice") or 0.0
        quote_type = info.get("quoteType", "EQUITY")
        return [{
            "symbol": sym,
            "name": name,
            "exchange": "NSE" if sym.endswith(".NS") else "BSE",
            "quote_type": quote_type,
            "price": price,
        }]
    except Exception:
        return []



@router.post("/stock-quotes")
async def get_stock_quotes(payload: StockQuoteRequest):
    """
    Batch fetch real-time LTP (Latest Traded Price), 1D % Change, and Full Company Name for stock symbols.
    """
    symbols = payload.symbols[:50]
    if not symbols:
        return {}

    results = {}
    try:
        data = yf.download(symbols, period="5d", progress=False)
        for sym in symbols:

            try:
                t = yf.Ticker(sym)
                info = t.info
                name = info.get("longName") or info.get("shortName") or sym
                price = info.get("currentPrice") or info.get("regularMarketPrice")
                prev_close = info.get("previousClose")

                if (not price or not prev_close) and not data.empty:
                    close_series = data["Close"][sym] if len(payload.symbols) > 1 else data["Close"]
                    valid_prices = close_series.dropna()
                    if len(valid_prices) >= 2:
                        price = float(valid_prices.iloc[-1])
                        prev_close = float(valid_prices.iloc[-2])
                    elif len(valid_prices) == 1:
                        price = float(valid_prices.iloc[-1])
                        prev_close = price

                price = price or 0.0
                prev_close = prev_close or price
                change_pct = round(((price - prev_close) / prev_close * 100), 2) if prev_close > 0 else 0.0

                results[sym] = {
                    "symbol": sym,
                    "name": name,
                    "ltp": round(price, 2),
                    "change_1d_pct": change_pct,
                }
            except Exception:
                results[sym] = {
                    "symbol": sym,
                    "name": sym,
                    "ltp": 0.0,
                    "change_1d_pct": 0.0,
                }
    except Exception as err:
        print(f"Batch stock quotes error: {err}")
        for sym in payload.symbols:
            results[sym] = {
                "symbol": sym,
                "name": sym,
                "ltp": 0.0,
                "change_1d_pct": 0.0,
            }

    return results
