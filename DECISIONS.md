# Architectural & Technical Decisions (DECISIONS.md)

This document records the key architectural choices, trade-offs, and rationale behind decisions in `finance-harness`.

---

## 1. Clerk Multi-Tenancy & RBAC

- **Decision**: Replace custom JWT authentication and internal password reset flows with Clerk Organizations.
- **Rationale**: User isolation per-user was insufficient for enterprise multi-tenancy requirements. Clerk provides seamless organization management, SSO/Google auth, and RBAC roles (`org:admin` vs `org:member`).
- **Organization Mirroring**: An `Organization` table is maintained as a read-only mirror updated strictly via Svix-verified Clerk webhooks (`user.created`, `organization.created`, `organizationMembership.created`).
- **Admin UI Retirement**: Legacy custom user-CRUD admin tables were retired in favor of embedding Clerk's native `<OrganizationProfile />` and `<OrganizationSwitcher />` components.

---

## 2. RBAC Permissions & Save-Button UI Tension

- **Decision**: 
  - Admin (`org:admin`) has full CRUD rights on watchlists, portfolios, and research reports.
  - Analyst (`org:member`) has read + chat access.
- **UI Symmetry & Resolution**: Requirement 8 demands that action bar buttons (Copy, Branch, Export PDF, Save) appear symmetrically on every message regardless of role. To resolve the tension with Admin-only Save privileges, the UI renders the Save button for all users but disables it with an explanatory tooltip for Analysts, backed by strict server-side `require_org_admin` validation.

---

## 3. Rate Limiting Migration to Redis

- **Decision**: Migrate daily quota tracking from SQL database queries to Redis using `INCR` and `EXPIRE` commands.
- **Key Schema**: `quota:{clerk_user_id}:{utc_date}:{tier}` with TTL set to expire at UTC midnight (`EXPIRE ... NX`).
- **Parity**: Admin bypass is preserved (`org_role == "org:admin"`). The existing `UserQuota` database table is retained but marked deprecated.

---

## 4. Re-Scoped RAG Pipeline (Org Knowledge Base)

- **Decision**: Re-scope RAG from external SEC filings (which are redundant with live search and yfinance tools) to organizational memory: RAG over the org's saved research reports and ad-hoc ingested URLs.
- **Storage**: Vector embeddings are indexed using `LlamaIndex` over PostgreSQL `pgvector`.
- **Dev vs Prod Trade-off**: Dev environments on SQLite fall back gracefully when pgvector is unavailable, while production runs native PostgreSQL 18 with `vector` 0.8.6.

---

## 5. Chart Artifacts & Protobuf Event Streaming

- **Decision**: Support 4 rich chart artifact types (`PriceChartResult`, `QuarterlyGrowthResult`, `AnalystTargetResult`, `FiiDiiFlowResult`) in addition to portfolio optimization tables.
- **Serialization**: Stream events use Protobuf tags 11-14 in `StreamEvent` oneof, encoded as Base64 SSE events.
- **FII/DII Data Scraping**: FII/DII institutional flows scraping is implemented on a best-effort basis, with graceful fallback if external sources change markup.

---

## 6. Client-Side PDF Export

- **Decision**: Client-side rendering using `html2canvas` (scale: 2) and `jspdf` (A4 portrait pagination).
- **Rationale**: Instant PDF download without adding heavy headless browser server dependencies (Puppeteer/Playwright) to the backend.
