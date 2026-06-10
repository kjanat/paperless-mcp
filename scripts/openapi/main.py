#!/usr/bin/env -S uv run
"""Generate, snapshot, and diff Paperless-ngx OpenAPI schemas.

The primary command is ``generate``, which imports the Paperless-ngx Django
app (installed as a ``uv`` inline-script dependency) and uses
``drf-spectacular`` to produce the canonical OpenAPI 3.0 schema — **no
running server required**.

Programmatic API
~~~~~~~~~~~~~~~~
::

    from scripts.openapi import generate_schema, load_schema, save_schema, diff_schemas

    schema = generate_schema()                       # from installed paperless-ngx
    save_schema(schema, Path("schemas/openapi.json"))

    old = load_schema(Path("schemas/openapi.json"))
    new = generate_schema()
    changes = diff_schemas(old, new)

CLI (via ``uv run``)
~~~~~~~~~~~~~~~~~~~~
::

    # Generate schema from the paperless-ngx source dep and save
    uv run openapi generate -o schemas/openapi.json

    # Generate only the endpoints we use
    uv run openapi generate -o schemas/subset.json --extract

    # Extract a subset from an existing full snapshot
    uv run openapi extract schemas/openapi.json -o schemas/subset.json

    # Diff two snapshots
    uv run openapi diff schemas/old.json schemas/new.json

    # Fetch schema from a live instance instead (optional)
    uv run openapi fetch -u http://localhost:8000 -t <token> -o schemas/openapi.json

Environment variables ``PAPERLESS_URL`` and ``API_KEY`` are used as
defaults when ``--url`` / ``--token`` are omitted for the ``fetch`` command.
"""

import argparse
import atexit
import io
import json
import os
import shutil
import sys
import tempfile
import traceback
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from http.client import HTTPResponse
from pathlib import Path
from typing import cast

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

#: Any value that can appear in parsed JSON. OpenAPI schemas are arbitrary
#: nested JSON, so the walkers below operate on this recursive union and narrow
#: with ``isinstance`` rather than reaching for ``Any``.
type JSONValue = (
    dict[str, JSONValue] | list[JSONValue] | str | int | float | bool | None
)

#: A parsed OpenAPI document — always a JSON object at the top level.
type Schema = dict[str, JSONValue]


def _as_dict(value: JSONValue | None) -> dict[str, JSONValue]:
    """Narrow *value* to a JSON object, or ``{}`` when it isn't one."""
    return value if isinstance(value, dict) else {}


def _as_list(value: JSONValue | None) -> list[JSONValue]:
    """Narrow *value* to a JSON array, or ``[]`` when it isn't one."""
    return value if isinstance(value, list) else []


def _path_count(schema: Schema) -> int:
    """Number of entries under the schema's ``paths`` object."""
    return len(_as_dict(schema.get("paths")))


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: Paths consumed by paperless-mcp (relative to /api/).
#: Keeps extract/diff focused on what matters.
PATHS_WE_USE: tuple[str, ...] = (
    "/api/documents/",
    "/api/documents/bulk_edit/",
    "/api/documents/post_document/",
    "/api/documents/{id}/",
    "/api/documents/{id}/download/",
    "/api/documents/{id}/notes/",
    "/api/tags/",
    "/api/tags/{id}/",
    "/api/correspondents/",
    "/api/correspondents/{id}/",
    "/api/document_types/",
    "/api/document_types/{id}/",
    "/api/storage_paths/",
    "/api/storage_paths/{id}/",
    "/api/custom_fields/",
    "/api/custom_fields/{id}/",
    "/api/tasks/",
    "/api/trash/",
    "/api/bulk_edit_objects/",
)

SCHEMA_ENDPOINT = "/api/schema/"

# ---------------------------------------------------------------------------
# Core: fetch / load / save
# ---------------------------------------------------------------------------


