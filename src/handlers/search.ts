import { Env } from '../types/env';
import { HybridSearchEngine } from '../engines/hybrid';
import { corsHeaders } from '../middleware/cors';
import { IntentClassifier } from '../router/intentClassifier';
import { RouteSelector } from '../router/routeSelector';
import { SemanticHighlighter } from '../highlighting/semanticHighlight';
import { SearchFilters, validateFilters } from '../types/search';
import { resolveTenant, injectTenantFilter } from '../middleware/tenant';
import { analytics } from '../analytics/store';

// ── CF Cache API helpers ─────────────────────────────────────────────────────
const CF_CACHE_TTL = 60; // seconds

function buildCacheRequest(
	query: string,
	topK: number,
	filters: SearchFilters | undefined,
	tenantId: string | null,
	offset: number,
): Request {
	const params = new URLSearchParams({
		q: query,
		topK: String(topK),
		offset: String(offset),
	});
	if (filters) params.set('f', JSON.stringify(filters));
	if (tenantId) params.set('tenant', tenantId);
	// Synthetic GET URL — CF Cache API requires https and a GET request
	return new Request(`https://vectorize-search-cache.internal/v3?${params}`);
}

const hybridSearch = new HybridSearchEngine();

// Singleton highlighter to maintain cache between requests
let globalHighlighter: SemanticHighlighter | null = null;

function getHighlighter(env: Env): SemanticHighlighter {
  if (!globalHighlighter) {
    globalHighlighter = new SemanticHighlighter(env);
  }
  return globalHighlighter;
}


export async function handleSearch(
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
): Promise<Response> {
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
      filters?: unknown;
    }>();

    if (!body.query) {
      return new Response(
        JSON.stringify({ error: "Missing 'query' field" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    // Validate and clamp topK
    const topKRaw = typeof body.topK === 'number' ? body.topK : 5;
    const topK = Math.min(Math.max(1, topKRaw), 50);

    // Validate user-supplied filters
    const filterResult = validateFilters(body.filters);
    if (!filterResult.valid) {
      return new Response(
        JSON.stringify({ error: filterResult.error }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }
    const rawFilters = Object.keys(filterResult.filters).length > 0
      ? filterResult.filters
      : undefined;

    // Tenant isolation: inject tenant_id filter (overrides any caller-supplied value)
    const tenantId = resolveTenant(request, env);
    const filters: SearchFilters | undefined = injectTenantFilter(rawFilters, tenantId);

    // ── CF Cache check (V3 only; skip when rerank or highlight is on) ──────────
    const useRerank = body.rerank !== false;
    const cacheable = !useV4 && !useRerank && !(useHighlighting && body.highlight !== false);

    let cacheReq: Request | null = null;
    if (cacheable) {
      const offset = body.offset || 0;
      cacheReq = buildCacheRequest(body.query, topK, filters, tenantId, offset);
      const cfHit = await caches.default.match(cacheReq);
      if (cfHit) {
        // Record cache hit in analytics (totalMs = 0 for CF cache)
        analytics.record({
          query: body.query,
          totalMs: 0,
          embeddingMs: 0,
          vectorMs: 0,
          keywordMs: 0,
          rerankerMs: 0,
          cached: true,
          filterFields: filters ? Object.keys(filters) : [],
          timestamp: Date.now(),
        });
        const headers = new Headers(cfHit.headers);
        headers.set('X-Cache', 'HIT');
        return new Response(cfHit.body, { status: cfHit.status, headers });
      }
    }

    // V4 MODE: Use router
    if (useV4) {
      const router = new RouteSelector(env);
      const result = await router.route(
        body.query,
        {
          topK,
          hasImage: false,
          filters,
        },
        env
      );

      // Add semantic highlighting if requested
      if (useHighlighting && (body.highlight !== false)) {
        const highlightStart = Date.now();
        const highlighter = getHighlighter(env);
        const highlightedResults = await highlighter.highlightResults(body.query, result.results);
        const highlightTime = Date.now() - highlightStart;

        return new Response(
          JSON.stringify({
            version: 'v4',
            query: body.query,
            performance: {
              ...result.performance,
              highlightingTime: `${highlightTime}ms`
            },
            metadata: { ...result.metadata, ...(filters ? { filtersApplied: filters } : {}) },
            cost: result.cost,
            results: highlightedResults
          }),
          { headers: { "Content-Type": "application/json", ...corsHeaders() } }
        );
      }

      return new Response(
        JSON.stringify({
          version: 'v4',
          query: body.query,
          ...result,
          metadata: { ...result.metadata, ...(filters ? { filtersApplied: filters } : {}) },
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    // V3 MODE: Hybrid search with optional filters
    const offset = body.offset || 0;
    const totalToFetch = offset + topK;

    const { results, performance, cached } = await hybridSearch.search(
      body.query,
      env,
      totalToFetch,
      body.rerank !== false,
      filters,
    );

    // Record analytics (fire-and-forget; never throws)
    const parseMs = (v: string | undefined) => (v ? parseInt(v) || 0 : 0);
    analytics.record({
      query: body.query,
      totalMs: parseMs(performance.totalTime),
      embeddingMs: parseMs(performance.embeddingTime),
      vectorMs: parseMs(performance.vectorSearchTime),
      keywordMs: parseMs(performance.keywordSearchTime),
      rerankerMs: parseMs(performance.rerankerTime),
      cached,
      filterFields: filters ? Object.keys(filters) : [],
      timestamp: Date.now(),
    });

    const slicedResults = results.slice(offset, offset + topK);

    // Add highlighting to V3 results too
    if (useHighlighting && (body.highlight !== false)) {
      const highlightStart = Date.now();
      const highlighter = getHighlighter(env);
      const highlightedResults = await highlighter.highlightResults(body.query, slicedResults);
      const highlightTime = Date.now() - highlightStart;

      return new Response(
        JSON.stringify({
          version: 'v3',
          query: body.query,
          topK,
          offset,
          resultsCount: highlightedResults.length,
          ...(filters ? { filtersApplied: filters } : {}),
          results: highlightedResults,
          performance: {
            ...performance,
            highlightingTime: `${highlightTime}ms`
          }
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const v3Response = new Response(
      JSON.stringify({
        version: 'v3',
        query: body.query,
        topK,
        offset,
        resultsCount: slicedResults.length,
        ...(filters ? { filtersApplied: filters } : {}),
        results: slicedResults.map(r => ({
          id: r.id,
          score: r.rrfScore || r.score,
          content: r.content,
          category: r.category,
          metadata: (r as any).metadata,
          ...(r.doc_type ? { doc_type: r.doc_type } : {}),
          ...(r.doc_type === 'reflection' ? { label: 'Synthesized Insight', is_insight: true  } : {}),
          ...(r.doc_type === 'summary'    ? { label: 'Knowledge Summary',   is_insight: true  } : {}),
          ...(r.reflection_score !== undefined ? { reflection_score: r.reflection_score } : {}),
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

    // Store in CF Cache (background, non-blocking)
    if (cacheable && cacheReq) {
      const toCache = v3Response.clone();
      const cacheHeaders = new Headers(toCache.headers);
      cacheHeaders.set(
        'Cache-Control',
        `public, s-maxage=${CF_CACHE_TTL}, stale-while-revalidate=${CF_CACHE_TTL}`,
      );
      const responseForCache = new Response(toCache.body, {
        status: toCache.status,
        headers: cacheHeaders,
      });
      if (ctx) {
        ctx.waitUntil(caches.default.put(cacheReq, responseForCache));
      } else {
        caches.default.put(cacheReq, responseForCache).catch(() => {});
      }
    }

    return v3Response;

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
