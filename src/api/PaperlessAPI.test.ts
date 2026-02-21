import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Mock } from 'bun:test';

import { PaperlessAPI } from './PaperlessAPI';

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

describe('PaperlessAPI.request', () => {
	test('sends auth header and correct URL', async () => {
		stubFetch({ results: [] });
		await api.request('/tags/');

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, init] = fetchSpy.mock.calls[0]!;
		expect(url).toBe(`${BASE_URL}/api/tags/`);
		const headers = init?.headers as Record<string, string>;
		expect(headers['Authorization']).toBe(`Token ${TOKEN}`);
	});

	test('throws on non-OK response', async () => {
		stubFetch({ detail: 'Not found' }, 404);
		await expect(api.request('/documents/999/')).rejects.toThrow('HTTP 404');
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

	test('passes page and page_size as query params', async () => {
		stubFetch({ count: 0, next: null, previous: null, results: [] });
		await api.searchDocuments('invoice', 2, 10);

		const [url] = fetchSpy.mock.calls[0]!;
		expect(String(url)).toContain('query=invoice');
		expect(String(url)).toContain('page=2');
		expect(String(url)).toContain('page_size=10');
	});
});

describe('PaperlessAPI.downloadDocument', () => {
	test('returns raw Response for binary consumption', async () => {
		stubFetchRaw('PDF-binary-data', {
			'content-disposition': 'attachment; filename="doc.pdf"',
		});

		const response = await api.downloadDocument(42);
		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).toBe('PDF-binary-data');
	});

	test('appends ?original=true when requested', async () => {
		stubFetchRaw('data');
		await api.downloadDocument(42, true);

		const [url] = fetchSpy.mock.calls[0]!;
		expect(String(url)).toContain('original=true');
	});
});

describe('PaperlessAPI.bulkEditDocuments', () => {
	test('sends correct payload', async () => {
		stubFetch({ success: true });
		await api.bulkEditDocuments([1, 2], 'delete', {});

		const [, init] = fetchSpy.mock.calls[0]!;
		const body = JSON.parse(init?.body as string) as Record<string, unknown>;
		expect(body).toEqual({ documents: [1, 2], method: 'delete', parameters: {} });
	});
});

describe('PaperlessAPI.postDocument', () => {
	test('sends FormData with file and metadata', async () => {
		stubFetch({ id: 99 });
		const file = new File([new Blob(['hello'])], 'test.pdf');
		await api.postDocument(file, { title: 'My Doc', tags: [1, 2] });

		const [url, init] = fetchSpy.mock.calls[0]!;
		expect(String(url)).toBe(`${BASE_URL}/api/documents/post_document/`);
		expect(init?.body).toBeInstanceOf(FormData);
	});
});
