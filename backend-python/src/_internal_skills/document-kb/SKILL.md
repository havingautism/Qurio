---
name: document-kb
description: File-based Markdown knowledge base for uploaded documents. Use to ingest documents into filesystem storage, locate relevant sections without embeddings, and read exact evidence chunks for grounded answers.
---

# Document KB

Filesystem-backed document knowledge base.

## Purpose

Use this skill when the user uploads or references documents that should be stored and queried without embeddings or vector search.

## Storage

Knowledge lives in `knowledge/` under this skill:

- `catalog.json`
- `spaces/{space_id}/space-index.json`
- `spaces/{space_id}/documents/{doc_id}/source.md`
- `spaces/{space_id}/documents/{doc_id}/summary.md`
- `spaces/{space_id}/documents/{doc_id}/section-map.json`
- `spaces/{space_id}/documents/{doc_id}/keywords.json`
- `spaces/{space_id}/documents/{doc_id}/chunks/*.md`

## Commands

- `ingest --space-id <id> --doc-id <id> --title <text> --file-type <type> --content-file <path>`
- `locate --space-id <id> --query <text>`
- `read --space-id <id> --doc-id <id> --section-id <id>`
- `list --space-id <id>`
- `delete --space-id <id> --doc-id <id>`

## Retrieval Workflow

Always follow:

1. `locate`
2. `read`
3. Answer with explicit source paths and section titles

Do not claim knowledge if no matching evidence is found.
