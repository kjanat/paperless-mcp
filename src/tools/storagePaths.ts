import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
	zMatchingAlgorithm,
	zOperationEnum,
	zPatchedStoragePathRequestWritable,
	zStoragePathRequestWritable,
} from '#api/generated/zod.gen';
import type { PaperlessAPI } from '#api/paperless';
import { jsonResult, permissionsInput } from '#tools/utils';

export function registerStoragePathTools(server: McpServer, api: PaperlessAPI): void {
	server.registerTool(
		'list_storage_paths',
		{
			description:
				"Retrieve all storage paths that control where document files land on disk. Returns names, path templates, and automatic matching rules. Use this to resolve a document's storage_path ID to a name.",
			// Full schema with .default({}) so clients that omit arguments entirely
			// (allowed by the MCP spec) still pass validation.
			inputSchema: z.object({
				name: z.string().optional().describe(
					'Case-insensitive substring filter on the name. Omit to list all storage paths.',
				),
			}).default({}),
		},
		async ({ name }, _extra) => {
			return jsonResult(await api.getStoragePaths(name));
		},
	);

	server.registerTool(
		'create_storage_path',
		{
			description:
				'Create a new storage path that controls where matching document files are stored on disk. The path template supports placeholders like {{ created_year }}, {{ correspondent }}, {{ document_type }}, {{ title }}.',
			inputSchema: {
				name: zStoragePathRequestWritable.shape.name.describe(
					'Name of the storage path. Must be unique among all storage paths.',
				),

				path: zStoragePathRequestWritable.shape.path.describe(
					"Path template relative to the media root, e.g. '{{ created_year }}/{{ correspondent }}/{{ title }}'. Supports Paperless-ngx filename placeholders.",
				),

				match: zStoragePathRequestWritable.shape.match.describe(
					'Text pattern to automatically assign this storage path to matching documents.',
				),

				matching_algorithm: zMatchingAlgorithm.optional(),

				is_insensitive: zStoragePathRequestWritable.shape.is_insensitive.describe(
					'Whether matching is case-insensitive. Default is true.',
				),
			},
		},
		async (args, _extra) => {
			return jsonResult(await api.createStoragePath(args));
		},
	);

	server.registerTool(
		'update_storage_path',
		{
			description:
				"Modify an existing storage path's name, path template, or automatic matching rules. Changing the path template re-files matching documents on the next consumption/rename run. Use bulk_edit_storage_paths for permissions or deletion.",
			inputSchema: {
				id: z.number().int().min(1).describe(
					'ID of the storage path to update. Use list_storage_paths to find existing storage path IDs.',
				),

				name: zPatchedStoragePathRequestWritable.shape.name.describe(
					'New storage path name. Must be unique among all storage paths.',
				),

				path: zPatchedStoragePathRequestWritable.shape.path.describe(
					'New path template relative to the media root. Supports Paperless-ngx filename placeholders.',
				),

				match: zPatchedStoragePathRequestWritable.shape.match.describe(
					'Text pattern for automatic assignment. Empty string removes auto-matching.',
				),

				matching_algorithm: zMatchingAlgorithm.optional(),

				is_insensitive: zPatchedStoragePathRequestWritable.shape.is_insensitive.describe(
					'Whether matching is case-insensitive.',
				),
			},
		},
		async ({ id, ...data }, _extra) => {
			return jsonResult(await api.updateStoragePath(id, data));
		},
	);

	server.registerTool(
		'bulk_edit_storage_paths',
		{
			description:
				'Perform bulk operations on multiple storage paths: set permissions to control who can assign them, or permanently delete multiple storage paths at once. Deleting a storage path does not delete documents — they fall back to the default storage location on the next rename run.',
			inputSchema: {
				storage_path_ids: z.array(z.number().int().min(1)).describe(
					'Array of storage path IDs to perform bulk operations on. Use list_storage_paths to get valid storage path IDs.',
				),

				operation: zOperationEnum.describe(
					"Bulk operation: 'set_permissions' to control who can use these storage paths, 'delete' to permanently remove all specified storage paths from the system.",
				),

				owner: z.number().int().min(1).optional().describe(
					"User ID to set as owner when operation is 'set_permissions'. Owner has full control over the storage paths.",
				),

				permissions: permissionsInput({
					root:
						"Permission settings when operation is 'set_permissions'. Defines who can view/use and modify these storage paths.",
					view: 'Users and groups with view/use permissions for these storage paths',
					viewUsers: 'User IDs who can see and assign these storage paths to documents',
					viewGroups: 'Group IDs who can see and assign these storage paths to documents',
					change: 'Users and groups with edit permissions for these storage paths',
					changeUsers: 'User IDs who can modify these storage paths (name, path template, matching rules)',
					changeGroups: 'Group IDs who can modify these storage paths',
				}),

				merge: z.boolean().optional().describe(
					'Whether to merge with existing permissions (true) or replace them entirely (false). Default is false.',
				),
			},
		},
		async ({ storage_path_ids, operation, ...rest }, _extra) => {
			const result = await api.bulkEditObjects(
				storage_path_ids,
				'storage_paths',
				operation,
				operation === 'set_permissions' ? rest : {},
			);
			return jsonResult(result);
		},
	);
}
