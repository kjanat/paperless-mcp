import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { zMailRuleRequestWritable, zPatchedMailRuleRequestWritable } from '#api/generated/zod.gen';
import type { PaperlessAPI } from '#api/paperless';
import { jsonResult } from '#tools/utils';

export function registerMailTools(server: McpServer, api: PaperlessAPI): void {
	server.registerTool(
		'list_mail_accounts',
		{
			description:
				'List configured mail accounts that Paperless polls for document ingestion. Credentials are stripped from the response. Mail account setup/credentials stay in the web UI; use process_mail_account to trigger a poll and mail rules to control what gets imported.',
		},
		async (_extra) => {
			return jsonResult(await api.getMailAccounts());
		},
	);

	server.registerTool(
		'process_mail_account',
		{
			description:
				'Trigger an immediate mail poll for one account instead of waiting for the scheduled run. Mail rules decide what gets consumed; track resulting consume tasks via list_tasks.',
			inputSchema: {
				id: z.number().int().min(1).describe(
					'Mail account ID. Use list_mail_accounts to find account IDs.',
				),
			},
		},
		async ({ id }, _extra) => {
			return jsonResult(await api.processMailAccount(id));
		},
	);

	server.registerTool(
		'list_mail_rules',
		{
			description:
				'List mail rules: per-account filters that decide which emails get consumed and how they are tagged/assigned. Rules run in order; a rule can stop further processing.',
		},
		async (_extra) => {
			return jsonResult(await api.getMailRules());
		},
	);

	server.registerTool(
		'create_mail_rule',
		{
			description:
				"Create a mail rule that imports matching emails from a mail account: filter on sender/subject/body/attachment, then assign tags, correspondent, and document type, and tell the mail server what to do with the email afterwards. Example: import invoices from a vendor, tag them 'Bills', mark the email read. New rules affect FUTURE ingestion runs.",
			inputSchema: {
				account: z.number().int().min(1).describe(
					'Mail account ID this rule applies to. Use list_mail_accounts to find account IDs.',
				),

				name: zMailRuleRequestWritable.shape.name.describe(
					'Name of the mail rule. Must be unique among all mail rules.',
				),

				folder: zMailRuleRequestWritable.shape.folder.describe(
					"IMAP folder to watch (default INBOX). Subfolders are separated by a delimiter, often '.' or '/', varying by mail server.",
				),

				filter_from: zMailRuleRequestWritable.shape.filter_from.describe(
					"Only process emails whose From address contains this text, e.g. 'billing@vendor.com'.",
				),

				filter_to: zMailRuleRequestWritable.shape.filter_to.describe(
					'Only process emails whose To address contains this text.',
				),

				filter_subject: zMailRuleRequestWritable.shape.filter_subject.describe(
					"Only process emails whose subject contains this text, e.g. 'invoice'.",
				),

				filter_body: zMailRuleRequestWritable.shape.filter_body.describe(
					'Only process emails whose body contains this text.',
				),

				filter_attachment_filename_include: zMailRuleRequestWritable.shape
					.filter_attachment_filename_include.describe(
						"Only consume attachments whose filename matches this pattern (wildcards allowed, e.g. '*.pdf').",
					),

				filter_attachment_filename_exclude: zMailRuleRequestWritable.shape
					.filter_attachment_filename_exclude.describe(
						'Skip attachments whose filename matches this pattern (wildcards allowed).',
					),

				maximum_age: z.number().int().min(0).optional().describe(
					'Only process emails younger than this many days. Omitted: the server default applies (30 days). Explicit 0 disables the age limit.',
				),

				action: zMailRuleRequestWritable.shape.action.describe(
					'What the mail server does with the email after processing. 1=Delete the email from the mailbox (WARNING: permanent email loss on every poll, no undo; prefer 3 unless you are certain), 2=Move to the folder named in action_parameter, 3=Mark as read (read mails are not processed again), 4=Flag (flagged mails are not processed again), 5=Tag with the keyword in action_parameter (tagged mails are not processed again).',
				),

				action_parameter: z.string().min(1).optional().describe(
					"Parameter for the action, e.g. the target folder for 'move' or the keyword for 'tag'.",
				),

				consumption_scope: zMailRuleRequestWritable.shape.consumption_scope,
				attachment_type: zMailRuleRequestWritable.shape.attachment_type,
				pdf_layout: zMailRuleRequestWritable.shape.pdf_layout,

				assign_title_from: zMailRuleRequestWritable.shape.assign_title_from,

				assign_tags: z.array(z.number().int().min(1)).optional().describe(
					'Tag IDs to assign to consumed documents. Use list_tags to find IDs.',
				),

				assign_correspondent_from: zMailRuleRequestWritable.shape.assign_correspondent_from,

				assign_correspondent: z.number().int().min(1).optional().describe(
					'Correspondent ID to assign when assign_correspondent_from is 4 (use the correspondent selected below). Use list_correspondents to find IDs.',
				),

				assign_document_type: z.number().int().min(1).optional().describe(
					'Document type ID to assign to consumed documents. Use list_document_types to find IDs.',
				),

				assign_owner_from_rule: zMailRuleRequestWritable.shape.assign_owner_from_rule,

				enabled: zMailRuleRequestWritable.shape.enabled.describe(
					'Whether the rule is active. Disabled rules are skipped during mail processing.',
				),

				order: zMailRuleRequestWritable.shape.order.describe(
					'Execution order among all mail rules (lower runs first).',
				),

				stop_processing: zMailRuleRequestWritable.shape.stop_processing,
			},
		},
		async (args, _extra) => {
			return jsonResult(await api.createMailRule(args));
		},
	);

	server.registerTool(
		'update_mail_rule',
		{
			description:
				'Modify an existing mail rule: filters, assignments, action, order, or enabled state. Changes affect FUTURE ingestion runs only; already-consumed documents are untouched. Use list_mail_rules to inspect the current rule before changing it.',
			inputSchema: {
				id: z.number().int().min(1).describe(
					'ID of the mail rule to update. Use list_mail_rules to find rule IDs.',
				),

				account: z.number().int().min(1).optional().describe(
					'Mail account ID this rule applies to.',
				),

				name: zPatchedMailRuleRequestWritable.shape.name.describe(
					'New rule name. Must be unique among all mail rules.',
				),

				folder: zPatchedMailRuleRequestWritable.shape.folder.describe(
					"IMAP folder to watch (default INBOX). Subfolders are separated by a delimiter, often '.' or '/', varying by mail server.",
				),

				filter_from: zPatchedMailRuleRequestWritable.shape.filter_from,
				filter_to: zPatchedMailRuleRequestWritable.shape.filter_to,
				filter_subject: zPatchedMailRuleRequestWritable.shape.filter_subject,
				filter_body: zPatchedMailRuleRequestWritable.shape.filter_body,
				filter_attachment_filename_include: zPatchedMailRuleRequestWritable.shape
					.filter_attachment_filename_include,
				filter_attachment_filename_exclude: zPatchedMailRuleRequestWritable.shape
					.filter_attachment_filename_exclude,

				maximum_age: z.number().int().min(0).optional().describe(
					'Only process emails younger than this many days. Explicit 0 disables the age limit.',
				),

				action: zPatchedMailRuleRequestWritable.shape.action.describe(
					'What the mail server does with the email after processing. 1=Delete the email from the mailbox (WARNING: permanent email loss on every poll, no undo; prefer 3 unless you are certain), 2=Move to the folder named in action_parameter, 3=Mark as read (read mails are not processed again), 4=Flag (flagged mails are not processed again), 5=Tag with the keyword in action_parameter (tagged mails are not processed again).',
				),
				action_parameter: z.string().min(1).optional().describe(
					"Parameter for the action, e.g. the target folder for 'move'.",
				),

				consumption_scope: zPatchedMailRuleRequestWritable.shape.consumption_scope,
				attachment_type: zPatchedMailRuleRequestWritable.shape.attachment_type,
				pdf_layout: zPatchedMailRuleRequestWritable.shape.pdf_layout,

				assign_title_from: zPatchedMailRuleRequestWritable.shape.assign_title_from,

				assign_tags: z.array(z.number().int().min(1)).optional().describe(
					'Tag IDs to assign to consumed documents. Replaces the current set.',
				),

				assign_correspondent_from: zPatchedMailRuleRequestWritable.shape.assign_correspondent_from,

				assign_correspondent: z.number().int().min(1).nullable().optional().describe(
					'Correspondent ID to assign when assign_correspondent_from is 4 (use the correspondent selected below). null clears the assignment.',
				),

				assign_document_type: z.number().int().min(1).nullable().optional().describe(
					'Document type ID to assign to consumed documents. null clears the assignment.',
				),

				assign_owner_from_rule: zPatchedMailRuleRequestWritable.shape.assign_owner_from_rule,

				enabled: zPatchedMailRuleRequestWritable.shape.enabled.describe(
					'Whether the rule is active. Set false to pause a rule without deleting it.',
				),

				order: zPatchedMailRuleRequestWritable.shape.order,
				stop_processing: zPatchedMailRuleRequestWritable.shape.stop_processing,
			},
		},
		async ({ id, ...data }, _extra) => {
			return jsonResult(await api.updateMailRule(id, data));
		},
	);

	server.registerTool(
		'delete_mail_rule',
		{
			description:
				'Permanently delete a mail rule. Future mail polls will no longer import emails matched by this rule; already-consumed documents are untouched. Cannot be undone. Consider update_mail_rule with enabled=false to pause a rule instead.',
			inputSchema: {
				id: z.number().int().min(1).describe(
					'ID of the mail rule to permanently delete. Use list_mail_rules to find rule IDs.',
				),
			},
		},
		async ({ id }, _extra) => {
			await api.deleteMailRule(id);
			return jsonResult({ deleted: id });
		},
	);
}
