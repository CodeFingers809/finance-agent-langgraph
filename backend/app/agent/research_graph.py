"""
Iterative Deep Research Mode Engine for finance-harness.

Workflow:
1. Iterative Data Gathering Loop (Fan-Out & Fan-In):
   - LLM evaluates research progress and formulates 1-5 parallel tool calls.
   - Prompt mandates exhaustive research (industries, sub-industries, OEMs, financials, news).
   - Fan-out parallel execution of all tool calls.
   - Fan-in consolidation of tool outputs into cumulative research memory.
   - Repeats until LLM marks is_satisfied = True (or max depth 5 reached).
2. Final Report Generation:
   - Single LLM synthesis of accumulated research memory into a hedge-fund-grade report.
   - Escapes LaTeX special characters (e.g., ₹ -> \\text{₹}).
   - Streams real-time SSE events with detailed stage updates + synthesis text chunks.
"""

import asyncio
import ast
import base64
import json
import logging
import os
import re
import uuid
from datetime import UTC, datetime
from typing import Any, AsyncGenerator, TypedDict

from pydantic import SecretStr
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.agent.tools import ALL_FINANCIAL_TOOLS
from app.core.config import settings

logger = logging.getLogger(__name__)

# Map tool names to tool functions
TOOL_MAP = {tool.name: tool for tool in ALL_FINANCIAL_TOOLS}


def extract_plain_text_from_llm_content(content: Any) -> str:
    """Safely extract clean plain text from LLM response content (handling string, list of blocks, or stringified Python list)."""
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict) and part.get("type") == "text":
                parts.append(part.get("text", ""))
        text = "".join(parts) if parts else str(content)
    else:
        text = str(content)

    if text.startswith("[{'type':") or text.startswith('[{"type":'):
        try:
            parsed = ast.literal_eval(text)
            if isinstance(parsed, list):
                extracted = "".join(item.get("text", "") for item in parsed if isinstance(item, dict))
                if extracted:
                    return extracted
        except Exception:
            pass

    return text



def get_research_llm(model_name: str = "claude-haiku-4-5-20251001", temperature: float = 0.1):
    """
    Construct LLM for Research Mode supporting all 4 available models:
    - Claude 4.5 Haiku ('claude-haiku-4-5-20251001')
    - Gemini 3.5 Flash Lite ('gemini-3.5-flash-lite')
    - Gemini 3.5 Flash ('gemini-3.5-flash')
    - Gemini 2.5 Pro ('gemini-2.5-pro')
    """
    lower = (model_name or "").lower()

    # 1. Anthropic Claude 4.5 Haiku
    if "haiku" in lower or "claude" in lower or "anthropic" in lower:
        anthropic_key = settings.ANTHROPIC_API_KEY or os.getenv("ANTHROPIC_API_KEY")
        if anthropic_key:
            try:
                from langchain_anthropic import ChatAnthropic
                return ChatAnthropic(
                    model="claude-haiku-4-5-20251001",
                    api_key=SecretStr(anthropic_key),
                    temperature=temperature,
                    streaming=True,
                )
            except Exception as e:
                logger.warning(f"Failed to initialize ChatAnthropic: {e}. Falling back to Gemini.")

    # 2. Gemini Models
    gem_key = settings.GEMINI_API_KEY or os.getenv("GEMINI_API_KEY", "demo_placeholder_key")
    if "pro" in lower:
        gem_model = "gemini-2.5-pro"
    elif "lite" in lower:
        gem_model = "gemini-3.5-flash-lite"
    else:
        gem_model = "gemini-3.5-flash"

    from langchain_google_genai import ChatGoogleGenerativeAI
    return ChatGoogleGenerativeAI(
        model=gem_model,
        google_api_key=gem_key,
        temperature=temperature,
        streaming=True,
    )





