import type { IncomingMessage, ServerResponse } from 'node:http';

import { arg, cli, command, flag, ParseError } from '@kjanat/dreamcli';
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

/** Paperless-ngx base URL: validates the input and strips any trailing slash. */
const baseUrlArg = arg
	.custom((raw: string): string => {
		try {
			return new URL(raw).href.replace(/\/+$/, '');
		} catch {
			throw new ParseError(`Invalid Paperless-ngx base URL "${raw}".`, {
				code: 'INVALID_VALUE',
				suggest: 'Provide an absolute URL, e.g. http://localhost:8000.',
				details: { arg: 'baseUrl', value: raw },
			});
		}
	})
	.env('PAPERLESS_URL')
	.describe('Paperless-ngx base URL, e.g. http://localhost:8000');

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

const serve = command('paperless-mcp')
	.description('MCP server for the Paperless-ngx document management system.')
	.arg('baseUrl', baseUrlArg)
	.arg(
		'token',
		arg
			.string()
			.env('PAPERLESS_API_KEY')
			.describe('Paperless-ngx API token'),
	)
	.flag(
		'http',
		flag
			.boolean()
			.describe('Serve over Streamable HTTP instead of stdio (the default).'),
	)
	.flag('port', portFlag)
	.example('paperless-mcp http://localhost:8000 your-api-token', 'Serve over stdio')
	.example('paperless-mcp --http --port 8080', 'Serve over HTTP using env credentials')
	.action(async ({ args, flags, out }) => {
		const api = new PaperlessAPI(args.baseUrl, args.token);

		if (flags.http) {
			const app = createMcpExpressApp({ host: '0.0.0.0' });

			app.post('/mcp', (req: ParsedRequest, res: ServerResponse) => {
				void handleMcpHttpRequest(req, res, api);
			});

			app.all('/mcp', (_req: ParsedRequest, res: ServerResponse) => {
				sendJsonRpcError(res, 405, -32000, 'Method not allowed.');
			});

			app.listen(flags.port, () => {
				out.log(`MCP Stateless Streamable HTTP Server listening on port ${flags.port}`);
			});
		} else {
			const server = createServer(api);
			const transport = new StdioServerTransport();
			await server.connect(transport);
		}

		// dreamcli's run() exits the process once the action resolves; keep it
		// pending so the long-lived stdio/HTTP server stays up until terminated.
		await new Promise<never>(() => {});
	});

// Honor the legacy API_KEY env var by mapping it onto the name dreamcli resolves.
if (process.env['PAPERLESS_API_KEY'] == null && process.env['API_KEY'] != null) {
	process.env['PAPERLESS_API_KEY'] = process.env['API_KEY'];
}

void cli('paperless-mcp')
	.version(pkg.version)
	.description(pkg.description)
	.default(serve)
	.run();
