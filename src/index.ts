import type { IncomingMessage, ServerResponse } from 'node:http';

import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import pkg from '../package.json';
import { PaperlessAPI } from './api/paperless-api';
import { registerCorrespondentTools } from './tools/correspondents';
import { registerDocumentTools } from './tools/documents';
import { registerDocumentTypeTools } from './tools/documentTypes';
import { registerTagTools } from './tools/tags';

// CLI argument parsing
const rawArgs = process.argv.slice(2);
const useHttp = rawArgs.includes('--http');

function parsePort(): number {
	const portIndex = rawArgs.indexOf('--port');
	if (portIndex !== -1) {
		const raw = rawArgs[portIndex + 1];
		if (raw == null) {
			console.warn('--port flag provided without a value, using default 3000');
			return 3000;
		}
		const parsed = parseInt(raw, 10);
		if (isNaN(parsed)) {
			console.warn(`--port value "${raw}" is not a valid number, using default 3000`);
			return 3000;
		}
		return parsed;
	}
	return 3000;
}

const port = parsePort();

/** Positional args only (strip --http, --port and its value). */
function positionalArgs(): string[] {
	const result: string[] = [];
	for (let i = 0; i < rawArgs.length; i++) {
		const arg = rawArgs[i];
		if (arg == null) continue;
		if (arg === '--http') continue;
		if (arg === '--port') {
			i++; // skip value
			continue;
		}
		if (arg.startsWith('--')) continue;
		result.push(arg);
	}
	return result;
}

const args = positionalArgs();

/** Express request with parsed body attached by express.json() middleware. */
interface ParsedRequest extends IncomingMessage {
	body?: unknown;
}

/** JSON-RPC error response shape. */
interface JsonRpcError {
	readonly jsonrpc: '2.0';
	readonly error: { readonly code: number; readonly message: string };
	readonly id: null;
}

function jsonRpcError(code: number, message: string): JsonRpcError {
	return { jsonrpc: '2.0', error: { code, message }, id: null };
}

/** Resolve API key from env, preferring PAPERLESS_API_KEY over legacy API_KEY. */
function resolveToken(): string | undefined {
	return process.env['PAPERLESS_API_KEY'] ?? process.env['API_KEY'];
}

async function main(): Promise<void> {
	// CLI args take precedence, then env vars
	const baseUrl = args[0] ?? process.env['PAPERLESS_URL'];
	const token = args[1] ?? resolveToken();

	if (!baseUrl || !token) {
		console.error(
			'Usage: paperless-mcp [baseUrl] [token] [--http] [--port <port>]',
		);
		console.error(
			'  Args:  paperless-mcp http://localhost:8000 your-api-token',
		);
		console.error(
			'  Env:   PAPERLESS_URL + PAPERLESS_API_KEY (or legacy API_KEY)',
		);
		process.exit(1);
	}

	const api = new PaperlessAPI(baseUrl, token);

	/** Create a fresh McpServer with all tools registered. */
	function createServer(): McpServer {
		const server = new McpServer({ name: 'paperless-ngx', version: pkg.version });
		registerDocumentTools(server, api);
		registerTagTools(server, api);
		registerCorrespondentTools(server, api);
		registerDocumentTypeTools(server, api);
		return server;
	}

	if (useHttp) {
		const app = createMcpExpressApp({ host: '0.0.0.0' });

		app.post('/mcp', async (req: ParsedRequest, res: ServerResponse) => {
			try {
				const transport = new StreamableHTTPServerTransport({
					sessionIdGenerator: undefined,
				});
				res.on('close', () => {
					void transport.close();
				});
				const server = createServer();
				await server.connect(transport);
				await transport.handleRequest(req, res, req.body);
			} catch (error: unknown) {
				console.error('Error handling MCP request:', error);
				if (!res.headersSent) {
					res.writeHead(500, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify(jsonRpcError(-32603, 'Internal server error')));
				}
			}
		});

		app.get('/mcp', (_req: ParsedRequest, res: ServerResponse) => {
			res.writeHead(405, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(jsonRpcError(-32000, 'Method not allowed.')));
		});

		app.delete('/mcp', (_req: ParsedRequest, res: ServerResponse) => {
			res.writeHead(405, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(jsonRpcError(-32000, 'Method not allowed.')));
		});

		app.listen(port, () => {
			console.log(
				`MCP Stateless Streamable HTTP Server listening on port ${port}`,
			);
		});
	} else {
		const server = createServer();
		const transport = new StdioServerTransport();
		await server.connect(transport);
	}
}

main().catch((e: unknown) => {
	const message = e instanceof Error ? e.message : String(e);
	console.error(message);
});
