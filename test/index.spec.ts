import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker, { type Env } from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

const mockEnv: Env = {
	AI: {
		run: async () => [0.01, 0.02],
	} as unknown as Env['AI'],
	VECTORIZE: {
		describe: async () => ({
			id: 'test-index',
			name: 'test-index',
			config: { dimensions: 384, metric: 'cosine' },
			vectorsCount: 0,
		}),
		query: async () => ({ matches: [], count: 0 }),
		insert: async () => ({ ids: [], count: 0 }),
		upsert: async () => ({ ids: [], count: 0 }),
		deleteByIds: async () => ({ ids: [], count: 0 }),
		getByIds: async () => [],
	} as Env['VECTORIZE'],
};

describe('Vectorize MCP Worker', () => {
	it('responds with API documentation JSON (unit style)', async () => {
		const request = new IncomingRequest('http://example.com');
		const response = await worker.fetch(request, mockEnv);

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('application/json');

		const data = await response.json() as { name: string; version: string };
		expect(data).toMatchObject({
			name: 'Vectorize MCP Worker',
			version: '1.0.0',
		});
	});

	it('responds with API documentation JSON (integration style)', async () => {
		const response = await SELF.fetch('https://example.com');
		const data = await response.json() as { name: string };

		expect(data.name).toBe('Vectorize MCP Worker');
	});
});
