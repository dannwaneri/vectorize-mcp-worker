/**
 * Centralised AI model registry.
 *
 * MIGRATION NOTE — embedding models
 * ----------------------------------
 * A Vectorize index has a fixed dimension count set at creation time.
 * Switching from a 384-dimension model (bge-small) to a 1024-dimension
 * model (bge-m3, qwen3-0.6b) requires:
 *   1. Create a new index:
 *      wrangler vectorize create mcp-knowledge-base-v2 --dimensions=1024 --metric=cosine
 *   2. Add metadata indexes to the new index (same 6 fields as before)
 *   3. Update wrangler.toml: index_name = "mcp-knowledge-base-v2"
 *   4. Set [vars] EMBEDDING_MODEL = "qwen3-0.6b"  (or "bge-m3")
 *   5. Re-ingest all documents
 * The default remains "bge-small" so existing deployments are unaffected.
 */

export const EMBEDDING_MODELS = {
	'bge-small': {
		id: '@cf/baai/bge-small-en-v1.5' as const,
		dimensions: 384,
		label: 'BGE Small EN v1.5 (384d)',
		note: 'Default. Fast, backward-compatible with existing 384-dimension Vectorize indexes.',
	},
	'bge-m3': {
		id: '@cf/baai/bge-m3' as const,
		dimensions: 1024,
		label: 'BGE-M3 (1024d)',
		note: 'Multilingual. Better cross-lingual retrieval. Requires a 1024-dimension Vectorize index.',
	},
	'qwen3-0.6b': {
		id: '@cf/qwen/qwen3-embedding-0.6b' as const,
		dimensions: 1024,
		label: 'Qwen3-0.6B (1024d) ★ Best 2026',
		note: 'Highest retrieval quality on standard benchmarks. Requires a 1024-dimension Vectorize index.',
	},
} as const;

export const RERANKER_MODELS = {
	'bge-reranker-base': {
		id: '@cf/baai/bge-reranker-base' as const,
		label: 'BGE Reranker Base',
	},
} as const;

export const VISION_MODELS = {
	'llama-4-scout': {
		id: '@cf/meta/llama-4-scout-17b-16e-instruct' as const,
		label: 'Llama 4 Scout 17B',
	},
} as const;

export const ROUTING_MODELS = {
	'llama-3.2-3b': {
		id: '@cf/meta/llama-3.2-3b-instruct' as const,
		label: 'Llama 3.2 3B Instruct',
	},
} as const;

export type EmbeddingModelKey = keyof typeof EMBEDDING_MODELS;
export type RerankerModelKey = keyof typeof RERANKER_MODELS;
export type VisionModelKey = keyof typeof VISION_MODELS;
export type RoutingModelKey = keyof typeof ROUTING_MODELS;

export const DEFAULT_EMBEDDING_MODEL: EmbeddingModelKey = 'bge-small';
export const DEFAULT_RERANKER: RerankerModelKey = 'bge-reranker-base';
export const DEFAULT_VISION: VisionModelKey = 'llama-4-scout';
export const DEFAULT_ROUTING: RoutingModelKey = 'llama-3.2-3b';

/**
 * Resolve the active embedding model from the EMBEDDING_MODEL env var.
 * Falls back to bge-small if the value is missing or unrecognised.
 */
export function resolveEmbeddingModel(key?: string | null) {
	return EMBEDDING_MODELS[key as EmbeddingModelKey] ?? EMBEDDING_MODELS[DEFAULT_EMBEDDING_MODEL];
}
