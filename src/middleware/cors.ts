export function corsHeaders() {
	return {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
	};
}

export function handleCorsPrelight(): Response {
	return new Response(null, {
		headers: corsHeaders(),
	});
}