def fetch_schema(
    base_url: str,
    *,
    token: str | None = None,
    format: str = "json",
    timeout: int = 30,
) -> Schema:
    """Fetch the OpenAPI schema from a live Paperless-ngx instance.

    Parameters
    ----------
    base_url:
        Root URL of the Paperless-ngx instance (e.g. ``http://localhost:8000``).
    token:
        API authentication token.  When *None*, the request is sent without
        credentials (works only if the schema endpoint is public).
    format:
        Response format — ``"json"`` (default) or ``"yaml"``.
    timeout:
        HTTP timeout in seconds.

    Returns
    -------
    dict
        Parsed OpenAPI schema.

    Raises
    ------
    urllib.error.URLError
        On network / HTTP errors.
    json.JSONDecodeError
        If the response is not valid JSON.
    """
    parsed = urllib.parse.urlparse(base_url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(
            f"Unsupported URL scheme {parsed.scheme!r} in base_url; only http and https are allowed"
        )

    url = base_url.rstrip("/") + SCHEMA_ENDPOINT
    if format == "yaml":
        url += "?format=yaml"

    headers: dict[str, str] = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Token {token}"

    req = urllib.request.Request(url, headers=headers)
    # urlopen is typed as returning Any by the stdlib stubs; pin the concrete
    # response type so the body decode below stays typed.
    with cast(HTTPResponse, urllib.request.urlopen(req, timeout=timeout)) as resp:
        body = resp.read().decode("utf-8")

    schema: Schema
    if format == "yaml":
        try:
            import yaml
        except ImportError as exc:
            raise ImportError(
                "PyYAML is required to parse YAML responses; add 'pyyaml' to script dependencies"
            ) from exc
        schema = cast(Schema, yaml.safe_load(body))
    else:
        schema = cast(Schema, json.loads(body))
    return schema


def load_schema(path: Path) -> Schema:
    """Load a previously-saved OpenAPI schema snapshot from *path*."""
    with path.open("r", encoding="utf-8") as fh:
        return cast(Schema, json.load(fh))


def save_schema(
    schema: Schema,
    path: Path,
    *,
    sort_keys: bool = True,
) -> None:
    """Write *schema* to *path* as sorted, indented JSON.

    Creates parent directories as needed.  Sorted keys produce stable
    diffs across snapshots.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(schema, fh, indent=2, sort_keys=sort_keys)
        _ = fh.write("\n")


# ---------------------------------------------------------------------------
# Generate: produce OpenAPI schema from installed paperless-ngx source
# ---------------------------------------------------------------------------


def generate_schema() -> Schema:
    """Generate the OpenAPI schema from the installed ``paperless-ngx`` package.

    Bootstraps Django with minimal config (temp dirs, SQLite in-memory),
    then invokes ``drf-spectacular``'s schema generator.  **No running
    Paperless-ngx server is required** — the schema is derived purely from
    the serializer and viewset definitions in the source.

    The ``paperless-ngx`` package must be importable (installed via the
    inline script dependency or into the current environment).

    Returns
    -------
    dict
        Parsed OpenAPI 3.0 schema.
    """
    tmpdir = tempfile.mkdtemp(prefix="paperless_schema_")
    _ = atexit.register(shutil.rmtree, tmpdir, ignore_errors=True)
    data_dir = Path(tmpdir) / "data"
    data_dir.mkdir()
    (data_dir / "log").mkdir()

    # Minimal env — settings.py reads these at import time.
    _ = os.environ.setdefault("PAPERLESS_SECRET_KEY", "schema-generation-only")
    _ = os.environ.setdefault("PAPERLESS_DATA_DIR", str(data_dir))
    _ = os.environ.setdefault("PAPERLESS_LOGGING_DIR", str(data_dir / "log"))
    _ = os.environ.setdefault("PAPERLESS_STATICDIR", str(Path(tmpdir) / "static"))
    _ = os.environ.setdefault("PAPERLESS_MEDIA_ROOT", str(Path(tmpdir) / "media"))
    _ = os.environ.setdefault("DJANGO_SETTINGS_MODULE", "paperless.settings")

    # paperless-ngx ships no type stubs; its bootstrap API is untypeable here.
    import django

    django.setup()

    from django.core.management import (
        call_command,
    )

    out = io.StringIO()
    _ = call_command(
        "spectacular", "--format", "openapi-json", "--validate", stdout=out
    )
    return cast(Schema, json.loads(out.getvalue()))


# ---------------------------------------------------------------------------
# Extract: keep only the paths we care about
# ---------------------------------------------------------------------------


def extract_paths(
    schema: Schema,
    paths: tuple[str, ...] = PATHS_WE_USE,
) -> Schema:
    """Return a copy of *schema* containing only *paths* and referenced components.

    The returned schema is self-contained: any ``$ref`` targets reachable from
    the kept paths are resolved and included in ``components``.
    """
    all_paths = _as_dict(schema.get("paths"))
    kept_paths: dict[str, JSONValue] = {}

    for pattern in paths:
        if pattern in all_paths:
            kept_paths[pattern] = all_paths[pattern]

    # Collect referenced components transitively.
    components = _as_dict(schema.get("components"))
    needed_refs: set[str] = set()
    _collect_refs(kept_paths, needed_refs)
    # Iterate until stable (handles refs-to-refs).
    prev_size = -1
    while len(needed_refs) != prev_size:
        prev_size = len(needed_refs)
        for ref in list(needed_refs):
            obj = _resolve_ref(ref, schema)
            if obj is not None:
                _collect_refs(obj, needed_refs)

    kept_components = _prune_components(components, needed_refs)

    subset: Schema = {
        "openapi": schema.get("openapi", "3.0.0"),
        "info": schema.get("info", {}),
        "paths": kept_paths,
    }
    if kept_components:
        subset["components"] = kept_components
    _normalize_safe_int64(subset)
    return subset


#: Largest integer JavaScript represents exactly (Number.MAX_SAFE_INTEGER).
_JS_MAX_SAFE_INT = 2**53 - 1


def _normalize_safe_int64(obj: JSONValue) -> None:
    """Drop ``format: int64`` from integers that fit in a JS safe integer.

    paperless-mcp's client returns raw ``fetch`` JSON, where every number is a
    JS ``number`` — never a ``BigInt``. Upstream sometimes declares ``int64``
    on fields whose ``maximum`` is well within the safe range (e.g.
    ``archive_serial_number``, a uint32). Left as-is, codegen emits ``bigint``
    schemas/types that misrepresent the runtime value, forcing hand overrides.
    Stripping the format for safe-range fields lets the types be inferred
    faithfully. ``int64`` without a safe ``maximum`` is left untouched.
    """
    if isinstance(obj, dict):
        maximum = obj.get("maximum")
        if (
            obj.get("type") == "integer"
            and obj.get("format") == "int64"
            and isinstance(maximum, int)
            and maximum <= _JS_MAX_SAFE_INT
        ):
            del obj["format"]
        for value in obj.values():
            _normalize_safe_int64(value)
    elif isinstance(obj, list):
        for item in obj:
            _normalize_safe_int64(item)


def _collect_refs(obj: JSONValue, refs: set[str]) -> None:
    """Walk *obj* recursively and add every ``$ref`` value to *refs*."""
    if isinstance(obj, dict):
        ref = obj.get("$ref")
        if isinstance(ref, str):
            refs.add(ref)
        for v in obj.values():
            _collect_refs(v, refs)
    elif isinstance(obj, list):
        for item in obj:
            _collect_refs(item, refs)


def _resolve_ref(ref: str, schema: Schema) -> JSONValue | None:
    """Resolve a JSON ``$ref`` pointer like ``#/components/schemas/Tag``."""
    if not ref.startswith("#/"):
        return None
    parts = ref[2:].split("/")
    current: JSONValue = schema
    for part in parts:
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None
    return current


def _prune_components(
    components: dict[str, JSONValue],
    needed_refs: set[str],
) -> dict[str, JSONValue]:
    """Keep only component entries referenced by *needed_refs*."""
    pruned: dict[str, JSONValue] = {}
    for ref in needed_refs:
        if not ref.startswith("#/components/"):
            continue
        parts = ref.removeprefix("#/components/").split("/")
        if len(parts) != 2:
            continue
        category, name = parts
        cat_obj = components.get(category)
        if not (isinstance(cat_obj, dict) and name in cat_obj):
            continue
        existing = pruned.get(category)
        bucket: dict[str, JSONValue] = existing if isinstance(existing, dict) else {}
        bucket[name] = cat_obj[name]
        pruned[category] = bucket
    return pruned


# ---------------------------------------------------------------------------
# Diff: structural comparison of two schemas
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class SchemaDiff:
    """Result of comparing two OpenAPI schemas."""

    added_paths: list[str]
    removed_paths: list[str]
    changed_paths: dict[str, list[str]]

    @property
    def has_changes(self) -> bool:
        return bool(self.added_paths or self.removed_paths or self.changed_paths)

    def summary(self) -> str:
        """Human-readable summary."""
        lines: list[str] = []
        if self.added_paths:
            lines.append(f"Added paths ({len(self.added_paths)}):")
            lines.extend(f"  + {p}" for p in sorted(self.added_paths))
        if self.removed_paths:
            lines.append(f"Removed paths ({len(self.removed_paths)}):")
            lines.extend(f"  - {p}" for p in sorted(self.removed_paths))
        if self.changed_paths:
            lines.append(f"Changed paths ({len(self.changed_paths)}):")
            for path in sorted(self.changed_paths):
                for detail in self.changed_paths[path]:
                    lines.append(f"  ~ {path}: {detail}")
        if not lines:
            lines.append("No changes.")
        return "\n".join(lines)


def diff_schemas(
    old: Schema,
    new: Schema,
    *,
    paths_filter: tuple[str, ...] | None = None,
) -> SchemaDiff:
    """Structurally diff the *paths* section of two OpenAPI schemas.

    Parameters
    ----------
    old, new:
        Parsed OpenAPI schemas to compare.
    paths_filter:
        When set, only these paths are compared.  Defaults to all paths.

    Returns
    -------
    SchemaDiff
        Object describing added, removed, and changed paths.
    """
    old_paths = _as_dict(old.get("paths"))
    new_paths = _as_dict(new.get("paths"))

    if paths_filter is not None:
        old_paths = {k: v for k, v in old_paths.items() if k in paths_filter}
        new_paths = {k: v for k, v in new_paths.items() if k in paths_filter}

    old_keys = set(old_paths)
    new_keys = set(new_paths)

    added = sorted(new_keys - old_keys)
    removed = sorted(old_keys - new_keys)

    changed: dict[str, list[str]] = {}
    for path in sorted(old_keys & new_keys):
        diffs = _diff_path_item(old_paths[path], new_paths[path])
        if diffs:
            changed[path] = diffs

    return SchemaDiff(
        added_paths=added,
        removed_paths=removed,
        changed_paths=changed,
    )


def _diff_path_item(
    old: JSONValue,
    new: JSONValue,
) -> list[str]:
    """Compare a single path item and return a list of human-readable diffs."""
    old_item = _as_dict(old)
    new_item = _as_dict(new)
    diffs: list[str] = []
    all_methods = sorted(set(old_item) | set(new_item))

    for method in all_methods:
        if method.startswith("x-") or method == "parameters":
            continue
        if method in new_item and method not in old_item:
            diffs.append(f"method added: {method.upper()}")
        elif method in old_item and method not in new_item:
            diffs.append(f"method removed: {method.upper()}")
        elif method in old_item and method in new_item:
            diffs.extend(_diff_operation(method, old_item[method], new_item[method]))

    return diffs


def _diff_operation(
    method: str,
    old: JSONValue,
    new: JSONValue,
) -> list[str]:
    """Compare a single operation (method) within a path."""
    old_op = _as_dict(old)
    new_op = _as_dict(new)
    diffs: list[str] = []
    tag = method.upper()

    # Parameters
    old_params = {_param_key(p): p for p in _as_list(old_op.get("parameters"))}
    new_params = {_param_key(p): p for p in _as_list(new_op.get("parameters"))}
    for key in sorted(set(old_params) | set(new_params)):
        if key not in old_params:
            diffs.append(f"{tag} param added: {key}")
        elif key not in new_params:
            diffs.append(f"{tag} param removed: {key}")
        elif json.dumps(old_params[key], sort_keys=True) != json.dumps(
            new_params[key],
            sort_keys=True,
        ):
            diffs.append(f"{tag} param changed: {key}")

    # Request body schema
    old_body = _extract_body_schema(old_op)
    new_body = _extract_body_schema(new_op)
    if json.dumps(old_body, sort_keys=True) != json.dumps(new_body, sort_keys=True):
        diffs.append(f"{tag} request body changed")

    # Response codes
    old_responses = set(_as_dict(old_op.get("responses")))
    new_responses = set(_as_dict(new_op.get("responses")))
    for code in sorted(new_responses - old_responses):
        diffs.append(f"{tag} response added: {code}")
    for code in sorted(old_responses - new_responses):
        diffs.append(f"{tag} response removed: {code}")

    return diffs


def _param_key(param: JSONValue) -> str:
    p = _as_dict(param)
    in_ = p.get("in")
    name = p.get("name")
    in_str = in_ if isinstance(in_, str) else "?"
    name_str = name if isinstance(name, str) else "?"
    return f"{in_str}:{name_str}"


def _extract_body_schema(operation: JSONValue) -> JSONValue | None:
    op = _as_dict(operation)
    content = _as_dict(_as_dict(op.get("requestBody")).get("content"))
    json_content = content.get("application/json")
    if json_content is None:
        json_content = content.get("multipart/form-data")
    return _as_dict(json_content).get("schema")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _env_url() -> str | None:
    return os.environ.get("PAPERLESS_URL")


def _env_token() -> str | None:
    return os.environ.get("API_KEY")


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="openapi",
        description="Paperless-ngx OpenAPI schema snapshot tool.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # -- generate ------------------------------------------------------------
    gen = sub.add_parser(
        "generate",
        help="Generate schema from installed paperless-ngx source (no server needed).",
    )
    _ = gen.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("schemas/openapi.json"),
        help="Output path (default: schemas/openapi.json)",
    )
    _ = gen.add_argument(
        "--extract",
        action="store_true",
        help="Keep only paths used by paperless-mcp.",
    )

    # -- fetch ---------------------------------------------------------------
    fetch = sub.add_parser("fetch", help="Fetch schema from a live instance.")
    _ = fetch.add_argument(
        "-u",
        "--url",
        default=_env_url(),
        help="Paperless-ngx base URL (default: $PAPERLESS_URL)",
    )
    _ = fetch.add_argument(
        "-t", "--token", default=_env_token(), help="API token (default: $API_KEY)"
    )
    _ = fetch.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("schemas/openapi.json"),
        help="Output path (default: schemas/openapi.json)",
    )
    _ = fetch.add_argument(
        "--extract", action="store_true", help="Keep only paths used by paperless-mcp."
    )
    _ = fetch.add_argument(
        "--timeout", type=int, default=30, help="HTTP timeout in seconds."
    )

    # -- extract -------------------------------------------------------------
    extract = sub.add_parser(
        "extract", help="Extract only paths used by paperless-mcp."
    )
    _ = extract.add_argument(
        "input", type=Path, help="Full schema snapshot to extract from."
    )
    _ = extract.add_argument(
        "-o",
        "--output",
        type=Path,
        required=True,
        help="Output path for subset schema.",
    )

    # -- diff ----------------------------------------------------------------
    diff = sub.add_parser("diff", help="Diff two schemas (files or file vs live).")
    _ = diff.add_argument("file", type=Path, help="First schema file (baseline).")
    _ = diff.add_argument(
        "file2",
        type=Path,
        nargs="?",
        help="Second schema file. Omit to diff against live instance.",
    )
    _ = diff.add_argument(
        "-u",
        "--url",
        default=_env_url(),
        help="Paperless-ngx base URL (for live diff).",
    )
    _ = diff.add_argument(
        "-t", "--token", default=_env_token(), help="API token (for live diff)."
    )
    _ = diff.add_argument(
        "--our-paths",
        action="store_true",
        help="Only diff paths used by paperless-mcp.",
    )

    return parser


