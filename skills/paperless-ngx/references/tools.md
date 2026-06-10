# MCP Tool Reference

Full parameter signatures for all 36 Paperless-ngx MCP tools.

## Contents

- [Document Tools](#document-tools) — search, get, update, delete_note, post, download, bulk_edit
- [Tag Tools](#tag-tools) — list, get, create, update, delete (deprecated), bulk_edit
- [Correspondent Tools](#correspondent-tools) — list, get, create, update, bulk_edit
- [Document Type Tools](#document-type-tools) — list, get, create, update, bulk_edit
- [Storage Path Tools](#storage-path-tools) — list, create, update, bulk_edit
- [Custom Field Tools](#custom-field-tools) — list, create, update, delete
- [Task Tools](#task-tools) — get, list
- [Trash Tools](#trash-tools) — list, restore, empty

## Document Tools

### search_documents

| Param       | Type   | Required | Notes                       |
| ----------- | ------ | -------- | --------------------------- |
| `query`     | string | yes      | Paperless-ngx search syntax |
| `page`      | number | no       | Pagination, starts at 1     |
| `page_size` | number | no       | Default 25, max 100         |

Returns metadata **without** `content` field. Use `get_document` for full text.

### get_document

| Param | Type   | Required | Notes                     |
| ----- | ------ | -------- | ------------------------- |
| `id`  | number | yes      | Returns full content+meta |

### update_document

| Param                   | Type             | Required | Notes                           |
| ----------------------- | ---------------- | -------- | ------------------------------- |
| `id`                    | number           | yes      | Document to patch               |
| `title`                 | string           | no       | Max 128 characters              |
| `archive_serial_number` | integer \| null  | no       | `null` clears the ASN           |
| `custom_fields`         | {field, value}[] | no       | Replaces custom field instances |
| `note`                  | string           | no       | Appends a note (existing kept)  |

Single-document `PATCH /api/documents/{id}/`; `note` goes to
`POST /api/documents/{id}/notes/` internally. Use `bulk_edit_documents` for
tags/correspondent/type — the bulk endpoint has no `set_title` method.

### delete_document_note

| Param     | Type   | Required | Notes                             |
| --------- | ------ | -------- | --------------------------------- |
| `id`      | number | yes      | Document the note belongs to      |
| `note_id` | number | yes      | From the document's `notes` array |

Returns the remaining notes. Notes are an append-only log (no edit operation
exists upstream) — prefer appending a correction note over deleting.

### post_document

| Param                   | Type     | Required | Notes                                                |
| ----------------------- | -------- | -------- | ---------------------------------------------------- |
| `file_path`             | string   | no*      | Local path on the MCP server machine; supports `~`   |
| `file`                  | string   | no*      | Base64-encoded content; small files only             |
| `filename`              | string   | no       | Required with `file`; defaults to basename otherwise |
| `title`                 | string   | no       | Auto-extracted if omitted                            |
| `created`               | string   | no       | ISO date: `YYYY-MM-DD`                               |
| `correspondent`         | number   | no       | Correspondent ID                                     |
| `document_type`         | number   | no       | Document type ID                                     |
| `storage_path`          | number   | no       | Storage path ID                                      |
| `tags`                  | number[] | no       | Array of tag IDs                                     |
| `archive_serial_number` | integer  | no       | External filing reference (≥0)                       |
| `custom_fields`         | number[] | no       | Custom field IDs                                     |

\* Provide exactly one of `file_path` (preferred: server reads from its own
filesystem, any size; stdio transport only) or `file` (inline base64 through
the model).

### download_document

| Param      | Type    | Required | Notes                                       |
| ---------- | ------- | -------- | ------------------------------------------- |
| `id`       | number  | yes      | Document ID                                 |
| `original` | boolean | no       | `true`=original upload, `false`=OCR version |

Returns `{ blob: string, filename: string }`.

### bulk_edit_documents

| Param                  | Type            | Required | Notes                                               |
| ---------------------- | --------------- | -------- | --------------------------------------------------- |
| `documents`            | number[]        | yes      | Document IDs                                        |
| `method`               | enum            | yes      | See method table below                              |
| `correspondent`        | number          | no       | For `set_correspondent`                             |
| `document_type`        | number          | no       | For `set_document_type`                             |
| `storage_path`         | number          | no       | For `set_storage_path`                              |
| `tag`                  | number          | no       | For `add_tag` / `remove_tag`                        |
| `add_tags`             | number[]        | no       | For `modify_tags`                                   |
| `remove_tags`          | number[]        | no       | For `modify_tags`                                   |
| `add_custom_fields`    | array/object    | no       | For `modify_custom_fields`                          |
| `remove_custom_fields` | number[]        | no       | For `modify_custom_fields`                          |
| `permissions`          | object          | no       | For `set_permissions`                               |
| `metadata_document_id` | number          | no       | For `merge` -- source metadata                      |
| `delete_originals`     | boolean         | no       | For `merge`/`split`                                 |
| `degrees`              | number          | no       | For `rotate`: 90, 180, 270                          |
| `pages`                | string/number[] | no       | String for `split`; number array for `delete_pages` |
| `operations`           | object[]        | no       | For `edit_pdf`                                      |
| `password`             | string          | no       | For `remove_password`                               |
| `update_document`      | boolean         | no       | For `edit_pdf`/`remove_password`                    |
| `delete_original`      | boolean         | no       | For `edit_pdf`/`remove_password`                    |
| `include_metadata`     | boolean         | no       | For `edit_pdf`/`remove_password`                    |

**Method enum:**
`set_correspondent`, `set_document_type`, `set_storage_path`, `add_tag`,
`remove_tag`, `modify_tags`, `modify_custom_fields`, `delete`, `reprocess`,
`set_permissions`, `merge`, `split`, `rotate`, `delete_pages`, `edit_pdf`,
`remove_password`

The MCP tool accepts method-specific parameters as top-level arguments and sends
only the relevant fields to Paperless' nested `parameters` payload.

## Tag Tools

### list_tags

Optional `name` param: case-insensitive substring filter. Returns all tags with name, color, matching rules. The MCP client
fetches all pages and combines `results`.

### get_tag

| Param | Type   | Required | Notes                        |
| ----- | ------ | -------- | ---------------------------- |
| `id`  | number | yes      | Single tag: name/color/match |

### create_tag

| Param                | Type   | Required | Notes                                                                 |
| -------------------- | ------ | -------- | --------------------------------------------------------------------- |
| `name`               | string | yes      | Unique tag name                                                       |
| `color`              | string | no       | Hex: `#FF0000`                                                        |
| `match`              | string | no       | Auto-assign pattern                                                   |
| `matching_algorithm` | int    | no       | `0`=none, `1`=any, `2`=all, `3`=exact, `4`=regex, `5`=fuzzy, `6`=auto |

### update_tag

| Param                | Type   | Required | Notes                    |
| -------------------- | ------ | -------- | ------------------------ |
| `id`                 | number | yes      | Tag ID from list_tags    |
| `name`               | string | no       | New name                 |
| `color`              | string | no       | Hex color                |
| `match`              | string | no       | Auto-assign pattern      |
| `matching_algorithm` | int    | no       | `0`-`6` (same as create) |

### delete_tag (deprecated)

| Param | Type   | Required | Notes                                  |
| ----- | ------ | -------- | -------------------------------------- |
| `id`  | number | yes      | Removes from all documents. Permanent. |

**Deprecated** — removal planned for v3.0.0. Use `bulk_edit_tags` with
`operation="delete"` instead.

### bulk_edit_tags

| Param         | Type     | Required | Notes                                         |
| ------------- | -------- | -------- | --------------------------------------------- |
| `tag_ids`     | number[] | yes      | Tag IDs                                       |
| `operation`   | enum     | yes      | `"set_permissions"` or `"delete"`             |
| `owner`       | number   | no       | For `set_permissions`                         |
| `permissions` | object   | no       | `{view:{users,groups},change:{users,groups}}` |
| `merge`       | boolean  | no       | Merge or replace permissions                  |

## Correspondent Tools

### list_correspondents

Optional `name` param: case-insensitive substring filter. The MCP client fetches all pages and combines `results`.

### get_correspondent

| Param | Type   | Required | Notes                                 |
| ----- | ------ | -------- | ------------------------------------- |
| `id`  | number | yes      | Resolve a document's correspondent ID |

### create_correspondent

| Param                | Type   | Required | Notes                                                                 |
| -------------------- | ------ | -------- | --------------------------------------------------------------------- |
| `name`               | string | yes      | Person/company/org name                                               |
| `match`              | string | no       | Auto-assign pattern                                                   |
| `matching_algorithm` | int    | no       | `0`=none, `1`=any, `2`=all, `3`=exact, `4`=regex, `5`=fuzzy, `6`=auto |

### update_correspondent

| Param                | Type    | Required | Notes                              |
| -------------------- | ------- | -------- | ---------------------------------- |
| `id`                 | number  | yes      | From list_correspondents           |
| `name`               | string  | no       | New name                           |
| `match`              | string  | no       | Empty string removes auto-matching |
| `matching_algorithm` | int     | no       | `0`-`6` (same as create)           |
| `is_insensitive`     | boolean | no       | Case-insensitive matching          |

Single-correspondent `PATCH /api/correspondents/{id}/`. Use
`bulk_edit_correspondents` for permissions/deletion.

### bulk_edit_correspondents

| Param               | Type     | Required | Notes                             |
| ------------------- | -------- | -------- | --------------------------------- |
| `correspondent_ids` | number[] | yes      | Correspondent IDs                 |
| `operation`         | enum     | yes      | `"set_permissions"` or `"delete"` |
| `owner`             | number   | no       | For `set_permissions`             |
| `permissions`       | object   | no       | Same shape as tags                |
| `merge`             | boolean  | no       | Merge or replace permissions      |

## Document Type Tools

### list_document_types

Optional `name` param: case-insensitive substring filter. The MCP client fetches all pages and combines `results`.

### get_document_type

| Param | Type   | Required | Notes                                 |
| ----- | ------ | -------- | ------------------------------------- |
| `id`  | number | yes      | Resolve a document's document_type ID |

### create_document_type

| Param                | Type   | Required | Notes                                                                 |
| -------------------- | ------ | -------- | --------------------------------------------------------------------- |
| `name`               | string | yes      | Type name (Invoice, Receipt, etc.)                                    |
| `match`              | string | no       | Auto-assign pattern                                                   |
| `matching_algorithm` | int    | no       | `0`=none, `1`=any, `2`=all, `3`=exact, `4`=regex, `5`=fuzzy, `6`=auto |

### update_document_type

| Param                | Type    | Required | Notes                              |
| -------------------- | ------- | -------- | ---------------------------------- |
| `id`                 | number  | yes      | From list_document_types           |
| `name`               | string  | no       | New name                           |
| `match`              | string  | no       | Empty string removes auto-matching |
| `matching_algorithm` | int     | no       | `0`-`6` (same as create)           |
| `is_insensitive`     | boolean | no       | Case-insensitive matching          |

Single-type `PATCH /api/document_types/{id}/`. Use `bulk_edit_document_types`
for permissions/deletion.

### bulk_edit_document_types

| Param               | Type     | Required | Notes                             |
| ------------------- | -------- | -------- | --------------------------------- |
| `document_type_ids` | number[] | yes      | Document type IDs                 |
| `operation`         | enum     | yes      | `"set_permissions"` or `"delete"` |
| `owner`             | number   | no       | For `set_permissions`             |
| `permissions`       | object   | no       | Same shape as tags                |
| `merge`             | boolean  | no       | Merge or replace permissions      |

## Storage Path Tools

### list_storage_paths

Optional `name` param: case-insensitive substring filter. The MCP client fetches all pages and combines `results`. Use to
resolve a document's `storage_path` ID to a name.

### create_storage_path

| Param                | Type    | Required | Notes                                                          |
| -------------------- | ------- | -------- | -------------------------------------------------------------- |
| `name`               | string  | yes      | Unique storage path name                                       |
| `path`               | string  | yes      | Template: `{{ created_year }}/{{ correspondent }}/{{ title }}` |
| `match`              | string  | no       | Auto-assign pattern                                            |
| `matching_algorithm` | int     | no       | `0`-`6` (same as tags)                                         |
| `is_insensitive`     | boolean | no       | Case-insensitive matching                                      |

### update_storage_path

| Param                | Type    | Required | Notes                              |
| -------------------- | ------- | -------- | ---------------------------------- |
| `id`                 | number  | yes      | From list_storage_paths            |
| `name`               | string  | no       | New name                           |
| `path`               | string  | no       | New path template                  |
| `match`              | string  | no       | Empty string removes auto-matching |
| `matching_algorithm` | int     | no       | `0`-`6` (same as create)           |
| `is_insensitive`     | boolean | no       | Case-insensitive matching          |

Single-path `PATCH /api/storage_paths/{id}/`. Use `bulk_edit_storage_paths`
for permissions/deletion.

### bulk_edit_storage_paths

| Param              | Type     | Required | Notes                             |
| ------------------ | -------- | -------- | --------------------------------- |
| `storage_path_ids` | number[] | yes      | Storage path IDs                  |
| `operation`        | enum     | yes      | `"set_permissions"` or `"delete"` |
| `owner`            | number   | no       | For `set_permissions`             |
| `permissions`      | object   | no       | Same shape as tags                |
| `merge`            | boolean  | no       | Merge or replace permissions      |

Deleting a storage path does not delete documents — they fall back to the
default storage location.

## Custom Field Tools

### list_custom_fields

Optional `name` param: case-insensitive substring filter. Returns all field definitions with the numeric IDs that
`update_document.custom_fields` and `modify_custom_fields` require.

### create_custom_field

| Param        | Type   | Required | Notes                                                                                        |
| ------------ | ------ | -------- | -------------------------------------------------------------------------------------------- |
| `name`       | string | yes      | Unique field name                                                                            |
| `data_type`  | enum   | yes      | `string`, `url`, `date`, `boolean`, `integer`, `float`, `monetary`, `documentlink`, `select` |
| `extra_data` | object | no       | E.g. `{select_options: [{label: "Open"}]}`                                                   |

### update_custom_field

| Param        | Type   | Required | Notes                                        |
| ------------ | ------ | -------- | -------------------------------------------- |
| `id`         | number | yes      | From list_custom_fields                      |
| `name`       | string | no       | New name                                     |
| `data_type`  | enum   | no       | Changing type may invalidate existing values |
| `extra_data` | object | no       | New options/config                           |

### delete_custom_field

| Param | Type   | Required | Notes                                               |
| ----- | ------ | -------- | --------------------------------------------------- |
| `id`  | number | yes      | Drops field + values from all documents. Permanent. |

Single-delete only — the backend has no bulk endpoint for custom fields
(`custom_fields` is not in `/api/bulk_edit_objects/`'s object types).

## Task Tools

### get_task

| Param     | Type   | Required | Notes                          |
| --------- | ------ | -------- | ------------------------------ |
| `task_id` | string | yes      | UUID returned by post_document |

Returns matching task(s) with `status` (`PENDING`, `STARTED`, `SUCCESS`,
`FAILURE`) and `related_document` — the resulting document ID once the
consumer finishes. Poll after `post_document` to close the upload loop.

### list_tasks

| Param          | Type    | Required | Notes                                                     |
| -------------- | ------- | -------- | --------------------------------------------------------- |
| `status`       | enum    | no       | `PENDING`/`STARTED`/`SUCCESS`/`FAILURE`/`RETRY`/`REVOKED` |
| `acknowledged` | boolean | no       | `false` = still visible in the Paperless tasks view       |
| `task_name`    | string  | no       | `consume_file`, `train_classifier`, `check_sanity`, ...   |
| `limit`        | int     | no       | Max tasks returned, newest first. Default 25, max 100     |

Recent tasks newest-first. Use when the `post_document` UUID is lost, or to
find failed consumptions (`status="FAILURE"`). The instance keeps thousands of
historical tasks; the limit is applied client-side because the endpoint
returns everything in one array.

## Trash Tools

### list_trash

No parameters. Returns soft-deleted documents awaiting purge (content field
stripped). Documents land here via `bulk_edit_documents(method="delete")`.

### restore_from_trash

| Param       | Type     | Required | Notes               |
| ----------- | -------- | -------- | ------------------- |
| `documents` | number[] | yes      | IDs from list_trash |

Restores documents to the archive with metadata intact.

### empty_trash

| Param       | Type     | Required | Notes                          |
| ----------- | -------- | -------- | ------------------------------ |
| `documents` | number[] | no       | Omit to purge the ENTIRE trash |

**Permanent and irreversible.** This is the step that actually deletes files.
