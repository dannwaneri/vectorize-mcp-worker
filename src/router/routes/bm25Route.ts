import { Env } from '../../types/env';
import { RouteResult } from '../types';
import { SearchResult } from '../../types/search';
import { KeywordSearchEngine } from '../../engines/keyword';

const keywordEngine = new KeywordSearchEngine();

/**
 * BM25 Route - Pure keyword search
 * 
 * Fastest route for exact phrase/keyword matching.
 * Skips vector embedding generation (~90ms saved).
 * Skips vector search (~650ms saved).
 * 
 * Target latency: <50ms
 * 
 * Use cases:
 * - Technical terms: "numpy.array", "React useEffect"
 * - Codes: "Error 404", "FPL GW17"
 * - Exact phrases: "quarterly earnings report"
 */
export async function bm25Route(
  query: string,
  context: { topK?: number },
  env: Env
): Promise<RouteResult> {
  
  const startTime = Date.now();
  const topK = context.topK || 5;
  
  if (!env.DB) {
    throw new Error('D1 database not available');
  }
  
  // Pure BM25 search (no vector component)
  const results = await keywordEngine.search(env.DB, query, topK);
  
  const bm25Time = Date.now() - startTime;
  
  return {
    results,
    performance: {
      bm25SearchTime: `${bm25Time}ms`,
      totalTime: `${bm25Time}ms`,
      embeddingTimeSkipped: '~90ms (not needed)',
      vectorSearchTimeSkipped: '~650ms (not needed)'
    },
    metadata: {
      route: 'BM25',
      intent: 'KEYWORD_EXACT',
      routeTime: `${bm25Time}ms`,
      reasoning: 'Pure keyword search for exact phrase matching. Skipped vector embedding and search for speed.'
    }
  };
}