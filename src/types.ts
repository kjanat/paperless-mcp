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

/**
 * Request body for PATCH /documents/{id}/.
 *
 * Narrowed to the fields `update_document` exposes (title, archive serial
 * number, custom fields). The generated PATCH schema allows more, but
 * per-document mutation stays scoped to what `bulk_edit_documents` cannot do —
 * tags/correspondent/type belong there, where the backend bulk-optimises them.
 */
export type UpdateDocumentRequest = Pick<
	z.infer<typeof schemas.zPatchedDocumentRequestWritable>,
	'title' | 'archive_serial_number' | 'custom_fields'
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

/**
 * Request body for PATCH /correspondents/{id}/.
 *
 * Narrowed to the fields `update_correspondent` exposes (name, matching
 * rules) — permissions belong in `bulk_edit_correspondents`.
 */
export type UpdateCorrespondentRequest = Pick<
	z.infer<typeof schemas.zPatchedCorrespondentRequestWritable>,
	'name' | 'match' | 'matching_algorithm' | 'is_insensitive'
>;

/** Document type as returned by GET /document_types/. */
export type DocumentType = z.infer<typeof schemas.zDocumentType>;

/** Request body for POST /document_types/. */
export type DocumentTypeRequest = z.infer<typeof schemas.zDocumentTypeRequest>;

/**
 * Request body for PATCH /document_types/{id}/.
 *
 * Narrowed to the fields `update_document_type` exposes (name, matching
 * rules) — permissions belong in `bulk_edit_document_types`.
 */
export type UpdateDocumentTypeRequest = Pick<
	z.infer<typeof schemas.zPatchedDocumentTypeRequestWritable>,
	'name' | 'match' | 'matching_algorithm' | 'is_insensitive'
>;

// ---------------------------------------------------------------------------
// Storage Path / Custom Field / Task (derived)
// ---------------------------------------------------------------------------

/** Storage path as returned by GET /storage_paths/. */
export type StoragePath = z.infer<typeof schemas.zStoragePath>;

/**
 * Request body for POST /storage_paths/.
 *
 * Narrowed to the fields `create_storage_path` exposes — permissions belong
 * in bulk edit tooling, owner is implicit (the API token's user).
 */
export type CreateStoragePathRequest = Pick<
	z.infer<typeof schemas.zStoragePathRequestWritable>,
	'name' | 'path' | 'match' | 'matching_algorithm' | 'is_insensitive'
>;

/** Request body for PATCH /storage_paths/{id}/ (same field subset). */
export type UpdateStoragePathRequest = Pick<
	z.infer<typeof schemas.zPatchedStoragePathRequestWritable>,
	'name' | 'path' | 'match' | 'matching_algorithm' | 'is_insensitive'
>;

/** Custom field definition as returned by GET /custom_fields/. */
export type CustomField = z.infer<typeof schemas.zCustomField>;

/** Request body for POST /custom_fields/. */
export type CustomFieldRequest = z.infer<typeof schemas.zCustomFieldRequest>;

/** Request body for PATCH /custom_fields/{id}/. */
export type UpdateCustomFieldRequest = z.infer<typeof schemas.zPatchedCustomFieldRequest>;

/**
 * Consumer/queue task as returned by GET /tasks/.
 *
 * Hand-written divergence: the OpenAPI schema documents the newest API
 * version's `TaskSerializerV10` (lowercase `status`, `related_document_ids`
 * array, paginated list), but with the client's pinned `version=6` Accept
 * header Paperless serves the legacy serializer — uppercase `status`, a
 * singular `related_document` string, and a plain (non-paginated) array.
 */
export interface PaperlessTask {
	readonly id: number;
	readonly task_id: string;
	readonly task_name?: string | null;
	readonly task_file_name?: string | null;
	readonly date_created?: string | null;
	readonly date_done?: string | null;
	readonly type?: string;
	readonly status: 'PENDING' | 'STARTED' | 'SUCCESS' | 'FAILURE' | 'RETRY' | 'REVOKED';
	readonly result?: string | null;
	readonly acknowledged?: boolean;
	readonly related_document?: string | null;
	readonly owner?: number | null;
}

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
