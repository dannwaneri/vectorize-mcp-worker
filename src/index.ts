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
	
	// Skip auth for test endpoint, root, dashboard, and llms.txt
	if (url.pathname === "/" || url.pathname === "/test" || url.pathname === "/dashboard" || url.pathname === "/llms.txt") {
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
						"One-time License System",
					],
					endpoints: {
						"GET /": "API documentation",
						"GET /dashboard": "Interactive playground UI",
						"GET /llms.txt": "AI search engine info",
						"GET /test": "Health check",
						"GET /stats": "Index statistics",
						"POST /search": "Hybrid search (query, topK, rerank)",
						"POST /ingest": "Ingest document with auto-chunking",
						"DELETE /documents/:id": "Delete document",
						"POST /license/validate": "Validate a license key",
						"POST /license/create": "Create license (admin)",
						"GET /license/list": "List all licenses (admin)",
						"POST /license/revoke": "Revoke a license (admin)",
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

		// Dashboard - Interactive Playground
		if (url.pathname === "/dashboard" && request.method === "GET") {
			return new Response(getDashboardHTML(), {
				headers: { "Content-Type": "text/html" },
			});
		}

		// llms.txt - AI search engine optimization
		if (url.pathname === "/llms.txt" && request.method === "GET") {
			return new Response(getLlmsTxt(), {
				headers: { "Content-Type": "text/plain" },
			});
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

		// License: Validate
		if (url.pathname === "/license/validate" && request.method === "POST") {
			try {
				const body = await request.json<{ license_key: string }>();
				if (!body.license_key) {
					return new Response(JSON.stringify({ valid: false, error: "Missing license_key" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } });
				}
				const license = await env.DB.prepare("SELECT * FROM licenses WHERE license_key = ? AND is_active = 1").bind(body.license_key).first<{ license_key: string; email: string; plan: string; max_documents: number; max_queries_per_day: number; created_at: string }>();
				if (!license) {
					return new Response(JSON.stringify({ valid: false, error: "Invalid or inactive license" }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders() } });
				}
				return new Response(JSON.stringify({ valid: true, plan: license.plan, limits: { maxDocuments: license.max_documents, maxQueriesPerDay: license.max_queries_per_day }, createdAt: license.created_at }), { headers: { "Content-Type": "application/json", ...corsHeaders() } });
			} catch (error) {
				return new Response(JSON.stringify({ valid: false, error: "Validation failed" }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } });
			}
		}

		// License: Create (admin only - requires API_KEY)
		if (url.pathname === "/license/create" && request.method === "POST") {
			try {
				const body = await request.json<{ email: string; plan?: string; max_documents?: number; max_queries_per_day?: number }>();
				if (!body.email) {
					return new Response(JSON.stringify({ error: "Email required" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } });
				}
				const licenseKey = `lic_${crypto.randomUUID().replace(/-/g, '')}`;
				const plan = body.plan || 'standard';
				const maxDocs = body.max_documents || (plan === 'enterprise' ? 100000 : plan === 'pro' ? 50000 : 10000);
				const maxQueries = body.max_queries_per_day || (plan === 'enterprise' ? 10000 : plan === 'pro' ? 5000 : 1000);
				await env.DB.prepare("INSERT INTO licenses (license_key, email, plan, max_documents, max_queries_per_day) VALUES (?, ?, ?, ?, ?)").bind(licenseKey, body.email, plan, maxDocs, maxQueries).run();
				return new Response(JSON.stringify({ success: true, license_key: licenseKey, email: body.email, plan, limits: { maxDocuments: maxDocs, maxQueriesPerDay: maxQueries } }), { headers: { "Content-Type": "application/json", ...corsHeaders() } });
			} catch (error) {
				return new Response(JSON.stringify({ error: "Failed to create license", message: error instanceof Error ? error.message : "Unknown" }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } });
			}
		}

		// License: List (admin only)
		if (url.pathname === "/license/list" && request.method === "GET") {
			try {
				const licenses = await env.DB.prepare("SELECT license_key, email, plan, max_documents, max_queries_per_day, created_at, is_active FROM licenses ORDER BY created_at DESC LIMIT 100").all();
				return new Response(JSON.stringify({ licenses: licenses.results }), { headers: { "Content-Type": "application/json", ...corsHeaders() } });
			} catch (error) {
				return new Response(JSON.stringify({ error: "Failed to list licenses" }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } });
			}
		}

		// License: Revoke (admin only)
		if (url.pathname === "/license/revoke" && request.method === "POST") {
			try {
				const body = await request.json<{ license_key: string }>();
				if (!body.license_key) {
					return new Response(JSON.stringify({ error: "license_key required" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } });
				}
				await env.DB.prepare("UPDATE licenses SET is_active = 0 WHERE license_key = ?").bind(body.license_key).run();
				return new Response(JSON.stringify({ success: true, revoked: body.license_key }), { headers: { "Content-Type": "application/json", ...corsHeaders() } });
			} catch (error) {
				return new Response(JSON.stringify({ error: "Failed to revoke license" }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } });
			}
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

