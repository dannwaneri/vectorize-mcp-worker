export interface Env {
	AI: Ai;
	VECTORIZE: VectorizeIndex;
	API_KEY?: string; // Optional: for production authentication
}

// Our knowledge base data
const knowledgeBase = [
	{
		id: "1",
		content: "FPL Hub handles 500,000+ API calls daily with 99.9% uptime using Cloudflare Workers",
		category: "product",
	},
	{
		id: "2",
		content: "Cloudflare Workers AI provides access to LLMs like Llama, Mistral, and embedding models at the edge",
		category: "ai",
	},
	{
		id: "3",
		content: "Vectorize supports vector dimensions up to 1536 and uses HNSW indexing for fast similarity search",
		category: "vectorize",
	},
	{
		id: "4",
		content: "MCP (Model Context Protocol) enables LLMs to securely access external data sources and tools",
		category: "mcp",
	},
	{
		id: "5",
		content: "TypeScript MCP SDK provides server and client implementations with full type safety",
		category: "mcp",
	},
	{
		id: "6",
		content: "D1 database queries return results in under 10ms within the same region using bound statements",
		category: "database",
	},
	{
		id: "7",
		content: "RAG systems typically use chunk sizes of 500-1000 tokens with 10-20% overlap for optimal retrieval",
		category: "ai",
	},
	{
		id: "8",
		content: "Workers AI embedding model 'bge-small-en-v1.5' produces 384-dimensional vectors optimized for English text",
		category: "ai",
	},
];

// Authentication middleware
function authenticate(request: Request, env: Env): Response | null {
	const url = new URL(request.url);
	
	// Skip auth for test endpoint and root
	if (url.pathname === "/" || url.pathname === "/test") {
		return null;
	}

	// If API_KEY is not set, allow all requests (development mode)
	if (!env.API_KEY) {
		return null;
	}

	// Check for Authorization header
	const authHeader = request.headers.get("Authorization");
	
	if (!authHeader) {
		return new Response(
			JSON.stringify({
				error: "Missing Authorization header",
				hint: "Include 'Authorization: Bearer YOUR_API_KEY' in your request",
			}),
			{
				status: 401,
				headers: { "Content-Type": "application/json" },
			}
		);
	}

	// Validate Bearer token format
	const token = authHeader.replace("Bearer ", "");
	
	if (token !== env.API_KEY) {
		return new Response(
			JSON.stringify({
				error: "Invalid API key",
			}),
			{
				status: 403,
				headers: { "Content-Type": "application/json" },
			}
		);
	}

	return null; // Authentication successful
}

