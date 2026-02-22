#!/usr/bin/env -S bun
/**
 * This script fetches the JSON schema from the Paperless API and saves it to a file named 'schema.json'.
 *
 * It uses the Bun runtime for making HTTP requests and handling file operations.
 * Ensure that the `PAPERLESS_URL` environment variable is set to the base URL
 * of your Paperless instance before running this script.
 */

import { $, env, fetch } from 'bun';
import openapiTS, { astToString } from 'openapi-typescript';

const REPO_ROOT = import.meta.dir; // (await $`git rev-parse --show-toplevel`.text()).trim();
const OUTPUT_OPENAPI = Bun.file(`${REPO_ROOT}/schemas/openapi.json`);
const OUTPUT_TS_TYPES = Bun.file(`${REPO_ROOT}/src/schema.ts`);

// `PAPERLESS_URL` should be set in the environment variables, e.g., `export PAPERLESS_URL=http://localhost:8000`
// or in .env file: `PAPERLESS_URL=http://localhost:8000`
const request = new Request(`${env.PAPERLESS_URL!}/api/schema/`, {
	method: 'GET',
	headers: { 'Accept': 'application/json' },
});

(async (): Promise<void> => {
	try {
		const req = (await fetch(request)).json();
		const schema = JSON.stringify(await req, null, '\t');
		const types = astToString(await openapiTS(schema));
		Promise.all([
			Bun.write(OUTPUT_OPENAPI, schema),
			Bun.write(OUTPUT_TS_TYPES, types),
		]);
		process.exitCode = 0;
		console.info(`Schema downloaded and saved as ${[OUTPUT_OPENAPI.name, OUTPUT_TS_TYPES.name].join(' and ')}.`);
	} catch (error) {
		process.exitCode = 1;
		console.error('Something went wrong:', error);
	} finally {
		await $`bun fmt ${OUTPUT_OPENAPI.name} ${OUTPUT_TS_TYPES.name}`.quiet();
	}
})();
