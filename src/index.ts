export interface Env {
	AI: Ai;
	VECTORIZE: VectorizeIndex;
	DB: D1Database;
	API_KEY?: string;
}

// Types
interface Document {
	id: string;
	content: string;
	title?: string;
	source?: string;
	category?: string;
}

interface Chunk {
	id: string;
	content: string;
	parentId: string;
	chunkIndex: number;
}

interface SearchResult {
	id: string;
	content: string;
	score: number;
	category?: string;
	source: 'vector' | 'keyword' | 'hybrid';
}

interface HybridSearchResult extends SearchResult {
	vectorScore?: number;
	keywordScore?: number;
	rerankerScore?: number;
	rrfScore: number;
}

// Chunking Engine - respects semantic boundaries with 15% overlap
class ChunkingEngine {
	private maxChunkSize = 512;
	private overlapPercent = 0.15;
	private minChunkSize = 100;

	chunk(text: string, documentId: string): Chunk[] {
		const chunks: Chunk[] = [];
		const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
		let currentChunk = '';
		let chunkIndex = 0;
		const overlapSize = Math.floor(this.maxChunkSize * this.overlapPercent);

		for (const paragraph of paragraphs) {
			if ((currentChunk + '\n\n' + paragraph).length > this.maxChunkSize && currentChunk.trim()) {
				chunks.push({ id: `${documentId}-chunk-${chunkIndex++}`, content: currentChunk.trim(), parentId: documentId, chunkIndex: chunkIndex - 1 });
				currentChunk = currentChunk.slice(-overlapSize);
			}
			currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
		}
		if (currentChunk.trim().length >= this.minChunkSize) {
			chunks.push({ id: `${documentId}-chunk-${chunkIndex}`, content: currentChunk.trim(), parentId: documentId, chunkIndex });
		}
		return chunks.length > 0 ? chunks : [{ id: `${documentId}-chunk-0`, content: text.trim(), parentId: documentId, chunkIndex: 0 }];
	}
}

// Keyword Search Engine (BM25)
class KeywordSearchEngine {
	private k1 = 1.2;
	private b = 0.75;
	private stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'this', 'that', 'it', 'they', 'have', 'has', 'had']);

	tokenize(text: string): string[] {
		return text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(t => t.length > 2 && !this.stopWords.has(t));
	}

	async indexDocument(db: D1Database, docId: string, content: string): Promise<void> {
		const tokens = this.tokenize(content);
		const termFreq = new Map<string, number>();
		tokens.forEach(t => termFreq.set(t, (termFreq.get(t) || 0) + 1));

		const batch: D1PreparedStatement[] = [];
		for (const [term, count] of termFreq) {
			batch.push(db.prepare('INSERT INTO keywords (document_id, term, term_frequency) VALUES (?, ?, ?)').bind(docId, term, count));
			batch.push(db.prepare('INSERT INTO term_stats (term, document_frequency) VALUES (?, 1) ON CONFLICT(term) DO UPDATE SET document_frequency = document_frequency + 1').bind(term));
		}
		batch.push(db.prepare('UPDATE doc_stats SET total_documents = total_documents + 1, avg_doc_length = ((avg_doc_length * total_documents) + ?) / (total_documents + 1) WHERE id = 1').bind(tokens.length));
		if (batch.length > 0) await db.batch(batch);
	}

	async search(db: D1Database, query: string, topK: number): Promise<SearchResult[]> {
		const tokens = this.tokenize(query);
		if (!tokens.length) return [];

		const stats = await db.prepare('SELECT total_documents, avg_doc_length FROM doc_stats WHERE id = 1').first<{ total_documents: number; avg_doc_length: number }>();
		if (!stats?.total_documents) return [];

		const placeholders = tokens.map(() => '?').join(',');
		const results = await db.prepare(`SELECT d.id, d.content, d.category, k.term, k.term_frequency, LENGTH(d.content) as doc_length, ts.document_frequency FROM documents d JOIN keywords k ON d.id = k.document_id JOIN term_stats ts ON k.term = ts.term WHERE k.term IN (${placeholders})`).bind(...tokens).all<{ id: string; content: string; category: string; term_frequency: number; doc_length: number; document_frequency: number }>();

		const scores = new Map<string, { score: number; content: string; category: string }>();
		for (const r of results.results) {
			const idf = Math.log((stats.total_documents - r.document_frequency + 0.5) / (r.document_frequency + 0.5) + 1);
			const tf = (r.term_frequency * (this.k1 + 1)) / (r.term_frequency + this.k1 * (1 - this.b + this.b * (r.doc_length / stats.avg_doc_length)));
			const existing = scores.get(r.id);
			if (existing) existing.score += idf * tf;
			else scores.set(r.id, { score: idf * tf, content: r.content, category: r.category });
		}

		return Array.from(scores.entries()).sort((a, b) => b[1].score - a[1].score).slice(0, topK).map(([id, d]) => ({ id, content: d.content, score: d.score, category: d.category, source: 'keyword' as const }));
	}
}

