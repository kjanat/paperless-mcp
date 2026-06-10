import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { PaperlessAPI } from '#api/paperless';
import { jsonResult } from '#tools/utils';

export function registerTaskTools(server: McpServer, api: PaperlessAPI): void {
	server.registerTool(
		'get_task',
		{
			description:
				'Look up a consumer/queue task by its task UUID — the value returned by post_document. Shows processing status (PENDING, STARTED, SUCCESS, FAILURE) and, once finished, related_document with the resulting document ID. Poll this after post_document to find out when OCR is done and which document was created.',
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

	server.registerTool(
		'list_tasks',
		{
			description:
				'List recent consumer/queue tasks, newest first. Use this to find uploads or reprocess runs when you no longer have the task UUID, or to spot failed consumptions. Returns at most `limit` tasks (default 25).',
			inputSchema: {
				status: z
					.enum(['PENDING', 'STARTED', 'SUCCESS', 'FAILURE', 'RETRY', 'REVOKED'])
					.optional()
					.describe("Only return tasks with this status, e.g. 'FAILURE' to find failed consumptions."),

				acknowledged: z.boolean().optional().describe(
					'Filter on the acknowledged (dismissed) flag. false returns tasks still shown in the Paperless tasks view.',
				),

				task_name: z.string().optional().describe(
					"Only return tasks of this kind, e.g. 'consume_file' (document uploads), 'train_classifier', 'check_sanity'.",
				),

				limit: z.number().int().min(1).max(100).optional().describe(
					'Maximum number of tasks to return (newest first). Default 25. The instance may hold thousands of historical tasks.',
				),
			},
		},
		async (filters, _extra) => {
			return jsonResult(await api.listTasks(filters));
		},
	);
}
