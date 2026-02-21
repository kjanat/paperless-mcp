import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { PaperlessAPI } from '../api/paperless-api';
import { jsonResult } from './utils';

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

				matching_algorithm: z.number().int().min(0).max(6).optional().describe(
					'How to match text patterns: 0=none, 1=any word, 2=all words, 3=exact match, 4=regular expression, 5=fuzzy word, 6=automatic. Default is 0.',
				),

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
		'bulk_edit_correspondents',
		{
			description:
				'Perform bulk operations on multiple correspondents: set permissions to control who can assign them to documents, or permanently delete multiple correspondents. Use with caution as deletion affects all associated documents.',
			inputSchema: {
				correspondent_ids: z.array(z.number()).describe(
					'Array of correspondent IDs to perform bulk operations on. Use list_correspondents to get valid correspondent IDs.',
				),

				operation: z.enum(['set_permissions', 'delete']).describe(
					"Bulk operation: 'set_permissions' to control who can assign these correspondents to documents, 'delete' to permanently remove correspondents from the system. Warning: Deleting correspondents will remove them from all associated documents.",
				),

				owner: z.number().optional().describe(
					"User ID to set as owner when operation is 'set_permissions'. The owner has full control over these correspondents.",
				),

				permissions: z
					.object({
						view: z.object({
							users: z.array(z.number()).optional().describe(
								'User IDs who can see and assign these correspondents to documents',
							),

							groups: z.array(z.number()).optional().describe(
								'Group IDs who can see and assign these correspondents to documents',
							),
						}).describe('Users and groups with permission to view and use these correspondents'),

						change: z.object({
							users: z.array(z.number()).optional().describe(
								'User IDs who can modify correspondent details (name, matching rules)',
							),

							groups: z.array(z.number()).optional().describe('Group IDs who can modify correspondent details'),
						}).describe('Users and groups with permission to edit these correspondent settings'),
					})
					.optional().describe(
						"Permission settings when operation is 'set_permissions'. Defines who can view/assign and modify these correspondents.",
					),

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