// CORS headers helper
function corsHeaders() {
	return {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
	};
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// Handle CORS preflight
		if (request.method === "OPTIONS") {
			return new Response(null, {
				headers: corsHeaders(),
			});
		}

		// Authenticate request
		const authError = authenticate(request, env);
		if (authError) {
			return authError;
		}

		// Root endpoint - API documentation
		if (url.pathname === "/" && request.method === "GET") {
			return new Response(
				JSON.stringify({
					name: "Vectorize MCP Worker",
					version: "1.0.0",
					description: "High-performance semantic search on Cloudflare Edge",
					endpoints: {
						"POST /populate": "Populate the vector index with knowledge base",
						"POST /search": "Search the index (requires 'query' and optional 'topK' in body)",
						"POST /insert": "Insert a single document into the index",
						"GET /test": "Check service health and bindings",
						"GET /stats": "Get index statistics",
					},
					authentication: env.API_KEY ? "required" : "disabled (dev mode)",
					docs: "https://github.com/dannwaneri/vectorize-mcp-worker",
				}),
				{
					headers: { 
						"Content-Type": "application/json",
						...corsHeaders(),
					},
				}
			);
		}

		// Test endpoint to check bindings
		if (url.pathname === "/test" && request.method === "GET") {
			return new Response(
				JSON.stringify({
					status: "healthy",
					timestamp: new Date().toISOString(),
					bindings: {
						hasAI: !!env.AI,
						hasVectorize: !!env.VECTORIZE,
						hasAPIKey: !!env.API_KEY,
					},
					mode: env.API_KEY ? "production" : "development",
				}),
				{
					headers: { 
						"Content-Type": "application/json",
						...corsHeaders(),
					},
				}
			);
		}

		// Stats endpoint
		if (url.pathname === "/stats" && request.method === "GET") {
			try {
				// Get index info
				const stats = await env.VECTORIZE.describe();
				
				return new Response(
					JSON.stringify({
						index: stats,
						knowledgeBaseSize: knowledgeBase.length,
						model: "@cf/baai/bge-small-en-v1.5",
						dimensions: 384,
					}),
					{
						headers: { 
							"Content-Type": "application/json",
							...corsHeaders(),
						},
					}
				);
			} catch (error) {
				return new Response(
					JSON.stringify({
						error: "Failed to get stats",
						message: error instanceof Error ? error.message : "Unknown error",
					}),
					{
						status: 500,
						headers: { 
							"Content-Type": "application/json",
							...corsHeaders(),
						},
					}
				);
			}
		}

		// Route: Populate the index
		if (url.pathname === "/populate" && request.method === "POST") {
			return await populateIndex(env);
		}

		// Route: Search the index
		if (url.pathname === "/search" && request.method === "POST") {
			try {
				const body = await request.json<{ query: string; topK?: number; filter?: Record<string, any> }>();
				
				if (!body.query) {
					return new Response(
						JSON.stringify({
							error: "Missing 'query' field in request body",
						}),
						{
							status: 400,
							headers: { 
								"Content-Type": "application/json",
								...corsHeaders(),
							},
						}
					);
				}

				const { query, topK = 5, filter } = body;
				return await searchIndex(query, topK, env, filter);
			} catch (error) {
				return new Response(
					JSON.stringify({
						error: "Invalid JSON in request body",
					}),
					{
						status: 400,
						headers: { 
							"Content-Type": "application/json",
							...corsHeaders(),
						},
					}
				);
			}
		}

		// Route: Insert single document
		if (url.pathname === "/insert" && request.method === "POST") {
			return await insertDocument(request, env);
		}

		// 404 for unknown routes
		return new Response(
			JSON.stringify({
				error: "Not found",
				hint: "Visit GET / for API documentation",
			}),
			{
				status: 404,
				headers: { 
					"Content-Type": "application/json",
					...corsHeaders(),
				},
			}
		);
	},
};

async function insertDocument(request: Request, env: Env): Promise<Response> {
	const startTime = Date.now();

	try {
		const body = await request.json<{ id: string; content: string; metadata?: Record<string, any> }>();
		const { id, content, metadata = {} } = body;

		// Validation
		if (!id || typeof id !== 'string') {
			return new Response(
				JSON.stringify({
					error: 'Missing or invalid id',
					hint: 'Provide a unique string identifier'
				}),
				{
					status: 400,
					headers: { 
						"Content-Type": "application/json",
						...corsHeaders(),
					},
				}
			);
		}

		if (!content || typeof content !== 'string') {
			return new Response(
				JSON.stringify({
					error: 'Missing or invalid content',
					hint: 'Provide text content to embed'
				}),
				{
					status: 400,
					headers: { 
						"Content-Type": "application/json",
						...corsHeaders(),
					},
				}
			);
		}

		// Generate embedding
		const embeddingStart = Date.now();
		const response = await env.AI.run("@cf/baai/bge-small-en-v1.5", {
			text: content,
		});
		const embeddingTime = Date.now() - embeddingStart;

		// Handle the response type properly
		const embedding = Array.isArray(response) ? response : (response as any).data[0];

		// Insert into Vectorize
		const insertStart = Date.now();
		await env.VECTORIZE.upsert([
			{
				id: id,
				values: embedding,
				metadata: {
					content,
					...metadata,
					insertedAt: new Date().toISOString()
				},
			},
		]);
		const insertTime = Date.now() - insertStart;

		return new Response(
			JSON.stringify({
				success: true,
				id,
				performance: {
					embeddingTime: `${embeddingTime}ms`,
					insertTime: `${insertTime}ms`,
					totalTime: `${Date.now() - startTime}ms`
				}
			}),
			{
				headers: { 
					"Content-Type": "application/json",
					...corsHeaders(),
				},
			}
		);
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: 'Insert failed',
				message: error instanceof Error ? error.message : 'Unknown error',
				hint: 'Check your request format and try again'
			}),
			{
				status: 500,
				headers: { 
					"Content-Type": "application/json",
					...corsHeaders(),
				},
			}
		);
	}
}

