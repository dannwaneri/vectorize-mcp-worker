import { describe, it, expect, beforeEach, vi } from 'vitest';
import { rateLimiter, checkRateLimit } from '../src/middleware/rateLimit';

// Access the private store for test setup (reset between tests)
function clearStore() {
	(rateLimiter as any).store.clear();
}

function makeEnv(overrides: Record<string, string> = {}): any {
	return {
		AI: {} as any,
		VECTORIZE: {} as any,
		DB: {} as any,
		MCP_AGENT: {} as any,
		MULTIMODAL: {} as any,
		...overrides,
	};
}

function makeRequest(ip = '1.2.3.4', cfIp?: string): Request {
	const headers: Record<string, string> = {};
	if (cfIp !== undefined) {
		headers['CF-Connecting-IP'] = cfIp;
	} else {
		headers['X-Forwarded-For'] = ip;
	}
	return new Request('https://example.com/search', { headers });
}

describe('RateLimiter.check()', () => {
	beforeEach(() => {
		clearStore();
		vi.restoreAllMocks();
	});

	const LIMIT = 5;
	const WINDOW_MS = 10_000;

	it('first call is allowed and remaining equals limit - 1', () => {
		const result = rateLimiter.check('key-a', LIMIT, WINDOW_MS);
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(LIMIT - 1);
		expect(result.retryAfterSec).toBe(0);
	});

	it('subsequent calls decrement remaining', () => {
		rateLimiter.check('key-b', LIMIT, WINDOW_MS); // remaining = 4
		const r2 = rateLimiter.check('key-b', LIMIT, WINDOW_MS); // remaining = 3
		expect(r2.allowed).toBe(true);
		expect(r2.remaining).toBe(LIMIT - 2);
	});

	it('blocks once the limit is exceeded', () => {
		for (let i = 0; i < LIMIT; i++) {
			rateLimiter.check('key-c', LIMIT, WINDOW_MS);
		}
		const over = rateLimiter.check('key-c', LIMIT, WINDOW_MS);
		expect(over.allowed).toBe(false);
		expect(over.remaining).toBe(0);
		expect(over.retryAfterSec).toBeGreaterThan(0);
	});

	it('blocked call returns a positive retryAfterSec', () => {
		for (let i = 0; i < LIMIT; i++) rateLimiter.check('key-d', LIMIT, WINDOW_MS);
		const { retryAfterSec } = rateLimiter.check('key-d', LIMIT, WINDOW_MS);
		expect(retryAfterSec).toBeGreaterThan(0);
	});

	it('resets and allows again after the window has passed', () => {
		// Fill up to limit
		for (let i = 0; i < LIMIT; i++) rateLimiter.check('key-e', LIMIT, WINDOW_MS);
		// Advance time past the window
		const future = Date.now() + WINDOW_MS + 1;
		vi.spyOn(Date, 'now').mockReturnValue(future);

		const result = rateLimiter.check('key-e', LIMIT, WINDOW_MS);
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(LIMIT - 1);
	});

	it('different keys have independent counters', () => {
		for (let i = 0; i < LIMIT; i++) rateLimiter.check('key-x', LIMIT, WINDOW_MS);
		// key-y should be untouched
		const r = rateLimiter.check('key-y', LIMIT, WINDOW_MS);
		expect(r.allowed).toBe(true);
	});
});

describe('RateLimiter.prune()', () => {
	beforeEach(() => {
		clearStore();
		vi.restoreAllMocks();
	});

	const WINDOW_MS = 10_000;

	it('removes entries older than 2× window', () => {
		// Insert an entry at "now"
		rateLimiter.check('old-key', 10, WINDOW_MS);

		// Advance time by more than 2× window
		vi.spyOn(Date, 'now').mockReturnValue(Date.now() + WINDOW_MS * 3);
		rateLimiter.prune(WINDOW_MS);

		const store = (rateLimiter as any).store as Map<string, unknown>;
		expect(store.has('old-key')).toBe(false);
	});

	it('keeps entries still within 2× window', () => {
		rateLimiter.check('fresh-key', 10, WINDOW_MS);

		// Only advance by 1× window — entry should survive
		vi.spyOn(Date, 'now').mockReturnValue(Date.now() + WINDOW_MS * 0.5);
		rateLimiter.prune(WINDOW_MS);

		const store = (rateLimiter as any).store as Map<string, unknown>;
		expect(store.has('fresh-key')).toBe(true);
	});

	it('handles an empty store without throwing', () => {
		expect(() => rateLimiter.prune(WINDOW_MS)).not.toThrow();
	});
});

