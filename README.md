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

## How We Compare to Pinecone

| Feature | Pinecone | This Project |
|---------|----------|--------------|
| **Monthly Cost** | $50+ minimum | ~$5/month |
| **Edge Deployment** | ❌ Cloud-only | ✅ Cloudflare Edge (210% faster than Lambda@Edge) |
| **Hybrid Search** | Requires workarounds | ✅ Native Vector + BM25 |
| **Cross-Encoder Reranking** | Basic | ✅ bge-reranker-base (+9.3% MRR improvement) |
| **MCP Integration** | ❌ None | ✅ Native (4,400+ MCP tools compatible) |
| **Licensing** | Recurring SaaS | ✅ One-time option available |
| **Vendor Lock-in** | High (proprietary) | Low (open source) |

> *"Pinecone is struggling with customer churn largely driven by cost concerns"* — VentureBeat

**Cost at scale:** Pinecone costs **10-30x more** at 60-80M+ monthly queries. Self-hosted alternatives become dramatically cheaper at scale.

**Accuracy:** Hybrid search with cross-encoder reranking achieves **66.43% MRR@5** vs 56.72% for semantic-only search — a **+9.3 percentage point improvement**.

## Features

### Core Search
- ✅ **Hybrid Search** - Vector similarity + BM25 keyword matching
- ✅ **Reciprocal Rank Fusion (RRF)** - Intelligent result merging
- ✅ **Cross-Encoder Reranking** - Precision scoring with `bge-reranker-base`
- ✅ **Recursive Chunking** - Semantic boundary-aware with 15% overlap

### Multimodal Search (NEW in V3!)
- ✅ **Image Ingestion** - Upload screenshots, diagrams, photos
- ✅ **Llama 4 Scout Vision** - AI-powered image understanding
- ✅ **OCR Extraction** - Automatic text extraction from images (700+ chars)
- ✅ **Reverse Image Search** - Find similar images by uploading a query image
- ✅ **Unified Index** - Text and images searchable together (384 dims)
- ✅ **60s Cache** - 0ms response time for repeated queries

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
    │    └─ BGE embeddings (384d)    │
    │                                ├──► RRF Fusion ──► Reranker ──► Results
    └──► Keyword Search (D1 BM25) ───┘
         └─ Term frequency/IDF

Images
    │
    ├──► Llama 4 Scout ──► Description (semantic)
    │                  └─► OCR Text (keywords)
    │
    └──► BGE Embeddings ──► Same 384d index

Performance: 
- Text search: ~900ms (first), 0ms (cached)
- Image ingest: ~7.7s (vision + OCR + embedding)
- Reverse search: ~8s (vision + search)
```

**Tech Stack:**
- **Runtime**: Cloudflare Workers
- **Vector DB**: Cloudflare Vectorize (384 dims, single unified index)
- **SQL DB**: Cloudflare D1 (BM25 keywords)
- **Embedding**: `@cf/baai/bge-small-en-v1.5`
- **Reranker**: `@cf/baai/bge-reranker-base`
- **Vision**: `@cf/meta/llama-4-scout-17b-16e-instruct` 

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


## Quick Demo

### Upload an Image
```bash
curl -X POST https://your-worker.workers.dev/ingest-image \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "id=dashboard-001" \
  -F "image=@dashboard.png" \
  -F "imageType=screenshot"
```

### Search by Description
```bash
curl -X POST https://your-worker.workers.dev/search \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "dashboard with navigation", "topK": 5}'
```

**Result:** Your image appears in search results! 🎉

### Find Similar Images
```bash
curl -X POST https://your-worker.workers.dev/find-similar-images \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "image=@similar-dashboard.png" \
  -F "topK=5"
```

**Result:** System finds visually similar dashboards you've indexed.


## API Endpoints


### Image Endpoints (NEW!)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ingest-image` | POST | Upload and index images with AI description + OCR |
| `/find-similar-images` | POST | Reverse image search - find visually similar images |

