# Vectorize MCP Worker 🚀

**Production-Grade Hybrid RAG on Cloudflare Edge - Deploy for $5/month instead of $200+**

A complete semantic search system with hybrid search (Vector + BM25), reranking, auto-chunking, one-time licensing, and MCP integration.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/dannwaneri/vectorize-mcp-worker)

## Why This Exists

Traditional AI search setups are expensive and slow:
- 💸 **Cost**: $50-200+/month for Pinecone, Weaviate, or hosted solutions
- 🐌 **Latency**: 200-500ms response times from centralized servers
- 🔒 **Privacy**: Your data gets sent to third-party services

This worker changes the game:
- 💰 **Cost**: ~$5/month on Cloudflare's generous free tier
- ⚡ **Speed**: <1s hybrid search with reranking
- 🔐 **Privacy**: Your data stays on your Cloudflare account

## Features

### Core Search
- ✅ **Hybrid Search** - Vector similarity + BM25 keyword matching
- ✅ **Reciprocal Rank Fusion (RRF)** - Intelligent result merging
- ✅ **Cross-Encoder Reranking** - Precision scoring with `bge-reranker-base`
- ✅ **Recursive Chunking** - Semantic boundary-aware with 15% overlap

### Platform
- ✅ **Interactive Dashboard** - Visual playground at `/dashboard`
- ✅ **MCP Integration** - Works with Claude Desktop and AI agents
- ✅ **One-Time Licensing** - Pay-once validation system
- ✅ **AI SEO Ready** - JSON-LD schema + `llms.txt`

### Production
- ✅ **API Key Authentication** - Production-ready security
- ✅ **Performance Monitoring** - Real-time timing breakdown
- ✅ **CORS Support** - Ready for web applications
- ✅ **Edge Deployment** - Runs globally on Cloudflare's network

## Architecture

```
User Query
    │
    ├──► Vector Search (Vectorize) ──┐
    │    └─ BGE embeddings           │
    │                                ├──► RRF Fusion ──► Reranker ──► Results
    └──► Keyword Search (D1 BM25) ───┘
         └─ Term frequency/IDF

Performance: ~1s total (embedding + vector + keyword + rerank)
```

**Tech Stack:**
- **Runtime**: Cloudflare Workers
- **Vector DB**: Cloudflare Vectorize
- **SQL DB**: Cloudflare D1 (BM25 keywords)
- **Embedding**: `@cf/baai/bge-small-en-v1.5` (384 dimensions)
- **Reranker**: `@cf/baai/bge-reranker-base`

## Quick Start (10 Minutes)

