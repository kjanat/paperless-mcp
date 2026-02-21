#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.14"
# dependencies = [
#     "paperless-ngx",
# ]
#
# [tool.uv.sources]
# paperless-ngx = { git = "https://github.com/paperless-ngx/paperless-ngx.git" }
# ///
"""Generate, snapshot, and diff Paperless-NGX OpenAPI schemas.

The primary command is ``generate``, which imports the Paperless-NGX Django
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
    uv run scripts/openapi.py generate -o schemas/openapi.json

    # Generate only the endpoints we use
    uv run scripts/openapi.py generate -o schemas/subset.json --extract

    # Extract a subset from an existing full snapshot
    uv run scripts/openapi.py extract schemas/openapi.json -o schemas/subset.json

    # Diff two snapshots
    uv run scripts/openapi.py diff schemas/old.json schemas/new.json

    # Fetch schema from a live instance instead (optional)
    uv run scripts/openapi.py fetch -u http://localhost:8000 -t <token> -o schemas/openapi.json

Environment variables ``PAPERLESS_URL`` and ``API_KEY`` are used as
defaults when ``--url`` / ``--token`` are omitted for the ``fetch`` command.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

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
    "/api/tags/",
    "/api/tags/{id}/",
    "/api/correspondents/",
    "/api/correspondents/{id}/",
    "/api/document_types/",
    "/api/document_types/{id}/",
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
    format: str = "json",  # noqa: A002 — shadows builtin intentionally
    timeout: int = 30,
) -> dict[str, Any]:
    """Fetch the OpenAPI schema from a live Paperless-NGX instance.

    Parameters
    ----------
    base_url:
        Root URL of the Paperless-NGX instance (e.g. ``http://localhost:8000``).
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
    url = base_url.rstrip("/") + SCHEMA_ENDPOINT
    if format == "yaml":
        url += "?format=yaml"

    headers: dict[str, str] = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Token {token}"

    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8")

    schema: dict[str, Any] = json.loads(body)
    return schema


def load_schema(path: Path) -> dict[str, Any]:
    """Load a previously-saved OpenAPI schema snapshot from *path*."""
    with path.open("r", encoding="utf-8") as fh:
        schema: dict[str, Any] = json.load(fh)
    return schema


def save_schema(
    schema: dict[str, Any],
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
        fh.write("\n")


# ---------------------------------------------------------------------------
# Generate: produce OpenAPI schema from installed paperless-ngx source
# ---------------------------------------------------------------------------


def generate_schema() -> dict[str, Any]:
    """Generate the OpenAPI schema from the installed ``paperless-ngx`` package.

    Bootstraps Django with minimal config (temp dirs, SQLite in-memory),
    then invokes ``drf-spectacular``'s schema generator.  **No running
    Paperless-NGX server is required** — the schema is derived purely from
    the serializer and viewset definitions in the source.

    The ``paperless-ngx`` package must be importable (installed via the
    inline script dependency or into the current environment).

    Returns
    -------
    dict
        Parsed OpenAPI 3.0 schema.
    """
    tmpdir = tempfile.mkdtemp(prefix="paperless_schema_")
    data_dir = Path(tmpdir) / "data"
    data_dir.mkdir()
    (data_dir / "log").mkdir()

    # Minimal env — settings.py reads these at import time.
    os.environ.setdefault("PAPERLESS_SECRET_KEY", "schema-generation-only")
    os.environ.setdefault("PAPERLESS_DATA_DIR", str(data_dir))
    os.environ.setdefault("PAPERLESS_LOGGING_DIR", str(data_dir / "log"))
    os.environ.setdefault("PAPERLESS_STATICDIR", str(Path(tmpdir) / "static"))
    os.environ.setdefault("PAPERLESS_MEDIA_ROOT", str(Path(tmpdir) / "media"))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "paperless.settings")

    import django  # noqa: E402

    django.setup()

    import io  # noqa: E402

    from django.core.management import call_command  # noqa: E402

    out = io.StringIO()
    call_command("spectacular", "--format", "openapi-json", "--validate", stdout=out)
    result: dict[str, Any] = json.loads(out.getvalue())
    return result


# ---------------------------------------------------------------------------
# Extract: keep only the paths we care about
# ---------------------------------------------------------------------------


def extract_paths(
    schema: dict[str, Any],
    paths: tuple[str, ...] = PATHS_WE_USE,
) -> dict[str, Any]:
    """Return a copy of *schema* containing only *paths* and referenced components.

    The returned schema is self-contained: any ``$ref`` targets reachable from
    the kept paths are resolved and included in ``components``.
    """
    all_paths: dict[str, Any] = schema.get("paths", {})
    kept_paths: dict[str, Any] = {}

    for pattern in paths:
        if pattern in all_paths:
            kept_paths[pattern] = all_paths[pattern]

    # Collect referenced components transitively.
    components = schema.get("components", {})
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

    subset = {
        "openapi": schema.get("openapi", "3.0.0"),
        "info": schema.get("info", {}),
        "paths": kept_paths,
    }
    if kept_components:
        subset["components"] = kept_components
    return subset


def _collect_refs(obj: Any, refs: set[str]) -> None:
    """Walk *obj* recursively and add every ``$ref`` value to *refs*."""
    if isinstance(obj, dict):
        if "$ref" in obj:
            ref = obj["$ref"]
            if isinstance(ref, str):
                refs.add(ref)
        for v in obj.values():
            _collect_refs(v, refs)
    elif isinstance(obj, list):
        for item in obj:
            _collect_refs(item, refs)


def _resolve_ref(ref: str, schema: dict[str, Any]) -> Any | None:
    """Resolve a JSON ``$ref`` pointer like ``#/components/schemas/Tag``."""
    if not ref.startswith("#/"):
        return None
    parts = ref[2:].split("/")
    current: Any = schema
    for part in parts:
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None
    return current


def _prune_components(
    components: dict[str, Any],
    needed_refs: set[str],
) -> dict[str, Any]:
    """Keep only component entries referenced by *needed_refs*."""
    pruned: dict[str, Any] = {}
    for ref in needed_refs:
        if not ref.startswith("#/components/"):
            continue
        parts = ref.removeprefix("#/components/").split("/")
        if len(parts) != 2:  # noqa: PLR2004
            continue
        category, name = parts
        if category in components and name in components[category]:
            pruned.setdefault(category, {})[name] = components[category][name]
    return pruned


# ---------------------------------------------------------------------------
# Diff: structural comparison of two schemas
# ---------------------------------------------------------------------------


class SchemaDiff:
    """Result of comparing two OpenAPI schemas."""

    __slots__ = ("added_paths", "removed_paths", "changed_paths")

    def __init__(
        self,
        *,
        added_paths: list[str],
        removed_paths: list[str],
        changed_paths: dict[str, list[str]],
    ) -> None:
        self.added_paths = added_paths
        self.removed_paths = removed_paths
        self.changed_paths = changed_paths

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
    old: dict[str, Any],
    new: dict[str, Any],
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
    old_paths: dict[str, Any] = old.get("paths", {})
    new_paths: dict[str, Any] = new.get("paths", {})

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
    old: dict[str, Any],
    new: dict[str, Any],
) -> list[str]:
    """Compare a single path item and return a list of human-readable diffs."""
    diffs: list[str] = []
    all_methods = sorted(set(old) | set(new))

    for method in all_methods:
        if method.startswith("x-") or method == "parameters":
            continue
        if method in new and method not in old:
            diffs.append(f"method added: {method.upper()}")
        elif method in old and method not in new:
            diffs.append(f"method removed: {method.upper()}")
        elif method in old and method in new:
            method_diffs = _diff_operation(method, old[method], new[method])
            diffs.extend(method_diffs)

    return diffs


