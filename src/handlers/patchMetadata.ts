/**
 * PATCH /documents/:id/metadata
 *
 * Updates metadata for a document and all its chunks — in both D1 and Vectorize —
 * WITHOUT re-embedding or re-chunking. Useful for correcting tags, category,
 * source_type, or any other metadata field after initial ingestion.
 *
 * How it works:
 *   1. Fetch all chunk rows for the document from D1 (parent_id = :id OR id = :id)
 *   2. Validate tenant ownership
 *   3. Apply the patch to D1 in a batch statement
 *   4. Re-upsert every chunk to Vectorize with updated metadata (same vectors, new metadata)
 *
 * Only the fields explicitly provided in the request body are updated.
 * Fields not present in the body are left unchanged (true PATCH semantics).
 *
 * Updatable fields: title, category, source, source_type, tags, mime_type,
 *                   file_name, date_created
 *
 * Not updatable via this endpoint: content, id, tenant_id, doc_type, chunk_index.
 * To change content, re-ingest with the same ID.
 */

import { Env } from '../types/env';
import { corsHeaders } from '../middleware/cors';
import { resolveTenant } from '../middleware/tenant';

/** Fields the caller is allowed to patch. */
const PATCHABLE_FIELDS = [
	'title',
	'category',
	'source',
	'source_type',
	'tags',
	'mime_type',
	'file_name',
	'date_created',
] as const;

type PatchableField = (typeof PATCHABLE_FIELDS)[number];

interface PatchBody {
	title?: string;
	category?: string;
	source?: string;
	source_type?: string;
	tags?: string[];
	mime_type?: string;
	file_name?: string;
	date_created?: string;
}

interface ChunkRow {
	id: string;
	content: string;
	title: string | null;
	source: string | null;
	category: string | null;
	source_type: string | null;
	tags: string | null; // JSON-encoded string[]
	mime_type: string | null;
	file_name: string | null;
	date_created: string | null;
	chunk_index: number;
	parent_id: string | null;
	word_count: number;
	is_image: number;
	tenant_id: string | null;
	doc_type: string | null;
	reflection_score: number | null;
	embedding_model: string | null;
	embedding_dimensions: number | null;
}

