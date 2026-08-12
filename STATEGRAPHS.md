# Agent Execution Architecture & State Graphs

This document details the execution flow and architecture of the main chat agent and research mode agent in `finance-harness`.

---

## 1. Main Chat Agent (`backend/app/agent/graph.py`)

The main chat agent is built using LangGraph's prebuilt `create_react_agent`. It runs a ReAct (Reason + Act) loop streamed via `astream_events`.

### Mermaid Diagram

```mermaid
flowchart TD
    START([START]) --> AgentNode["agent (LLM Call)"]
    AgentNode --> Decision{"Tool Calls Requested?"}
    Decision -- "Yes" --> ToolsNode["tools (Parallel Execution)"]
    ToolsNode --> AgentNode
    Decision -- "No" --> END([END])
```

---

## 2. Research Mode (`backend/app/agent/research_graph.py`)

Research mode is **not** a LangGraph `StateGraph`. It is implemented as an imperative `while` loop that handles iterative planning, parallel tool execution, memory consolidation, rate-limit pacing, and final synthesis streaming.

### Mermaid Diagram

```mermaid
flowchart TD
    START([START]) --> InitVars["Initialize State<br/>(iteration = 1, max_iterations = 2, is_satisfied = False)"]
    InitVars --> LoopCheck{"iteration <= 2 AND<br/>not is_satisfied?"}

    LoopCheck -- "Yes" --> PlannerLLM["Planner LLM<br/>(PLANNER_SYSTEM_PROMPT + Memory)"]
    PlannerLLM --> ParseJSON["Parse JSON Decision<br/>(is_satisfied, reasoning, tool_calls)"]
    ParseJSON --> CheckBreak{"is_satisfied (and iter > 1)<br/>OR no tool_calls?"}

    CheckBreak -- "Yes" --> SynthesisPhase
    CheckBreak -- "No" --> FanOut["Fan-Out: asyncio.gather<br/>(Execute 1-4 tools in parallel)"]

    FanOut --> FanIn["Fan-In: Consolidate outputs<br/>into gathered_context memory"]
    FanIn --> IncrementIter["Increment iteration<br/>(iteration += 1)"]
    IncrementIter --> PacingSleep["asyncio.sleep(6.1s)<br/>(10 RPM Rate-Limit Cap)"]
    PacingSleep --> LoopCheck

    LoopCheck -- "No" --> SynthesisPhase["Synthesis LLM Stream<br/>(Hedge-Fund Report Prompt)"]
    SynthesisPhase --> END([END])
```

