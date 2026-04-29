import { Document, ImageDocument, VectorMetadata } from '../types/document';
import { Env } from '../types/env';
import { ChunkingEngine } from './chunking';
import { KeywordSearchEngine } from './keyword';
import { resolveEmbeddingModel, DEFAULT_VISION, VISION_MODELS } from '../config/models';

export class IngestionEngine {
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

		// Resolve active embedding model from env
		const embModel = resolveEmbeddingModel(env.EMBEDDING_MODEL);

		// Shared metadata fields derived from the document (same for all chunks)
		const docDateCreated = doc.date_created || new Date().toISOString();

		const embStart = Date.now();
		// Batch: Generate all embeddings in parallel
		const embeddingPromises = chunks.map(chunk =>
			env.AI.run(embModel.id as any, { text: chunk.content })
				.then(embResp => ({
					chunk,
					embedding: Array.isArray(embResp) ? embResp : (embResp as any).data[0]
				}))
		);

		const embeddingResults = await Promise.all(embeddingPromises);

		// Store in DB and build vectors
		for (const { chunk, embedding } of embeddingResults) {
			if (env.DB) {
				await env.DB.prepare(
					'INSERT INTO documents (id, content, title, source, category, chunk_index, parent_id, word_count, is_image, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
				).bind(
					chunk.id, chunk.content, doc.title || null, doc.source || null,
					doc.category || null, chunk.chunkIndex, chunk.parentId,
					chunk.content.split(/\s+/).length, 0,
					doc.tenant_id || null,
				).run();
				await this.kwEngine.indexDocument(env.DB, chunk.id, chunk.content);
			}

			const meta: VectorMetadata = {
				// Spread custom metadata from the document first (e.g. author, likes, url)
				// so that system fields below take precedence if there's a conflict.
				...(doc.metadata && typeof doc.metadata === 'object' ? doc.metadata : {}),
				content: chunk.content,
				category: doc.category || '',
				parentId: chunk.parentId,
				chunkIndex: chunk.chunkIndex,
				isImage: false,
				source_type: doc.source_type || 'text',
				doc_type: doc.doc_type || 'raw',
				date_created: docDateCreated,
				embedding_model: embModel.id,
				embedding_dimensions: embModel.dimensions,
				...(doc.tags !== undefined && { tags: doc.tags }),
				...(doc.tenant_id !== undefined && { tenant_id: doc.tenant_id }),
				...(doc.mime_type !== undefined && { mime_type: doc.mime_type }),
				...(doc.file_name !== undefined && { file_name: doc.file_name }),
			};

			vectors.push({ id: chunk.id, values: embedding, metadata: meta as unknown as Record<string, VectorizeVectorMetadataValue> });
		}
		perf.embeddingTime = `${Date.now() - embStart}ms`;

		if (vectors.length) await env.VECTORIZE.upsert(vectors);
		perf.totalTime = `${Date.now() - start}ms`;