### Prerequisites
- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Node.js](https://nodejs.org/) v18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

### 1. Clone & Install

```bash
git clone https://github.com/dannwaneri/vectorize-mcp-worker.git
cd vectorize-mcp-worker
npm install
```

### 2. Create Vectorize Index

```bash
wrangler vectorize create mcp-knowledge-base --dimensions=384 --metric=cosine
```

### 3. Create D1 Database

```bash
wrangler d1 create mcp-knowledge-db
```

Copy the `database_id` and update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "mcp-knowledge-db"
database_id = "YOUR_DATABASE_ID"
```

### 4. Run Migrations

```bash
wrangler d1 execute mcp-knowledge-db --remote --file=./schema.sql
```

### 5. Deploy

```bash
wrangler deploy
```

### 6. Set API Key (Optional)

```bash
wrangler secret put API_KEY
```

### 7. Test It

Open your dashboard: `https://your-worker.workers.dev/dashboard`

Or via CLI:
```bash
# Ingest a document
curl -X POST https://your-worker.workers.dev/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"id": "doc-1", "content": "Your document content here", "category": "docs"}'

# Search
curl -X POST https://your-worker.workers.dev/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"query": "your search query", "topK": 5}'
```

## API Endpoints

### Public Endpoints (No Auth)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | API documentation |
| `/test` | GET | Health check |
| `/dashboard` | GET | Interactive UI |
| `/llms.txt` | GET | AI search engine info |
| `/mcp/tools` | GET | List MCP tools |

### Protected Endpoints (Auth Required)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/search` | POST | Hybrid semantic search |
| `/ingest` | POST | Ingest document with auto-chunking |
| `/stats` | GET | Index statistics |
| `/documents/:id` | DELETE | Delete document |
| `/mcp/call` | POST | Execute MCP tool |

### License Endpoints (Admin)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/license/create` | POST | Create new license |
| `/license/validate` | POST | Validate license key |
| `/license/list` | GET | List all licenses |
| `/license/revoke` | POST | Revoke a license |

## Search API

### Request
```json
{
  "query": "How does hybrid search work?",
  "topK": 5,
  "rerank": true
}
```

### Response
```json
{
  "query": "How does hybrid search work?",
  "topK": 5,
  "resultsCount": 5,
  "results": [
    {
      "id": "doc-1-chunk-0",
      "score": 0.0142,
      "content": "Hybrid search combines vector similarity...",
      "category": "technical",
      "scores": {
        "vector": 0.85,
        "keyword": 12.4,
        "reranker": 0.92
      }
    }
  ],
  "performance": {
    "embeddingTime": "94ms",
    "vectorSearchTime": "650ms",
    "keywordSearchTime": "50ms",
    "rerankerTime": "118ms",
    "totalTime": "912ms"
  }
}
```

## Ingest API

### Request
```json
{
  "id": "unique-doc-id",
  "content": "Your document content. Can be multiple paragraphs.\n\nWill be automatically chunked.",
  "title": "Optional Title",
  "category": "optional-category"
}
```

### Response
```json
{
  "success": true,
  "documentId": "unique-doc-id",
  "chunksCreated": 3,
  "performance": {
    "embeddingTime": "450ms",
    "totalTime": "1200ms"
  }
}
```

## MCP Integration

Use this worker as a tool for Claude Desktop or other AI agents.

### List Available Tools
```bash
curl https://your-worker.workers.dev/mcp/tools
```

### Call a Tool
```bash
curl -X POST https://your-worker.workers.dev/mcp/call \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "tool": "search",
    "arguments": {
      "query": "cloudflare workers",
      "topK": 3
    }
  }'
```

### Available Tools
- `search` - Search the knowledge base
- `ingest` - Add documents
- `stats` - Get statistics
- `delete` - Remove documents

## License System

### Create a License
```bash
curl -X POST https://your-worker.workers.dev/license/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"email": "customer@example.com", "plan": "pro"}'
```

### Plans
| Plan | Max Documents | Max Queries/Day |
|------|---------------|-----------------|
| standard | 10,000 | 1,000 |
| pro | 50,000 | 5,000 |
| enterprise | 100,000 | 10,000 |

### Validate a License
```bash
curl -X POST https://your-worker.workers.dev/license/validate \
  -H "Content-Type: application/json" \
  -d '{"license_key": "lic_xxxxx"}'
```

## Performance

Real-world benchmarks from production:

| Operation | Time |
|-----------|------|
| Embedding Generation | ~90ms |
| Vector Search | ~650ms |
| Keyword Search (BM25) | ~50ms |
| Reranking | ~120ms |
| **Total Hybrid Search** | **~900ms** |

## Cost Breakdown

| Service | Free Tier | Paid Estimate |
|---------|-----------|---------------|
| Workers | 100K req/day | $0.50/1M |
| Workers AI | 10K neurons/day | $0.011/1K |
| Vectorize | 30M queries/month | $0.04/1M |
| D1 | 5M reads/day | $0.001/1M |
| **Total** | **$0 most cases** | **~$5-15/month** |

## Dashboard

Access the interactive dashboard at `/dashboard`:

- 📊 **Stats Panel** - Vector count, document count
- 📥 **Ingest Form** - Add documents with auto-chunking
- 🔎 **Search Interface** - Test queries with latency monitor
- 🔑 **Auth Management** - Enter API key for protected endpoints

## Files

```
vectorize-mcp-worker/
├── src/
│   └── index.ts        # Main worker code
├── schema.sql          # D1 database schema
├── wrangler.toml       # Cloudflare configuration
├── package.json
└── README.md
```

## Local Development

```bash
# Start dev server
wrangler dev

# Note: Vectorize requires deployment to test
# D1 works locally with --local flag
```

## Troubleshooting

### "D1 binding not found"
```bash
wrangler d1 create mcp-knowledge-db
# Update wrangler.toml with database_id
wrangler d1 execute mcp-knowledge-db --remote --file=./schema.sql
```

### "Vectorize index not found"
```bash
wrangler vectorize create mcp-knowledge-base --dimensions=384 --metric=cosine
```

### "401 Unauthorized"
Either set an API key or remove it for dev mode:
```bash
wrangler secret put API_KEY    # Set for production
wrangler secret delete API_KEY # Remove for dev
```

### Empty search results
Ingest some documents first:
```bash
curl -X POST https://your-worker.workers.dev/ingest \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id": "test", "content": "Your content here"}'
```

## Contributing

Areas that need help:
1. **Multi-modal Support** - Images, tables, code
2. **Batch Ingestion** - Bulk document upload
3. **Analytics Dashboard** - Usage metrics
4. **Testing Suite** - Comprehensive tests
5. **Documentation** - More examples

## 💼 Professional Services

**Need help deploying?**

- **Setup:** $2,500 (one-time)
- **Timeline:** 48 hours
- **Includes:** Full configuration, up to 10K docs indexed, 2 weeks support

**[Hire me on Upwork](https://www.upwork.com/freelancers/~01d5946abaa558d9aa)**

## License

MIT License - see [LICENSE](LICENSE) file.

## Author

**Daniel Nwaneri** - Cloudflare Workers AI Specialist

- 🐦 Twitter: [@dannwaneri](https://twitter.com/dannwaneri)
- 💼 Upwork: [Profile](https://www.upwork.com/freelancers/~01d5946abaa558d9aa)
- 📝 Blog: [DEV.to](https://dev.to/dannwaneri)
- 🔗 GitHub: [@dannwaneri](https://github.com/dannwaneri)

---

**⭐ Star the repo if this saved you money!**

**💬 Questions? [Open an issue](https://github.com/dannwaneri/vectorize-mcp-worker/issues)**