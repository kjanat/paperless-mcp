# src/api/ — Paperless-NGX HTTP Client

Single class `PaperlessAPI` in `paperless-api.ts`. 16 methods wrapping the
Paperless-NGX REST API via `fetch()`.

## GOTCHAS

- **Dual fetch paths**: `request<T>()` is the shared base, but `postDocument()`
  and `downloadDocument()` call `fetch()` directly. Auth header changes or error
  handling updates must hit all three paths.
- **`postDocument` error message** differs from `request()` — generic
  `"HTTP error! status: N"` vs richer `"HTTP N from /path: {body}"`.
- **`searchDocuments` mutates response** — `response.results = ...` is an
  in-place mutation on the object returned by `request<T>()`.
- **13 methods return `Promise<unknown>`** — only `searchDocuments`,
  `downloadDocument`, and `request<T>` have meaningful return types. Add typed
  response interfaces when modifying these methods.
- **`Record<string, unknown>` params** on `createTag`, `updateTag`,
  `createCorrespondent`, `createDocumentType` — defeats Zod validation upstream.
  Replace with typed interfaces.

## TESTING

`paperless-api.test.ts` (418 lines, 32 tests) covers all 16 methods via
`spyOn(globalThis, 'fetch')`. Helpers: `stubFetch()`, `stubFetchRaw()`,
`lastRequestBody()`, `lastRequestUrl()`, `lastRequestInit()`.

Pattern: spy on fetch → call API method → assert URL/headers/body/response.
