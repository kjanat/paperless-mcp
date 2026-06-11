import type { IncomingMessage, ServerResponse } from 'node:http';

import { arg, cli, command, flag, ParseError } from '@kjanat/dreamcli';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { JSONRPCErrorResponse } from '@modelcontextprotocol/sdk/types.js';

import { PaperlessAPI } from '#api/paperless';
import pkg from '#pkg';
import { registerCorrespondentTools } from '#tools/correspondents';
import { registerCustomFieldTools } from '#tools/customFields';
import { registerDocumentTools } from '#tools/documents';
import { registerDocumentTypeTools } from '#tools/documentTypes';
import { registerStoragePathTools } from '#tools/storagePaths';
import { registerTagTools } from '#tools/tags';
import { registerTaskTools } from '#tools/tasks';
import { registerTrashTools } from '#tools/trash';

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = '127.0.0.1';
const CLI_NAME = Object.keys(pkg.bin)[0]!;
const REPOSITORY_URL = `https://github.com/${pkg.repository}`;
const SERVER_NAME = 'paperless-ngx';
/** Grace period to let in-flight HTTP requests drain before force-closing sockets. */
const SHUTDOWN_GRACE_MS = 10_000;

/** Express request with parsed body attached by express.json() middleware. */
interface ParsedRequest extends IncomingMessage {
	body?: unknown;
}

/** Build a JSON-RPC 2.0 error response envelope with the given code and message. */
function jsonRpcError(code: number, message: string): JSONRPCErrorResponse {
	return { jsonrpc: '2.0', error: { code, message } };
}

/** Write a JSON-RPC error to the HTTP response with the matching status code. */
function sendJsonRpcError(
	res: ServerResponse,
	httpStatus: number,
	rpcCode: number,
	message: string,
	headers: Record<string, string> = {},
): void {
	res.writeHead(httpStatus, { 'Content-Type': 'application/json', ...headers });
	res.end(JSON.stringify(jsonRpcError(rpcCode, message)));
}

/** Extract the token from an `Authorization: Bearer <token>` header, if any. */
function bearerToken(req: ParsedRequest): string | undefined {
	const header = req.headers.authorization;
	if (header == null) return undefined;
	const match = /^Bearer\s+(\S+)$/i.exec(header);
	return match?.[1];
}

/** HTTP transport port flag: coerces and validates an integer in 1-65535. */
const portFlag = flag
	.custom((raw: unknown): number => {
		const port = Number(raw);

		if (!Number.isInteger(port) || port < 1 || port > 65535) {
			throw new ParseError(`Invalid --port value "${String(raw)}".`, {
				code: 'INVALID_VALUE',
				suggest: 'Expected an integer between 1 and 65535.',
				details: { flag: 'port', value: raw },
			});
		}

		return port;
	})
	.default(DEFAULT_PORT)
	.describe('Port for the HTTP transport (1-65535).');

/**
 * Host/interface the HTTP transport binds to. Defaults to loopback
 * (`127.0.0.1`), which the MCP SDK auto-protects against DNS rebinding. Bind a
 * wider interface (e.g. `0.0.0.0`) only with `--allowed-hosts` set.
 */
const hostFlag = flag
	.string()
	.env('PAPERLESS_MCP_HOST')
	.default(DEFAULT_HOST)
	.describe('Host the HTTP transport binds to (default loopback).');

/**
 * Comma-separated hostnames allowed in the Host header, enabling DNS-rebinding
 * protection when binding to a non-localhost interface such as 0.0.0.0.
 */
const allowedHostsFlag = flag
	.string()
	.env('PAPERLESS_MCP_ALLOWED_HOSTS')
	.describe('Comma-separated Host header allowlist for DNS-rebinding protection.');

/**
 * Per-request token mode for the HTTP transport: every request must carry its
 * own `Authorization: Bearer <paperless-api-token>` header, which is forwarded
 * to Paperless as that user's token. One hosted MCP server can then serve
 * multiple users while Paperless permissions stay per-user. No fallback to a
 * shared token: requests without a Bearer header get a 401.
 */
const perRequestTokenFlag = flag
	.boolean()
	.env('PAPERLESS_MCP_PER_REQUEST_TOKEN')
	.describe(
		"HTTP only: forward each request's Authorization: Bearer token to Paperless instead of one shared server token.",
	);

/**
 * Whether per-request token mode is being requested, detectable before the CLI
 * parses. Used to relax the otherwise-required token argument: in this mode
 * the server itself holds no Paperless credentials.
 */
