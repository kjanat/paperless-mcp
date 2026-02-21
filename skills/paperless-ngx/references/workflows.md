# Common Workflows

Multi-step operations for Paperless-ngx document management.

## Contents

1. [Classify Untagged Documents](#1-classify-untagged-documents)
2. [Bulk Reclassify by Correspondent](#2-bulk-reclassify-by-correspondent)
3. [Upload and Categorize a Batch](#3-upload-and-categorize-a-batch)
4. [Merge Related Documents](#4-merge-related-documents)
5. [Export Documents for External Use](#5-export-documents-for-external-use)
6. [Set Up Auto-Classification Rules](#6-set-up-auto-classification-rules)
7. [Audit and Clean Up Tags](#7-audit-and-clean-up-tags)

## 1. Classify Untagged Documents

```txt
1. search_documents(query="NOT tag:*")
   → get list of untagged document IDs + titles

2. For each document of interest:
   get_document(id=N)
   → read full OCR content

3. list_tags()
   → find matching tag IDs (or create_tag if needed)

4. bulk_edit_documents(
     documents=[id1, id2, ...],
     method="add_tag",
     tag=TAG_ID
   )
```

## 2. Bulk Reclassify by Correspondent

```txt
1. list_correspondents()
   → identify current + target correspondent IDs

2. search_documents(query="correspondent:old-name")
   → collect document IDs

3. bulk_edit_documents(
     documents=[...],
     method="set_correspondent",
     correspondent=NEW_ID
   )
```

## 3. Upload and Categorize a Batch

```txt
For each file:

1. Resolve metadata:
   list_tags()              → tag IDs
   list_correspondents()    → correspondent ID (or create_correspondent)
   list_document_types()    → type ID (or create_document_type)

2. post_document(
     file=<base64 content>,
     filename="receipt-2024-03.pdf",
     tags=[1, 5],
     correspondent=3,
     document_type=2,
     created="2024-03-15"
   )
   → returns task ID (processing is async)

3. Verify: search_documents(query="receipt-2024-03")
   → confirm document appears with expected metadata
```

## 4. Merge Related Documents

```txt
1. search_documents(query="invoice acme created:[2024-01 to 2024-03]")
   → collect document IDs

2. Pick the primary document (whose metadata to keep):
   get_document(id=PRIMARY_ID) → verify it's correct

3. bulk_edit_documents(
     documents=[PRIMARY_ID, SECONDARY_ID_1, SECONDARY_ID_2],
     method="merge",
     metadata_document_id=PRIMARY_ID,
     delete_originals=false     # keep originals until verified
   )

4. Verify: get_document(id=PRIMARY_ID)
   → confirm merged content is correct before deleting originals
```

## 5. Export Documents for External Use

```txt
1. search_documents(query="tag:export-ready")
   → collect IDs

2. For each:
   download_document(id=N, original=true)
   → returns { blob: "<base64>", filename: "original-name.pdf" }

3. Decode base64 and save/forward as needed
```

## 6. Set Up Auto-Classification Rules

```txt
1. create_tag(
     name="electricity",
     match="electricity power grid kwh",
     matching_algorithm=1     # 1=any word matches
   )

2. create_correspondent(
     name="Power Company",
     match="Power Co energy provider",
     matching_algorithm=5     # 5=fuzzy
   )

3. create_document_type(
     name="Utility Bill",
     match="utility bill statement due",
     matching_algorithm=1     # 1=any word matches
   )

Future uploads auto-classified by Paperless-ngx matching engine.
```

## 7. Audit and Clean Up Tags

```txt
1. list_tags()
   → review all tags, identify duplicates/unused

2. search_documents(query="tag:old-tag-name")
   → check usage count

3. If migrating:
   search → collect IDs → bulk_edit add new tag → bulk_edit remove old tag

4. Verify: search_documents(query="tag:new-tag-name")
   → confirm all documents migrated before deleting old tag

5. delete_tag(id=OLD_TAG_ID)
   or bulk_edit_tags(tag_ids=[...], operation="delete")
```

## Pattern: Always Resolve IDs First

All document operations use numeric IDs, not names. Always:

```txt
list_*()  → find ID for name
           → if not found: create_*() → get ID from response
           → then use ID in subsequent operations
```
