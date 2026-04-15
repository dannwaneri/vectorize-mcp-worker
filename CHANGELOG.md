# Changelog

All notable changes to Vectorize MCP Worker are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/).

---

## [4.0.0] — 2026-04-13

This release is a major production hardening pass. The core search and ingestion
pipeline is unchanged and fully backward-compatible; all new features are additive.

### Added — Metadata Filtering

- Full metadata filter support on `/search`, all MCP tools, and the dashboard filter panel.
  Supported fields: `source_type`, `category`, `tags`, `date_created`, `tenant_id`,
  `mime_type`, `file_name`.
- Filter operators: `$eq`, `$ne`, `$in` (string fields); `$gt`, `$gte`, `$lt`, `$lte`
  (date fields). Tag filtering falls back to in-memory post-filter because Vectorize
  does not index `string[]` fields natively.
- `validateFilters()` utility in `src/types/search.ts` — rejects unknown operators and
  unknown field names with a descriptive 400 error before any search is attempted.
- All ingest paths (`/ingest`, `/ingest-image`, MCP `ingest`, MCP `ingest_image_url`)
  now accept and persist: `source_type`, `mime_type`, `file_name`, `tags`,
  `date_created`, `tenant_id` — stored in both Vectorize metadata and D1.

### Added — Configurable Embedding Models

- Model registry in `src/config/models.ts` with three entries:
  - `bge-small` → `@cf/baai/bge-small-en-v1.5` (384d, default, backward-compatible)
  - `bge-m3` → `@cf/baai/bge-m3` (1024d, multilingual)
  - `qwen3-0.6b` → `@cf/qwen/qwen3-embedding-0.6b` (1024d, best retrieval quality 2026)
- Active model resolved from `EMBEDDING_MODEL` env var at runtime; falls back to
  `bge-small` if unset or unrecognised.
- `resolveEmbeddingModel()` helper used throughout ingestion, search, and stats.
- `/stats` response now includes `models.embeddingKey`, `models.embedding`,
  `models.embeddingDimensions`, `models.reranker`, `models.vision`, `models.routing`.
- Dashboard models panel shows active key, full model ID, dimensions, and a
  "★ Best 2026" badge for `qwen3-0.6b`.

### Added — Modern MCP Server (Streamable HTTP)

- `src/mcp/agent.ts` — `VectorizeMcpAgent` extending `McpAgent<Env>` from the
  `agents` v0.10 package. Backed by a Cloudflare Durable Object for per-session state.
- Transport: Streamable HTTP at `/mcp` (replaces legacy SSE; April 2026 standard).
- Six tools registered via `McpServer.registerTool()`:
  `search`, `ingest`, `ingest_image_url`, `find_similar_by_url`, `delete`, `stats`.
- `VectorizeMcpAgent.onConnect()` captures the `Authorization` header and resolves
  `_tenantId` before any tool call can execute.
- All tool handlers inject `this._tenantId` via `injectTenantFilter()` — tenants
  cannot escape their scope through the MCP interface.
- `wrangler.toml` updated: `MCP_AGENT` Durable Object binding + migration `v1`,
  `nodejs_compat` compatibility flag (required by the `agents` package).
- `VectorizeMcpAgent` exported from `src/index.ts` (required for Durable Object class
  export).
- Legacy `/mcp/tools` (GET) and `/mcp/call` (POST) JSON-RPC endpoints retained for
  backward compatibility.
- Connect via `mcp-remote` (Claude Desktop) or native Streamable HTTP (Cursor,
  Windsurf, and any 2026-spec MCP client).

### Added — Multi-Tenancy

- `src/middleware/tenant.ts` — four exported helpers:
  `resolveTenant()`, `resolveTenantFromToken()`, `injectTenantFilter()`,
  `isMultiTenancyEnabled()`.
- `TENANT_KEYS` env var (wrangler secret): JSON map of `apiKey → tenantId`.
  `API_KEY` remains the unrestricted admin credential.
- `src/middleware/auth.ts` rewritten to accept both the admin `API_KEY` and any
  key present in `TENANT_KEYS`; dev mode (neither set) is still keyless.
- All `/search`, `/ingest`, `/ingest-image`, `/find-similar-images`, and
  `DELETE /documents/:id` paths call `resolveTenant()` and inject the tenant filter.
- `IngestionEngine.deleteWithTenantCheck()` — scopes the D1 DELETE and Vectorize
  `deleteByIds()` to the caller's `tenant_id`; returns `false` without leaking
  existence info for cross-tenant document IDs.
- `/test` response includes `multiTenancy: { enabled, tenant, isAdmin }`.
- `MCP_AGENT` Durable Object namespace typed as
  `DurableObjectNamespace<VectorizeMcpAgent>` in `src/types/env.ts`.
- D1 migration `migrations/001_add_tenant_id.sql`:
  `ALTER TABLE documents ADD COLUMN tenant_id TEXT DEFAULT NULL` +
  `idx_documents_tenant` index.

### Added — Cloudflare Cache API

- V3 search results cached at the HTTP layer via `caches.default` (Cloudflare Cache
  API), shared across all Worker isolate instances globally.
- Cache key: synthetic `https://vectorize-search-cache.internal/v3?q=...` URL
  encoding `query + topK + offset + filters + tenant_id`.
