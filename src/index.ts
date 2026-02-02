import { Env } from './types/env';
import { IngestionEngine } from './engines/ingestion';
import { authenticate } from './middleware/auth';
import { corsHeaders, handleCorsPrelight } from './middleware/cors';

import { handleSearch, handleClassifyIntent } from './handlers/search';
import { handleIngest } from './handlers/ingest';
import { handleStats } from './handlers/stats';


import { handleIngestImage, handleFindSimilarImages } from './handlers/image';

import  { getDashboardHTML } from './ui/dashboard';
import { getLlmsTxt } from './ui/llmsTxt';


import { handleLicenseValidate, handleLicenseCreate, handleLicenseList, handleLicenseRevoke } from './handlers/license';
import { handleMcpTools, handleMcpCall } from './handlers/mcp';

import { handleCostAnalytics } from './handlers/analytics';


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
			version: "4.0.0",
			description: "Production-Grade Hybrid RAG with Intelligent Routing",
			features: [
				"Hybrid Search (Vector + BM25)",
				"V4: Intelligent Query Routing (6 specialized routes)",
				"71% cost reduction vs V3",
				"70% average latency improvement",
				"Multimodal Image Processing (Llama 4 Scout)",
				"Visual Search",
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
				"POST /search?mode=v4": "V4 intelligent routing (SQL/BM25/VECTOR/GRAPH)",
				"POST /classify-intent": "Test intent classification",
				"GET /analytics/cost": "Cost analytics and projections",
				"POST /ingest": "Ingest document with auto-chunking",
				"POST /ingest-image": "Ingest image with AI-generated description",
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
				vision: "@cf/meta/llama-4-scout-17b-16e-instruct",
				routing: "@cf/meta/llama-3.2-3b-instruct",
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

		// License endpoints
		if (url.pathname === "/license/validate" && request.method === "POST") {
			return handleLicenseValidate(request, env);
		}

		if (url.pathname === "/license/create" && request.method === "POST") {
			return handleLicenseCreate(request, env);
		}

		if (url.pathname === "/license/list" && request.method === "GET") {
			return handleLicenseList(request, env);
		}

		if (url.pathname === "/license/revoke" && request.method === "POST") {
			return handleLicenseRevoke(request, env);
		}

		// MCP endpoints
		if (url.pathname === "/mcp/tools" && request.method === "GET") {
			return handleMcpTools(request, env);
		}

		if (url.pathname === "/mcp/call" && request.method === "POST") {
			return handleMcpCall(request, env);
		}
		// Ingest Image endpoint
if (url.pathname === "/ingest-image" && request.method === "POST") {
    return handleIngestImage(request, env);
}
		

// Find similar images by uploading an image
if (url.pathname === "/find-similar-images" && request.method === "POST") {
    return handleFindSimilarImages(request, env);
}

if (url.pathname === "/classify-intent" && request.method === "POST") {
    return handleClassifyIntent(request, env);
}

if (url.pathname === "/analytics/cost" && request.method === "GET") {
	return handleCostAnalytics(request, env);
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


