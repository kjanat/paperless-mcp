# Paperless-ngx MCP Server

[![NPM Version](https://img.shields.io/npm/v/@kjanat/paperless-mcp?logo=npm&labelColor=CB3837&color=black)](https://www.npmjs.com/package/@kjanat/paperless-mcp)

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

*Add using*:

```bash
bunx skills add https://github.com/kjanat/paperless-mcp --skill paperless-ngx
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

#### `search_documents`

Full-text search across documents.

Parameters:

- `query`: Search query string

```typescript
search_documents({
	query: 'invoice 2024',
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
  - `delete`: Delete documents
  - `reprocess`: Reprocess documents
  - `set_permissions`: Set document permissions
  - `merge`: Merge multiple documents
  - `split`: Split a document into multiple documents
  - `rotate`: Rotate document pages
  - `delete_pages`: Delete specific pages from a document
- Additional parameters based on `method`:
  - `correspondent`: ID for set_correspondent
  - `document_type`: ID for set_document_type
  - `storage_path`: ID for set_storage_path
  - `tag`: ID for add_tag/remove_tag
  - `add_tags`: Array of tag IDs for modify_tags
  - `remove_tags`: Array of tag IDs for modify_tags
  - `permissions`: Object for set_permissions with owner, permissions, merge flag
  - `metadata_document_id`: ID for merge to specify metadata source
  - `delete_originals`: Boolean for merge/split
  - `pages`: String for split "[1,2-3,4,5-7]" or `delete_pages` "[2,3,4]"
  - `degrees`: Number for rotate (90, 180, or 270)

Examples:

```typescript
// Add a tag to multiple documents
bulk_edit_documents({
	documents: [1, 2, 3],
	method: 'add_tag',
	tag: 5,
});

// Set correspondent and document type
bulk_edit_documents({
	documents: [4, 5],
	method: 'set_correspondent',
	correspondent: 2,
});

// Merge documents
bulk_edit_documents({
	documents: [6, 7, 8],
	method: 'merge',
	metadata_document_id: 6,
	delete_originals: true,
});

// Split document into parts
bulk_edit_documents({
	documents: [9],
	method: 'split',
	pages: '[1-2,3-4,5]',
});

// Modify multiple tags at once
bulk_edit_documents({
	documents: [10, 11],
	method: 'modify_tags',
	add_tags: [1, 2],
	remove_tags: [3, 4],
});
```

#### `post_document`

Upload a new document to Paperless-ngx.

Parameters:

- `file`: Base64 encoded file content
- `filename`: Name of the file
- `title` (optional): Title for the document
- `created` (optional): DateTime when the document was created (e.g. "2024-01-19" or "2024-01-19 06:15:00+02:00")
- `correspondent` (optional): ID of a correspondent
- `document_type` (optional): ID of a document type
- `storage_path` (optional): ID of a storage path
- `tags` (optional): Array of tag IDs
- `archive_serial_number` (optional): Archive serial number
- `custom_fields` (optional): Array of custom field IDs

```typescript
post_document({
	file: 'base64_encoded_content',
	filename: 'invoice.pdf',
	title: 'January Invoice',
	created: '2024-01-19',
	correspondent: 1,
	document_type: 2,
	tags: [1, 3],
	archive_serial_number: '2024-001',
});
```

</details>
<details>
<summary>Tag Operations</summary>

### Tag Operations

#### `list_tags`

Get all tags.

```typescript
list_tags();
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
	name: 'Invoice',
	color: '#ff0000',
	match: 'invoice',
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
	name: 'Invoices',
	color: '#00ff00',
});
```

#### `delete_tag`

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
	operation: 'delete',
});
```

</details>
<details>
<summary>Correspondent Operations</summary>

### Correspondent Operations

#### `list_correspondents`

Get all correspondents.

```typescript
list_correspondents();
```

#### create_correspondent

Create a new correspondent.

Parameters:

- `name`: Correspondent name
- `match` (optional): Text pattern to match
- `matching_algorithm` (optional): Integer 0-6 (0=none, 1=any, 2=all, 3=exact, 4=regex, 5=fuzzy, 6=auto)

```typescript
create_correspondent({
	name: 'ACME Corp',
	match: 'ACME',
	matching_algorithm: 5,
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
	operation: 'delete',
});
```

</details>
<details>
<summary>Document Type Operations</summary>

### Document Type Operations

#### `list_document_types`

Get all document types.

```typescript
list_document_types();
```

#### create_document_type

Create a new document type.

Parameters:

- `name`: Document type name
- `match` (optional): Text pattern to match
- `matching_algorithm` (optional): Integer 0-6 (0=none, 1=any, 2=all, 3=exact, 4=regex, 5=fuzzy, 6=auto)

```typescript
create_document_type({
	name: 'Invoice',
	match: 'invoice total amount due',
	matching_algorithm: 1,
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
	operation: 'delete',
});
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

<!--markdownlint-disable-file no-hard-tabs no-inline-html no-bare-urls-->
