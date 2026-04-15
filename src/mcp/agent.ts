/**
 * VectorizeMcpAgent — official MCP server using Cloudflare's agents package.
 *
 * Transport:  Streamable HTTP at /mcp  (April 2026 best practice)
 * Statefulness: Durable Object per session — env is available as this.env
 * Multi-tenancy: tenant_id resolved from Authorization header on connect,
 *   stored as instance field, injected into every tool call automatically.
 *
 * Tools:
 *   search              – hybrid vector + BM25 with metadata filters
 *   ingest              – text document with auto-chunking
 *   ingest_image_url    – image from a public URL (vision + OCR + embedding)
 *   find_similar_by_url – reverse image search from a public URL
 *   delete              – remove a document and all its chunks
 *   stats               – index statistics + active model info
 */
import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Env } from '../types/env';
import { HybridSearchEngine } from '../engines/hybrid';
import { IngestionEngine } from '../engines/ingestion';
import { validateFilters, SearchFilters } from '../types/search';
import { resolveEmbeddingModel } from '../config/models';
import { resolveTenantFromToken, injectTenantFilter } from '../middleware/tenant';
import { reflectionEngine } from '../engines/reflection';

const hybridSearch = new HybridSearchEngine();
const ingestion = new IngestionEngine();

// ── Shared filter Zod shape ────────────────────────────────────────────────────
const filterOpStr = z.object({
	$eq: z.string().optional(),
	$ne: z.string().optional(),
	$in: z.array(z.string()).optional(),
}).optional();

const filterOpDate = z.object({
	$eq: z.string().optional(),
	$gt: z.string().optional(),
	$gte: z.string().optional(),
	$lt: z.string().optional(),
	$lte: z.string().optional(),
}).optional();

const filtersShape = {
	source_type: filterOpStr.describe('Filter by source type, e.g. { "$eq": "pdf" }'),
	category: filterOpStr.describe('Filter by category, e.g. { "$eq": "finance" }'),
	tags: z.object({ $eq: z.string().optional(), $in: z.array(z.string()).optional() }).optional()
		.describe('Filter by tags (in-memory post-filter). e.g. { "$in": ["tag1","tag2"] }'),
	date_created: filterOpDate.describe('Filter by ISO 8601 creation date'),
	tenant_id: filterOpStr.describe('Ignored for tenant users — value is always enforced from auth context'),
	mime_type: filterOpStr.describe('Filter by MIME type, e.g. { "$eq": "application/pdf" }'),
	file_name: z.object({ $eq: z.string().optional(), $ne: z.string().optional() }).optional()
		.describe('Filter by file name, e.g. { "$eq": "report.pdf" }'),
	doc_type: z.object({ $eq: z.enum(['raw', 'reflection', 'summary']).optional(), $ne: z.enum(['raw', 'reflection', 'summary']).optional() }).optional()
		.describe('Filter by document type. e.g. { "$eq": "reflection" } to see only synthesized insights, { "$ne": "reflection" } to exclude them.'),
};

// ── Result helpers ─────────────────────────────────────────────────────────────
function ok(data: unknown) {
	return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}
function err(msg: string) {
	return { content: [{ type: 'text' as const, text: msg }], isError: true as const };
}

// ── Agent ──────────────────────────────────────────────────────────────────────
export class VectorizeMcpAgent extends McpAgent<Env> {
	server = new McpServer({
		name: 'Vectorize RAG',
		version: '4.0.0',
	});

	/**
	 * Tenant resolved from the Authorization header on the first WebSocket/HTTP
	 * connection. Null means admin (unrestricted); a string enforces isolation.
	 * Set in onConnect before any tool call can reach init().
	 */
	private _tenantId: string | null = null;

	// Override onConnect to capture tenant from the connection's Authorization header
	async onConnect(connection: any, ctx: any): Promise<void> {
		const authHeader = ctx?.request?.headers?.get?.('Authorization') || '';
		this._tenantId = resolveTenantFromToken(authHeader, this.env);
		// Call parent so the MCP protocol handshake continues normally
		await super.onConnect(connection, ctx);
	}

