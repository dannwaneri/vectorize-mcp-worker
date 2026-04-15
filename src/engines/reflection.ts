/**
 * ReflectionEngine — knowledge accumulation through LLM synthesis.
 *
 * Two operations:
 *
 *   reflect()         — called after every new document ingest. Finds related
 *                       chunks in Vectorize, asks Llama to synthesize a structured
 *                       insight (INSIGHT / CONNECTION / GAP), and stores it as
 *                       doc_type='reflection' in both D1 and Vectorize.
 *
 *   maybeConsolidate() — called after every ingest. Checks if the raw document
 *                        count is a multiple of 5; if so, merges the most recent
 *                        reflections into a single doc_type='summary'.
 *
 * Both are always fire-and-forget. They NEVER throw. Ingestion cannot be
 * blocked or failed by anything in this file.
 */
import { Document } from '../types/document';
import { Env } from '../types/env';
import { resolveEmbeddingModel, ROUTING_MODELS, DEFAULT_ROUTING } from '../config/models';

// One strong match is enough to produce a useful reflection.
// Set to 2 if you want more conservative synthesis.
const MIN_RELATED_CHUNKS = 1;

// Minimum Vectorize similarity score for a chunk to count as "related".
// 0.45 catches meaningful semantic overlap without going too loose.
const MIN_SIMILARITY = 0.45;

// Minimum number of reflections required before consolidation makes sense.
const MIN_REFLECTIONS_TO_CONSOLIDATE = 2;

