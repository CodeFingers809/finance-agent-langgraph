# CFA Financial Agent & Portfolio Optimization Engine

A full-stack AI financial analyst and portfolio management system built with LangGraph, FastAPI, and React. The system combines LLM reasoning (Google Gemini) with deterministic quantitative tools to perform stock screening, deep fundamental research, technical indicator analysis, portfolio metrics evaluation, and Hierarchical Risk Parity (HRP) allocation.

---

## What this actually is

This application is an interactive research assistant for financial analysis and portfolio management. Instead of relying on an LLM to calculate financial math (which leads to hallucinated numbers), the agent delegates all numeric processing, indicators, metrics, and matrix factorizations to deterministic Python routines (using `yfinance`, `pandas`, `numpy`, and `scipy`). The LLM is used strictly for intent classification, tool routing, dynamic research synthesis, and natural language reporting.

The system features real-time Server-Sent Events (SSE) streaming, persistent tool execution timelines, tree-based chat branching, and hybrid context management designed to preserve historical context without exceeding LLM context windows.

---

## Core Features

### 1. Stock Screening
- Filter equities across broad markets based on customizable parameters (e.g., market capitalization, P/E ratios, sector filters, dividend yield, and price momentum).

### 2. In-Depth Stock Research
- **Fundamental Data**: Retrieves real-time stock quotes, quarterly balance sheets, income statements, cash flow statements, corporate filings, press releases, and SEC announcements.
- **Analyst Insights & Peers**: Gathers analyst consensus recommendations, target price medians, and automated peer comparison matrices.
- **Technical Analysis**: Computes 20/50/200 Exponential Moving Averages (EMAs), EMA trend alignment, MACD (12, 26, 9) crossovers, RSI (14) momentum, 20-day Volume Surge ratios ($>1.5\times$ average), and Bollinger Bands ($\%B$). Results are passed to the agent as pure structured JSON metrics.

### 3. Portfolio Analysis & Performance Tracking
- Evaluates multi-asset portfolios against benchmark indices (e.g., Nifty 50, S&P 500).
- Computes standard quantitative risk and return metrics: CAGR, Sharpe Ratio, Sortino Ratio, Portfolio Alpha, and Beta.
- Generates actionable rebalancing and asset allocation recommendations based on current market metrics.

### 4. Watchlist Management
- Create, view, update, and manage custom watchlists with real-time price tracking and quote updates.

### 5. Chat Branching
- Branch out from any historical message turn to fork a conversation into an isolated child tree.
- Enables exploring alternative hypothetical scenarios (e.g., "What if I reallocated 20% to FMCG stocks instead?") without polluting the main conversation history.

### 6. Hybrid Context Engine (Unlimited Context Architecture)
- Combines three complementary strategies to handle long conversation threads efficiently:
  - **Sliding Window**: Retains recent active message turns for immediate conversational flow.
  - **BM25 Lexical Search**: Queries past turns using BM25 keyword matching to retrieve relevant historical facts when referenced later.
  - **Recursive Summarization**: Periodically condenses older dialogue turns into a persistent summary node injected into system context.

### 7. Broader Market News Feed
- Aggregates market-wide financial news, macroeconomic updates, and sector trends for broad situational awareness.

### 8. Hierarchical Risk Parity (HRP) Portfolio Optimization
- Constructs risk-optimal portfolios using graph-based Hierarchical Risk Parity clustering (`scipy.cluster.hierarchy`).
- Avoids matrix inversion instabilities present in traditional Markowitz Mean-Variance Optimization, delivering robust asset weights during volatile market conditions.

---

## Architecture & Technical Choices

### LangGraph Agentic Pipeline
- **State Graph Workflow**: Built on `langgraph`, maintaining an explicit execution graph over conversation history, tool calls, and model outputs.
- **Streaming Tool Events**: Streams intermediate execution steps (e.g., `run_technical_analysis`, `search_stock_news`) to the frontend over Server-Sent Events (SSE), keeping tool status indicators open across sequential tool runs.

