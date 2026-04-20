import { Env } from '../types/env';
import { Document } from '../types/document';
import { IngestionEngine } from '../engines/ingestion';
import { corsHeaders } from '../middleware/cors';
import { resolveTenant } from '../middleware/tenant';
import { reflectionEngine } from '../engines/reflection';

const ingestion = new IngestionEngine();

const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 10;
const MAX_DOCUMENTS = 100;

interface DocResult {
	id: string;
	success: true;
	chunks: number;
	performance: Record<string, string>;
}

interface DocFailure {
	id: string;
	success: false;
	error: string;
}

type BatchDocResult = DocResult | DocFailure;

interface BatchRequestBody {
	documents: Document[];
	concurrency?: number;
}

export async function handleIngestBatch(
	request: Request,
	env: Env,
	ctx?: ExecutionContext,
): Promise<Response> {
	const batchStart = Date.now();

	try {
		const body = await request.json<BatchRequestBody>();

		// Validate documents field
		if (!body.documents || !Array.isArray(body.documents) || body.documents.length === 0) {
			return new Response(
				JSON.stringify({ error: 'documents must be a non-empty array' }),
				{ status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } },
			);
		}

		if (body.documents.length > MAX_DOCUMENTS) {
			return new Response(
				JSON.stringify({ error: `Too many documents: max ${MAX_DOCUMENTS}, got ${body.documents.length}` }),
				{ status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } },
			);
		}

		// Clamp concurrency
		const concurrency = Math.min(
			Math.max(1, body.concurrency ?? DEFAULT_CONCURRENCY),
			MAX_CONCURRENCY,
		);

		// Resolve tenant once for the whole batch
		const tenantId = resolveTenant(request, env);

		const documents = body.documents;
		const results: BatchDocResult[] = [];

		// Process in waves of `concurrency` using Promise.allSettled
		for (let i = 0; i < documents.length; i += concurrency) {
			const wave = documents.slice(i, i + concurrency);

			const waveResults = await Promise.allSettled(
				wave.map(async (doc) => {
					// Per-doc validation
					if (!doc.id || typeof doc.id !== 'string') {
						throw Object.assign(
							new Error('Missing or invalid id'),
							{ docId: doc.id ?? '(unknown)' },
						);
					}
					if (!doc.content || typeof doc.content !== 'string') {
						throw Object.assign(
							new Error('Missing or invalid content'),
							{ docId: doc.id },
						);
					}

					// Inject tenant_id — callers cannot override
					const processedDoc: Document = { ...doc };
					if (tenantId) processedDoc.tenant_id = tenantId;

					const result = await ingestion.ingest(processedDoc, env);
					return { id: doc.id, result, processedDoc };
				}),
			);

			for (let j = 0; j < wave.length; j++) {
				const doc = wave[j];
				const settled = waveResults[j];

				if (settled.status === 'fulfilled') {
					results.push({
						id: settled.value.id,
						success: true,
						chunks: settled.value.result.chunks,
						performance: settled.value.result.performance,
					});
				} else {
					const err = settled.reason;
					const docId: string =
						err?.docId ??
						(doc?.id && typeof doc.id === 'string' ? doc.id : '(unknown)');
					results.push({
						id: docId,
						success: false,
						error: err instanceof Error ? err.message : String(err),
					});
				}
			}
		}

		const succeeded = results.filter((r) => r.success).length;
		const failed = results.length - succeeded;
		const totalTime = Date.now() - batchStart;
		const avgTimePerDoc = results.length > 0 ? Math.round(totalTime / results.length) : 0;

		// Fire reflection for every succeeded doc in background
		const succeededDocs = documents.filter((doc) => {
			const match = results.find((r) => r.id === doc.id);
			return match?.success === true;
		});

		const runBackground = async () => {
			for (const doc of succeededDocs) {
				const processedDoc: Document = { ...doc };
				if (tenantId) processedDoc.tenant_id = tenantId;
				await reflectionEngine.reflect(processedDoc, env);
				await reflectionEngine.maybeConsolidate(processedDoc.tenant_id ?? null, env);
			}
		};

		if (ctx) {
			ctx.waitUntil(runBackground());
		} else {
			runBackground().catch(() => {/* swallowed */});
		}

		return new Response(
			JSON.stringify({
				success: true,
				total: documents.length,
				succeeded,
				failed,
				results,
				performance: {
					totalTime: `${totalTime}ms`,
					avgTimePerDoc: `${avgTimePerDoc}ms`,
				},
			}),
			{ headers: { 'Content-Type': 'application/json', ...corsHeaders() } },
		);
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: 'Batch ingest failed',
				message: error instanceof Error ? error.message : 'Unknown error',
			}),
			{ status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() } },
		);
	}
}
