import { Env } from '../types/env';
import { Document } from '../types/document';
import { IngestionEngine } from '../engines/ingestion';
import { corsHeaders } from '../middleware/cors';
import { resolveTenant } from '../middleware/tenant';
import { reflectionEngine } from '../engines/reflection';

const ingestion = new IngestionEngine();

export async function handleIngest(
	request: Request,
	env: Env,
	ctx?: ExecutionContext,
): Promise<Response> {
	try {
		const body = await request.json<Document>();

		if (!body.id || typeof body.id !== 'string') {
			return new Response(
				JSON.stringify({ error: "Missing or invalid id" }),
				{ status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
			);
		}

		if (!body.content || typeof body.content !== 'string') {
			return new Response(
				JSON.stringify({ error: "Missing or invalid content" }),
				{ status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
			);
		}

		// Tenant isolation: force-set tenant_id from auth context; callers cannot override it
		const tenantId = resolveTenant(request, env);
		if (tenantId) body.tenant_id = tenantId;

		const result = await ingestion.ingest(body, env);

		// Trigger reflection then consolidation in background.
		// ctx.waitUntil keeps the Worker alive for both ops without blocking response.
		const runBackground = async () => {
			await reflectionEngine.reflect(body, env);
			await reflectionEngine.maybeConsolidate(body.tenant_id || null, env);
		};
		if (ctx) {
			ctx.waitUntil(runBackground());
		} else {
			runBackground().catch(() => {/* swallowed */});
		}

		return new Response(
			JSON.stringify({
				success: true,
				documentId: body.id,
				chunks: result.chunks,
				chunksCreated: result.chunks, // keep old field for dashboard compat
				...(tenantId ? { tenant_id: tenantId } : {}),
				performance: result.performance,
			}),
			{ headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
		);
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: "Ingest failed",
				message: error instanceof Error ? error.message : "Unknown error"
			}),
			{ status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
		);
	}
}

export async function handleReflectBatch(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		if (!env.DB) {
			return new Response(JSON.stringify({ error: 'D1 not available' }), {
				status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
			});
		}

		const body = await request.json<{ limit?: number }>().catch(() => ({}));
		const cap = Math.min(Math.max(1, body.limit ?? 20), 100);
		const tenantId = resolveTenant(request, env);

		const stmt = tenantId
			? env.DB.prepare(
				`SELECT id, content, title, category, source, tenant_id FROM documents
				 WHERE doc_type = 'raw' AND chunk_index = 0 AND last_reflected_at IS NULL AND tenant_id = ?
				 ORDER BY RANDOM() LIMIT ?`,
			  ).bind(tenantId, cap)
			: env.DB.prepare(
				`SELECT id, content, title, category, source, tenant_id FROM documents
				 WHERE doc_type = 'raw' AND chunk_index = 0 AND last_reflected_at IS NULL AND tenant_id IS NULL
				 ORDER BY RANDOM() LIMIT ?`,
			  ).bind(cap);

		const rows = await stmt.all<{ id: string; content: string; title: string; category: string; source: string; tenant_id: string | null }>();
		const docs = rows.results ?? [];

		if (docs.length === 0) {
			return new Response(JSON.stringify({ reflected: 0, message: 'All documents already reflected' }), {
				headers: { 'Content-Type': 'application/json', ...corsHeaders() },
			});
		}

		let reflected = 0;
		let failed = 0;
		for (const doc of docs) {
			try {
				await reflectionEngine.reflect(doc as unknown as Document, env);
				reflected++;
			} catch {
				failed++;
			}
		}

		return new Response(
			JSON.stringify({ reflected, failed, sampled: docs.length }),
			{ headers: { 'Content-Type': 'application/json', ...corsHeaders() } },
		);
	} catch (error) {
		return new Response(
			JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
			{ status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() } },
		);
	}
}