export async function handlePatchMetadata(
	request: Request,
	env: Env,
	docId: string,
): Promise<Response> {
	const tenantId = resolveTenant(request, env);

	// ── 1. Parse and validate the request body ──────────────────────────────
	let body: PatchBody;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, 400);
	}

	// Extract only the fields the caller is allowed to change
	const updates: Partial<PatchBody> = {};
	for (const field of PATCHABLE_FIELDS) {
		if (field in body) {
			(updates as any)[field] = (body as any)[field];
		}
	}

	if (Object.keys(updates).length === 0) {
		return json(
			{
				error: 'No patchable fields provided',
				patchable: PATCHABLE_FIELDS,
			},
			400,
		);
	}

	// Validate tags if provided
	if (updates.tags !== undefined) {
		if (
			!Array.isArray(updates.tags) ||
			updates.tags.some(t => typeof t !== 'string')
		) {
			return json({ error: 'tags must be an array of strings' }, 400);
		}
	}

	// ── 2. Fetch all chunks from D1 ──────────────────────────────────────────
	if (!env.DB) {
		return json({ error: 'D1 database not available' }, 503);
	}

	// A document's chunks all have parent_id = docId, plus the root row itself
	// (chunk_index = 0) which has id = docId (or id = docId_0).
	// We match on: id = docId OR parent_id = docId
	const chunkRows = await env.DB
		.prepare(
			`SELECT id, content, title, source, category, source_type, tags,
			        mime_type, file_name, date_created, chunk_index, parent_id,
			        word_count, is_image, tenant_id, doc_type, reflection_score,
			        embedding_model, embedding_dimensions
			 FROM documents
			 WHERE id = ? OR parent_id = ?`,
		)
		.bind(docId, docId)
		.all<ChunkRow>();

	const chunks = chunkRows.results ?? [];

	if (chunks.length === 0) {
		return json({ error: 'Document not found' }, 404);
	}

	// ── 3. Tenant check ──────────────────────────────────────────────────────
	// Admin (null tenantId) can patch anything.
	// Tenant callers may only patch their own documents.
	if (tenantId !== null) {
		const owner = chunks[0].tenant_id;
		if (owner !== tenantId) {
			return json({ error: 'Document not found' }, 404); // intentionally vague
		}
	}

	// ── 4. Build and run D1 batch update ────────────────────────────────────
	// Construct a SET clause from only the fields being updated
	const setClauses: string[] = [];
	const bindValues: unknown[] = [];

	for (const field of PATCHABLE_FIELDS) {
		if (!(field in updates)) continue;
		const value = (updates as any)[field];
		setClauses.push(`${field} = ?`);
		// Encode tags as JSON string for D1 storage
		bindValues.push(field === 'tags' ? JSON.stringify(value) : value);
	}

	// Also stamp updated_at if the column exists (best-effort)
	const now = new Date().toISOString();
	// We don't have an updated_at column but we can update last_reflected_at to
	// signal the row changed. Harmless if column doesn't exist — caught below.

	const setClause = setClauses.join(', ');
	const ids = chunks.map(c => c.id);

	// D1 batch: one UPDATE per chunk (D1 doesn't support WHERE id IN (?) with arrays)
	const statements = ids.map(id =>
		env.DB.prepare(`UPDATE documents SET ${setClause} WHERE id = ?`)
			.bind(...bindValues, id),
	);

	await env.DB.batch(statements);

	// ── 5. Re-upsert to Vectorize with updated metadata ──────────────────────
	// We don't have the stored vectors — Vectorize doesn't expose a "get vector"
	// API. But VECTORIZE.upsert() with the same ID and new metadata + a zero
	// vector would wipe the embedding. Instead we use getByIds() to retrieve
	// the existing vectors, then upsert with the new metadata.
	//
	// If getByIds() isn't available (older binding version), we fall back to
	// D1-only update and note it in the response.
	let vectorizeUpdated = false;
	let vectorizeError: string | null = null;

	try {
		// Retrieve existing vectors from Vectorize
		const existing = await (env.VECTORIZE as any).getByIds(ids);
		const existingMap = new Map<string, number[]>(
			(existing ?? []).map((v: any) => [v.id, v.values]),
		);

		// Build upsert payload — same vector, updated metadata
		const upserts = chunks
			.filter(chunk => existingMap.has(chunk.id))
			.map(chunk => {
				// Merge existing metadata with the patched fields
				const newMeta: Record<string, unknown> = {
					content:              chunk.content,
					title:                (updates.title       ?? chunk.title)       ?? undefined,
					category:             (updates.category    ?? chunk.category)    ?? undefined,
					source:               (updates.source      ?? chunk.source)      ?? undefined,
					source_type:          (updates.source_type ?? chunk.source_type) ?? undefined,
					tags:                 updates.tags         ?? (chunk.tags ? JSON.parse(chunk.tags) : undefined),
					mime_type:            (updates.mime_type   ?? chunk.mime_type)   ?? undefined,
					file_name:            (updates.file_name   ?? chunk.file_name)   ?? undefined,
					date_created:         (updates.date_created ?? chunk.date_created) ?? undefined,
					chunkIndex:           chunk.chunk_index,
					parentId:             chunk.parent_id ?? chunk.id,
					isImage:              !!chunk.is_image,
					doc_type:             chunk.doc_type ?? 'raw',
					...(chunk.tenant_id   ? { tenant_id: chunk.tenant_id }     : {}),
					...(chunk.reflection_score != null ? { reflection_score: chunk.reflection_score } : {}),
					...(chunk.embedding_model      ? { embedding_model: chunk.embedding_model }           : {}),
					...(chunk.embedding_dimensions ? { embedding_dimensions: chunk.embedding_dimensions } : {}),
				};

				// Strip undefined values — Vectorize rejects them
				for (const key of Object.keys(newMeta)) {
					if (newMeta[key] === undefined) delete newMeta[key];
				}

				return {
					id:       chunk.id,
					values:   existingMap.get(chunk.id)!,
					metadata: newMeta as any,
				};
			});

		if (upserts.length > 0) {
			await env.VECTORIZE.upsert(upserts);
			vectorizeUpdated = true;
		}
	} catch (err) {
		// Non-fatal — D1 is the source of truth for metadata; Vectorize will
		// catch up on the next ingest or can be refreshed manually.
		vectorizeError =
			err instanceof Error ? err.message : 'Vectorize update failed';
		console.warn('[patchMetadata] Vectorize upsert failed:', vectorizeError);
	}

	// ── 6. Respond ───────────────────────────────────────────────────────────
	return json({
		success:         true,
		documentId:      docId,
		chunksUpdated:   chunks.length,
		fieldsPatched:   Object.keys(updates),
		vectorizeUpdated,
		...(vectorizeError ? { vectorizeWarning: vectorizeError } : {}),
		updatedAt:       now,
	});
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...corsHeaders() },
	});
}
