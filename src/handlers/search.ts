import { Env } from '../types/env';
import { HybridSearchEngine } from '../engines/hybrid';
import { corsHeaders } from '../middleware/cors';
import { IntentClassifier } from '../router/intentClassifier';

const hybridSearch = new HybridSearchEngine();

export async function handleSearch(request: Request, env: Env): Promise<Response> {
	try {
		const body = await request.json<{ 
			query: string; 
			topK?: number; 
			rerank?: boolean;
			offset?: number;
		}>();
		
		if (!body.query) {
			return new Response(
				JSON.stringify({ error: "Missing 'query' field in request body" }), 
				{ status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
			);
		}
		
		const topK = body.topK || 5;
		const offset = body.offset || 0;
		
		if (topK < 1 || topK > 20) {
			return new Response(
				JSON.stringify({ error: "topK must be between 1 and 20" }), 
				{ status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
			);
		}
		
		const totalToFetch = offset + topK;
		const { results, performance } = await hybridSearch.search(body.query, env, totalToFetch, body.rerank !== false);
		
		return new Response(
			JSON.stringify({
				query: body.query,
				topK,
				offset,
				resultsCount: results.length,
				results: results.slice(offset, offset + topK).map(r => ({
					id: r.id, 
					score: r.rrfScore, 
					content: r.content, 
					category: r.category, 
					scores: { 
						vector: r.vectorScore, 
						keyword: r.keywordScore, 
						reranker: r.rerankerScore 
					} 
				})),
				performance,
			}),
			{ headers: { "Content-Type": "application/json", ...corsHeaders() } }
		);
	} catch {
		return new Response(
			JSON.stringify({ error: "Invalid JSON in request body" }), 
			{ status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
		);
	}
}


export async function handleClassifyIntent(request: Request, env: Env): Promise<Response> {
	try {
	  const body = await request.json<{ query: string; hasImage?: boolean }>();
	  
	  if (!body.query) {
		return new Response(
		  JSON.stringify({ error: "Missing query" }),
		  { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
		);
	  }
  
	  const classifier = new IntentClassifier(env);
	  const result = await classifier.classify(body.query, body.hasImage || false);
  
	  return new Response(
		JSON.stringify(result),
		{ headers: { "Content-Type": "application/json", ...corsHeaders() } }
	  );
	} catch (error) {
	  return new Response(
		JSON.stringify({ 
		  error: error instanceof Error ? error.message : "Classification failed" 
		}),
		{ status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
	  );
	}
  }