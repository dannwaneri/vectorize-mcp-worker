import { Env } from '../types/env';
import { corsHeaders } from '../middleware/cors';

export async function handleLicenseValidate(request: Request, env: Env): Promise<Response> {
	try {
		const body = await request.json<{ license_key: string }>();
		
		if (!body.license_key) {
			return new Response(
				JSON.stringify({ valid: false, error: "Missing license_key" }), 
				{ status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
			);
		}
		
		const license = await env.DB.prepare(
			"SELECT * FROM licenses WHERE license_key = ? AND is_active = 1"
		).bind(body.license_key).first<{ 
			license_key: string; 
			email: string; 
			plan: string; 
			max_documents: number; 
			max_queries_per_day: number; 
			created_at: string 
		}>();
		
		if (!license) {
			return new Response(
				JSON.stringify({ valid: false, error: "Invalid or inactive license" }), 
				{ status: 403, headers: { "Content-Type": "application/json", ...corsHeaders() } }
			);
		}
		
		return new Response(
			JSON.stringify({ 
				valid: true, 
				plan: license.plan, 
				limits: { 
					maxDocuments: license.max_documents, 
					maxQueriesPerDay: license.max_queries_per_day 
				}, 
				createdAt: license.created_at 
			}), 
			{ headers: { "Content-Type": "application/json", ...corsHeaders() } }
		);
	} catch (error) {
		return new Response(
			JSON.stringify({ valid: false, error: "Validation failed" }), 
			{ status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
		);
	}
}

export async function handleLicenseCreate(request: Request, env: Env): Promise<Response> {
	try {
		const body = await request.json<{ 
			email: string; 
			plan?: string; 
			max_documents?: number; 
			max_queries_per_day?: number 
		}>();
		
		if (!body.email) {
			return new Response(
				JSON.stringify({ error: "Email required" }), 
				{ status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
			);
		}
		
		const licenseKey = `lic_${crypto.randomUUID().replace(/-/g, '')}`;
		const plan = body.plan || 'standard';
		const maxDocs = body.max_documents || (plan === 'enterprise' ? 100000 : plan === 'pro' ? 50000 : 10000);
		const maxQueries = body.max_queries_per_day || (plan === 'enterprise' ? 10000 : plan === 'pro' ? 5000 : 1000);
		
		await env.DB.prepare(
			"INSERT INTO licenses (license_key, email, plan, max_documents, max_queries_per_day) VALUES (?, ?, ?, ?, ?)"
		).bind(licenseKey, body.email, plan, maxDocs, maxQueries).run();
		
		return new Response(
			JSON.stringify({ 
				success: true, 
				license_key: licenseKey, 
				email: body.email, 
				plan, 
				limits: { 
					maxDocuments: maxDocs, 
					maxQueriesPerDay: maxQueries 
				} 
			}), 
			{ headers: { "Content-Type": "application/json", ...corsHeaders() } }
		);
	} catch (error) {
		return new Response(
			JSON.stringify({ 
				error: "Failed to create license", 
				message: error instanceof Error ? error.message : "Unknown" 
			}), 
			{ status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
		);
	}
}

export async function handleLicenseList(request: Request, env: Env): Promise<Response> {
	try {
		const licenses = await env.DB.prepare(
			"SELECT license_key, email, plan, max_documents, max_queries_per_day, created_at, is_active FROM licenses ORDER BY created_at DESC LIMIT 100"
		).all();
		
		return new Response(
			JSON.stringify({ licenses: licenses.results }), 
			{ headers: { "Content-Type": "application/json", ...corsHeaders() } }
		);
	} catch (error) {
		return new Response(
			JSON.stringify({ error: "Failed to list licenses" }), 
			{ status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
		);
	}
}

export async function handleLicenseRevoke(request: Request, env: Env): Promise<Response> {
	try {
		const body = await request.json<{ license_key: string }>();
		
		if (!body.license_key) {
			return new Response(
				JSON.stringify({ error: "license_key required" }), 
				{ status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
			);
		}
		
		await env.DB.prepare(
			"UPDATE licenses SET is_active = 0 WHERE license_key = ?"
		).bind(body.license_key).run();
		
		return new Response(
			JSON.stringify({ success: true, revoked: body.license_key }), 
			{ headers: { "Content-Type": "application/json", ...corsHeaders() } }
		);
	} catch (error) {
		return new Response(
			JSON.stringify({ error: "Failed to revoke license" }), 
			{ status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
		);
	}
}