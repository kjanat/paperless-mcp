import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { PaperlessAPI } from '#api/paperless';

/** Variants a document file resource can be read as. */
const VARIANTS = ['archive', 'original', 'thumbnail'] as const;
type Variant = (typeof VARIANTS)[number];

function isVariant(value: string): value is Variant {
	return (VARIANTS as readonly string[]).includes(value);
}

/**
 * Document binaries as MCP resources: `paperless://documents/{id}/{variant}`.
 *
 * Clients fetch the bytes via `resources/read` instead of receiving base64
 * through a tool response, which keeps large files out of the conversation
 * and matches MCP's resource model. The `thumbnail` variant serves the
 * preview image without downloading the full document.
 */
export function registerDocumentResources(server: McpServer, api: PaperlessAPI): void {
	server.registerResource(
		'document-file',
		new ResourceTemplate('paperless://documents/{id}/{variant}', { list: undefined }),
		{
			title: 'Paperless document file',
			description:
				"Document binary by variant: 'archive' (processed/OCR version), 'original' (file as uploaded), or 'thumbnail' (preview image). Example: paperless://documents/123/thumbnail.",
		},
		async (uri, variables) => {
			const id = Number(variables['id']);
			if (!Number.isInteger(id) || id < 1) {
				throw new Error(`Invalid document id in resource URI: ${uri.href}`);
			}
			const variant = String(variables['variant']);
			if (!isVariant(variant)) {
				throw new Error(
					`Unknown variant "${variant}" in ${uri.href}. Use one of: ${VARIANTS.join(', ')}.`,
				);
			}

			const response = variant === 'thumbnail'
				? await api.downloadThumbnail(id)
				: await api.downloadDocument(id, variant === 'original');

			return {
				contents: [{
					uri: uri.href,
					mimeType: response.headers.get('content-type') ?? 'application/octet-stream',
					blob: Buffer.from(await response.arrayBuffer()).toString('base64'),
				}],
			};
		},
	);
}
