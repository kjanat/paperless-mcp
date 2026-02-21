/** Metadata for document upload via FormData. */
export interface PostDocumentMetadata {
	readonly title?: string;
	readonly created?: string;
	readonly correspondent?: number;
	readonly document_type?: number;
	readonly storage_path?: number;
	readonly tags?: readonly number[];
	readonly archive_serial_number?: string;
	readonly custom_fields?: readonly number[];
}

/** Minimal shape of Paperless-NGX paginated search response. */
interface SearchResponse {
	readonly count: number;
	readonly next: string | null;
	readonly previous: string | null;
	results: Record<string, unknown>[];
}

export class PaperlessAPI {
	constructor(
		private readonly baseUrl: string,
		private readonly token: string,
	) {}

	async request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
		const url = `${this.baseUrl}/api${path}`;
		const headers = {
			Authorization: `Token ${this.token}`,
			Accept: 'application/json; version=5',
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
		documents: number[],
		method: string,
		parameters: Record<string, unknown> = {},
	): Promise<unknown> {
		return this.request('/documents/bulk_edit/', {
			method: 'POST',
			body: JSON.stringify({ documents, method, parameters }),
		});
	}

	async postDocument(
		file: File,
		metadata: PostDocumentMetadata = {},
	): Promise<unknown> {
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
			formData.append('archive_serial_number', metadata.archive_serial_number);
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
				headers: { Authorization: `Token ${this.token}` },
				body: formData,
			},
		);

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		return response.json() as Promise<unknown>;
	}

	async getDocuments(query = ''): Promise<unknown> {
		return this.request(`/documents/${query}`);
	}

	async getDocument(id: number): Promise<unknown> {
		return this.request(`/documents/${id}/`);
	}

	async searchDocuments(
		query: string,
		page?: number,
		pageSize?: number,
	): Promise<SearchResponse> {
		const params = new URLSearchParams();
		params.set('query', query);
		if (page != null) params.set('page', page.toString());
		if (pageSize != null) params.set('page_size', pageSize.toString());

		const response = await this.request<SearchResponse>(
			`/documents/?${params.toString()}`,
		);

		// Strip content/URLs to reduce token usage
		response.results = response.results.map((doc) => {
			const { content: _, download_url: _d, thumbnail_url: _t, ...rest } = doc;
			return rest;
		});

		return response;
	}

	async downloadDocument(id: number, asOriginal = false): Promise<Response> {
		const query = asOriginal ? '?original=true' : '';
		return fetch(
			`${this.baseUrl}/api/documents/${id}/download/${query}`,
			{ headers: { Authorization: `Token ${this.token}` } },
		);
	}

	// Tag operations
	async getTags(): Promise<unknown> {
		return this.request('/tags/');
	}

	async createTag(data: Record<string, unknown>): Promise<unknown> {
		return this.request('/tags/', {
			method: 'POST',
			body: JSON.stringify(data),
		});
	}

	async updateTag(id: number, data: Record<string, unknown>): Promise<unknown> {
		return this.request(`/tags/${id}/`, {
			method: 'PUT',
			body: JSON.stringify(data),
		});
	}

	async deleteTag(id: number): Promise<unknown> {
		return this.request(`/tags/${id}/`, { method: 'DELETE' });
	}

	// Correspondent operations
	async getCorrespondents(): Promise<unknown> {
		return this.request('/correspondents/');
	}

	async createCorrespondent(data: Record<string, unknown>): Promise<unknown> {
		return this.request('/correspondents/', {
			method: 'POST',
			body: JSON.stringify(data),
		});
	}

	// Document type operations
	async getDocumentTypes(): Promise<unknown> {
		return this.request('/document_types/');
	}

	async createDocumentType(data: Record<string, unknown>): Promise<unknown> {
		return this.request('/document_types/', {
			method: 'POST',
			body: JSON.stringify(data),
		});
	}

	// Bulk object operations
	async bulkEditObjects(
		objects: number[],
		objectType: string,
		operation: string,
		parameters: Record<string, unknown> = {},
	): Promise<unknown> {
		return this.request('/bulk_edit_objects/', {
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
