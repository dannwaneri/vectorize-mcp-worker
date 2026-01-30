export function getLlmsTxt(): string {
	return `# Vectorize MCP Worker
> Production-Grade Hybrid RAG on Cloudflare Edge

## Overview
A semantic search API combining vector similarity with BM25 keyword matching, using Reciprocal Rank Fusion (RRF) and cross-encoder reranking for optimal results.

## Capabilities
- Hybrid search (Vector + BM25)
- Reciprocal Rank Fusion
- Cross-encoder reranking
- Recursive document chunking with 15% overlap
- Sub-second latency at edge

## API Endpoints
- POST /search - Hybrid semantic search
- POST /ingest - Document ingestion with auto-chunking  
- DELETE /documents/:id - Remove documents
- GET /stats - Index statistics
- GET /dashboard - Interactive UI

## Technical Stack
- Runtime: Cloudflare Workers
- Vector DB: Cloudflare Vectorize
- SQL: Cloudflare D1
- Embedding: @cf/baai/bge-small-en-v1.5 (384 dimensions)
- Reranker: @cf/baai/bge-reranker-base

## Use Cases
- Knowledge base search
- Document retrieval
- Semantic Q&A systems
- RAG pipelines

## Integration
\`\`\`bash
curl -X POST /search -H "Content-Type: application/json" -d '{"query": "your question", "topK": 5}'
\`\`\`

## Author
Daniel Nwaneri - https://github.com/dannwaneri

## Links
- GitHub: https://github.com/dannwaneri/vectorize-mcp-worker
- Dashboard: /dashboard
`;
}