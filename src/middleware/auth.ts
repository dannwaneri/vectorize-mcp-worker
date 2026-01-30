import { Env } from '../types/env';

export function authenticate(request: Request, env: Env): Response | null {
	const url = new URL(request.url);
	
	// Skip auth for public endpoints
	if (url.pathname === "/" || url.pathname === "/test" || url.pathname === "/dashboard" || url.pathname === "/llms.txt" || url.pathname === "/mcp/tools") {
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