def _cmd_generate(args: argparse.Namespace) -> int:
    output = cast(Path, args.output)
    do_extract = cast(bool, args.extract)
    print("Generating schema from paperless-ngx source ...", file=sys.stderr)
    try:
        schema = generate_schema()
    except (ImportError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return 1

    if do_extract:
        schema = extract_paths(schema)
        print(f"Extracted {_path_count(schema)} paths.", file=sys.stderr)

    save_schema(schema, output)
    print(f"Saved {_path_count(schema)} paths to {output}", file=sys.stderr)
    return 0


def _cmd_fetch(args: argparse.Namespace) -> int:
    url = cast(str | None, args.url)
    token = cast(str | None, args.token)
    output = cast(Path, args.output)
    do_extract = cast(bool, args.extract)
    timeout = cast(int, args.timeout)
    if not url:
        print("error: --url or $PAPERLESS_URL required", file=sys.stderr)
        return 1

    print(f"Fetching schema from {url} ...", file=sys.stderr)
    try:
        schema = fetch_schema(url, token=token, timeout=timeout)
    except urllib.error.URLError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if do_extract:
        schema = extract_paths(schema)
        print(f"Extracted {_path_count(schema)} paths.", file=sys.stderr)

    save_schema(schema, output)
    print(f"Saved {_path_count(schema)} paths to {output}", file=sys.stderr)
    return 0


def _cmd_extract(args: argparse.Namespace) -> int:
    input_path = cast(Path, args.input)
    output = cast(Path, args.output)
    schema = load_schema(input_path)
    subset = extract_paths(schema)
    save_schema(subset, output)
    print(
        f"Extracted {_path_count(subset)}/{_path_count(schema)} paths to {output}",
        file=sys.stderr,
    )
    return 0


def _cmd_diff(args: argparse.Namespace) -> int:
    file = cast(Path, args.file)
    file2 = cast(Path | None, args.file2)
    url = cast(str | None, args.url)
    token = cast(str | None, args.token)
    our_paths = cast(bool, args.our_paths)
    old = load_schema(file)

    if file2 is not None:
        new = load_schema(file2)
    elif url:
        print(f"Fetching schema from {url} ...", file=sys.stderr)
        try:
            new = fetch_schema(url, token=token)
        except urllib.error.URLError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
    else:
        print("error: provide a second file or --url for live diff", file=sys.stderr)
        return 1

    paths_filter = PATHS_WE_USE if our_paths else None
    result = diff_schemas(old, new, paths_filter=paths_filter)
    print(result.summary())
    return 1 if result.has_changes else 0


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    command = cast(str, args.command)
    dispatch: dict[str, Callable[[argparse.Namespace], int]] = {
        "generate": _cmd_generate,
        "fetch": _cmd_fetch,
        "extract": _cmd_extract,
        "diff": _cmd_diff,
    }
    handler = dispatch.get(command)
    if handler is None:
        parser.print_help()
        return 1
    return handler(args)


if __name__ == "__main__":
    raise SystemExit(main())
