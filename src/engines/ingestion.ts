import { Document, ImageDocument, Chunk } from '../types/document';
import { Env } from '../types/env';
import { ChunkingEngine } from './chunking';
import { KeywordSearchEngine } from './keyword';

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

		const embStart = Date.now();
		// Batch: Generate all embeddings in parallel
		const embeddingPromises = chunks.map(chunk => 
			env.AI.run('@cf/baai/bge-small-en-v1.5', { text: chunk.content })
				.then(embResp => ({
					chunk,
					embedding: Array.isArray(embResp) ? embResp : (embResp as any).data[0]
				}))
		);

		const embeddingResults = await Promise.all(embeddingPromises);

		// Store in DB and build vectors
		for (const { chunk, embedding } of embeddingResults) {
			if (env.DB) {
				await env.DB.prepare('INSERT INTO documents (id, content, title, source, category, chunk_index, parent_id, word_count, is_image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(
					chunk.id, chunk.content, doc.title || null, doc.source || null, 
					doc.category || null, chunk.chunkIndex, chunk.parentId, 
					chunk.content.split(/\s+/).length, 0
				).run();
				await this.kwEngine.indexDocument(env.DB, chunk.id, chunk.content);
			}
			vectors.push({ 
				id: chunk.id, 
				values: embedding, 
				metadata: { 
					content: chunk.content, 
					category: doc.category || '', 
					parentId: chunk.parentId, 
					chunkIndex: chunk.chunkIndex, 
					isImage: false 
				} 
			});
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
	
		// Call multimodal worker via service binding
		const multimodalStart = Date.now();
		const response = await env.MULTIMODAL.fetch('http://internal/describe-image', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				imageBuffer: Array.from(new Uint8Array(doc.imageBuffer)),
				prompt: doc.content || undefined,
				imageType: doc.imageType || 'auto',
			}),
		});
	
		const result = await response.json<{
			success: boolean;
			description: string;
			extractedText?: string;
			vector: number[];
			metadata: { 
				processingTime: string;
				hasExtractedText: boolean;
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
			await env.DB.prepare('INSERT INTO documents (id, content, title, source, category, chunk_index, parent_id, word_count, is_image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(
				doc.id,
				fullContent,
				doc.title || 'Image Document',
				doc.source || 'image',
				doc.category || 'images',
				0,
				doc.id,
				fullContent.split(/\s+/).length,
				1
			).run();
			await this.kwEngine.indexDocument(env.DB, doc.id, fullContent);
		}
	
		// Store vector
		await env.VECTORIZE.upsert([{
			id: doc.id,
			values: result.vector,
			metadata: {
				content: fullContent,
				category: doc.category || 'images',
				parentId: doc.id,
				chunkIndex: 0,
				isImage: true,
				hasExtractedText: result.metadata.hasExtractedText,
			},
		}]);
	
		perf.totalTime = `${Date.now() - start}ms`;
	
		return { 
			success: true, 
			description: result.description,
			extractedText: result.extractedText,
			performance: perf 
		};
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