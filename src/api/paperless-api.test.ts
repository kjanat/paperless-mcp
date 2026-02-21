import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Mock } from 'bun:test';

import { PaperlessAPI } from './paperless-api';

const BASE_URL = 'http://paperless.test';
const TOKEN = 'test-token-123';

let api: PaperlessAPI;
let fetchSpy: Mock<typeof globalThis.fetch>;

beforeEach(() => {
	api = new PaperlessAPI(BASE_URL, TOKEN);
});

afterEach(() => {
	fetchSpy.mockRestore();
});

/** Spy on fetch, returning the given JSON body. */
function stubFetch(body: unknown, status = 200): void {
	fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
		new Response(JSON.stringify(body), {
			status,
			headers: { 'Content-Type': 'application/json' },
		}),
	);
}

/** Spy on fetch, returning a raw response (e.g. for downloads). */
function stubFetchRaw(body: string, headers: Record<string, string> = {}, status = 200): void {
	fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
		new Response(body, { status, headers }),
	);
}

/** Extract the parsed JSON body from the most recent fetch call. */
function lastRequestBody(): Record<string, unknown> {
	const [, init] = fetchSpy.mock.calls[0]!;
	return JSON.parse(init?.body as string) as Record<string, unknown>;
}

/** Extract the URL string from the most recent fetch call. */
function lastRequestUrl(): string {
	return String(fetchSpy.mock.calls[0]![0]);
}

/** Extract request init from the most recent fetch call. */
function lastRequestInit(): RequestInit {
	return fetchSpy.mock.calls[0]![1] ?? {};
}

// ---------------------------------------------------------------------------
// request (base method)
// ---------------------------------------------------------------------------

