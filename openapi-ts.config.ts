import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
	input: './schemas/subset.json',
	output: { path: './src/api/generated' },
	plugins: [{ name: 'zod', metadata: true }],
});
