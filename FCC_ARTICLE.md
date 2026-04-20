# How to Build a Self-Learning RAG System with Knowledge Reflection

Every RAG system I've seen — including the one I wrote a handbook about on this site — has the same fundamental problem.

It doesn't learn.

You ingest 500 documents. You ask a question. The system retrieves the three most similar chunks and hands them to the LLM. Repeat for the next query. The system knows exactly as much as it did on day one. It's a library that never builds a card catalog, never cross-references its own shelves, never notices that three of its books are saying contradictory things.

That's what I set out to fix with a knowledge reflection layer. After every ingest, the system finds semantically related documents already in the index and asks an LLM to synthesise what's new, how it connects, and what gap remains. That synthesis gets embedded, stored, and boosted in search results.

The knowledge base gets smarter as you add more documents — not just bigger.

This tutorial shows you exactly how to build it.

---

## What You'll Build

A post-ingest reflection pipeline that:

1. Fires automatically after every document ingest
2. Finds the most semantically related documents already in the index
3. Asks Kimi K2.5 to synthesise a three-sentence insight linking the new document to existing knowledge
4. Stores that reflection with `doc_type=reflection` and a 1.5× ranking boost in search results
5. Consolidates reflections into summaries every three ingests

By the end, searching your knowledge base surfaces both raw document chunks and reflection artifacts the system wrote on ingest.

---

## Prerequisites

