# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-21 **Commit:** c152be1 **Branch:** master

## OVERVIEW

MCP server bridging AI assistants to Paperless-ngx document management. TypeScript,
`@modelcontextprotocol/sdk`, Zod v4, dual transport: stdio + Streamable HTTP.
API types derived from OpenAPI schema v6.0.0.

## STRUCTURE

```tree
src/
├── index.ts                 # Entry: CLI parsing, server factory, dual transport
├── types.ts                 # Typed interfaces from OpenAPI schema (v6.0.0)
├── api/
│   ├── paperless-api.ts     # HTTP client wrapping Paperless-ngx REST API
│   └── paperless-api.test.ts
└── tools/
    ├── utils.ts             # Shared jsonResult() helper
    ├── documents.ts         # 5 tools: bulk_edit, post, get, search, download
    ├── tags.ts              # 5 tools: list, create, update, delete, bulk_edit
    ├── correspondents.ts    # 3 tools: list, create, bulk_edit
    └── documentTypes.ts     # 3 tools: list, create, bulk_edit
```

No barrel files. No cross-imports between leaf modules.

## WHERE TO LOOK

| Task                     | Location                                  | Notes                                            |
| ------------------------ | ----------------------------------------- | ------------------------------------------------ |
| Add/change response type | `src/types.ts`                            | Interfaces from OpenAPI schema                   |
| Add new MCP tool domain  | `src/tools/` + register in `src/index.ts` | Follow `register*Tools(server, api)` pattern     |
| Add new API endpoint     | `src/api/paperless-api.ts`                | Methods wrap `this.request<T>(path, options)`    |
| Change transport/startup | `src/index.ts`                            | stdio vs HTTP decided by `--http` CLI flag       |
| Zod input schemas        | `src/tools/*.ts`                          | Inline in `server.registerTool()` calls          |
| CI/CD                    | `.github/workflows/npm-publish.yml`       | Bun test + `npm publish --provenance` on release |
| OpenAPI schema           | `schemas/openapi.json`                    | Snapshot via `scripts/openapi.py`                |

## CODE MAP

### Types (src/types.ts)

All typed interfaces derived from the Paperless-ngx OpenAPI schema v6.0.0.
Includes: `Document`, `DocumentSummary`, `Tag`, `Correspondent`, `DocumentType`,
`PaginatedList<T>`, request types (`TagRequest`, etc.), bulk edit types, shared
enums (`BulkEditMethod`, `MatchingAlgorithm`), and nested types (`ObjectPermissions`,
`CustomFieldInstance`, `Note`).

### `PaperlessAPI` (src/api/paperless-api.ts)

Single class, 16 methods. All return typed responses (not `Promise<unknown>`).
`request<T>()` is generic base — adds token auth (`version=6`), JSON content type,
throws on non-OK. Most methods delegate to it.

**Exceptions**: `postDocument` and `downloadDocument` bypass `request()` — they call
`fetch()` directly (FormData and raw Response respectively). Auth header changes
must update both paths.

| Method                | API Path                    | HTTP   |
| --------------------- | --------------------------- | ------ |
| `request<T>`          | `/api${path}`               | varies |
| `bulkEditDocuments`   | `/documents/bulk_edit/`     | POST   |
| `postDocument`        | `/documents/post_document/` | POST   |
| `getDocuments`        | `/documents/{query}`        | GET    |
| `getDocument`         | `/documents/{id}/`          | GET    |
| `searchDocuments`     | `/documents/?query=...`     | GET    |
| `downloadDocument`    | `/documents/{id}/download/` | GET    |
| `getTags`             | `/tags/`                    | GET    |
| `createTag`           | `/tags/`                    | POST   |
| `updateTag`           | `/tags/{id}/`               | PATCH  |
| `deleteTag`           | `/tags/{id}/`               | DELETE |
| `getCorrespondents`   | `/correspondents/`          | GET    |
| `createCorrespondent` | `/correspondents/`          | POST   |
| `getDocumentTypes`    | `/document_types/`          | GET    |
| `createDocumentType`  | `/document_types/`          | POST   |
| `bulkEditObjects`     | `/bulk_edit_objects/`       | POST   |

