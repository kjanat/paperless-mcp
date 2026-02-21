# MCP Tool Reference

Full parameter signatures for all 16 Paperless-NGX MCP tools.

## Document Tools

### search_documents

| Param       | Type   | Required | Notes                       |
| ----------- | ------ | -------- | --------------------------- |
| `query`     | string | yes      | Paperless-NGX search syntax |
| `page`      | number | no       | Pagination, starts at 1     |
| `page_size` | number | no       | Default 25, max 100         |

Returns metadata **without** `content` field. Use `get_document` for full text.

### get_document

| Param | Type   | Required | Notes                     |
| ----- | ------ | -------- | ------------------------- |
| `id`  | number | yes      | Returns full content+meta |

### post_document

| Param                   | Type     | Required | Notes                           |
| ----------------------- | -------- | -------- | ------------------------------- |
| `file`                  | string   | yes      | Base64-encoded file content     |
| `filename`              | string   | yes      | With extension: `"invoice.pdf"` |
| `title`                 | string   | no       | Auto-extracted if omitted       |
| `created`               | string   | no       | ISO date: `YYYY-MM-DD`          |
| `correspondent`         | number   | no       | Correspondent ID                |
| `document_type`         | number   | no       | Document type ID                |
| `storage_path`          | number   | no       | Storage path ID                 |
| `tags`                  | number[] | no       | Array of tag IDs                |
| `archive_serial_number` | string   | no       | External filing reference       |
| `custom_fields`         | number[] | no       | Custom field IDs                |

### download_document

| Param      | Type    | Required | Notes                                       |
| ---------- | ------- | -------- | ------------------------------------------- |
| `id`       | number  | yes      | Document ID                                 |
| `original` | boolean | no       | `true`=original upload, `false`=OCR version |

Returns `{ blob: string, filename: string }`.

### bulk_edit_documents

| Param                  | Type     | Required | Notes                           |
| ---------------------- | -------- | -------- | ------------------------------- |
| `documents`            | number[] | yes      | Document IDs                    |
| `method`               | enum     | yes      | See method table below          |
| `correspondent`        | number   | no       | For `set_correspondent`         |
| `document_type`        | number   | no       | For `set_document_type`         |
| `storage_path`         | number   | no       | For `set_storage_path`          |
| `tag`                  | number   | no       | For `add_tag` / `remove_tag`    |
| `add_tags`             | number[] | no       | For `modify_tags`               |
| `remove_tags`          | number[] | no       | For `modify_tags`               |
| `permissions`          | object   | no       | For `set_permissions`           |
| `metadata_document_id` | number   | no       | For `merge` -- source metadata  |
| `delete_originals`     | boolean  | no       | For `merge`/`split`             |
| `degrees`              | number   | no       | For `rotate`: 90, 180, 270      |
| `pages`                | string   | no       | For `delete_pages`: `"1,3,5-7"` |

**Method enum:**
`set_correspondent`, `set_document_type`, `set_storage_path`, `add_tag`,
`remove_tag`, `modify_tags`, `delete`, `reprocess`, `set_permissions`,
`merge`, `split`, `rotate`, `delete_pages`

## Tag Tools

### list_tags

No parameters. Returns all tags with name, color, matching rules.

### create_tag

| Param                | Type   | Required | Notes                                             |
| -------------------- | ------ | -------- | ------------------------------------------------- |
| `name`               | string | yes      | Unique tag name                                   |
| `color`              | string | no       | Hex: `#FF0000`                                    |
| `match`              | string | no       | Auto-assign pattern                               |
| `matching_algorithm` | int    | no       | `0`=any, `1`=all, `2`=exact, `3`=regex, `4`=fuzzy |

### update_tag

| Param                | Type   | Required | Notes                    |
| -------------------- | ------ | -------- | ------------------------ |
| `id`                 | number | yes      | Tag ID from list_tags    |
| `name`               | string | yes      | New name                 |
| `color`              | string | no       | Hex color                |
| `match`              | string | no       | Auto-assign pattern      |
| `matching_algorithm` | int    | no       | `0`-`4` (same as create) |

### delete_tag

| Param | Type   | Required | Notes                                  |
| ----- | ------ | -------- | -------------------------------------- |
| `id`  | number | yes      | Removes from all documents. Permanent. |

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

No parameters.

### create_correspondent

| Param                | Type   | Required | Notes                                                      |
| -------------------- | ------ | -------- | ---------------------------------------------------------- |
| `name`               | string | yes      | Person/company/org name                                    |
| `match`              | string | no       | Auto-assign pattern                                        |
| `matching_algorithm` | enum   | no       | `"any"`,`"all"`,`"exact"`,`"regular expression"`,`"fuzzy"` |

**Note:** String enum, not numeric like tags.

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

No parameters.

### create_document_type

| Param                | Type   | Required | Notes                                                      |
| -------------------- | ------ | -------- | ---------------------------------------------------------- |
| `name`               | string | yes      | Type name (Invoice, Receipt, etc.)                         |
| `match`              | string | no       | Auto-assign pattern                                        |
| `matching_algorithm` | enum   | no       | `"any"`,`"all"`,`"exact"`,`"regular expression"`,`"fuzzy"` |

**Note:** String enum, not numeric like tags.

### bulk_edit_document_types

| Param               | Type     | Required | Notes                             |
| ------------------- | -------- | -------- | --------------------------------- |
| `document_type_ids` | number[] | yes      | Document type IDs                 |
| `operation`         | enum     | yes      | `"set_permissions"` or `"delete"` |
| `owner`             | number   | no       | For `set_permissions`             |
| `permissions`       | object   | no       | Same shape as tags                |
| `merge`             | boolean  | no       | Merge or replace permissions      |
