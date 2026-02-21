import type { IncomingMessage, ServerResponse } from 'node:http';

import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { PaperlessAPI } from './api/paperless-api';
import { registerCorrespondentTools } from './tools/correspondents';
import { registerDocumentTools } from './tools/documents';
import { registerDocumentTypeTools } from './tools/documentTypes';
import { registerTagTools } from './tools/tags';

// CLI argument parsing
const args = process.argv.slice(2);
const useHttp = args.includes('--http');

function parsePort(): number {
	const portIndex = args.indexOf('--port');
	if (portIndex !== -1) {
		const raw = args[portIndex + 1];
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

/** Express request with parsed body attached by express.json() middleware. */
interface ParsedRequest extends IncomingMessage {
	body?: unknown;
	query?: Record<string, string | string[] | undefined>;
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

async function main(): Promise<void> {
	let baseUrl: string | undefined;
	let token: string | undefined;

	if (useHttp) {
		baseUrl = process.env['PAPERLESS_URL'];
		token = process.env['API_KEY'];
		if (!baseUrl || !token) {
			console.error(
				'When using --http, PAPERLESS_URL and API_KEY environment variables must be set.',
			);
			process.exit(1);
		}
	} else {
		baseUrl = args[0];
		token = args[1];
		if (!baseUrl || !token) {
			console.error(
				'Usage: paperless-mcp <baseUrl> <token> [--http] [--port <port>]',
			);
			console.error(
				'Example: paperless-mcp http://localhost:8000 your-api-token --http --port 3000',
			);
			console.error(
				'When using --http, PAPERLESS_URL and API_KEY environment variables must be set.',
			);
			process.exit(1);
		}
	}

	const api = new PaperlessAPI(baseUrl, token);

	/** Create a fresh McpServer with all tools registered. */
	function createServer(): McpServer {
		const server = new McpServer({ name: 'paperless-ngx', version: '1.0.0' });
		registerDocumentTools(server, api);
		registerTagTools(server, api);
		registerCorrespondentTools(server, api);
		registerDocumentTypeTools(server, api);
		return server;
	}

	if (useHttp) {
		const app = createMcpExpressApp({ host: '0.0.0.0' });

		// In-memory SSE session store (no horizontal scaling)
		const sseTransports = new Map<string, SSEServerTransport>();

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

		app.get('/sse', async (_req: ParsedRequest, res: ServerResponse) => {
			console.log('SSE request received');
			try {
				const transport = new SSEServerTransport('/messages', res);
				sseTransports.set(transport.sessionId, transport);
				res.on('close', () => {
					sseTransports.delete(transport.sessionId);
					void transport.close();
				});
				const server = createServer();
				await server.connect(transport);
			} catch (error: unknown) {
				console.error('Error handling SSE request:', error);
				if (!res.headersSent) {
					res.writeHead(500, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify(jsonRpcError(-32603, 'Internal server error')));
				}
			}
		});

		app.post('/messages', async (req: ParsedRequest, res: ServerResponse) => {
			const sessionId = req.query?.['sessionId'];
			if (typeof sessionId !== 'string') {
				res.writeHead(400, { 'Content-Type': 'text/plain' });
				res.end('Missing or invalid sessionId query parameter');
				return;
			}
			const transport = sseTransports.get(sessionId);
			if (transport) {
				await transport.handlePostMessage(req, res, req.body);
			} else {
				res.writeHead(400, { 'Content-Type': 'text/plain' });
				res.end('No transport found for sessionId');
			}
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
