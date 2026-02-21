import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** Wrap a JSON-serializable value in a CallToolResult. */
export function jsonResult(data: unknown): CallToolResult {
	return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}