- TTL: `Cache-Control: public, s-maxage=60, stale-while-revalidate=60`.
- Bypass conditions: `rerank=true`, `highlight=true`, V4 mode.
- Cache hits return immediately with `X-Cache: HIT` header; recorded in the analytics
  store as `totalMs: 0, cached: true`.
- Cache storage uses `ctx.waitUntil()` (non-blocking); `handleSearch` now accepts
  optional `ctx?: ExecutionContext`.

### Added — Rate Limiting

- `src/middleware/rateLimit.ts` — module-level `RateLimiter` singleton with a
  sliding-window `Map<key, {count, windowStart}>`.
- `checkRateLimit(request, env, tenantId)` returns a `429 Response | null`.
  Key priority: `t:<tenantId>` → `ip:<CF-Connecting-IP>` → `ip:<X-Forwarded-For>`
  → `ip:unknown`.
- Default: 10 requests per 10 seconds. Configurable:
  - `RATE_LIMIT_REQUESTS` (default: `"10"`)
  - `RATE_LIMIT_WINDOW_MS` (default: `"10000"`)
- 429 response includes `error`, `retryAfter` (seconds), `limit`, `window`.
- Response headers on all 2xx search responses:
  `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Window`,
  `Retry-After` (on 429 only).
- Applied in `src/index.ts` to all `POST` and `DELETE` requests, excluding
  `/mcp` internal traffic and `/license/validate`.
- Map pruned every 100 requests (entries older than 2× window) to prevent memory
  growth in long-lived isolates.

### Added — Query Analytics

- `src/analytics/store.ts` — `AnalyticsStore` class with a 100-entry circular buffer.
  Each entry records: `query`, `totalMs`, `embeddingMs`, `vectorMs`, `keywordMs`,
  `rerankerMs`, `cached`, `filterFields[]`, `timestamp`.
- `analytics.getSummary()` returns: `totalQueries`, `cacheHits`, `cacheMisses`,
  `cacheHitRate`, `avgLatencyMs`, `recentQueries` (last 10, newest first),
  `topFilters` (top 5 filter fields by usage count).
- `GET /stats` response now includes `analytics: analytics.getSummary()`.
- V3 `handleSearch` calls `analytics.record()` after every search (including CF
  cache hits, which record `totalMs: 0`).

### Added — Dashboard Enhancements

- **Filter panel:** dropdowns and inputs for `source_type`, `category`, `mime_type`,
  `file_name`, `date_created` (from/to). Active filter count badge on the toggle
  button. Filters included in every search request.
- **Model info panel:** collapsible; shows active embedding model key, full model ID,
  dimensions, and "★ Best 2026" badge.
- **Tenant badge:** shown in the auth section after `testAuth()` succeeds; displays
  tenant name or "ADMIN" badge.
- **Perf panel:** stacked bar chart (Embedding / Vector / BM25 / Reranker / Highlight)
  with proportional widths and color legend. "☁️ CF cache hit" (blue) vs
  "⚡ memory cache hit" (green) badge in the title. Rate limit remaining shown
  right-aligned.
- **Analytics section:** collapsible `<details>` element with three-stat summary
  grid (avg latency, cache hit rate, total queries), top filters pill list, and a
  last-10-queries table with per-stage timing columns.
- **429 handling:** displays "⏱ Rate limit exceeded — try again in Xs" with limit
  and window info.

### Changed

- `topK` ceiling raised from 20 to 50, matching the Vectorize API limit for
  `returnMetadata: 'all'` (2026). Internal `vecTopK = Math.min(topK * 2, 50)`.
- `HybridSearchEngine.search()` return type extended with `cached: boolean` field
  (cache hits return `cached: true`, misses return `cached: false`).
- `handleSearch` in `src/handlers/search.ts` accepts optional
  `ctx?: ExecutionContext` for `waitUntil` support.
- `src/index.ts` passes `ctx` to `handleSearch`.
- `resolveTenant` called in `index.ts` rate-limit block (before route matching) to
  avoid redundant tenant resolution per request on the hot search path.

### Fixed

- `multimodal-worker/src/index.ts`: `embedding_model` field added to
  `ImageDescriptionResponse.vectorMetadata` interface (was causing TS2353 compile
  error because the field was set in the response body but absent from the type).

---

## [3.0.0] — 2026-01 (prior release)

- Multimodal image ingestion via Llama 4 Scout 17B (vision + OCR)
- Reverse image search (`/find-similar-images`)
- Unified text + image Vectorize index
- In-memory 60s search result cache in `HybridSearchEngine`
- Interactive dashboard with image ingest form and demo shortcuts
- Service binding to `multimodal-pro-worker`

## [2.0.0] — 2025-Q4 (prior release)

- V4 intelligent query routing (SQL / BM25 / VECTOR / GRAPH / OCR / VISION)
- Intent classification via Llama 3.2-3b
- Per-route cost tracking and `/analytics/cost` endpoint
- Semantic highlighting with configurable threshold
- One-time license system (D1-backed)

## [1.0.0] — 2025-Q3 (initial release)

- Hybrid search: Vectorize vector search + D1 BM25 keyword search
- Reciprocal Rank Fusion (RRF) result merging
- Cross-encoder reranking with `bge-reranker-base`
- Recursive text chunking with 15% overlap
- `bge-small-en-v1.5` embeddings (384 dimensions)
- Interactive dashboard at `/dashboard`
- MCP integration via `/mcp/tools` and `/mcp/call` (JSON-RPC)
- API key authentication
- CORS support