// Dashboard HTML
function getDashboardHTML(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vectorize MCP Worker - Dashboard</title>
<meta name="description" content="Production-Grade Hybrid RAG on Cloudflare Edge with Vector + BM25 search, RRF, and reranking">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Vectorize MCP Worker",
  "description": "Production-Grade Hybrid RAG on Cloudflare Edge combining vector similarity with BM25 keyword matching",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "Cloudflare Workers",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "author": {
    "@type": "Person",
    "name": "Danny Waneri",
    "url": "https://github.com/dannwaneri"
  },
  "softwareVersion": "2.0.0",
  "url": "https://github.com/dannwaneri/vectorize-mcp-worker"
}
</script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;min-height:100vh;padding:12px}
.container{max-width:1200px;margin:0 auto}
h1{font-size:1.3rem;margin-bottom:8px;color:#fff}
.subtitle{color:#888;margin-bottom:20px;font-size:0.85rem}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.card{background:#171717;border:1px solid #262626;border-radius:12px;padding:16px}
.card h2{font-size:0.95rem;margin-bottom:14px;color:#fff;display:flex;align-items:center;gap:8px}
.card h2 span{font-size:1.1rem}
label{display:block;font-size:0.75rem;color:#888;margin-bottom:6px}
input,textarea,select{width:100%;padding:10px 12px;background:#262626;border:1px solid #404040;border-radius:8px;color:#fff;font-size:16px;margin-bottom:12px}
input:focus,textarea:focus{outline:none;border-color:#3b82f6}
textarea{resize:vertical;min-height:100px;font-family:inherit}
button{background:#3b82f6;color:#fff;border:none;padding:10px 16px;border-radius:8px;cursor:pointer;font-size:0.9rem;font-weight:500;width:100%;transition:background 0.2s}
button:hover{background:#2563eb}
button:disabled{background:#404040;cursor:not-allowed}
.stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}
.stat{background:#262626;padding:10px;border-radius:8px;text-align:center}
.stat-value{font-size:1.1rem;font-weight:600;color:#3b82f6}
.stat-label{font-size:0.65rem;color:#888;margin-top:4px}
.results{margin-top:14px;max-height:350px;overflow-y:auto}
.result{background:#262626;padding:10px;border-radius:8px;margin-bottom:8px;border-left:3px solid #3b82f6}
.result-header{display:flex;justify-content:space-between;margin-bottom:6px;flex-wrap:wrap;gap:4px}
.result-id{font-size:0.7rem;color:#888;word-break:break-all}
.result-score{font-size:0.7rem;color:#22c55e;font-weight:600}
.result-content{font-size:0.8rem;color:#d4d4d4;line-height:1.4;word-break:break-word}
.result-category{display:inline-block;font-size:0.65rem;background:#3b82f6;color:#fff;padding:2px 6px;border-radius:4px;margin-top:6px}
.perf{margin-top:14px;padding:10px;background:#262626;border-radius:8px}
.perf-title{font-size:0.7rem;color:#888;margin-bottom:6px}
.perf-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
.perf-item{font-size:0.75rem}
.perf-item span{color:#22c55e}
.log{font-size:0.75rem;color:#888;margin-top:8px;padding:8px;background:#1a1a1a;border-radius:4px;max-height:80px;overflow-y:auto;word-break:break-word}
.success{color:#22c55e}
.error{color:#ef4444}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:0.7rem;margin-left:8px}
.badge-green{background:#166534;color:#86efac}
.badge-yellow{background:#854d0e;color:#fef08a}
.auth-section{margin-bottom:16px;padding:14px;background:#1c1917;border:1px solid #44403c;border-radius:8px}
.auth-section label{color:#fbbf24}
.flex{display:flex;gap:8px}
.flex input{margin-bottom:0;flex:1}
.flex button{width:auto;padding:10px 16px;flex-shrink:0}
.search-row{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.search-row input{flex:1;min-width:150px;margin-bottom:0}
.search-row select{width:70px;margin-bottom:0;flex-shrink:0}
.search-row button{width:auto;padding:10px 20px;flex-shrink:0}
@media(max-width:768px){
.grid{grid-template-columns:1fr}
.grid .card:last-child{grid-column:1}
.stats-grid{grid-template-columns:repeat(3,1fr)}
.perf-grid{grid-template-columns:1fr}
.search-row{flex-direction:column}
.search-row input,.search-row select,.search-row button{width:100%}
body{padding:10px}
}
</style>
</head>
<body>
<div class="container">
<h1>🔍 Vectorize MCP Worker</h1>
<p class="subtitle">Production-Grade Hybrid RAG on Cloudflare Edge</p>

<div class="auth-section">
<label>🔑 API Key (required for protected endpoints)</label>
<div class="flex">
<input type="password" id="apiKey" placeholder="Enter your API key">
<button onclick="testAuth()">Test</button>
</div>
<div id="authStatus" class="log" style="display:none"></div>
</div>

<div class="grid">
<div class="card">
<h2><span>📊</span> Stats</h2>
<div class="stats-grid">
<div class="stat"><div class="stat-value" id="vectorCount">-</div><div class="stat-label">Vectors</div></div>
<div class="stat"><div class="stat-value" id="docCount">-</div><div class="stat-label">Documents</div></div>
<div class="stat"><div class="stat-value" id="dimensions">-</div><div class="stat-label">Dimensions</div></div>
</div>
<button onclick="loadStats()">Refresh Stats</button>
</div>

<div class="card">
<h2><span>📥</span> Ingest Document</h2>
<label>Document ID</label>
<input type="text" id="docId" placeholder="unique-doc-id">
<label>Category (optional)</label>
<input type="text" id="docCategory" placeholder="e.g., technical, product">
<label>Content</label>
<textarea id="docContent" placeholder="Paste your document content here..."></textarea>
<button onclick="ingestDoc()">Ingest Document</button>
<div id="ingestLog" class="log" style="display:none"></div>
</div>

<div class="card" style="grid-column:span 2">
<h2><span>🔎</span> Search</h2>
<div class="search-row">
<input type="text" id="searchQuery" placeholder="Enter your search query...">
<select id="topK">
<option value="3">Top 3</option>
<option value="5" selected>Top 5</option>
<option value="10">Top 10</option>
</select>
<button onclick="search()">Search</button>
</div>
<label><input type="checkbox" id="useRerank" checked> Use Reranker</label>
<div id="searchResults" class="results"></div>
<div id="searchPerf" class="perf" style="display:none">
<div class="perf-title">⚡ Performance</div>
<div class="perf-grid" id="perfGrid"></div>
</div>
</div>
</div>
</div>

<script>
const API_BASE = '';
const getHeaders = () => {
const h = {'Content-Type':'application/json'};
const key = document.getElementById('apiKey').value;
if(key) h['Authorization'] = 'Bearer ' + key;
return h;
};

async function testAuth(){
const el = document.getElementById('authStatus');
el.style.display = 'block';
el.innerHTML = 'Testing...';
try {
const r = await fetch(API_BASE + '/test');
const d = await r.json();
el.innerHTML = '<span class="success">✓ Connected</span> | Mode: ' + d.mode + ' | D1: ' + (d.bindings.hasD1?'✓':'✗');
} catch(e) { el.innerHTML = '<span class="error">✗ ' + e.message + '</span>'; }
}

async function loadStats(){
try {
const r = await fetch(API_BASE + '/stats', {headers: getHeaders()});
const d = await r.json();
document.getElementById('vectorCount').textContent = d.index?.vectorCount || 0;
document.getElementById('docCount').textContent = d.documents?.total_documents || 0;
document.getElementById('dimensions').textContent = d.dimensions || 384;
} catch(e) { console.error(e); }
}

async function ingestDoc(){
const log = document.getElementById('ingestLog');
log.style.display = 'block';
log.innerHTML = 'Ingesting...';
const id = document.getElementById('docId').value;
const content = document.getElementById('docContent').value;
const category = document.getElementById('docCategory').value;
if(!id || !content) { log.innerHTML = '<span class="error">ID and content required</span>'; return; }
try {
const r = await fetch(API_BASE + '/ingest', {
method: 'POST', headers: getHeaders(),
body: JSON.stringify({id, content, category: category || undefined})
});
const d = await r.json();
if(d.success) {
log.innerHTML = '<span class="success">✓ Ingested!</span> Chunks: ' + d.chunksCreated + ' | Time: ' + d.performance.totalTime;
document.getElementById('docId').value = '';
document.getElementById('docContent').value = '';
loadStats();
} else { log.innerHTML = '<span class="error">✗ ' + d.error + '</span>'; }
} catch(e) { log.innerHTML = '<span class="error">✗ ' + e.message + '</span>'; }
}

async function search(){
const res = document.getElementById('searchResults');
const perf = document.getElementById('searchPerf');
res.innerHTML = 'Searching...';
const query = document.getElementById('searchQuery').value;
if(!query) { res.innerHTML = '<span class="error">Enter a query</span>'; return; }
try {
const r = await fetch(API_BASE + '/search', {
method: 'POST', headers: getHeaders(),
body: JSON.stringify({
query,
topK: parseInt(document.getElementById('topK').value),
rerank: document.getElementById('useRerank').checked
})
});
const d = await r.json();
if(d.error) { res.innerHTML = '<span class="error">' + d.error + '</span>'; return; }
res.innerHTML = d.results.map(r => \`
<div class="result">
<div class="result-header">
<span class="result-id">\${r.id}</span>
<span class="result-score">Score: \${r.score.toFixed(4)}</span>
</div>
<div class="result-content">\${r.content.substring(0,300)}\${r.content.length>300?'...':''}</div>
\${r.category ? '<span class="result-category">' + r.category + '</span>' : ''}
</div>
\`).join('') || '<span class="error">No results</span>';
perf.style.display = 'block';
document.getElementById('perfGrid').innerHTML = Object.entries(d.performance).map(([k,v]) => 
'<div class="perf-item">' + k + ': <span>' + v + '</span></div>'
).join('');
} catch(e) { res.innerHTML = '<span class="error">✗ ' + e.message + '</span>'; }
}

document.getElementById('searchQuery').addEventListener('keypress', e => { if(e.key === 'Enter') search(); });
loadStats();
testAuth();
</script>
</body>
</html>`;
}

// llms.txt for AI search engines
function getLlmsTxt(): string {
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
Danny Waneri - https://github.com/dannwaneri

## Links
- GitHub: https://github.com/dannwaneri/vectorize-mcp-worker
- Dashboard: /dashboard
`;
}