PLANNER_SYSTEM_PROMPT = """
You are an advanced financial research strategist.

Your goal is to conduct EXHAUSTIVE research to answer the user's query thoroughly.


---

RULES FOR DATA GATHERING:
1. DO NOT STOP EARLY. You must gather comprehensive, multi-layered data.
2. For industry queries (e.g. defense, renewables, EMS, EV, pharma):
   - Identify primary sector catalysts and TAM (Total Addressable Market) projections.
   - Uncover all key sub-industries, tier-1 OEMs, component manufacturers, subsystem suppliers, and raw material providers.
   - Fetch stock prices, financial metrics, YoY/QoQ growth rates, and recent market news for top companies in those sub-industries.
3. Call chart tools (`get_price_history_chart_data`, `get_quarterly_growth_chart_data`, `get_analyst_target_chart_data`, `get_fii_dii_flows`) whenever relevant to generate interactive UI charts for stocks, earnings, targets, and institutional flows.
4. You can execute 1 to 4 tools in PARALLEL in each iteration.


---

AVAILABLE TOOLS:
- search_web_for_stock_info(query): Search DuckDuckGo web search for market news, industry reports, sub-industry OEMs, supply chain analysis.
- get_stock_prices_and_metrics(symbols): Fetch price, P/E, P/B, Market Cap, EV/EBITDA for symbols (e.g. ["HAL.NS", "BEL.NS", "DATAPATT.NS"]).
- get_financial_statements(symbol): Fetch annual/quarterly financials & YoY/QoQ growth rates.
- get_stock_news(symbol): Fetch latest news articles related to an Indian stock.
- get_analyst_predictions(symbol): Fetch analyst recommendations and target prices for an Indian stock.
- get_indian_indices(): Fetch major Indian market indices status (NIFTY 50, SENSEX, NIFTY BANK, NIFTY IT).
- run_technical_analysis(symbol): Fetch EMA crossovers, MACD, RSI, volume surges.
- screen_stocks(sector_or_theme): Screen top stocks in "defense", "it", "banking", "pharma", "renewable", "auto".
- recommend_portfolio_optimization(symbols): Perform HRP portfolio optimization for given stock symbols.
- get_market_news(): Broader market trends & news.
- get_user_portfolio(user_email_or_id): Fetch current user's saved portfolio holdings from database.
- create_user_watchlist(watchlist_name, symbols): Create a new custom watchlist.
- calculate_scientific_expression(expression): Scientific math & LaTeX formulas.
- get_price_history_chart_data(symbol, period): Fetch price history series for charts.
- get_quarterly_growth_chart_data(symbol): Fetch quarterly revenue & growth series for charts.
- get_analyst_target_chart_data(symbol): Fetch analyst target prices & firm recommendations for charts.
- get_fii_dii_flows(days): Fetch FII and DII net flow series in ₹ Cr.
- search_org_research_reports(query): Search saved internal organization research reports.

---

RESPONSE FORMAT (MUST BE VALID JSON ONLY):
{
  "is_satisfied": false,
  "reasoning": "Explain what data we currently have and what specific missing data we need next.",
  "tool_calls": [
    {
      "tool_name": "search_web_for_stock_info",
      "arguments": {"query": "Indian defense electronics component manufacturers supply chain"}
    },
    {
      "tool_name": "get_stock_prices_and_metrics",
      "arguments": {"symbols": ["BEL.NS", "DATAPATT.NS", "ASTRAMICRO.NS"]}
    }
  ]
}

If and ONLY IF you have gathered ALL required data (including primary industry, sub-industries, OEMs, stock metrics, and recent developments) across at least 2 gathering rounds, set "is_satisfied": true with "tool_calls": [].
"""


async def execute_tool_call_async(tool_name: str, args: dict[str, Any]) -> dict[str, Any]:
    """Execute a single tool call asynchronously with safe error handling."""
    tool_func = TOOL_MAP.get(tool_name)
    if not tool_func:
        return {
            "tool_name": tool_name,
            "status": "error",
            "output": f"Tool '{tool_name}' not found.",
        }
    
    try:
        # Run tool in threadpool if synchronous
        res = await asyncio.to_thread(tool_func.invoke, args)
        return {
            "tool_name": tool_name,
            "arguments": args,
            "status": "success",
            "output": str(res),
        }
    except Exception as e:
        logger.warning(f"Research tool '{tool_name}' execution error: {e}")
        return {
            "tool_name": tool_name,
            "arguments": args,
            "status": "error",
            "output": f"Execution error: {str(e)}",
        }


