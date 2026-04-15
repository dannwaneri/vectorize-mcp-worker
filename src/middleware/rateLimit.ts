import { Env } from '../types/env';
import { corsHeaders } from './cors';

interface RateLimitEntry {
	count: number;
	windowStart: number;
}

const DEFAULT_LIMIT = 10;
const DEFAULT_WINDOW_MS = 10_000; // 10 seconds

class RateLimiter {
	private store = new Map<string, RateLimitEntry>();

	check(
		key: string,
		limit: number,
		windowMs: number,
	): { allowed: boolean; retryAfterSec: number; remaining: number } {
		const now = Date.now();
		const entry = this.store.get(key);

		if (!entry || now - entry.windowStart >= windowMs) {
			this.store.set(key, { count: 1, windowStart: now });
			return { allowed: true, retryAfterSec: 0, remaining: limit - 1 };
		}

		if (entry.count >= limit) {
			const retryAfterSec = Math.ceil((entry.windowStart + windowMs - now) / 1000);
			return { allowed: false, retryAfterSec, remaining: 0 };
		}

		entry.count++;
		return { allowed: true, retryAfterSec: 0, remaining: limit - entry.count };
	}

	/** Remove entries older than 2× the window to prevent unbounded Map growth. */
	prune(windowMs: number): void {
		const cutoff = Date.now() - windowMs * 2;
		for (const [key, entry] of this.store.entries()) {
			if (entry.windowStart < cutoff) this.store.delete(key);
		}
	}
}

// Module-level singleton — persists for the Worker isolate lifetime
export const rateLimiter = new RateLimiter();

let pruneCounter = 0;

/**
 * Check rate limit for the incoming request.
 * Returns a 429 Response if the limit is exceeded, null otherwise.
 *
 * Limit key: tenant ID (if multi-tenant auth) → CF-Connecting-IP → X-Forwarded-For → "unknown"
 *
 * Configurable via env vars:
 *   RATE_LIMIT_REQUESTS   — max requests per window (default: 10)
 *   RATE_LIMIT_WINDOW_MS  — window length in ms (default: 10000)
 */
export function checkRateLimit(
	request: Request,
	env: Env,
	tenantId: string | null,
): Response | null {
	const limit = env.RATE_LIMIT_REQUESTS
		? parseInt(env.RATE_LIMIT_REQUESTS) || DEFAULT_LIMIT
		: DEFAULT_LIMIT;
	const windowMs = env.RATE_LIMIT_WINDOW_MS
		? parseInt(env.RATE_LIMIT_WINDOW_MS) || DEFAULT_WINDOW_MS
		: DEFAULT_WINDOW_MS;

	// Prune stale entries every 100 requests to bound memory usage
	if (++pruneCounter % 100 === 0) {
		rateLimiter.prune(windowMs);
	}

	const ip =
		request.headers.get('CF-Connecting-IP') ||
		request.headers.get('X-Forwarded-For')?.split(',')[0].trim() ||
		'unknown';
	const key = tenantId ? `t:${tenantId}` : `ip:${ip}`;

	const { allowed, retryAfterSec, remaining } = rateLimiter.check(key, limit, windowMs);

	if (!allowed) {
		return new Response(
			JSON.stringify({
				error: 'Rate limit exceeded',
				retryAfter: retryAfterSec,
				limit,
				window: `${windowMs / 1000}s`,
			}),
			{
				status: 429,
				headers: {
					'Content-Type': 'application/json',
					'Retry-After': String(retryAfterSec),
					'X-RateLimit-Limit': String(limit),
					'X-RateLimit-Remaining': '0',
					'X-RateLimit-Window': `${windowMs / 1000}s`,
					...corsHeaders(),
				},
			},
		);
	}

	// Attach rate-limit headers to nothing yet — caller gets them via returned null.
	// Headers are added to the actual response in index.ts via addRateLimitHeaders().
	return null;
}

/** Attach informational rate-limit headers to an existing Response. */
export function addRateLimitHeaders(
	response: Response,
	env: Env,
	tenantId: string | null,
	request: Request,
): Response {
	const limit = env.RATE_LIMIT_REQUESTS
		? parseInt(env.RATE_LIMIT_REQUESTS) || DEFAULT_LIMIT
		: DEFAULT_LIMIT;
	const windowMs = env.RATE_LIMIT_WINDOW_MS
		? parseInt(env.RATE_LIMIT_WINDOW_MS) || DEFAULT_WINDOW_MS
		: DEFAULT_WINDOW_MS;

	const ip =
		request.headers.get('CF-Connecting-IP') ||
		request.headers.get('X-Forwarded-For')?.split(',')[0].trim() ||
		'unknown';
	const key = tenantId ? `t:${tenantId}` : `ip:${ip}`;

	// Peek at current count without incrementing
	const entry = (rateLimiter as any).store.get(key) as RateLimitEntry | undefined;
	const now = Date.now();
	const inWindow = entry && now - entry.windowStart < windowMs;
	const remaining = inWindow ? Math.max(0, limit - entry!.count) : limit;

	const headers = new Headers(response.headers);
	headers.set('X-RateLimit-Limit', String(limit));
	headers.set('X-RateLimit-Remaining', String(remaining));
	headers.set('X-RateLimit-Window', `${windowMs / 1000}s`);

	return new Response(response.body, { status: response.status, headers });
}
