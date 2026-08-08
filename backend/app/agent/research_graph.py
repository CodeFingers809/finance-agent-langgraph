"""
Research mode graph for finance-harness: 4-analyst parallel-eligible StateGraph.

Analyst personas run sequentially; each executes one ReAct pass with tools.
Aggregator synthesizes all reports into final markdown.

Streaming yields research_stage_update events for each node + text_chunk for synthesis.
"""

import json
import logging
from typing import Any, AsyncGenerator, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, END

from app.agent.graph import get_agent_executor
from app.agent.tools import ALL_FINANCIAL_TOOLS

logger = logging.getLogger(__name__)


class ResearchGraphState(TypedDict):
    """
    Shared state across all analyst nodes and aggregator.
    
    Fields:
    - user_query: Original query from user
    - messages: Full message history (HumanMessage, AIMessage, SystemMessage)
    - analyst_reports: Dict mapping analyst role to structured JSON report
    - final_synthesis: Markdown synthesis from aggregator
    """
    user_query: str
    messages: list[HumanMessage | AIMessage | SystemMessage]
    analyst_reports: dict[str, str]
    final_synthesis: str


# ============================================================================
# SYSTEM PROMPTS (Indian Stock Market Context)
# ============================================================================

SHORT_TERM_SYSTEM_PROMPT = """
You are a short-term technical analyst specializing in Indian equity markets (NSE/BSE).

Your role is to identify technical patterns, momentum signals, and price action catalysts 
over a 3-6 month horizon. Use tools to fetch current prices, technical indicators (MA, MACD, RSI, 
Bollinger Bands, Volume Surge), and recent news to justify your view.

Focus on:
- EMA crossovers and trend alignment (20/50/200 day)
- RSI extremes (oversold/overbought) and momentum reversals
- MACD divergences and trend confirmation
- Volume surge patterns and institutional flows
- Near-term support/resistance levels
- Recent sector news and market sentiment

Provide findings in JSON: {"role": "short_term", "findings": "...", "key_metrics": "..."}
"""

LONG_TERM_SYSTEM_PROMPT = """
You are a fundamental analyst focusing on 5+ year wealth creation in Indian equities.

Your role is to assess business quality, earnings growth durability, and shareholder returns 
(capital appreciation + dividends). Use tools to fetch quarterly financials, P/E trends, 
dividend history, and peer comparisons.

Focus on:
- Revenue and EBITDA growth trajectory (3Y CAGR)
- Profitability metrics (Net Margin, ROE, ROIC trends)
- P/E valuation relative to growth (PEG ratio concept)
- Dividend yield history and payout ratio sustainability
- Competitive moat and industry positioning
- Balance sheet strength (debt-to-equity, interest coverage)
- Management quality and capital allocation track record

Provide findings in JSON: {"role": "long_term", "findings": "...", "key_metrics": "..."}
"""

HIGH_RISK_SYSTEM_PROMPT = """
You are a risk analyst specializing in downside scenarios and volatility exposure in Indian stocks.

Your role is to identify tail risks, sector cyclicality, geopolitical exposure, and short-term 
catalysts that could trigger sharp drawdowns. Use tools to analyze volatility, sector headwinds, 
regulatory risks, and recent negative news.

Focus on:
- 52-week volatility and drawdown history
- Sector cyclicality and macro sensitivity (interest rates, rupee, crude oil)
- Regulatory and compliance risks (GST, labor laws, environmental)
- Key man risk and promoter lock-in structures
- Currency and commodity exposure (rupee depreciation, commodity inflation)
- Debt refinancing risk and interest rate sensitivity
- Recent short reports or analyst downgrades

Provide findings in JSON: {"role": "high_risk", "findings": "...", "key_metrics": "..."}
"""

LOW_RISK_SYSTEM_PROMPT = """
You are a conservative portfolio analyst focused on capital preservation and low-volatility strategies.

Your role is to identify defensive stocks with stable earnings, strong cash flows, and minimal 
drawdown exposure. Use tools to assess consistency, dividend safety, and economic moat depth.

Focus on:
- Revenue and earnings consistency (low coefficient of variation)
- Free cash flow generation and conversion ratio
- Dividend history (years of payment, coverage ratio)
- Beta and correlation to broader market indices
- Business model stickiness (recurring revenue, contracts, brand moat)
- Debt maturity profile and refinancing risk
- Historical recovery post-market crashes
- Sector defensiveness (consumption staples, utilities, pharma)

Provide findings in JSON: {"role": "low_risk", "findings": "...", "key_metrics": "..."}
"""


