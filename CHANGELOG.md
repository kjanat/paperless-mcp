# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Moved all runtime dependencies (`@modelcontextprotocol/sdk`, `zod`, `express`)
  to `devDependencies` — bundle is fully self-contained, consumers no longer
  download ~50 MB of unused packages.
- Removed `"claude"` from package keywords.

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

- Typed API client (`PaperlessAPI`) with all responses derived from Paperless-NGX
  OpenAPI schema v6.0.0.
- Unit tests for `PaperlessAPI` (32 tests via `bun test`).
- OpenAPI schema snapshot script (`scripts/openapi.py`) and generated schema.
- `tsgo` typecheck support.
- `AGENTS.md` project knowledge base and Paperless-NGX skill files.
- Hierarchical AGENTS.md documentation.
- Shared `jsonResult()` helper for consistent tool responses.
- Job-level permissions to npm-publish workflow for provenance.

### Changed

- Migrated runtime, bundler, and test runner from npm to **Bun**.
- Reformatted entire codebase with dprint (tab indentation, single quotes).
- Strictened tsconfig: ESNext target/module, strict mode enabled.
- Renamed `PaperlessAPI.ts` to `paperless-api.ts` (kebab-case convention).
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

[Unreleased]: https://github.com/kjanat/paperless-mcp/compare/v2.0.1...HEAD
[2.0.1]: https://github.com/kjanat/paperless-mcp/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/kjanat/paperless-mcp/compare/v1.0.1-dev.2...v2.0.0
[1.0.1-dev.2]: https://github.com/kjanat/paperless-mcp/compare/v1.0.1-dev.1...v1.0.1-dev.2
[1.0.1-dev.1]: https://github.com/kjanat/paperless-mcp/compare/v1.0.1-dev.0...v1.0.1-dev.1
[1.0.1-dev.0]: https://github.com/kjanat/paperless-mcp/compare/4ba7457...v1.0.1-dev.0

<!--markdownlint-disable-file no-duplicate-heading-->