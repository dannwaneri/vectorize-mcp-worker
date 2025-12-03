# Vectorize MCP Worker

A Cloudflare Worker that provides embedding generation and semantic search capabilities for MCP (Model Context Protocol) servers.

## Features

- **Embedding Generation**: Convert text to 384-dimensional vectors using Workers AI (`bge-small-en-v1.5`)
- **Semantic Search**: Query Vectorize index with natural language
- **Populate Endpoint**: Batch insert embeddings into Vectorize
- **Edge Deployment**: Runs globally on Cloudflare's network

## Architecture
```
User/MCP Client → Worker → Workers AI (embeddings) → Vectorize (search)
```

## Prerequisites

- Cloudflare account with Workers enabled
- Wrangler CLI installed
- Vectorize index created

## Setup

**1. Clone and install:**
```bash
git clone https://github.com/dannwaneri/vectorize-mcp-worker.git
cd vectorize-mcp-worker
npm install
```

**2. Create Vectorize index:**
```bash
wrangler vectorize create mcp-knowledge-base --dimensions=384 --metric=cosine
```

**3. Configure `wrangler.jsonc`:**
```jsonc
{
  "name": "vectorize-mcp-worker",
  "main": "src/index.ts",
  "compatibility_date": "2025-12-02",
  "compatibility_flags": ["nodejs_compat"],
  "ai": {
    "binding": "AI"
  },
  "vectorize": [
    {
      "binding": "VECTORIZE",
      "index_name": "mcp-knowledge-base"
    }
  ]
}
```

**4. Deploy:**
```bash
wrangler deploy
```

## Usage

### Populate the Index
```bash
curl -X POST https://your-worker.workers.dev/populate
```

Response:
```json
{
  "success": true,
  "message": "Inserted 8 vectors into the index"
}
```

### Search the Index
```bash
curl -X POST https://your-worker.workers.dev/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "vector databases",
    "topK": 3
  }'
```

Response:
```json
{
  "query": "vector databases",
  "topK": 3,
  "resultsCount": 3,
  "results": [
    {
      "id": "3",
      "score": 0.7357,
      "content": "Vectorize supports vector dimensions up to 1536...",
      "category": "vectorize"
    }
  ]
}
```

## API Endpoints

### `POST /populate`
Generates embeddings for knowledge base entries and inserts them into Vectorize.

**Response:**
- `success`: Boolean indicating success
- `message`: Number of vectors inserted

### `POST /search`
Performs semantic search on the Vectorize index.

**Request Body:**
```json
{
  "query": "search query",
  "topK": 5
}
```

**Response:**
- `query`: Original search query
- `topK`: Number of results requested
- `resultsCount`: Actual number of results returned
- `results`: Array of matching entries with scores

## Knowledge Base

The worker includes a predefined knowledge base about Cloudflare technologies. Edit the `knowledgeBase` array in `src/index.ts` to customize:
```typescript
const knowledgeBase = [
  {
    id: "1",
    content: "Your content here",
    category: "your-category",
  },
  // ... more entries
];
```

## Technology Stack

- **Cloudflare Workers**: Serverless execution environment
- **Workers AI**: `@cf/baai/bge-small-en-v1.5` embedding model (384 dimensions)
- **Vectorize**: Vector database with HNSW indexing
- **TypeScript**: Type-safe development

## Performance

- **Embedding generation**: ~18ms per query
- **Vector search**: ~8ms for 10k vectors
- **Total latency**: 40-50ms globally
- **Dimensions**: 384 (optimized for edge deployment)
- **Similarity metric**: Cosine similarity

## Related Projects

- [vectorize-mcp-server](https://github.com/dannwaneri/vectorize-mcp-server) - Local MCP server that calls this Worker
- [mcp-server-worker](https://github.com/dannwaneri/mcp-server-worker) - Full HTTP-based MCP server on Workers

## Local Development
```bash
wrangler dev
```

Access at `http://localhost:8787`

## Production Considerations

**Add authentication:**
```typescript
const apiKey = request.headers.get("Authorization");
if (apiKey !== env.API_KEY) {
  return new Response("Unauthorized", { status: 401 });
}
```

**Add rate limiting** using Durable Objects or Workers KV

**Monitor with Analytics Engine** for performance tracking

## License

MIT

## Author

Daniel Nwaneri - [GitHub](https://github.com/dannwaneri) | [Upwork](https://www.upwork.com/freelancers/~01d5946abaa558d9aa)