### Math vs. LLM Separation
- **Deterministic Math**: All financial formulas, moving averages, risk ratios, and matrix calculations run strictly in standard Python runtime (`numpy`, `pandas`, `scipy`).
- **Structured Tool Returns**: Tools output clean JSON strings directly to the model, preventing raw chart hallucination or context window bloat.

### Security, Rate Limiting & Auth
- **JWT Authentication**: Password hashing using Argon2id (`passlib` + `argon2-cffi`) and OAuth2 bearer tokens.
- **Rate Limiting**: IP and endpoint rate limits enforced via `SlowAPI`. Dual-tier daily model quotas (10 requests/day for standard tier, 999/day for superusers). Research Mode uses strict 1 report/day per user cap (independent of chat quotas).
- **Security Headers Middleware**: Enforces `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection`, `Referrer-Policy`, and `Content-Security-Policy`.
- **Parameterized SQL**: All database operations use `SQLModel` / `SQLAlchemy` ORM parameterization, eliminating SQL injection vectors.

### Research Mode (Multi-Analyst Hedge Fund Architecture)
- **Exclusive to GPT-5.6 Luna**: Granular LangGraph StateGraph with 4 specialist analyst personas (short-term technical, long-term fundamental, high-risk/volatility, low-risk/defensive).
- **Strict Daily Quota**: 1 research report per user per day (independent of standard/upgraded chat quotas).
- **Multi-Tool Analysis**: Each analyst runs financial tools in parallel (price metrics, technicals, fundamentals, web search) to inform specialized perspective.
- **Structured Output**: Final synthesis as detailed markdown report with labeled analyst perspectives, key risk/opportunity highlights, and actionable recommendation with conviction level.
- **Sequential Execution**: 4 analyst nodes run sequentially (~30s each), aggregator synthesizes final report (~15s). Parallelizable via `asyncio.gather()` for future optimization.

### Production Storage & Persistence
- **SQLite WAL Mode**: SQLite embedded database using Write-Ahead Logging for non-blocking concurrent reads.
- **Host Volume Mounting**: Database file is mapped to a host volume (`-v /home/ec2-user/finance-agent/data:/app/backend/data`), guaranteeing zero data loss across container updates or service restarts.

---

## Tech Stack

### Backend
- **Framework**: Python 3.14, FastAPI, Pydantic v2
- **Agent Orchestration**: LangGraph, LangChain Core
- **LLM Providers**: Google Gemini 2.5 Flash / Pro (`google-genai`), OpenAI GPT-5.6 Luna (`langchain-openai`)
- **Document Parsing**: LLama-Index Core + Web Readers (`llama-index-core`, `llama-index-readers-web`)
- **Web Search**: DuckDuckGo wrapper (`duckduckgo-search`) - unofficial, zero-cost, unofficial risk
- **Observability**: LangSmith tracing + evaluation (`langsmith`)
- **Scientific Computing**: SymPy for symbolic math (`sympy`)
- **Database & ORM**: SQLModel (SQLAlchemy) over SQLite
- **Financial Data & Math**: `yfinance`, `pandas`, `numpy`, `scipy`
- **Security & Rate Limiting**: Argon2id, PyJWT, SlowAPI

### Frontend
- **Framework**: React 19, TypeScript, Vite
- **Routing & State**: TanStack Router (`@tanstack/react-router`), TanStack Query (`@tanstack/react-query`)
- **Styling & UI**: TailwindCSS v4, Lucide React, Radix UI primitives
- **Rendering & Math**: `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex` (KaTeX inline/block LaTeX formulas)

### Infrastructure & Deployment
- **Containerization**: Multi-stage Docker build with `bun` frontend compilation and `uv` Python environment sync.
- **Cloud Host**: AWS EC2 (Amazon Linux) with Nginx reverse proxy and Let's Encrypt TLS/SSL termination (`https://finance-agent.brnch.in`).

---

## Running It

