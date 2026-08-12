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

### 9. Research Report Generation & PDF Export
- Generates full structured research reports with executive summaries, technical charts, risks, and conviction levels.
- Supports client-side PDF export (`jspdf` + `html2canvas`) with clean font rendering, custom word spacing, and printable chart artifacts.

### 10. Hourly Quota & Rate Limiting System
- Enforces hourly rolling quota windows (`UserQuota`) to ensure fair API usage across standard and superuser tiers.
- Resets usage automatically on sliding hour intervals with clear feedback in user headers.

### 11. Real-Time Recharts Interactive Artifacts
- Streams interactive `Recharts` graphs (FII/DII institutional flows, stock price trajectories, revenue growth, analyst target price distributions) live over SSE tool calls.

### 12. Multi-Tenant Workspaces & Clerk Organization RBAC
- Enterprise organization management powered by Clerk Auth, supporting member invitations, workspace switching, and organization-scoped data isolation.

---

## Architecture & Technical Choices

### LangGraph Agentic Pipeline
- **State Graph Workflow**: Built on `langgraph`, maintaining an explicit execution graph over conversation history, tool calls, and model outputs.
- **Streaming Tool Events**: Streams intermediate execution steps (e.g., `run_technical_analysis`, `search_stock_news`) to the frontend over Server-Sent Events (SSE), keeping tool status indicators open across sequential tool runs.

### Math vs. LLM Separation
- **Deterministic Math**: All financial formulas, moving averages, risk ratios, and matrix calculations run strictly in standard Python runtime (`numpy`, `pandas`, `scipy`).
- **Structured Tool Returns**: Tools output clean JSON strings directly to the model, preventing raw chart hallucination or context window bloat.

### Security, Rate Limiting & Auth
- **Clerk Authentication & RBAC**: Integrated Clerk identity management (`@clerk/react` + `clerk-backend-api` JWT session verification), replacing legacy password hashing with secure multi-tenant auth.
- **Rate Limiting & Quotas**: Hourly sliding window quota tracking (`UserQuota`) enforced at API level. Dual-tier model quotas with granular 1-hour reset timestamps.
- **Security Headers Middleware**: Enforces `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection`, `Referrer-Policy`, and `Content-Security-Policy`.
- **Parameterized SQL**: All database operations use `SQLModel` / `SQLAlchemy` ORM parameterization, eliminating SQL injection vectors.

### Research Mode (Multi-Analyst Hedge Fund Architecture)

```mermaid
stateDiagram-v2
    [*] --> TechnicalAnalyst: Start Research Request
    TechnicalAnalyst --> FundamentalAnalyst: Technical & Momentum Analysis
    FundamentalAnalyst --> VolatilityAnalyst: Fundamental & Financials Analysis
    VolatilityAnalyst --> DefensiveAnalyst: Volatility & High-Risk Evaluation
    DefensiveAnalyst --> Synthesizer: Defensive & Low-Risk Evaluation
    Synthesizer --> ReportOutput: Consolidate Consensus & Generate Report
    ReportOutput --> [*]
```

- **Exclusive to GPT-5.6 Luna**: Granular LangGraph StateGraph with 4 specialist analyst personas (short-term technical, long-term fundamental, high-risk/volatility, low-risk/defensive).
- **Strict Daily/Hourly Quota**: Dedicated research report quota tracking per user.
- **Multi-Tool Analysis**: Each analyst runs financial tools in parallel (price metrics, technicals, fundamentals, web search) to inform specialized perspective.
- **Structured Output**: Final synthesis as detailed markdown report with labeled analyst perspectives, key risk/opportunity highlights, and actionable recommendation with conviction level.

### Production Storage & Native PostgreSQL Persistence
- **Native PostgreSQL 16**: Production host runs PostgreSQL 16 as a native `systemd` service (`postgresql.service`), persisting data in host disk `/var/lib/pgsql/data`.
- **Zero-Loss Container Isolation**: Database runs outside Docker on host systemd, completely immune to container rebuilds, docker restarts, or service updates.
- **Strict IP Security**: PostgreSQL is configured in `postgresql.conf` and `pg_hba.conf` to listen exclusively on `localhost` and internal Docker bridge (`172.17.0.1:5432`), completely blocked from public network access.

---

## Tech Stack

### Backend
- **Framework & Server**: Python 3.14, FastAPI, Pydantic v2, Granian Multi-Worker ASGI Server (2 workers)
- **Agent Orchestration**: LangGraph, LangChain Core
- **LLM Providers**: Google Gemini 2.5 Flash / Pro (`google-genai`), OpenAI GPT-5.6 Luna (`langchain-openai`)
- **Authentication**: Clerk Backend SDK (`clerk-backend-api`), Svix Webhooks (`svix`)
- **Document Parsing & RAG**: Llama-Index Core + Web Readers (`llama-index-core`, `llama-index-readers-web`)
- **Web Search**: DuckDuckGo wrapper (`duckduckgo-search`)
- **Observability**: LangSmith tracing + evaluation (`langsmith`)
- **Database & ORM**: SQLModel (SQLAlchemy) over **PostgreSQL 16** (Production) / SQLite (Development)
- **Financial Data & Math**: `yfinance`, `pandas`, `numpy`, `scipy`