# ============================================================================
# LATEX UTILITIES
# ============================================================================

def escape_latex_special_chars(text: str) -> str:
    """
    Escape LaTeX-incompatible Unicode characters for KaTeX rendering.
    
    Handles:
    - ₹ (Rupee symbol U+20B9) → ₹ (literal in text mode) or \text{₹} in math
    - Other special financial symbols
    
    Strategy: Replace ₹ with \text{₹} in LaTeX math contexts, or just keep as-is in markdown.
    For safety in KaTeX, wrap rupee amounts in \text{} when in equations.
    """
    # Replace rupee symbol with \text{₹} to use text font (supports Unicode)
    # This works in both inline and display math in KaTeX
    text = text.replace("₹", r"\text{₹}")
    
    return text


# ============================================================================
# ANALYST NODES (Sequential Execution, One ReAct Pass Each)
# ============================================================================

async def short_term_analyst_node(state: ResearchGraphState) -> ResearchGraphState:
    """
    Short-term technical analyst node.
    
    - Receives user_query + message history
    - Runs ONE ReAct pass (no looping)
    - Extracts JSON output and updates analyst_reports["short_term"]
    """
    user_query = state["user_query"]
    messages = state["messages"]
    
    # Construct message list for agent: system + history + new user context
    agent_messages = [
        SystemMessage(content=SHORT_TERM_SYSTEM_PROMPT),
        *messages,
        HumanMessage(content=f"Analyze for short-term (3-6 month) outlook: {user_query}"),
    ]
    
    # Get agent executor and run ONE pass
    agent = get_agent_executor(model_name="gemini-2.5-flash")
    agent_input = {"messages": agent_messages}
    
    # Stream events and collect final output
    final_text = ""
    async for event in agent.astream_events(agent_input, version="v2"):
        kind = event.get("event", "")
        if kind == "on_chat_model_stream":
            chunk = event.get("data", {}).get("chunk")
            if chunk and hasattr(chunk, "content") and chunk.content:
                if isinstance(chunk.content, str):
                    final_text += chunk.content
    
    # Parse JSON from final output (analyst should return JSON per prompt)
    try:
        report = json.loads(final_text) if final_text.strip().startswith("{") else {
            "role": "short_term",
            "findings": final_text,
            "key_metrics": "",
        }
    except json.JSONDecodeError:
        report = {
            "role": "short_term",
            "findings": final_text,
            "key_metrics": "",
        }
    
    # Update state
    state["analyst_reports"]["short_term"] = json.dumps(report)
    return state


async def long_term_analyst_node(state: ResearchGraphState) -> ResearchGraphState:
    """Long-term fundamental analyst node."""
    user_query = state["user_query"]
    messages = state["messages"]
    
    agent_messages = [
        SystemMessage(content=LONG_TERM_SYSTEM_PROMPT),
        *messages,
        HumanMessage(content=f"Analyze for long-term (5+ year) wealth creation: {user_query}"),
    ]
    
    agent = get_agent_executor(model_name="gemini-2.5-flash")
    agent_input = {"messages": agent_messages}
    
    final_text = ""
    async for event in agent.astream_events(agent_input, version="v2"):
        kind = event.get("event", "")
        if kind == "on_chat_model_stream":
            chunk = event.get("data", {}).get("chunk")
            if chunk and hasattr(chunk, "content") and chunk.content:
                if isinstance(chunk.content, str):
                    final_text += chunk.content
    
    try:
        report = json.loads(final_text) if final_text.strip().startswith("{") else {
            "role": "long_term",
            "findings": final_text,
            "key_metrics": "",
        }
    except json.JSONDecodeError:
        report = {
            "role": "long_term",
            "findings": final_text,
            "key_metrics": "",
        }
    
    state["analyst_reports"]["long_term"] = json.dumps(report)
    return state


async def high_risk_analyst_node(state: ResearchGraphState) -> ResearchGraphState:
    """High-risk/volatility analyst node."""
    user_query = state["user_query"]
    messages = state["messages"]
    
    agent_messages = [
        SystemMessage(content=HIGH_RISK_SYSTEM_PROMPT),
        *messages,
        HumanMessage(content=f"Identify downside risks and volatility exposure: {user_query}"),
    ]
    
    agent = get_agent_executor(model_name="gemini-2.5-flash")
    agent_input = {"messages": agent_messages}
    
    final_text = ""
    async for event in agent.astream_events(agent_input, version="v2"):
        kind = event.get("event", "")
        if kind == "on_chat_model_stream":
            chunk = event.get("data", {}).get("chunk")
            if chunk and hasattr(chunk, "content") and chunk.content:
                if isinstance(chunk.content, str):
                    final_text += chunk.content
    
    try:
        report = json.loads(final_text) if final_text.strip().startswith("{") else {
            "role": "high_risk",
            "findings": final_text,
            "key_metrics": "",
        }
    except json.JSONDecodeError:
        report = {
            "role": "high_risk",
            "findings": final_text,
            "key_metrics": "",
        }
    
    state["analyst_reports"]["high_risk"] = json.dumps(report)
    return state


