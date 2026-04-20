# Changelog

All notable changes to Vectorize MCP Worker are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/).

---

## [4.3.0] — 2026-04-20

### Added — PATCH /documents/:id/metadata

- New `PATCH /documents/:id/metadata` endpoint — update metadata on a document and
  all its chunks without re-embedding or re-chunking.
- True PATCH semantics: only the fields present in the request body are changed.
  Fields omitted from the request are left unchanged in both D1 and Vectorize.
- Updatable fields: `title`, `category`, `source`, `source_type`, `tags`,
  `mime_type`, `file_name`, `date_created`.
- Updates D1 in a single batch (one statement per chunk, executed atomically).
- Re-upserts every chunk to Vectorize with the same stored vectors and the new
  metadata — using `VECTORIZE.getByIds()` to retrieve existing vectors first.
  If `getByIds()` is unavailable, D1 is updated and a `vectorizeWarning` is
  returned in the response (non-fatal).
- Tenant-scoped: tenants can only patch documents they own. Ownership violation
  returns 404 (no information leakage).
- Admin callers (null tenant) can patch any document.
- Response includes: `documentId`, `chunksUpdated`, `fieldsPatched`, `vectorizeUpdated`,
  `vectorizeWarning` (if applicable), `updatedAt`.
- Rate-limited: PATCH requests are included in the sliding-window rate limiter.
- Dashboard Ingest tab: new "Update Metadata" card with fields for title, category,
  source type, file name, tags, and source URL.
- OpenAPI spec updated: `PATCH /documents/{id}/metadata` path with full request/
  response schema. Version bumped to 4.2.0.

---

## [4.2.0] — 2026-04-20

### Changed — Default Embedding Model: qwen3-0.6b (1024d)

- `qwen3-0.6b` (`@cf/qwen/qwen3-embedding-0.6b`, 1024d) is now the default embedding
  model for new deployments. Top retrieval quality on standard benchmarks for 2026.
- `bge-small` (384d) remains fully supported for existing deployments via
  `EMBEDDING_MODEL=bge-small` in `wrangler.toml [vars]`.
- Dashboard AI Models panel reordered: qwen3-0.6b listed first with "★ Default" badge.

### Added — Kimi K2.5 for Knowledge Reflection

- `@cf/moonshot/kimi-k2.5` replaces `llama-3.2-3b` as the default model for
  knowledge reflection synthesis and multi-document consolidation.
- Kimi K2.5 has significantly better multi-document reasoning and structured output
  than the smaller routing model that was previously handling synthesis.
- New `REFLECTION_MODEL` env var selects cost vs quality:
  - `kimi-k2.5` (default) — best synthesis quality
  - `llama-3.2-3b` — lower cost, higher throughput
- `resolveReflectionModel()` helper in `src/config/models.ts` resolves the active
  model from the env var; falls back to Kimi K2.5 if unset or unrecognised.
- `REFLECTION_MODELS` registry added to `src/config/models.ts` with both entries.
- `/stats` response now includes `models.reflection` (full model ID) and
  `models.reflectionKey` (env var value for display).
- Dashboard Setup tab AI Models section split into two tables:
  - Embedding Models (qwen3-0.6b first, with ★ Default badge)
  - Reflection & Synthesis Models (Kimi K2.5 and llama-3.2-3b; notes on Vision/OCR)
- `src/types/env.ts` — `REFLECTION_MODEL?: string` env var documented and typed.

---

## [4.1.0] — 2026-04-16

### Added — Dashboard: Delete, Find Similar, Intent Debug, License Management, Guide Tab

- **Delete document** — Ingest tab now has a "Delete Document" card. Enter a document ID,
  confirm in a modal dialog, and it calls `DELETE /documents/:id`. Tenant-scoped; returns
  an informative error if the ID doesn't belong to the caller's tenant.
- **Advanced metadata on ingest** — Collapsible "Advanced Metadata" section on the
  document ingest form exposes all six metadata fields: `title`, `source_type`, `tags`,
  `mime_type`, `file_name`, `tenant_id`. Previously these were only settable via the API.
- **File upload for document ingest** — Drag-and-drop (or click-to-browse) file picker on
  the doc ingest form reads `.txt`, `.md`, and other text files directly in the browser
  via the FileReader API. Filename auto-populates the `file_name` metadata field.
- **Find Similar Images** — New card in the Ingest tab. Provide an image URL to call
  `POST /find-similar-images` and display visually similar results with similarity scores.
- **Intent Classifier debug tool** — New card in the Search tab. Type a query to call
  `POST /classify-intent` and see the raw route classification (SQL / BM25 / VECTOR /
  GRAPH / VISION / OCR), confidence score, and reasoning. Useful for diagnosing why a
  query hits the wrong route.
- **License management panel** — New section in the Setup tab with four sub-tabs:
  Validate, Create, List, and Revoke. Wraps the full `/license/*` API surface that was
  previously only accessible directly.
- **Guide tab** (5th tab) — Step-by-step setup walkthrough with copyable code blocks
  covering: Vectorize index creation, D1 database, wrangler.toml configuration, schema
  migration, API key setup, and Claude Desktop MCP config. Includes a live "Check Setup
  Status" button that calls `/test` and `/stats` to confirm each binding is connected.

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