#### Image Ingestion Example
```bash
curl -X POST https://your-worker.workers.dev/ingest-image \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "id=screenshot-001" \
  -F "image=@dashboard.png" \
  -F "category=ui-screenshots" \
  -F "imageType=screenshot"
```

**Response:**
```json
{
  "success": true,
  "documentId": "screenshot-001",
  "description": "Dashboard interface with metrics cards showing...",
  "extractedText": "API Key\nEnter your API key\nTest\nServer Online...",
  "performance": {
    "multimodalProcessing": "4852ms",
    "totalTime": "7737ms"
  }
}
```

#### Reverse Image Search Example
```bash
curl -X POST https://your-worker.workers.dev/find-similar-images \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "image=@query.png" \
  -F "topK=5"
```

**Response:**
```json
{
  "query": "Dashboard interface with metrics cards...",
  "results": [
    {
      "id": "screenshot-001",
      "score": 0.0156,
      "content": "Dashboard interface...",
      "category": "ui-screenshots",
      "isImage": true
    }
  ],
  "performance": {
    "totalTime": "1135ms"
  }
}
```

**Image Types:**
- `screenshot` - UI screenshots (extracts button labels, form fields)
- `diagram` - Flowcharts, architecture diagrams
- `document` - Scanned documents, forms
- `chart` - Data visualizations
- `photo` - General photographs
- `auto` - Let AI determine (default)

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

Use this worker as a tool for Claude Desktop, Gemini CLI, or any MCP-compatible AI agent.

### Works with mcp-cli

This server is compatible with [mcp-cli](https://github.com/philschmid/mcp-cli) for efficient tool discovery:

```json
// Add to mcp_servers.json
{
  "mcpServers": {
    "vectorize": {
      "url": "https://your-worker.workers.dev",
      "headers": {
        "Authorization": "Bearer ${VECTORIZE_API_KEY}"
      }
    }
  }
}
```

```bash
# Discover tools
mcp-cli vectorize

# Get tool schema
mcp-cli vectorize/search

# Search your knowledge base
mcp-cli vectorize/search '{"query": "cloudflare workers", "topK": 5}'

# Ingest a document
mcp-cli vectorize/ingest '{"id": "doc-1", "content": "Your content here"}'
```

### Direct API Access

List Available Tools:
```bash
curl https://your-worker.workers.dev/mcp/tools
```

Call a Tool:
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
- `search` - Search the knowledge base (hybrid vector + BM25)
- `ingest` - Add text documents with auto-chunking
- `ingest_image` - Add images with AI description + OCR (NEW!)
- `stats` - Get index statistics
- `delete` - Remove documents
```

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

| Operation | Time | Notes |
|-----------|------|-------|
| Text Embedding | ~90ms | BGE-small-en |
| Vector Search | ~650ms | Vectorize query |
| Keyword Search (BM25) | ~50ms | D1 database |
| Reranking | ~120ms | Cross-encoder |
| **Hybrid Text Search** | **~900ms** | Full pipeline |
| **Cached Search** | **0ms** | 60s TTL cache |
| Image Vision + OCR | ~5s | Llama 4 Scout (2 calls) |
| Image Embedding | ~2s | BGE-small-en |
| **Image Ingestion** | **~7.7s** | Vision + OCR + embedding |
| **Reverse Image Search** | **~8s** | Vision + hybrid search |

## Cost Comparison

| Solution | Monthly Cost | Edge Native | Hybrid Search | MCP |
|----------|-------------|-------------|---------------|-----|
| **This Project** | **~$5** | ✅ | ✅ | ✅ |
| Pinecone | $50-200+ | ❌ | Partial | ❌ |
| Weaviate Cloud | $25-150+ | ❌ | ✅ | ❌ |
| Qdrant Cloud | $25-100+ | ❌ | ❌ | ❌ |
| pgvector (self-hosted) | $40-60+ | ❌ | ❌ | ❌ |

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

## Contributors

Thanks to these people for improving the project:

- [@luojiyin1987](https://github.com/luojiyin1987) - Bug reports and testing

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