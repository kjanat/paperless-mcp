import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
	zMatchingAlgorithm,
	zPatchedStoragePathRequestWritable,
	zStoragePathRequestWritable,
} from '#api/generated/zod.gen';
import type { PaperlessAPI } from '#api/paperless';
import { jsonResult } from '#tools/utils';

export function registerStoragePathTools(server: McpServer, api: PaperlessAPI): void {
	server.registerTool(
		'list_storage_paths',
		{
			description:
				"Retrieve all storage paths that control where document files land on disk. Returns names, path templates, and automatic matching rules. Use this to resolve a document's storage_path ID to a name.",
		},
		async (_extra) => {
			return jsonResult(await api.getStoragePaths());
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
				"Modify an existing storage path's name, path template, or automatic matching rules. Changing the path template re-files matching documents on the next consumption/rename run.",
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
}
