import { Env } from '../../types/env';
import { RouteResult } from '../types';
import { HybridSearchEngine } from '../../engines/hybrid';

const hybridSearch = new HybridSearchEngine();

/**
 * Vector Route - Hybrid semantic search
 * 
 * Uses existing V3 hybrid search engine.
 * This is the "default" route for most queries.
 */
export async function vectorRoute(
  query: string,
  context: { topK?: number; rerank?: boolean },
  env: Env
): Promise<RouteResult> {
  
  const startTime = Date.now();
  const topK = context.topK || 5;
  const useReranker = context.rerank !== false;
  
  // Use existing hybrid search engine
  const { results, performance } = await hybridSearch.search(
    query,
    env,
    topK,
    useReranker
  );
  
  return {
    results,
    performance,
    metadata: {
      route: 'VECTOR',
      intent: 'SEMANTIC_SEARCH',
      routeTime: performance.totalTime,
      reasoning: 'Hybrid vector + BM25 search with reranking'
    }
  };
}