# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-21 **Commit:** fa2d17b **Branch:** master

## OVERVIEW

MCP server bridging AI assistants to Paperless-NGX document management. TypeScript,
`@modelcontextprotocol/sdk`, Express 5, Zod. Dual transport: stdio + HTTP.

## STRUCTURE

```
src/
├── index.ts              # Entry point: CLI arg parsing, server setup, dual transport
├── api/
│   └── PaperlessAPI.ts   # HTTP client wrapping Paperless-NGX REST API (fetch + token auth)
└── tools/
    ├── documents.ts      # 5 tools: bulk_edit, post, get, search, download
    ├── tags.ts           # 5 tools: list, create, update, delete, bulk_edit
    ├── correspondents.ts # 3 tools: list, create, bulk_edit
    └── documentTypes.ts  # 3 tools: list, create, bulk_edit
```

No barrel files. No cross-imports between leaf modules. All tools/ and api/ modules
are imported only from `index.ts`.

## WHERE TO LOOK

| Task                        | Location                | Notes                                            |
| --------------------------- | ----------------------- | ------------------------------------------------ |
| Add new MCP tool domain     | `src/tools/` + register in `src/index.ts` | Follow `register*Tools(server, api)` pattern |
| Add new API endpoint        | `src/api/PaperlessAPI.ts` | Methods wrap `this.request(path, options)`      |
| Change transport/startup    | `src/index.ts`          | stdio vs HTTP decided by `--http` CLI flag       |
| Zod input schemas           | `src/tools/*.ts`        | Inline in `server.tool()` calls                  |
| Docker config               | `Dockerfile`            | Multi-stage, Node 20, hardcodes `--http --port 3000` |
| CI/CD                       | `.github/workflows/`    | npm-publish (on release), docker-publish (on push to main) |

## CODE MAP

### `PaperlessAPI` (src/api/PaperlessAPI.ts)

Single class, 16 methods. `request()` is the base -- adds token auth header, JSON content
type, throws on non-OK. All other methods delegate to it.

| Method               | API Path                        | HTTP   |
| -------------------- | ------------------------------- | ------ |
| `request`            | `/api${path}`                   | varies |
| `bulkEditDocuments`  | `/documents/bulk_edit/`         | POST   |
| `postDocument`       | `/documents/post_document/`     | POST   |
| `getDocuments`       | `/documents/{query}`            | GET    |
| `getDocument`        | `/documents/{id}/`              | GET    |
| `searchDocuments`    | `/documents/?query=...`         | GET    |
| `downloadDocument`   | `/documents/{id}/download/`     | GET    |
| `getTags`            | `/tags/`                        | GET    |
| `createTag`          | `/tags/`                        | POST   |
| `updateTag`          | `/tags/{id}/`                   | PUT    |
| `deleteTag`          | `/tags/{id}/`                   | DELETE |
| `getCorrespondents`  | `/correspondents/`              | GET    |
| `createCorrespondent`| `/correspondents/`              | POST   |
| `getDocumentTypes`   | `/document_types/`              | GET    |
| `createDocumentType` | `/document_types/`              | POST   |
| `bulkEditObjects`    | `/bulk_edit_objects/`           | POST   |

### Tool Registration Pattern (src/tools/)

Each file exports one `register*Tools(server, api)` function. Inside, multiple
`server.tool(name, description, zodSchema, handler)` calls. All handlers guard
with `if (!api) throw`. Zod schemas are inline (not extracted to shared types).

### Entry Point (src/index.ts)

`main()` parses CLI args, creates `McpServer` + `PaperlessAPI`, calls all four
`register*Tools`, then starts either:
- **stdio**: `StdioServerTransport` (args: `<baseUrl> <token>`)
- **HTTP**: Express on port 3000 (env: `PAPERLESS_URL`, `API_KEY`) with both
  `StreamableHTTPServerTransport` and legacy `SSEServerTransport`

## CONVENTIONS

- **Registration pattern**: New tool domains = new file in `src/tools/`, export
  `register*Tools`, call from `index.ts`. Do not break this pattern.
- **Zod at boundary**: All MCP tool inputs validated via inline Zod schemas.
- **Named exports only**: No default exports anywhere.
- **CJS output**: `tsconfig` targets CommonJS via `tsc`. `outDir: build/`.
- **No tests**: Zero test infrastructure. `npm test` is a failing stub.
- **No linter/formatter**: No ESLint, Prettier, Biome, or EditorConfig.

## ANTI-PATTERNS (THIS PROJECT)

- `noImplicitAny: false` in tsconfig overrides `strict: true`. Most function
  params in PaperlessAPI are untyped (implicit `any`). **Enable `noImplicitAny`
  and add types when touching these files.**
- Explicit `any` in `searchDocuments()` (lines 115, 119). Use proper response types.
- `as string[]` casts in `postDocument()` (lines 70, 78). Parse with Zod instead.
- `req.query.sessionId as string` in `index.ts:144`. Validate at boundary.
- `console.error` on line 28-34 of PaperlessAPI.ts leaks auth token in headers.
- `package.json` `main`/`bin` point to `src/index.js` (nonexistent). Should be
  `build/index.js`.
- `smithery.yaml` also references `src/index.js`.
- `typescript` is in `dependencies` (should be `devDependencies`).
- Docker copies full `node_modules` including devDeps into production image.
- `npm-publish.yml` runs `npm test` which always fails (blocking releases).
- README references nonexistent `server.js`, `list_documents` tool, and `litemcp`.

## COMMANDS

```bash
npm start                    # Dev: ts-node src/index.ts
npm run build                # Compile to build/ via tsc
npm run inspect              # Build + launch MCP inspector
docker build -t paperless-mcp .  # Docker build
```

## NOTES

- **HTTP mode SSE sessions are in-memory** (`sseTransports` Map). No horizontal scaling.
- **Express 5** (^5.1.0) -- newer major, check compat if adding middleware.
- `postDocument` bypasses `this.request()` -- builds its own fetch with FormData.
  If modifying auth headers, update both paths.
- `searchDocuments` strips `content`, `download_url`, `thumbnail_url` from results
  to reduce token usage. `get_document` returns full content.
- `matching_algorithm` param is numeric (0-4) in tags but string enum in
  correspondents/documentTypes. Inconsistency from upstream API.
- No `LICENSE` file despite `package.json` declaring ISC.
- `.cursor/rules/` contains AI assistant instructions (not runtime code).
