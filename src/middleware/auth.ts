import { Env } from '../types/env';

// Public paths that never require authentication
const PUBLIC_PATHS = new Set(['/', '/test', '/dashboard', '/llms.txt', '/mcp/tools']);

export function authenticate(request: Request, env: Env): Response | null {
	const url = new URL(request.url);

	if (PUBLIC_PATHS.has(url.pathname)) return null;

	// Development mode: neither API_KEY nor TENANT_KEYS configured
	if (!env.API_KEY && !env.TENANT_KEYS) return null;

	const authHeader = request.headers.get('Authorization');
	if (!authHeader) {
		return new Response(
			JSON.stringify({
				error: 'Missing Authorization header',
				hint: "Include 'Authorization: Bearer YOUR_API_KEY' in your request",
			}),
			{ status: 401, headers: { 'Content-Type': 'application/json' } },
		);
	}

	const token = authHeader.replace(/^Bearer\s+/i, '').trim();

	// Accept admin API_KEY
	if (env.API_KEY && token === env.API_KEY) return null;

	// Accept any configured tenant key
	if (env.TENANT_KEYS) {
		try {
			const keys = JSON.parse(env.TENANT_KEYS) as Record<string, string>;
			if (keys[token]) return null;
		} catch {
			// TENANT_KEYS is malformed — fall through to 403
		}
	}

	return new Response(
		JSON.stringify({ error: 'Invalid API key' }),
		{ status: 403, headers: { 'Content-Type': 'application/json' } },
	);
}
