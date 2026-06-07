import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

/** Wrap a JSON-serializable value in a CallToolResult. */
export function jsonResult(data: unknown): CallToolResult {
	return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

/**
 * Builds the `view`/`change` → `users`/`groups` permissions input shared by the
 * taxonomy bulk-edit tools (tags, correspondents, document types). The shape is
 * identical across them; only the per-resource descriptions differ, so callers
 * pass those in.
 */
export function permissionsInput(d: {
	readonly root: string;
	readonly view: string;
	readonly viewUsers: string;
	readonly viewGroups: string;
	readonly change: string;
	readonly changeUsers: string;
	readonly changeGroups: string;
}) {
	return z
		.object({
			view: z.object({
				users: z.array(z.number()).optional().describe(d.viewUsers),
				groups: z.array(z.number()).optional().describe(d.viewGroups),
			}).describe(d.view),
			change: z.object({
				users: z.array(z.number()).optional().describe(d.changeUsers),
				groups: z.array(z.number()).optional().describe(d.changeGroups),
			}).describe(d.change),
		})
		.optional().describe(d.root);
}