function isPerRequestTokenMode(): boolean {
	// Mirror dreamcli's own truthiness rules so this pre-parse sniff cannot
	// disagree with the parsed flag (the action re-validates either way).
	const env = process.env['PAPERLESS_MCP_PER_REQUEST_TOKEN']?.toLowerCase();
	if (env != null && ['true', '1', 'yes'].includes(env)) return true;

	const cliFlag = process.argv.find(
		(a) => a === '--per-request-token' || a.startsWith('--per-request-token='),
	);
	if (cliFlag == null) return false;
	const value = cliFlag.split('=')[1]?.toLowerCase();
	return value == null || !['false', '0', 'no'].includes(value);
}

/** Paperless-ngx base URL: validates the input and strips any trailing slash. */
const baseUrlArg = arg
	.custom((raw: string): string => {
		let url: URL;

		try {
			url = new URL(raw);
		} catch {
			throw new ParseError(`Invalid Paperless-ngx base URL "${raw}".`, {
				code: 'INVALID_VALUE',
				suggest: 'Provide an absolute http(s) URL, e.g. http://localhost:8000.',
				details: { arg: 'baseUrl', value: raw },
			});
		}

		if (!/^https?:$/.test(url.protocol)) {
			throw new ParseError(`Unsupported scheme "${url.protocol}" in Paperless-ngx base URL.`, {
				code: 'INVALID_VALUE',
				suggest: 'Use an http:// or https:// URL, e.g. http://localhost:8000.',
				details: { arg: 'baseUrl', value: raw, protocol: url.protocol },
			});
		}

		return url.href.replace(/\/+$/, '');
	})
	.env('PAPERLESS_URL')
	.describe('Paperless-ngx base URL, e.g. http://localhost:8000');

/**
 * Paperless-ngx API token argument. Resolution order: `--token` →
 * `$PAPERLESS_API_KEY` → legacy `$API_KEY` (deprecated). The legacy variable is
 * wired in as the default so it participates in dreamcli's own resolution chain
 * (CLI → env → default) rather than being patched onto `process.env`. It is only
 * applied when set, so a wholly missing token still raises the required-arg error.
 */
function tokenArg() {
	const token = arg
		.string()
		.env('PAPERLESS_API_KEY')
		.describe('Paperless-ngx API token (or set $PAPERLESS_API_KEY / legacy $API_KEY)');

	// In per-request token mode the server needs no credential of its own: an
	// empty-string default makes the arg optional (re-validated in the action).
	// Legacy $API_KEY keeps precedence so a sniff misfire cannot break it.
	const legacyApiKey = process.env['API_KEY'];
	const fallback = legacyApiKey ?? (isPerRequestTokenMode() ? '' : undefined);
	return fallback == null ? token : token.default(fallback);
}

/** Build a fresh MCP server with every Paperless-ngx tool group registered. */
function createServer(api: PaperlessAPI, options: { allowFilePath: boolean }): McpServer {
	const server = new McpServer({ name: SERVER_NAME, version: pkg.version });

	registerDocumentTools(server, api, options);
	registerTagTools(server, api);
	registerCorrespondentTools(server, api);
	registerDocumentTypeTools(server, api);
	registerStoragePathTools(server, api);
	registerCustomFieldTools(server, api);
	registerTaskTools(server, api);
	registerTrashTools(server, api);

	return server;
}

/** Handle one POST /mcp request with a fresh per-request server and transport. */
async function handleMcpHttpRequest(
	req: ParsedRequest,
	res: ServerResponse,
	api: PaperlessAPI,
): Promise<void> {
	const transport = new StreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
	});

	res.on('close', () => {
		void transport.close();
	});

	try {
		// HTTP: file_path is disabled; paths would resolve on the server host.
		const server = createServer(api, { allowFilePath: false });
		await server.connect(transport);
		await transport.handleRequest(req, res, req.body);
	} catch (error: unknown) {
		console.error('Error handling MCP request:', error);

		if (!res.headersSent) {
			sendJsonRpcError(res, 500, -32603, 'Internal server error');
		}
	}
}

/** Split a comma-separated allowlist into trimmed, non-empty hostnames. */
function parseAllowedHosts(raw: string | undefined): string[] {
	return (raw ?? '')
		.split(',')
		.map((host) => host.trim())
		.filter((host) => host.length > 0);
}