describe('checkRateLimit()', () => {
	beforeEach(() => {
		clearStore();
		vi.restoreAllMocks();
	});

	it('returns null when the limit has not been reached', () => {
		const env = makeEnv({ RATE_LIMIT_REQUESTS: '10', RATE_LIMIT_WINDOW_MS: '10000' });
		const req = makeRequest('2.2.2.2');
		const result = checkRateLimit(req, env, null);
		expect(result).toBeNull();
	});

	it('returns a 429 Response when the limit is exceeded', () => {
		const limit = 3;
		const env = makeEnv({ RATE_LIMIT_REQUESTS: String(limit), RATE_LIMIT_WINDOW_MS: '10000' });
		const req = makeRequest('3.3.3.3');

		for (let i = 0; i < limit; i++) checkRateLimit(req, env, null);
		const over = checkRateLimit(req, env, null);
		expect(over).not.toBeNull();
		expect(over!.status).toBe(429);
	});

	it('429 response body includes retryAfter and limit fields', async () => {
		const limit = 2;
		const env = makeEnv({ RATE_LIMIT_REQUESTS: String(limit), RATE_LIMIT_WINDOW_MS: '10000' });
		const req = makeRequest('4.4.4.4');

		for (let i = 0; i < limit; i++) checkRateLimit(req, env, null);
		const over = checkRateLimit(req, env, null);
		const body = await over!.json<{ error: string; retryAfter: number; limit: number }>();
		expect(body.error).toMatch(/rate limit/i);
		expect(body.retryAfter).toBeGreaterThan(0);
		expect(body.limit).toBe(limit);
	});

	it('uses t:{tenantId} as key when tenantId is provided', () => {
		const limit = 2;
		const env = makeEnv({ RATE_LIMIT_REQUESTS: String(limit), RATE_LIMIT_WINDOW_MS: '10000' });
		// Different IPs but same tenant — should share the counter
		const req1 = makeRequest('5.5.5.5');
		const req2 = makeRequest('6.6.6.6');

		checkRateLimit(req1, env, 'acme'); // count = 1 for t:acme
		checkRateLimit(req2, env, 'acme'); // count = 2 for t:acme (limit hit)
		const over = checkRateLimit(req1, env, 'acme'); // should be blocked
		expect(over).not.toBeNull();
		expect(over!.status).toBe(429);
	});

	it('uses ip:{ip} from CF-Connecting-IP when no tenantId', () => {
		const limit = 2;
		const env = makeEnv({ RATE_LIMIT_REQUESTS: String(limit), RATE_LIMIT_WINDOW_MS: '10000' });
		const req = makeRequest(undefined, '9.9.9.9'); // CF-Connecting-IP

		checkRateLimit(req, env, null);
		checkRateLimit(req, env, null);
		const over = checkRateLimit(req, env, null);
		expect(over).not.toBeNull();
		expect(over!.status).toBe(429);
	});

	it('different IPs get independent counters when no tenant', () => {
		const limit = 2;
		const env = makeEnv({ RATE_LIMIT_REQUESTS: String(limit), RATE_LIMIT_WINDOW_MS: '10000' });
		const req1 = makeRequest(undefined, '10.0.0.1');
		const req2 = makeRequest(undefined, '10.0.0.2');

		checkRateLimit(req1, env, null);
		checkRateLimit(req1, env, null);
		// req1 is now at limit, req2 should still be fine
		const r2 = checkRateLimit(req2, env, null);
		expect(r2).toBeNull();
	});

	it('uses default limit and window when env vars are absent', () => {
		const env = makeEnv(); // no RATE_LIMIT_REQUESTS or RATE_LIMIT_WINDOW_MS
		const req = makeRequest(undefined, '11.11.11.11');
		// Default is 10 requests per 10s — first call should be fine
		const result = checkRateLimit(req, env, null);
		expect(result).toBeNull();
	});
});
