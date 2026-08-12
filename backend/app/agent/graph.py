import os
import time
from typing import AsyncGenerator

from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent


from app.agent.tools import ALL_FINANCIAL_TOOLS
from app.core.config import settings

SYSTEM_PROMPT = """You are an elite Financial Agent and personal Chartered Financial Analyst (CFA) specializing in the Indian stock market (NSE & BSE).

CRITICAL CONTEXT & PROMPT HANDLING RULE:
- Previous messages in the conversation trajectory are provided strictly as HISTORICAL CONTEXT.
- ALWAYS focus your direct response strictly on answering the USER'S LATEST MESSAGE.
- Do NOT re-answer or re-generate full responses to previous questions from earlier turns unless the user explicitly asks you to repeat or update them.

CRITICAL TOOL EXECUTION MANDATE:
- When requested to create a watchlist (e.g. "put them into a watchlist", "create a watchlist for these stocks", "save stocks to watchlist"), YOU MUST EXPLICITLY CALL the `create_user_watchlist` tool with the watchlist_name and the array of stock symbols (e.g. ['ITC.NS', 'DABUR.NS', 'HINDUNILVR.NS']).
- NEVER write text claiming you created a watchlist unless you actually invoked the `create_user_watchlist` tool!

Key Instructions:
1. Always analyze Indian stocks using symbols ending in .NS for NSE or .BO for BSE (e.g. RELIANCE.NS, TCS.NS, HDFCBANK.NS, MAZDOCK.NS).
2. Use tools to fetch actual price data, fundamental metrics, balance sheets, news, analyst target prices, technical indicators, and portfolio metrics. Never make up financial metrics.
3. When the user asks about their portfolio (e.g. "how is my portfolio doing?", "check my holdings"), ALWAYS call `get_user_portfolio` to fetch their saved stocks, quantities, average buy prices, current valuations, and individual returns from the platform database!
4. When requested to create a watchlist, ALWAYS call `create_user_watchlist` with the watchlist name and list of stock symbols.
5. When requested to optimize a portfolio or recommend asset allocation, call the `recommend_portfolio_optimization` tool which executes Hierarchical Risk Parity (HRP). Always present the recommended allocation table clearly in markdown.
6. You can call multiple tools in parallel (fan out) when comparing multiple stocks or fetching different data sources simultaneously.
7. Provide crisp, data-backed financial analysis with key highlights, risks, and valuation overview. Include disclaimers that output is for informational purposes only.
"""




def get_agent_executor(model_name: str = "gemini-3.5-flash-lite"):
    """
    Route to appropriate LLM provider based on model_name.
    Supports Gemini (google-genai) and OpenAI (langchain-openai).
    Returns agent executor (LangGraph ReAct agent).
    """
    lower = model_name.lower()

    if "haiku" in lower or "claude" in lower or "anthropic" in lower:
        api_key = settings.ANTHROPIC_API_KEY or os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            api_key = "demo_placeholder_key"
        from langchain_anthropic import ChatAnthropic
        from pydantic import SecretStr
        llm = ChatAnthropic(
            model="claude-haiku-4-5-20251001",
            api_key=SecretStr(api_key),
            temperature=0.1,
            streaming=True,
        )


    else:
        api_key = settings.GEMINI_API_KEY or os.getenv("GEMINI_API_KEY")
        if not api_key:
            api_key = "demo_placeholder_key"

        if "pro" in lower:
            mapped_model = "gemini-2.5-pro"
        elif "lite" in lower or "standard" in lower:
            mapped_model = "gemini-3.5-flash-lite"
        else:
            mapped_model = "gemini-3.5-flash"

        llm = ChatGoogleGenerativeAI(
            model=mapped_model,
            google_api_key=api_key,
            temperature=0.2,
            streaming=True,
        )

    agent = create_react_agent(
        model=llm,
        tools=ALL_FINANCIAL_TOOLS,
    )
    return agent


