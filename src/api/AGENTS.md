# src/api/ — Paperless-ngx HTTP Client

Single class `PaperlessAPI` in `paperless.ts`. 31 methods wrapping the
Paperless-ngx REST API via `fetch()`. All methods return typed responses
(interfaces from `src/types.ts`), not `Promise<unknown>`.

## KEY DETAILS

- **API version**: `version=6` header on all requests (matches OpenAPI schema v6.0.0).
- **`updateTag` uses PATCH** (not PUT) — per `PatchedTagRequest` in schema.
- **`matching_algorithm` is integer (0-6)** across all endpoints.
- **`searchDocuments` returns immutable copy** — strips `content`, `download_url`,
  `thumbnail_url` from results to reduce token usage.
- **All PATCH methods** (`updateDocument`, `updateTag`, `updateCorrespondent`,
  `updateDocumentType`, `updateStoragePath`, `updateCustomField`) strip
  `undefined` fields before serializing, via the module-level `omitUndefined()`
  helper at the bottom of `paperless.ts`.
- **`getTask` queries by Celery UUID** — `GET /tasks/?task_id=...` (filter, not
  path param). The numeric task `id` is a different field. With `version=6` the
  endpoint returns a plain array (legacy serializer: uppercase `status`,
  singular `related_document`), not the paginated `TaskSerializerV10` the
  OpenAPI schema documents — `getTask` accepts both shapes.
- **Notes are a sub-resource**: `addDocumentNote` (POST) and `deleteDocumentNote`
  (DELETE with `?id=` query) both return the document's remaining notes array.

## GOTCHAS

- **Dual fetch paths**: `request<T>()` is the shared base, but `postDocument()`
  and `downloadDocument()` call `fetch()` directly. Auth header changes or error
  handling updates must hit all three paths.
- **`as` casts on response JSON**: `response.json() as Promise<T>` — unvalidated
  runtime trust boundary. If Paperless-ngx returns unexpected shape, it silently
  becomes a type lie.
- **`downloadDocument` error extraction differs**: uses `.text()` not `.json()`,
  unlike the other two fetch paths.

## TESTING

`paperless.test.ts` (59 tests) covers all 31 methods via
`spyOn(globalThis, 'fetch')`. Helpers: `stubFetch()`, `stubFetchRaw()`,
`lastRequestBody()`, `lastRequestUrl()`, `lastRequestInit()`.

Pattern: spy on fetch → call API method → assert URL/headers/body/response.
