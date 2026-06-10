import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { zMatchingAlgorithm, zOperationEnum, zPatchedCorrespondentRequestWritable } from '#api/generated/zod.gen';
import type { PaperlessAPI } from '#api/paperless';
import { jsonResult, permissionsInput } from '#tools/utils';

export function registerCorrespondentTools(server: McpServer, api: PaperlessAPI): void {
	server.registerTool(
		'list_correspondents',
		{
			description:
				'Retrieve all available correspondents (people, companies, organizations that send/receive documents). Returns names and automatic matching patterns for document assignment.',
		},
		async (_extra) => {
			return jsonResult(await api.getCorrespondents());
		},
	);

	server.registerTool(
		'get_correspondent',
		{
			description:
				"Get a single correspondent by ID: name and matching rules. Cheaper than list_correspondents when you already know the ID (e.g. from a document's correspondent field).",
			inputSchema: {
				id: z.number().describe(
					"Correspondent ID, e.g. from a document's correspondent field or list_correspondents.",
				),
			},
		},
		async ({ id }, _extra) => {
			return jsonResult(await api.getCorrespondent(id));
		},
	);

	server.registerTool(
		'create_correspondent',
		{
			description:
				'Create a new correspondent (person, company, or organization) for tracking document senders and receivers. Can include automatic matching patterns for smart assignment to incoming documents.',
			inputSchema: {
				name: z.string().describe(
					"Name of the correspondent (person, company, or organization that sends/receives documents). Examples: 'Bank of America', 'John Smith', 'Electric Company'.",
				),

				match: z.string().optional().describe(
					'Text pattern to automatically assign this correspondent to matching documents. Use names, email addresses, or keywords that appear in documents from this correspondent.',
				),

				matching_algorithm: zMatchingAlgorithm.optional(),

				is_insensitive: z.boolean().optional().describe(
					'Whether matching is case-insensitive. Default is true.',
				),
			},
		},
		async (args, _extra) => {
			return jsonResult(await api.createCorrespondent(args));
		},
	);

	server.registerTool(
		'update_correspondent',
		{
			description:
				"Modify an existing correspondent's name or automatic matching rules. Useful for fixing an over-matching correspondent: narrow the match pattern or switch the matching algorithm. Use bulk_edit_correspondents for permissions or deletion.",
			inputSchema: {
				id: z.number().describe(
					'ID of the correspondent to update. Use list_correspondents to find existing correspondent IDs.',
				),

				name: zPatchedCorrespondentRequestWritable.shape.name.describe(
					'New correspondent name. Must be unique among all correspondents.',
				),

				match: zPatchedCorrespondentRequestWritable.shape.match.describe(
					'Text pattern for automatic assignment. Empty string removes auto-matching. Use keywords, phrases, or regex depending on matching_algorithm.',
				),

				matching_algorithm: zMatchingAlgorithm.optional(),

				is_insensitive: zPatchedCorrespondentRequestWritable.shape.is_insensitive.describe(
					'Whether matching is case-insensitive.',
				),
			},
		},
		async ({ id, ...data }, _extra) => {
			return jsonResult(await api.updateCorrespondent(id, data));
		},
	);

	server.registerTool(
		'bulk_edit_correspondents',
		{
			description:
				'Perform bulk operations on multiple correspondents: set permissions to control who can assign them to documents, or permanently delete multiple correspondents. Use with caution as deletion affects all associated documents.',
			inputSchema: {
				correspondent_ids: z.array(z.number()).describe(
					'Array of correspondent IDs to perform bulk operations on. Use list_correspondents to get valid correspondent IDs.',
				),

				operation: zOperationEnum.describe(
					"Bulk operation: 'set_permissions' to control who can assign these correspondents to documents, 'delete' to permanently remove correspondents from the system. Warning: Deleting correspondents will remove them from all associated documents.",
				),

				owner: z.number().optional().describe(
					"User ID to set as owner when operation is 'set_permissions'. The owner has full control over these correspondents.",
				),

				permissions: permissionsInput({
					root:
						"Permission settings when operation is 'set_permissions'. Defines who can view/assign and modify these correspondents.",
					view: 'Users and groups with permission to view and use these correspondents',
					viewUsers: 'User IDs who can see and assign these correspondents to documents',
					viewGroups: 'Group IDs who can see and assign these correspondents to documents',
					change: 'Users and groups with permission to edit these correspondent settings',
					changeUsers: 'User IDs who can modify correspondent details (name, matching rules)',
					changeGroups: 'Group IDs who can modify correspondent details',
				}),

				merge: z.boolean().optional().describe(
					'Whether to merge with existing permissions (true) or replace them entirely (false). Default is false.',
				),
			},
		},
		async ({ correspondent_ids, operation, ...rest }, _extra) => {
			const result = await api.bulkEditObjects(
				correspondent_ids,
				'correspondents',
				operation,
				operation === 'set_permissions' ? rest : {},
			);
			return jsonResult(result);
		},
	);
}
