# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-21 **Commit:** 0daa702 **Branch:** deps-upgrade-tsconfig-stricten

## OVERVIEW

MCP server bridging AI assistants to Paperless-NGX document management. TypeScript,
`@modelcontextprotocol/sdk` (sole runtime dep), Zod v4, dual transport: stdio + HTTP.

## STRUCTURE

```
src/
├── index.ts                 # Entry: CLI parsing, McpServer setup, dual transport
├── api/
│   ├── paperless-api.ts     # HTTP client wrapping Paperless-NGX REST API
│   └── paperless-api.test.ts
└── tools/
    ├── documents.ts         # 5 tools: bulk_edit, post, get, search, download
    ├── tags.ts              # 5 tools: list, create, update, delete, bulk_edit
    ├── correspondents.ts    # 3 tools: list, create, bulk_edit
    └── documentTypes.ts     # 3 tools: list, create, bulk_edit
```

No barrel files. No cross-imports between leaf modules.

## WHERE TO LOOK

| Task                     | Location                                  | Notes                                            |
| ------------------------ | ----------------------------------------- | ------------------------------------------------ |
| Add new MCP tool domain  | `src/tools/` + register in `src/index.ts` | Follow `register*Tools(server, api)` pattern     |
| Add new API endpoint     | `src/api/paperless-api.ts`                | Methods wrap `this.request<T>(path, options)`    |
| Change transport/startup | `src/index.ts`                            | stdio vs HTTP decided by `--http` CLI flag       |
| Zod input schemas        | `src/tools/*.ts`                          | Inline in `server.registerTool()` calls          |
| CI/CD                    | `.github/workflows/npm-publish.yml`       | Bun test + `npm publish --provenance` on release |

## CODE MAP

### `PaperlessAPI` (src/api/paperless-api.ts)

Single class, 16 methods. `request<T>()` is generic base — adds token auth, JSON
content type, throws on non-OK. Most methods delegate to it.

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
| `updateTag`           | `/tags/{id}/`               | PUT    |
| `deleteTag`           | `/tags/{id}/`               | DELETE |
| `getCorrespondents`   | `/correspondents/`          | GET    |
| `createCorrespondent` | `/correspondents/`          | POST   |
| `getDocumentTypes`    | `/document_types/`          | GET    |
| `createDocumentType`  | `/document_types/`          | POST   |
| `bulkEditObjects`     | `/bulk_edit_objects/`       | POST   |

### Tool Registration (src/tools/)

Each file exports `register*Tools(server, api)`. Inside: `server.registerTool()`
with inline Zod v4 schemas (`import * as z from 'zod/v4'`). Callbacks return
`{ content: [{ type: 'text', text: JSON.stringify(data) }] }` via per-file
`jsonResult()` helper. All callbacks accept `_extra` parameter (SDK requirement).

### Entry Point (src/index.ts)

`main()` → parse CLI args → `McpServer` + `PaperlessAPI` → register tools → transport:

- **stdio**: `StdioServerTransport` (args: `<baseUrl> <token>`)
- **HTTP**: `createMcpExpressApp()` from SDK on `0.0.0.0:port` with both
  `StreamableHTTPServerTransport` and legacy `SSEServerTransport`

## CONVENTIONS

- **Registration pattern**: New tool domain = new file in `src/tools/`, export
  `register*Tools`, call from `index.ts`.
- **Zod at boundary**: All MCP tool inputs validated via inline Zod v4 schemas.
- **Named exports only**: No default exports.
- **kebab-case filenames**: `paperless-api.ts`, not `PaperlessAPI.ts`.
- **SDK-only dependency**: Only `@modelcontextprotocol/sdk` in `dependencies`.
  Express and Zod come transitively.
- **Bun-first**: `bun` for runtime, bundling (`bun bd`), and testing (`bun test`).
- **dprint** for formatting (`bun run fmt`). Tab indentation, single quotes.
- **tsgo** for typechecking (`bun run typecheck`). Not `tsc`.
- **Strict TypeScript**: `strict: true` + `noUncheckedIndexedAccess` +
  `noPropertyAccessFromIndexSignature` + all `noUnused*`/`noImplicit*` flags.

## ANTI-PATTERNS (THIS PROJECT)

- 13 of 16 API methods return `Promise<unknown>` — callers get no type safety.
  Add typed response interfaces when touching these methods.
- `Record<string, unknown>` params on `createTag`, `createCorrespondent`, etc.
  defeat Zod validation at tool boundary. Use typed interfaces.
- `jsonResult()` helper duplicated in all 4 tool files. Extract to shared module.
- `postDocument`/`downloadDocument` bypass `this.request()` — dual fetch paths
  with inconsistent error handling and headers.
- `searchDocuments` mutates `response.results` in place (breaks `readonly` pattern).
- `matching_algorithm` is numeric (0-4) in tags, string enum in correspondents/
  documentTypes. Upstream API inconsistency, not normalized.
- No Docker support yet — Dockerfile was removed (was broken, used npm/build/).
- `package.json` `main` points to `src/index.ts` (TS source, not built output).
- No `LICENSE` file despite ISC declaration.
- SSE sessions are in-memory (`Map`). No horizontal scaling.

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
- HTTP mode: env vars `PAPERLESS_URL` + `API_KEY`. Stdio: positional CLI args.
- `process.exit(1)` for missing config makes startup logic untestable.
- Console logging is unstructured — error messages could leak sensitive data.
- `skills/` directory ships in npm package (`"files": ["dist", "skills"]`) —
  contains Paperless-NGX reference docs, not runtime code.
