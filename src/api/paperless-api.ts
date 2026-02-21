import type {
	BulkEditMethod,
	BulkEditObjectType,
	BulkEditOperation,
	BulkEditResult,
	Correspondent,
	CorrespondentRequest,
	Document,
	DocumentType,
	DocumentTypeRequest,
	PaginatedDocumentList,
	PaginatedList,
	PostDocumentMetadata,
	Tag,
	TagRequest,
} from '../types';

export class PaperlessAPI {
	constructor(
		private readonly baseUrl: string,
		private readonly token: string,
	) {}

	async request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
		const url = `${this.baseUrl}/api${path}`;
		const headers = {
			Authorization: `Token ${this.token}`,
			Accept: 'application/json; version=6',
			'Content-Type': 'application/json',
			'Accept-Language': 'en-US,en;q=0.9',
		};

		const response = await fetch(url, {
			...options,
			headers: {
				...headers,
				...options.headers,
			},
		});

		if (!response.ok) {
			const body: unknown = await response.json().catch(() => null);
			throw new Error(
				`HTTP ${response.status} from ${path}: ${JSON.stringify(body)}`,
			);
		}

		return response.json() as Promise<T>;
	}

	// Document operations

	async bulkEditDocuments(
		documents: readonly number[],
		method: BulkEditMethod,
		parameters: Record<string, unknown> = {},
	): Promise<BulkEditResult> {
		return this.request<BulkEditResult>('/documents/bulk_edit/', {
			method: 'POST',
			body: JSON.stringify({ documents, method, parameters }),
		});
	}

	async postDocument(
		file: File,
		metadata: PostDocumentMetadata = {},
	): Promise<string> {
		const formData = new FormData();
		formData.append('document', file);

		if (metadata.title != null) {
			formData.append('title', metadata.title);
		}
		if (metadata.created != null) {
			formData.append('created', metadata.created);
		}
		if (metadata.correspondent != null) {
			formData.append('correspondent', String(metadata.correspondent));
		}
		if (metadata.document_type != null) {
			formData.append('document_type', String(metadata.document_type));
		}
		if (metadata.storage_path != null) {
			formData.append('storage_path', String(metadata.storage_path));
		}
		if (metadata.tags != null) {
			for (const tag of metadata.tags) {
				formData.append('tags', String(tag));
			}
		}
		if (metadata.archive_serial_number != null) {
			formData.append('archive_serial_number', String(metadata.archive_serial_number));
		}
		if (metadata.custom_fields != null) {
			for (const field of metadata.custom_fields) {
				formData.append('custom_fields', String(field));
			}
		}

		const response = await fetch(
			`${this.baseUrl}/api/documents/post_document/`,
			{
				method: 'POST',
				headers: {
					Authorization: `Token ${this.token}`,
					Accept: 'application/json; version=6',
				},
				body: formData,
			},
		);

		if (!response.ok) {
			const body: unknown = await response.json().catch(() => null);
			throw new Error(
				`HTTP ${response.status} from /documents/post_document/: ${JSON.stringify(body)}`,
			);
		}

		// Returns a task ID string
		return response.json() as Promise<string>;
	}

	async getDocuments(query = ''): Promise<PaginatedList<Document>> {
		return this.request<PaginatedList<Document>>(`/documents/${query}`);
	}

	async getDocument(id: number): Promise<Document> {
		return this.request<Document>(`/documents/${id}/`);
	}

	async searchDocuments(
		query: string,
		page?: number,
		pageSize?: number,
	): Promise<PaginatedDocumentList> {
		const params = new URLSearchParams();
		params.set('query', query);
		if (page != null) params.set('page', page.toString());
		if (pageSize != null) params.set('page_size', pageSize.toString());

		const response = await this.request<PaginatedDocumentList>(
			`/documents/?${params.toString()}`,
		);

		// Strip content/URLs to reduce token usage — return new object, don't mutate
		return {
			...response,
			results: response.results.map((doc) => {
				const { content: _, download_url: _d, thumbnail_url: _t, ...rest } = doc;
				return rest;
			}),
		};
	}

	async downloadDocument(id: number, asOriginal = false): Promise<Response> {
		const query = asOriginal ? '?original=true' : '';
		return fetch(
			`${this.baseUrl}/api/documents/${id}/download/${query}`,
			{
				headers: {
					Authorization: `Token ${this.token}`,
					Accept: 'application/json; version=6',
				},
			},
		);
	}

	// Tag operations

	async getTags(): Promise<PaginatedList<Tag>> {
		return this.request<PaginatedList<Tag>>('/tags/');
	}

	async createTag(data: TagRequest): Promise<Tag> {
		return this.request<Tag>('/tags/', {
			method: 'POST',
			body: JSON.stringify(data),
		});
	}

	async updateTag(id: number, data: Partial<TagRequest>): Promise<Tag> {
		return this.request<Tag>(`/tags/${id}/`, {
			method: 'PATCH',
			body: JSON.stringify(data),
		});
	}

	async deleteTag(id: number): Promise<void> {
		await this.request(`/tags/${id}/`, { method: 'DELETE' });
	}

	// Correspondent operations

	async getCorrespondents(): Promise<PaginatedList<Correspondent>> {
		return this.request<PaginatedList<Correspondent>>('/correspondents/');
	}

	async createCorrespondent(data: CorrespondentRequest): Promise<Correspondent> {
		return this.request<Correspondent>('/correspondents/', {
			method: 'POST',
			body: JSON.stringify(data),
		});
	}

	// Document type operations

	async getDocumentTypes(): Promise<PaginatedList<DocumentType>> {
		return this.request<PaginatedList<DocumentType>>('/document_types/');
	}

	async createDocumentType(data: DocumentTypeRequest): Promise<DocumentType> {
		return this.request<DocumentType>('/document_types/', {
			method: 'POST',
			body: JSON.stringify(data),
		});
	}

	// Bulk object operations

	async bulkEditObjects(
		objects: readonly number[],
		objectType: BulkEditObjectType,
		operation: BulkEditOperation,
		parameters: Record<string, unknown> = {},
	): Promise<BulkEditResult> {
		return this.request<BulkEditResult>('/bulk_edit_objects/', {
			method: 'POST',
			body: JSON.stringify({
				objects,
				object_type: objectType,
				operation,
				...parameters,
			}),
		});
	}
}
