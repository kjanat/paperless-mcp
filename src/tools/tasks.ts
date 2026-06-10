import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { PaperlessAPI } from '#api/paperless';
import { jsonResult } from '#tools/utils';

export function registerTaskTools(server: McpServer, api: PaperlessAPI): void {
	server.registerTool(
		'get_task',
		{
			description:
				'Look up a consumer/queue task by its task UUID — the value returned by post_document. Shows processing status (pending, started, success, failure) and, once finished, related_document_ids with the resulting document ID(s). Poll this after post_document to find out when OCR is done and which document was created.',
			inputSchema: {
				task_id: z.uuid().describe(
					'Task UUID as returned by post_document (not the numeric task id). Returns the matching task(s) with status and resulting document IDs.',
				),
			},
		},
		async ({ task_id }, _extra) => {
			return jsonResult(await api.getTask(task_id));
		},
	);
}