async def low_risk_analyst_node(state: ResearchGraphState) -> ResearchGraphState:
    """Low-risk/defensive analyst node."""
    user_query = state["user_query"]
    messages = state["messages"]
    
    agent_messages = [
        SystemMessage(content=LOW_RISK_SYSTEM_PROMPT),
        *messages,
        HumanMessage(content=f"Identify defensive characteristics and capital preservation attributes: {user_query}"),
    ]
    
    agent = get_agent_executor(model_name="gemini-2.5-flash")
    agent_input = {"messages": agent_messages}
    
    final_text = ""
    async for event in agent.astream_events(agent_input, version="v2"):
        kind = event.get("event", "")
        if kind == "on_chat_model_stream":
            chunk = event.get("data", {}).get("chunk")
            if chunk and hasattr(chunk, "content") and chunk.content:
                if isinstance(chunk.content, str):
                    final_text += chunk.content
    
    try:
        report = json.loads(final_text) if final_text.strip().startswith("{") else {
            "role": "low_risk",
            "findings": final_text,
            "key_metrics": "",
        }
    except json.JSONDecodeError:
        report = {
            "role": "low_risk",
            "findings": final_text,
            "key_metrics": "",
        }
    
    state["analyst_reports"]["low_risk"] = json.dumps(report)
    return state


# ============================================================================
# AGGREGATOR NODE
# ============================================================================

async def synthesize_reports(state: ResearchGraphState) -> ResearchGraphState:
    """
    Synthesize all 4 analyst reports into a single hedge-fund-style markdown report.
    
    - Reads analyst_reports dict (all 4 perspectives)
    - Constructs synthesis prompt
    - Runs LLM once (no tools) to generate final markdown
    - Updates state.final_synthesis
    """
    analyst_reports = state["analyst_reports"]
    
    # Extract findings from each analyst
    short_term_findings = ""
    long_term_findings = ""
    high_risk_findings = ""
    low_risk_findings = ""
    
    try:
        short_term_findings = json.loads(analyst_reports.get("short_term", "{}")).get("findings", "")
    except (json.JSONDecodeError, TypeError):
        short_term_findings = analyst_reports.get("short_term", "")
    
    try:
        long_term_findings = json.loads(analyst_reports.get("long_term", "{}")).get("findings", "")
    except (json.JSONDecodeError, TypeError):
        long_term_findings = analyst_reports.get("long_term", "")
    
    try:
        high_risk_findings = json.loads(analyst_reports.get("high_risk", "{}")).get("findings", "")
    except (json.JSONDecodeError, TypeError):
        high_risk_findings = analyst_reports.get("high_risk", "")
    
    try:
        low_risk_findings = json.loads(analyst_reports.get("low_risk", "{}")).get("findings", "")
    except (json.JSONDecodeError, TypeError):
        low_risk_findings = analyst_reports.get("low_risk", "")
    
    synthesis_prompt = f"""
You are synthesizing a hedge-fund-style equity research report from four specialist analysts.

SHORT-TERM (3-6 Month) Outlook:
{short_term_findings}

LONG-TERM (5+ Year) Outlook:
{long_term_findings}

HIGH-RISK / VOLATILITY Perspective:
{high_risk_findings}

LOW-RISK / DEFENSIVE Perspective:
{low_risk_findings}

---

Create a SINGLE cohesive markdown report with:
1. **Executive Summary** - 2-3 sentence investment thesis
2. **Short-Term Analysis** - Technical patterns, momentum, near-term catalysts
3. **Long-Term Analysis** - Business quality, growth durability, moat assessment
4. **Risk Assessment** - Downside scenarios, volatility, key man risks
5. **Defensive Qualities** - Earnings stability, dividend safety, drawdown resilience
6. **Final Recommendation** - BUY / HOLD / REDUCE with conviction level (1-10) and target horizon

Tone: Professional, data-driven, actionable. Assume reader is hedge fund PM with strong 
financial background. No jargon without explanation.
"""
    
    # Get LLM executor using Gemini
    from app.core.config import settings
    import os
    from langchain_google_genai import ChatGoogleGenerativeAI
    
    gem_key = settings.GEMINI_API_KEY or os.getenv("GEMINI_API_KEY", "demo_placeholder_key")
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=gem_key,
        temperature=0.3,
        streaming=True,
    )

    
    # Run synthesis (single pass, no tool use)
    synthesis_text = ""
    for chunk in llm.stream(synthesis_prompt):
        if chunk and hasattr(chunk, "content"):
            content = chunk.content
            if isinstance(content, str):
                synthesis_text += content
    
    # Apply LaTeX escaping for KaTeX compatibility
    synthesis_text = escape_latex_special_chars(synthesis_text)
    
    state["final_synthesis"] = synthesis_text
    return state


