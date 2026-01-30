import { Env } from './types/env';
import { Document} from './types/document';
import { HybridSearchEngine } from './engines/hybrid';
import { IngestionEngine } from './engines/ingestion';
import { authenticate } from './middleware/auth';
import { corsHeaders, handleCorsPrelight } from './middleware/cors';




const hybridSearch = new HybridSearchEngine();
const ingestion = new IngestionEngine();


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
				const body = await request.json<{ 
					query: string; 
					topK?: number; 
					rerank?: boolean;
					offset?: number; // ADD THIS
				}>();
				const offset = body.offset || 0; // ADD THIS
				if (!body.query) {
					return new Response(JSON.stringify({ error: "Missing 'query' field in request body" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } });
				}
				const topK = body.topK || 5;
				if (topK < 1 || topK > 20) {
					return new Response(JSON.stringify({ error: "topK must be between 1 and 20" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } });
				}
				// Get more results than needed for pagination
const totalToFetch = offset + topK;
const { results, performance } = await hybridSearch.search(body.query, env, totalToFetch, body.rerank !== false);
return new Response(
    JSON.stringify({
        query: body.query,
        topK,
        offset,
        resultsCount: results.length,
        results: results.slice(offset, offset + topK).map(r => ({ // ← Now correct
							id: r.id, 
							score: r.rrfScore, 
							content: r.content, 
							category: r.category, 
							scores: { vector: r.vectorScore, keyword: r.keywordScore, reranker: r.rerankerScore } 
						})),
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
			try {
				const formData = await request.formData();
				const id = formData.get('id') as string;
				const imageFile = formData.get('image') as File;
				const category = formData.get('category') as string || 'images';
				const title = formData.get('title') as string || undefined;
				const imageType = formData.get('imageType') as string || 'auto'; // ADD THIS LINE
		
				if (!id || !imageFile) {
					return new Response(JSON.stringify({ error: "Missing id or image" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } });
				}
		
				const imageBuffer = await imageFile.arrayBuffer();
				const result = await ingestion.ingestImage({ 
					id, 
					content: '', 
					imageBuffer, 
					category, 
					title,
					imageType: imageType as any // ADD THIS LINE
				}, env);
				
				return new Response(JSON.stringify({ 
					success: true, 
					documentId: id, 
					description: result.description,
					extractedText: result.extractedText, // ADD THIS LINE
					performance: result.performance 
				}), { headers: { "Content-Type": "application/json", ...corsHeaders() } });
			} catch (error) {
				return new Response(JSON.stringify({ error: "Image ingest failed", message: error instanceof Error ? error.message : "Unknown" }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } });
			}
		}
		

// Find similar images by uploading an image
if (url.pathname === "/find-similar-images" && request.method === "POST") {
    try {
        const formData = await request.formData();
        const imageFile = formData.get('image') as File;
        const topK = parseInt(formData.get('topK') as string || '5');
        
        if (!imageFile) {
            return new Response(JSON.stringify({ error: "Missing image" }), 
                { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } });
        }
        
        const imageBuffer = await imageFile.arrayBuffer();
        
        // Get description from multimodal worker
        const response = await env.MULTIMODAL.fetch('http://internal/describe-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageBuffer: Array.from(new Uint8Array(imageBuffer)),
                imageType: 'auto'
            }),
        });
        
        const result = await response.json<{ success: boolean; description: string; error?: string }>();
        
        if (!result.success) {
            throw new Error(result.error || 'Failed to process image');
        }
        
        // Search using the description
        const { results, performance } = await hybridSearch.search(result.description, env, topK, true);
        
        // Filter to only images
        const imageResults = results.filter(r => r.isImage);
        
        return new Response(JSON.stringify({
            query: result.description,
            results: imageResults,
            performance
        }), { headers: { "Content-Type": "application/json", ...corsHeaders() } });
    } catch (error) {
        return new Response(JSON.stringify({ 
            error: error instanceof Error ? error.message : "Unknown error" 
        }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } });
    }
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

