import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/index';

// Proper type for Request with Cloudflare properties
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

// Define response types for better TypeScript support
interface ApiDocResponse {
	name: string;
	version: string;
	description: string;
	endpoints: Record<string, string>;
	authentication: string;
	docs: string;
}

interface HealthResponse {
	status: string;
	timestamp: string;
	bindings: {
		hasAI: boolean;
		hasVectorize: boolean;
		hasAPIKey: boolean;
	};
	mode: string;
}

interface StatsResponse {
	index: {
		dimensions: number;
		vectorCount: number;
		processedUpToDatetime: string;
	};
	knowledgeBaseSize: number;
	model: string;
	dimensions: number;
}

interface SearchResponse {
	query: string;
	topK: number;
	resultsCount: number;
	results: Array<{
		id: string;
		score: number;
		content: string;
		category: string;
	}>;
	performance: {
		embeddingTime: string;
		searchTime: string;
		totalTime: string;
	};
}

interface ErrorResponse {
	error: string;
	hint?: string;
	message?: string;
}

interface InsertResponse {
	success: boolean;
	id: string;
	performance: {
		embeddingTime: string;
		insertTime: string;
		totalTime: string;
	};
}

describe('Vectorize MCP Worker', () => {
	describe('Root endpoint', () => {
		it('responds with API documentation (unit style)', async () => {
			const request = new IncomingRequest('http://example.com');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env as Env);
			await waitOnExecutionContext(ctx);
			
			expect(response.status).toBe(200);
			const text = await response.text();
			const data = JSON.parse(text) as ApiDocResponse;
			expect(data.name).toBe('Vectorize MCP Worker');
			expect(data.version).toBe('1.0.0');
			expect(data.endpoints).toBeDefined();
		});

		it('responds with API documentation (integration style)', async () => {
			const response = await SELF.fetch('https://example.com');
			const text = await response.text();
			const data = JSON.parse(text) as ApiDocResponse;
			expect(data.name).toBe('Vectorize MCP Worker');
		});
	});

	describe('Test endpoint', () => {
		it('returns health status', async () => {
			const request = new IncomingRequest('http://example.com/test');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env as Env);
			await waitOnExecutionContext(ctx);
			
			expect(response.status).toBe(200);
			const text = await response.text();
			const data = JSON.parse(text) as HealthResponse;
			expect(data.status).toBe('healthy');
			expect(data.bindings).toBeDefined();
			expect(data.bindings.hasAI).toBe(true);
			expect(data.bindings.hasVectorize).toBe(true);
		});
	});

	describe('Stats endpoint', () => {
		it('returns index statistics', async () => {
			const request = new IncomingRequest('http://example.com/stats');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env as Env);
			await waitOnExecutionContext(ctx);
			
			expect(response.status).toBe(200);
			const text = await response.text();
			const data = JSON.parse(text) as StatsResponse;
			expect(data.index).toBeDefined();
			expect(data.model).toBe('@cf/baai/bge-small-en-v1.5');
			expect(data.dimensions).toBe(384);
		});
	});

	describe('Search endpoint', () => {
		it('returns validation error for missing query', async () => {
			const request = new IncomingRequest('http://example.com/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({}),
			});
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env as Env);
			await waitOnExecutionContext(ctx);
			
			expect(response.status).toBe(400);
			const text = await response.text();
			const data = JSON.parse(text) as ErrorResponse;
			expect(data.error).toBe("Missing 'query' field in request body");
		});

		it('performs semantic search successfully', async () => {
			const request = new IncomingRequest('http://example.com/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: 'test query', topK: 3 }),
			});
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env as Env);
			await waitOnExecutionContext(ctx);
			
			expect(response.status).toBe(200);
			const text = await response.text();
			const data = JSON.parse(text) as SearchResponse;
			expect(data.query).toBe('test query');
			expect(data.topK).toBe(3);
			expect(data.results).toBeDefined();
			expect(data.performance).toBeDefined();
		});

		it('validates topK range', async () => {
			const request = new IncomingRequest('http://example.com/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: 'test', topK: 25 }),
			});
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env as Env);
			await waitOnExecutionContext(ctx);
			
			expect(response.status).toBe(400);
			const text = await response.text();
			const data = JSON.parse(text) as ErrorResponse;
			expect(data.error).toBe('topK must be between 1 and 20');
		});
	});

	describe('Insert endpoint', () => {
		it('validates required id field', async () => {
			const request = new IncomingRequest('http://example.com/insert', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: 'test content' }),
			});
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env as Env);
			await waitOnExecutionContext(ctx);
			
			expect(response.status).toBe(400);
			const text = await response.text();
			const data = JSON.parse(text) as ErrorResponse;
			expect(data.error).toBe('Missing or invalid id');
		});

		it('validates required content field', async () => {
			const request = new IncomingRequest('http://example.com/insert', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: 'test-123' }),
			});
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env as Env);
			await waitOnExecutionContext(ctx);
			
			expect(response.status).toBe(400);
			const text = await response.text();
			const data = JSON.parse(text) as ErrorResponse;
			expect(data.error).toBe('Missing or invalid content');
		});

		it('inserts document successfully', async () => {
			const request = new IncomingRequest('http://example.com/insert', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: 'test-123',
					content: 'This is test content',
					metadata: { category: 'test' },
				}),
			});
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env as Env);
			await waitOnExecutionContext(ctx);
			
			expect(response.status).toBe(200);
			const text = await response.text();
			const data = JSON.parse(text) as InsertResponse;
			expect(data.success).toBe(true);
			expect(data.id).toBe('test-123');
			expect(data.performance).toBeDefined();
		});
	});

	describe('CORS', () => {
		it('handles OPTIONS preflight request', async () => {
			const request = new IncomingRequest('http://example.com', {
				method: 'OPTIONS',
			});
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env as Env);
			await waitOnExecutionContext(ctx);
			
			expect(response.status).toBe(200);
			expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
			expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
		});
	});

	describe('404 handling', () => {
		it('returns 404 for unknown routes', async () => {
			const request = new IncomingRequest('http://example.com/unknown');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env as Env);
			await waitOnExecutionContext(ctx);
			
			expect(response.status).toBe(404);
			const text = await response.text();
			const data = JSON.parse(text) as ErrorResponse;
			expect(data.error).toBe('Not found');
		});
	});
});