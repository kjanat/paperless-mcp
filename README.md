# Paperless-ngx MCP Server

[![NPM Version](https://img.shields.io/npm/v/@kjanat/paperless-mcp?logo=npm&labelColor=CB3837&color=black)](https://www.npmjs.com/package/@kjanat/paperless-mcp)
[![pkg.pr.new](https://pkg.pr.new/badge/kjanat/paperless-mcp)](https://pkg.pr.new/~/kjanat/paperless-mcp)

[![Publish to npm](https://github.com/kjanat/paperless-mcp/actions/workflows/npm-publish.yml/badge.svg)](https://github.com/kjanat/paperless-mcp/actions/workflows/npm-publish.yml)
[![Schema drift check](https://github.com/kjanat/paperless-mcp/actions/workflows/schema-check.yml/badge.svg)](https://github.com/kjanat/paperless-mcp/actions/workflows/schema-check.yml)
[![Schema upstream sync](https://github.com/kjanat/paperless-mcp/actions/workflows/schema-update.yml/badge.svg)](https://github.com/kjanat/paperless-mcp/actions/workflows/schema-update.yml)

An MCP (Model Context Protocol) server for interacting with a Paperless-ngx API server. This server provides tools for managing documents, tags, correspondents, and document types in your Paperless-ngx instance.

## Quick Start

### Installation

1. Get your API token:
   1. Log into your Paperless-ngx instance
   2. Click your username in the top right
   3. Select "My Profile"
   4. Click the circular arrow button to generate a new token

1. Add it to your MCP client configuration (using env vars):

   ```jsonc
   {
     "mcpServers": {
       "paperless": {
         "command": "bunx", // or npx
         "args": ["@kjanat/paperless-mcp"],
         "env": {
           "PAPERLESS_URL": "http://your-paperless-instance:8000",
           "PAPERLESS_API_KEY": "your-api-token",
         },
       },
     },
   }
   ```

   Or pass them as positional arguments:

   ```jsonc
   {
     "mcpServers": {
       "paperless": {
         "command": "bunx", // or npx
         "args": [
           "@kjanat/paperless-mcp",
           "http://your-paperless-instance:8000",
           "your-api-token",
         ],
       },
     },
   }
   ```

   CLI args take precedence over env vars when both are provided.

That's it!

## Agent Skill

This package ships an [Agent Skill](https://agentskills.io/specification) in
`skills/paperless-ngx/` with decision trees, tool reference docs, query syntax
guide, and workflow templates for AI agents.

View the skill on the registry: https://skills.sh/kjanat/paperless-mcp/paperless-ngx

_Add using_:

```bash
bunx skills add kjanat/paperless-mcp --skill paperless-ngx
```

`# or npx -y skills...`

## Example Usage

Here are some things you can ask Claude to do:

- "Show me all documents tagged as 'Invoice'"
- "Search for documents containing 'tax return'"
- "Create a new tag called 'Receipts' with color #FF0000"
- "Download document #123"
- "List all correspondents"
- "Create a new document type called 'Bank Statement'"

## Available Tools

<details>
<summary>Document Operations</summary>

### Document Operations

#### `get_document`

Get a specific document by ID.

Parameters:

- `id`: Document ID

```typescript
get_document({
  id: 123,
});
```

#### `update_document`

Update metadata on a single document via `PATCH /api/documents/{id}/`, and/or
add a note (sent to `POST /api/documents/{id}/notes/` under the hood). Use
`bulk_edit_documents` for tags, correspondent, or document type — those are
bulk-optimised on the backend.

Parameters:

- `id`: Document ID
- `title` (optional): New document title (max 128 characters)
- `archive_serial_number` (optional): Archive serial number, or `null` to clear it
- `custom_fields` (optional): Array of `{ field, value }` pairs — replaces the
  document's custom field instances
- `note` (optional): Note text to append to the document (existing notes are kept)

```typescript
update_document({
  id: 123,
  title: "Electricity Invoice March 2024",
  note: "Renamed after inbox triage",
});
```

#### `search_documents`

Full-text search across documents.

Parameters:

- `query`: Search query string

```typescript
search_documents({
  query: "invoice 2024",
});
```

#### `download_document`

Download a document file by ID.

Parameters:

- `id`: Document ID
- `original` (optional): If true, downloads original file instead of archived version

```typescript
download_document({
  id: 123,
  original: false,
});
```

#### `bulk_edit_documents`

Perform bulk operations on multiple documents.

Parameters:

- `documents`: Array of document IDs
- `method`: One of:
  - `set_correspondent`: Set correspondent for documents
  - `set_document_type`: Set document type for documents
  - `set_storage_path`: Set storage path for documents
  - `add_tag`: Add a tag to documents
  - `remove_tag`: Remove a tag from documents
  - `modify_tags`: Add and/or remove multiple tags
  - `modify_custom_fields`: Add and/or remove custom fields
  - `delete`: Delete documents
  - `reprocess`: Reprocess documents
  - `set_permissions`: Set document permissions
  - `merge`: Merge multiple documents
  - `split`: Split a document into multiple documents
  - `rotate`: Rotate document pages
  - `delete_pages`: Delete specific pages from a document
  - `edit_pdf`: Reorder, rotate, split, or discard PDF pages
  - `remove_password`: Remove PDF password protection
- Additional parameters based on `method`:
  - `correspondent`: ID for set_correspondent
  - `document_type`: ID for set_document_type
  - `storage_path`: ID for set_storage_path
  - `tag`: ID for add_tag/remove_tag
  - `add_tags`: Array of tag IDs for modify_tags
  - `remove_tags`: Array of tag IDs for modify_tags
  - `add_custom_fields`: Custom field IDs or id:value pairs for modify_custom_fields
  - `remove_custom_fields`: Array of custom field IDs for modify_custom_fields
  - `permissions`: Object for set_permissions with owner, permissions, merge flag
  - `metadata_document_id`: ID for merge to specify metadata source
  - `delete_originals`: Boolean for merge/split
  - `pages`: String for split (`"1-2,3-4,5"`) or number array for delete_pages (`[2, 3, 4]`)
  - `degrees`: Number for rotate (90, 180, or 270)
  - `operations`: Array of PDF edit operations for edit_pdf
  - `password`: Password for remove_password
  - `update_document`, `delete_original`, `include_metadata`: PDF edit/remove-password flags

Examples:

```typescript
// Add a tag to multiple documents
bulk_edit_documents({
  documents: [1, 2, 3],
  method: "add_tag",
  tag: 5,
});

// Set correspondent and document type
bulk_edit_documents({
  documents: [4, 5],
  method: "set_correspondent",
  correspondent: 2,
});

// Merge documents
bulk_edit_documents({
  documents: [6, 7, 8],
  method: "merge",
  metadata_document_id: 6,
  delete_originals: true,
});

// Split document into parts
bulk_edit_documents({
  documents: [9],
  method: "split",
  pages: "[1-2,3-4,5]",
});

// Modify multiple tags at once
bulk_edit_documents({
  documents: [10, 11],
  method: "modify_tags",
  add_tags: [1, 2],
  remove_tags: [3, 4],
});
```

#### `post_document`

Upload a new document to Paperless-ngx. Provide the file as a local path
(`file_path` — preferred; the MCP server reads it directly from disk, so large
PDFs never pass through the model) or as inline base64 (`file`).

Parameters:

- `file_path`: Path to a file on the machine running the MCP server (supports
  a leading `~`). Stdio transport only: the HTTP transport rejects it, since
  the path would resolve on the server host.
- `file`: Base64 encoded file content (alternative to `file_path`; only
  practical for small files)
- `filename`: Name of the file — required with `file`, defaults to the
  `file_path` basename otherwise
- `title` (optional): Title for the document
- `created` (optional): DateTime when the document was created (e.g. "2024-01-19" or "2024-01-19 06:15:00+02:00")
- `correspondent` (optional): ID of a correspondent
- `document_type` (optional): ID of a document type
- `storage_path` (optional): ID of a storage path
- `tags` (optional): Array of tag IDs
- `archive_serial_number` (optional): Archive serial number
- `custom_fields` (optional): Array of custom field IDs

Returns a consume-task UUID, not a document ID — poll `get_task` with it to
find out when processing finishes and which document was created.

```typescript
post_document({
  file_path: "~/Downloads/invoice.pdf",
  title: "January Invoice",
  created: "2024-01-19",
  correspondent: 1,
  document_type: 2,
  tags: [1, 3],
  archive_serial_number: "2024-001",
});
```

#### `delete_document_note`

Delete a note from a document. Note IDs come from the `notes` array on
`get_document` results. Returns the remaining notes.

Parameters:

- `id`: Document ID
- `note_id`: ID of the note to delete

```typescript
delete_document_note({
  id: 123,
  note_id: 7,
});
```

</details>
<details>
<summary>Tag Operations</summary>

### Tag Operations

#### `list_tags`

Get all tags. Optional `name` filters on a case-insensitive substring.

```typescript
list_tags({ name: "invoice" });
```

#### `create_tag`

Create a new tag.

Parameters:

- `name`: Tag name
- `color` (optional): Hex color code (e.g. "#ff0000")
- `match` (optional): Text pattern to match
- `matching_algorithm` (optional): Integer 0-6 (0=none, 1=any, 2=all, 3=exact, 4=regex, 5=fuzzy, 6=auto)

```typescript
create_tag({
  name: "Invoice",
  color: "#ff0000",
  match: "invoice",
  matching_algorithm: 5,
});
```

#### `update_tag`

Update an existing tag's name, color, or matching rules.

Parameters:

- `id`: Tag ID
- `name`: New tag name
- `color` (optional): Hex color code (e.g. "#ff0000")
- `match` (optional): Text pattern to match
- `matching_algorithm` (optional): Integer 0-6 (0=none, 1=any, 2=all, 3=exact, 4=regex, 5=fuzzy, 6=auto)

```typescript
update_tag({
  id: 5,
  name: "Invoices",
  color: "#00ff00",
});
```

#### `get_tag`

Get a single tag by ID.

```typescript
get_tag({
  id: 5,
});
```

#### `delete_tag`

> **Deprecated** — use `bulk_edit_tags` with `operation: "delete"` instead.
> Will be removed in v3.0.0.

Permanently delete a tag. Removes it from all documents.

Parameters:

- `id`: Tag ID

```typescript
delete_tag({
  id: 5,
});
```

#### bulk_edit_tags

Bulk set permissions or delete multiple tags.

Parameters:

- `tag_ids`: Array of tag IDs
- `operation`: "set_permissions" or "delete"
- `owner` (optional): User ID (for set_permissions)
- `permissions` (optional): Object with view/change user and group IDs
- `merge` (optional): Merge with existing permissions (default false)

```typescript
bulk_edit_tags({
  tag_ids: [1, 2, 3],
  operation: "delete",
});
```

</details>
<details>
<summary>Correspondent Operations</summary>

### Correspondent Operations

#### `list_correspondents`

Get all correspondents. Optional `name` filters on a case-insensitive substring.

```typescript
list_correspondents({ name: "acme" });
```

#### `get_correspondent`

Get a single correspondent by ID — cheaper than listing all correspondents to
resolve a document's `correspondent` field.

```typescript
get_correspondent({
  id: 63,
});
```

#### create_correspondent

Create a new correspondent.

Parameters:

- `name`: Correspondent name
- `match` (optional): Text pattern to match
- `matching_algorithm` (optional): Integer 0-6 (0=none, 1=any, 2=all, 3=exact, 4=regex, 5=fuzzy, 6=auto)

```typescript
create_correspondent({
  name: "ACME Corp",
  match: "ACME",
  matching_algorithm: 5,
});
```

#### `update_correspondent`

Update an existing correspondent's name or matching rules via
`PATCH /api/correspondents/{id}/`.

Parameters:

- `id`: Correspondent ID
- `name` (optional): New correspondent name
- `match` (optional): Text pattern to match (empty string removes auto-matching)
- `matching_algorithm` (optional): Integer 0-6 (0=none, 1=any, 2=all, 3=exact, 4=regex, 5=fuzzy, 6=auto)
- `is_insensitive` (optional): Whether matching is case-insensitive

```typescript
update_correspondent({
  id: 9,
  match: "ACME Corp Inc",
  matching_algorithm: 3,
  is_insensitive: true,
});
```

#### `bulk_edit_correspondents`

Bulk set permissions or delete multiple correspondents.

Parameters:

- `correspondent_ids`: Array of correspondent IDs
- `operation`: "set_permissions" or "delete"
- `owner` (optional): User ID (for set_permissions)
- `permissions` (optional): Object with view/change user and group IDs
- `merge` (optional): Merge with existing permissions (default false)

```typescript
bulk_edit_correspondents({
  correspondent_ids: [1, 2],
  operation: "delete",
});
```

</details>
<details>
<summary>Document Type Operations</summary>

### Document Type Operations

#### `list_document_types`

Get all document types. Optional `name` filters on a case-insensitive substring.

```typescript
list_document_types({ name: "invoice" });
```

#### `get_document_type`

Get a single document type by ID — cheaper than listing all types to resolve
a document's `document_type` field.

```typescript
get_document_type({
  id: 2,
});
```

#### create_document_type

Create a new document type.

Parameters:

- `name`: Document type name
- `match` (optional): Text pattern to match
- `matching_algorithm` (optional): Integer 0-6 (0=none, 1=any, 2=all, 3=exact, 4=regex, 5=fuzzy, 6=auto)

```typescript
create_document_type({
  name: "Invoice",
  match: "invoice total amount due",
  matching_algorithm: 1,
});
```

#### `update_document_type`

Update an existing document type's name or matching rules via
`PATCH /api/document_types/{id}/`.

Parameters:

- `id`: Document type ID
- `name` (optional): New document type name
- `match` (optional): Text pattern to match (empty string removes auto-matching)
- `matching_algorithm` (optional): Integer 0-6 (0=none, 1=any, 2=all, 3=exact, 4=regex, 5=fuzzy, 6=auto)
- `is_insensitive` (optional): Whether matching is case-insensitive

```typescript
update_document_type({
  id: 4,
  match: "invoice number",
  matching_algorithm: 3,
  is_insensitive: true,
});
```

#### `bulk_edit_document_types`

Bulk set permissions or delete multiple document types.

Parameters:

- `document_type_ids`: Array of document type IDs
- `operation`: "set_permissions" or "delete"
- `owner` (optional): User ID (for set_permissions)
- `permissions` (optional): Object with view/change user and group IDs
- `merge` (optional): Merge with existing permissions (default false)

```typescript
bulk_edit_document_types({
  document_type_ids: [1, 2],
  operation: "delete",
});
```

</details>
<details>
<summary>Storage Path Operations</summary>

### Storage Path Operations

#### `list_storage_paths`

Get all storage paths (where document files land on disk). Optional `name`
filters on a case-insensitive substring.

```typescript
list_storage_paths({ name: "tax" });
```

#### `create_storage_path`

Create a new storage path.

Parameters:

- `name`: Storage path name
- `path`: Path template, e.g. `"{{ created_year }}/{{ correspondent }}/{{ title }}"`
- `match` (optional): Text pattern to match
- `matching_algorithm` (optional): Integer 0-6 (0=none, 1=any, 2=all, 3=exact, 4=regex, 5=fuzzy, 6=auto)
- `is_insensitive` (optional): Whether matching is case-insensitive

```typescript
create_storage_path({
  name: "Tax Archive",
  path: "{{ created_year }}/taxes/{{ title }}",
});
```

#### `update_storage_path`

Update an existing storage path's name, path template, or matching rules via
`PATCH /api/storage_paths/{id}/`.

Parameters:

- `id`: Storage path ID
- `name` (optional): New name
- `path` (optional): New path template
- `match` (optional): Text pattern to match (empty string removes auto-matching)
- `matching_algorithm` (optional): Integer 0-6
- `is_insensitive` (optional): Whether matching is case-insensitive

```typescript
update_storage_path({
  id: 1,
  path: "{{ created_year }}/{{ correspondent }}/{{ title }}",
});
```

#### `bulk_edit_storage_paths`

Bulk set permissions or delete multiple storage paths. Deleting a storage path
does not delete documents — they fall back to the default storage location.

Parameters:

- `storage_path_ids`: Array of storage path IDs
- `operation`: "set_permissions" or "delete"
- `owner` (optional): User ID (for set_permissions)
- `permissions` (optional): Object with view/change user and group IDs
- `merge` (optional): Merge with existing permissions (default false)

```typescript
bulk_edit_storage_paths({
  storage_path_ids: [1, 2],
  operation: "delete",
});
```

</details>
<details>
<summary>Custom Field Operations</summary>

### Custom Field Operations

#### `list_custom_fields`

Get all custom field definitions (optional `name` substring filter) — the numeric IDs that
`update_document.custom_fields` and `bulk_edit_documents.modify_custom_fields`
require.

```typescript
list_custom_fields({ name: "invoice" });
```

#### `create_custom_field`

Create a new custom field definition.

Parameters:

- `name`: Field name
- `data_type`: One of `string`, `url`, `date`, `boolean`, `integer`, `float`, `monetary`, `documentlink`, `select`
- `extra_data` (optional): Extra configuration, e.g. `{ select_options: [{ label: "Open" }, { label: "Paid" }] }`

```typescript
create_custom_field({
  name: "Invoice Number",
  data_type: "string",
});
```

#### `update_custom_field`

Update an existing custom field definition via `PATCH /api/custom_fields/{id}/`.
Changing the data type of a field with existing values may invalidate them.

Parameters:

- `id`: Custom field ID
- `name` (optional): New field name
- `data_type` (optional): New data type
- `extra_data` (optional): New extra configuration

```typescript
update_custom_field({
  id: 7,
  name: "Invoice No.",
});
```

#### `delete_custom_field`

Permanently delete a custom field definition via
`DELETE /api/custom_fields/{id}/`. Removes the field and all its values from
every document that uses it. Cannot be undone.

Single-delete only: the backend has no bulk endpoint for custom fields
(unlike tags, correspondents, document types, and storage paths).

Parameters:

- `id`: Custom field ID

```typescript
delete_custom_field({
  id: 7,
});
```

</details>
<details>
<summary>Task Operations</summary>

### Task Operations

#### `get_task`

Look up a consume task by the UUID that `post_document` returns. Shows
processing status and, once finished, `related_document` with the
resulting document ID(s).

Parameters:

- `task_id`: Task UUID from `post_document`

```typescript
get_task({
  task_id: "a1b2c3d4-...",
});
```

#### `list_tasks`

List recent consumer/queue tasks, newest first. Useful when the
`post_document` UUID is lost, or to find failed consumptions.

Parameters:

- `status` (optional): `PENDING`, `STARTED`, `SUCCESS`, `FAILURE`, `RETRY`, or `REVOKED`
- `acknowledged` (optional): `false` returns tasks still visible in the Paperless tasks view
- `task_name` (optional): e.g. `consume_file` (uploads), `train_classifier`, `check_sanity`
- `limit` (optional): max tasks returned (default 25, max 100)

```typescript
list_tasks({
  task_name: "consume_file",
  status: "FAILURE",
});
```

</details>
<details>
<summary>Trash Operations</summary>

### Trash Operations

#### `list_trash`

List soft-deleted documents awaiting purge. Documents land here via
`bulk_edit_documents` with `method: "delete"`.

```typescript
list_trash();
```

#### `restore_from_trash`

Restore soft-deleted documents back into the archive, metadata intact.

Parameters:

- `documents`: Document IDs to restore (from `list_trash`)

```typescript
restore_from_trash({
  documents: [123, 124],
});
```

#### `empty_trash`

**Permanently** delete documents from the trash. This is the irreversible
step. Omit `documents` to purge the entire trash.

Parameters:

- `documents` (optional): Document IDs to purge; omit for everything

```typescript
empty_trash({
  documents: [123],
});
```

</details>
<details>
<summary>Mail Operations</summary>

### Mail Operations

#### `list_mail_accounts`

List mail accounts that Paperless polls for ingestion. Credentials are
stripped; account setup stays in the web UI.

```typescript
list_mail_accounts();
```

#### `process_mail_account`

Trigger an immediate mail poll for one account.

Parameters:

- `id`: Mail account ID

```typescript
process_mail_account({ id: 1 });
```

#### `list_mail_rules`

List mail rules (filters that decide which emails get imported and how).

```typescript
list_mail_rules();
```

#### `create_mail_rule`

Create a rule that imports matching emails: filter on sender/subject/body/
attachment, assign tags/correspondent/type, and control what happens to the
email afterwards. Affects future ingestion runs.

Parameters (subset):

- `account`: Mail account ID
- `name`: Unique rule name
- `filter_from`, `filter_to`, `filter_subject`, `filter_body` (optional): substring filters
- `filter_attachment_filename_include` / `_exclude` (optional): wildcard patterns
- `maximum_age` (optional): only emails younger than this many days
- `action`, `action_parameter` (optional): what happens to the email (delete, move, mark_read, flag, tag)
- `assign_tags`, `assign_correspondent`, `assign_document_type` (optional): metadata for consumed documents
- `enabled`, `order`, `stop_processing` (optional): rule chain control

```typescript
create_mail_rule({
  account: 1,
  name: "Vendor invoices",
  filter_from: "billing@vendor.com",
  filter_subject: "invoice",
  assign_tags: [12],
  action: 3, // mark_read
});
```

#### `update_mail_rule`

Modify an existing mail rule. Same fields as create, all optional, plus `id`.
Pause a rule with `enabled: false` instead of deleting it.

```typescript
update_mail_rule({
  id: 5,
  enabled: false,
});
```

#### `delete_mail_rule`

Permanently delete a mail rule. Affects future ingestion only; already
consumed documents are untouched.

```typescript
delete_mail_rule({ id: 5 });
```

</details>

## Error Handling

The server will show clear error messages if:

- The Paperless-ngx URL or API token is incorrect
- The Paperless-ngx server is unreachable
- The requested operation fails
- The provided parameters are invalid

## Development

Want to contribute or modify the server? Here's what you need to know:

1. Clone the repository
2. Install dependencies:

   ```bash
   bun install
   ```

3. Make your changes in `src/` (see `src/tools/` for MCP tools, `src/api/` for API client)
4. Test locally:

   ```bash
   bun src/index.ts http://localhost:8000 your-test-token
   ```

The server is built with:

- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk): Official TypeScript SDK for building MCP servers
- [zod](https://github.com/colinhacks/zod): TypeScript-first schema validation

## API Documentation

This MCP server implements endpoints from the Paperless-ngx REST API. For more details about the underlying API, see the [official documentation](https://docs.paperless-ngx.com/api/).

## Running the MCP Server

The MCP server can be run in two modes:

### 1. stdio (default)

This is the default mode. The server communicates over stdio, suitable for CLI and direct integrations.

```bash
# via .env file (Bun loads .env automatically)
bun start

# via inline env vars
PAPERLESS_URL=http://localhost:8000 PAPERLESS_API_KEY=your-token bun start

# via positional args
bun start http://localhost:8000 your-token
```

> [!TIP]
> When using Bun, env vars in a `.env` file are loaded automatically —
> no extra setup needed. Just create a `.env` with `PAPERLESS_URL` and
> `PAPERLESS_API_KEY` and run `bun start`.

### 2. HTTP (Streamable HTTP Transport)

To run the server as an HTTP service, use the `--http` flag. You can also specify the port with `--port` (default: 3000).

```bash
PAPERLESS_URL=http://localhost:8000 PAPERLESS_API_KEY=your-token bun start --http --port 3000
```

With a `.env` file, this simplifies to `bun start --http`.

- The MCP API will be available at `POST /mcp` on the specified port.
- Each request is handled statelessly, following the [StreamableHTTPServerTransport](https://github.com/modelcontextprotocol/typescript-sdk) pattern.
- GET and DELETE requests to `/mcp` will return 405 Method Not Allowed.

#### Bind host and DNS-rebinding protection

By default the HTTP server binds to loopback (`127.0.0.1`), for which the MCP SDK
automatically enables Host-header validation (DNS-rebinding protection). To expose
it on another interface, set `--host` (or `PAPERLESS_MCP_HOST`):

```bash
# Bind all interfaces — pass an allowlist so protection stays on
bun start --http --host 0.0.0.0 --allowed-hosts paperless.example.com,localhost
```

- `--host` / `PAPERLESS_MCP_HOST` — interface to bind (default `127.0.0.1`).
- `--allowed-hosts` / `PAPERLESS_MCP_ALLOWED_HOSTS` — comma-separated Host-header
  allowlist. **Set this whenever you bind a non-loopback host** (e.g. `0.0.0.0`);
  otherwise the SDK applies no DNS-rebinding protection and logs a warning.
- The server shuts down gracefully on `SIGINT`/`SIGTERM`, draining in-flight
  requests before exiting.

#### Per-request Bearer auth (multi-user)

With `--per-request-token` (or `PAPERLESS_MCP_PER_REQUEST_TOKEN=1`), the server
holds no Paperless credentials. Every MCP request must carry that user's own
token, which is forwarded to Paperless as-is, so Paperless permissions stay
per-user behind one hosted MCP server:

```bash
# No token argument needed; clients authenticate themselves
paperless-mcp http://localhost:8000 --http --per-request-token
```

Clients send `Authorization: Bearer <paperless-api-token>` on each request.
Requests without it get a `401` with `WWW-Authenticate: Bearer`. There is no
fallback to a shared token. Run this behind TLS (a reverse proxy): tokens
travel in headers.

<!--markdownlint-disable-file no-hard-tabs no-inline-html no-bare-urls-->
