# Vectorize MCP Worker

**Production-grade RAG on Cloudflare Workers. ~$5/month. No servers. No Pinecone bill.**

Hybrid search, knowledge reflection, multimodal ingestion, metadata filtering, multi-tenancy, rate limiting, and a native MCP server — all in one deployable Worker.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/dannwaneri/vectorize-mcp-worker)

---

## Why This Exists

Andrej Karpathy made a compelling argument recently: LLMs are becoming the new Wikipedia. Ask the model, get the answer. For general knowledge questions, he's right — if you're asking "what is gradient descent," you don't need a retrieval pipeline.

But that framing has a blind spot:

**Your data isn't in any LLM's training set. It never will be.**

Your internal docs, customer contracts, support tickets, financial reports, product changelog — none of it lives in any model. The moment you need answers grounded in *your* specific knowledge base, you need retrieval. The moment you need results that are cited, up-to-date, and not hallucinated, you need RAG.

This project is for that use case. It's not trying to beat LLMs at general knowledge. It's making them useful on *your* data.

The second reason this exists: most RAG tutorials hand you a 50-line Python script that calls OpenAI and Pinecone and calls it a day. That's fine for a weekend demo. It falls apart the moment you need multi-tenancy, metadata filtering, sub-second cached responses, a proper MCP server, and something you'd actually trust in production. This is what happens when you build the thing properly from the start.

---

## Key Features

**Hybrid Search** — Vector similarity + BM25 keyword search, fused with Reciprocal Rank Fusion. Pure vector search misses exact matches. Pure keyword search misses synonyms. You need both.

**Cross-Encoder Reranking** — A cross-encoder rescores the top results against your query after initial retrieval. In my benchmarks: +9.3 percentage point improvement in MRR@5.

**Knowledge Reflection** *(new)* — After every ingest, the system finds semantically related documents and asks Llama to synthesize what's new, how it connects to existing knowledge, and what gap remains. These reflections are stored, embedded, and boosted in search results. The knowledge base gets smarter as you add more documents — not just bigger.

**Intelligent Query Routing (V4)** — Not every query needs vector search. Entity lookups go to SQL (11ms), exact keyword queries go to BM25 (18ms), semantic questions go to the full pipeline. In testing, this cuts average embedding cost by 71% compared to running everything through vectors.

**Metadata Filtering** — Filter by `source_type`, `category`, `doc_type`, `tags`, `date_created`, `tenant_id`, `mime_type`, `file_name` — using `$eq`, `$ne`, `$in`, `$gt/$gte/$lt/$lte`. Filters run at the Vectorize layer, not in memory.

**Multimodal** — Ingest images by upload or URL. Llama 4 Scout 17B handles vision + OCR. Text queries can surface image results. Everything lives in one unified index.

**Native MCP Server** — Streamable HTTP at `/mcp`, backed by Cloudflare Durable Objects per session. Six tools: `search`, `ingest`, `ingest_image_url`, `find_similar_by_url`, `delete`, `stats`. Two lines of JSON to connect Claude Desktop. That's it.

**Multi-Tenancy** — One deployment, multiple isolated tenants. Map API keys to tenant IDs via a JSON secret. Every operation is automatically scoped. Tenants can't escape their namespace. You don't need a separate deployment per customer.

**Two-Layer Caching** — Cloudflare Cache API (global, shared, 60s SWR) + in-memory Map cache. Repeat queries cost zero.

**Rate Limiting** — Sliding-window limiter per tenant or IP. Configurable. Returns proper `Retry-After` headers.

**Query Analytics** — Every query recorded: latency per stage, cache hit/miss, filters used. Surfaces through `/stats` and the built-in dashboard. No separate logging service.

**Three Embedding Models** — `bge-small` (384d, fast, default), `bge-m3` (1024d, multilingual), `qwen3-0.6b` (1024d, best retrieval quality 2026). One env var to switch.

---

## The Knowledge Reflection Layer

Standard RAG retrieves documents. It doesn't learn. Every query goes in cold — no memory of what it found before, no synthesis across documents, no growing understanding of your knowledge base.

The reflection layer changes that. Every time you ingest a document:

1. The system finds the most semantically related documents already in the index
2. Llama 3.2 synthesises a three-sentence insight: what the new document adds, how it connects to existing knowledge, and what gap remains
3. That reflection is embedded, stored with `doc_type=reflection`, and given a 1.5× ranking boost in search results
4. After every 3 new documents, reflections are consolidated into a `doc_type=summary` — a compressed view of what the knowledge base has learned

Your knowledge base builds a second layer of synthesised knowledge on top of raw documents. Related concepts get explicitly linked. Contradictions get surfaced. Search results include both raw chunks *and* distilled insights.

You can filter to see only reflections (`doc_type: { "$eq": "reflection" }`), or exclude them (`"$ne": "reflection"`), or let them naturally surface alongside raw results — which is the default.

