# Migrate to FastMCP — Implementation Spec

**Status:** Ready for task breakdown\
**Effort:** L (~3-5 hours)\
**Date:** 2026-02-21

## Problem Statement

**Who:** Maintainers of paperless-mcp\
**What:** ~100 lines of boilerplate in `index.ts` for transport setup, server
lifecycle, Express wiring, and per-request server creation. Raw SDK requires
manual handling of concerns FastMCP provides out of the box.\
**Why it matters:** Reduces maintenance surface, gains health checks/auth/CORS/
sessions for free, insulates from SDK breaking changes.\
**Evidence:** `index.ts` has `createServer()` factory, `handleMcpHttpRequest()`,
`sendJsonRpcError()`, `ParsedRequest` type, Express import — all eliminated by
FastMCP.

## Proposed Solution

Replace `@modelcontextprotocol/sdk` + `express` with `fastmcp`. FastMCP wraps
the SDK internally and provides higher-level APIs for tool registration,
transport management, and HTTP serving.

The existing `register*Tools(server, api)` pattern maps directly — `api` is
captured via closure, `server.registerTool()` becomes `server.addTool()`, raw
input shapes become `z.object()`, and `jsonResult()` is replaced by returning
strings directly.

Transport selection stays CLI-driven (`--http`/`--port`) but the implementation
reduces to a single `server.start()` call. HTTP mode uses FastMCP's built-in
HTTP server (Hono-based, replaces Express) with stateful sessions (the current
per-request stateless pattern was an SDK limitation, not a design choice).
Optional Bearer token auth is added via `authenticate` callback, gated on
`MCP_API_KEY` env var.

## Scope & Deliverables

| #  | Deliverable                                                                        | Effort | Depends On |
| -- | ---------------------------------------------------------------------------------- | ------ | ---------- |
| D1 | Update dependencies (`fastmcp` in, `@modelcontextprotocol/sdk` + `express` out)    | S      | -          |
| D2 | Refactor 4 tool files: `addTool()` API, `z.object()` params, string returns        | M      | D1         |
| D3 | Rewrite `index.ts`: `FastMCP` constructor, CLI->transport, auth, health            | M      | D1         |
| D4 | Remove dead code: `jsonResult()`, SDK type imports, `ParsedRequest`, Express types | S      | D2, D3     |
| D5 | Update/verify tests + bundle                                                       | S      | D2, D3     |
| D6 | Bump to next major version, update package.json metadata                           | S      | D5         |

## Non-Goals (Explicit Exclusions)

- **OAuth proxy / full OAuth 2.1 flow** — overkill for a single-instance
  Paperless bridge. Revisit if multi-tenant.
- **Custom HTTP routes** — no REST endpoints needed alongside MCP.
- **Edge runtime / Cloudflare Workers** — stays Node/Bun only.
- **Per-tool authorization (`canAccess`)** — all tools share one Paperless API
  key; no meaningful per-tool ACL.
- **Streaming output / `streamContent`** — current tools return complete JSON;
  no incremental results.
- **Refactoring `PaperlessAPI`** — unchanged; the dual-fetch-path anti-pattern
  is orthogonal.
- **Adopting `paperless-node`** — investigated and rejected (missing 2 bulk
  endpoints, 0 community, adds axios/dotenv/form-data/qs deps, missing
  `version=6` Accept header).

## API/Interface Contract

### Tool Migration Mapping (all 16 tools)

| Current (SDK)                            | FastMCP                                     |
| ---------------------------------------- | ------------------------------------------- |
| `server.registerTool(name, config, cb)`  | `server.addTool({ name, ..., execute })`    |
| `inputSchema: { id: z.number() }` (raw)  | `parameters: z.object({ id: z.number() })`  |
| `return jsonResult(data)`                | `return JSON.stringify(data, null, 2)`      |
| `(_extra: RequestHandlerExtra)` — unused | `(context: Context)` — available but unused |

### Server Construction

```typescript
// Before
const server = new McpServer({ name: 'paperless-ngx', version: pkg.version });

// After
assertSemver(pkg.version);
const server = new FastMCP({
	name: 'paperless-ngx',
	version: pkg.version,
	health: { enabled: true, path: '/health' },
	...(mcpApiKey && { authenticate: validateBearer(mcpApiKey) }),
});
```

### Transport Startup

```typescript
// Before (stdio): StdioServerTransport + manual connect
const transport = new StdioServerTransport();
await server.connect(transport);

// After (stdio):
await server.start({ transportType: 'stdio' });

// Before (HTTP): Express app, per-request handler, error helper (~20 lines)
const app = createMcpExpressApp({ host: '0.0.0.0' });
app.post('/mcp', (req, res) => void handleMcpHttpRequest(req, res, api));
app.listen(port);

// After (HTTP):
await server.start({
	transportType: 'httpStream',
	httpStream: { port, host: '0.0.0.0' },
});
```

### Auth (HTTP transport only)

```typescript
import { timingSafeEqual } from 'node:crypto';

function validateBearer(expected: string) {
	const expectedBuf = Buffer.from(expected);
	return (request: { headers: Record<string, string | undefined> }) => {
		const header = request.headers['authorization'];
		const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
		if (
			!token
			|| token.length !== expected.length
			|| !timingSafeEqual(Buffer.from(token), expectedBuf)
		) {
			throw new Response(null, { status: 401, statusText: 'Unauthorized' });
		}
		return { authenticated: true as const };
	};
}
```

