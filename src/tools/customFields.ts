import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { zCustomFieldRequest, zPatchedCustomFieldRequest } from '#api/generated/zod.gen';
import type { PaperlessAPI } from '#api/paperless';
import { jsonResult } from '#tools/utils';

export function registerCustomFieldTools(server: McpServer, api: PaperlessAPI): void {
	server.registerTool(
		'list_custom_fields',
		{
			description:
				'Retrieve all custom field definitions (name, data type, options). Use this to resolve field names to the numeric IDs that update_document.custom_fields and bulk_edit_documents.modify_custom_fields require.',
			// Raw shape, NOT z.object(...).default({}): the SDK advertises wrapped
			// schemas as an empty object, hiding the params from every client.
			inputSchema: {
				name: z.string().optional().describe(
					'Case-insensitive substring filter on the name. Omit to list all custom fields.',
				),
			},
		},
		async ({ name }, _extra) => {
			return jsonResult(await api.getCustomFields(name));
		},
	);

	server.registerTool(
		'create_custom_field',
		{
			description:
				'Create a new custom field definition for storing extra metadata on documents (e.g. an invoice number, a due date, a monetary amount).',
			inputSchema: {
				name: zCustomFieldRequest.shape.name.describe(
					'Name of the custom field. Must be unique among all custom fields.',
				),

				data_type: zCustomFieldRequest.shape.data_type.describe(
					'Data type of the field: string, url, date, boolean, integer, float, monetary, documentlink, or select.',
				),

				extra_data: zCustomFieldRequest.shape.extra_data.describe(
					"Extra configuration, e.g. {select_options: [{label: 'Open'}, {label: 'Paid'}]} for select fields or {default_currency: 'EUR'} for monetary fields.",
				),
			},
		},
		async (args, _extra) => {
			return jsonResult(await api.createCustomField(args));
		},
	);

	server.registerTool(
		'update_custom_field',
		{
			description:
				"Modify an existing custom field definition's name, data type, or options. Changing the data type of a field that already has values may invalidate them — prefer renaming or extending options.",
			inputSchema: {
				id: z.number().int().min(1).describe(
					'ID of the custom field to update. Use list_custom_fields to find existing field IDs.',
				),

				name: zPatchedCustomFieldRequest.shape.name.describe(
					'New custom field name. Must be unique among all custom fields.',
				),

				data_type: zPatchedCustomFieldRequest.shape.data_type.describe(
					'New data type. Warning: changing the type of a field with existing values may invalidate them.',
				),

				extra_data: zPatchedCustomFieldRequest.shape.extra_data.describe(
					'New extra configuration, e.g. select options or default currency.',
				),
			},
		},
		async ({ id, ...data }, _extra) => {
			return jsonResult(await api.updateCustomField(id, data));
		},
	);

	server.registerTool(
		'delete_custom_field',
		{
			description:
				'Permanently delete a custom field definition. This removes the field and all its values from every document that uses it. Cannot be undone. Single-delete only: the backend has no bulk endpoint for custom fields (unlike tags, correspondents, document types, and storage paths).',
			inputSchema: {
				id: z.number().int().min(1).describe(
					'ID of the custom field to permanently delete. This will drop the field and its values from all documents. Use list_custom_fields to find field IDs.',
				),
			},
		},
		async ({ id }, _extra) => {
			await api.deleteCustomField(id);
			return jsonResult({ deleted: id });
		},
	);
}
