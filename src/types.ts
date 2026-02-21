/**
 * Typed interfaces derived from the Paperless-ngx OpenAPI schema (v6.0.0).
 * Source: schemas/openapi.json
 *
 * Only models types actually used by our API client and MCP tools.
 */

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

/**
 * Matching algorithm for automatic assignment.
 * 0=None, 1=Any word, 2=All words, 3=Exact match, 4=Regular expression,
 * 5=Fuzzy word, 6=Automatic.
 *
 * Using `number` (not a literal union) because Zod's `z.number()` outputs
 * `number` and narrowing to a literal union at the Zod boundary would require
 * unsafe casts. Runtime validation (min/max) is sufficient.
 */
export type MatchingAlgorithm = number;

/** Bulk edit methods for documents. */
export type BulkEditMethod =
	| 'set_correspondent'
	| 'set_document_type'
	| 'set_storage_path'
	| 'add_tag'
	| 'remove_tag'
	| 'modify_tags'
	| 'modify_custom_fields'
	| 'delete'
	| 'reprocess'
	| 'set_permissions'
	| 'rotate'
	| 'merge'
	| 'split'
	| 'delete_pages'
	| 'edit_pdf'
	| 'remove_password';

/** Object types for bulk_edit_objects. */
export type BulkEditObjectType = 'tags' | 'correspondents' | 'document_types' | 'storage_paths';

/** Operations for bulk_edit_objects. */
export type BulkEditOperation = 'set_permissions' | 'delete';

// ---------------------------------------------------------------------------
// Shared nested types
// ---------------------------------------------------------------------------

/** Permission set for view/change on objects. */
export interface ObjectPermissions {
	readonly view: {
		readonly users: readonly number[];
		readonly groups: readonly number[];
	};
	readonly change: {
		readonly users: readonly number[];
		readonly groups: readonly number[];
	};
}

/** Custom field instance attached to a document. */
export interface CustomFieldInstance {
	readonly field: number;
	readonly value: string | number | boolean | Record<string, unknown> | null;
}

/** Note attached to a document. */
export interface Note {
	readonly id: number;
	readonly note: string;
	readonly created: string;
	readonly user: {
		readonly id: number;
		readonly username: string;
		readonly first_name: string;
		readonly last_name: string;
	};
}

/** Summary of a duplicate document. */
export interface DuplicateDocumentSummary {
	readonly id: number;
	readonly title: string;
	readonly deleted_at: string | null;
}

// ---------------------------------------------------------------------------
// Paginated list (generic shape)
// ---------------------------------------------------------------------------

/** Paginated response from Paperless-ngx list endpoints. */
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
export interface Document {
	readonly id: number;
	readonly title: string;
	readonly content: string;
	readonly tags: readonly number[];
	readonly correspondent: number | null;
	readonly document_type: number | null;
	readonly storage_path: number | null;
	readonly created: string;
	readonly created_date: string;
	readonly modified: string;
	readonly added: string;
	readonly deleted_at: string | null;
	readonly archive_serial_number: number | null;
	readonly original_file_name: string | null;
	readonly archived_file_name: string | null;
	readonly owner: number | null;
	readonly mime_type: string;
	readonly page_count: number | null;
	readonly is_shared_by_requester: boolean;
	readonly user_can_change: boolean;
	readonly custom_fields: readonly CustomFieldInstance[];
	readonly notes: readonly Note[];
	readonly duplicate_documents: readonly DuplicateDocumentSummary[];
	readonly permissions: ObjectPermissions;
}

/** Search result item — Document without heavy fields (content, URLs). */
export type DocumentSummary = Omit<Document, 'content'> & {
	readonly content?: never;
};

/** Paginated document list from GET /documents/ or search. */
export interface PaginatedDocumentList {
	readonly count: number;
	readonly next: string | null;
	readonly previous: string | null;
	readonly all?: readonly number[];
	/**
	 * Intentionally `Record<string, unknown>[]` rather than `Document[]` or
	 * `DocumentSummary[]` because `searchDocuments` dynamically strips fields
	 * (content, download_url, thumbnail_url), producing objects that don't
	 * conform to either typed interface.
	 */
	readonly results: readonly Record<string, unknown>[];
}

