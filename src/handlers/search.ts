import { Env } from '../types/env';
import { HybridSearchEngine } from '../engines/hybrid';
import { corsHeaders } from '../middleware/cors';
import { IntentClassifier } from '../router/intentClassifier';
import { RouteSelector } from '../router/routeSelector';

const hybridSearch = new HybridSearchEngine();


export async function handleSearch(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const useV4 = url.searchParams.get('mode') === 'v4';
    
    const body = await request.json<{ 
      query: string; 
      topK?: number; 
      rerank?: boolean;
      offset?: number;
    }>();
    
    if (!body.query) {
      return new Response(
        JSON.stringify({ error: "Missing 'query' field" }), 
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }
    
    // V4 MODE: Use router
    if (useV4) {
      const router = new RouteSelector(env);
      const result = await router.route(
        body.query,
        {
          topK: body.topK || 5,
          hasImage: false
        },
        env
      );
      
      return new Response(
        JSON.stringify({
          version: 'v4',
          query: body.query,
          ...result
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }
    
    // V3 MODE: Existing hybrid search (unchanged)
    const topK = body.topK || 5;
    const offset = body.offset || 0;
    const totalToFetch = offset + topK;
    
    const { results, performance } = await hybridSearch.search(
      body.query,
      env,
      totalToFetch,
      body.rerank !== false
    );
    
    return new Response(
      JSON.stringify({
        version: 'v3',
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
        performance
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders() } }
    );
    
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Search failed" 
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
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