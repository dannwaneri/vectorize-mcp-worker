export interface SearchResult {
	id: string;
	content: string;
	score: number;
	category?: string;
	source: 'vector' | 'keyword' | 'hybrid';
	isImage?: boolean;
}

export interface HybridSearchResult extends SearchResult {
	vectorScore?: number;
	keywordScore?: number;
	rerankerScore?: number;
	rrfScore: number;
}