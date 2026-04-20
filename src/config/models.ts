/**
 * Centralised AI model registry.
 *
 * MIGRATION NOTE — embedding models
 * ----------------------------------
 * A Vectorize index has a fixed dimension count set at creation time.
 * New deployments should use qwen3-0.6b (1024d) — best retrieval quality 2026.
 * Existing 384d deployments can keep bge-small via EMBEDDING_MODEL = "bge-small".
 *
 * To migrate an existing deployment to qwen3-0.6b:
 *   1. Create a new 1024d index:
 *      wrangler vectorize create mcp-knowledge-base-v2 --dimensions=1024 --metric=cosine
 *   2. Update wrangler.toml: index_name = "mcp-knowledge-base-v2"
 *   3. Set [vars] EMBEDDING_MODEL = "qwen3-0.6b"
 *   4. Re-ingest all documents
 *
 * REFLECTION MODEL — REFLECTION_MODEL env var
 * --------------------------------------------
 * Controls the LLM used for knowledge reflection synthesis and multi-document
 * consolidation. Defaults to Kimi K2.5 (excellent reasoning + tool-calling).
 * Set REFLECTION_MODEL = "llama-3.2-3b" to reduce cost at the expense of
 * synthesis quality.
 */

export const EMBEDDING_MODELS = {
	'bge-small': {
		id: '@cf/baai/bge-small-en-v1.5' as const,
		dimensions: 384,
		label: 'BGE Small EN v1.5 (384d)',
		note: 'Legacy default. Fast, compatible with existing 384d indexes. Set EMBEDDING_MODEL="bge-small" to keep.',
	},
	'bge-m3': {
		id: '@cf/baai/bge-m3' as const,
		dimensions: 1024,
		label: 'BGE-M3 (1024d)',
		note: 'Multilingual. Better cross-lingual retrieval. Requires a 1024d Vectorize index.',
	},
	'qwen3-0.6b': {
		id: '@cf/qwen/qwen3-embedding-0.6b' as const,
		dimensions: 1024,
		label: 'Qwen3-0.6B (1024d) ★ Recommended 2026',
		note: 'Highest retrieval quality on standard benchmarks. Default for new deployments. Requires a 1024d Vectorize index.',
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
		note: 'Best native multimodal model on Workers AI. Used for all vision + OCR tasks.',
	},
} as const;

export const ROUTING_MODELS = {
	'llama-3.2-3b': {
		id: '@cf/meta/llama-3.2-3b-instruct' as const,
		label: 'Llama 3.2 3B Instruct',
		note: 'Fast, lightweight. Used for V4 intent classification only.',
	},
} as const;

/**
 * Reflection models — used for knowledge synthesis and multi-document consolidation.
 * Kimi K2.5 is the default: superior multi-document reasoning and structured output.
 * Fall back to llama-3.2-3b for lower cost / higher throughput environments.
 */
export const REFLECTION_MODELS = {
	'kimi-k2.5': {
		id: '@cf/moonshot/kimi-k2.5' as const,
		label: 'Kimi K2.5',
		note: 'Default. Excellent multi-document reasoning and structured synthesis. Best reflection quality.',
	},
	'llama-3.2-3b': {
		id: '@cf/meta/llama-3.2-3b-instruct' as const,
		label: 'Llama 3.2 3B Instruct',
		note: 'Lower cost, higher throughput. Use when reflection quality is less critical.',
	},
} as const;

export type EmbeddingModelKey = keyof typeof EMBEDDING_MODELS;
export type RerankerModelKey = keyof typeof RERANKER_MODELS;
export type VisionModelKey = keyof typeof VISION_MODELS;
export type RoutingModelKey = keyof typeof ROUTING_MODELS;
export type ReflectionModelKey = keyof typeof REFLECTION_MODELS;

export const DEFAULT_EMBEDDING_MODEL: EmbeddingModelKey = 'qwen3-0.6b';
export const DEFAULT_RERANKER: RerankerModelKey = 'bge-reranker-base';
export const DEFAULT_VISION: VisionModelKey = 'llama-4-scout';
export const DEFAULT_ROUTING: RoutingModelKey = 'llama-3.2-3b';
export const DEFAULT_REFLECTION: ReflectionModelKey = 'kimi-k2.5';

/**
 * Resolve the active embedding model from the EMBEDDING_MODEL env var.
 * Falls back to qwen3-0.6b (recommended 2026) if unset or unrecognised.
 * Set EMBEDDING_MODEL="bge-small" to preserve an existing 384d deployment.
 */
export function resolveEmbeddingModel(key?: string | null) {
	return EMBEDDING_MODELS[key as EmbeddingModelKey] ?? EMBEDDING_MODELS[DEFAULT_EMBEDDING_MODEL];
}

/**
 * Resolve the active reflection model from the REFLECTION_MODEL env var.
 * Falls back to kimi-k2.5 (default) if unset or unrecognised.
 */
export function resolveReflectionModel(key?: string | null) {
	return REFLECTION_MODELS[key as ReflectionModelKey] ?? REFLECTION_MODELS[DEFAULT_REFLECTION];
}
