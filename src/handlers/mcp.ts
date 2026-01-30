import { Env } from '../types/env';
import { HybridSearchEngine } from '../engines/hybrid';
import { IngestionEngine } from '../engines/ingestion';
import { HybridSearchResult } from '../types/search';
import { corsHeaders } from '../middleware/cors';

const hybridSearch = new HybridSearchEngine();
const ingestion = new IngestionEngine();

export async function handleMcpTools(request: Request, env: Env): Promise<Response> {
	return new Response(
		JSON.stringify({
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
		}), 
		{ headers: { "Content-Type": "application/json", ...corsHeaders() } }
	);
}

export async function handleMcpCall(request: Request, env: Env): Promise<Response> {
	try {
		const body = await request.json<{ tool: string; arguments: Record<string, any> }>();
		
		if (!body.tool) {
			return new Response(
				JSON.stringify({ error: "Missing tool name" }), 
				{ status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
			);
		}
		
		const args = body.arguments || {};
		
		switch (body.tool) {
			case "search": {
				if (!args.query) {
					return new Response(
						JSON.stringify({ error: "query required" }), 
						{ status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
					);
				}
				
				const { results, performance } = await hybridSearch.search(
					args.query, 
					env, 
					args.topK || 5, 
					args.rerank !== false
				);
				
				return new Response(
					JSON.stringify({ 
						result: { 
							results: results.map((r: HybridSearchResult) => ({ 
								id: r.id, 
								content: r.content, 
								score: r.rrfScore, 
								category: r.category 
							})), 
							performance 
						} 
					}), 
					{ headers: { "Content-Type": "application/json", ...corsHeaders() } }
				);
			}
			
			case "ingest": {
				if (!args.id || !args.content) {
					return new Response(
						JSON.stringify({ error: "id and content required" }), 
						{ status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
					);
				}
				
				const ingestResult = await ingestion.ingest({ 
					id: args.id, 
					content: args.content, 
					category: args.category, 
					title: args.title 
				}, env);
				
				return new Response(
					JSON.stringify({ 
						result: { 
							success: true, 
							chunks: ingestResult.chunks, 
							performance: ingestResult.performance 
						} 
					}), 
					{ headers: { "Content-Type": "application/json", ...corsHeaders() } }
				);
			}
			
			case "stats": {
				const vectorStats = await env.VECTORIZE.describe();
				const docStats = env.DB ? await env.DB.prepare(
					"SELECT total_documents, avg_doc_length FROM doc_stats WHERE id = 1"
				).first() : null;
				
				return new Response(
					JSON.stringify({ 
						result: { 
							vectors: vectorStats.vectorsCount, 
							documents: (docStats as any)?.total_documents || 0, 
							dimensions: 384 
						} 
					}), 
					{ headers: { "Content-Type": "application/json", ...corsHeaders() } }
				);
			}
			
			case "delete": {
				if (!args.id) {
					return new Response(
						JSON.stringify({ error: "id required" }), 
						{ status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
					);
				}
				
				await ingestion.delete(args.id, env);
				
				return new Response(
					JSON.stringify({ 
						result: { 
							success: true, 
							deleted: args.id 
						} 
					}), 
					{ headers: { "Content-Type": "application/json", ...corsHeaders() } }
				);
			}
			
			default:
				return new Response(
					JSON.stringify({ error: `Unknown tool: ${body.tool}` }), 
					{ status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
				);
		}
	} catch (error) {
		return new Response(
			JSON.stringify({ 
				error: "Tool execution failed", 
				message: error instanceof Error ? error.message : "Unknown" 
			}), 
			{ status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
		);
	}
}