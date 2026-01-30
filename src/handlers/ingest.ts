import { Env } from '../types/env';
import { Document } from '../types/document';
import { IngestionEngine } from '../engines/ingestion';
import { corsHeaders } from '../middleware/cors';

const ingestion = new IngestionEngine();

export async function handleIngest(request: Request, env: Env): Promise<Response> {
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
		
		const result = await ingestion.ingest(body, env);
		
		return new Response(
			JSON.stringify({ 
				success: true, 
				documentId: body.id, 
				chunksCreated: result.chunks, 
				performance: result.performance 
			}), 
			{ headers: { "Content-Type": "application/json", ...corsHeaders() } }
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