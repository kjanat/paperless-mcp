---
name: paperless-ngx
description: Manages documents in Paperless-ngx via MCP tools. Searches, uploads, tags, organizes, and bulk-edits documents, correspondents, and document types. Use when working with Paperless-ngx, document management, OCR, or any mcp_paperless_* tool task.
license: MIT
compatibility: Requires a running Paperless-ngx instance with API token. MCP server must be connected with mcp_paperless_* tools available.
metadata:
  author: kjanat
  version: "2.7.1"
---

# Paperless-ngx Document Management

Orchestrate Paperless-ngx through 30 MCP tools across 7 domains.

## Tool Catalog

### Documents (7 tools)

| Tool                   | Operation        | Key Params                                                      |
| ---------------------- | ---------------- | --------------------------------------------------------------- |
| `search_documents`     | Full-text search | `query`, `page`, `page_size`                                    |
| `get_document`         | Full details     | `id`                                                            |
| `update_document`      | Patch single doc | `id`, `title`, `archive_serial_number`, `custom_fields`, `note` |
| `delete_document_note` | Remove a note    | `id`, `note_id`                                                 |
| `post_document`        | Upload file      | `file` (base64), `filename`, metadata                           |
| `download_document`    | Get file base64  | `id`, `original` (bool)                                         |
| `bulk_edit_documents`  | Batch operations | `documents` (IDs), `method`, params                             |

### Tags (6 tools)

| Tool             | Operation                                                |
| ---------------- | -------------------------------------------------------- |
| `list_tags`      | All tags + colors + matching                             |
| `get_tag`        | Single tag by ID                                         |
| `create_tag`     | New tag, optional auto-match                             |
| `update_tag`     | Modify name/color/matching                               |
| `delete_tag`     | **Deprecated** — use `bulk_edit_tags` `operation=delete` |
| `bulk_edit_tags` | Batch permissions/deletion                               |

### Correspondents (5 tools)

| Tool                       | Operation                  |
| -------------------------- | -------------------------- |
| `list_correspondents`      | All correspondents         |
| `get_correspondent`        | Single correspondent by ID |
| `create_correspondent`     | New, optional auto-match   |
| `update_correspondent`     | Modify name/matching rules |
| `bulk_edit_correspondents` | Batch permissions/delete   |

### Document Types (5 tools)

| Tool                       | Operation                  |
| -------------------------- | -------------------------- |
| `list_document_types`      | All document types         |
| `get_document_type`        | Single type by ID          |
| `create_document_type`     | New, optional auto-match   |
| `update_document_type`     | Modify name/matching rules |
| `bulk_edit_document_types` | Batch permissions/delete   |

### Storage Paths (3 tools)

| Tool                  | Operation                      |
| --------------------- | ------------------------------ |
| `list_storage_paths`  | All storage paths              |
| `create_storage_path` | New path template + auto-match |
| `update_storage_path` | Modify name/template/matching  |

### Custom Fields (3 tools)

| Tool                  | Operation                     |
| --------------------- | ----------------------------- |
| `list_custom_fields`  | All field definitions + IDs   |
| `create_custom_field` | New field (name + data type)  |
| `update_custom_field` | Modify name/data type/options |

### Tasks (1 tool)

| Tool       | Operation                                             |
| ---------- | ----------------------------------------------------- |
| `get_task` | Status + resulting doc IDs for a `post_document` UUID |

## Decision Trees

### Find a Document

```txt
What do you know?
├─ Keywords/content     → search_documents(query="term1 term2")
├─ Document ID          → get_document(id=N)
├─ By tag               → search_documents(query="tag:tagname")
├─ By type              → search_documents(query="type:typename")
├─ By correspondent     → search_documents(query="correspondent:name")
├─ By date              → search_documents(query="created:[2024 to 2025]")
└─ Combined             → search_documents(query="tag:X correspondent:Y created:[2024 to 2025]")
```

### Organize Documents