		return { success: true, chunks: chunks.length, performance: perf };
	}

	async ingestImage(doc: ImageDocument, env: Env): Promise<{
		success: boolean;
		description: string;
		extractedText?: string;
		performance: Record<string, string>
	}> {
		const start = Date.now();
		const perf: Record<string, string> = {};

		// Resolve embedding model for image vectors
		const imgEmbModel = resolveEmbeddingModel(env.EMBEDDING_MODEL);

		// Call multimodal worker via service binding.
		// embeddingModel is forwarded so the multimodal worker generates the
		// vector with the same model used by text ingestion.
		const response = await env.MULTIMODAL.fetch('http://internal/describe-image', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				imageBuffer: Array.from(new Uint8Array(doc.imageBuffer)),
				prompt: doc.content || undefined,
				imageType: doc.imageType || 'auto',
				embeddingModel: imgEmbModel.id,
				source_type: doc.source_type,
				mime_type: doc.mime_type,
				file_name: doc.file_name,
				tags: doc.tags,
				tenant_id: doc.tenant_id,
			}),
		});

		// vectorMetadata is added by Task 4. Typed as optional so this compiles
		// against both the current and updated multimodal-worker.
		const result = await response.json<{
			success: boolean;
			description: string;
			extractedText?: string;
			vector: number[];
			metadata: {
				processingTime: string;
				hasExtractedText: boolean;
			};
			vectorMetadata?: {
				source_type?: string;
				mime_type?: string;
				file_name?: string;
				tags?: string[];
				date_created?: string;
				tenant_id?: string;
			};
			error?: string;
		}>();

		if (!result.success) {
			throw new Error(result.error || 'Multimodal processing failed');
		}

		perf.multimodalProcessing = result.metadata.processingTime;

		// Combine description with extracted text
		const fullContent = result.extractedText
			? `${result.description}\n\nExtracted Text: ${result.extractedText}`
			: result.description;

		// Store in D1 and Vectorize
		if (env.DB) {
			await env.DB.prepare(
				'INSERT INTO documents (id, content, title, source, category, chunk_index, parent_id, word_count, is_image, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
			).bind(
				doc.id,
				fullContent,
				doc.title || 'Image Document',
				doc.source || 'image',
				doc.category || 'images',
				0,
				doc.id,
				fullContent.split(/\s+/).length,
				1,
				doc.tenant_id || null,
			).run();
			await this.kwEngine.indexDocument(env.DB, doc.id, fullContent);
		}

		// Resolve metadata: doc fields take precedence; fall back to what the
		// multimodal worker echoes back (populated after Task 4 is deployed).
		const vm = result.vectorMetadata;
		const imageMeta: VectorMetadata = {
			content: fullContent,
			category: doc.category || 'images',
			parentId: doc.id,
			chunkIndex: 0,
			isImage: true,
			hasExtractedText: result.metadata.hasExtractedText,
			source_type: doc.source_type ?? vm?.source_type ?? 'image',
			doc_type: 'raw',
			date_created: doc.date_created ?? vm?.date_created ?? new Date().toISOString(),
			mime_type: doc.mime_type ?? vm?.mime_type ?? 'image/png',
			embedding_model: imgEmbModel.id,
			embedding_dimensions: imgEmbModel.dimensions,
			...(doc.tags !== undefined ? { tags: doc.tags } : vm?.tags !== undefined ? { tags: vm.tags } : {}),
			...(doc.tenant_id !== undefined ? { tenant_id: doc.tenant_id } : vm?.tenant_id !== undefined ? { tenant_id: vm.tenant_id } : {}),
			...(doc.file_name !== undefined ? { file_name: doc.file_name } : vm?.file_name !== undefined ? { file_name: vm.file_name } : {}),
		};

		await env.VECTORIZE.upsert([{
			id: doc.id,
			values: result.vector,
			metadata: imageMeta as unknown as Record<string, VectorizeVectorMetadataValue>,
		}]);

		perf.totalTime = `${Date.now() - start}ms`;

		return {
			success: true,
			description: result.description,
			extractedText: result.extractedText,
			performance: perf
		};
	}

	/** Unconditional delete — for admin use or internal calls (no tenant check). */
	async delete(docId: string, env: Env): Promise<void> {
		if (env.DB) {
			const chunks = await env.DB.prepare(
				'SELECT id FROM documents WHERE id = ? OR parent_id = ?'
			).bind(docId, docId).all<{ id: string }>();
			const ids = chunks.results.map(c => c.id);
			if (ids.length) {
				await env.VECTORIZE.deleteByIds(ids);
				await env.DB.prepare(
					'DELETE FROM documents WHERE id = ? OR parent_id = ?'
				).bind(docId, docId).run();
			}
		}
	}

	/**
	 * Tenant-aware delete.
	 *
	 * - tenantId = null  → admin path, delegates to `delete()` unconditionally.
	 * - tenantId = string → only deletes if the document's tenant_id matches;
	 *   returns false (not found / not owned) without leaking info about existence.
	 *
	 * Returns true if the document was deleted, false if not found / access denied.
	 */
	async deleteWithTenantCheck(
		docId: string,
		tenantId: string | null,
		env: Env,
	): Promise<boolean> {
		// Admin: unrestricted
		if (!tenantId) {
			const before = env.DB
				? await env.DB.prepare(
					'SELECT id FROM documents WHERE id = ? OR parent_id = ?'
				  ).bind(docId, docId).first<{ id: string }>()
				: null;
			if (!before) return false; // 404
			await this.delete(docId, env);
			return true;
		}

		if (!env.DB) {
			// No D1 — cannot verify ownership, deny for safety
			return false;
		}

		// Find chunks that belong to this tenant
		const chunks = await env.DB.prepare(
			'SELECT id FROM documents WHERE (id = ? OR parent_id = ?) AND (tenant_id = ? OR (tenant_id IS NULL AND 0 = 1))'
		).bind(docId, docId, tenantId).all<{ id: string }>();

		if (!chunks.results.length) return false; // 404 (also covers cross-tenant access)

		const ids = chunks.results.map(c => c.id);
		await env.VECTORIZE.deleteByIds(ids);
		await env.DB.prepare(
			'DELETE FROM documents WHERE (id = ? OR parent_id = ?) AND tenant_id = ?'
		).bind(docId, docId, tenantId).run();

		return true;
	}
}