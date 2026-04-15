import { Env } from '../types/env';
import { IngestionEngine } from '../engines/ingestion';
import { HybridSearchEngine } from '../engines/hybrid';
import { corsHeaders } from '../middleware/cors';
import { resolveTenant, injectTenantFilter } from '../middleware/tenant';

const ingestion = new IngestionEngine();
const hybridSearch = new HybridSearchEngine();

export async function handleIngestImage(request: Request, env: Env): Promise<Response> {
	try {
		const formData = await request.formData();
		const id = formData.get('id') as string;
		const imageFile = formData.get('image') as File;
		const category = (formData.get('category') as string) || 'images';
		const title = (formData.get('title') as string) || undefined;
		const imageType = (formData.get('imageType') as string) || 'auto';

		if (!id || !imageFile) {
			return new Response(
				JSON.stringify({ error: 'Missing id or image' }),
				{ status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
			);
		}

		// Tenant isolation: inject tenant_id from auth context
		const tenantId = resolveTenant(request, env);

		const imageBuffer = await imageFile.arrayBuffer();
		const result = await ingestion.ingestImage({
			id,
			content: '',
			imageBuffer,
			category,
			title,
			imageType: imageType as any,
			...(tenantId ? { tenant_id: tenantId } : {}),
		}, env);

		return new Response(
			JSON.stringify({
				success: true,
				documentId: id,
				description: result.description,
				extractedText: result.extractedText,
				...(tenantId ? { tenant_id: tenantId } : {}),
				performance: result.performance,
			}),
			{ headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
		);
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: 'Image ingest failed',
				message: error instanceof Error ? error.message : 'Unknown',
			}),
			{ status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
		);
	}
}

export async function handleFindSimilarImages(request: Request, env: Env): Promise<Response> {
	try {
		const formData = await request.formData();
		const imageFile = formData.get('image') as File;
		const topK = parseInt((formData.get('topK') as string) || '5');

		if (!imageFile) {
			return new Response(
				JSON.stringify({ error: 'Missing image' }),
				{ status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
			);
		}

		const imageBuffer = await imageFile.arrayBuffer();

		const response = await env.MULTIMODAL.fetch('http://internal/describe-image', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				imageBuffer: Array.from(new Uint8Array(imageBuffer)),
				imageType: 'auto',
			}),
		});

		const result = await response.json<{ success: boolean; description: string; error?: string }>();

		if (!result.success) {
			throw new Error(result.error || 'Failed to process image');
		}

		// Tenant isolation: restrict results to the caller's tenant
		const tenantId = resolveTenant(request, env);
		const filters = injectTenantFilter(undefined, tenantId);

		const { results, performance } = await hybridSearch.search(
			result.description, env, topK, true, filters,
		);
		const imageResults = results.filter(r => r.isImage);

		return new Response(
			JSON.stringify({
				query: result.description,
				results: imageResults,
				performance,
			}),
			{ headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
		);
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: error instanceof Error ? error.message : 'Unknown error',
			}),
			{ status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
		);
	}
}
