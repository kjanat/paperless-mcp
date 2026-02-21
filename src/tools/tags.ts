import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { PaperlessAPI } from '@/api/paperless-api';
import { jsonResult } from './utils';

export function registerTagTools(server: McpServer, api: PaperlessAPI): void {
	server.registerTool(
		'list_tags',
		{
			description:
				'Retrieve all available tags for labeling and organizing documents. Returns tag names, colors, and matching rules for automatic assignment.',
		},
		async (_extra) => {
			return jsonResult(await api.getTags());
		},
	);

	server.registerTool(
		'create_tag',
		{
			description:
				'Create a new tag for labeling and organizing documents. Tags can have colors for visual identification and automatic matching rules for smart assignment.',
			inputSchema: {
				name: z.string().describe(
					"Tag name for labeling and organizing documents (e.g., 'important', 'taxes', 'receipts'). Must be unique and descriptive.",
				),

				color: z
					.string()
					.regex(/^#[0-9A-Fa-f]{6}$/)
					.optional().describe(
						"Hex color code for visual identification (e.g., '#FF0000' for red, '#00FF00' for green). If not provided, Paperless assigns a random color.",
					),

				match: z.string().optional().describe(
					'Text pattern to automatically assign this tag to matching documents. Use keywords, phrases, or regular expressions depending on matching_algorithm.',
				),

				matching_algorithm: z.number().int().min(0).max(6).optional().describe(
					'How to match text patterns: 0=none, 1=any word, 2=all words, 3=exact match, 4=regular expression, 5=fuzzy word, 6=automatic. Default is 0.',
				),

				is_insensitive: z.boolean().optional().describe(
					'Whether matching is case-insensitive. Default is true.',
				),

				is_inbox_tag: z.boolean().optional().describe(
					'Whether this is an inbox tag. Documents with inbox tags appear in the inbox.',
				),

				parent: z.number().nullable().optional().describe(
					'ID of the parent tag for hierarchical tag organization. Null for top-level tags.',
				),
			},
		},
		async (args, _extra) => {
			return jsonResult(await api.createTag(args));
		},
	);

	server.registerTool(
		'update_tag',
		{
			description:
				"Modify an existing tag's name, color, or automatic matching rules. Useful for refining tag organization and improving automatic document classification.",
			inputSchema: {
				id: z.number().describe('ID of the tag to update. Use list_tags to find existing tag IDs.'),

				name: z.string().optional().describe('New tag name. Must be unique among all tags.'),

				color: z
					.string()
					.regex(/^#[0-9A-Fa-f]{6}$/)
					.optional().describe(
						"New hex color code for visual identification (e.g., '#FF0000' for red). Leave empty to keep current color.",
					),

				match: z.string().optional().describe(
					'Text pattern for automatic tag assignment. Empty string removes auto-matching. Use keywords, phrases, or regex depending on matching_algorithm.',
				),

				matching_algorithm: z.number().int().min(0).max(6).optional().describe(
					'Algorithm for pattern matching: 0=none, 1=any word, 2=all words, 3=exact match, 4=regular expression, 5=fuzzy word, 6=automatic.',
				),

				is_insensitive: z.boolean().optional().describe(
					'Whether matching is case-insensitive.',
				),

				is_inbox_tag: z.boolean().optional().describe(
					'Whether this is an inbox tag.',
				),

				parent: z.number().nullable().optional().describe(
					'ID of the parent tag. Null for top-level tags.',
				),
			},
		},
		async ({ id, ...data }, _extra) => {
			return jsonResult(await api.updateTag(id, data));
		},
	);

	server.registerTool(
		'delete_tag',
		{
			description:
				'Permanently delete a tag from the system. This removes the tag from all documents that currently use it. Use with caution as this action cannot be undone.',
			inputSchema: {
				id: z.number().describe(
					'ID of the tag to permanently delete. This will remove the tag from all documents that currently use it. Use list_tags to find tag IDs.',
				),
			},
		},
		async ({ id }, _extra) => {
			return jsonResult(await api.deleteTag(id));
		},
	);

	server.registerTool(
		'bulk_edit_tags',
		{
			description:
				'Perform bulk operations on multiple tags: set permissions to control access or permanently delete multiple tags at once. Efficient for managing large tag collections.',
			inputSchema: {
				tag_ids: z.array(z.number()).describe(
					'Array of tag IDs to perform bulk operations on. Use list_tags to get valid tag IDs.',
				),

				operation: z.enum(['set_permissions', 'delete']).describe(
					"Bulk operation: 'set_permissions' to control who can use these tags, 'delete' to permanently remove all specified tags from the system.",
				),

				owner: z.number().optional().describe(
					"User ID to set as owner when operation is 'set_permissions'. Owner has full control over the tags.",
				),

				permissions: z
					.object({
						view: z.object({
							users: z.array(z.number()).optional().describe('User IDs who can see and use these tags'),
							groups: z.array(z.number()).optional().describe('Group IDs who can see and use these tags'),
						}).describe('Users and groups with view/use permissions for these tags'),

						change: z.object({
							users: z.array(z.number()).optional().describe(
								'User IDs who can modify these tags (name, color, matching rules)',
							),

							groups: z.array(z.number()).optional().describe('Group IDs who can modify these tags'),
						}).describe('Users and groups with edit permissions for these tags'),
					})
					.optional().describe(
						"Permission settings when operation is 'set_permissions'. Defines who can view/use and modify these tags.",
					),

				merge: z.boolean().optional().describe(
					'Whether to merge with existing permissions (true) or replace them entirely (false). Default is false.',
				),
			},
		},
		async ({ tag_ids, operation, ...rest }, _extra) => {
			const result = await api.bulkEditObjects(
				tag_ids,
				'tags',
				operation,
				operation === 'set_permissions' ? rest : {},
			);
			return jsonResult(result);
		},
	);
}
