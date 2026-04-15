/**
 * Tenant resolution and filter-injection helpers.
 *
 * Two env vars control multi-tenancy:
 *   API_KEY     — existing admin key; bypasses all tenant restrictions
 *   TENANT_KEYS — JSON secret: { "apiKey1": "tenantA", "apiKey2": "tenantB" }
 *
 * Behaviour:
 *   - TENANT_KEYS not set → single-tenant / dev mode, no restrictions
 *   - Request carries admin API_KEY → tenantId = null (unrestricted)
 *   - Request carries a tenant key → tenantId is enforced everywhere
 */
import { Env } from '../types/env';
import { SearchFilters } from '../types/search';

// ── helpers ──────────────────────────────────────────────────────────────────

function extractToken(request: Request): string {
	return (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

/** Parse TENANT_KEYS env var. Returns {} on error. */
function parseTenantKeys(env: Env): Record<string, string> {
	if (!env.TENANT_KEYS) return {};
	try {
		return JSON.parse(env.TENANT_KEYS) as Record<string, string>;
	} catch {
		console.error('TENANT_KEYS is not valid JSON — multi-tenancy disabled');
		return {};
	}
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Resolve the tenant for an incoming HTTP request.
 * Returns a non-empty tenant ID string when tenant isolation must be enforced,
 * or `null` for admin / unrestricted access.
 */
export function resolveTenant(request: Request, env: Env): string | null {
	const tenantKeys = parseTenantKeys(env);
	if (Object.keys(tenantKeys).length === 0) return null; // multi-tenancy not configured

	const token = extractToken(request);
	if (!token) return null;

	// Admin key → no restriction
	if (env.API_KEY && token === env.API_KEY) return null;

	return tenantKeys[token] ?? null;
}

/**
 * Variant that works directly from an Authorization header string value
 * (used inside McpAgent where we only have the raw header, not a Request).
 */
export function resolveTenantFromToken(authHeader: string, env: Env): string | null {
	const tenantKeys = parseTenantKeys(env);
	if (Object.keys(tenantKeys).length === 0) return null;

	const token = authHeader.replace(/^Bearer\s+/i, '').trim();
	if (!token) return null;

	if (env.API_KEY && token === env.API_KEY) return null;

	return tenantKeys[token] ?? null;
}

/**
 * Merge a tenant_id equality filter into the given filters object.
 * When `tenantId` is non-null the result always has `{ tenant_id: { $eq: tenantId } }`,
 * overriding any caller-supplied value (tenants cannot escape their scope).
 */
export function injectTenantFilter(
	filters: SearchFilters | undefined,
	tenantId: string | null,
): SearchFilters | undefined {
	if (!tenantId) return filters; // admin path — no injection
	return {
		...(filters || {}),
		tenant_id: { $eq: tenantId }, // always override, cannot be spoofed
	};
}

/**
 * Convenience: determine whether multi-tenancy is active for this env.
 */
export function isMultiTenancyEnabled(env: Env): boolean {
	return !!env.TENANT_KEYS && Object.keys(parseTenantKeys(env)).length > 0;
}