### Frontend
- **Framework**: React 19, TypeScript, Vite, Bun
- **Authentication**: Clerk React (`@clerk/react`)
- **Routing & State**: TanStack Router (`@tanstack/react-router`), TanStack Query (`@tanstack/react-query`)
- **Styling & UI**: TailwindCSS v4, Lucide React, Radix UI primitives
- **Rendering & Math**: `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex` (KaTeX LaTeX rendering)
- **Data Visualization**: Recharts (`recharts`) for live interactive financial artifacts
- **Exporting**: `jspdf` + `html2canvas` for vector PDF export

### Infrastructure & Deployment
- **Containerization**: Multi-stage Docker build with `bun` frontend compilation and `uv` Python environment sync.
- **Production Server**: AWS EC2 (Amazon Linux 2023) with native PostgreSQL 16, Granian multi-worker ASGI server, Nginx reverse proxy, and Let's Encrypt TLS/SSL termination (`https://finance-agent.brnch.in`).

---

## Running It

### Prerequisites
- **Python**: 3.11+ (managed via `uv` or `venv`)
- **Node.js**: v18+ and `bun` / `npm`
- **Clerk Account**: Credentials from [Clerk Dashboard](https://dashboard.clerk.com)
- **Gemini API Key**: Obtainable from [Google AI Studio](https://aistudio.google.com)

---

### 1. Local Development Setup

#### Backend
1. Clone the repository and navigate to the backend directory:
   ```bash
   git clone git@github.com:CodeFingers809/cfa-agent-langgraph.git
   cd cfa-agent-langgraph/backend
   ```

2. Create a virtual environment and install dependencies using `uv`:
   ```bash
   uv sync
   source .venv/bin/activate
   ```

3. Configure environment variables in `.env`:
   ```bash
   cp ../.env.example .env
   ```
   Set your keys:
   ```env
   GEMINI_API_KEY=your_gemini_api_key
   CLERK_PUBLISHABLE_KEY=pk_test_...
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   CLERK_WEBHOOK_SECRET=whsec_...
   ```

4. Start the FastAPI development server:
   ```bash
   uv run fastapi dev app/main.py --port 8000
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

### 2. Full Local Development Launcher

Run both backend and frontend concurrently with hot-reloading:
```bash
bash scripts/dev.sh
```

---

### 3. Docker Setup (Local Container Run)

Build and run the unified single-container image:

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

### 4. Production EC2 & Nginx Deployment

#### A. Host Environment Setup (Native PostgreSQL 16)
On the target EC2 instance:
```bash
# Install Docker, Native PostgreSQL 16, and Nginx
sudo dnf install -y docker nginx postgresql16-server postgresql16-contrib certbot python3-certbot-nginx
sudo systemctl enable --now docker nginx postgresql

# Initialize PostgreSQL cluster & create database user
sudo postgresql-setup --initdb
sudo systemctl start postgresql
sudo -u postgres psql -c "CREATE USER finance_user WITH PASSWORD 'YourSecurePassword!';"
sudo -u postgres psql -c "CREATE DATABASE finance_agent OWNER finance_user;"
```

#### B. Configure Production `.env`
Create `/home/ec2-user/finance-agent/.env`:
```env
DOMAIN=finance-agent.brnch.in
FRONTEND_HOST=https://finance-agent.brnch.in
ENVIRONMENT=production

PROJECT_NAME="Finance Agent"
SECRET_KEY="generate_secure_random_key_here"

GEMINI_API_KEY=your_gemini_api_key
DATABASE_URL=postgresql+psycopg://finance_user:YourSecurePassword!@172.17.0.1:5432/finance_agent
BACKEND_CORS_ORIGINS="https://finance-agent.brnch.in"

CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
CLERK_WEBHOOK_SECRET=whsec_...
```

#### C. Build & Launch Container (Granian Multi-Worker)
```bash
cd /home/ec2-user/finance-agent
git pull origin main

sudo docker build -t finance-agent -f backend/Dockerfile .
sudo docker rm -f finance-agent-app 2>/dev/null || true

# Run database migrations
sudo docker run --rm --env-file .env finance-agent bash scripts/prestart.sh

# Launch container with Granian 2 workers
sudo docker run -d \
  --name finance-agent-app \
  --restart always \
  -p 8000:8000 \
  --env-file .env \
  finance-agent
```

#### D. Nginx SSL Reverse Proxy Config
Ensure `/etc/nginx/conf.d/finance-agent.conf` has buffering disabled for real-time SSE streaming:
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
        proxy_read_timeout 86400s;
    }
}
```

---

## License

MIT License. Free for personal research, educational, and quantitative exploration.
