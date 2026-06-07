# `openapi` — Paperless-ngx schema tool

Generate, snapshot, extract, and diff the [Paperless-ngx](https://github.com/paperless-ngx/paperless-ngx)
OpenAPI schema that `paperless-mcp`'s typed client is generated from.

The headline trick: `generate` produces the **canonical** schema by importing
the Paperless-ngx Django app directly and running `drf-spectacular` — **no
running server, no database, no network**. The schema is derived purely from
the upstream serializer and viewset source, so it always matches the pinned
upstream revision rather than whatever a live instance happens to be running.

## Where it sits in the pipeline

```
paperless-ngx source ──generate──▶ schemas/openapi.json    (full schema)
                                          │
                                       extract             (keep only PATHS_WE_USE)
                                          ▼
                                   schemas/subset.json
                                          │
                                    openapi-ts (gen:zod)
                                          ▼
                                  src/api/generated/**     (Zod + TS client)
```

- `schemas/openapi.json` — full upstream schema snapshot.
- `schemas/subset.json` — only the paths `paperless-mcp` actually calls
  (`PATHS_WE_USE` in [`main.py`](main.py)), with referenced `components`
  resolved transitively so the file is self-contained.

## Requirements

- Python `>=3.14` and [`uv`](https://docs.astral.sh/uv/) (deps are declared in
  the repo-root [`pyproject.toml`](../../pyproject.toml)).
- Dependencies are resolved by `uv` automatically: `django`, `paperless-ngx`
  (pinned to the upstream `dev` branch via a git source), and `pyyaml`.

No manual install step is needed — `uv run` syncs the environment on demand.

## Usage

Invoke via the `openapi` console script under `uv run` (or through `runner` /
the npm scripts described below):

```sh
# Generate the full schema from the pinned paperless-ngx source and save it
uv run openapi generate -o schemas/openapi.json

# Generate straight to a subset (only the paths paperless-mcp uses)
uv run openapi generate -o schemas/subset.json --extract

# Extract a subset from an existing full snapshot
uv run openapi extract schemas/openapi.json -o schemas/subset.json

# Diff two snapshots (exit code 1 when they differ)
uv run openapi diff schemas/old.json schemas/new.json

# Diff a snapshot against a live instance, limited to the paths we use
uv run openapi diff schemas/subset.json -u http://localhost:8000 -t <token> --our-paths

# Fetch the schema from a live instance instead of generating (optional)
uv run openapi fetch -u http://localhost:8000 -t <token> -o schemas/openapi.json
```

### Commands

| Command    | What it does                                                                    |
| ---------- | ------------------------------------------------------------------------------- |
| `generate` | Build the schema offline from the installed `paperless-ngx` source.             |
| `fetch`    | Download the schema from a live instance's `/api/schema/` endpoint.             |
| `extract`  | Reduce a full schema to just `PATHS_WE_USE` plus the components they reference. |
| `diff`     | Structurally compare two schemas (file vs file, or file vs live instance).      |

`generate` and `fetch` accept `--extract` to subset in the same step.\
`diff` accepts `--our-paths` to compare only the paths `paperless-mcp` uses.

### Environment variables

| Variable        | Used by         | Purpose                                      |
| --------------- | --------------- | -------------------------------------------- |
| `PAPERLESS_URL` | `fetch`, `diff` | Default base URL when `--url` is omitted.    |
| `API_KEY`       | `fetch`, `diff` | Default API token when `--token` is omitted. |

`generate` sets a handful of `PAPERLESS_*` variables itself (pointing at throwaway temp dirs) so the Django settings module imports cleanly;\
it does not read your real Paperless configuration.

## npm / `runner` scripts

Day-to-day this tool is driven from the repo-root `package.json`, which wraps it
with formatting and downstream codegen:

| Script           | Effect                                                                 |
| ---------------- | ---------------------------------------------------------------------- |
| `run gen:schema` | `openapi generate` → `schemas/openapi.json`, then `dprint fmt`.        |
| `run gen:subset` | `openapi extract` → `schemas/subset.json`, then `dprint fmt`.          |
| `run gen:zod`    | Run `openapi-ts` to regenerate `src/api/generated/**` from the subset. |
| `run gen`        | `gen:subset` + `gen:zod`.                                              |
| `run gen:full`   | `gen:schema` + `gen` — full regenerate from upstream source.           |

## A note on `int64` normalization

`extract` strips `format: int64` from integer fields whose declared `maximum`
fits inside JavaScript's safe-integer range (`Number.MAX_SAFE_INTEGER`).
`paperless-mcp`'s client returns raw `fetch` JSON where every number is a JS
`number` (never a `BigInt`), so upstream `int64` declarations on safe-range
fields (e.g. `archive_serial_number`, a uint32) would otherwise make codegen
emit `bigint` types that misrepresent the runtime value. `int64` without a
safe `maximum` is left untouched.

## Programmatic API

The same building blocks are importable:

```python
from pathlib import Path

from openapi.main import diff_schemas, generate_schema, load_schema, save_schema

schema = generate_schema()                       # from installed paperless-ngx
save_schema(schema, Path("schemas/openapi.json"))

old = load_schema(Path("schemas/openapi.json"))
new = generate_schema()
changes = diff_schemas(old, new)
if changes.has_changes:
    print(changes.summary())
```

## CI

Two workflows keep the generated artifacts honest:

- **Schema drift check** (`.github/workflows/schema-check.yml`) — fails a PR if
  the committed `schemas/subset.json` / `src/api/generated/**` don't match what
  the tools reproduce.
- **Schema upstream sync** (`.github/workflows/schema-update.yml`) — regenerates
  against the latest upstream `paperless-ngx` and opens a PR when anything
  changed.
