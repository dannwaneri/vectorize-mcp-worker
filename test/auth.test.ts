import { describe, it, expect } from 'vitest';
import { authenticate } from '../src/middleware/auth';

// Minimal mock Env — only the fields authenticate() inspects
function makeEnv(overrides: { API_KEY?: string; TENANT_KEYS?: string } = {}): any {
	return {
		AI: {} as any,
		VECTORIZE: {} as any,
		DB: {} as any,
		MCP_AGENT: {} as any,
		MULTIMODAL: {} as any,
		...overrides,
	};
}

function makeRequest(path: string, authHeader?: string): Request {
	const headers: Record<string, string> = {};
	if (authHeader !== undefined) headers['Authorization'] = authHeader;
	return new Request(`https://example.com${path}`, { headers });
}

describe('authenticate middleware', () => {
	describe('public paths — always allowed', () => {
		const publicPaths = ['/', '/test', '/dashboard', '/llms.txt', '/mcp/tools'];
		const env = makeEnv({ API_KEY: 'secret-key' });

		for (const path of publicPaths) {
			it(`allows ${path} without any auth header`, () => {
				const result = authenticate(makeRequest(path), env);
				expect(result).toBeNull();
			});
		}
	});

	describe('dev mode (no API_KEY, no TENANT_KEYS)', () => {
		it('always returns null regardless of path', () => {
			const env = makeEnv(); // no keys at all
			const result = authenticate(makeRequest('/ingest'), env);
			expect(result).toBeNull();
		});

		it('returns null even without Authorization header', () => {
			const env = makeEnv();
			const result = authenticate(makeRequest('/search'), env);
			expect(result).toBeNull();
		});
	});

	describe('normal mode — API_KEY configured', () => {
		const env = makeEnv({ API_KEY: 'my-secret' });

		it('returns 401 when Authorization header is missing', () => {
			const result = authenticate(makeRequest('/ingest'), env);
			expect(result).not.toBeNull();
			expect(result!.status).toBe(401);
		});

		it('401 response body mentions missing Authorization', async () => {
			const result = authenticate(makeRequest('/ingest'), env);
			const body = await result!.json<{ error: string }>();
			expect(body.error).toMatch(/Missing Authorization/i);
		});

		it('returns 403 for an incorrect key', () => {
			const result = authenticate(makeRequest('/ingest', 'Bearer wrong-key'), env);
			expect(result).not.toBeNull();
			expect(result!.status).toBe(403);
		});

		it('403 response body says invalid API key', async () => {
			const result = authenticate(makeRequest('/ingest', 'Bearer wrong-key'), env);
			const body = await result!.json<{ error: string }>();
			expect(body.error).toMatch(/Invalid API key/i);
		});

		it('returns null for the correct API_KEY', () => {
			const result = authenticate(makeRequest('/ingest', 'Bearer my-secret'), env);
			expect(result).toBeNull();
		});

		it('is case-insensitive for the Bearer prefix', () => {
			const result = authenticate(makeRequest('/ingest', 'bearer my-secret'), env);
			expect(result).toBeNull();
		});
	});

	describe('normal mode — TENANT_KEYS configured', () => {
		const tenantKeys = { 'tenant-key-1': 'acme', 'tenant-key-2': 'contoso' };
		const env = makeEnv({ TENANT_KEYS: JSON.stringify(tenantKeys) });

		it('returns null for a valid tenant key', () => {
			const result = authenticate(makeRequest('/ingest', 'Bearer tenant-key-1'), env);
			expect(result).toBeNull();
		});

		it('returns null for a second valid tenant key', () => {
			const result = authenticate(makeRequest('/search', 'Bearer tenant-key-2'), env);
			expect(result).toBeNull();
		});

		it('returns 403 for an unknown key', () => {
			const result = authenticate(makeRequest('/ingest', 'Bearer random-bad-key'), env);
			expect(result).not.toBeNull();
			expect(result!.status).toBe(403);
		});

		it('returns 401 when no Authorization header supplied', () => {
			const result = authenticate(makeRequest('/ingest'), env);
			expect(result!.status).toBe(401);
		});
	});

	describe('both API_KEY and TENANT_KEYS configured', () => {
		const env = makeEnv({
			API_KEY: 'admin-key',
			TENANT_KEYS: JSON.stringify({ 'tenant-abc': 'org-a' }),
		});

		it('accepts the admin API_KEY', () => {
			expect(authenticate(makeRequest('/ingest', 'Bearer admin-key'), env)).toBeNull();
		});

		it('accepts a valid tenant key', () => {
			expect(authenticate(makeRequest('/ingest', 'Bearer tenant-abc'), env)).toBeNull();
		});

		it('rejects an unknown key with 403', () => {
			const result = authenticate(makeRequest('/ingest', 'Bearer unknown'), env);
			expect(result!.status).toBe(403);
		});
	});

	describe('malformed TENANT_KEYS', () => {
		const env = makeEnv({ API_KEY: 'admin', TENANT_KEYS: 'not-valid-json' });

		it('falls through to 403 when TENANT_KEYS is not valid JSON and key is wrong', () => {
			const result = authenticate(makeRequest('/ingest', 'Bearer bad-key'), env);
			expect(result!.status).toBe(403);
		});

		it('still accepts admin API_KEY even when TENANT_KEYS is malformed', () => {
			const result = authenticate(makeRequest('/ingest', 'Bearer admin'), env);
			expect(result).toBeNull();
		});
	});
});
