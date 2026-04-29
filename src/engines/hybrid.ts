import { SearchResult, HybridSearchResult, SearchFilters } from '../types/search';
import { Env } from '../types/env';
import { KeywordSearchEngine } from './keyword';
import { resolveEmbeddingModel } from '../config/models';

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

	// Build the filter object passed to Vectorize. `tags` is excluded because
	// Vectorize does not support string[] indexes — tag filtering is done
	// in-memory after the query returns (see postFilterByTags).
	private buildVectorizeFilter(filters: SearchFilters): VectorizeVectorMetadataFilter | null {
		const result: VectorizeVectorMetadataFilter = {};
		for (const [key, op] of Object.entries(filters)) {
			if (key !== 'tags') result[key] = op as VectorizeVectorMetadataFilter[string];
		}
		return Object.keys(result).length > 0 ? result : null;
	}

	// Post-filter vector matches by tags ($eq or $in) using metadata stored on
	// the match. Runs after the Vectorize query returns.
	private postFilterByTags(
		matches: VectorizeMatch[],
		tagOp: SearchFilters['tags'],
	): VectorizeMatch[] {
		if (!tagOp) return matches;
		if (tagOp.$in && tagOp.$in.length > 0) {
			const required = tagOp.$in;
			return matches.filter(m => {
				const t = m.metadata?.tags as string[] | undefined;
				return Array.isArray(t) && required.some(r => t.includes(r));
			});
		}
		if (tagOp.$eq !== undefined) {
			const required = String(tagOp.$eq);
			return matches.filter(m => {
				const t = m.metadata?.tags as string[] | undefined;
				return Array.isArray(t) && t.includes(required);
			});
		}
		return matches;
	}

	async search(
		query: string,
		env: Env,
		topK: number,
		useReranker: boolean,
		filters?: SearchFilters,
	): Promise<{ results: HybridSearchResult[]; performance: Record<string, string>; cached: boolean }> {
		const cacheKey = `${query}-${topK}-${useReranker}-${filters ? JSON.stringify(filters) : ''}`;
		const cached = this.cache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
			console.log('Cache hit!');
			return {
				results: cached.results,
				performance: { totalTime: '0ms (cached)' },
				cached: true,
			};
		}

		const start = Date.now();
		const perf: Record<string, string> = {};

		// Vector search
		const embStart = Date.now();
		const embModel = resolveEmbeddingModel(env.EMBEDDING_MODEL);
		const embResp = await env.AI.run(embModel.id as any, { text: query });
		const embedding = Array.isArray(embResp) ? embResp : (embResp as any).data[0];
		perf.embeddingTime = `${Date.now() - embStart}ms`;

		const vecStart = Date.now();
		// Vectorize hard-limits topK to 50 when returnMetadata='all' (2026).
		// We fetch min(topK * 2, 50) candidates for RRF fusion — doubling gives
		// the reranker more options, but we cannot exceed the API ceiling.
		const vecTopK = Math.min(topK * 2, 50);
		const vectorizeFilter = filters ? this.buildVectorizeFilter(filters) : null;
		const vecResults = await env.VECTORIZE.query(embedding, {
			topK: vecTopK,
			returnMetadata: 'all',
			...(vectorizeFilter ? { filter: vectorizeFilter } : {}),
		});
		perf.vectorSearchTime = `${Date.now() - vecStart}ms`;

		// Apply in-memory tag post-filtering (tags not indexed in Vectorize)
		const filteredMatches = filters?.tags
			? this.postFilterByTags(vecResults.matches, filters.tags)
			: vecResults.matches;

		const vectorSearchResults: SearchResult[] = filteredMatches.map(m => ({
			id: m.id,
			content: (m.metadata?.content as string) || '',
			score: m.score,
			category: m.metadata?.category as string,
			source: 'vector' as const,
			isImage: m.metadata?.isImage as boolean || false,
			doc_type: m.metadata?.doc_type as string | undefined,
			reflection_score: m.metadata?.reflection_score as number | undefined,
			metadata: m.metadata,
		}));

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

		// Boost reflections and summaries so they surface prominently when relevant.
		// Applied after all other scoring so it doesn't skew the reranker inputs.
		// Reflections: 1.5× — synthesised insights should clearly outrank raw chunks
		//              when they cover the same topic.
		// Summaries:   1.35× — broader consolidations get a smaller but meaningful lift.
		// Skipped when a doc_type filter is active — caller is already controlling type.
		const hasDocTypeFilter = filters?.doc_type !== undefined;
		if (!hasDocTypeFilter) {
			results = results.map(r => {
				if (r.doc_type === 'reflection') return { ...r, rrfScore: r.rrfScore * 1.5  };
				if (r.doc_type === 'summary')    return { ...r, rrfScore: r.rrfScore * 1.35 };
				return r;
			}).sort((a, b) => b.rrfScore - a.rrfScore);
		}

		perf.totalTime = `${Date.now() - start}ms`;
		this.cache.set(cacheKey, { results, timestamp: Date.now() });
		return { results: results.slice(0, topK), performance: perf, cached: false };
	}
}