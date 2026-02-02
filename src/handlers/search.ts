import { Env } from '../types/env';
import { HybridSearchEngine } from '../engines/hybrid';
import { corsHeaders } from '../middleware/cors';
import { IntentClassifier } from '../router/intentClassifier';
import { RouteSelector } from '../router/routeSelector';
import { SemanticHighlighter } from '../highlighting/semanticHighlight';

const hybridSearch = new HybridSearchEngine();


export async function handleSearch(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const useV4 = url.searchParams.get('mode') === 'v4';
    const useHighlighting = url.searchParams.get('highlight') !== 'false';
    
    const body = await request.json<{ 
      query: string; 
      topK?: number; 
      rerank?: boolean;
      offset?: number;
      highlight?: boolean;
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
      
      
if (useHighlighting && (body.highlight !== false)) {
  const highlighter = new SemanticHighlighter(env);
  const highlightedResults = await highlighter.highlightResults(body.query, result.results);
  
  return new Response(
    JSON.stringify({
      version: 'v4',
      query: body.query,
      performance: result.performance,
      metadata: result.metadata,
      cost: result.cost,
      results: highlightedResults

    }),
    )}
      
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
    
    const slicedResults = results.slice(offset, offset + topK);
    
    // Add highlighting to V3 results too
    if (useHighlighting && (body.highlight !== false)) {
      const highlighter = new SemanticHighlighter(env);
      const highlightedResults = await highlighter.highlightResults(body.query, slicedResults);
      
      return new Response(
        JSON.stringify({
          version: 'v3',
          query: body.query,
          topK,
          offset,
          resultsCount: highlightedResults.length,
          results: highlightedResults,
          performance
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }
    
    return new Response(
      JSON.stringify({
        version: 'v3',
        query: body.query,
        topK,
        offset,
        resultsCount: slicedResults.length,
        results: slicedResults.map(r => ({
          id: r.id,
          score: r.rrfScore || r.score,
          content: r.content,
          category: r.category,
          scores: {
            vector: (r as any).vectorScore,
            keyword: (r as any).keywordScore,
            reranker: (r as any).rerankerScore
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