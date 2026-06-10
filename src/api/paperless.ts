import type {
	BulkEditMethod,
	BulkEditObjectType,
	BulkEditOperation,
	BulkEditResult,
	Correspondent,
	CorrespondentRequest,
	CreateMailRuleRequest,
	CreateStoragePathRequest,
	CustomField,
	CustomFieldRequest,
	Document,
	DocumentType,
	DocumentTypeRequest,
	ListTasksFilters,
	MailAccount,
	MailProcessResult,
	MailRule,
	Note,
	PaginatedDocumentList,
	PaginatedList,
	PaperlessTask,
	PostDocumentMetadata,
	StoragePath,
	Tag,
	TagRequest,
	TrashResult,
	UpdateCorrespondentRequest,
	UpdateCustomFieldRequest,
	UpdateDocumentRequest,
	UpdateDocumentTypeRequest,
	UpdateMailRuleRequest,
	UpdateStoragePathRequest,
} from '#types';

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

		// 204/205 have no body — return undefined (callers expecting void will discard it)
		if (response.status === 204 || response.status === 205) {
			return undefined as T & undefined;
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
			body: JSON.stringify({
				documents,
				method,
				parameters: omitUndefined(parameters),
			}),
		});
	}

	async postDocument(
		file: File,
		metadata: PostDocumentMetadata = {},
	): Promise<string> {
		const formData = new FormData();
		formData.append('document', file);

		if (metadata['title'] != null) {
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

	async updateDocument(id: number, data: UpdateDocumentRequest): Promise<Document> {
		return this.request<Document>(`/documents/${id}/`, {
			method: 'PATCH',
			body: JSON.stringify(omitUndefined(data)),
		});
	}

	async addDocumentNote(id: number, note: string): Promise<readonly Note[]> {
		return this.request<readonly Note[]>(`/documents/${id}/notes/`, {
			method: 'POST',
			body: JSON.stringify({ note }),
		});
	}

	async deleteDocumentNote(id: number, noteId: number): Promise<readonly Note[]> {
		return this.request<readonly Note[]>(`/documents/${id}/notes/?id=${noteId}`, {
			method: 'DELETE',
		});
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
		const path = `/documents/${id}/download/`;
		const response = await fetch(
			`${this.baseUrl}/api${path}${query}`,
			{
				headers: {
					Authorization: `Token ${this.token}`,
					Accept: 'application/json; version=6',
				},
			},
		);

		if (!response.ok) {
			const body = await response.text().catch(() => '');
			throw new Error(
				`HTTP ${response.status} from ${path}: ${body}`,
			);
		}

		return response;
	}

	// Tag operations

	async getTags(nameContains?: string): Promise<PaginatedList<Tag>> {
		return this.getAllPages<Tag>(withNameFilter('/tags/', nameContains));
	}

	async getTag(id: number): Promise<Tag> {
		return this.request<Tag>(`/tags/${id}/`);
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

	async getCorrespondents(nameContains?: string): Promise<PaginatedList<Correspondent>> {
		return this.getAllPages<Correspondent>(withNameFilter('/correspondents/', nameContains));
	}

	async getCorrespondent(id: number): Promise<Correspondent> {
		return this.request<Correspondent>(`/correspondents/${id}/`);
	}

	async createCorrespondent(data: CorrespondentRequest): Promise<Correspondent> {
		return this.request<Correspondent>('/correspondents/', {
			method: 'POST',
			body: JSON.stringify(data),
		});
	}

	async updateCorrespondent(
		id: number,
		data: UpdateCorrespondentRequest,
	): Promise<Correspondent> {
		return this.request<Correspondent>(`/correspondents/${id}/`, {
			method: 'PATCH',
			body: JSON.stringify(omitUndefined(data)),
		});
	}

	// Document type operations

	async getDocumentTypes(nameContains?: string): Promise<PaginatedList<DocumentType>> {
		return this.getAllPages<DocumentType>(withNameFilter('/document_types/', nameContains));
	}

	async getDocumentType(id: number): Promise<DocumentType> {
		return this.request<DocumentType>(`/document_types/${id}/`);
	}

	async createDocumentType(data: DocumentTypeRequest): Promise<DocumentType> {
		return this.request<DocumentType>('/document_types/', {
			method: 'POST',
			body: JSON.stringify(data),
		});
	}

	async updateDocumentType(
		id: number,
		data: UpdateDocumentTypeRequest,
	): Promise<DocumentType> {
		return this.request<DocumentType>(`/document_types/${id}/`, {
			method: 'PATCH',
			body: JSON.stringify(omitUndefined(data)),
		});
	}

	// Storage path operations

	async getStoragePaths(nameContains?: string): Promise<PaginatedList<StoragePath>> {
		return this.getAllPages<StoragePath>(withNameFilter('/storage_paths/', nameContains));
	}

	async createStoragePath(data: CreateStoragePathRequest): Promise<StoragePath> {
		return this.request<StoragePath>('/storage_paths/', {
			method: 'POST',
			body: JSON.stringify(data),
		});
	}

	async updateStoragePath(
		id: number,
		data: UpdateStoragePathRequest,
	): Promise<StoragePath> {
		return this.request<StoragePath>(`/storage_paths/${id}/`, {
			method: 'PATCH',
			body: JSON.stringify(omitUndefined(data)),
		});
	}

	// Custom field operations

	async getCustomFields(nameContains?: string): Promise<PaginatedList<CustomField>> {
		return this.getAllPages<CustomField>(withNameFilter('/custom_fields/', nameContains));
	}

	async createCustomField(data: CustomFieldRequest): Promise<CustomField> {
		return this.request<CustomField>('/custom_fields/', {
			method: 'POST',
			body: JSON.stringify(data),
		});
	}

	async updateCustomField(
		id: number,
		data: UpdateCustomFieldRequest,
	): Promise<CustomField> {
		return this.request<CustomField>(`/custom_fields/${id}/`, {
			method: 'PATCH',
			body: JSON.stringify(omitUndefined(data)),
		});
	}

	async deleteCustomField(id: number): Promise<void> {
		await this.request(`/custom_fields/${id}/`, { method: 'DELETE' });
	}

	// Task operations

	async getTask(taskId: string): Promise<readonly PaperlessTask[]> {
		const params = new URLSearchParams({ task_id: taskId });
		// version=6 serves a plain array; newer API versions paginate. Accept both.
		const response = await this.request<
			readonly PaperlessTask[] | PaginatedList<PaperlessTask>
		>(`/tasks/?${params.toString()}`);
		return 'results' in response ? response.results : response;
	}

	async listTasks(filters: ListTasksFilters = {}): Promise<readonly PaperlessTask[]> {
		// The endpoint returns ALL tasks as one array at version=6 (no server
		// pagination): sort newest-first server-side, cap client-side. The
		// task_name param and uppercase status values exist only in this legacy
		// version=6 filterset (the OpenAPI schema documents task_type and
		// lowercase statuses), so the schema-drift CI cannot guard them.
		const params = new URLSearchParams({ ordering: '-date_created' });
		if (filters.status != null) params.set('status', filters.status);
		if (filters.acknowledged != null) params.set('acknowledged', String(filters.acknowledged));
		if (filters.task_name != null) params.set('task_name', filters.task_name);

		const response = await this.request<
			readonly PaperlessTask[] | PaginatedList<PaperlessTask>
		>(`/tasks/?${params.toString()}`);
		const tasks = 'results' in response ? response.results : response;
		return tasks.slice(0, filters.limit ?? 25);
	}

	// Mail operations

	async getMailAccounts(): Promise<PaginatedList<MailAccount>> {
		const response = await this.getAllPages<MailAccount>('/mail_accounts/');
		// Allowlist projection, not a password denylist: credentials must never
		// reach a tool response, including any future secret field the weekly
		// schema sync might introduce.
		return {
			...response,
			results: response.results.map((account) => ({
				id: account.id,
				name: account.name,
				imap_server: account.imap_server,
				imap_port: account.imap_port,
				imap_security: account.imap_security,
				username: account.username,
				account_type: account.account_type,
				is_token: account.is_token,
				expiration: account.expiration,
				character_set: account.character_set,
				owner: account.owner,
				user_can_change: account.user_can_change,
			})),
		};
	}

	async processMailAccount(id: number): Promise<MailProcessResult> {
		// The OpenAPI schema declares a required MailAccountRequest body here,
		// but that is a serializer artifact: the view ignores the body, so the
		// client sends an empty object instead of echoing account credentials.
		return this.request<MailProcessResult>(`/mail_accounts/${id}/process/`, {
			method: 'POST',
			body: JSON.stringify({}),
		});
	}

	async getMailRules(): Promise<PaginatedList<MailRule>> {
		return this.getAllPages<MailRule>('/mail_rules/');
	}

	async createMailRule(data: CreateMailRuleRequest): Promise<MailRule> {
		return this.request<MailRule>('/mail_rules/', {
			method: 'POST',
			body: JSON.stringify(omitUndefined(data)),
		});
	}

	async updateMailRule(id: number, data: UpdateMailRuleRequest): Promise<MailRule> {
		return this.request<MailRule>(`/mail_rules/${id}/`, {
			method: 'PATCH',
			body: JSON.stringify(omitUndefined(data)),
		});
	}

	async deleteMailRule(id: number): Promise<void> {
		await this.request(`/mail_rules/${id}/`, { method: 'DELETE' });
	}

	// Trash operations

	async getTrash(): Promise<PaginatedDocumentList> {
		const response = await this.getAllPages<Document>('/trash/');
		// Trashed items are full documents: strip the heavy content field like
		// searchDocuments does to keep tool output small.
		return {
			...response,
			results: response.results.map((doc) => {
				const { content: _, ...rest } = doc;
				return rest;
			}),
		};
	}

	async restoreFromTrash(documents: readonly number[]): Promise<TrashResult> {
		return this.request<TrashResult>('/trash/', {
			method: 'POST',
			body: JSON.stringify({ action: 'restore', documents }),
		});
	}

	async emptyTrash(documents?: readonly number[]): Promise<TrashResult> {
		return this.request<TrashResult>('/trash/', {
			method: 'POST',
			body: JSON.stringify(
				documents == null ? { action: 'empty' } : { action: 'empty', documents },
			),
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

	private async getAllPages<T>(path: string): Promise<PaginatedList<T>> {
		const pageSize = 100;
		const results: T[] = [];
		let all: readonly number[] = [];
		let count = 0;
		let page = 1;

		while (true) {
			const separator = path.includes('?') ? '&' : '?';
			const response = await this.request<PaginatedList<T>>(
				`${path}${separator}page=${page}&page_size=${pageSize}`,
			);

			count = response.count;
			if (page === 1) {
				all = response.all;
			}
			results.push(...response.results);

			if (response.next == null || results.length >= response.count) {
				return {
					count,
					next: null,
					previous: null,
					all,
					results,
				};
			}

			page += 1;
		}
	}
}

/** Append a name__icontains filter to a list path when a filter is given. */
function withNameFilter(path: string, nameContains?: string): string {
	if (nameContains == null) return path;
	return `${path}?name__icontains=${encodeURIComponent(nameContains)}`;
}

function omitUndefined(data: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(data)) {
		if (value !== undefined) {
			result[key] = value;
		}
	}
	return result;
}
