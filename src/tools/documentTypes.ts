import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { zMatchingAlgorithm, zOperationEnum } from '#api/generated/zod.gen';
import type { PaperlessAPI } from '#api/paperless';
import { jsonResult, permissionsInput } from '#tools/utils';

export function registerDocumentTypeTools(server: McpServer, api: PaperlessAPI): void {
	server.registerTool(
		'list_document_types',
		{
			description:
				'Retrieve all available document types for categorizing documents by purpose or format (Invoice, Receipt, Contract, etc.). Returns names and automatic matching rules.',
		},
		async (_extra) => {
			return jsonResult(await api.getDocumentTypes());
		},
	);

	server.registerTool(
		'create_document_type',
		{
			description:
				'Create a new document type for categorizing documents by their purpose or format (e.g., Invoice, Receipt, Contract). Can include automatic matching rules for smart classification.',
			inputSchema: {
				name: z.string().describe(
					"Name of the document type for categorizing documents by their purpose or format. Examples: 'Invoice', 'Receipt', 'Contract', 'Letter', 'Bank Statement', 'Tax Document'.",
				),

				match: z.string().optional().describe(
					"Text pattern to automatically assign this document type to matching documents. Use keywords that commonly appear in this type of document (e.g., 'invoice', 'receipt', 'contract terms').",
				),

				matching_algorithm: zMatchingAlgorithm.optional(),

				is_insensitive: z.boolean().optional().describe(
					'Whether matching is case-insensitive. Default is true.',
				),
			},
		},
		async (args, _extra) => {
			return jsonResult(await api.createDocumentType(args));
		},
	);

	server.registerTool(
		'bulk_edit_document_types',
		{
			description:
				'Perform bulk operations on multiple document types: set permissions to control who can assign them to documents, or permanently delete multiple types. Use with caution as deletion affects all associated documents.',
			inputSchema: {
				document_type_ids: z.array(z.number()).describe(
					'Array of document type IDs to perform bulk operations on. Use list_document_types to get valid document type IDs.',
				),

				operation: zOperationEnum.describe(
					"Bulk operation: 'set_permissions' to control who can assign these document types to documents, 'delete' to permanently remove document types from the system. Warning: Deleting document types will remove the classification from all associated documents.",
				),

				owner: z.number().optional().describe(
					"User ID to set as owner when operation is 'set_permissions'. The owner has full control over these document types.",
				),

				permissions: permissionsInput({
					root:
						"Permission settings when operation is 'set_permissions'. Defines who can view/assign and modify these document types.",
					view: 'Users and groups with permission to view and use these document types for categorization',
					viewUsers: 'User IDs who can see and assign these document types to documents',
					viewGroups: 'Group IDs who can see and assign these document types to documents',
					change: 'Users and groups with permission to edit these document type settings',
					changeUsers: 'User IDs who can modify document type details (name, matching rules)',
					changeGroups: 'Group IDs who can modify document type details',
				}),

				merge: z.boolean().optional().describe(
					'Whether to merge with existing permissions (true) or replace them entirely (false). Default is false.',
				),
			},
		},
		async ({ document_type_ids, operation, ...rest }, _extra) => {
			const result = await api.bulkEditObjects(
				document_type_ids,
				'document_types',
				operation,
				operation === 'set_permissions' ? rest : {},
			);
			return jsonResult(result);
		},
	);
}
