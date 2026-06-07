import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseArgs } from 'node:util';

import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { JSONRPCErrorResponse } from '@modelcontextprotocol/sdk/types.js';

import pkg from '$/package.json';
import { PaperlessAPI } from './api/paperless-api';
import { registerCorrespondentTools } from './tools/correspondents';
import { registerDocumentTools } from './tools/documents';
import { registerDocumentTypeTools } from './tools/documentTypes';
import { registerTagTools } from './tools/tags';

const DEFAULT_PORT = 3000;
const SERVER_NAME = 'paperless-ngx';

/** Express request with parsed body attached by express.json() middleware. */
interface ParsedRequest extends IncomingMessage {
	body?: unknown;
}

interface CliOptions {
	readonly useHttp: boolean;
	readonly port: number;
	readonly positional: readonly string[];
	readonly showVersion: boolean;
	readonly showHelp: boolean;
}

function jsonRpcError(code: number, message: string): JSONRPCErrorResponse {
	return { jsonrpc: '2.0', error: { code, message } };
}

function sendJsonRpcError(
	res: ServerResponse,
	httpStatus: number,
	rpcCode: number,
	message: string,
): void {
	res.writeHead(httpStatus, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(jsonRpcError(rpcCode, message)));
}

function printUsage(log: (message: string) => void = console.error): void {
	log(
		`Usage: paperless-mcp [baseUrl] [token] [--http] [--port <1-65535>] [-V|--version] [-h|--help]
  Args:  paperless-mcp http://localhost:8000 your-api-token
  Env:   PAPERLESS_URL + PAPERLESS_API_KEY (or legacy API_KEY)`,
	);
}

function parsePort(raw: string): number {
	const port = Number(raw);

	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(`Invalid --port value "${raw}". Expected an integer 1-65535.`);
	}

	return port;
}

function parseCliArgs(argv: readonly string[]): CliOptions {
	const { values, positionals } = parseArgs({
		args: [...argv],
		options: {
			http: { type: 'boolean', default: false },
			port: { type: 'string' },
			version: { type: 'boolean', short: 'V', default: false },
			help: { type: 'boolean', short: 'h', default: false },
		},
		strict: true,
		allowPositionals: true,
	});

	return {
		useHttp: values.http,
		// --version/--help short-circuit in main() before --port is validated.
		port: values.port != null && !values.version && !values.help
			? parsePort(values.port)
			: DEFAULT_PORT,
		positional: positionals,
		showVersion: values.version,
		showHelp: values.help,
	};
}

/** Resolve API key from env, preferring PAPERLESS_API_KEY over legacy API_KEY. */
function resolveToken(): string | undefined {
	return process.env['PAPERLESS_API_KEY'] ?? process.env['API_KEY'];
}

function normalizeBaseUrl(input: string): string {
	const url = new URL(input);
	return url.href.replace(/\/+$/, '');
}

function createServer(api: PaperlessAPI): McpServer {
	const server = new McpServer({ name: SERVER_NAME, version: pkg.version });

	registerDocumentTools(server, api);
	registerTagTools(server, api);
	registerCorrespondentTools(server, api);
	registerDocumentTypeTools(server, api);

	return server;
}

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
		const server = createServer(api);
		await server.connect(transport);
		await transport.handleRequest(req, res, req.body);
	} catch (error: unknown) {
		console.error('Error handling MCP request:', error);

		if (!res.headersSent) {
			sendJsonRpcError(res, 500, -32603, 'Internal server error');
		}
	}
}

async function main(): Promise<void> {
	const cli = parseCliArgs(process.argv.slice(2));

	if (cli.showHelp) {
		printUsage(console.log);
		return;
	}

	if (cli.showVersion) {
		console.log(pkg.version);
		return;
	}

	const rawBaseUrl = cli.positional[0] ?? process.env['PAPERLESS_URL'];
	const token = cli.positional[1] ?? resolveToken();

	if (!rawBaseUrl || !token) {
		printUsage();
		process.exitCode = 1;
		return;
	}

	const baseUrl = normalizeBaseUrl(rawBaseUrl);
	const api = new PaperlessAPI(baseUrl, token);

	if (cli.useHttp) {
		const app = createMcpExpressApp({ host: '0.0.0.0' });

		app.post('/mcp', (req: ParsedRequest, res: ServerResponse) => {
			void handleMcpHttpRequest(req, res, api);
		});

		app.all('/mcp', (_req: ParsedRequest, res: ServerResponse) => {
			sendJsonRpcError(res, 405, -32000, 'Method not allowed.');
		});

		app.listen(cli.port, () => {
			console.log(
				`MCP Stateless Streamable HTTP Server listening on port ${cli.port}`,
			);
		});

		return;
	}

	const server = createServer(api);
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main().catch((error: unknown) => {
	if (error instanceof Error) {
		console.error(error.stack ?? error.message);
	} else {
		console.error(String(error));
	}
	process.exitCode = 1;
});