# ============================================================================
# BUILD GRAPH
# ============================================================================

def build_research_graph():
    """
    Construct StateGraph: short_term → long_term → high_risk → low_risk → synthesize → END
    
    Returns:
    - Compiled graph ready for astream_events()
    """
    graph = StateGraph(ResearchGraphState)
    
    # Add nodes
    graph.add_node("short_term_analyst", short_term_analyst_node)
    graph.add_node("long_term_analyst", long_term_analyst_node)
    graph.add_node("high_risk_analyst", high_risk_analyst_node)
    graph.add_node("low_risk_analyst", low_risk_analyst_node)
    graph.add_node("synthesize", synthesize_reports)
    
    # Add edges (sequential pipeline)
    graph.set_entry_point("short_term_analyst")
    graph.add_edge("short_term_analyst", "long_term_analyst")
    graph.add_edge("long_term_analyst", "high_risk_analyst")
    graph.add_edge("high_risk_analyst", "low_risk_analyst")
    graph.add_edge("low_risk_analyst", "synthesize")
    graph.add_edge("synthesize", END)
    
    # Compile
    return graph.compile()


# ============================================================================
# PUBLIC API: stream_agent_events_research
# ============================================================================

async def stream_agent_events_research(
    user_query: str,
    model_name: str = "gemini-2.5-flash",
) -> AsyncGenerator[dict, None]:

    """
    Stream research mode events for a given query.
    
    Yields:
    - {"type": "research_stage_update", "stage": "short_term_analyst", "status": "running"}
    - {"type": "research_stage_update", "stage": "short_term_analyst", "status": "complete"}
    - ... (for each analyst node)
    - {"type": "text_chunk", "text": "..."} (final synthesis streaming)
    - {"type": "is_finished", "finished": True} (end marker)
    
    Args:
        user_query: User's research question
        model_name: LLM model to use (default: gpt-5.6-luna)
    
    Yields:
        Event dicts with streaming updates
    """
    try:
        # Initialize state
        initial_state: ResearchGraphState = {
            "user_query": user_query,
            "messages": [HumanMessage(content=user_query)],
            "analyst_reports": {
                "short_term": "",
                "long_term": "",
                "high_risk": "",
                "low_risk": "",
            },
            "final_synthesis": "",
        }
        
        # Build and compile graph
        compiled_graph = build_research_graph()
        
        # Stream events from graph execution
        analyst_stages = [
            "short_term_analyst",
            "long_term_analyst",
            "high_risk_analyst",
            "low_risk_analyst",
        ]
        
        # Track which stages have been announced
        announced_stages = set()
        
        async for event in compiled_graph.astream_events(initial_state, version="v2"):
            kind = event.get("event", "")
            
            # Announce node execution start
            if kind == "on_chain_start":
                node_name = event.get("name", "")
                if node_name in analyst_stages and node_name not in announced_stages:
                    announced_stages.add(node_name)
                    yield {
                        "type": "research_stage_update",
                        "stage": node_name,
                        "status": "running",
                    }
            
            # Announce node completion
            elif kind == "on_chain_end":
                node_name = event.get("name", "")
                if node_name in analyst_stages:
                    yield {
                        "type": "research_stage_update",
                        "stage": node_name,
                        "status": "complete",
                    }
            
            # Stream synthesis text chunks
            elif kind == "on_chat_model_stream" and event.get("name") == "ChatOpenAI":
                chunk = event.get("data", {}).get("chunk")
                if chunk and hasattr(chunk, "content") and chunk.content:
                    if isinstance(chunk.content, str):
                        yield {
                            "type": "text_chunk",
                            "text": chunk.content,
                        }
        
        # Final marker
        yield {"type": "is_finished", "finished": True}
    
    except Exception as e:
        logger.exception("Research graph execution error")
        yield {
            "type": "error_message",
            "error": f"Research graph error: {str(e)}",
        }
        yield {"type": "is_finished", "finished": True}