### Tool Registration (src/tools/)

Each file exports `register*Tools(server, api)`. Inside: `server.registerTool()`
with inline Zod schemas (`import { z } from 'zod'`). Callbacks return
`CallToolResult` via shared `jsonResult()` in `src/tools/utils.ts`.
All callbacks accept `_extra` parameter (SDK requirement).

### Entry Point (src/index.ts)

`main()` → parse CLI args → `PaperlessAPI` → `createServer()` factory → transport:

- **stdio**: single `McpServer` + `StdioServerTransport` (args: `<baseUrl> <token>`)
- **HTTP**: `createMcpExpressApp()` from SDK on `0.0.0.0:port`; fresh `McpServer`
  per request (stateless `StreamableHTTPServerTransport`)

## CONVENTIONS

- **Registration pattern**: New tool domain = new file in `src/tools/`, export
  `register*Tools`, call from `createServer()` in `index.ts`.
- **Zod at boundary**: All MCP tool inputs validated via inline Zod schemas.
- **`import { z } from 'zod'`** — not `import * as z from 'zod/v4'`.
- **Named exports only**: No default exports.
- **kebab-case filenames**: `paperless-api.ts`, not `PaperlessAPI.ts`.
- **Bun-first**: `bun` for runtime, bundling (`bun bd`), and testing (`bun test`).
- **dprint** for formatting (`bun run fmt`). Tab indentation, single quotes.
- **tsgo** for typechecking (`bun run typecheck`). Not `tsc`.
- **Strict TypeScript**: `strict: true` + `noUncheckedIndexedAccess` +
  `noPropertyAccessFromIndexSignature` + all `noUnused*`/`noImplicit*` flags.
- **No `any`, no `as` casts, no `!` assertions**.
- **Server-per-request**: HTTP mode creates fresh `McpServer` per request via
  `createServer()` factory. Never share server state across requests.
- **`matching_algorithm` is integer (0-6)** across all endpoints — tags,
  correspondents, document types. Validated via `z.number().int().min(0).max(6)`.

## ANTI-PATTERNS (THIS PROJECT)

- `postDocument`/`downloadDocument` bypass `this.request()` — dual fetch paths
  with inconsistent error handling and headers.
- ~~`package.json` `main` pointed to `src/index.ts`~~ — removed in v2.0.1.
- `process.exit(1)` for missing config makes startup logic untestable.
- No tests for tool registration or callback logic. Only the API client is tested.
- `as` casts exist in `paperless-api.ts` (response JSON cast to generic `T`
  without runtime validation) despite project convention forbidding them.
- ~~Server version hardcoded as `'1.0.0'`~~ — now imported from `package.json`.
- CI only runs `bun test` — no typecheck or format check in pipeline.

## COMMANDS

```bash
bun run start                # Dev: bun src/index.ts
bun run bd                   # Bundle to dist/ via bun build
bun run typecheck            # tsgo --noEmit
bun run fmt                  # dprint fmt .
bun run fmt:check            # dprint check .
bun test                     # Run tests (auto-discovers *.test.ts)
bun run inspect              # Launch MCP inspector
```

## NOTES

- `searchDocuments` strips `content`, `download_url`, `thumbnail_url` from results
  to reduce token usage. `get_document` returns full content.
- Config: `PAPERLESS_URL` + `PAPERLESS_API_KEY` env vars (both modes), or
  positional CLI args. CLI args take precedence. Legacy `API_KEY` env var
  supported as fallback.
- Console logging is unstructured — error messages could leak sensitive data.
- `skills/` directory ships in npm package (`"files": ["dist", "skills"]`) —
  contains Paperless-ngx reference docs, not runtime code.
- `updateTag` uses PATCH (not PUT) — per OpenAPI schema's `PatchedTagRequest`.
- All dependencies (`@modelcontextprotocol/sdk`, `zod`, `express`) are
  `devDependencies` — the bundle is fully self-contained.
- `scripts/openapi.py` is a Python (3.14+) tool using `uv` — separate toolchain.
