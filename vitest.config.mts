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
			},
		},
	},
});