FRIENDLY_TOOL_NAMES = {
    "search_web_for_stock_info": "Web Search",
    "get_stock_prices_and_metrics": "Market Metrics",
    "get_financial_statements": "Financial Statements",
    "get_stock_news": "Stock News",
    "get_analyst_predictions": "Analyst Predictions",
    "get_indian_indices": "Indian Indices",
    "run_technical_analysis": "Technical Analysis",
    "screen_stocks": "Stock Screener",
    "recommend_portfolio_optimization": "Portfolio Optimization",
    "get_market_news": "Market News",
    "get_user_portfolio": "User Portfolio",
    "create_user_watchlist": "Watchlist Manager",
    "calculate_scientific_expression": "Scientific Calculator",
    "get_price_history_chart_data": "Price Chart",
    "get_quarterly_growth_chart_data": "Quarterly Growth Chart",
    "get_analyst_target_chart_data": "Analyst Target Chart",
    "get_fii_dii_flows": "FII/DII Flows",
    "search_org_research_reports": "Org Research Reports Memory",
}


async def stream_agent_events_research(
    user_query: str,
    model_name: str = "gemini-2.5-flash",
) -> AsyncGenerator[dict, None]:
    """
    Stream research mode events for an exhaustive data-gathering & synthesis workflow.
    
    Yields SSE event dicts:
    - {"type": "research_stage_update", "stage": "data_gathering", "iteration": 1, "status": "planning", "detail": "..."}
    - {"type": "text_chunk", "text": "..."}
    - {"type": "is_finished", "finished": True}
    """
    conv_id = str(uuid.uuid4())
    gathered_context: list[str] = []
    iteration = 1
    max_iterations = 2  # Capped at 2 data-gathering turns to strictly respect 10 RPM limit
    is_satisfied = False

    llm = get_research_llm(model_name=model_name, temperature=0.2)

    try:
        # =====================================================================
        # PHASE 1: ITERATIVE DATA GATHERING LOOP (FAN-OUT & FAN-IN)
        # =====================================================================
        while iteration <= max_iterations and not is_satisfied:
            yield {
                "type": "research_stage_update",
                "stage": "data_gathering",
                "iteration": iteration,
                "status": "planning",
                "detail": f"Iteration {iteration}/{max_iterations}: Planning research strategy & market queries...",
            }

            # Build planner message history
            context_summary = "\n\n".join(gathered_context) if gathered_context else "No data gathered yet."
            planner_input = [
                SystemMessage(content=PLANNER_SYSTEM_PROMPT),
                HumanMessage(
                    content=f"USER QUERY: {user_query}\n\n"
                            f"CURRENT GATHERED RESEARCH MEMORY (Iteration {iteration-1}):\n"
                            f"{context_summary}\n\n"
                            f"Evaluate current memory. Formulate next batch of parallel tool calls in valid JSON."
                ),
            ]

            # Run LLM Planner step
            planner_response = await llm.ainvoke(planner_input)
            response_text = extract_plain_text_from_llm_content(planner_response.content)

            # Parse JSON decision
            try:
                clean_json = response_text
                if clean_json.startswith("```"):
                    clean_json = clean_json.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
                decision = json.loads(clean_json)
            except Exception as pe:
                logger.warning(f"Planner response JSON parse error: {pe}. Response text: {response_text[:200]}")
                decision = {
                    "is_satisfied": iteration >= 2,
                    "reasoning": "Parsing fallback search",
                    "tool_calls": [
                        {
                            "tool_name": "search_web_for_stock_info",
                            "arguments": {"query": f"{user_query} India industry supply chain"}
                        }
                    ]
                }

            is_satisfied = decision.get("is_satisfied", False)
            tool_calls = decision.get("tool_calls", [])
            reasoning = decision.get("reasoning", "")

            if is_satisfied and iteration > 1:
                yield {
                    "type": "research_stage_update",
                    "stage": "data_gathering",
                    "iteration": iteration,
                    "status": "complete",
                    "detail": f"Iteration {iteration}/{max_iterations}: Data compilation complete. Proceeding to synthesis...",
                }
                break

            if not tool_calls:
                break

            # Sanitize tool names for user-facing detail string (never reveal raw function names)
            friendly_sources = [
                FRIENDLY_TOOL_NAMES.get(tc.get("tool_name", ""), "Market Source")
                for tc in tool_calls
            ]
            unique_sources_str = ", ".join(list(dict.fromkeys(friendly_sources)))

            yield {
                "type": "research_stage_update",
                "stage": "data_gathering",
                "iteration": iteration,
                "status": "executing",
                "detail": f"Iteration {iteration}/{max_iterations}: Gathering data from {len(tool_calls)} sources ({unique_sources_str})...",
            }

            # Fan-Out Parallel Tool Execution
            tasks = [
                execute_tool_call_async(tc.get("tool_name", ""), tc.get("arguments", {}))
                for tc in tool_calls
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            # Fan-In Data Consolidation
            iteration_summary_parts = [f"--- ITERATION {iteration} RESULT ({reasoning}) ---"]
            for r in results:
                if isinstance(r, dict):
                    t_name = r.get("tool_name")
                    t_args = r.get("arguments")
                    t_out = r.get("output")
                    iteration_summary_parts.append(
                        f"SOURCE: {FRIENDLY_TOOL_NAMES.get(t_name, t_name)} | ARGS: {json.dumps(t_args)}\nOUTPUT:\n{t_out}"
                    )
            
            gathered_context.append("\n".join(iteration_summary_parts))
            iteration += 1

            # Pacing delay to strictly respect 10 RPM limits (6.1 seconds per request)
            await asyncio.sleep(6.1)

        # =====================================================================
        # PHASE 2: FINAL REPORT SYNTHESIS (FAN-IN REPORT GENERATION)
        # =====================================================================
        yield {
            "type": "research_stage_update",
            "stage": "synthesis",
            "status": "generating",
            "detail": "Synthesizing comprehensive hedge-fund equity research report...",
        }


        full_gathered_data = "\n\n".join(gathered_context) if gathered_context else "No external data collected."

        synthesis_prompt = f"""
Provide a direct, comprehensive, and well-structured analytical response based strictly on all gathered research data.

USER QUERY:
{user_query}

ALL GATHERED RESEARCH DATA:
{full_gathered_data}

---

INSTRUCTIONS:
1. Jump STRAIGHT into the answer with clear, structured sections.
2. DO NOT include roleplay headers ("Chief Investment Officer", "HEDGE FUND-GRADE EQUITY RESEARCH REPORT", "Classification", "Prepared by", "Confidentiality").
3. DO NOT include artificial boilerplate disclaimers.
4. Use clean Markdown headers, bullet points, bold highlights, and Markdown tables.
5. Provide deep quantitative analysis covering market overview, TAM growth, sub-industry value chains, key stocks (with ticker symbols like HAL.NS, BEL.NS), valuation metrics (P/E, Market Cap), risks, and target portfolio allocations.
"""

        synth_llm = get_research_llm(model_name=model_name, temperature=0.2)
        
        # Stream synthesis chunks to frontend
        async for chunk in synth_llm.astream([HumanMessage(content=synthesis_prompt)]):
            if chunk and hasattr(chunk, "content") and chunk.content:
                text_piece = extract_plain_text_from_llm_content(chunk.content)
                yield {
                    "type": "text_chunk",
                    "text": text_piece,
                }


        yield {"type": "is_finished", "finished": True}

    except Exception as e:
        logger.exception("Research mode execution error")
        yield {
            "type": "error_message",
            "error": f"Research execution error: {str(e)}",
        }
        yield {"type": "is_finished", "finished": True}