/**
 * Block until the process receives SIGINT/SIGTERM, then run `cleanup`.
 *
 * dreamcli's run() exits the process once the action resolves, so awaiting
 * this keeps the long-lived server up until a termination signal arrives and
 * lets it shut down gracefully before the process exits.
 */
async function runUntilShutdown(cleanup: () => Promise<void> | void): Promise<void> {
	await new Promise<void>((resolve) => {
		const stop = (): void => resolve();
		process.once('SIGINT', stop);
		process.once('SIGTERM', stop);
	});

	await cleanup();
}

const serve = command(CLI_NAME)
	.description('MCP server for the Paperless-ngx document management system.')
	.arg('baseUrl', baseUrlArg)
	.arg('token', tokenArg())
	.flag(
		'http',
		flag
			.boolean()
			.describe('Serve over Streamable HTTP instead of stdio (the default).'),
	)
	.flag('port', portFlag)
	.flag('host', hostFlag)
	.flag('allowed-hosts', allowedHostsFlag)
	.flag('per-request-token', perRequestTokenFlag)
	.example('paperless-mcp http://localhost:8000 your-api-token', 'Serve over stdio')
	.example('paperless-mcp --http --port 8080', 'Serve over HTTP using env credentials')
	.example(
		'paperless-mcp http://localhost:8000 --http --per-request-token',
		'Multi-user HTTP: clients send Authorization: Bearer <their-paperless-token>',
	)
	.action(async ({ args, flags, out }) => {
		const perRequestToken = flags['per-request-token'] === true;

		if (perRequestToken && !flags.http) {
			throw new ParseError('--per-request-token requires --http.', {
				code: 'INVALID_VALUE',
				suggest: 'Per-request Bearer tokens only exist on the HTTP transport; add --http.',
				details: { flag: 'per-request-token' },
			});
		}
		if (!perRequestToken && args.token === '') {
			throw new ParseError('Missing Paperless-ngx API token.', {
				code: 'MISSING_VALUE',
				suggest: 'Pass the token argument or set $PAPERLESS_API_KEY.',
				details: { arg: 'token' },
			});
		}

		if (flags.http) {
			const allowedHosts = parseAllowedHosts(flags['allowed-hosts']);
			const app = createMcpExpressApp({
				host: flags.host,
				...(allowedHosts.length > 0 ? { allowedHosts } : {}),
			});

			if (perRequestToken) {
				// Per-request mode: the caller's Bearer token IS the Paperless
				// token. No shared PaperlessAPI exists in this mode at all.
				app.post('/mcp', (req: ParsedRequest, res: ServerResponse) => {
					const token = bearerToken(req);
					if (token == null) {
						sendJsonRpcError(
							res,
							401,
							-32001,
							'Missing or malformed Authorization header. Send: Authorization: Bearer <paperless-api-token>.',
							{ 'WWW-Authenticate': 'Bearer' },
						);
						return;
					}
					void handleMcpHttpRequest(req, res, new PaperlessAPI(args.baseUrl, token));
				});
			} else {
				const api = new PaperlessAPI(args.baseUrl, args.token);
				app.post('/mcp', (req: ParsedRequest, res: ServerResponse) => {
					void handleMcpHttpRequest(req, res, api);
				});
			}

			app.all('/mcp', (_req: ParsedRequest, res: ServerResponse) => {
				sendJsonRpcError(res, 405, -32000, 'Method not allowed.');
			});

			const httpServer = app.listen(flags.port, flags.host, () => {
				out.log(
					`MCP Stateless Streamable HTTP Server listening on http://${flags.host}:${flags.port}/mcp`,
				);
			});

			await runUntilShutdown(async () => {
				// Stop accepting connections and let in-flight requests drain; only
				// force any still-open sockets if draining exceeds the grace period.
				const forceClose = setTimeout(() => httpServer.closeAllConnections(), SHUTDOWN_GRACE_MS);
				forceClose.unref();
				await new Promise<void>((resolve) => httpServer.close(() => resolve()));
				clearTimeout(forceClose);
			});
		} else {
			const api = new PaperlessAPI(args.baseUrl, args.token);
			const server = createServer(api, { allowFilePath: true });
			const transport = new StdioServerTransport();
			await server.connect(transport);

			await runUntilShutdown(() => server.close());
		}
	});

void cli(CLI_NAME)
	.version(pkg.version)
	.links({ name: REPOSITORY_URL, version: `${REPOSITORY_URL}/releases/tag/v${pkg.version}` })
	.default(serve)
	.run();