	async init(): Promise<void> {
		// ── 1. search ─────────────────────────────────────────────────────────────
		this.server.registerTool(
			'search',
			{
				description:
					'Hybrid semantic + BM25 keyword search over the knowledge base with optional metadata filters and cross-encoder reranking.\n\n' +
					'Returns ranked results with content, score, and category.\n\n' +
					'Filter operators: $eq, $ne, $in (string fields), $gt/$gte/$lt/$lte (date_created).\n' +
					'Tenant isolation is automatic — you only see documents belonging to your tenant.',
				inputSchema: {
					query: z.string().describe('Natural language search query'),
					topK: z.number().int().min(1).max(50).default(5).optional()
						.describe('Number of results to return (1–50, default 5)'),
					rerank: z.boolean().default(true).optional()
						.describe('Apply cross-encoder reranking for higher accuracy (default true)'),
					filters: z.object(filtersShape).optional()
						.describe('Optional metadata pre-filters. tenant_id is always enforced from auth.'),
				},
			},
			async ({ query, topK = 5, rerank = true, filters }) => {
				try {
					const filterResult = validateFilters(filters);
					if (!filterResult.valid) return err(`Invalid filters: ${filterResult.error}`);

					const rawFilters: SearchFilters | undefined =
						Object.keys(filterResult.filters).length > 0 ? filterResult.filters : undefined;

					// Tenant injection — always override any caller-supplied tenant_id
					const effectiveFilters = injectTenantFilter(rawFilters, this._tenantId);

					const clampedTopK = Math.min(Math.max(1, topK), 50);
					const { results, performance } = await hybridSearch.search(
						query, this.env, clampedTopK, rerank, effectiveFilters,
					);
					return ok({
						results: results.map(r => ({
							id: r.id,
							content: r.content,
							score: r.rrfScore,
							category: r.category,
						})),
						...(effectiveFilters ? { filtersApplied: effectiveFilters } : {}),
						performance,
					});
				} catch (e) {
					return err(`Search failed: ${e instanceof Error ? e.message : String(e)}`);
				}
			},
		);

		// ── 2. ingest ──────────────────────────────────────────────────────────────
		this.server.registerTool(
			'ingest',
			{
				description:
					'Add a text document to the knowledge base with automatic recursive chunking and embedding.\n\n' +
					'Tenant isolation is automatic — the document is tagged with your tenant from auth. ' +
					'Re-ingesting the same id overwrites the document.',
				inputSchema: {
					id: z.string().describe('Unique document identifier'),
					content: z.string().describe('Full text content to index'),
					title: z.string().optional().describe('Human-readable title'),
					category: z.string().optional().describe('Category for BM25 boost and filtering'),
					source_type: z.string().optional()
						.describe('Content origin: text, pdf, markdown, web, email, etc. Default: text'),
					tags: z.array(z.string()).optional().describe('Tags for post-filter queries'),
					mime_type: z.string().optional().describe('MIME type, e.g. application/pdf'),
					file_name: z.string().optional().describe('Original filename for attribution'),
				},
			},
			async (args) => {
				try {
					// Inject tenant — callers cannot override
					const doc = {
						...args,
						...(this._tenantId ? { tenant_id: this._tenantId } : {}),
					};
					const result = await ingestion.ingest(doc, this.env);

					// Fire reflection + consolidation in background.
					// Durable Objects don't expose ctx.waitUntil, so detached promise.
					reflectionEngine.reflect(doc, this.env)
						.then(() => reflectionEngine.maybeConsolidate(
							(doc as any).tenant_id || null,
							this.env,
						))
						.catch(() => {/* swallowed */});

					return ok({
						success: true,
						chunks: result.chunks,
						...(this._tenantId ? { tenant_id: this._tenantId } : {}),
						performance: result.performance,
					});
				} catch (e) {
					return err(`Ingest failed: ${e instanceof Error ? e.message : String(e)}`);
				}
			},
		);

		// ── 3. ingest_image_url ────────────────────────────────────────────────────
		this.server.registerTool(
			'ingest_image_url',
			{
				description:
					'Fetch an image from a public URL and add it to the knowledge base.\n\n' +
					'Uses Llama 4 Scout (vision) to generate a semantic description and OCR extraction. ' +
					'Tenant isolation is automatic.',
				inputSchema: {
					id: z.string().describe('Unique document identifier'),
					imageUrl: z.string().url().describe('Publicly accessible image URL'),
					imageType: z.enum(['screenshot', 'diagram', 'photo', 'document', 'chart', 'auto'])
						.default('auto').optional().describe('Type hint for the vision model'),
					category: z.string().optional().describe('Category for BM25 and filtering'),
					source_type: z.string().optional().describe('Default: image'),
					tags: z.array(z.string()).optional().describe('Tags for post-filter queries'),
					file_name: z.string().optional().describe('Original filename'),
				},
			},
			async ({ id, imageUrl, imageType = 'auto', category, source_type, tags, file_name }) => {
				try {
					const response = await fetch(imageUrl);
					if (!response.ok) {
						return err(`Failed to fetch image (status ${response.status})`);
					}
					const contentType = response.headers.get('Content-Type') || 'image/jpeg';
					const arrayBuffer = await response.arrayBuffer();

					const result = await ingestion.ingestImage({
						id,
						content: '',
						imageBuffer: arrayBuffer,
						imageType: imageType as any,
						category,
						source_type: source_type || 'image',
						mime_type: contentType,
						tags,
						file_name: file_name || imageUrl.split('/').pop()?.split('?')[0] || 'image',
						...(this._tenantId ? { tenant_id: this._tenantId } : {}),
					}, this.env);

					return ok({
						success: true,
						description: result.description,
						...(result.extractedText ? { extractedText: result.extractedText } : {}),
						...(this._tenantId ? { tenant_id: this._tenantId } : {}),
						performance: result.performance,
					});
				} catch (e) {
					return err(`Image ingest failed: ${e instanceof Error ? e.message : String(e)}`);
				}
			},
		);

		// ── 4. find_similar_by_url ─────────────────────────────────────────────────
		this.server.registerTool(
			'find_similar_by_url',
			{
				description:
					'Find images and documents visually similar to an image at a given URL.\n\n' +
					'Tenant isolation is automatic — results are scoped to your tenant.',
				inputSchema: {
					imageUrl: z.string().url().describe('Publicly accessible query image URL'),
					topK: z.number().int().min(1).max(20).default(5).optional()
						.describe('Number of similar results to return (1–20, default 5)'),
					imageType: z.enum(['screenshot', 'diagram', 'photo', 'document', 'chart', 'auto'])
						.default('auto').optional().describe('Type hint for embedding quality'),
				},
			},
			async ({ imageUrl, topK = 5, imageType = 'auto' }) => {
				try {
					const response = await fetch(imageUrl);
					if (!response.ok) return err(`Failed to fetch image (status ${response.status})`);
					const arrayBuffer = await response.arrayBuffer();
					const imageBytes = new Uint8Array(arrayBuffer);

					const embModel = resolveEmbeddingModel(this.env.EMBEDDING_MODEL);
					const multimodalResponse = await this.env.MULTIMODAL.fetch(
						'http://internal/describe-image',
						{
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								imageBuffer: Array.from(imageBytes),
								imageType,
								embeddingModel: embModel.id,
								source_type: 'image',
								mime_type: response.headers.get('Content-Type') || 'image/jpeg',
							}),
						},
					);

					const multimodalResult = await multimodalResponse.json<{
						success: boolean;
						vector: number[];
						description: string;
						error?: string;
					}>();

					if (!multimodalResult.success || !multimodalResult.vector?.length) {
						return err(`Multimodal processing failed: ${multimodalResult.error || 'empty vector'}`);
					}

					const effectiveFilters = injectTenantFilter(undefined, this._tenantId);
					const vecTopK = Math.min(topK * 2, 20);

					const vecResults = await this.env.VECTORIZE.query(multimodalResult.vector, {
						topK: vecTopK,
						returnMetadata: 'all',
						...(effectiveFilters
							? { filter: { tenant_id: { $eq: (effectiveFilters as any).tenant_id.$eq } } }
							: {}),
					});

					const results = (vecResults.matches || [])
						.slice(0, topK)
						.map(m => ({
							id: m.id,
							score: m.score,
							content: (m.metadata as any)?.content || '',
							isImage: (m.metadata as any)?.isImage || false,
							category: (m.metadata as any)?.category || null,
						}));

					return ok({ results, queryDescription: multimodalResult.description });
				} catch (e) {
					return err(`Similar image search failed: ${e instanceof Error ? e.message : String(e)}`);
				}
			},
		);

		// ── 5. delete ──────────────────────────────────────────────────────────────
		this.server.registerTool(
			'delete',
			{
				description:
					'Permanently delete a document and all its chunks from the knowledge base.\n\n' +
					'Tenant users can only delete their own documents. ' +
					'Returns an error if the document is not found or belongs to another tenant.',
				inputSchema: {
					id: z.string().describe('Document ID to delete'),
				},
			},
			async ({ id }) => {
				try {
					const deleted = await ingestion.deleteWithTenantCheck(id, this._tenantId, this.env);
					if (!deleted) return err(`Document not found: ${id}`);
					return ok({ success: true, deleted: id });
				} catch (e) {
					return err(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
				}
			},
		);

		// ── 6. stats ───────────────────────────────────────────────────────────────
		this.server.registerTool(
			'stats',
			{
				description:
					'Get knowledge base statistics: vector count, document count, active embedding model, index dimensions.',
				inputSchema: {},
			},
			async () => {
				try {
					const vectorStats = await this.env.VECTORIZE.describe();
					const docStats = this.env.DB
						? await this.env.DB.prepare(
							'SELECT total_documents, avg_doc_length FROM doc_stats WHERE id = 1',
						  ).first()
						: null;
					const embModel = resolveEmbeddingModel(this.env.EMBEDDING_MODEL);
					return ok({
						vectors: (vectorStats as any).vectorsCount ?? 0,
						documents: (docStats as any)?.total_documents ?? 0,
						embeddingModel: embModel.id,
						embeddingKey: this.env.EMBEDDING_MODEL || 'bge-small',
						dimensions: embModel.dimensions,
						...(this._tenantId ? { tenant: this._tenantId } : { tenant: null, isAdmin: true }),
					});
				} catch (e) {
					return err(`Stats failed: ${e instanceof Error ? e.message : String(e)}`);
				}
			},
		);
	}
}