// Dashboard HTML
function getDashboardHTML(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vectorize MCP Worker - Dashboard</title>
<meta name="description" content="Production-Grade Hybrid RAG with Multimodal Support on Cloudflare Edge">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Vectorize MCP Worker",
  "description": "Production-Grade Hybrid RAG with Multimodal Image Processing",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "Cloudflare Workers",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "author": {
    "@type": "Person",
    "name": "Daniel Nwaneri",
    "url": "https://github.com/dannwaneri"
  },
  "softwareVersion": "2.1.0",
  "url": "https://github.com/dannwaneri/vectorize-mcp-worker"
}
</script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#f5f5f5;color:#1a1a1a;min-height:100vh;padding:12px}
.container{max-width:1200px;margin:0 auto}
.gh-banner{background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;font-size:0.85rem}
.gh-banner a{color:#fff;text-decoration:none;font-weight:500}
.gh-banner button{background:none;border:none;color:#fff;cursor:pointer;font-size:1.1rem}
h1{font-size:1.8rem;margin-bottom:8px;color:#1a1a1a;font-weight:700;text-align:center}
.subtitle{color:#666;margin-bottom:8px;font-size:1rem;text-align:center}
.tagline{color:#888;margin-bottom:24px;font-size:0.8rem;text-align:center}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.card{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.05)}
.card h2{font-size:1rem;margin-bottom:14px;color:#1a1a1a;display:flex;align-items:center;gap:8px;font-weight:600}
.card h2 span{font-size:1.1rem}
label{display:block;font-size:0.8rem;color:#555;margin-bottom:6px;font-weight:500}
input,textarea,select{width:100%;padding:12px 14px;background:#fff;border:1px solid #ddd;border-radius:8px;color:#1a1a1a;font-size:16px;margin-bottom:12px}
input[type="file"]{padding:8px;cursor:pointer}
input:focus,textarea:focus,select:focus{outline:none;border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,0.1)}
input::placeholder,textarea::placeholder{color:#999}
textarea{resize:vertical;min-height:120px;font-family:inherit}
button{background:#4f46e5;color:#fff;border:none;padding:12px 20px;border-radius:8px;cursor:pointer;font-size:0.95rem;font-weight:600;width:100%;transition:background 0.2s}
button:hover{background:#4338ca}
button:disabled{background:#ccc;cursor:not-allowed}
.stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
.stat{background:#f9fafb;border:1px solid #e5e5e5;padding:12px;border-radius:8px;text-align:center}
.stat-value{font-size:1.3rem;font-weight:700;color:#4f46e5}
.stat-label{font-size:0.7rem;color:#888;margin-top:4px}
.results{margin-top:14px;max-height:350px;overflow-y:auto}
.result{background:#f9fafb;border:1px solid #e5e5e5;padding:12px;border-radius:8px;margin-bottom:8px;border-left:3px solid #4f46e5}
.result-header{display:flex;justify-content:space-between;margin-bottom:6px;flex-wrap:wrap;gap:4px;align-items:center}
.result-id{font-size:0.7rem;color:#888;word-break:break-all}
.result-score{font-size:0.7rem;color:#059669;font-weight:600}
.result-content{font-size:0.85rem;color:#444;line-height:1.5;word-break:break-word}
.result-category{display:inline-block;font-size:0.65rem;background:#4f46e5;color:#fff;padding:2px 8px;border-radius:4px;margin-top:6px}
.image-badge{background:#f97316;color:#fff;padding:2px 8px;border-radius:4px;font-size:0.7rem;font-weight:600;display:inline-block}
.perf{margin-top:14px;padding:12px;background:#f9fafb;border:1px solid #e5e5e5;border-radius:8px}
.perf-title{font-size:0.75rem;color:#888;margin-bottom:8px}
.perf-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
.perf-item{font-size:0.8rem;color:#555}
.perf-item span{color:#059669;font-weight:600}
.log{font-size:0.8rem;color:#666;margin-top:8px;padding:10px;background:#f9fafb;border:1px solid #e5e5e5;border-radius:6px;max-height:120px;overflow-y:auto;word-break:break-word}
.success{color:#059669}
.error{color:#dc2626}
.auth-section{margin-bottom:16px;padding:16px;background:#fff;border:1px solid #e5e5e5;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.05)}
.auth-section label{color:#555}
.flex{display:flex;gap:8px}
.flex input{margin-bottom:0;flex:1}
.flex button{width:auto;padding:12px 20px;flex-shrink:0}
.search-row{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.search-row input{flex:1;min-width:150px;margin-bottom:0}
.search-row select{width:80px;margin-bottom:0;flex-shrink:0}
.search-row button{width:auto;padding:12px 24px;flex-shrink:0}
.demo-card{background:#f0f9ff;border:1px solid #0ea5e9;border-left:3px solid #0ea5e9}
.demo-card button{margin-top:8px}
.demo-card button:first-of-type{margin-top:0;background:#0ea5e9}
.demo-card button:first-of-type:hover{background:#0284c7}
.demo-card button:last-of-type{background:#059669}
.demo-card button:last-of-type:hover{background:#047857}
.demo-card p{font-size:0.85rem;color:#555;margin-bottom:12px;line-height:1.4}
.footer{text-align:center;margin-top:24px;padding:16px;color:#888;font-size:0.8rem}
.footer a{color:#4f46e5;text-decoration:none}
@media screen and (max-width:1024px){
.grid{grid-template-columns:repeat(2,1fr)!important}
.card.search-card{grid-column:span 2!important}
}
@media screen and (max-width:768px){
.grid{grid-template-columns:1fr!important}
.card{grid-column:1!important}
.stats-grid{grid-template-columns:repeat(3,1fr)}
.perf-grid{grid-template-columns:1fr}
.search-row{flex-direction:column}
.search-row input,.search-row select,.search-row button{width:100%}
body{padding:8px}
h1{font-size:1.5rem}
.subtitle{font-size:0.9rem}
}
</style>
</head>
<body>
<div class="container">
<div class="gh-banner" id="ghBanner">
<a href="https://github.com/dannwaneri/vectorize-mcp-worker" target="_blank">⭐ Star on GitHub - Help spread the word!</a>
<button onclick="document.getElementById('ghBanner').style.display='none'">✕</button>
</div>
<h1>Vectorize MCP Worker V3</h1>
<p class="subtitle">Hybrid RAG with Vision: Search text and images with AI-powered understanding.</p>
<p class="tagline">~900ms search • Vector + BM25 • Multimodal • OCR • Reranked results • $5/month</p>

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
<input type="text" id="docId" placeholder="my-article-001">
<label>Category (optional)</label>
<input type="text" id="docCategory" placeholder="e.g., docs, articles, notes">
<label>Content</label>
<textarea id="docContent" placeholder="Paste any text - articles, docs, notes. It will be automatically chunked and indexed..."></textarea>
<button onclick="ingestDoc()">Ingest Document</button>
<div id="ingestLog" class="log" style="display:none"></div>
</div>

<div class="card">
<h2><span>📸</span> Ingest Image <span style="font-size:0.7rem;background:#f97316;color:#fff;padding:2px 6px;border-radius:4px;font-weight:600">NEW</span></h2>
<label>Image ID</label>
<input type="text" id="imageId" placeholder="receipt-001">
<label>Category (optional)</label>
<input type="text" id="imageCategory" placeholder="e.g., receipts, screenshots, diagrams">
<label>Image Type (optional)</label>
<select id="imageType">
<option value="auto">Auto-detect</option>
<option value="screenshot">Screenshot</option>
<option value="document">Scanned Document/OCR</option>
<option value="diagram">Diagram/Chart</option>
<option value="photo">Photo</option>
</select>
<label>Upload Image</label>
<input type="file" id="imageFile" accept="image/*">
<button onclick="ingestImage()">Ingest Image</button>
<div id="imageLog" class="log" style="display:none"></div>
</div>

<div class="card demo-card">
<h2><span>🎯</span> Try V3 Features</h2>
<p>Test multimodal search with pre-loaded sample images</p>
<button onclick="searchImages()">🖼️ Search: "dashboard navigation"</button>
<button onclick="searchFinancial()">💳 Search: "Access Bank transaction"</button>
<div id="demoLog" class="log" style="display:none"></div>
</div>

<div class="card search-card" style="grid-column:span 3">
<h2><span>🔎</span> Search</h2>
<div class="search-row">
<input type="text" id="searchQuery" placeholder="Ask anything about your documents or images...">
<select id="topK">
<option value="3">Top 3</option>
<option value="5" selected>Top 5</option>
<option value="10">Top 10</option>
</select>
<button onclick="search()">🔍 Search</button>
</div>
<label><input type="checkbox" id="useRerank" checked> Use Reranker (more accurate)</label>
<div id="searchResults" class="results"></div>
<div id="searchPerf" class="perf" style="display:none">
<div class="perf-title">⚡ Performance</div>
<div class="perf-grid" id="perfGrid"></div>
</div>
</div>
</div>

<div class="footer">
⚡ Powered by <a href="https://developers.cloudflare.com/workers/" target="_blank">Cloudflare Workers</a> + <a href="https://developers.cloudflare.com/vectorize/" target="_blank">Vectorize</a> + <a href="https://developers.cloudflare.com/d1/" target="_blank">D1</a> + <a href="https://developers.cloudflare.com/workers-ai/" target="_blank">Llama 4 Scout Vision</a>
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

async function compressImage(file, maxWidth = 1920, maxHeight = 1080, quality = 0.85) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                if (width > maxWidth || height > maxHeight) {
                    if (width > height) {
                        height = (height / width) * maxWidth;
                        width = maxWidth;
                    } else {
                        width = (width / height) * maxHeight;
                        height = maxHeight;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}
async function testAuth(){
const el = document.getElementById('authStatus');
el.style.display = 'block';
el.innerHTML = 'Testing...';
try {
const r = await fetch(API_BASE + '/test');
const d = await r.json();
const apiKey = document.getElementById('apiKey').value;
const authStatus = apiKey ? '<span class="success">✓ Authenticated</span>' : '<span style="color:#fbbf24">⚡ Server Online</span> (enter API key to access protected endpoints)';
el.innerHTML = authStatus + ' | Mode: ' + d.mode + ' | Database: ' + (d.bindings.hasD1?'✓':'✗');
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
} else { log.innerHTML = '<span class="error">✗ ' + (d.error || 'Unknown error') + '</span>'; }
} catch(e) { log.innerHTML = '<span class="error">✗ ' + e.message + '</span>'; }
}

async function ingestImage(){
	const log = document.getElementById('imageLog');
	log.style.display = 'block';
	log.innerHTML = 'Processing image...';
	const id = document.getElementById('imageId').value;
	const originalFile = document.getElementById('imageFile').files[0];
	const category = document.getElementById('imageCategory').value;
	const imageType = document.getElementById('imageType').value;
	if(!id || !originalFile) { log.innerHTML = '<span class="error">ID and image file required</span>'; return; }
	try {
	const originalSizeMB = (originalFile.size / (1024 * 1024)).toFixed(2);
	log.innerHTML = 'Compressing image (' + originalSizeMB + 'MB)...';
	
	const compressedBlob = await compressImage(originalFile);
	const compressedSizeMB = (compressedBlob.size / (1024 * 1024)).toFixed(2);
	log.innerHTML = 'Uploading (' + originalSizeMB + 'MB → ' + compressedSizeMB + 'MB)...';
	
	const formData = new FormData();
	formData.append('id', id);
	formData.append('image', compressedBlob, 'image.jpg');
	if(category) formData.append('category', category);
	if(imageType !== 'auto') formData.append('imageType', imageType);
	
	const headers = {};
	const apiKey = document.getElementById('apiKey').value;
	if(apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
	
	const r = await fetch(API_BASE + '/ingest-image', {
	method: 'POST',
	headers: headers,
	body: formData
	});
	const d = await r.json();
	if(d.success) {
	log.innerHTML = '<span class="success">✓ Image Ingested!</span><br>' +
	'Compressed: ' + originalSizeMB + 'MB → ' + compressedSizeMB + 'MB<br>' +
	'Description: ' + (d.description || '').substring(0, 150) + '...<br>' +
	(d.extractedText ? 'OCR Text: ' + d.extractedText.substring(0, 100) + '...<br>' : '') +
	'Time: ' + d.performance.totalTime;
	document.getElementById('imageId').value = '';
	document.getElementById('imageFile').value = '';
	loadStats();
	} else { log.innerHTML = '<span class="error">✗ ' + (d.error || 'Unknown error') + '</span>'; }
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
\${r.isImage ? '<span class="image-badge">📸 IMAGE</span>' : ''}
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

async function searchImages(){
document.getElementById('searchQuery').value = 'dashboard navigation';
await search();
const demoLog = document.getElementById('demoLog');
demoLog.style.display = 'block';
demoLog.innerHTML = '<span class="success">✓ Search complete!</span> Notice the 📸 IMAGE badges on results showing screenshots.';
}

async function searchFinancial(){
document.getElementById('searchQuery').value = 'Access Bank N30000';
await search();
const demoLog = document.getElementById('demoLog');
demoLog.style.display = 'block';
demoLog.innerHTML = '<span class="success">✓ Search complete!</span> OCR extracted transaction details from receipt images.';
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
Daniel Nwaneri - https://github.com/dannwaneri

## Links
- GitHub: https://github.com/dannwaneri/vectorize-mcp-worker
- Dashboard: /dashboard
`;
}