import { Env } from '../types/env';
import { corsHeaders } from '../middleware/cors';
import { resolveEmbeddingModel } from '../config/models';

export function handleOpenApi(request: Request, env: Env): Response {
	const url = new URL(request.url);
	const baseUrl = `${url.protocol}//${url.host}`;
	const embModel = resolveEmbeddingModel(env.EMBEDDING_MODEL);

	const spec = {
		openapi: '3.0.3',
		info: {
			title: 'Vectorize MCP Worker',
			version: '4.1.0',
			description:
				'Production-grade Hybrid RAG on Cloudflare Workers. ' +
				'Vector + BM25 search, cross-encoder reranking, knowledge reflection, ' +
				'multimodal ingestion, multi-tenancy, rate limiting, and a native MCP server.',
			contact: {
				name: 'Daniel Nwaneri',
				url: 'https://github.com/dannwaneri/vectorize-mcp-worker',
			},
			license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
		},
		servers: [{ url: baseUrl, description: 'This deployment' }],
		security: [{ bearerAuth: [] }],

		components: {
			securitySchemes: {
				bearerAuth: {
					type: 'http',
					scheme: 'bearer',
					description:
						'Pass your API key as `Authorization: Bearer <key>`. ' +
						'Omit entirely in dev mode (no API_KEY secret set).',
				},
			},
			schemas: {
				Document: {
					type: 'object',
					required: ['id', 'content'],
					properties: {
						id: { type: 'string', example: 'my-doc-001', description: 'Unique document identifier. Re-ingesting an existing ID overwrites it.' },
						content: { type: 'string', description: 'Plain text content. Automatically chunked with 15% overlap.' },
						title: { type: 'string', example: 'Q1 Sales Report' },
						source: { type: 'string', example: 'https://example.com/report.pdf' },
						category: { type: 'string', example: 'finance' },
						source_type: { type: 'string', enum: ['text', 'pdf', 'audio', 'video', 'image'], example: 'pdf' },
						tags: { type: 'array', items: { type: 'string' }, example: ['finance', 'q1'] },
						tenant_id: { type: 'string', description: 'Auto-injected from auth context in multi-tenant mode; caller value overridden.' },
						mime_type: { type: 'string', example: 'application/pdf' },
						file_name: { type: 'string', example: 'q1-report.pdf' },
						date_created: { type: 'string', format: 'date-time', example: '2026-01-15T10:30:00Z' },
						doc_type: { type: 'string', enum: ['raw', 'reflection', 'summary'], default: 'raw' },
					},
				},
				SearchFilters: {
					type: 'object',
					description: 'Metadata filters using Vectorize filter operators.',
					properties: {
						source_type: { oneOf: [{ type: 'string' }, { type: 'object', properties: { '$eq': { type: 'string' }, '$ne': { type: 'string' }, '$in': { type: 'array', items: { type: 'string' } } } }] },
						category: { oneOf: [{ type: 'string' }, { type: 'object' }] },
						tags: { type: 'object', description: 'Tag filter (in-memory post-filter). Use `$in` for multiple values.' },
						tenant_id: { type: 'object' },
						mime_type: { oneOf: [{ type: 'string' }, { type: 'object' }] },
						file_name: { oneOf: [{ type: 'string' }, { type: 'object' }] },
						date_created: { type: 'object', description: 'ISO date range. Use `$gt`, `$gte`, `$lt`, `$lte`.', example: { '$gte': '2026-01-01', '$lt': '2026-04-01' } },
						doc_type: { oneOf: [{ type: 'string' }, { type: 'object' }] },
					},
				},
				SearchResult: {
					type: 'object',
					properties: {
						id: { type: 'string' },
						score: { type: 'number', description: 'RRF-fused score (0–1).' },
						content: { type: 'string' },
						category: { type: 'string' },
						doc_type: { type: 'string', enum: ['raw', 'reflection', 'summary'] },
						label: { type: 'string', description: 'Human-readable label for reflections/summaries.' },
						is_insight: { type: 'boolean' },
						scores: {
							type: 'object',
							properties: {
								vector: { type: 'number' },
								keyword: { type: 'number' },
								reranker: { type: 'number' },
							},
						},
					},
				},
				PerformanceTiming: {
					type: 'object',
					additionalProperties: { type: 'string', pattern: '^\\d+ms$' },
					example: { embeddingTime: '42ms', vectorSearchTime: '18ms', totalTime: '87ms' },
				},
				ErrorResponse: {
					type: 'object',
					required: ['error'],
					properties: {
						error: { type: 'string' },
						message: { type: 'string' },
					},
				},
				IngestResponse: {
					type: 'object',
					properties: {
						success: { type: 'boolean' },
						documentId: { type: 'string' },
						chunks: { type: 'integer' },
						chunksCreated: { type: 'integer', description: 'Alias for chunks (dashboard compatibility).' },
						tenant_id: { type: 'string' },
						performance: { '$ref': '#/components/schemas/PerformanceTiming' },
					},
				},
			},
		},

		paths: {
			'/': {
				get: {
					summary: 'API overview',
					description: 'Returns the full endpoint map, active models, and authentication mode. No auth required.',
					operationId: 'getRoot',
					security: [],
					tags: ['Meta'],
					responses: {
						'200': { description: 'API documentation object', content: { 'application/json': { schema: { type: 'object' } } } },
					},
				},
			},
			'/test': {
				get: {
					summary: 'Health check',
					description: 'Verifies all Cloudflare bindings (AI, Vectorize, D1) are connected. No auth required.',
					operationId: 'getTest',
					security: [],
					tags: ['Meta'],
					responses: {
						'200': {
							description: 'Binding status',
							content: {
								'application/json': {
									schema: {
										type: 'object',
										properties: {
											status: { type: 'string', example: 'healthy' },
											timestamp: { type: 'string', format: 'date-time' },
											bindings: {
												type: 'object',
												properties: {
													hasAI: { type: 'boolean' },
													hasVectorize: { type: 'boolean' },
													hasD1: { type: 'boolean' },
													hasAPIKey: { type: 'boolean' },
												},
											},
											mode: { type: 'string', enum: ['production', 'development'] },
											multiTenancy: {
												type: 'object',
												properties: {
													enabled: { type: 'boolean' },
													tenant: { type: 'string', nullable: true },
													isAdmin: { type: 'boolean' },
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
			'/stats': {
				get: {
					summary: 'Index statistics',
					description: 'Returns Vectorize index info, active embedding model, and query analytics summary.',
					operationId: 'getStats',
					tags: ['Meta'],
					responses: {
						'200': {
							description: 'Stats object',
							content: {
								'application/json': {
									schema: {
										type: 'object',
										properties: {
											index: { type: 'object', description: 'Raw Vectorize describe() output.' },
											documents: { type: 'object', nullable: true },
											model: { type: 'string', example: embModel.id },
											dimensions: { type: 'integer', example: embModel.dimensions },
											models: {
												type: 'object',
												properties: {
													embedding: { type: 'string' },
													embeddingKey: { type: 'string', example: 'bge-small' },
													embeddingDimensions: { type: 'integer' },
													reranker: { type: 'string' },
													vision: { type: 'string' },
													routing: { type: 'string' },
												},
											},
											analytics: {
												type: 'object',
												properties: {
													totalQueries: { type: 'integer' },
													cacheHitRate: { type: 'string', example: '42%' },
													avgLatencyMs: { type: 'integer' },
													recentQueries: { type: 'array', items: { type: 'object' } },
													topFilters: { type: 'array', items: { type: 'object' } },
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
			'/search': {
				post: {
					summary: 'Hybrid search',
					description:
						'**V3 (default):** Vector similarity + BM25 fused with RRF, optional cross-encoder reranking, ' +
						'60s Cloudflare cache for repeated queries.\n\n' +
						'**V4 (add `?mode=v4`):** Intent-classified routing — entity lookups go to SQL (~45ms), ' +
						'keyword queries to BM25 (~50ms), semantic queries to the full vector pipeline. ' +
						'Cuts average embedding cost by ~71%.',
					operationId: 'postSearch',
					tags: ['Search'],
					parameters: [
						{
							name: 'mode',
							in: 'query',
							schema: { type: 'string', enum: ['v4'] },
							description: 'Pass `v4` to enable intelligent query routing.',
						},
						{
							name: 'highlight',
							in: 'query',
							schema: { type: 'string', enum: ['false'] },
							description: 'Pass `false` to skip semantic highlighting.',
						},
					],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									required: ['query'],
									properties: {
										query: { type: 'string', example: 'What are our Q1 pricing decisions?' },
										topK: { type: 'integer', minimum: 1, maximum: 50, default: 5 },
										rerank: { type: 'boolean', default: true, description: 'Enable cross-encoder reranking. Disables CF cache.' },
										offset: { type: 'integer', default: 0, description: 'Pagination offset.' },
										highlight: { type: 'boolean', default: true, description: 'Add semantic highlighting to result content.' },
										filters: { '$ref': '#/components/schemas/SearchFilters' },
									},
								},
								examples: {
									simple: { summary: 'Simple query', value: { query: 'machine learning concepts', topK: 5 } },
									filtered: { summary: 'Filtered query', value: { query: 'pricing changes', topK: 10, filters: { source_type: 'pdf', date_created: { '$gte': '2026-01-01' } } } },
									reflections: { summary: 'Reflections only', value: { query: 'knowledge synthesis', filters: { doc_type: { '$eq': 'reflection' } } } },
								},
							},
						},
					},
					responses: {
						'200': {
							description: 'Search results',
							content: {
								'application/json': {
									schema: {
										type: 'object',
										properties: {
											version: { type: 'string', enum: ['v3', 'v4'] },
											query: { type: 'string' },
											topK: { type: 'integer' },
											offset: { type: 'integer' },
											resultsCount: { type: 'integer' },
											results: { type: 'array', items: { '$ref': '#/components/schemas/SearchResult' } },
											performance: { '$ref': '#/components/schemas/PerformanceTiming' },
										},
									},
								},
							},
							headers: { 'X-Cache': { schema: { type: 'string', enum: ['HIT', 'MISS'] } } },
						},
						'400': { description: 'Missing query or invalid filters', content: { 'application/json': { schema: { '$ref': '#/components/schemas/ErrorResponse' } } } },
					},
				},
			},
			'/classify-intent': {
				post: {
					summary: 'Classify query intent',
					description: 'Debug tool — shows which V4 route a query would be sent to (SQL / BM25 / VECTOR / GRAPH / VISION / OCR) without running the full search.',
					operationId: 'postClassifyIntent',
					tags: ['Search'],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									required: ['query'],
									properties: {
										query: { type: 'string', example: 'What is our refund policy?' },
										hasImage: { type: 'boolean', default: false },
									},
								},
							},
						},
					},
					responses: {
						'200': {
							description: 'Classification result',
							content: {
								'application/json': {
									schema: {
										type: 'object',
										properties: {
											intent: { type: 'string', enum: ['ENTITY_LOOKUP', 'SEMANTIC_SEARCH', 'KEYWORD_EXACT', 'OCR_DOCUMENT', 'VISUAL_ANALYSIS', 'GRAPH_REASONING'] },
											confidence: { type: 'number', minimum: 0, maximum: 1 },
											reasoning: { type: 'string' },
										},
									},
								},
							},
						},
					},
				},
			},
			'/ingest': {
				post: {
					summary: 'Ingest a document',
					description:
						'Chunks the content recursively (512 tokens, 15% overlap), embeds each chunk, ' +
						'stores in Vectorize + D1. Re-ingesting an existing ID overwrites. ' +
						'Triggers knowledge reflection in the background.',
					operationId: 'postIngest',
					tags: ['Ingestion'],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: { '$ref': '#/components/schemas/Document' },
								examples: {
									simple: { summary: 'Minimal', value: { id: 'my-doc-001', content: 'Your document text here...' } },
									full: { summary: 'Full metadata', value: { id: 'report-q1', content: 'Q1 sales were up 12%...', title: 'Q1 Sales Report', category: 'finance', source_type: 'pdf', tags: ['finance', 'q1'], file_name: 'q1-report.pdf', mime_type: 'application/pdf' } },
								},
							},
						},
					},
					responses: {
						'200': { description: 'Ingestion result', content: { 'application/json': { schema: { '$ref': '#/components/schemas/IngestResponse' } } } },
						'400': { description: 'Missing id or content', content: { 'application/json': { schema: { '$ref': '#/components/schemas/ErrorResponse' } } } },
					},
				},
			},
			'/ingest/batch': {
				post: {
					summary: 'Batch ingest documents',
					description:
						'Ingest up to 100 documents in a single request. ' +
						'Processed in concurrency-controlled waves (default 5, max 10). ' +
						'Returns per-document success/failure. Reflection runs in background for all succeeded docs.',
					operationId: 'postIngestBatch',
					tags: ['Ingestion'],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									required: ['documents'],
									properties: {
										documents: {
											type: 'array',
											items: { '$ref': '#/components/schemas/Document' },
											minItems: 1,
											maxItems: 100,
										},
										concurrency: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
									},
								},
							},
						},
					},
					responses: {
						'200': {
							description: 'Batch result',
							content: {
								'application/json': {
									schema: {
										type: 'object',
										properties: {
											success: { type: 'boolean' },
											total: { type: 'integer' },
											succeeded: { type: 'integer' },
											failed: { type: 'integer' },
											results: {
												type: 'array',
												items: {
													oneOf: [
														{
															type: 'object',
															properties: {
																id: { type: 'string' },
																success: { type: 'boolean', enum: [true] },
																chunks: { type: 'integer' },
																performance: { '$ref': '#/components/schemas/PerformanceTiming' },
															},
														},
														{
															type: 'object',
															properties: {
																id: { type: 'string' },
																success: { type: 'boolean', enum: [false] },
																error: { type: 'string' },
															},
														},
													],
												},
											},
											performance: {
												type: 'object',
												properties: {
													totalTime: { type: 'string', example: '450ms' },
													avgTimePerDoc: { type: 'string', example: '90ms' },
												},
											},
										},
									},
								},
							},
						},
						'400': { description: 'Empty array or > 100 documents', content: { 'application/json': { schema: { '$ref': '#/components/schemas/ErrorResponse' } } } },
					},
				},
			},
			'/ingest-image': {
				post: {
					summary: 'Ingest an image',
					description:
						'Accepts a multipart/form-data upload. Runs Llama 4 Scout 17B for vision description + OCR. ' +
						'Both semantic description and raw extracted text land in the index.',
					operationId: 'postIngestImage',
					tags: ['Ingestion'],
					requestBody: {
						required: true,
						content: {
							'multipart/form-data': {
								schema: {
									type: 'object',
									required: ['id', 'image'],
									properties: {
										id: { type: 'string', example: 'receipt-001' },
										image: { type: 'string', format: 'binary' },
										category: { type: 'string', example: 'receipts' },
										imageType: { type: 'string', enum: ['auto', 'screenshot', 'document', 'diagram', 'photo'], default: 'auto' },
										source_type: { type: 'string' },
										tags: { type: 'string', description: 'JSON array string: ["tag1","tag2"]' },
										tenant_id: { type: 'string' },
									},
								},
							},
						},
					},
					responses: {
						'200': {
							description: 'Image ingestion result',
							content: {
								'application/json': {
									schema: {
										type: 'object',
										properties: {
											success: { type: 'boolean' },
											documentId: { type: 'string' },
											description: { type: 'string' },
											extractedText: { type: 'string', nullable: true },
											performance: { '$ref': '#/components/schemas/PerformanceTiming' },
										},
									},
								},
							},
						},
					},
				},
			},
			'/find-similar-images': {
				post: {
					summary: 'Reverse image search',
					description: 'Upload a query image to find visually similar images already in the index.',
					operationId: 'postFindSimilarImages',
					tags: ['Search'],
					requestBody: {
						required: true,
						content: {
							'multipart/form-data': {
								schema: {
									type: 'object',
									required: ['image'],
									properties: {
										image: { type: 'string', format: 'binary' },
										topK: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
									},
								},
							},
						},
					},
					responses: {
						'200': {
							description: 'Similar images',
							content: {
								'application/json': {
									schema: {
										type: 'object',
										properties: {
											success: { type: 'boolean' },
											results: { type: 'array', items: { '$ref': '#/components/schemas/SearchResult' } },
											performance: { '$ref': '#/components/schemas/PerformanceTiming' },
										},
									},
								},
							},
						},
					},
				},
			},
			'/documents/{id}': {
				delete: {
					summary: 'Delete a document',
					description: 'Removes the document and all its chunks from Vectorize and D1. Tenant-scoped — tenants cannot delete other tenants\' documents.',
					operationId: 'deleteDocument',
					tags: ['Ingestion'],
					parameters: [
						{
							name: 'id',
							in: 'path',
							required: true,
							schema: { type: 'string' },
							example: 'my-doc-001',
						},
					],
					responses: {
						'200': {
							description: 'Deleted',
							content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, deleted: { type: 'string' } } } } },
						},
						'404': { description: 'Document not found or not owned by tenant', content: { 'application/json': { schema: { '$ref': '#/components/schemas/ErrorResponse' } } } },
					},
				},
			},
			'/analytics/cost': {
				get: {
					summary: 'Cost projection',
					description: 'Estimates monthly Cloudflare Workers AI + Vectorize cost based on query volume.',
					operationId: 'getCostAnalytics',
					tags: ['Meta'],
					parameters: [
						{
							name: 'queriesPerDay',
							in: 'query',
							required: true,
							schema: { type: 'integer', example: 1000 },
						},
					],
					responses: {
						'200': {
							description: 'Cost projection',
							content: { 'application/json': { schema: { type: 'object' } } },
						},
					},
				},
			},
			'/license/validate': {
				post: {
					summary: 'Validate a license key',
					description: 'Checks if a license key is active and returns its plan details. No auth required.',
					operationId: 'postLicenseValidate',
					security: [],
					tags: ['License'],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									required: ['licenseKey'],
									properties: { licenseKey: { type: 'string', example: 'LIC-XXXX-XXXX-XXXX' } },
								},
							},
						},
					},
					responses: {
						'200': { description: 'License details', content: { 'application/json': { schema: { type: 'object' } } } },
						'404': { description: 'Invalid or revoked license' },
					},
				},
			},
			'/license/create': {
				post: {
					summary: 'Create a license key',
					description: 'Admin only. Creates a new license with plan limits.',
					operationId: 'postLicenseCreate',
					tags: ['License'],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									required: ['email', 'plan'],
									properties: {
										email: { type: 'string', format: 'email', example: 'user@example.com' },
										plan: { type: 'string', enum: ['basic', 'pro', 'enterprise'] },
										maxDocuments: { type: 'integer', example: 1000 },
										maxQueriesPerDay: { type: 'integer', example: 10000 },
									},
								},
							},
						},
					},
					responses: {
						'200': { description: 'Created license key', content: { 'application/json': { schema: { type: 'object' } } } },
					},
				},
			},
			'/license/list': {
				get: {
					summary: 'List all license keys',
					description: 'Admin only.',
					operationId: 'getLicenseList',
					tags: ['License'],
					responses: {
						'200': { description: 'License list', content: { 'application/json': { schema: { type: 'object' } } } },
					},
				},
			},
			'/license/revoke': {
				post: {
					summary: 'Revoke a license key',
					description: 'Admin only.',
					operationId: 'postLicenseRevoke',
					tags: ['License'],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									required: ['licenseKey'],
									properties: { licenseKey: { type: 'string', example: 'LIC-XXXX-XXXX-XXXX' } },
								},
							},
						},
					},
					responses: {
						'200': { description: 'Revoked', content: { 'application/json': { schema: { type: 'object' } } } },
					},
				},
			},
			'/mcp': {
				'x-description': 'MCP Streamable HTTP server (all methods)',
				post: {
					summary: 'MCP Streamable HTTP transport',
					description:
						'Handles all MCP protocol traffic (initialize, tools/list, tools/call). ' +
						'Backed by a Cloudflare Durable Object per session. ' +
						'Connect via `mcp-remote` (Claude Desktop) or native Streamable HTTP (Cursor, Windsurf).',
					operationId: 'mcpStreamable',
					tags: ['MCP'],
					requestBody: {
						content: { 'application/json': { schema: { type: 'object', description: 'MCP JSON-RPC 2.0 message.' } } },
					},
					responses: {
						'200': { description: 'MCP response or SSE stream' },
					},
				},
			},
			'/mcp/tools': {
				get: {
					summary: 'List MCP tools (legacy)',
					description: 'Legacy JSON endpoint listing the six available MCP tools. Use the Streamable HTTP `/mcp` endpoint for production MCP clients.',
					operationId: 'getMcpTools',
					tags: ['MCP'],
					security: [],
					responses: {
						'200': { description: 'Tool list', content: { 'application/json': { schema: { type: 'object' } } } },
					},
				},
			},
			'/mcp/call': {
				post: {
					summary: 'Call an MCP tool (legacy)',
					description: 'Legacy JSON-RPC endpoint. Use the Streamable HTTP `/mcp` endpoint for production MCP clients.',
					operationId: 'postMcpCall',
					tags: ['MCP'],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									required: ['tool', 'arguments'],
									properties: {
										tool: { type: 'string', enum: ['search', 'ingest', 'ingest_image_url', 'find_similar_by_url', 'delete', 'stats'], example: 'search' },
										arguments: { type: 'object', example: { query: 'Q1 pricing decisions', topK: 5 } },
									},
								},
							},
						},
					},
					responses: {
						'200': { description: 'Tool result', content: { 'application/json': { schema: { type: 'object' } } } },
					},
				},
			},
		},

		tags: [
			{ name: 'Search', description: 'Query the knowledge base' },
			{ name: 'Ingestion', description: 'Add, update, or remove documents and images' },
			{ name: 'MCP', description: 'Model Context Protocol server — connect Claude Desktop, Cursor, and Windsurf' },
			{ name: 'License', description: 'License key management' },
			{ name: 'Meta', description: 'Health, stats, and API info' },
		],
	};

	return new Response(JSON.stringify(spec, null, 2), {
		headers: { 'Content-Type': 'application/json', ...corsHeaders() },
	});
}
