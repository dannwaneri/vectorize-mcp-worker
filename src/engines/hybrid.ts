import { SearchResult, HybridSearchResult } from '../types/search';
import { Env } from '../types/env';
import { KeywordSearchEngine } from './keyword';

export class HybridSearchEngine {
	private rrfK = 60;
	private keywordEngine = new KeywordSearchEngine();
	private cache = new Map<string, { results: HybridSearchResult[]; timestamp: number }>();
	private CACHE_TTL = 60000;

	reciprocalRankFusion(vectorResults: SearchResult[], keywordResults: SearchResult[]): HybridSearchResult[] {
		const scores = new Map<string, HybridSearchResult>();
		vectorResults.forEach((r, rank) => scores.set(r.id, { ...r, vectorScore: r.score, rrfScore: 1 / (this.rrfK + rank + 1), source: 'hybrid' }));
		keywordResults.forEach((r, rank) => {
			const existing = scores.get(r.id);
			if (existing) { existing.keywordScore = r.score; existing.rrfScore += 1 / (this.rrfK + rank + 1); }
			else scores.set(r.id, { ...r, keywordScore: r.score, rrfScore: 1 / (this.rrfK + rank + 1), source: 'hybrid' });
		});
		return Array.from(scores.values()).sort((a, b) => b.rrfScore - a.rrfScore);
	}
	
	async search(query: string, env: Env, topK: number, useReranker: boolean): Promise<{ results: HybridSearchResult[]; performance: Record<string, string> }> {
		const cacheKey = `${query}-${topK}-${useReranker}`;
		const cached = this.cache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
			console.log('Cache hit!');
			return { 
				results: cached.results, 
				performance: { totalTime: '0ms (cached)' } 
			};
		}
		
		const start = Date.now();
		const perf: Record<string, string> = {};

		// Vector search
		const embStart = Date.now();
		const embResp = await env.AI.run('@cf/baai/bge-small-en-v1.5', { text: query });
		const embedding = Array.isArray(embResp) ? embResp : (embResp as any).data[0];
		perf.embeddingTime = `${Date.now() - embStart}ms`;

		const vecStart = Date.now();
		const vecResults = await env.VECTORIZE.query(embedding, { topK: topK * 2, returnMetadata: true });
		perf.vectorSearchTime = `${Date.now() - vecStart}ms`;

		const vectorSearchResults: SearchResult[] = vecResults.matches.map(m => ({ id: m.id, content: (m.metadata?.content as string) || '', score: m.score, category: m.metadata?.category as string, source: 'vector' as const, isImage: m.metadata?.isImage as boolean || false }));

		// Keyword search (if D1 available)
		let keywordResults: SearchResult[] = [];
		if (env.DB) {
			const kwStart = Date.now();
			keywordResults = await this.keywordEngine.search(env.DB, query, topK * 2);
			perf.keywordSearchTime = `${Date.now() - kwStart}ms`;
		}

		// RRF
		let results = this.reciprocalRankFusion(vectorSearchResults, keywordResults);

		// Rerank
		if (useReranker && results.length > 0) {
			const reStart = Date.now();
			try {
				const reResp = await env.AI.run('@cf/baai/bge-reranker-base', { query, contexts: results.slice(0, 10).map(r => ({ text: r.content })) } as any);
				results = results.slice(0, 10).map((r, i) => ({ ...r, rerankerScore: (reResp as any)?.data?.[i]?.score || 0, rrfScore: r.rrfScore * 0.4 + ((reResp as any)?.data?.[i]?.score || 0) * 0.6 })).sort((a, b) => b.rrfScore - a.rrfScore);
			} catch (e) { console.error('Reranker error:', e); }
			perf.rerankerTime = `${Date.now() - reStart}ms`;
		}

		perf.totalTime = `${Date.now() - start}ms`;
		this.cache.set(cacheKey, { results, timestamp: Date.now() });
		return { results: results.slice(0, topK), performance: perf };
	}
}