// Hybrid Search with RRF
class HybridSearchEngine {
	private rrfK = 60;
	private keywordEngine = new KeywordSearchEngine();

	reciprocalRankFusion(vectorResults: SearchResult[], keywordResults: SearchResult[]): HybridSearchResult[] {
		const scores = new Map<string, HybridSearchResult>();
		vectorResults.forEach((r, rank) => scores.set(r.id, { ...r, vectorScore: r.score, rrfScore: 1 / (this.rrfK + rank + 1), source: 'hybrid' }));
		keywordResults.forEach((r, rank) => {
			const existing = scores.get(r.id);
			if (existing) { existing.keywordScore = r.score; existing.rrfScore += 1 / (this.rrfK + rank + 1); }
			else scores.set(r.id, { ...r, keywordScore: r.score, rrfScore: 1 / (this.rrfK + rank + 1), source: 'hybrid' });
		});
		return Array.from(scores.values()).sort((a, b) => b.rrfScore - a.rrfScore);
	}

	async search(query: string, env: Env, topK: number, useReranker: boolean): Promise<{ results: HybridSearchResult[]; performance: Record<string, string> }> {
		const start = Date.now();
		const perf: Record<string, string> = {};

		// Vector search
		const embStart = Date.now();
		const embResp = await env.AI.run('@cf/baai/bge-small-en-v1.5', { text: query });
		const embedding = Array.isArray(embResp) ? embResp : (embResp as any).data[0];
		perf.embeddingTime = `${Date.now() - embStart}ms`;

		const vecStart = Date.now();
		const vecResults = await env.VECTORIZE.query(embedding, { topK: topK * 2, returnMetadata: true });
		perf.vectorSearchTime = `${Date.now() - vecStart}ms`;

		const vectorSearchResults: SearchResult[] = vecResults.matches.map(m => ({ id: m.id, content: (m.metadata?.content as string) || '', score: m.score, category: m.metadata?.category as string, source: 'vector' as const }));

		// Keyword search (if D1 available)
		let keywordResults: SearchResult[] = [];
		if (env.DB) {
			const kwStart = Date.now();
			keywordResults = await this.keywordEngine.search(env.DB, query, topK * 2);
			perf.keywordSearchTime = `${Date.now() - kwStart}ms`;
		}

		// RRF
		let results = this.reciprocalRankFusion(vectorSearchResults, keywordResults);

		// Rerank
		if (useReranker && results.length > 0) {
			const reStart = Date.now();
			try {
				const reResp = await env.AI.run('@cf/baai/bge-reranker-base', { query, contexts: results.slice(0, 10).map(r => ({ text: r.content })) } as any);
				results = results.slice(0, 10).map((r, i) => ({ ...r, rerankerScore: (reResp as any)?.data?.[i]?.score || 0, rrfScore: r.rrfScore * 0.4 + ((reResp as any)?.data?.[i]?.score || 0) * 0.6 })).sort((a, b) => b.rrfScore - a.rrfScore);
			} catch (e) { console.error('Reranker error:', e); }
			perf.rerankerTime = `${Date.now() - reStart}ms`;
		}

		perf.totalTime = `${Date.now() - start}ms`;
		return { results: results.slice(0, topK), performance: perf };
	}
}

// Ingestion Engine
class IngestionEngine {
	private chunker = new ChunkingEngine();
	private kwEngine = new KeywordSearchEngine();

