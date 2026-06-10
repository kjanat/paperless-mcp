# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.5.0] - 2026-06-10

### Added

- `update_document` tool wrapping `PATCH /api/documents/{id}/` — rename a
  document's title, set or clear its archive serial number, set custom field
  values, and add a note on a single document. The backend bulk endpoint has no
  `set_title` method, so titles could previously only be changed in the web UI
  ([#11](https://github.com/kjanat/paperless-mcp/issues/11)). Input schema is
  derived from the generated `zPatchedDocumentRequestWritable`; `note` fans out
  to `POST /api/documents/{id}/notes/` internally since Paperless manages notes
  on a separate endpoint.

## [2.4.0] - 2026-06-07

### Changed

- Migrate CLI argument parsing from Node's `util.parseArgs` to the schema-first
  [`@kjanat/dreamcli`](https://dreamcli.kjanat.com) framework. Flag/arg types,
  environment fallbacks, `-V`/`--version`, and `-h`/`--help` are now derived from
  the command schema, with structured validation errors (including `--json`).
- **HTTP transport now binds to loopback (`127.0.0.1`) by default** instead of
  `0.0.0.0`. The MCP SDK auto-enables DNS-rebinding protection on loopback; to
  expose the server on another interface, set `--host` and pair it with
  `--allowed-hosts`.
- The base URL is validated at parse time — non-`http(s)` schemes and malformed
  URLs are rejected with a clear error, and any trailing slash is stripped.

### Added

- `--host` / `PAPERLESS_MCP_HOST` to choose the HTTP bind interface.
- `--allowed-hosts` / `PAPERLESS_MCP_ALLOWED_HOSTS` to set a Host-header
  allowlist (DNS-rebinding protection) when binding a non-loopback interface.
- Graceful shutdown: `SIGINT`/`SIGTERM` drain in-flight HTTP requests (force-close
  after a 10s grace period) and close the stdio server before exiting.

## [2.3.2] - 2026-06-07

### Changed

- Repackage the OpenAPI codegen as a uv project (`scripts/openapi/`), format the
  generated Zod in `gen`, and rework the schema CI (`uv sync` frozen for the
  drift check vs. upgrade for the sync job, which now commits `uv.lock`).
  Dev-tooling only — no change to the published runtime.

## [2.3.1] - 2026-06-07

### Added

- CI: auto-fill GitHub release notes from the matching `CHANGELOG.md` section on
  publish (`release-notes.yml` + `scripts/release-notes.mjs`), so release bodies
  always mirror the changelog.

### Fixed

- Escape all regex metacharacters (not just `.`) when matching a version's
  changelog section, per CodeQL "incomplete string escaping".

## [2.3.0] - 2026-06-07

### Added

- `-V`/`--version` prints the version, and `-h`/`--help` prints usage — both
  exit cleanly instead of erroring with `ERR_PARSE_ARGS_UNKNOWN_OPTION`.

## [2.2.2] - 2026-06-07

### Changed

- Sync the generated API schema with the upstream Paperless-ngx OpenAPI spec.
  Regenerating `src/api/generated/zod.gen.ts` updates the bulk-edit `method`
  enum and request shapes and picks up new optional fields (`title_search`,
  `follow_formatting`). The MCP tool set is unchanged.

### Added

- Schema-drift CI: `schema-check` fails a PR when the committed generated
  artifacts are out of sync with the OpenAPI schema, and a weekly
  `schema-update` job opens a PR when the upstream Paperless-ngx schema changes.

## [2.2.1] - 2026-06-07

### Fixed

- Point the npm publish workflow environment URL at the `/package/` path so the
  deployment link resolves to the published version page.

## [2.2.0] - 2026-06-07

### Changed

- Derive API model types in `src/types.ts` from generated Zod schemas
  (`src/api/generated/zod.gen.ts`) instead of hand-maintaining them, so models
  can no longer silently drift from the Paperless-ngx OpenAPI schema. Generate
  with `bun run gen` (extracts the endpoint subset, then runs
  `@hey-api/openapi-ts` with the Zod v4 plugin). Almost every type is now
  inferred; only the `PaginatedList<T>` generic, `PaginatedDocumentList.results`
  (deliberately stripped), and `bulk_edit_objects` request body remain
  hand-written.
- Validate `matching_algorithm` in the tag/correspondent/document-type tools
  against the generated `zMatchingAlgorithm` schema instead of repeating an
  inline `z.number().int().min(0).max(6)` in four places. Its MCP field
  description is now sourced from the schema's metadata (enabled via the Zod
  plugin's `metadata` option), removing four duplicated hand-written
  descriptions — the generated `.register()` metadata reaches the LLM through
  the MCP SDK's Zod v4 JSON-schema conversion.
- Normalize safe-range `int64` integer fields to plain integers in the schema
  extract step, so fields like `archive_serial_number` are typed as `number`
  (matching the client's raw-JSON responses) rather than `bigint`.
- Use the generated `zMethodEnum` / `zOperationEnum` schemas for the bulk-edit
  `method` and `operation` tool inputs instead of hand-listing the 16
  document-method values and the `set_permissions`/`delete` operation in four
  places.
- Factor the repeated `view`/`change` permissions input shared by the
  tag/correspondent/document-type bulk-edit tools into a single
  `permissionsInput()` helper, keeping the per-resource descriptions.

### Fixed

- Restore Paperless-ngx document bulk-edit payloads to the documented nested
  `parameters` shape while still filtering irrelevant method arguments.
- Forward `split`, `delete_pages`, `modify_custom_fields`, `edit_pdf`, and
  `remove_password` method parameters correctly.
- Update the bundled Paperless-ngx skill and README bulk-edit docs for complete
  list pagination and all supported document bulk-edit methods.

## [2.1.2] - 2026-06-07

### Fixed

- Keep README code examples formatted with spaces by overriding the remote dprint
  tab configuration for the README Prettier plugin.
- Use the correct `npm.im` package-version URL in the npm publish environment.

## [2.1.1] - 2026-06-07

### Changed

- Return complete tag, correspondent, and document type lists across all pages
  instead of only first-page details.
- Harden npm publishing by using frozen Bun installs, running format/type/test
  checks before release, reading publish metadata from package config, and using
  `.npm-version` for the npm CLI version.
- Update development dependencies, while keeping `dprint` pinned to `0.51.1` for
  current Linux glibc compatibility.

### Fixed

- Send document bulk-edit operation parameters at the top level expected by
  Paperless-ngx instead of nesting them under `parameters`.
- Ignore irrelevant document bulk-edit arguments for the selected method, avoiding
  invalid API payloads when optional tool fields are present.

## [2.1.0] - 2026-02-21

### Added

- Environment variable config: `PAPERLESS_URL` + `PAPERLESS_API_KEY` (or legacy
  `API_KEY`). Works in both stdio and HTTP modes. CLI args still take precedence.
- Agent Skill section in README with install command, moved higher for
  visibility.
- OpenCode project config (`.opencode/opencode.jsonc`).
- `engines.node >= 22` requirement in package.json.
- `@/` and `$/` tsconfig path aliases for cleaner imports.
- `@types/express` dev dependency.

### Changed

- CLI argument parsing rewritten with `node:util` `parseArgs` — replaces
  hand-rolled parsing with stricter validation.
- `--port` validates range 1–65535; rejects invalid values instead of silently
  defaulting to 3000.
- JSON-RPC error responses use SDK's `JSONRPCErrorResponse` type — dropped
  custom `JsonRpcError` interface.
- Flattened `index.ts` structure: `createServer()`, `handleMcpHttpRequest()`,
  `sendJsonRpcError()`, `normalizeBaseUrl()` extracted as top-level functions.
- All internal imports use `@/` path alias (`@/tools/...`, `@/api/...`).
- Moved all production dependencies (`@modelcontextprotocol/sdk`, `zod`) and
  optional dependency (`express`) to `devDependencies` — bundle is fully
  self-contained, consumers no longer download ~50 MB of unused packages.
- Removed `"claude"` from package keywords.
- MCP server version read from `package.json` at build time — no longer
  hardcoded.
- Removed unused GraphQL plugin from dprint config.

### Fixed

- Skill docs: `matching_algorithm` is integer `0-6` across all endpoints (tags,
  correspondents, document types) — was incorrectly documented as string enum
  for correspondents/types and wrong numeric range for tags.
- Skill docs: `test-connection.sh` API version header updated from v5 to v6.
- Skill docs: SKILL.md description uses third-person voice per best practices.
- Skill docs: `update_tag` `name` param marked optional (PATCH endpoint).
- Skill docs: `archive_serial_number` type corrected from string to integer.
- Skill docs: added table of contents to tools.md and workflows.md.
- Skill docs: added verification steps to merge, upload, and tag-cleanup
  workflows.
- Removed `!` non-null assertion in CLI arg parsing (project convention).
- Inconsistent `Paperless-NGX` casing -> `Paperless-ngx` in tool descriptions,
  types, and API docs.

## [2.0.1] - 2026-02-21

### Added

- This changelog.

### Removed

- `main` field from package.json — bin-only package, stops leaking `src/index.ts`
  into the published tarball.

## [2.0.0] - 2026-02-21

### Added

- dprint formatter configuration.
- Format check (`dprint check`) to CI workflow.

### Changed

- **BREAKING**: Upgraded to Zod v4 (via PR #2). Tool input schemas use `zod`
  v4 API — consumers pinning Zod v3 may need to update.
- Upgraded all dependencies to latest.
- Strictened tsconfig: `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`,
  all `noUnused*`/`noImplicit*` flags enabled.
- Full type-safe codebase — eliminated all `any` types and unsafe casts.

## [1.0.1-dev.2] - 2026-02-21

*No user-facing changes. Version bump only.*

## [1.0.1-dev.1] - 2026-02-21

### Added

- MIT license file.
- Shebang banner (`#!/usr/bin/env node`) in build output.
- `publishConfig` for scoped dev releases.

### Removed

- SSE transport support — replaced by Streamable HTTP in 1.0.1-dev.0.

## [1.0.1-dev.0] - 2026-02-21

This is the first release after forking from [nloui/paperless-mcp](https://github.com/nloui/paperless-mcp).
Major rewrite of internals while preserving the same MCP tool surface.

### Added

- Typed API client (`PaperlessAPI`) with all responses derived from Paperless-ngx
  OpenAPI schema v6.0.0.
- Unit tests for `PaperlessAPI` (32 tests via `bun test`).
- OpenAPI schema snapshot script (`scripts/openapi.py`) and generated schema.
- `tsgo` typecheck support.
- `AGENTS.md` project knowledge base and Paperless-ngx skill files.
- Hierarchical AGENTS.md documentation.
- Shared `jsonResult()` helper for consistent tool responses.
- Job-level permissions to npm-publish workflow for provenance.

### Changed

- Migrated runtime, bundler, and test runner from npm to **Bun**.
- Reformatted entire codebase with dprint (tab indentation, single quotes).
- Strictened tsconfig: ESNext target/module, strict mode enabled.
- Renamed `PaperlessAPI.ts` to `paperless.ts` (kebab-case convention).
- Moved `express` to `optionalDependencies` (only needed for HTTP transport).
- Stateless HTTP transport: fresh `McpServer` created per request.

### Fixed

- `request()` crash on 204 No Content responses.
- `downloadDocument` missing `response.ok` check.
- `matching_algorithm` incorrectly typed as string instead of int (0–6).
- Invalid `--port` flag now warns instead of silently ignoring.
- README: removed references to nonexistent tools, corrected tool docs.
- `openapi.py`: URL scheme validation, YAML parsing, tmpdir cleanup.

### Removed

- Docker support (Dockerfile was broken, used npm-based build).
- Smithery configuration (broken `smithery.yaml`).
- Obsolete Cursor rules.

[Unreleased]: https://github.com/kjanat/paperless-mcp/compare/v2.5.0...HEAD
[2.5.0]: https://github.com/kjanat/paperless-mcp/compare/v2.4.0...v2.5.0
[2.4.0]: https://github.com/kjanat/paperless-mcp/compare/v2.3.2...v2.4.0
[2.3.2]: https://github.com/kjanat/paperless-mcp/compare/v2.3.1...v2.3.2
[2.3.1]: https://github.com/kjanat/paperless-mcp/compare/v2.3.0...v2.3.1
[2.3.0]: https://github.com/kjanat/paperless-mcp/compare/v2.2.2...v2.3.0
[2.2.2]: https://github.com/kjanat/paperless-mcp/compare/v2.2.1...v2.2.2
[2.2.1]: https://github.com/kjanat/paperless-mcp/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/kjanat/paperless-mcp/compare/v2.1.2...v2.2.0
[2.1.2]: https://github.com/kjanat/paperless-mcp/compare/v2.1.1...v2.1.2
[2.1.1]: https://github.com/kjanat/paperless-mcp/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/kjanat/paperless-mcp/compare/v2.0.1...v2.1.0
[2.0.1]: https://github.com/kjanat/paperless-mcp/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/kjanat/paperless-mcp/compare/v1.0.1-dev.2...v2.0.0
[1.0.1-dev.2]: https://github.com/kjanat/paperless-mcp/compare/v1.0.1-dev.1...v1.0.1-dev.2
[1.0.1-dev.1]: https://github.com/kjanat/paperless-mcp/compare/v1.0.1-dev.0...v1.0.1-dev.1
[1.0.1-dev.0]: https://github.com/kjanat/paperless-mcp/compare/4ba7457...v1.0.1-dev.0

<!--markdownlint-disable-file no-duplicate-heading-->
