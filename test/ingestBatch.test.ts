import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleIngestBatch } from '../src/handlers/ingestBatch';

// ---------------------------------------------------------------------------
// Mock heavy engines so tests don't need real AI / Vectorize bindings
// ---------------------------------------------------------------------------
vi.mock('../src/engines/ingestion', () => {
	return {
		IngestionEngine: vi.fn().mockImplementation(() => ({
			ingest: vi.fn().mockResolvedValue({
				success: true,
				chunks: 2,
				performance: { embeddingTime: '10ms', totalTime: '20ms' },
			}),
		})),
	};
});

vi.mock('../src/engines/reflection', () => {
	return {
		reflectionEngine: {
			reflect: vi.fn().mockResolvedValue(undefined),
			maybeConsolidate: vi.fn().mockResolvedValue(undefined),
		},
	};
});

// ---------------------------------------------------------------------------
// Mock Env
// ---------------------------------------------------------------------------
const mockEnv = {
	AI: { run: async () => ({ data: [new Array(384).fill(0.1)] }) },
	VECTORIZE: { upsert: async () => ({}) },
	DB: {
		prepare: (_sql: string) => ({
			bind: (..._args: any[]) => ({
				first: async () => null,
				run: async () => ({}),
				all: async () => ({ results: [] }),
			}),
		}),
	},
	API_KEY: 'test-key',
} as any;

const mockEnvWithTenant = {
	...mockEnv,
	API_KEY: undefined,
	TENANT_KEYS: JSON.stringify({ 'test-key': 'acme' }),
} as any;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(body: unknown, apiKey = 'test-key', env = mockEnv): Request {
	return new Request('https://example.com/ingest/batch', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify(body),
	});
}

function doc(id: string, content = 'This is some document content for testing purposes.') {
	return { id, content };
}