	async ingest(doc: Document, env: Env): Promise<{ success: boolean; chunks: number; performance: Record<string, string> }> {
		const start = Date.now();
		const perf: Record<string, string> = {};

		// De-duplicate
		if (env.DB) {
			const existing = await env.DB.prepare('SELECT id FROM documents WHERE id = ? OR parent_id = ?').bind(doc.id, doc.id).first();
			if (existing) await this.delete(doc.id, env);
		}

		const chunks = this.chunker.chunk(doc.content, doc.id);
		const vectors: VectorizeVector[] = [];

		const embStart = Date.now();
		for (const chunk of chunks) {
			if (env.DB) {
				await env.DB.prepare('INSERT INTO documents (id, content, title, source, category, chunk_index, parent_id, word_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(chunk.id, chunk.content, doc.title || null, doc.source || null, doc.category || null, chunk.chunkIndex, chunk.parentId, chunk.content.split(/\s+/).length).run();
				await this.kwEngine.indexDocument(env.DB, chunk.id, chunk.content);
			}
			const embResp = await env.AI.run('@cf/baai/bge-small-en-v1.5', { text: chunk.content });
			const emb = Array.isArray(embResp) ? embResp : (embResp as any).data[0];
			vectors.push({ id: chunk.id, values: emb, metadata: { content: chunk.content, category: doc.category || '', parentId: chunk.parentId, chunkIndex: chunk.chunkIndex } });
		}
		perf.embeddingTime = `${Date.now() - embStart}ms`;

		if (vectors.length) await env.VECTORIZE.upsert(vectors);
		perf.totalTime = `${Date.now() - start}ms`;

		return { success: true, chunks: chunks.length, performance: perf };
	}

	async delete(docId: string, env: Env): Promise<void> {
		if (env.DB) {
			const chunks = await env.DB.prepare('SELECT id FROM documents WHERE id = ? OR parent_id = ?').bind(docId, docId).all<{ id: string }>();
			const ids = chunks.results.map(c => c.id);
			if (ids.length) {
				await env.VECTORIZE.deleteByIds(ids);
				await env.DB.prepare('DELETE FROM documents WHERE id = ? OR parent_id = ?').bind(docId, docId).run();
			}
		}
	}
}

const hybridSearch = new HybridSearchEngine();
const ingestion = new IngestionEngine();

// Authentication middleware
function authenticate(request: Request, env: Env): Response | null {
	const url = new URL(request.url);
	
	// Skip auth for test endpoint and root
	if (url.pathname === "/" || url.pathname === "/test") {
		return null;
	}

	// If API_KEY is not set, allow all requests (development mode)
	if (!env.API_KEY) {
		return null;
	}

	// Check for Authorization header
	const authHeader = request.headers.get("Authorization");
	
	if (!authHeader) {
		return new Response(
			JSON.stringify({
				error: "Missing Authorization header",
				hint: "Include 'Authorization: Bearer YOUR_API_KEY' in your request",
			}),
			{
				status: 401,
				headers: { "Content-Type": "application/json" },
			}
		);
	}

	// Validate Bearer token format
	const token = authHeader.replace("Bearer ", "");
	
	if (token !== env.API_KEY) {
		return new Response(
			JSON.stringify({
				error: "Invalid API key",
			}),
			{
				status: 403,
				headers: { "Content-Type": "application/json" },
			}
		);
	}

	return null; // Authentication successful
}

// CORS headers helper
function corsHeaders() {
	return {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
	};
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// Handle CORS preflight
		if (request.method === "OPTIONS") {
			return new Response(null, {
				headers: corsHeaders(),
			});
		}

		// Authenticate request
		const authError = authenticate(request, env);
		if (authError) {
			return authError;
		}

		// Root endpoint - API documentation
		if (url.pathname === "/" && request.method === "GET") {
			return new Response(
				JSON.stringify({
					name: "Vectorize MCP Worker",
					version: "2.0.0",
					description: "Production-Grade Hybrid RAG on Cloudflare Edge",
					features: [
						"Hybrid Search (Vector + BM25)",
						"Reciprocal Rank Fusion (RRF)",
						"Cross-Encoder Reranking",
						"Recursive Chunking with 15% overlap",
					],
					endpoints: {
						"GET /": "API documentation",
						"GET /test": "Health check",
						"GET /stats": "Index statistics",
						"POST /search": "Hybrid search (query, topK, rerank)",
						"POST /ingest": "Ingest document with auto-chunking",
						"DELETE /documents/:id": "Delete document",
					},
					models: {
						embedding: "@cf/baai/bge-small-en-v1.5",
						reranker: "@cf/baai/bge-reranker-base",
					},
					authentication: env.API_KEY ? "required" : "disabled (dev mode)",
					docs: "https://github.com/dannwaneri/vectorize-mcp-worker",
				}),
				{
					headers: { 
						"Content-Type": "application/json",
						...corsHeaders(),
					},
				}
			);
		}

		// Test endpoint to check bindings
		if (url.pathname === "/test" && request.method === "GET") {
			let dbOk = false;
			if (env.DB) { try { await env.DB.prepare('SELECT 1').first(); dbOk = true; } catch {} }
			return new Response(
				JSON.stringify({
					status: "healthy",
					timestamp: new Date().toISOString(),
					bindings: {
						hasAI: !!env.AI,
						hasVectorize: !!env.VECTORIZE,
						hasD1: !!env.DB && dbOk,
						hasAPIKey: !!env.API_KEY,
					},
					mode: env.API_KEY ? "production" : "development",
				}),
				{
					headers: { 
						"Content-Type": "application/json",
						...corsHeaders(),
					},
				}
			);
		}

		// Stats endpoint
		if (url.pathname === "/stats" && request.method === "GET") {
			try {
				const stats = await env.VECTORIZE.describe();
				let docStats = null;
				if (env.DB) {
					docStats = await env.DB.prepare('SELECT total_documents, avg_doc_length FROM doc_stats WHERE id = 1').first();
				}
				return new Response(
					JSON.stringify({
						index: stats,
						documents: docStats,
						model: "@cf/baai/bge-small-en-v1.5",
						dimensions: 384,
					}),
					{
						headers: { 
							"Content-Type": "application/json",
							...corsHeaders(),
						},
					}
				);
			} catch (error) {
				return new Response(
					JSON.stringify({
						error: "Failed to get stats",
						message: error instanceof Error ? error.message : "Unknown error",
					}),
					{
						status: 500,
						headers: { 
							"Content-Type": "application/json",
							...corsHeaders(),
						},
					}
				);
			}
		}

		// Hybrid Search
		if (url.pathname === "/search" && request.method === "POST") {
			try {
				const body = await request.json<{ query: string; topK?: number; rerank?: boolean }>();
				if (!body.query) {
					return new Response(JSON.stringify({ error: "Missing 'query' field in request body" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } });
				}
				const topK = body.topK || 5;
				if (topK < 1 || topK > 20) {
					return new Response(JSON.stringify({ error: "topK must be between 1 and 20" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } });
				}
				const { results, performance } = await hybridSearch.search(body.query, env, topK, body.rerank !== false);
				return new Response(
					JSON.stringify({
						query: body.query,
						topK,
						resultsCount: results.length,
						results: results.map(r => ({ id: r.id, score: r.rrfScore, content: r.content, category: r.category, scores: { vector: r.vectorScore, keyword: r.keywordScore, reranker: r.rerankerScore } })),
						performance,
					}),
					{ headers: { "Content-Type": "application/json", ...corsHeaders() } }
				);
			} catch {
				return new Response(JSON.stringify({ error: "Invalid JSON in request body" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } });
			}
		}

		// Ingest Document
		if (url.pathname === "/ingest" && request.method === "POST") {
			try {
				const body = await request.json<Document>();
				if (!body.id || typeof body.id !== 'string') {
					return new Response(JSON.stringify({ error: "Missing or invalid id" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } });
				}
				if (!body.content || typeof body.content !== 'string') {
					return new Response(JSON.stringify({ error: "Missing or invalid content" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } });
				}
				const result = await ingestion.ingest(body, env);
				return new Response(JSON.stringify({ success: true, documentId: body.id, chunksCreated: result.chunks, performance: result.performance }), { headers: { "Content-Type": "application/json", ...corsHeaders() } });
			} catch (error) {
				return new Response(JSON.stringify({ error: "Ingest failed", message: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } });
			}
		}

		// Delete Document
		if (url.pathname.startsWith("/documents/") && request.method === "DELETE") {
			const docId = url.pathname.replace("/documents/", "");
			if (!docId) {
				return new Response(JSON.stringify({ error: "Document ID required" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } });
			}
			await ingestion.delete(docId, env);
			return new Response(JSON.stringify({ success: true, deleted: docId }), { headers: { "Content-Type": "application/json", ...corsHeaders() } });
		}

		// 404 for unknown routes
		return new Response(
			JSON.stringify({
				error: "Not found",
				hint: "Visit GET / for API documentation",
			}),
			{
				status: 404,
				headers: { 
					"Content-Type": "application/json",
					...corsHeaders(),
				},
			}
		);
	},
};