```txt
What operation?
├─ Rename title    → update_document(id=N, title="...")
├─ Set/clear ASN   → update_document(id=N, archive_serial_number=N|null)
├─ Custom fields   → update_document(id=N, custom_fields=[{field, value}])  (IDs via list_custom_fields)
├─ Add note        → update_document(id=N, note="...")
├─ Remove note     → delete_document_note(id=N, note_id=NID)
├─ Add tag         → bulk_edit_documents(method="add_tag", tag=ID)
├─ Remove tag      → bulk_edit_documents(method="remove_tag", tag=ID)
├─ Multi-tag       → bulk_edit_documents(method="modify_tags", add_tags=[...], remove_tags=[...])
├─ Set type        → bulk_edit_documents(method="set_document_type", document_type=ID)
├─ Set sender      → bulk_edit_documents(method="set_correspondent", correspondent=ID)
├─ Merge PDFs      → bulk_edit_documents(method="merge", metadata_document_id=ID)
├─ Rotate pages    → bulk_edit_documents(method="rotate", degrees=90|180|270)
├─ Delete pages    → bulk_edit_documents(method="delete_pages", pages=[1, 3, 5])
├─ Reprocess OCR   → bulk_edit_documents(method="reprocess")
└─ Delete          → bulk_edit_documents(method="delete")  !! PERMANENT !!
```

### Upload a Document

```txt
1. Resolve metadata IDs first:
   ├─ list_tags            → find or create_tag
   ├─ list_correspondents  → find or create_correspondent
   └─ list_document_types  → find or create_document_type
2. post_document(file=<base64>, filename="name.pdf", tags=[...], correspondent=ID, ...)
   → returns a task UUID, not a document ID
3. get_task(task_id=<uuid>) until status="SUCCESS"
   → related_document holds the new document ID
```

### Manage Taxonomy (Tags/Correspondents/Types)

```txt
Need to change metadata objects?
├─ View all          → list_tags / list_correspondents / list_document_types /
│                      list_storage_paths / list_custom_fields
├─ Resolve one ID    → get_tag / get_correspondent / get_document_type
├─ Create new        → create_tag / create_correspondent / create_document_type /
│                      create_storage_path / create_custom_field
├─ Edit tag          → update_tag(id, name, color, match, matching_algorithm)
├─ Edit sender       → update_correspondent(id, name, match, matching_algorithm)
├─ Edit type         → update_document_type(id, name, match, matching_algorithm)
├─ Edit storage path → update_storage_path(id, name, path, match, matching_algorithm)
├─ Edit custom field → update_custom_field(id, name, data_type, extra_data)
├─ Batch delete/perm → bulk_edit_tags / bulk_edit_correspondents / bulk_edit_document_types
```

## Critical Notes

- **search_documents strips `content`** to save tokens. Use `get_document` for
  full OCR text.
- **post_document requires base64** file content, not file paths.
- **matching_algorithm** is integer `0-6` across all endpoints (tags,
  correspondents, document types): `0`=none, `1`=any, `2`=all, `3`=exact,
  `4`=regex, `5`=fuzzy, `6`=auto. See [tools.md](references/tools.md).
- **Bulk delete is permanent and irreversible.**
- **download_document** returns base64 blob + filename from content-disposition.
- **list_tags**, **list_correspondents**, and **list_document_types** return
  complete paginated result sets; use IDs from `results`, not the bare `all` ID
  list alone.
- **bulk_edit_documents** accepts top-level MCP fields, but Paperless receives a
  nested `parameters` object internally. The MCP tool forwards only the fields
  relevant to the selected `method`.
- **update_document** is single-document only (title/ASN/custom fields/note).
  The backend bulk endpoint has no `set_title` method — use `update_document`
  to rename; keep tags/correspondent/type in `bulk_edit_documents`. `note`
  appends a note (notes live on a separate Paperless endpoint internally);
  remove one with `delete_document_note`.
- **Notes are an append-only log.** A document can hold multiple notes, each
  with its own timestamp and author. There is no edit operation — not in the
  API, not in the web UI; this is by design (log semantics). To correct an
  earlier note, append a new one (e.g. "correction: ..."). Reserve
  `delete_document_note` for entries that truly must go — deleting rewrites
  history.
- **post_document returns a task UUID, not a document ID.** Poll
  `get_task(task_id)` until `status="SUCCESS"`; `related_document` then
  holds the resulting document ID.
- **custom field values need IDs from list_custom_fields.** Resolve the field
  name → numeric ID there before calling `update_document.custom_fields` or
  `bulk_edit_documents.modify_custom_fields`.
- **delete_tag is deprecated** (removal in v3.0.0) — use `bulk_edit_tags` with
  `operation="delete"`, consistent with correspondents and document types.

## References

| Task                    | File                                          |
| ----------------------- | --------------------------------------------- |
| Tool parameters & types | [tools.md](references/tools.md)               |
| Search query syntax     | [query-syntax.md](references/query-syntax.md) |
| Multi-step workflows    | [workflows.md](references/workflows.md)       |
