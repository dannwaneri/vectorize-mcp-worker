export interface Env {
	AI: Ai;
	VECTORIZE: VectorizeIndex;
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

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);


// Test endpoint to check bindings
if (url.pathname === "/test") {
	return new Response(
		JSON.stringify({
			hasAI: !!env.AI,
			hasVectorize: !!env.VECTORIZE,
			aiType: typeof env.AI,
			vectorizeType: typeof env.VECTORIZE,
		}),
		{
			headers: { "Content-Type": "application/json" },
		}
	);
}


		// Route: Populate the index
		if (url.pathname === "/populate" && request.method === "POST") {
			return await populateIndex(env);
		}

		// Route: Search the index
		if (url.pathname === "/search" && request.method === "POST") {
			const { query, topK = 5 } = await request.json<{ query: string; topK?: number }>();
			return await searchIndex(query, topK, env);
		}

		return new Response("Vectorize MCP Worker\n\nEndpoints:\nPOST /populate - Populate index\nPOST /search - Search index", {
			headers: { "Content-Type": "text/plain" },
		});
	},
};

async function populateIndex(env: Env): Promise<Response> {
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

		return new Response(
			JSON.stringify({
				success: true,
				message: `Inserted ${vectors.length} vectors into the index`,
			}),
			{
				headers: { "Content-Type": "application/json" },
			}
		);
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: error instanceof Error ? error.message : "Unknown error",
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			}
		);
	}
}

async function searchIndex(query: string, topK: number, env: Env): Promise<Response> {
	try {
		// Generate embedding for the query
		const response = await env.AI.run("@cf/baai/bge-small-en-v1.5", {
			text: query,
		});

		// Handle the response type properly
		const queryEmbedding = Array.isArray(response) ? response : (response as any).data[0];

		// Search Vectorize
		const results = await env.VECTORIZE.query(queryEmbedding, {
			topK,
			returnMetadata: true,
		});

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
			}),
			{
				headers: { "Content-Type": "application/json" },
			}
		);
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: error instanceof Error ? error.message : "Unknown error",
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			}
		);
	}
}