This tutorial builds directly on the system from my earlier freeCodeCamp handbook: [Build a Production RAG System with Cloudflare Workers](https://www.freecodecamp.org/news/build-a-production-rag-system-with-cloudflare-workers-handbook). You'll need that foundation running before starting here.

You need:
- The Cloudflare Worker from the handbook deployed
- A Vectorize index with documents already ingested
- Node.js v18+ and Wrangler CLI installed
- Basic TypeScript familiarity

If you're starting fresh, complete the handbook first. The reflection layer is an extension — it doesn't make sense without the retrieval pipeline underneath it.

---

## Why Standard RAG Has a Memory Problem

Standard RAG retrieval is stateless. Every query goes in cold. The system has no memory of what it found before, no synthesis of what it learned across documents, no growing understanding of what questions remain unanswered.

Imagine you've ingested 200 documents about your product. Twelve of them touch on a pricing decision made last year. No single one has the full picture — it's distributed across quarterly reports, meeting notes, an internal Slack export, a few Notion pages.

A user asks: "Why did we change our pricing structure?"

Standard RAG retrieves the three most similar chunks. If those three chunks happen to collectively have the answer, great. If they don't — if the real answer requires synthesising across those twelve documents — the system has no mechanism for that. It returns fragments. The LLM makes its best guess.

The reflection layer addresses this directly. When the twelfth pricing document gets ingested, the system finds the eleven related documents, synthesises what connects them, and stores that synthesis as a retrievable artifact. The answer to "why did we change our pricing structure" exists in the index before anyone asks the question.

Not smarter retrieval — smarter indexing.

---

## Step 1: Schema Update

The reflection layer needs two new fields in your D1 documents table. Run this migration:

```sql
-- migrations/003_add_reflection_fields.sql
ALTER TABLE documents ADD COLUMN doc_type TEXT DEFAULT 'raw';
ALTER TABLE documents ADD COLUMN reflection_score REAL DEFAULT 0;
ALTER TABLE documents ADD COLUMN parent_reflection_id TEXT;
```

Apply it:

```bash
wrangler d1 execute mcp-knowledge-db --remote --file=./migrations/003_add_reflection_fields.sql
```

`doc_type` distinguishes raw documents (`raw`), single-document reflections (`reflection`), and consolidated multi-reflection summaries (`summary`). You'll use this field to filter — exposing only reflections to users who want the distilled view, or excluding them for users who want raw source chunks.

---

## Step 2: The Reflection Engine

Create `src/engines/reflection.ts`. This is the core of the layer.

```typescript
import { Env } from '../types/env';
import { resolveEmbeddingModel, resolveReflectionModel } from '../config/models';

const REFLECTION_BOOST = 1.5;
const CONSOLIDATION_THRESHOLD = 3; // consolidate every N new reflections

export async function reflect(
  newDocId: string,
  newDocContent: string,
  env: Env
): Promise<void> {
  // 1. Find semantically related documents already in the index
  const embModel = resolveEmbeddingModel(env.EMBEDDING_MODEL);
  const embResult = await env.AI.run(embModel.id as any, {
    text: [newDocContent.slice(0, 512)],
  });
  const queryVector = (embResult as any).data?.[0];
  if (!queryVector) return;

  const related = await env.VECTORIZE.query(queryVector, {
    topK: 5,
    filter: { doc_type: { $eq: 'raw' } },
    returnMetadata: 'all',
  });

  const relatedDocs = (related.matches ?? []).filter(
    m => m.id !== newDocId && (m.score ?? 0) > 0.65
  );

  if (relatedDocs.length === 0) return; // nothing related yet — skip

  // 2. Build synthesis prompt
  const relatedSummaries = relatedDocs
    .slice(0, 3)
    .map((m, i) => `Document ${i + 1}: ${String(m.metadata?.content ?? '').slice(0, 300)}`)
    .join('\n\n');

  const prompt = `You are synthesising knowledge across documents in a knowledge base.

New document:
${newDocContent.slice(0, 600)}

Related existing documents:
${relatedSummaries}

Write exactly three sentences:
1. What the new document adds that the existing documents don't already cover
2. How the new document connects to or extends the existing documents
3. What gap or question remains unanswered across all these documents

Be specific. Reference actual content. Do not summarise — synthesise.`;

  // 3. Call the reflection model
  const reflModel = resolveReflectionModel(env.REFLECTION_MODEL);
  const llmResp = await env.AI.run(reflModel.id as any, {
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 180,
  });

  const reflectionText = (llmResp as any)?.response?.trim();
  if (!reflectionText || reflectionText.length < 40) return;

  // 4. Embed and store the reflection
  const reflEmbResult = await env.AI.run(embModel.id as any, {
    text: [reflectionText],
  });
  const reflVector = (reflEmbResult as any).data?.[0];
  if (!reflVector) return;

  const reflectionId = `refl_${newDocId}_${Date.now()}`;

  await env.VECTORIZE.upsert([
    {
      id: reflectionId,
      values: reflVector,
      metadata: {
        content: reflectionText,
        doc_type: 'reflection',
        parent_id: newDocId,
        reflection_score: REFLECTION_BOOST,
        source_doc_ids: relatedDocs.map(m => m.id).join(','),
        date_created: new Date().toISOString(),
      },
    },
  ]);

  await env.DB.prepare(
    `INSERT INTO documents
     (id, content, doc_type, reflection_score, parent_id, date_created)
     VALUES (?, ?, 'reflection', ?, ?, ?)`
  )
    .bind(reflectionId, reflectionText, REFLECTION_BOOST, newDocId, new Date().toISOString())
    .run();

  // 5. Check if consolidation is due
  const recentCount = await env.DB
    .prepare(`SELECT COUNT(*) as cnt FROM documents WHERE doc_type = 'reflection' AND date_created > datetime('now', '-1 hour')`)
    .first<{ cnt: number }>();

  if ((recentCount?.cnt ?? 0) >= CONSOLIDATION_THRESHOLD) {
    await consolidate(env);
  }
}
```

Two things worth noting here.

The semantic threshold (`score > 0.65`) matters. Too low and you're synthesising unrelated documents. Too high and you're rarely finding connections. 0.65 works well with `bge-small`; bump it to 0.72 with `qwen3-0.6b` (1024d) where scores cluster higher.

The prompt structure is deliberate. Three sentences, each doing a specific job: what's new, how it connects, what remains. This keeps reflections useful for retrieval. A freeform synthesis prompt produces beautiful prose that doesn't retrieve well. This structure produces retrievable artifacts.

---

## Step 3: Consolidation

As reflections accumulate, they need their own synthesis layer — otherwise you're adding noise at a higher abstraction level.

Add this to `src/engines/reflection.ts`:

```typescript
export async function consolidate(env: Env): Promise<void> {
  // Fetch recent reflections not yet consolidated
  const recent = await env.DB
    .prepare(
      `SELECT id, content FROM documents
       WHERE doc_type = 'reflection'
       AND id NOT IN (
         SELECT DISTINCT parent_id FROM documents
         WHERE doc_type = 'summary' AND parent_id IS NOT NULL
       )
       ORDER BY date_created DESC
       LIMIT 6`
    )
    .all<{ id: string; content: string }>();

  if (!recent.results || recent.results.length < CONSOLIDATION_THRESHOLD) return;

  const reflectionTexts = recent.results.map((r, i) => `Reflection ${i + 1}: ${r.content}`).join('\n\n');

  const prompt = `You are consolidating multiple knowledge reflections into a single compressed insight.

${reflectionTexts}

Write two to three sentences that capture the most important cross-cutting pattern or tension across these reflections. What does the knowledge base now understand that it didn't before these documents were added? What's the most important open question?

Be precise. No preamble.`;

  const reflModel = resolveReflectionModel(env.REFLECTION_MODEL);
  const llmResp = await env.AI.run(reflModel.id as any, {
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 320,
  });

  const summaryText = (llmResp as any)?.response?.trim();
  if (!summaryText || summaryText.length < 40) return;

  const embModel = resolveEmbeddingModel(env.EMBEDDING_MODEL);
  const embResult = await env.AI.run(embModel.id as any, { text: [summaryText] });
  const summaryVector = (embResult as any).data?.[0];
  if (!summaryVector) return;

  const summaryId = `summary_${Date.now()}`;

  await env.VECTORIZE.upsert([
    {
      id: summaryId,
      values: summaryVector,
      metadata: {
        content: summaryText,
        doc_type: 'summary',
        reflection_score: REFLECTION_BOOST * 1.2,
        source_reflection_ids: recent.results.map(r => r.id).join(','),
        date_created: new Date().toISOString(),
      },
    },
  ]);

  await env.DB.prepare(
    `INSERT INTO documents (id, content, doc_type, reflection_score, date_created)
     VALUES (?, ?, 'summary', ?, ?)`
  )
    .bind(summaryId, summaryText, REFLECTION_BOOST * 1.2, new Date().toISOString())
    .run();
}
```

Summaries get a 1.2× multiplier on top of the base reflection boost. In search results, a summary synthesising twelve related documents should rank above any single document chunk on broad conceptual queries. On specific factual queries, the raw chunks will score higher. The ranking sorts itself.

---

## Step 4: Wire It Into Your Ingest Handler

The reflection runs as a background job. It doesn't block the ingest response — that would add 2–3 seconds to every ingest call.

In your `src/handlers/ingest.ts`, after you've stored the document:

```typescript
import { reflect } from '../engines/reflection';

// ... existing ingest logic ...

// After VECTORIZE.upsert() and DB insert succeed:
ctx.waitUntil(
  reflect(documentId, content, env).catch(err => {
    console.warn('[reflection] failed for', documentId, err.message);
  })
);

return new Response(JSON.stringify({
  success: true,
  documentId,
  chunks: chunkCount,
  // ... rest of response
}), { headers: { 'Content-Type': 'application/json' } });
```

`ctx.waitUntil()` is the Cloudflare Workers primitive for background work. The response returns immediately. The reflection runs after. The ingest API stays fast.

The `.catch()` is important. A failed reflection should never fail an ingest. Raw documents are the source of truth. Reflections are derived value — useful, but not critical path.

---

## Step 5: Boost Reflections in Search

Add the reflection boost to your ranking logic in `src/engines/hybrid.ts`. After RRF fusion and before returning results:

```typescript
// Apply reflection boost
const boosted = results.map(r => ({
  ...r,
  score: r.doc_type === 'reflection' || r.doc_type === 'summary'
    ? r.score * (r.reflection_score ?? 1.5)
    : r.score,
}));

return boosted.sort((a, b) => b.score - a.score);
```

This is a post-fusion boost, not a pre-fusion rerank. The reasoning: apply RRF across all results first, so reflections earn their place on raw relevance before getting boosted. A reflection that wouldn't rank in the top 20 on raw similarity shouldn't appear just because it has a boost multiplier.

---

## Step 6: Filtering by doc_type

Your search endpoint should accept a `doc_type` filter so callers can control what they see:

```typescript
// In your search request handler:
const docTypeFilter = body.filters?.doc_type;

// Pass to Vectorize query:
const vectorFilter: Record<string, unknown> = {};
if (docTypeFilter) {
  vectorFilter.doc_type = docTypeFilter;
}
```

This gives callers three modes:

```bash
# Only reflections and summaries
POST /search
{ "query": "pricing decisions", "filters": { "doc_type": { "$in": ["reflection", "summary"] } } }

# Only source documents
POST /search
{ "query": "pricing decisions", "filters": { "doc_type": { "$eq": "raw" } } }

# Default: all types, reflections boosted
POST /search
{ "query": "pricing decisions" }
```

The default (no filter) is the most useful. Let the boost do its job. Restrict to raw when you need citations. Restrict to reflections when you want the synthesised view.

---

## What Changes After You Build This

At 20 documents, you'll barely notice. At 2,000, the reflections are the system.

At 200 documents: noticeably different. Queries that previously returned five fragmented chunks now surface a reflection that already synthesised those chunks. Broad conceptual queries — "what do we know about X?" — start returning genuinely useful summaries instead of just the most-similar individual paragraph.

At 2,000 documents: the reflection layer is the most valuable part of the system. The raw chunks answer specific factual questions. The reflections and summaries answer conceptual questions that couldn't be answered from any single document.

One failure mode worth knowing: if your embedding model has poor semantic clustering (old `bge-small` at 384d with mixed-domain documents), the related-documents retrieval step will surface weak connections and produce shallow reflections. The 0.65 threshold filters most of this out, but if you're seeing reflections that seem off-topic, your embeddings are the first thing to check.

---

## Deploying

```bash
wrangler d1 execute mcp-knowledge-db --remote --file=./migrations/003_add_reflection_fields.sql
wrangler deploy
```

Then ingest a few documents and watch what happens:

```bash
# Ingest document 1
curl -X POST https://your-worker.workers.dev/ingest \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id": "doc-001", "content": "Your document text here..."}'

# After a few seconds, check if a reflection was created
curl "https://your-worker.workers.dev/search" \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "your topic", "filters": {"doc_type": {"$eq": "reflection"}}}'
```

Reflections won't appear until there are related documents to synthesise. Ingest at least three documents on similar topics before expecting to see them.

---

## What to Build Next

The reflection layer as described here fires after every ingest. That's expensive at high ingest volume — if you're batch-importing 10,000 documents, you don't want 10,000 individual reflection calls.

For bulk ingestion, gate it: call `reflect()` only when a document's similarity search returns a match above 0.8, or batch-run reflection after the bulk import completes. The `POST /ingest/batch` endpoint in the [full repo](https://github.com/dannwaneri/vectorize-mcp-worker) does this.

The second thing worth building: surfacing reflections in your UI with a visual distinction. A search result that's a reflection should look different from a raw chunk. In the dashboard included in the repo, reflections render with a `💡` badge and a "synthesised from N documents" note.

---

Full source at [github.com/dannwaneri/vectorize-mcp-worker](https://github.com/dannwaneri/vectorize-mcp-worker) — reflection engine, consolidation, batch ingest, dashboard, OpenAPI spec.

The codebase is TypeScript, deploys with a single `wrangler deploy`, runs for roughly $1–5/month at 10,000 queries/day.

Standard RAG retrieves. This learns.
