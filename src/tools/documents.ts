import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename } from 'node:path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { zMethodEnum, zPatchedDocumentRequestWritable } from '#api/generated/zod.gen';
import type { PaperlessAPI } from '#api/paperless';
import { jsonResult } from '#tools/utils';
import type { PostDocumentMetadata } from '#types';

export interface DocumentToolOptions {
	/**
	 * Whether post_document may read local files via file_path. True on the
	 * stdio transport (single local user); false on HTTP, where any reachable
	 * client could exfiltrate server-readable files into Paperless.
	 */
	readonly allowFilePath: boolean;
}

export function registerDocumentTools(
	server: McpServer,
	api: PaperlessAPI,
	options: DocumentToolOptions,
): void {
	server.registerTool(
		'bulk_edit_documents',
		{
			description:
				'Perform bulk operations on multiple documents simultaneously: set correspondent/type/tags, delete, reprocess, merge, split, rotate, or manage permissions. Efficient for managing large document collections.',
			inputSchema: {
				documents: z.array(z.number().int().min(1)).describe(
					'Array of document IDs to perform bulk operations on. Get document IDs from search_documents first.',
				),

				method: zMethodEnum.describe(
					'The bulk operation to perform.',
				),

				correspondent: z.number().int().min(1).optional().describe(
					"ID of correspondent to assign when method is 'set_correspondent'. Use list_correspondents to get valid IDs.",
				),

				document_type: z.number().int().min(1).optional().describe(
					"ID of document type to assign when method is 'set_document_type'. Use list_document_types to get valid IDs.",
				),

				storage_path: z.number().int().min(1).optional().describe(
					"ID of storage path to assign when method is 'set_storage_path'. Storage paths organize documents in folder hierarchies.",
				),

				tag: z.number().int().min(1).optional().describe(
					"Single tag ID to add or remove when method is 'add_tag' or 'remove_tag'. Use list_tags to get valid IDs.",
				),

				add_tags: z.array(z.number().int().min(1)).optional().describe(
					"Array of tag IDs to add when method is 'modify_tags'. Use list_tags to get valid IDs.",
				),

				remove_tags: z.array(z.number().int().min(1)).optional().describe(
					"Array of tag IDs to remove when method is 'modify_tags'. Use list_tags to get valid IDs.",
				),

				add_custom_fields: z
					.union([z.array(z.number().int().min(1)), z.record(z.string(), z.unknown())])
					.optional().describe(
						"Custom field IDs or id:value pairs to add when method is 'modify_custom_fields'.",
					),

				remove_custom_fields: z.array(z.number().int().min(1)).optional().describe(
					"Custom field IDs to remove when method is 'modify_custom_fields'.",
				),

				permissions: z
					.object({
						owner: z.number().int().min(1).nullable().optional().describe(
							'User ID to set as document owner, or null to remove ownership',
						),

						set_permissions: z
							.object({
								view: z.object({
									users: z.array(z.number().int().min(1)).describe('User IDs granted view permission'),
									groups: z.array(z.number().int().min(1)).describe('Group IDs granted view permission'),
								}).describe('Users and groups who can view these documents'),

								change: z.object({
									users: z.array(z.number().int().min(1)).describe('User IDs granted edit permission'),
									groups: z.array(z.number().int().min(1)).describe('Group IDs granted edit permission'),
								}).describe('Users and groups who can edit these documents'),
							})
							.optional().describe('Specific permission settings for users and groups'),

						merge: z.boolean().optional().describe(
							'Whether to merge with existing permissions (true) or replace them (false)',
						),
					})
					.optional().describe(
						"Permission settings when method is 'set_permissions'. Controls who can view and edit the documents.",
					),

				metadata_document_id: z.number().int().min(1).optional().describe(
					'Source document ID when merging documents. The metadata from this document will be preserved.',
				),

				delete_originals: z.boolean().optional().describe(
					'Whether to delete original documents after merge/split operations. Use with caution.',
				),

				pages: z
					.union([z.string(), z.array(z.number().int().min(1))])
					.optional().describe(
						"Page specification. For split, use a string like '1-2,3-4,5'. For delete_pages, use a number array like [1, 3, 5].",
					),

				degrees: z.number().optional().describe(
					"Rotation angle in degrees when method is 'rotate'. Use 90, 180, or 270 for standard rotations.",
				),

				operations: z
					.array(z.object({
						page: z.number().int().min(1),
						rotate: z.number().optional(),
						doc: z.number().int().min(0).optional(),
					}))
					.optional().describe(
						"PDF edit operations when method is 'edit_pdf'. Each operation needs a source page and may include rotate/doc.",
					),

				password: z.string().optional().describe(
					"Password to remove when method is 'remove_password'.",
				),

				update_document: z.boolean().optional().describe(
					'Whether edit_pdf/remove_password should update the existing document instead of creating a new one.',
				),

				delete_original: z.boolean().optional().describe(
					'Whether edit_pdf/remove_password should delete the original after creating the replacement.',
				),

				include_metadata: z.boolean().optional().describe(
					'Whether edit_pdf/remove_password should carry existing metadata to the new document. Default true.',
				),
			},
		},
		async ({ documents, method, ...parameters }, _extra) => {
			return jsonResult(
				await api.bulkEditDocuments(
					documents,
					method,
					documentBulkParameters(method, parameters),
				),
			);
		},
	);

	server.registerTool(
		'post_document',
		{
			description:
				'Upload a new document to Paperless-ngx with metadata. Supports PDF, images (PNG/JPG/TIFF), and text files. Automatically processes for OCR and indexing. Provide the file either as a local path (file_path — preferred, the server reads it directly so size does not matter) or as inline base64 (file).',
			inputSchema: {
				file_path: z.string().optional().describe(
					"Path to the file on the machine running this MCP server (with stdio transport: the local machine). Preferred for real files: the server reads it directly, so large PDFs never pass through the model. Supports a leading '~'. Only available on the stdio transport; the HTTP transport rejects it. Provide either this or file, not both.",
				),

				file: z.string().optional().describe(
					'Base64 encoded file content. Only practical for small files — inline content passes through the model. Prefer file_path for anything real. Provide either this or file_path, not both.',
				),

				filename: z.string().optional().describe(
					"Original filename with extension (e.g., 'invoice.pdf', 'receipt.png'). This helps Paperless determine file type and initial document title. Required with file; defaults to the basename of file_path otherwise.",
				),

				title: z.string().optional().describe(
					'Custom document title. If not provided, Paperless will extract title from filename or document content.',
				),

				created: z.string().optional().describe(
					'Document creation date in ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss). If not provided, uses current date.',
				),

				correspondent: z.number().int().min(1).optional().describe(
					'ID of the correspondent (sender/receiver) for this document. Use list_correspondents to find or create_correspondent to add new ones.',
				),

				document_type: z.number().int().min(1).optional().describe(
					'ID of document type for categorization (e.g., Invoice, Receipt, Letter). Use list_document_types to find or create_document_type to add new ones.',
				),

				storage_path: z.number().int().min(1).optional().describe(
					'ID of storage path to organize document location in folder hierarchy. Leave empty for default storage.',
				),

				tags: z.array(z.number().int().min(1)).optional().describe(
					'Array of tag IDs to label this document. Use list_tags to find existing tags or create_tag to add new ones.',
				),

				archive_serial_number: z.number().int().min(0).optional().describe(
					'Archive serial number for document organization and reference. Useful for maintaining external filing systems.',
				),

				custom_fields: z.array(z.number().int().min(1)).optional().describe(
					'Array of custom field IDs to associate with this document. Custom fields store additional metadata.',
				),
			},
		},
		async (args, _extra) => {
			if (args.file_path != null && !options.allowFilePath) {
				throw new Error(
					"'file_path' is not available on the HTTP transport (the path would resolve on the server host, letting any client upload server-readable files). Use inline base64 'file' + 'filename', or run the stdio transport.",
				);
			}
			if (args.file_path != null && args.file != null) {
				throw new Error("Provide either 'file_path' or 'file' (base64), not both.");
			}

			let binaryData: Buffer;
			let name: string;
			if (args.file_path != null) {
				const path = args.file_path === '~' || args.file_path.startsWith('~/')
					? `${homedir()}${args.file_path.slice(1)}`
					: args.file_path;
				binaryData = await readFile(path);
				name = args.filename ?? basename(path);
			} else if (args.file != null) {
				if (args.filename == null) {
					throw new Error("'filename' is required when uploading inline base64 'file' content.");
				}
				binaryData = Buffer.from(args.file, 'base64');
				name = args.filename;
			} else {
				throw new Error("Provide 'file_path' (preferred) or 'file' (base64).");
			}

			const blob = new Blob([binaryData]);
			const file = new File([blob], name);
			const metadata: PostDocumentMetadata = {
				title: args.title,
				created: args.created,
				correspondent: args.correspondent,
				document_type: args.document_type,
				storage_path: args.storage_path,
				tags: args.tags,
				archive_serial_number: args.archive_serial_number,
				custom_fields: args.custom_fields,
			};
			return jsonResult(await api.postDocument(file, metadata));
		},
	);

	server.registerTool(
		'get_document',
		{
			description:
				'Get complete details for a specific document including full metadata, content preview, tags, correspondent, and document type information.',
			inputSchema: {
				id: z.number().int().min(1).describe(
					'Unique document ID. Get this from search_documents results. Returns full document metadata, content preview, and associated tags/correspondent/type.',
				),
			},
		},
		async ({ id }, _extra) => {
			return jsonResult(await api.getDocument(id));
		},
	);

	server.registerTool(
		'update_document',
		{
			description:
				'Update metadata on a single document: rename its title, set or clear its archive serial number, set custom field values, or add a note. Use bulk_edit_documents instead for tags, correspondent, or document type — those operations are bulk-optimised on the backend.',
			inputSchema: {
				id: z.number().int().min(1).describe(
					'Document ID to update. Get this from search_documents or get_document results.',
				),

				title: zPatchedDocumentRequestWritable.shape.title.describe(
					"New document title (max 128 characters). Useful for renaming consumer-generated titles like 'doc20260609123253' after classification.",
				),

				archive_serial_number: zPatchedDocumentRequestWritable.shape.archive_serial_number.describe(
					'Archive serial number for external filing reference, or null to clear it.',
				),

				custom_fields: zPatchedDocumentRequestWritable.shape.custom_fields.describe(
					'Custom field instances to set as {field, value} pairs. Replaces the full set of custom fields on the document.',
				),

				note: z.string().min(1).optional().describe(
					'Note text to add to the document. Appends a new note; existing notes are kept.',
				),
			},
		},
		async ({ id, note, ...data }, _extra) => {
			// Notes live on a separate endpoint — add first so the document
			// returned below already includes the new note.
			if (note !== undefined) {
				await api.addDocumentNote(id, note);
			}
			if (Object.keys(data).length > 0) {
				return jsonResult(await api.updateDocument(id, data));
			}
			return jsonResult(await api.getDocument(id));
		},
	);

	server.registerTool(
		'delete_document_note',
		{
			description:
				'Delete a note from a document. Get note IDs from the notes array on get_document or update_document results. Returns the remaining notes.',
			inputSchema: {
				id: z.number().int().min(1).describe('Document ID the note belongs to.'),

				note_id: z.number().int().min(1).describe(
					"ID of the note to delete, from the document's notes array.",
				),
			},
		},
		async ({ id, note_id }, _extra) => {
			return jsonResult(await api.deleteDocumentNote(id, note_id));
		},
	);

	server.registerTool(
		'search_documents',
		{
			description:
				'Search through documents using full-text search across content, titles, tags, and metadata. Returns document metadata WITHOUT the full OCR content field to prevent token overflow. Use get_document to retrieve full details for specific documents of interest. Supports Paperless-ngx advanced query syntax.',
			inputSchema: {
				query: z.string().describe(
					"Search query using Paperless-ngx syntax. By default, matches documents containing ALL words. Advanced syntax: Field searches: 'tag:unpaid', 'type:invoice', 'correspondent:university'. Logical operators: 'term1 AND (term2 OR term3)'. Date ranges: 'created:[2020 to 2024]', 'added:yesterday', 'modified:today'. Wildcards: 'prod*name'. Combine multiple criteria as needed. Search looks through document content, title, correspondent, type, and tags.",
				),

				page: z.number().int().min(1).optional().describe(
					'Page number for pagination (starts at 1). Use to browse through large result sets without hitting token limits.',
				),

				page_size: z.number().int().min(1).optional().describe(
					'Number of documents per page (default 25, max 100). Smaller page sizes help avoid token limits when many documents match.',
				),
			},
		},
		async ({ query, page, page_size }, _extra) => {
			return jsonResult(await api.searchDocuments(query, page, page_size));
		},
	);

	server.registerTool(
		'download_document',
		{
			description:
				'Download a document file as base64-encoded data. Choose between original uploaded file or processed/archived version with OCR improvements.',
			inputSchema: {
				id: z.number().int().min(1).describe(
					'Document ID to download. Get this from search_documents or get_document results.',
				),

				original: z.boolean().optional().describe(
					'Whether to download the original uploaded file (true) or the processed/archived version (false, default). Original files preserve exact formatting but may not include OCR improvements.',
				),
			},
		},
		async ({ id, original }, _extra) => {
			const response = await api.downloadDocument(id, original);
			const filename = response.headers
				.get('content-disposition')
				?.split('filename=')[1]
				?.replace(/"/g, '') ?? `document-${id}`;
			return jsonResult({
				blob: Buffer.from(await response.arrayBuffer()).toString('base64'),
				filename,
			});
		},
	);
}

function documentBulkParameters(
	method: string,
	parameters: Record<string, unknown>,
): Record<string, unknown> {
	switch (method) {
		case 'set_correspondent':
			return pickDefined(parameters, ['correspondent']);
		case 'set_document_type':
			return pickDefined(parameters, ['document_type']);
		case 'set_storage_path':
			return pickDefined(parameters, ['storage_path']);
		case 'add_tag':
		case 'remove_tag':
			return pickDefined(parameters, ['tag']);
		case 'modify_tags':
			return pickDefined(parameters, ['add_tags', 'remove_tags']);
		case 'modify_custom_fields':
			return pickDefined(parameters, ['add_custom_fields', 'remove_custom_fields']);
		case 'set_permissions':
			return pickDefined(parameters, ['permissions']);
		case 'merge':
			return pickDefined(parameters, ['metadata_document_id', 'delete_originals']);
		case 'split':
			return pickDefined(parameters, ['pages', 'delete_originals']);
		case 'rotate':
			return pickDefined(parameters, ['degrees']);
		case 'delete_pages':
			return pickDefined(parameters, ['pages']);
		case 'edit_pdf':
			return pickDefined(parameters, [
				'operations',
				'update_document',
				'delete_original',
				'include_metadata',
			]);
		case 'remove_password':
			return pickDefined(parameters, [
				'password',
				'update_document',
				'delete_original',
				'include_metadata',
			]);
		default:
			return {};
	}
}

function pickDefined(
	parameters: Record<string, unknown>,
	keys: readonly string[],
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const key of keys) {
		const value = parameters[key];
		if (value !== undefined) {
			result[key] = value;
		}
	}
	return result;
}
