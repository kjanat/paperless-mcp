import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { PaperlessAPI } from '#api/paperless';
import { jsonResult } from '#tools/utils';

export function registerTrashTools(server: McpServer, api: PaperlessAPI): void {
	server.registerTool(
		'list_trash',
		{
			description:
				'List documents currently in the trash (soft-deleted via bulk_edit_documents method=delete). Trashed documents are auto-purged after the retention period; until then they can be restored. Content field is stripped to save tokens.',
		},
		async (_extra) => {
			return jsonResult(await api.getTrash());
		},
	);

	server.registerTool(
		'restore_from_trash',
		{
			description:
				'Restore soft-deleted documents from the trash back into the archive, with their metadata intact. Use list_trash to find document IDs.',
			inputSchema: {
				documents: z.array(z.number().int().min(1)).min(1).describe(
					'Document IDs to restore (at least one). Use list_trash to find IDs of trashed documents.',
				),
			},
		},
		async ({ documents }, _extra) => {
			return jsonResult(await api.restoreFromTrash(documents));
		},
	);

	server.registerTool(
		'empty_trash',
		{
			description:
				'PERMANENTLY delete documents from the trash. This is the irreversible step: once emptied, documents and their files are gone. Omit documents to empty the entire trash.',
			// Raw shape, NOT z.object(...).default({}): the SDK advertises wrapped
			// schemas as an empty object, hiding the params from every client.
			inputSchema: {
				documents: z.array(z.number().int().min(1)).min(1).optional().describe(
					'Document IDs to purge from the trash (at least one when given). Omit entirely to permanently delete EVERYTHING in the trash.',
				),
			},
		},
		async ({ documents }, _extra) => {
			return jsonResult(await api.emptyTrash(documents));
		},
	);
}
