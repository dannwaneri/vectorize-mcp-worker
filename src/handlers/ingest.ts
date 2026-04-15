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