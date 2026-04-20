import { VectorizeMcpAgent } from '../mcp/agent';

export interface Env {
	AI: Ai;
	VECTORIZE: VectorizeIndex;
	DB: D1Database;
	API_KEY?: string;
	MULTIMODAL: Fetcher;
	/** Durable Object namespace for the modern MCP Streamable HTTP server. */
	MCP_AGENT: DurableObjectNamespace<VectorizeMcpAgent>;
	/** Key into EMBEDDING_MODELS registry. Defaults to "bge-small" (384d).
	 *  Set in wrangler.toml [vars] only when using a 1024d Vectorize index. */
	EMBEDDING_MODEL?: string;
	/**
	 * JSON map of API key → tenant ID for multi-tenant isolation.
	 * Store as a wrangler secret:  wrangler secret put TENANT_KEYS
	 * Format: { "key_abc123": "acme_corp", "key_xyz789": "contoso" }
	 * Omit entirely for single-tenant / dev mode.
	 */
	TENANT_KEYS?: string;
	/**
	 * Max requests allowed per window per IP / tenant.
	 * Default: 10. Set via wrangler.toml [vars] or wrangler secret.
	 */
	RATE_LIMIT_REQUESTS?: string;
	/**
	 * Rate limit window length in milliseconds.
	 * Default: 10000 (10 seconds). Set via wrangler.toml [vars].
	 */
	RATE_LIMIT_WINDOW_MS?: string;
	/**
	 * LLM used for knowledge reflection synthesis and multi-document consolidation.
	 * Default: "kimi-k2.5" (Kimi K2.5 — best multi-document reasoning on Workers AI).
	 * Set to "llama-3.2-3b" for lower cost at the expense of synthesis quality.
	 */
	REFLECTION_MODEL?: string;
}