- `MCP_API_KEY` env var gates HTTP auth. If unset, no auth (backwards-compat).
- stdio transport ignores `MCP_API_KEY` entirely.
- Separate from `PAPERLESS_API_KEY` (backend credential) — defense in depth.

### Register Function Signature

```typescript
// Before
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export function registerDocumentTools(server: McpServer, api: PaperlessAPI): void;

// After
import type { FastMCP } from 'fastmcp';
export function registerDocumentTools(server: FastMCP, api: PaperlessAPI): void;
```

### Semver Type Guard

FastMCP requires `version: \` ${number}.${number}.${number}\``. Since`pkg.version`is`string`, use a runtime assertion (no`as` casts):

```typescript
function assertSemver(v: string): asserts v is `${number}.${number}.${number}` {
	if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error(`Invalid semver: ${v}`);
}
```

## Acceptance Criteria

- [ ] All 16 MCP tools callable with identical names and input schemas
- [ ] `bun run start <url> <token>` works (stdio transport)
- [ ] `bun run start -- --http --port 3000` works (HTTP transport)
- [ ] `GET /health` returns 200 on HTTP transport
- [ ] `MCP_API_KEY` set -> HTTP requests without valid Bearer get 401
- [ ] `MCP_API_KEY` unset -> HTTP requests work without auth
- [ ] stdio transport ignores `MCP_API_KEY` entirely
- [ ] `bun test` passes
- [ ] `bun run typecheck` passes with zero `any`/`as` casts
- [ ] `bun run bd` produces working bundle
- [ ] Package version bumped to next major

## Test Strategy

| Layer       | What                            | How                                                       |
| ----------- | ------------------------------- | --------------------------------------------------------- |
| Unit        | `PaperlessAPI` methods          | Existing tests (unchanged)                                |
| Smoke       | Tool registration compiles      | `bun run typecheck` — type errors catch schema mismatches |
| Integration | Full server startup + tool call | `npx fastmcp dev` or MCP inspector manual verification    |
| Bundle      | Dist works as standalone        | `node dist/index.js <url> <token>` after `bun run bd`     |

## Risks & Mitigations

| Risk                                                          | Likelihood | Impact | Mitigation                                                                  |
| ------------------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------- |
| `z.object()` wrapping subtly changes schema JSON              | Low        | Low    | MCP clients don't depend on schema structure, only tool name + args         |
| Bundle size increase (Hono + mcp-proxy replace Express)       | Medium     | Low    | Server-side tool; bundle size irrelevant. Verify `bun run bd` still works.  |
| FastMCP stateless mode requires non-null auth return          | Medium     | Medium | Use stateful mode (default). Only add `authenticate` when `MCP_API_KEY` set |
| `pkg.version` string doesn't satisfy FastMCP template literal | High       | Low    | Runtime `assertSemver()` type guard. No `as` cast.                          |
| FastMCP internal SDK version lags behind direct SDK usage     | Low        | Medium | FastMCP bundles SDK ^1.24.3; verify compat during D5.                       |

## Trade-offs Made

| Chose                                    | Over                            | Because                                                                                      |
| ---------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------- |
| Stateful HTTP sessions (FastMCP default) | Stateless per-request (current) | Per-request was an SDK limitation, not intentional. Stateful gives session tracking, events. |
| `authenticate` callback                  | OAuth proxy                     | Single-instance Paperless bridge doesn't need identity delegation.                           |
| Optional auth (`MCP_API_KEY`)            | Mandatory auth                  | Many users run behind VPN/reverse proxy. Forcing auth adds friction.                         |
| Keep `register*Tools()` pattern          | Inline all tools in `index.ts`  | Maintains file organization, matches FastMCP closure-capture idiom.                          |
| Drop Express                             | Keep Express alongside FastMCP  | FastMCP uses Hono internally; Express becomes dead weight.                                   |
| Keep custom `PaperlessAPI`               | Adopt `paperless-node`          | Missing bulk endpoints, zero community, heavy deps, missing API version header.              |

## Key Technical Decisions

- **FastMCP over raw SDK**: eliminates ~100 lines boilerplate, gains health/auth/CORS
- **Stateful over stateless HTTP**: per-request was accidental, not designed
- **Bearer auth over OAuth**: pragmatic for single-instance bridge
- **Zod v4 retained**: FastMCP's Standard Schema supports it natively
- **`register*Tools()` pattern preserved**: closure capture over `api` maps 1:1

## Investigated & Rejected

### `paperless-node` npm package

| Factor              | Issue                                                           |
| ------------------- | --------------------------------------------------------------- |
| Missing endpoints   | `bulkEditDocuments` and `bulkEditObjects` not exposed (2 of 16) |
| Missing API version | No `version=6` Accept header                                    |
| Community           | 0 stars, ~3 downloads/week, single author                       |
| Dependencies        | Adds `axios` + `dotenv` + `form-data` + `qs`                    |
| Search semantics    | Doesn't strip content fields for token reduction                |

Architecture is well-designed (OpenAPI codegen, resource pattern). Worth studying
if `PaperlessAPI` is ever rewritten, but not viable as drop-in today.

## Open Questions

- [ ] FastMCP v3.33+ bundles SDK ^1.24.3 — any features from ^1.26.0 we rely
      on? -> Owner: verify via `npm ls` after migration
- [ ] Does `bun build --target=node` correctly bundle FastMCP + Hono +
      mcp-proxy? -> Owner: verify in D5

## Success Metrics

- `index.ts` drops from ~175 lines to ~60-80 lines
- Zero transport/lifecycle boilerplate (no Express, no manual session handling)
- Health check endpoint works without custom code
- Auth available with single env var, zero tool-level changes