def _diff_operation(
    method: str,
    old: dict[str, Any],
    new: dict[str, Any],
) -> list[str]:
    """Compare a single operation (method) within a path."""
    diffs: list[str] = []
    tag = method.upper()

    # Parameters
    old_params = {_param_key(p): p for p in old.get("parameters", [])}
    new_params = {_param_key(p): p for p in new.get("parameters", [])}
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
    old_body = _extract_body_schema(old)
    new_body = _extract_body_schema(new)
    if json.dumps(old_body, sort_keys=True) != json.dumps(new_body, sort_keys=True):
        diffs.append(f"{tag} request body changed")

    # Response codes
    old_responses = set(old.get("responses", {}))
    new_responses = set(new.get("responses", {}))
    for code in sorted(new_responses - old_responses):
        diffs.append(f"{tag} response added: {code}")
    for code in sorted(old_responses - new_responses):
        diffs.append(f"{tag} response removed: {code}")

    return diffs


def _param_key(param: dict[str, Any]) -> str:
    return f"{param.get('in', '?')}:{param.get('name', '?')}"


def _extract_body_schema(operation: dict[str, Any]) -> Any:
    body = operation.get("requestBody", {})
    content = body.get("content", {})
    json_content = content.get(
        "application/json", content.get("multipart/form-data", {})
    )
    return json_content.get("schema")


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
        description="Paperless-NGX OpenAPI schema snapshot tool.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # -- generate ------------------------------------------------------------
    gen = sub.add_parser(
        "generate",
        help="Generate schema from installed paperless-ngx source (no server needed).",
    )
    gen.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("schemas/openapi.json"),
        help="Output path (default: schemas/openapi.json)",
    )
    gen.add_argument(
        "--extract",
        action="store_true",
        help="Keep only paths used by paperless-mcp.",
    )

    # -- fetch ---------------------------------------------------------------
    fetch = sub.add_parser("fetch", help="Fetch schema from a live instance.")
    fetch.add_argument(
        "-u",
        "--url",
        default=_env_url(),
        help="Paperless-NGX base URL (default: $PAPERLESS_URL)",
    )
    fetch.add_argument(
        "-t", "--token", default=_env_token(), help="API token (default: $API_KEY)"
    )
    fetch.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("schemas/openapi.json"),
        help="Output path (default: schemas/openapi.json)",
    )
    fetch.add_argument(
        "--extract", action="store_true", help="Keep only paths used by paperless-mcp."
    )
    fetch.add_argument(
        "--timeout", type=int, default=30, help="HTTP timeout in seconds."
    )

    # -- extract -------------------------------------------------------------
    extract = sub.add_parser(
        "extract", help="Extract only paths used by paperless-mcp."
    )
    extract.add_argument(
        "input", type=Path, help="Full schema snapshot to extract from."
    )
    extract.add_argument(
        "-o",
        "--output",
        type=Path,
        required=True,
        help="Output path for subset schema.",
    )

    # -- diff ----------------------------------------------------------------
    diff = sub.add_parser("diff", help="Diff two schemas (files or file vs live).")
    diff.add_argument("file", type=Path, help="First schema file (baseline).")
    diff.add_argument(
        "file2",
        type=Path,
        nargs="?",
        help="Second schema file. Omit to diff against live instance.",
    )
    diff.add_argument(
        "-u",
        "--url",
        default=_env_url(),
        help="Paperless-NGX base URL (for live diff).",
    )
    diff.add_argument(
        "-t", "--token", default=_env_token(), help="API token (for live diff)."
    )
    diff.add_argument(
        "--our-paths",
        action="store_true",
        help="Only diff paths used by paperless-mcp.",
    )

    return parser