describe('PaperlessAPI.request', () => {
	test('sends auth header and correct URL', async () => {
		stubFetch({ results: [] });
		await api.request('/tags/');

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(lastRequestUrl()).toBe(`${BASE_URL}/api/tags/`);
		const headers = lastRequestInit().headers as Record<string, string>;
		expect(headers['Authorization']).toBe(`Token ${TOKEN}`);
		expect(headers['Accept']).toContain('application/json');
		expect(headers['Accept']).toContain('version=6');
		expect(headers['Content-Type']).toBe('application/json');
	});

	test('merges caller-supplied headers', async () => {
		stubFetch({});
		await api.request('/tags/', { headers: { 'X-Custom': 'val' } });

		const headers = lastRequestInit().headers as Record<string, string>;
		expect(headers['X-Custom']).toBe('val');
		expect(headers['Authorization']).toBe(`Token ${TOKEN}`);
	});

	test('passes method and body through', async () => {
		stubFetch({});
		await api.request('/tags/', {
			method: 'POST',
			body: JSON.stringify({ name: 'test' }),
		});

		expect(lastRequestInit().method).toBe('POST');
		expect(lastRequestBody()).toEqual({ name: 'test' });
	});

	test('throws on non-OK response with status and path', async () => {
		stubFetch({ detail: 'Not found' }, 404);
		await expect(api.request('/documents/999/')).rejects.toThrow('HTTP 404');
	});

	test('throws on non-OK even when body is not JSON', async () => {
		fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response('not json', { status: 500 }),
		);
		await expect(api.request('/bad/')).rejects.toThrow('HTTP 500');
	});

	test('returns undefined for 204 No Content without calling json()', async () => {
		stubFetchRaw('', {}, 204);
		const result = await api.request('/tags/1/', { method: 'DELETE' });
		expect(result).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Document operations
// ---------------------------------------------------------------------------

describe('PaperlessAPI.bulkEditDocuments', () => {
	test('sends correct payload', async () => {
		stubFetch({ result: 'ok' });
		await api.bulkEditDocuments([1, 2], 'delete', {});

		expect(lastRequestBody()).toEqual({ documents: [1, 2], method: 'delete', parameters: {} });
	});

	test('includes extra parameters', async () => {
		stubFetch({ result: 'ok' });
		await api.bulkEditDocuments([3], 'set_correspondent', { correspondent: 5 });

		expect(lastRequestBody()).toEqual({
			documents: [3],
			method: 'set_correspondent',
			parameters: { correspondent: 5 },
		});
	});
});

describe('PaperlessAPI.postDocument', () => {
	test('sends FormData with file and metadata', async () => {
		stubFetch('task-id-123');
		const file = new File([new Blob(['hello'])], 'test.pdf');
		await api.postDocument(file, { title: 'My Doc', tags: [1, 2] });

		expect(lastRequestUrl()).toBe(`${BASE_URL}/api/documents/post_document/`);
		expect(lastRequestInit().body).toBeInstanceOf(FormData);
	});

	test('includes all metadata fields in FormData', async () => {
		stubFetch('task-id-456');
		const file = new File([new Blob(['x'])], 'f.pdf');
		await api.postDocument(file, {
			title: 'T',
			created: '2024-01-01',
			correspondent: 1,
			document_type: 2,
			storage_path: 3,
			tags: [10, 20],
			archive_serial_number: 42,
			custom_fields: [5, 6],
		});

		const form = lastRequestInit().body as FormData;
		expect(form.get('title')).toBe('T');
		expect(form.get('created')).toBe('2024-01-01');
		expect(form.get('correspondent')).toBe('1');
		expect(form.get('document_type')).toBe('2');
		expect(form.get('storage_path')).toBe('3');
		expect(form.getAll('tags')).toEqual(['10', '20']);
		expect(form.get('archive_serial_number')).toBe('42');
		expect(form.getAll('custom_fields')).toEqual(['5', '6']);
	});

	test('omits null/undefined metadata fields', async () => {
		stubFetch('task-id-789');
		const file = new File([new Blob(['x'])], 'f.pdf');
		await api.postDocument(file, {});

		const form = lastRequestInit().body as FormData;
		expect(form.has('title')).toBe(false);
		expect(form.has('tags')).toBe(false);
		expect(form.has('correspondent')).toBe(false);
		expect(form.has('document')).toBe(true); // file is always present
	});

	test('throws on non-OK upload response with body', async () => {
		stubFetch({ detail: 'Too large' }, 413);
		const file = new File([new Blob(['x'])], 'big.pdf');
		await expect(api.postDocument(file)).rejects.toThrow('HTTP 413');
	});

	test('sends auth and accept headers but no Content-Type (FormData sets it)', async () => {
		stubFetch('task-id');
		const file = new File([new Blob(['x'])], 'f.pdf');
		await api.postDocument(file);

		const headers = lastRequestInit().headers as Record<string, string>;
		expect(headers['Authorization']).toBe(`Token ${TOKEN}`);
		expect(headers['Accept']).toContain('version=6');
		expect(headers).not.toHaveProperty('Content-Type');
	});
});

describe('PaperlessAPI.getDocuments', () => {
	test('fetches documents with default empty query', async () => {
		stubFetch({ count: 0, next: null, previous: null, all: [], results: [] });
		await api.getDocuments();

		expect(lastRequestUrl()).toBe(`${BASE_URL}/api/documents/`);
	});

	test('appends query string', async () => {
		stubFetch({ count: 0, next: null, previous: null, all: [], results: [] });
		await api.getDocuments('?page=2');

		expect(lastRequestUrl()).toBe(`${BASE_URL}/api/documents/?page=2`);
	});
});

describe('PaperlessAPI.getDocument', () => {
	test('fetches single document by ID', async () => {
		stubFetch({ id: 42, title: 'Invoice' });

		const result = await api.getDocument(42);
		expect(result.id).toBe(42);
		expect(result.title).toBe('Invoice');
		expect(lastRequestUrl()).toBe(`${BASE_URL}/api/documents/42/`);
	});
});

describe('PaperlessAPI.searchDocuments', () => {
	test('strips content/download_url/thumbnail_url from results', async () => {
		stubFetch({
			count: 1,
			next: null,
			previous: null,
			results: [{
				id: 1,
				title: 'Test',
				content: 'long OCR text...',
				download_url: '/api/documents/1/download/',
				thumbnail_url: '/api/documents/1/thumb/',
				correspondent: 2,
			}],
		});

		const result = await api.searchDocuments('test');
		expect(result.count).toBe(1);
		expect(result.results[0]).toEqual({ id: 1, title: 'Test', correspondent: 2 });
		expect(result.results[0]).not.toHaveProperty('content');
		expect(result.results[0]).not.toHaveProperty('download_url');
		expect(result.results[0]).not.toHaveProperty('thumbnail_url');
	});

	test('does not mutate original response object', async () => {
		const original = {
			count: 1,
			next: null,
			previous: null,
			results: [{ id: 1, content: 'text' }],
		};
		stubFetch(original);

		const result = await api.searchDocuments('test');
		// Result should be a new object, not the same reference
		expect(result.results).not.toBe(original.results);
	});

	test('passes page and page_size as query params', async () => {
		stubFetch({ count: 0, next: null, previous: null, results: [] });
		await api.searchDocuments('invoice', 2, 10);

		expect(lastRequestUrl()).toContain('query=invoice');
		expect(lastRequestUrl()).toContain('page=2');
		expect(lastRequestUrl()).toContain('page_size=10');
	});

	test('omits page/page_size when not provided', async () => {
		stubFetch({ count: 0, next: null, previous: null, results: [] });
		await api.searchDocuments('test');

		expect(lastRequestUrl()).not.toContain('page=');
		expect(lastRequestUrl()).not.toContain('page_size=');
	});
});

describe('PaperlessAPI.downloadDocument', () => {
	test('returns raw Response for binary consumption', async () => {
		stubFetchRaw('PDF-binary-data', {
			'content-disposition': 'attachment; filename="doc.pdf"',
		});

		const response = await api.downloadDocument(42);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('PDF-binary-data');
	});

	test('appends ?original=true when requested', async () => {
		stubFetchRaw('data');
		await api.downloadDocument(42, true);

		expect(lastRequestUrl()).toContain('original=true');
	});

	test('does not append query param by default', async () => {
		stubFetchRaw('data');
		await api.downloadDocument(42);

		expect(lastRequestUrl()).not.toContain('original');
	});

	test('sends auth and accept headers', async () => {
		stubFetchRaw('data');
		await api.downloadDocument(1);

		const headers = lastRequestInit().headers as Record<string, string>;
		expect(headers['Authorization']).toBe(`Token ${TOKEN}`);
		expect(headers['Accept']).toContain('version=6');
	});
});

// ---------------------------------------------------------------------------
// Tag operations
// ---------------------------------------------------------------------------

describe('PaperlessAPI.getTags', () => {
	test('fetches /tags/', async () => {
		stubFetch({ count: 1, next: null, previous: null, all: [1], results: [{ id: 1, name: 'urgent' }] });

		const result = await api.getTags();
		expect(result.count).toBe(1);
		expect(result.results[0]?.name).toBe('urgent');
		expect(lastRequestUrl()).toBe(`${BASE_URL}/api/tags/`);
	});
});

describe('PaperlessAPI.createTag', () => {
	test('POSTs tag data', async () => {
		stubFetch({ id: 5, name: 'new-tag' });
		await api.createTag({ name: 'new-tag', color: '#FF0000' });

		expect(lastRequestInit().method).toBe('POST');
		expect(lastRequestBody()).toEqual({ name: 'new-tag', color: '#FF0000' });
	});
});

describe('PaperlessAPI.updateTag', () => {
	test('PATCHes to /tags/{id}/', async () => {
		stubFetch({ id: 3, name: 'renamed' });
		await api.updateTag(3, { name: 'renamed' });

		expect(lastRequestUrl()).toBe(`${BASE_URL}/api/tags/3/`);
		expect(lastRequestInit().method).toBe('PATCH');
		expect(lastRequestBody()).toEqual({ name: 'renamed' });
	});
});

describe('PaperlessAPI.deleteTag', () => {
	test('DELETEs /tags/{id}/ and handles 204 No Content', async () => {
		stubFetchRaw('', {}, 204);
		await api.deleteTag(7);

		expect(lastRequestUrl()).toBe(`${BASE_URL}/api/tags/7/`);
		expect(lastRequestInit().method).toBe('DELETE');
	});
});

// ---------------------------------------------------------------------------
// Correspondent operations
// ---------------------------------------------------------------------------

describe('PaperlessAPI.getCorrespondents', () => {
	test('fetches /correspondents/', async () => {
		stubFetch({ count: 0, next: null, previous: null, all: [], results: [] });
		await api.getCorrespondents();

		expect(lastRequestUrl()).toBe(`${BASE_URL}/api/correspondents/`);
	});
});

describe('PaperlessAPI.createCorrespondent', () => {
	test('POSTs correspondent data', async () => {
		stubFetch({ id: 1, name: 'Acme Corp' });
		await api.createCorrespondent({ name: 'Acme Corp' });

		expect(lastRequestInit().method).toBe('POST');
		expect(lastRequestBody()).toEqual({ name: 'Acme Corp' });
		expect(lastRequestUrl()).toBe(`${BASE_URL}/api/correspondents/`);
	});

	test('includes matching_algorithm as integer', async () => {
		stubFetch({ id: 2, name: 'Bank' });
		await api.createCorrespondent({ name: 'Bank', matching_algorithm: 4 });

		expect(lastRequestBody()).toEqual({ name: 'Bank', matching_algorithm: 4 });
	});
});

// ---------------------------------------------------------------------------
// Document type operations
// ---------------------------------------------------------------------------

describe('PaperlessAPI.getDocumentTypes', () => {
	test('fetches /document_types/', async () => {
		stubFetch({ count: 0, next: null, previous: null, all: [], results: [] });
		await api.getDocumentTypes();

		expect(lastRequestUrl()).toBe(`${BASE_URL}/api/document_types/`);
	});
});

describe('PaperlessAPI.createDocumentType', () => {
	test('POSTs document type data', async () => {
		stubFetch({ id: 2, name: 'Invoice' });
		await api.createDocumentType({ name: 'Invoice', match: 'invoice' });

		expect(lastRequestInit().method).toBe('POST');
		expect(lastRequestBody()).toEqual({ name: 'Invoice', match: 'invoice' });
	});

	test('includes matching_algorithm as integer', async () => {
		stubFetch({ id: 3, name: 'Receipt' });
		await api.createDocumentType({ name: 'Receipt', matching_algorithm: 5 });

		expect(lastRequestBody()).toEqual({ name: 'Receipt', matching_algorithm: 5 });
	});
});

// ---------------------------------------------------------------------------
// Bulk object operations
// ---------------------------------------------------------------------------

describe('PaperlessAPI.bulkEditObjects', () => {
	test('sends correct payload for set_permissions', async () => {
		stubFetch({ result: 'ok' });
		await api.bulkEditObjects([1, 2], 'tags', 'set_permissions', {
			owner: 1,
			permissions: { view: { users: [2] } },
		});

		expect(lastRequestBody()).toEqual({
			objects: [1, 2],
			object_type: 'tags',
			operation: 'set_permissions',
			owner: 1,
			permissions: { view: { users: [2] } },
		});
	});

	test('sends correct payload for delete', async () => {
		stubFetch({ result: 'ok' });
		await api.bulkEditObjects([5], 'correspondents', 'delete');

		expect(lastRequestBody()).toEqual({
			objects: [5],
			object_type: 'correspondents',
			operation: 'delete',
		});
	});
});
