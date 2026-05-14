import { Env } from '../types/env';
import { corsHeaders } from '../middleware/cors';
import { REFLECTION_MODELS } from '../config/models';

const MODELS_TO_COMPARE = ['gemma-4', 'llama-3.2-3b'] as const;

const PROMPT_TEMPLATE = (query: string) =>
	`You are a knowledge synthesis assistant. Answer the following question concisely and specifically in 3–5 sentences. Use only what you know — do not hallucinate sources.\n\nQuestion: ${query}`;

async function runModel(
	modelKey: typeof MODELS_TO_COMPARE[number],
	query: string,
	env: Env,
): Promise<{ model: string; model_id: string; latency_ms: number; response_text: string; tokens_used: number | null }> {
	const config = REFLECTION_MODELS[modelKey];
	const start = Date.now();

	const resp = await env.AI.run(config.id as any, {
		messages: [{ role: 'user', content: PROMPT_TEMPLATE(query) }],
		max_tokens: 2048,
	});

	const latency_ms = Date.now() - start;
	const response_text: string =
		(resp as any)?.response ||
		(resp as any)?.result?.response ||
		(resp as any)?.choices?.[0]?.message?.content ||
		(resp as any)?.choices?.[0]?.message?.reasoning ||
		(resp as any)?.choices?.[0]?.text ||
		'';
	const tokens_used: number | null = (resp as any)?.usage?.total_tokens ?? null;

	return { model: modelKey, model_id: config.id, latency_ms, response_text, tokens_used };
}

async function logRun(
	result: Awaited<ReturnType<typeof runModel>>,
	query: string,
	env: Env,
): Promise<void> {
	if (!env.DB) return;
	await env.DB.prepare(
		`INSERT INTO benchmark_runs (query, model, model_id, latency_ms, tokens_used, response_text)
		 VALUES (?, ?, ?, ?, ?, ?)`,
	).bind(
		query,
		result.model,
		result.model_id,
		result.latency_ms,
		result.tokens_used,
		result.response_text,
	).run();
}

export async function handleBenchmark(request: Request, env: Env): Promise<Response> {
	let body: { query?: string };
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json', ...corsHeaders() },
		});
	}

	const query = body.query?.trim();
	if (!query) {
		return new Response(JSON.stringify({ error: '"query" field required' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json', ...corsHeaders() },
		});
	}

	const [gemma, kimi] = await Promise.allSettled([
		runModel('gemma-4', query, env),
		runModel('kimi-k2.5', query, env),
	]);

	const results: Record<string, any> = {};

	if (gemma.status === 'fulfilled') {
		results['gemma-4'] = gemma.value;
		await logRun(gemma.value, query, env).catch(() => {});
	} else {
		results['gemma-4'] = { error: String(gemma.reason) };
	}

	if (kimi.status === 'fulfilled') {
		results['kimi-k2.5'] = kimi.value;
		await logRun(kimi.value, query, env).catch(() => {});
	} else {
		results['kimi-k2.5'] = { error: String(kimi.reason) };
	}

	return new Response(
		JSON.stringify({ query, results }, null, 2),
		{ headers: { 'Content-Type': 'application/json', ...corsHeaders() } },
	);
}

export async function handleBenchmarkResults(request: Request, env: Env): Promise<Response> {
	if (!env.DB) {
		return new Response(JSON.stringify({ error: 'D1 not available' }), {
			status: 503,
			headers: { 'Content-Type': 'application/json', ...corsHeaders() },
		});
	}

	const rows = await env.DB.prepare(
		`SELECT * FROM benchmark_runs ORDER BY created_at DESC LIMIT 200`,
	).all();

	return new Response(
		JSON.stringify({ count: rows.results.length, runs: rows.results }, null, 2),
		{ headers: { 'Content-Type': 'application/json', ...corsHeaders() } },
	);
}
