import { Env } from './types/env';
import { HybridSearchEngine } from './engines/hybrid';
import { IngestionEngine } from './engines/ingestion';
import { authenticate } from './middleware/auth';
import { corsHeaders, handleCorsPrelight } from './middleware/cors';

import { handleSearch } from './handlers/search';
import { handleIngest } from './handlers/ingest';
import { handleStats } from './handlers/stats';


import { handleIngestImage, handleFindSimilarImages } from './handlers/image';

import  { getDashboardHTML } from './ui/dashboard';
import { getLlmsTxt } from './ui/llmsTxt';


const ingestion = new IngestionEngine();
const hybridSearch = new HybridSearchEngine();


export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// Handle CORS preflight
if (request.method === "OPTIONS") {
    return handleCorsPrelight();
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
			version: "2.1.0", // Update version
			description: "Production-Grade Hybrid RAG with Multimodal Support", // Update description
			features: [
				"Hybrid Search (Vector + BM25)",
				"Multimodal Image Processing (Llama 4 Scout)", // Add this
				"Visual Search", // Add this
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
				"POST /ingest-image": "Ingest image with AI-generated description", // Add this
				"POST /find-similar-images": "Find visually similar images by uploading a query image",
				"DELETE /documents/:id": "Delete document",
				"POST /license/validate": "Validate a license key",
				"POST /license/create": "Create license (admin)",
				"GET /license/list": "List all licenses (admin)",
				"POST /license/revoke": "Revoke a license (admin)",
				"GET /mcp/tools": "List MCP tools",
				"POST /mcp/call": "Execute MCP tool",
			},
			models: {
				embedding: "@cf/baai/bge-small-en-v1.5",
				reranker: "@cf/baai/bge-reranker-base",
				vision: "@cf/meta/llama-4-scout-17b-16e-instruct", // Add this
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
    return handleStats(request, env);
}
		// Hybrid Search
if (url.pathname === "/search" && request.method === "POST") {
    return handleSearch(request, env);
}

		// Ingest Document
if (url.pathname === "/ingest" && request.method === "POST") {
    return handleIngest(request, env);
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

		// MCP: List Tools
		if (url.pathname === "/mcp/tools" && request.method === "GET") {
			return new Response(JSON.stringify({
				tools: [
					{
						name: "search",
						description: "Search the knowledge base using hybrid semantic + keyword search with reranking",
						inputSchema: {
							type: "object",
							properties: {
								query: { type: "string", description: "Search query" },
								topK: { type: "number", description: "Number of results (1-20)", default: 5 },
								rerank: { type: "boolean", description: "Use cross-encoder reranking", default: true }
							},
							required: ["query"]
						}
					},
					{
						name: "ingest",
						description: "Add a document to the knowledge base with automatic chunking",
						inputSchema: {
							type: "object",
							properties: {
								id: { type: "string", description: "Unique document ID" },
								content: { type: "string", description: "Document content" },
								category: { type: "string", description: "Optional category" },
								title: { type: "string", description: "Optional title" }
							},
							required: ["id", "content"]
						}
					},
					
					{
						name: "stats",
						description: "Get knowledge base statistics",
						inputSchema: { type: "object", properties: {} }
					},
					{
						name: "delete",
						description: "Delete a document from the knowledge base",
						inputSchema: {
							type: "object",
							properties: {
								id: { type: "string", description: "Document ID to delete" }
							},
							required: ["id"]
						}
					}
				]
			}), { headers: { "Content-Type": "application/json", ...corsHeaders() } });
		}

		// Ingest Image endpoint
if (url.pathname === "/ingest-image" && request.method === "POST") {
    return handleIngestImage(request, env);
}
		

// Find similar images by uploading an image
if (url.pathname === "/find-similar-images" && request.method === "POST") {
    return handleFindSimilarImages(request, env);
}





// MCP: Call Tool (JSON-RPC style)
		if (url.pathname === "/mcp/call" && request.method === "POST") {
			try {
				const body = await request.json<{ tool: string; arguments: Record<string, any> }>();
				if (!body.tool) {
					return new Response(JSON.stringify({ error: "Missing tool name" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } });
				}
				const args = body.arguments || {};

				// Execute tool
				switch (body.tool) {
					case "search": {
						if (!args.query) return new Response(JSON.stringify({ error: "query required" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } });
						const { results, performance } = await hybridSearch.search(args.query, env, args.topK || 5, args.rerank !== false);
						return new Response(JSON.stringify({ result: { results: results.map(r => ({ id: r.id, content: r.content, score: r.rrfScore, category: r.category })), performance } }), { headers: { "Content-Type": "application/json", ...corsHeaders() } });
					}
					case "ingest": {
						if (!args.id || !args.content) return new Response(JSON.stringify({ error: "id and content required" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } });
						const ingestResult = await ingestion.ingest({ id: args.id, content: args.content, category: args.category, title: args.title }, env);
						return new Response(JSON.stringify({ result: { success: true, chunks: ingestResult.chunks, performance: ingestResult.performance } }), { headers: { "Content-Type": "application/json", ...corsHeaders() } });
					}
					case "stats": {
						const vectorStats = await env.VECTORIZE.describe();
						const docStats = env.DB ? await env.DB.prepare("SELECT total_documents, avg_doc_length FROM doc_stats WHERE id = 1").first() : null;
						return new Response(JSON.stringify({ result: { vectors: vectorStats.vectorsCount, documents: (docStats as any)?.total_documents || 0, dimensions: 384 } }), { headers: { "Content-Type": "application/json", ...corsHeaders() } });
					}
					case "delete": {
						if (!args.id) return new Response(JSON.stringify({ error: "id required" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } });
						await ingestion.delete(args.id, env);
						return new Response(JSON.stringify({ result: { success: true, deleted: args.id } }), { headers: { "Content-Type": "application/json", ...corsHeaders() } });
					}
					
					default:
						return new Response(JSON.stringify({ error: `Unknown tool: ${body.tool}` }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } });
				}
			} catch (error) {
				return new Response(JSON.stringify({ error: "Tool execution failed", message: error instanceof Error ? error.message : "Unknown" }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } });
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


