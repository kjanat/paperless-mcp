# Paperless-ngx Search Query Syntax

Reference for the `query` parameter of `search_documents`.

## Basic Search

Words separated by spaces match documents containing **ALL** words.

```txt
invoice electricity    # docs with BOTH "invoice" AND "electricity"
```

## Field Searches

| Field         | Syntax               | Example                    |
| ------------- | -------------------- | -------------------------- |
| Tag           | `tag:name`           | `tag:unpaid`               |
| Document type | `type:name`          | `type:invoice`             |
| Correspondent | `correspondent:name` | `correspondent:university` |
| Title         | `title:text`         | `title:electricity`        |
| Content       | (default, no prefix) | `electricity bill`         |
| ASN           | `asn:number`         | `asn:1234`                 |

## Logical Operators

```txt
term1 AND term2            # Both required (default behavior)
term1 OR term2             # Either matches
NOT term1                  # Exclude term
term1 AND (term2 OR term3) # Grouping with parentheses
```

## Date Ranges

| Syntax                         | Matches              |
| ------------------------------ | -------------------- |
| `created:[2024 to 2025]`       | Created in 2024-2025 |
| `created:2024`                 | Created in 2024      |
| `added:yesterday`              | Added yesterday      |
| `added:today`                  | Added today          |
| `modified:today`               | Modified today       |
| `created:[2024-01 to 2024-06]` | Jan-Jun 2024         |

## Wildcards

```txt
prod*name      # Matches "production name", "product name", etc.
inv?ice        # Single character wildcard
```

## Combined Queries

```txt
# Unpaid invoices from 2024
tag:unpaid type:invoice created:2024

# Bank statements NOT from Chase
type:statement correspondent:bank NOT correspondent:chase

# Recent electricity or gas bills
(electricity OR gas) type:bill added:[2024-01 to 2025-01]
```

## Tips

- Queries search across content, title, correspondent, type, and tags.
- Results are paginated: use `page` and `page_size` params.
- Results exclude `content` field to save tokens -- use `get_document` for
  full OCR text of specific results.
- Max `page_size` is 100.