def _cmd_generate(args: argparse.Namespace) -> int:
    print("Generating schema from paperless-ngx source ...", file=sys.stderr)
    try:
        schema = generate_schema()
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if args.extract:
        schema = extract_paths(schema)
        print(f"Extracted {len(schema.get('paths', {}))} paths.", file=sys.stderr)

    save_schema(schema, args.output)
    total = len(schema.get("paths", {}))
    print(f"Saved {total} paths to {args.output}", file=sys.stderr)
    return 0


def _cmd_fetch(args: argparse.Namespace) -> int:
    if not args.url:
        print("error: --url or $PAPERLESS_URL required", file=sys.stderr)
        return 1

    print(f"Fetching schema from {args.url} ...", file=sys.stderr)
    try:
        schema = fetch_schema(args.url, token=args.token, timeout=args.timeout)
    except urllib.error.URLError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if args.extract:
        schema = extract_paths(schema)
        print(f"Extracted {len(schema.get('paths', {}))} paths.", file=sys.stderr)

    save_schema(schema, args.output)
    total = len(schema.get("paths", {}))
    print(f"Saved {total} paths to {args.output}", file=sys.stderr)
    return 0


def _cmd_extract(args: argparse.Namespace) -> int:
    schema = load_schema(args.input)
    subset = extract_paths(schema)
    save_schema(subset, args.output)
    kept = len(subset.get("paths", {}))
    total = len(schema.get("paths", {}))
    print(f"Extracted {kept}/{total} paths to {args.output}", file=sys.stderr)
    return 0


def _cmd_diff(args: argparse.Namespace) -> int:
    old = load_schema(args.file)

    if args.file2 is not None:
        new = load_schema(args.file2)
    elif args.url:
        print(f"Fetching schema from {args.url} ...", file=sys.stderr)
        try:
            new = fetch_schema(args.url, token=args.token)
        except urllib.error.URLError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
    else:
        print("error: provide a second file or --url for live diff", file=sys.stderr)
        return 1

    paths_filter = PATHS_WE_USE if args.our_paths else None
    result = diff_schemas(old, new, paths_filter=paths_filter)
    print(result.summary())
    return 1 if result.has_changes else 0


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    dispatch: dict[str, Any] = {
        "generate": _cmd_generate,
        "fetch": _cmd_fetch,
        "extract": _cmd_extract,
        "diff": _cmd_diff,
    }
    handler = dispatch.get(args.command)
    if handler is None:
        parser.print_help()
        return 1
    result: int = handler(args)
    return result


if __name__ == "__main__":
    raise SystemExit(main())