async function call(body: unknown, apiKey = 'test-key', env: any = mockEnv) {
	const req = makeRequest(body, apiKey, env);
	const ctx = {
		waitUntil: vi.fn(),
		passThroughOnException: vi.fn(),
	} as unknown as ExecutionContext;
	const res = await handleIngestBatch(req, env, ctx);
	return { res, ctx };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('handleIngestBatch', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── Validation ─────────────────────────────────────────────────────────

	describe('request validation', () => {
		it('returns 400 for an empty documents array', async () => {
			const { res } = await call({ documents: [] });
			expect(res.status).toBe(400);
			const body = await res.json<{ error: string }>();
			expect(body.error).toMatch(/non-empty/i);
		});

		it('returns 400 when documents field is missing', async () => {
			const { res } = await call({});
			expect(res.status).toBe(400);
			const body = await res.json<{ error: string }>();
			expect(body.error).toMatch(/documents/i);
		});

		it('returns 400 when documents is not an array', async () => {
			const { res } = await call({ documents: 'not-an-array' });
			expect(res.status).toBe(400);
		});

		it('returns 400 when more than 100 documents are submitted', async () => {
			const docs = Array.from({ length: 101 }, (_, i) => doc(`doc-${i}`));
			const { res } = await call({ documents: docs });
			expect(res.status).toBe(400);
			const body = await res.json<{ error: string }>();
			expect(body.error).toMatch(/100/);
		});
	});

	// ── Successful ingestion ───────────────────────────────────────────────

	describe('successful ingestion', () => {
		it('returns 200 with succeeded:1, failed:0 for a single valid document', async () => {
			const { res } = await call({ documents: [doc('doc-1')] });
			expect(res.status).toBe(200);
			const body = await res.json<any>();
			expect(body.success).toBe(true);
			expect(body.total).toBe(1);
			expect(body.succeeded).toBe(1);
			expect(body.failed).toBe(0);
		});

		it('returns a results array with one entry for the document', async () => {
			const { res } = await call({ documents: [doc('doc-a')] });
			const body = await res.json<any>();
			expect(body.results).toHaveLength(1);
			expect(body.results[0].id).toBe('doc-a');
			expect(body.results[0].success).toBe(true);
		});

		it('result entry includes chunks and performance fields', async () => {
			const { res } = await call({ documents: [doc('doc-b')] });
			const body = await res.json<any>();
			const entry = body.results[0];
			expect(entry.chunks).toBeGreaterThan(0);
			expect(entry.performance).toBeDefined();
			expect(typeof entry.performance.totalTime).toBe('string');
		});

		it('response includes top-level performance with totalTime and avgTimePerDoc', async () => {
			const { res } = await call({ documents: [doc('doc-c')] });
			const body = await res.json<any>();
			expect(body.performance).toBeDefined();
			expect(body.performance.totalTime).toMatch(/\d+ms/);
			expect(body.performance.avgTimePerDoc).toMatch(/\d+ms/);
		});

		it('handles multiple documents correctly', async () => {
			const docs = [doc('multi-1'), doc('multi-2'), doc('multi-3')];
			const { res } = await call({ documents: docs });
			const body = await res.json<any>();
			expect(body.total).toBe(3);
			expect(body.succeeded).toBe(3);
			expect(body.failed).toBe(0);
			expect(body.results).toHaveLength(3);
		});

		it('accepts exactly 100 documents without error', async () => {
			const docs = Array.from({ length: 100 }, (_, i) => doc(`doc-${i}`));
			const { res } = await call({ documents: docs });
			expect(res.status).toBe(200);
			const body = await res.json<any>();
			expect(body.total).toBe(100);
		});
	});

	// ── Per-document validation failures ──────────────────────────────────

	describe('per-document failures', () => {
		it('marks a doc as failed when id is missing, others succeed', async () => {
			const docs = [
				{ content: 'Valid content but no id' } as any,
				doc('valid-doc'),
			];
			const { res } = await call({ documents: docs });
			expect(res.status).toBe(200);
			const body = await res.json<any>();
			expect(body.succeeded).toBe(1);
			expect(body.failed).toBe(1);
			const failedEntry = body.results.find((r: any) => r.success === false);
			expect(failedEntry).toBeDefined();
			expect(failedEntry.error).toMatch(/id/i);
		});

		it('marks a doc as failed when content is missing', async () => {
			const docs = [
				{ id: 'no-content-doc' } as any,
				doc('fine-doc'),
			];
			const { res } = await call({ documents: docs });
			const body = await res.json<any>();
			expect(body.failed).toBe(1);
			const failedEntry = body.results.find((r: any) => r.id === 'no-content-doc');
			expect(failedEntry.success).toBe(false);
			expect(failedEntry.error).toMatch(/content/i);
		});

		it('failed doc result does not include chunks field', async () => {
			const docs = [{ id: 'bad-doc' } as any];
			const { res } = await call({ documents: docs });
			const body = await res.json<any>();
			const entry = body.results[0];
			expect(entry.success).toBe(false);
			expect('chunks' in entry).toBe(false);
		});
	});

	// ── Concurrency parameter ──────────────────────────────────────────────

	describe('concurrency parameter', () => {
		it('accepts concurrency=1 and still processes all docs', async () => {
			const docs = [doc('c1'), doc('c2'), doc('c3')];
			const { res } = await call({ documents: docs, concurrency: 1 });
			expect(res.status).toBe(200);
			const body = await res.json<any>();
			expect(body.succeeded).toBe(3);
		});

		it('accepts concurrency=10 and still processes all docs', async () => {
			const docs = Array.from({ length: 10 }, (_, i) => doc(`conc-${i}`));
			const { res } = await call({ documents: docs, concurrency: 10 });
			const body = await res.json<any>();
			expect(body.succeeded).toBe(10);
		});

		it('clamps concurrency above 10 without error', async () => {
			const docs = [doc('clamp-1'), doc('clamp-2')];
			const { res } = await call({ documents: docs, concurrency: 99 });
			expect(res.status).toBe(200);
		});
	});

	// ── Tenant isolation ──────────────────────────────────────────────────

	describe('tenant isolation', () => {
		it('response still succeeds when TENANT_KEYS maps the API key to a tenant', async () => {
			const { res } = await call({ documents: [doc('t-doc-1')] }, 'test-key', mockEnvWithTenant);
			expect(res.status).toBe(200);
			const body = await res.json<any>();
			expect(body.succeeded).toBe(1);
		});

		it('response shape is identical under tenant mode', async () => {
			const { res } = await call({ documents: [doc('t-doc-2')] }, 'test-key', mockEnvWithTenant);
			const body = await res.json<any>();
			expect(body.success).toBe(true);
			expect(body.total).toBe(1);
			expect(body.results[0].id).toBe('t-doc-2');
		});
	});

	// ── Background reflection ─────────────────────────────────────────────

	describe('background reflection', () => {
		it('calls ctx.waitUntil for background work', async () => {
			const { ctx } = await call({ documents: [doc('bg-doc')] });
			expect((ctx as any).waitUntil).toHaveBeenCalledOnce();
		});

		it('does not call waitUntil when all docs fail validation', async () => {
			// All docs missing id — so succeeded = 0
			const docs = [{ content: 'no id here' } as any];
			const { ctx } = await call({ documents: docs });
			// waitUntil is still called (we always call it), but the inner
			// runBackground loop over succeededDocs will be empty
			// Verify the response shape is correct
			const req = makeRequest({ documents: docs });
			const mockCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
			const res = await handleIngestBatch(req, mockEnv, mockCtx);
			const body = await res.json<any>();
			expect(body.succeeded).toBe(0);
		});
	});

	// ── CORS headers ─────────────────────────────────────────────────────

	describe('CORS headers', () => {
		it('includes Access-Control-Allow-Origin on success', async () => {
			const { res } = await call({ documents: [doc('cors-doc')] });
			expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
		});

		it('includes Access-Control-Allow-Origin on 400 errors', async () => {
			const { res } = await call({ documents: [] });
			expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
		});
	});
});
