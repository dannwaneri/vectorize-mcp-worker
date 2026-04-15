import { Env } from '../types/env';
import { corsHeaders } from '../middleware/cors';
import { resolveEmbeddingModel, RERANKER_MODELS, DEFAULT_RERANKER, VISION_MODELS, DEFAULT_VISION, ROUTING_MODELS, DEFAULT_ROUTING } from '../config/models';
import { analytics } from '../analytics/store';

export async function handleStats(request: Request, env: Env): Promise<Response> {
	try {
		const stats = await env.VECTORIZE.describe();
		let docStats = null;

		if (env.DB) {
			docStats = await env.DB.prepare('SELECT total_documents, avg_doc_length FROM doc_stats WHERE id = 1').first();
		}

		const embModel = resolveEmbeddingModel(env.EMBEDDING_MODEL);

		return new Response(
			JSON.stringify({
				index: stats,
				documents: docStats,
				model: embModel.id,
				dimensions: embModel.dimensions,
				models: {
					embedding: embModel.id,
					embeddingKey: env.EMBEDDING_MODEL || 'bge-small',
					embeddingDimensions: embModel.dimensions,
					reranker: RERANKER_MODELS[DEFAULT_RERANKER].id,
					vision: VISION_MODELS[DEFAULT_VISION].id,
					routing: ROUTING_MODELS[DEFAULT_ROUTING].id,
				},
				analytics: analytics.getSummary(),
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
