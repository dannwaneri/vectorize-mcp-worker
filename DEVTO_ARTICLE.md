# The Gap Karpathy Didn't Fill

I was debugging a customer support issue and typed the question into Claude.

Perfect answer. Wrong company. The model told me what the *general* best practice was for the problem category — accurate, well-reasoned, completely useless for my situation. Because the actual answer was in our internal runbook. Three paragraphs written eight months ago by a contractor who's since left. Not in any training set. Not in any index. Just sitting in a Notion page nobody searched anymore.

That's the gap Karpathy didn't fill.

---

## The Wikipedia Argument

Karpathy made a compelling point: LLMs are becoming the new Wikipedia. For general knowledge questions, just ask the model. Why build a retrieval pipeline to answer "what is gradient descent" when GPT-4 already knows it better than your docs ever will?

He's right, for that use case.

But most knowledge work isn't general knowledge questions. It's "what did we decide about the pricing model in Q3" and "which customer reported this exact error last month" and "what's the current state of the integration with Salesforce." None of that is in any model. None of it ever will be.

The moment your question is about *your* specific context — your decisions, your customers, your code, your history — you need retrieval. The LLM is still doing the reasoning. But it needs your data to reason over.

---

## The Cheap/Expensive Pipeline Problem

The frustrating thing about most RAG tutorials is they hand you the expensive version by default.

Every query embeds. Every query hits the vector index. Every query reruns the full pipeline, even for questions it's already answered. Cache? Optional. Keyword search for exact matches? Not shown. A model worth $0.003/call handling routing decisions? Never comes up.

The result: hobby projects that work fine, production deployments that surprise you at month end.

The routing insight that changed how I think about this: not every query needs vector search. "Show me documents tagged 'finance' from last week" is a SQL query. "Find anything mentioning GPT-4o" is BM25. "What do we know about our churn patterns" is the full vector pipeline. Running everything through embeddings when the first two cases cover maybe 40% of real-world queries is just waste.

V4 of this project classifies query intent first — SQL / BM25 / VECTOR / GRAPH / VISION / OCR — then routes accordingly. In testing, that cuts average embedding cost by 71% compared to running everything through vectors. The expensive path runs when it actually needs to.

---

## What's Actually Running

For anyone who wants the specific stack:

| Layer | What's used |
|-------|------------|
| Runtime | Cloudflare Workers (TypeScript) |
| Vector store | Cloudflare Vectorize |
| Keyword + metadata store | D1 (SQLite at the edge) |
| Embedding (default) | `@cf/qwen/qwen3-embedding-0.6b` — 1024d |
| Reranker | `@cf/baai/bge-reranker-base` |
| Vision / OCR | `@cf/meta/llama-4-scout-17b-16e-instruct` |
| Knowledge synthesis | `@cf/moonshot/kimi-k2.5` |
| Query routing | `@cf/meta/llama-3.2-3b-instruct` |
| MCP transport | Streamable HTTP via Cloudflare Durable Objects |

Everything on Cloudflare. No Pinecone account. No OpenAI bill for embeddings. No Redis for caching. The cache is the CF Cache API, which is global and free at reasonable volumes.

Rough cost at 1,000 queries/day with intelligent routing: ~$0.11/month. At 10,000/day: $1–5/month. The Workers free tier absorbs the first 100,000 requests/day with no compute charge.

---

## The Part That Surprised Me

The reflection layer was the thing I didn't expect to matter as much as it does.

Standard RAG retrieves documents. It doesn't learn. Every query goes in cold — no memory of patterns across documents, no synthesis of what the knowledge base collectively knows, no growing sense of what questions remain unanswered.

After every ingest, this system does three things: finds the most semantically related documents already in the index, asks an LLM to synthesise what's new, how it connects to what exists, and what gap remains. That synthesis — one paragraph, structured — gets embedded and stored as `doc_type=reflection`, with a 1.5× ranking boost in search results.

After every 3 ingests, it consolidates the recent reflections into a `doc_type=summary` — a compressed view of what the knowledge base has learned across that batch.

The effect: your knowledge base builds a second layer of meaning on top of raw documents. Related concepts get explicitly linked. Contradictions get surfaced. A search that previously returned five independent chunks now might also return a reflection that already synthesised those chunks into one coherent insight.

It's not magic. It's just LLM synthesis run as a background job, stored where retrieval can find it. But the result feels different from a flat document store in a way that's hard to describe until you see it return the reflection instead of the source.

Kimi K2.5 handles the reflection and consolidation by default. It has noticeably better multi-document reasoning than smaller models — worth the slightly higher cost for synthesis quality. Drop in `REFLECTION_MODEL=llama-3.2-3b` in your env if you want to reduce cost at high volume.

---

## Running It

```bash
git clone https://github.com/dannwaneri/vectorize-mcp-worker.git
cd vectorize-mcp-worker
npm install

# Create a 1024d Vectorize index (qwen3-0.6b default)
wrangler vectorize create mcp-knowledge-base --dimensions=1024 --metric=cosine

# Create D1 database
wrangler d1 create mcp-knowledge-db

# Configure, apply schema, deploy
cp wrangler.toml.example wrangler.toml
# paste your database_id into wrangler.toml
wrangler d1 execute mcp-knowledge-db --remote --file=./schema.sql
wrangler deploy

# Set API key
wrangler secret put API_KEY
```

Dashboard at `https://your-worker.workers.dev/dashboard`. OpenAPI spec at `/openapi.json` for Postman / Bruno / Insomnia.

Claude Desktop config:

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

Restart Claude Desktop. Six tools appear: `search`, `ingest`, `ingest_image_url`, `find_similar_by_url`, `delete`, `stats`.

---

## What This Is For

This isn't trying to be better than LLMs at general knowledge. It's making LLMs useful on *your* data — the knowledge that doesn't exist anywhere else, the decisions your team made that aren't in any training set, the documents that answer the questions your customers actually ask.

Most RAG tutorials hand you a demo. This is what happens when you build the thing properly: hybrid search, cross-encoder reranking, intelligent routing, knowledge synthesis, multi-tenancy, rate limiting, caching, a native MCP server, batch ingestion, and a test suite. In one deployable Worker. At boring prices.

The model knows everything except what you know. That asymmetry is the whole problem. Filling it doesn't have to be expensive.

---

*Full source: [github.com/dannwaneri/vectorize-mcp-worker](https://github.com/dannwaneri/vectorize-mcp-worker)*