### Prerequisites
- **Python**: 3.11+ (managed via `uv` or `venv`)
- **Node.js**: v18+ and `bun` / `npm`
- **Gemini API Key** (standard chat): Obtainable from [Google AI Studio](https://aistudio.google.com)
- **OpenAI API Key** (research mode): Obtainable from [OpenAI Platform](https://platform.openai.com/account/api-keys) (optional, required only for Research Mode with GPT-5.6 Luna)

---

### 1. Local Development Setup

#### Backend
1. Clone the repository and navigate to the backend directory:
   ```bash
   git clone git@github.com:CodeFingers809/cfa-agent-langgraph.git
   cd cfa-agent-langgraph/backend
   ```

2. Create a virtual environment and install dependencies:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -e .
   ```

3. Configure environment variables in `.env` (or copy from `.env.example`):
   ```bash
   cp ../.env.example .env
   ```
   Set `GEMINI_API_KEY=your_actual_api_key`.

4. Start the FastAPI development server:
   ```bash
   fastapi dev app/main.py --port 8000
   ```
   The API will be live at `http://localhost:8000`. Interactive docs are available at `http://localhost:8000/docs`.

#### Frontend
1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```

2. Install dependencies and start the Vite dev server:
   ```bash
   npm install
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

---

### 2. Docker Setup (Local Container Run)

Build and run the unified single-container image (serves frontend static assets + FastAPI API server):

```bash
# Build multi-stage Docker image
docker build -t finance-agent -f backend/Dockerfile .

# Create a local data folder for persistent storage
mkdir -p ./data

# Run container with environment file and volume mount
docker run -d \
  --name finance-agent-app \
  -p 8000:8000 \
  -v $(pwd)/data:/app/backend/data \
  --env-file .env \
  finance-agent
```

Access the app at `http://localhost:8000`.

---

### 3. Production EC2 & Nginx Deployment

#### A. Host Environment Setup
On the target EC2 instance:
```bash
# Install Docker and Nginx
sudo dnf install -y docker nginx certbot python3-certbot-nginx
sudo systemctl enable --now docker nginx

# Create deployment directory
mkdir -p /home/ec2-user/finance-agent/data
cd /home/ec2-user/finance-agent
git clone git@github.com:CodeFingers809/cfa-agent-langgraph.git .
```

#### B. Create Production `.env`
Create `/home/ec2-user/finance-agent/.env`:
```env
DOMAIN=finance-agent.brnch.in
FRONTEND_HOST=https://finance-agent.brnch.in
ENVIRONMENT=production

PROJECT_NAME="Finance Agent"
SECRET_KEY="generate_secure_random_key_here"

FIRST_SUPERUSER=aldbha123@gmail.com
FIRST_SUPERUSER_PASSWORD=4^.Y8jrJ-%-Tctb

GEMINI_API_KEY=your_gemini_api_key
DATABASE_URL=sqlite:///data/app.db
BACKEND_CORS_ORIGINS="https://finance-agent.brnch.in,http://finance-agent.brnch.in"
```

#### C. Build & Launch Container
```bash
sudo docker build -t finance-agent -f backend/Dockerfile .
sudo docker rm -f finance-agent-app 2>/dev/null || true

sudo docker run -d \
  --name finance-agent-app \
  --restart always \
  -p 8000:8000 \
  -v /home/ec2-user/finance-agent/data:/app/backend/data \
  --env-file /home/ec2-user/finance-agent/.env \
  finance-agent
```

#### D. Nginx SSL Reverse Proxy Config
Create `/etc/nginx/conf.d/finance-agent.conf`:
```nginx
server {
    server_name finance-agent.brnch.in;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable buffering for real-time SSE streaming
        proxy_buffering off;
        proxy_cache off;
    }
}
```

Obtain Let's Encrypt SSL certificate:
```bash
sudo certbot --nginx -d finance-agent.brnch.in --non-interactive --agree-tos -m aldbha123@gmail.com
sudo systemctl reload nginx
```

---

## License

MIT License. Free for personal research, educational, and quantitative exploration.
