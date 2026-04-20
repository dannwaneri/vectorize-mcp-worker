import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
		testTimeout: 15000, // 15 seconds
		poolOptions: {
			workers: {
				wrangler: {
					configPath: './wrangler.toml',
					envPath: './.dev.vars.test',
				},
				miniflare: {
					// Stub the multimodal service binding so tests run without the real worker
					workers: [
						{
							name: 'multimodal-pro-worker',
							modules: true,
							script: `export default { fetch: async () => new Response(JSON.stringify({ success: true, description: 'stub', vector: new Array(384).fill(0.1), metadata: { processingTime: '0ms', hasExtractedText: false } }), { headers: { 'Content-Type': 'application/json' } }) };`,
						},
					],
				},
			},
		},
	},
});