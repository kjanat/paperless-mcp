# src/api/ — Paperless-NGX HTTP Client

Single class `PaperlessAPI` in `paperless-api.ts`. 16 methods wrapping the
Paperless-NGX REST API via `fetch()`. All methods return typed responses
(interfaces from `src/types.ts`), not `Promise<unknown>`.

## KEY DETAILS

- **API version**: `version=6` header on all requests (matches OpenAPI schema v6.0.0).
- **`updateTag` uses PATCH** (not PUT) — per `PatchedTagRequest` in schema.
- **`matching_algorithm` is integer (0-6)** across all endpoints.
- **`searchDocuments` returns immutable copy** — strips `content`, `download_url`,
  `thumbnail_url` from results to reduce token usage.

## GOTCHAS

- **Dual fetch paths**: `request<T>()` is the shared base, but `postDocument()`
  and `downloadDocument()` call `fetch()` directly. Auth header changes or error
  handling updates must hit all three paths.
- **`as` casts on response JSON**: `response.json() as Promise<T>` — unvalidated
  runtime trust boundary. If Paperless-NGX returns unexpected shape, it silently
  becomes a type lie.
- **`downloadDocument` error extraction differs**: uses `.text()` not `.json()`,
  unlike the other two fetch paths.

## TESTING

`paperless-api.test.ts` (36 tests) covers all 16 methods via
`spyOn(globalThis, 'fetch')`. Helpers: `stubFetch()`, `stubFetchRaw()`,
`lastRequestBody()`, `lastRequestUrl()`, `lastRequestInit()`.

Pattern: spy on fetch → call API method → assert URL/headers/body/response.