export class ReflectionEngine {
	/**
	 * Generate a structured reflection for a newly ingested document.
	 *
	 * The reflection captures three things:
	 *   INSIGHT    — what new knowledge the document adds
	 *   CONNECTION — how it relates to what's already in the knowledge base
	 *   GAP        — what the combined knowledge still doesn't answer
	 *
	 * Stored with doc_type='reflection' and a reflection_score (mean similarity
	 * of source chunks) so clients can filter and rank by quality.
	 */
	async reflect(doc: Document, env: Env): Promise<void> {
		try {
			const embModel = resolveEmbeddingModel(env.EMBEDDING_MODEL);

			// Step 1: Embed the new document to find what it's near in the index
			const embResp = await env.AI.run(embModel.id as any, {
				text: doc.content.substring(0, 512),
			});
			const embedding: number[] = Array.isArray(embResp)
				? embResp
				: (embResp as any).data?.[0] ?? [];

			if (!embedding.length) {
				console.warn('[Reflection] Empty embedding for:', doc.id);
				return;
			}

			// Step 2: Find related chunks (scoped to tenant if applicable)
			const queryFilter = doc.tenant_id
				? { tenant_id: { $eq: doc.tenant_id } }
				: undefined;

			const vecResults = await env.VECTORIZE.query(embedding, {
				topK: 8,
				returnMetadata: 'all',
				...(queryFilter ? { filter: queryFilter } : {}),
			});

			// Keep only chunks that are:
			//   - not from the document we just ingested
			//   - not an existing reflection (avoids reflection-of-reflection noise)
			//   - above the similarity threshold
			const related = (vecResults.matches || []).filter(
				m =>
					!m.id.startsWith(doc.id) &&
					(m.metadata as any)?.doc_type !== 'reflection' &&
					(m.metadata as any)?.doc_type !== 'summary' &&
					m.score >= MIN_SIMILARITY,
			);

			if (related.length < MIN_RELATED_CHUNKS) {
				console.log(
					`[Reflection] Only ${related.length} quality matches (need ${MIN_RELATED_CHUNKS}) — skipping: ${doc.id}`,
				);
				return;
			}

			// reflection_score = mean similarity of contributing chunks.
			// Higher score = tighter connections = more confident synthesis.
			const top = related.slice(0, 5);
			const reflectionScore = top.reduce((s, m) => s + m.score, 0) / top.length;

			// Step 3: Build context for the LLM
			const relatedContext = top
				.map((m, i) => {
					const content = ((m.metadata as any)?.content as string) || '';
					return `[Source ${i + 1}] (similarity ${m.score.toFixed(2)}): ${content.substring(0, 400)}`;
				})
				.join('\n\n');

			// Step 4: Tight synthesis prompt — output must work as a standalone
			// search result. Three sentences, no fluff, max ~60 words total.
			const categoryHint = doc.category ? ` (${doc.category})` : '';
			const prompt =
				`Synthesise these sources into 3 tightly written sentences for a knowledge base${categoryHint}.\n\n` +
				`NEW:\n"${doc.content.substring(0, 500)}"\n\n` +
				`EXISTING:\n${relatedContext}\n\n` +
				`Output exactly 3 sentences — no labels, no preamble:\n` +
				`1. The single most specific fact or capability the new source adds (use nouns/numbers).\n` +
				`2. The strongest factual bridge between the new source and the existing sources.\n` +
				`3. The most important question that remains unanswered after combining all sources.\n\n` +
				`Hard rules: under 70 words total. No "The document". No "This shows". Facts only.`;

			const llmResp = await env.AI.run(ROUTING_MODELS[DEFAULT_ROUTING].id as any, {
				messages: [{ role: 'user', content: prompt }],
				max_tokens: 180,
			});

			const reflectionText: string =
				(llmResp as any)?.response ||
				(llmResp as any)?.result?.response ||
				'';

			if (!reflectionText.trim()) {
				console.warn('[Reflection] LLM returned empty for:', doc.id);
				return;
			}

			// Step 5: Persist in D1
			const reflectionId = `reflection_${doc.id}_${Date.now()}`;
			const parentIds = JSON.stringify([
				doc.id,
				...top.map(m => (m.metadata as any)?.parentId || m.id),
			]);
			const now = new Date().toISOString();

			if (env.DB) {
				await env.DB.prepare(
					`INSERT INTO documents
						(id, content, title, source, category, chunk_index, parent_id,
						 word_count, is_image, tenant_id, doc_type, parent_ids, last_reflected_at, reflection_version)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				).bind(
					reflectionId,
					reflectionText,
					`Reflection: ${doc.title || doc.id}`,
					'reflection',
					doc.category || 'reflection',
					0,
					doc.id,
					reflectionText.split(/\s+/).length,
					0,
					doc.tenant_id || null,
					'reflection',
					parentIds,
					now,
					1,
				).run();

				// Stamp the triggering document with the reflection timestamp
				await env.DB.prepare(
					`UPDATE documents SET last_reflected_at = ? WHERE id = ? OR parent_id = ?`,
				).bind(now, doc.id, doc.id).run();
			}

			// Step 6: Embed the reflection and upsert to Vectorize
			// reflection_score is stored in metadata so clients can filter on quality.
			const reflEmbResp = await env.AI.run(embModel.id as any, {
				text: reflectionText.substring(0, 512),
			});
			const reflEmbedding: number[] = Array.isArray(reflEmbResp)
				? reflEmbResp
				: (reflEmbResp as any).data?.[0] ?? [];

			if (reflEmbedding.length) {
				await env.VECTORIZE.upsert([{
					id: reflectionId,
					values: reflEmbedding,
					metadata: {
						content: reflectionText,
						category: doc.category || 'reflection',
						parentId: doc.id,
						chunkIndex: 0,
						isImage: false,
						source_type: 'reflection',
						doc_type: 'reflection',
						reflection_score: reflectionScore,
						date_created: now,
						embedding_model: embModel.id,
						embedding_dimensions: embModel.dimensions,
						...(doc.tenant_id ? { tenant_id: doc.tenant_id } : {}),
					} as any,
				}]);
			}

			console.log(
				`[Reflection] ${reflectionId} — score: ${reflectionScore.toFixed(2)}, sources: ${top.length}`,
			);

		} catch (error) {
			console.error('[Reflection] reflect() failed for', doc.id, ':', error);
		}
	}

	/**
	 * Check whether consolidation should run and kick it off if so.
	 *
	 * Consolidation runs when the number of root raw documents is a positive
	 * multiple of 5. "Root" means chunk_index = 0 (one row per document, not
	 * per chunk) to avoid counting the same document multiple times.
	 */
	async maybeConsolidate(tenantId: string | null, env: Env): Promise<void> {
		if (!env.DB) return;
		try {
			// Count root raw documents for this tenant
			const stmt = tenantId
				? env.DB.prepare(
					`SELECT COUNT(*) as cnt FROM documents
					 WHERE doc_type = 'raw' AND chunk_index = 0 AND tenant_id = ?`,
				  ).bind(tenantId)
				: env.DB.prepare(
					`SELECT COUNT(*) as cnt FROM documents
					 WHERE doc_type = 'raw' AND chunk_index = 0 AND tenant_id IS NULL`,
				  );

			const row = await stmt.first<{ cnt: number }>();
			const count = row?.cnt ?? 0;

			if (count > 0 && count % 3 === 0) {
				console.log(`[Reflection] ${count} raw docs — triggering consolidation`);
				await this.consolidate(tenantId, env);
			}
		} catch (error) {
			console.error('[Reflection] maybeConsolidate() failed:', error);
		}
	}

	/**
	 * Merge the most recent reflections into a single consolidated summary.
	 *
	 * Takes up to 10 recent reflections and synthesises them into one
	 * doc_type='summary' document. The summary captures the dominant theme,
	 * preserves the most specific facts, and flags the most persistent open gap.
	 *
	 * The IDs of the merged reflections are stored in parent_ids for traceability.
	 */
	async consolidate(tenantId: string | null, env: Env): Promise<void> {
		try {
			if (!env.DB) return;

			// Pull the most recent reflections for this tenant
			const stmt = tenantId
				? env.DB.prepare(
					`SELECT id, content FROM documents
					 WHERE doc_type = 'reflection' AND tenant_id = ?
					 ORDER BY created_at DESC LIMIT 10`,
				  ).bind(tenantId)
				: env.DB.prepare(
					`SELECT id, content FROM documents
					 WHERE doc_type = 'reflection' AND tenant_id IS NULL
					 ORDER BY created_at DESC LIMIT 10`,
				  );

			const rows = await stmt.all<{ id: string; content: string }>();
			const reflections = rows.results ?? [];

			if (reflections.length < MIN_REFLECTIONS_TO_CONSOLIDATE) {
				console.log(
					`[Reflection] ${reflections.length} reflections — need ${MIN_REFLECTIONS_TO_CONSOLIDATE} to consolidate`,
				);
				return;
			}

			const reflectionContext = reflections
				.map((r, i) => `[Insight ${i + 1}]: ${r.content}`)
				.join('\n\n');

			const prompt =
				`You are consolidating a series of knowledge insights into a single authoritative summary.\n\n` +
				`Here are ${reflections.length} insights gathered over time:\n${reflectionContext}\n\n` +
				`Write a consolidated knowledge summary (3–5 sentences) that:\n` +
				`1. States the dominant theme or pattern that runs across most insights\n` +
				`2. Preserves the two or three most specific, non-obvious facts\n` +
				`3. Identifies the most persistent open question or gap that keeps appearing\n\n` +
				`Be precise. Prioritise specificity over coverage. This summary will be retrieved to answer user questions.`;

			const llmResp = await env.AI.run(ROUTING_MODELS[DEFAULT_ROUTING].id as any, {
				messages: [{ role: 'user', content: prompt }],
				max_tokens: 320,
			});

			const summaryText: string =
				(llmResp as any)?.response ||
				(llmResp as any)?.result?.response ||
				'';

			if (!summaryText.trim()) {
				console.warn('[Reflection] Consolidation LLM returned empty');
				return;
			}

			const summaryId = `summary_${Date.now()}`;
			const consolidatedFrom = JSON.stringify(reflections.map(r => r.id));
			const now = new Date().toISOString();

			// Persist in D1
			await env.DB.prepare(
				`INSERT INTO documents
					(id, content, title, source, category, chunk_index, parent_id,
					 word_count, is_image, tenant_id, doc_type, parent_ids, last_reflected_at, reflection_version)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).bind(
				summaryId,
				summaryText,
				'Consolidated Knowledge Summary',
				'consolidation',
				'summary',
				0,
				summaryId,
				summaryText.split(/\s+/).length,
				0,
				tenantId ?? null,
				'summary',
				consolidatedFrom,
				now,
				1,
			).run();

			// Embed and upsert to Vectorize
			const embModel = resolveEmbeddingModel(env.EMBEDDING_MODEL);
			const embResp = await env.AI.run(embModel.id as any, {
				text: summaryText.substring(0, 512),
			});
			const embedding: number[] = Array.isArray(embResp)
				? embResp
				: (embResp as any).data?.[0] ?? [];

			if (embedding.length) {
				await env.VECTORIZE.upsert([{
					id: summaryId,
					values: embedding,
					metadata: {
						content: summaryText,
						category: 'summary',
						parentId: summaryId,
						chunkIndex: 0,
						isImage: false,
						source_type: 'consolidation',
						doc_type: 'summary',
						consolidated_from_count: reflections.length,
						date_created: now,
						embedding_model: embModel.id,
						embedding_dimensions: embModel.dimensions,
						...(tenantId ? { tenant_id: tenantId } : {}),
					} as any,
				}]);
			}

			console.log(
				`[Reflection] Consolidated ${reflections.length} reflections → ${summaryId}`,
			);

		} catch (error) {
			console.error('[Reflection] consolidate() failed:', error);
		}
	}
}

export const reflectionEngine = new ReflectionEngine();