---

## Real-World Use Cases

**Internal knowledge base** — Ingest your Notion exports, Confluence pages, internal docs. Give your team a search interface that understands context, not just keywords. Connect Claude Desktop via MCP and every team member has AI-assisted search over your entire knowledge base without you building anything custom.

**SaaS with per-customer document search** — Enable multi-tenancy. Each customer gets their own isolated namespace in the same deployment. One Worker, one Vectorize index, true data isolation. No separate search service per customer.

**Legal / compliance retrieval** — Ingest contracts, filings, policy docs. Filter by `date_created`, `category`, `source_type`. The reflection layer surfaces connections between documents across time — useful for spotting contradictions in evolving policy.

**Developer tool that understands your codebase** — Ingest your docs, changelogs, runbooks, incident postmortems. Hook it to Claude Desktop. Ask questions about your own architecture decisions and incident history.

**Receipt and invoice processing** — Upload receipt images, Llama 4 Scout extracts the text, both semantic description and raw OCR land in the index. Search "dinner expense over $100 in March" and it works.

---

## Live Demo

Once deployed, your dashboard lives at:

```
https://your-worker.workers.dev/dashboard
```

The OpenAPI spec is available at `/openapi.json` — import it directly into Postman, Insomnia, Bruno, or any API client that accepts OpenAPI 3.0.

It's a full playground: search with filters and intent classification debug, ingest documents (drag-and-drop file upload, advanced metadata), upload images, find visually similar images, delete documents, manage licenses, monitor cache hit rate, check which embedding model is active, browse query analytics. A built-in Guide tab walks through every setup step with copyable commands and a live status checker. Not a toy.

---

## Quick Start

You need: a Cloudflare account (free tier works), Node.js v18+, Wrangler CLI.

```bash
npm install -g wrangler
wrangler login
```

### 1. Clone and install

```bash
git clone https://github.com/dannwaneri/vectorize-mcp-worker.git
cd vectorize-mcp-worker
npm install
```

### 2. Create your Vectorize index

```bash
# Default: bge-small, 384 dimensions
wrangler vectorize create mcp-knowledge-base --dimensions=384 --metric=cosine

# Better quality: qwen3-0.6b or bge-m3, 1024 dimensions
wrangler vectorize create mcp-knowledge-base --dimensions=1024 --metric=cosine
```

### 3. Create your D1 database

```bash
wrangler d1 create mcp-knowledge-db
```

Copy the `database_id` from the output.

### 4. Configure

```bash
cp wrangler.toml.example wrangler.toml
```

Paste your `database_id` into `wrangler.toml`. That's the only required edit.

```toml
[[d1_databases]]
binding = "DB"
database_name = "mcp-knowledge-db"
database_id = "paste-your-id-here"
```

### 5. Apply schema and deploy

```bash
wrangler d1 execute mcp-knowledge-db --remote --file=./schema.sql
wrangler d1 execute mcp-knowledge-db --remote --file=./migrations/001_add_tenant_id.sql
wrangler d1 execute mcp-knowledge-db --remote --file=./migrations/002_add_reflection_fields.sql
wrangler deploy
```

### 6. Set your API key

```bash
wrangler secret put API_KEY
```

Done. Visit `https://your-worker.workers.dev/test` to confirm everything is connected.

**Prefer one click?** The deploy button at the top scaffolds everything automatically. You'll still need to set `API_KEY` as a secret afterward.

---

## Claude Desktop & MCP Integration

The MCP server runs at `/mcp` using Streamable HTTP transport (the 2026 standard). Each session gets a dedicated Durable Object instance for isolated state. Six tools cover the full lifecycle.

### Claude Desktop