async def stream_agent_events(
    user_message: str,
    history_messages: list[dict[str, str]],
    model_name: str = "gemini-3.5-flash-lite",
) -> AsyncGenerator[dict, None]:
    start_time = time.time()

    try:
        from app.agent.context_engine import pack_context_messages

        agent = get_agent_executor(model_name=model_name)

        messages = pack_context_messages(
            user_message=user_message,
            history_messages=history_messages,
        )

        inputs = {"messages": messages}


        async for event in agent.astream_events(inputs, version="v2"):
            kind = event["event"]
            if kind == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                if chunk.content:
                    content_obj = chunk.content
                    text_val = ""
                    if isinstance(content_obj, str):
                        text_val = content_obj
                    elif isinstance(content_obj, list):
                        text_parts = []
                        for item in content_obj:
                            if isinstance(item, str):
                                text_parts.append(item)
                            elif isinstance(item, dict):
                                text_parts.append(item.get("text", ""))
                            elif hasattr(item, "text"):
                                text_parts.append(str(getattr(item, "text", "")))
                        text_val = "".join(text_parts)
                    else:
                        text_val = str(content_obj)

                    if text_val:
                        yield {
                            "type": "text_chunk",
                            "text": text_val,
                        }
            elif kind == "on_tool_start":
                tool_name = event["name"]
                tool_args = event["data"].get("input", {})
                yield {
                    "type": "tool_start",
                    "tool_name": tool_name,
                    "arguments_json": str(tool_args),
                }
            elif kind == "on_tool_end":
                tool_name = event["name"]
                tool_output = event["data"].get("output", "")
                exec_time = int((time.time() - start_time) * 1000)

                output_str = str(tool_output)
                yield {
                    "type": "tool_end",
                    "tool_name": tool_name,
                    "output_json": output_str,
                    "execution_time_ms": exec_time,
                }

                if tool_name == "recommend_portfolio_optimization":
                    try:
                        import json
                        parsed = json.loads(output_str)
                        yield {
                            "type": "hrp_result",
                            "symbols": parsed.get("symbols", []),
                            "weights": [float(w) for w in parsed.get("weights", [])],
                            "summary_notes": parsed.get("notes", ""),
                        }
                    except Exception:
                        pass
                elif tool_name == "get_price_history_chart_data":
                    try:
                        import json
                        parsed = json.loads(output_str)
                        yield {
                            "type": "price_chart",
                            "symbol": parsed.get("symbol", ""),
                            "points": parsed.get("points", []),
                            "period": parsed.get("period", ""),
                        }
                    except Exception:
                        pass
                elif tool_name == "get_quarterly_growth_chart_data":
                    try:
                        import json
                        parsed = json.loads(output_str)
                        yield {
                            "type": "growth_chart",
                            "symbol": parsed.get("symbol", ""),
                            "quarters": parsed.get("quarters", []),
                            "revenue": [float(v) for v in parsed.get("revenue", [])],
                            "net_income": [float(v) for v in parsed.get("net_income", [])],
                            "yoy_growth_pct": [float(v) for v in parsed.get("yoy_growth_pct", [])],
                            "qoq_growth_pct": [float(v) for v in parsed.get("qoq_growth_pct", [])],
                        }
                    except Exception:
                        pass
                elif tool_name == "get_analyst_target_chart_data":
                    try:
                        import json
                        parsed = json.loads(output_str)
                        yield {
                            "type": "analyst_chart",
                            "symbol": parsed.get("symbol", ""),
                            "dates": parsed.get("dates", []),
                            "target_prices": [float(v) for v in parsed.get("target_prices", [])],
                            "firms": parsed.get("firms", []),
                            "current_price": float(parsed.get("current_price", 0.0)),
                        }
                    except Exception:
                        pass
                elif tool_name == "get_fii_dii_flows":
                    try:
                        import json
                        parsed = json.loads(output_str)
                        yield {
                            "type": "fii_dii_chart",
                            "dates": parsed.get("dates", []),
                            "fii_net_cr": [float(v) for v in parsed.get("fii_net_cr", [])],
                            "dii_net_cr": [float(v) for v in parsed.get("dii_net_cr", [])],
                        }
                    except Exception:
                        pass
    except Exception as e:
        err_str = str(e)
        if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
            friendly_err = "⚠️ Google Gemini API Quota Exceeded (429 Rate Limit). Please wait 30 seconds before sending another message."
        else:
            friendly_err = f"Agent Execution Note: {err_str}"

        yield {
            "type": "error_message",
            "error": friendly_err,
        }

    yield {"type": "is_finished", "finished": True}
