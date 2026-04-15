export interface QueryRecord {
	query: string;
	totalMs: number;
	embeddingMs: number;
	vectorMs: number;
	keywordMs: number;
	rerankerMs: number;
	cached: boolean;
	filterFields: string[];
	timestamp: number;
}

class AnalyticsStore {
	private records: QueryRecord[] = [];
	private readonly maxSize = 100;
	private cacheHits = 0;
	private cacheMisses = 0;

	record(entry: QueryRecord): void {
		this.records.push(entry);
		if (this.records.length > this.maxSize) {
			this.records.shift();
		}
		if (entry.cached) {
			this.cacheHits++;
		} else {
			this.cacheMisses++;
		}
	}

	getSummary() {
		const total = this.cacheHits + this.cacheMisses;
		const cacheHitRate = total > 0 ? Math.round((this.cacheHits / total) * 100) : 0;

		const avgLatencyMs =
			this.records.length > 0
				? Math.round(
						this.records.reduce((sum, r) => sum + r.totalMs, 0) / this.records.length,
					)
				: 0;

		const filterCounts: Record<string, number> = {};
		for (const r of this.records) {
			for (const f of r.filterFields) {
				filterCounts[f] = (filterCounts[f] || 0) + 1;
			}
		}
		const topFilters = Object.entries(filterCounts)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5)
			.map(([field, count]) => ({ field, count }));

		const recentQueries = this.records
			.slice(-10)
			.reverse()
			.map(r => ({
				query: r.query.length > 60 ? r.query.slice(0, 60) + '…' : r.query,
				totalMs: r.totalMs,
				embeddingMs: r.embeddingMs,
				vectorMs: r.vectorMs,
				keywordMs: r.keywordMs,
				rerankerMs: r.rerankerMs,
				cached: r.cached,
				filters: r.filterFields,
				timestamp: new Date(r.timestamp).toISOString(),
			}));

		return {
			totalQueries: total,
			cacheHits: this.cacheHits,
			cacheMisses: this.cacheMisses,
			cacheHitRate: `${cacheHitRate}%`,
			avgLatencyMs,
			recentQueries,
			topFilters,
		};
	}
}

// Module-level singleton — persists for the Worker isolate lifetime
export const analytics = new AnalyticsStore();
