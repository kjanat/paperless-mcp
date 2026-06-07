/**
 * API model types for paperless-mcp.
 *
 * The structural shapes are **derived** from the generated Zod schemas in
 * `src/api/generated/zod.gen.ts` — the single source of truth, regenerated
 * from the Paperless-ngx OpenAPI schema (`schemas/openapi.json` → subset →
 * Zod) via `bun run gen`. Deriving via `z.infer` means model fields can never
 * silently drift from the upstream schema when Paperless adds/renames/removes
 * a field.
 *
 * This file adds only the deliberate, documented divergences the client and
 * tooling rely on (see each section). Everything else is generated.
 */

import * as schemas from '#api/generated/zod.gen';
import type { z } from 'zod';

/** Replace the keys of `T` present in `O` with the variants declared in `O`. */
type Override<T, O> = Omit<T, keyof O> & O;

// ---------------------------------------------------------------------------
// Shared enums (derived)
// ---------------------------------------------------------------------------

/**
 * Matching algorithm for automatic assignment.
 * 0=None, 1=Any word, 2=All words, 3=Exact match, 4=Regular expression,
 * 5=Fuzzy word, 6=Automatic.
 *
 * Single source: the generated `zMatchingAlgorithm` union. The MCP tool inputs
 * validate against that same schema, so no override or cast is needed anywhere.
 */
export type MatchingAlgorithm = z.infer<typeof schemas.zMatchingAlgorithm>;

/** Bulk edit methods for documents. */
export type BulkEditMethod = z.infer<typeof schemas.zMethodEnum>;

/** Object types for bulk_edit_objects. */
export type BulkEditObjectType = z.infer<typeof schemas.zObjectTypeEnum>;

/** Operations for bulk_edit_objects. */
export type BulkEditOperation = z.infer<typeof schemas.zOperationEnum>;

// ---------------------------------------------------------------------------
// Shared nested types (derived)
// ---------------------------------------------------------------------------

/** Custom field instance attached to a document. */
export type CustomFieldInstance = z.infer<typeof schemas.zCustomFieldInstance>;

/** Note attached to a document. */
export type Note = z.infer<typeof schemas.zNotes>;

/** Summary of a duplicate document. */
export type DuplicateDocumentSummary = z.infer<typeof schemas.zDuplicateDocumentSummary>;

/** Permission set for view/change on objects. */
export type ObjectPermissions = z.infer<typeof schemas.zDocument>['permissions'];

// ---------------------------------------------------------------------------
// Paginated list (generic shape — hand-written)
// ---------------------------------------------------------------------------

/**
 * Generic paginated response from Paperless-ngx list endpoints.
 *
 * Hand-written: the generated schemas only describe concrete, per-resource
 * paginated lists (`PaginatedDocumentList`, …). This generic is the shape the
 * client uses across every resource and never drifts (it is structural).
 */
export interface PaginatedList<T> {
	readonly count: number;
	readonly next: string | null;
	readonly previous: string | null;
	readonly all: readonly number[];
	readonly results: readonly T[];
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

/** Full document as returned by GET /documents/{id}/. */
export type Document = z.infer<typeof schemas.zDocument>;

/** Search result item — Document without heavy fields (content, URLs). */
export type DocumentSummary = Omit<Document, 'content'> & {
	readonly content?: never;
};

/**
 * Paginated document list from GET /documents/ or search.
 *
 * Divergence: `results` is `Record<string, unknown>[]`, not `Document[]`,
 * because `searchDocuments` dynamically strips fields (content, download_url,
 * thumbnail_url), producing objects that conform to neither typed interface.
 * Everything else is inferred.
 */
export type PaginatedDocumentList = Override<
	z.infer<typeof schemas.zPaginatedDocumentList>,
	{ results: readonly Record<string, unknown>[] }
>;

/**
 * Metadata for document upload via FormData.
 *
 * Derived from the multipart upload schema, minus the `document` file field and
 * `from_webui` flag the client never sends. `custom_fields` is narrowed to an
 * ID array (the generated schema types it as `unknown`).
 */
export type PostDocumentMetadata = Override<
	Omit<z.infer<typeof schemas.zPostDocumentRequest>, 'document' | 'from_webui' | 'custom_fields'>,
	{ custom_fields?: readonly number[] }
>;

// ---------------------------------------------------------------------------
// Tag / Correspondent / Document Type (derived, no divergences)
// ---------------------------------------------------------------------------

/** Tag as returned by GET /tags/ or GET /tags/{id}/. */
export type Tag = z.infer<typeof schemas.zTag>;

/** Request body for POST /tags/ or PUT /tags/{id}/. */
export type TagRequest = z.infer<typeof schemas.zTagRequest>;

/** Correspondent as returned by GET /correspondents/. */
export type Correspondent = z.infer<typeof schemas.zCorrespondent>;

/** Request body for POST /correspondents/. */
export type CorrespondentRequest = z.infer<typeof schemas.zCorrespondentRequest>;

/** Document type as returned by GET /document_types/. */
export type DocumentType = z.infer<typeof schemas.zDocumentType>;

/** Request body for POST /document_types/. */
export type DocumentTypeRequest = z.infer<typeof schemas.zDocumentTypeRequest>;

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

/** Request body for POST /documents/bulk_edit/ (nested `parameters` shape). */
export type BulkEditDocumentsRequest = z.infer<typeof schemas.zBulkEditRequest>;

/** Response from POST /documents/bulk_edit/. */
export type BulkEditResult = z.infer<typeof schemas.zBulkEditResult>;

/**
 * Request body for POST /bulk_edit_objects/.
 *
 * Hand-written: the client spreads method parameters at the top level, so this
 * stays a curated client-facing shape rather than the generated schema.
 */
export interface BulkEditObjectsRequest {
	readonly objects: readonly number[];
	readonly object_type: BulkEditObjectType;
	readonly operation: BulkEditOperation;
	readonly owner?: number | null;
	readonly permissions?: Record<string, unknown>;
	readonly merge?: boolean;
}
