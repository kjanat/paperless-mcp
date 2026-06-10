import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { zMatchingAlgorithm, zOperationEnum } from '#api/generated/zod.gen';
import type { PaperlessAPI } from '#api/paperless';
import { jsonResult, permissionsInput } from '#tools/utils';

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
		'get_tag',
		{
			description:
				"Get a single tag by ID: name, color, and matching rules. Cheaper than list_tags when you already know the ID (e.g. from a document's tags array).",
			inputSchema: {
				id: z.number().describe("Tag ID, e.g. from a document's tags array or list_tags."),
			},
		},
		async ({ id }, _extra) => {
			return jsonResult(await api.getTag(id));
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

				matching_algorithm: zMatchingAlgorithm.optional(),

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

				matching_algorithm: zMatchingAlgorithm.optional(),

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
				"Deprecated: use bulk_edit_tags with operation='delete' instead — this tool will be removed in v3.0.0. Permanently deletes a tag from the system, removing it from all documents that currently use it. Cannot be undone.",
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

				operation: zOperationEnum.describe(
					"Bulk operation: 'set_permissions' to control who can use these tags, 'delete' to permanently remove all specified tags from the system.",
				),

				owner: z.number().optional().describe(
					"User ID to set as owner when operation is 'set_permissions'. Owner has full control over the tags.",
				),

				permissions: permissionsInput({
					root:
						"Permission settings when operation is 'set_permissions'. Defines who can view/use and modify these tags.",
					view: 'Users and groups with view/use permissions for these tags',
					viewUsers: 'User IDs who can see and use these tags',
					viewGroups: 'Group IDs who can see and use these tags',
					change: 'Users and groups with edit permissions for these tags',
					changeUsers: 'User IDs who can modify these tags (name, color, matching rules)',
					changeGroups: 'Group IDs who can modify these tags',
				}),

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