/** Metadata for document upload via FormData. */
export interface PostDocumentMetadata {
	readonly title?: string;
	readonly created?: string;
	readonly correspondent?: number;
	readonly document_type?: number;
	readonly storage_path?: number;
	readonly tags?: readonly number[];
	readonly archive_serial_number?: number;
	readonly custom_fields?: readonly number[];
}

// ---------------------------------------------------------------------------
// Tag
// ---------------------------------------------------------------------------

/** Tag as returned by GET /tags/ or GET /tags/{id}/. */
export interface Tag {
	readonly id: number;
	readonly name: string;
	readonly slug: string;
	readonly color: string;
	readonly text_color: string;
	readonly match: string;
	readonly matching_algorithm: MatchingAlgorithm;
	readonly is_insensitive: boolean;
	readonly is_inbox_tag: boolean;
	readonly document_count: number;
	readonly owner: number | null;
	readonly parent: number | null;
	readonly children: readonly number[];
	readonly user_can_change: boolean;
}

/** Request body for POST /tags/ or PUT /tags/{id}/. */
export interface TagRequest {
	readonly name: string;
	readonly color?: string;
	readonly match?: string;
	readonly matching_algorithm?: MatchingAlgorithm;
	readonly is_insensitive?: boolean;
	readonly is_inbox_tag?: boolean;
	readonly owner?: number | null;
	readonly parent?: number | null;
}

// ---------------------------------------------------------------------------
// Correspondent
// ---------------------------------------------------------------------------

/** Correspondent as returned by GET /correspondents/. */
export interface Correspondent {
	readonly id: number;
	readonly name: string;
	readonly slug: string;
	readonly match: string;
	readonly matching_algorithm: MatchingAlgorithm;
	readonly is_insensitive: boolean;
	readonly document_count: number;
	readonly last_correspondence: string;
	readonly owner: number | null;
	readonly user_can_change: boolean;
	readonly permissions: ObjectPermissions;
}

/** Request body for POST /correspondents/. */
export interface CorrespondentRequest {
	readonly name: string;
	readonly match?: string;
	readonly matching_algorithm?: MatchingAlgorithm;
	readonly is_insensitive?: boolean;
	readonly owner?: number | null;
}

// ---------------------------------------------------------------------------
// Document Type
// ---------------------------------------------------------------------------

/** Document type as returned by GET /document_types/. */
export interface DocumentType {
	readonly id: number;
	readonly name: string;
	readonly slug: string;
	readonly match: string;
	readonly matching_algorithm: MatchingAlgorithm;
	readonly is_insensitive: boolean;
	readonly document_count: number;
	readonly owner: number | null;
	readonly user_can_change: boolean;
	readonly permissions: ObjectPermissions;
}

/** Request body for POST /document_types/. */
export interface DocumentTypeRequest {
	readonly name: string;
	readonly match?: string;
	readonly matching_algorithm?: MatchingAlgorithm;
	readonly is_insensitive?: boolean;
	readonly owner?: number | null;
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

/** Request body for POST /documents/bulk_edit/. */
export interface BulkEditDocumentsRequest {
	readonly documents: readonly number[];
	readonly method: BulkEditMethod;
	readonly parameters: Record<string, unknown>;
}

/** Response from POST /documents/bulk_edit/. */
export interface BulkEditResult {
	readonly result: string;
}

/** Request body for POST /bulk_edit_objects/. */
export interface BulkEditObjectsRequest {
	readonly objects: readonly number[];
	readonly object_type: BulkEditObjectType;
	readonly operation: BulkEditOperation;
	readonly owner?: number | null;
	readonly permissions?: Record<string, unknown>;
	readonly merge?: boolean;
}