async function populateIndex(env: Env): Promise<Response> {
	const startTime = Date.now();
	try {
		const vectors = [];

		// Generate embeddings for each entry
		for (const entry of knowledgeBase) {
			const response = await env.AI.run("@cf/baai/bge-small-en-v1.5", {
				text: entry.content,
			});

			// Handle the response type properly
			const embedding = Array.isArray(response) ? response : (response as any).data[0];

			vectors.push({
				id: entry.id,
				values: embedding,
				metadata: {
					content: entry.content,
					category: entry.category,
				},
			});
		}

		// Insert into Vectorize
		await env.VECTORIZE.insert(vectors);

		const duration = Date.now() - startTime;

		return new Response(
			JSON.stringify({
				success: true,
				message: `Inserted ${vectors.length} vectors into the index`,
				duration: `${duration}ms`,
				model: "@cf/baai/bge-small-en-v1.5",
			}),
			{
				headers: { 
					"Content-Type": "application/json",
					...corsHeaders(),
				},
			}
		);
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: error instanceof Error ? error.message : "Unknown error",
				hint: "Make sure Vectorize index is created and bound correctly",
			}),
			{
				status: 500,
				headers: { 
					"Content-Type": "application/json",
					...corsHeaders(),
				},
			}
		);
	}
}

async function searchIndex(query: string, topK: number, env: Env, filter?: Record<string, any>): Promise<Response> {
	const startTime = Date.now();
	
	try {
		// Validate topK
		if (topK < 1 || topK > 20) {
			return new Response(
				JSON.stringify({
					error: "topK must be between 1 and 20",
				}),
				{
					status: 400,
					headers: { 
						"Content-Type": "application/json",
						...corsHeaders(),
					},
				}
			);
		}

		// Generate embedding for the query (start timing here for accuracy)
		const embeddingStart = Date.now();
		const response = await env.AI.run("@cf/baai/bge-small-en-v1.5", {
			text: query,
		});
		const embeddingTime = Date.now() - embeddingStart;

		// Handle the response type properly
		const queryEmbedding = Array.isArray(response) ? response : (response as any).data[0];

		// Search Vectorize
		const searchStart = Date.now();
		const results = await env.VECTORIZE.query(queryEmbedding, {
			topK,
			returnMetadata: true,
			filter: filter || undefined,
		});
		const searchTime = Date.now() - searchStart;

		const totalTime = Date.now() - startTime;

		return new Response(
			JSON.stringify({
				query,
				topK,
				resultsCount: results.matches.length,
				results: results.matches.map((match) => ({
					id: match.id,
					score: match.score,
					content: match.metadata?.content,
					category: match.metadata?.category,
				})),
				performance: {
					embeddingTime: `${embeddingTime}ms`,
					searchTime: `${searchTime}ms`,
					totalTime: `${totalTime}ms`,
				},
			}),
			{
				headers: { 
					"Content-Type": "application/json",
					...corsHeaders(),
				},
			}
		);
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: error instanceof Error ? error.message : "Unknown error",
				hint: "Make sure the index is populated with /populate first",
			}),
			{
				status: 500,
				headers: { 
					"Content-Type": "application/json",
					...corsHeaders(),
				},
			}
		);
	}
}