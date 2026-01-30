import { Env } from '../types/env';
import { corsHeaders } from '../middleware/cors';

export async function handleStats(request: Request, env: Env): Promise<Response> {
	try {
		const stats = await env.VECTORIZE.describe();
		let docStats = null;
		
		if (env.DB) {
			docStats = await env.DB.prepare('SELECT total_documents, avg_doc_length FROM doc_stats WHERE id = 1').first();
		}
		
		return new Response(
			JSON.stringify({
				index: stats,
				documents: docStats,
				model: "@cf/baai/bge-small-en-v1.5",
				dimensions: 384,
			}),
			{
				headers: { 
					"Content-Type": "application/json",
					...corsHeaders(),
				},
			}
		);
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: "Failed to get stats",
				message: error instanceof Error ? error.message : "Unknown error",
			}),
			{
				status: 500,
				headers: { 
					"Content-Type": "application/json",
					...corsHeaders(),
				},
			}
		);
	}
}