Add this to your config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "vectorize": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://your-worker.workers.dev/mcp",
        "--header",
        "Authorization: Bearer YOUR_API_KEY"
      ]
    }
  }
}
```

Restart Claude Desktop. The six tools appear in the tool picker. Then:

> *"Search my knowledge base for anything about our Q1 pricing decisions"*
> *"Ingest this document — tag it category: finance, source_type: pdf"*
> *"What synthesised insights do we have on infrastructure costs?"*
> *"Find images similar to this URL and show me the top 5"*

### Cursor, Windsurf, or any native Streamable HTTP client

```json
{
  "mcpServers": {
    "vectorize": {
      "url": "https://your-worker.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

### Available Tools

| Tool | What it does |
|------|-------------|
| `search` | Hybrid vector + BM25 with metadata filters, reranking, and reflection boost |
| `ingest` | Add a text document with auto-chunking; re-ingesting the same ID overwrites |
| `ingest_image_url` | Fetch a public image URL, run vision + OCR, embed and index |
| `find_similar_by_url` | Reverse image search — give it an image URL, get visually similar results |
| `delete` | Remove a document and all its chunks. Tenant-scoped. |
| `stats` | Index info, active model, query analytics summary |

All tools are automatically scoped to your tenant from the API key. You can't accidentally read another tenant's data.

---

## Tech Stack

Everything runs on Cloudflare. No external services. No third-party billing. No data leaving your account.

| Component | What's used |
|-----------|------------|
| **Runtime** | Cloudflare Workers (TypeScript) |
| **Vector store** | Cloudflare Vectorize |
| **Keyword / metadata store** | Cloudflare D1 (SQLite) |
| **HTTP cache** | Cloudflare Cache API |
| **MCP session state** | Cloudflare Durable Objects |
| **Embedding (default)** | `@cf/baai/bge-small-en-v1.5` — 384d |
| **Embedding (best quality)** | `@cf/qwen/qwen3-embedding-0.6b` — 1024d |
| **Embedding (multilingual)** | `@cf/baai/bge-m3` — 1024d |
| **Reranker** | `@cf/baai/bge-reranker-base` |
| **Vision / OCR** | `@cf/meta/llama-4-scout-17b-16e-instruct` |
| **Query routing + reflection** | `@cf/meta/llama-3.2-3b-instruct` |
| **MCP SDK** | `agents` v0.10 + `@modelcontextprotocol/sdk` v1.29 |

Switching embedding models is one env var. Switching from `bge-small` (384d) to `qwen3-0.6b` (1024d) requires a new Vectorize index and re-ingest — no code changes.

---

## Cost

Straight numbers, no vague "cheaper than Pinecone" hand-waving.

**At 1,000 queries/day with V4 intelligent routing:**
- ~$0.11/month — most queries hit the SQL or BM25 route, no embedding needed
- ~$0.39/month — if every query goes through the full vector pipeline (V3 mode)
- ~$0/month cached — once a query is in the CF cache, it costs nothing to serve again

**At 10,000 queries/day:** roughly $1–5/month depending on query mix and cache hit rate.

The Cloudflare Workers free tier handles 100,000 requests/day before you pay anything for compute. Vectorize, D1, and Workers AI each have their own free tiers too. At the volumes most teams actually run, the total bill is boring in the best way.

---

## Comparison

| Approach | Latency | Cost | Ops burden | MCP | Reflection layer |
|----------|---------|------|------------|-----|-----------------|
| **This project** | 0ms cached, ~900ms cold | ~$1–5/mo | Very low | Native | Yes |
| **Basic RAG** (OpenAI + Pinecone) | 200–500ms | $50–200+/mo | Low | No | No |
| **LangChain / LlamaIndex** | Depends | Depends | Medium | Partial | No |
| **Karpathy-style** (just the LLM) | Fast | Low | None | — | No |
| **Self-hosted** (Weaviate, Qdrant) | Fast | $40–100+/mo infra | High | No | No |

If your data is public knowledge and freshness doesn't matter, the LLM alone is often the right call. If your data is private, proprietary, or time-sensitive — you need retrieval. This is the fastest path to production-grade retrieval I've found, and the only one in this list where the knowledge base gets smarter over time.

---

## Roadmap

- [x] **Batch ingestion** — `POST /ingest/batch`, up to 100 docs, concurrency-controlled, per-doc results
- [ ] **Incremental re-indexing** — update document metadata without full re-embed
- [ ] **Webhook support** — trigger ingestion from Notion, GitHub, Slack events
- [x] **OpenAPI spec** — `GET /openapi.json`, OpenAPI 3.0.3, importable into Postman / Insomnia / Bruno
- [x] **Test suite** — 73 unit tests across chunking, auth, rate limiting, and batch ingestion

PRs welcome on any of these. If you're running this in production and hitting a specific wall, open an issue and I'll prioritise it.

---

## Contributing & Feedback

If this saved you time or money, a GitHub star helps other people find it.

If something's broken or confusing, [open an issue](https://github.com/dannwaneri/vectorize-mcp-worker/issues). I read every one.

The codebase is intentionally straightforward — no frameworks on top of frameworks. The highest-value contributions right now are real-world usage reports, the batch ingestion endpoint, and test coverage for the middleware and reflection layer.

---

## Professional Services

Need this deployed, customised, or integrated into an existing product?

- **Setup & onboarding:** $2,500 one-time — full deployment, up to 10K docs indexed, 2 weeks of support
- **[Hire me on Upwork](https://www.upwork.com/freelancers/~01d5946abaa558d9aa)**

---

## License

MIT — see [LICENSE](LICENSE).

---

**Daniel Nwaneri** — building useful things on Cloudflare Workers

[Twitter](https://twitter.com/dannwaneri) · [Upwork](https://www.upwork.com/freelancers/~01d5946abaa558d9aa) · [DEV.to](https://dev.to/dannwaneri) · [GitHub](https://github.com/dannwaneri)
