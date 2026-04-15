import { Env } from '../types/env';
import { HybridSearchEngine } from '../engines/hybrid';
import { IngestionEngine } from '../engines/ingestion';
import { HybridSearchResult, validateFilters } from '../types/search';
import { corsHeaders } from '../middleware/cors';
import { resolveEmbeddingModel } from '../config/models';

const hybridSearch = new HybridSearchEngine();
const ingestion = new IngestionEngine();

// Shared filter operator schema used for each filterable field in the MCP schema.
const filterOpSchema = (description: string, allowIn = true) => ({
	type: "object",
	description,
	properties: {
		$eq: { type: "string" },
		$ne: { type: "string" },
		...(allowIn ? { $in: { type: "array", items: { type: "string" } } } : {}),
	},
});

const dateFilterOpSchema = {
	type: "object",
	description: "Filter by ISO 8601 creation date",
	properties: {
		$eq: { type: "string" },
		$gt: { type: "string" },
		$gte: { type: "string" },
		$lt: { type: "string" },
		$lte: { type: "string" },
	},
};

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
							topK: {
								type: "number",
								description: "Number of results to return (1–50)",
								default: 5,
								minimum: 1,
								maximum: 50,
							},
							rerank: { type: "boolean", description: "Use cross-encoder reranking", default: true },
							filters: {
								type: "object",
								description: "Optional metadata filters. Each field accepts an operator object.",
								properties: {
									source_type: filterOpSchema("Filter by source type, e.g. { \"$eq\": \"pdf\" }"),
									category: filterOpSchema("Filter by category, e.g. { \"$eq\": \"finance\" }"),
									tags: {
										type: "object",
										description: "Filter by tags (in-memory post-filter). Use { \"$in\": [\"tagA\", \"tagB\"] }",
										properties: {
											$eq: { type: "string" },
											$in: { type: "array", items: { type: "string" } },
										},
									},
									date_created: dateFilterOpSchema,
									tenant_id: filterOpSchema("Filter by tenant ID, e.g. { \"$eq\": \"acme\" }"),
									mime_type: filterOpSchema("Filter by MIME type, e.g. { \"$eq\": \"application/pdf\" }"),
									file_name: filterOpSchema("Filter by file name, e.g. { \"$eq\": \"report.pdf\" }", false),
								},
								additionalProperties: false,
							},
						},
						required: ["query"],
					},
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
							title: { type: "string", description: "Optional title" },
							source_type: { type: "string", description: "Source type (e.g. text, pdf, image). Defaults to 'text'" },
							tags: { type: "array", items: { type: "string" }, description: "Optional tags for filtering" },
							tenant_id: { type: "string", description: "Optional tenant identifier for multi-tenant filtering" },
							mime_type: { type: "string", description: "Optional MIME type (e.g. application/pdf, text/plain)" },
							file_name: { type: "string", description: "Optional original file name" },
						},
						required: ["id", "content"],
					},
				},
				{
					name: "stats",
					description: "Get knowledge base statistics",
					inputSchema: { type: "object", properties: {} },
				},
				{
					name: "delete",
					description: "Delete a document from the knowledge base",
					inputSchema: {
						type: "object",
						properties: {
							id: { type: "string", description: "Document ID to delete" },
						},
						required: ["id"],
					},
				},
			],
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

				// Clamp topK to 1–50
				const topK = Math.min(Math.max(1, args.topK || 5), 50);

				// Validate filters using the shared helper
				const filterResult = validateFilters(args.filters);
				if (!filterResult.valid) {
					return new Response(
						JSON.stringify({ error: filterResult.error }),
						{ status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
					);
				}
				const filters = Object.keys(filterResult.filters).length > 0
					? filterResult.filters
					: undefined;

				const { results, performance } = await hybridSearch.search(
					args.query,
					env,
					topK,
					args.rerank !== false,
					filters,
				);

				return new Response(
					JSON.stringify({
						result: {
							results: results.map((r: HybridSearchResult) => ({
								id: r.id,
								content: r.content,
								score: r.rrfScore,
								category: r.category,
							})),
							...(filters ? { filtersApplied: filters } : {}),
							performance,
						},
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
					title: args.title,
					source_type: args.source_type,
					tags: args.tags,
					tenant_id: args.tenant_id,
					mime_type: args.mime_type,
					file_name: args.file_name,
				}, env);

				return new Response(
					JSON.stringify({
						result: {
							success: true,
							chunks: ingestResult.chunks,
							performance: ingestResult.performance,
						},
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
							dimensions: resolveEmbeddingModel(env.EMBEDDING_MODEL).dimensions,
						},
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
							deleted: args.id,
						},
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
				message: error instanceof Error ? error.message : "Unknown",
			}),
			{ status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
		);
	}
}
