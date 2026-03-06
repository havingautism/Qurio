---
name: agent-memory
description: 'Use this skill for independent file-based memory: save durable facts,
  recall prior notes, update stale memories, and organize memory files. Trigger on:
  remember/save/note/recall/check memory/clean memories.'
---

# Agent Memory

Independent file-based memory system for knowledge that survives across conversations.

**Location:** `backend-python/.skills/agent-memory/memories/`
**Script:** `scripts/memory_store.py`

## Runtime Requirement

This skill requires the `execute_skill_script` tool.

- If `execute_skill_script` is unavailable, do **not** claim memory was saved.
- Explicitly tell the user that persistence is unavailable in the current tool setup.

## When To Use

Use this skill when the user asks to:
- save or remember something
- recall prior notes
- clean up, merge, or reorganize memories

Use proactively only for durable information:
- stable user preferences or long-lived constraints
- non-obvious project decisions and rationale
- important troubleshooting outcomes worth reusing

Do not save:
- transient chat content with no future value
- secrets, tokens, passwords, private keys
- sensitive personal data unless the user explicitly asks

## Folder Structure

Organize memories into category folders. No fixed taxonomy; use practical categories.

Guidelines:
- Use kebab-case for folder and file names
- Prefer stable category names (`project-context`, `bugs`, `preferences`, `architecture`)
- Consolidate or reorganize as the memory base evolves

Example:
```text
memories/
├── file-processing/
│   └── large-file-memory-issue.md
├── dependencies/
│   └── iconv-esm-problem.md
└── project-context/
    └── december-2025-work.md
```

This is just an example. Structure freely based on actual content.

## Frontmatter

All memory files must include YAML frontmatter with a required `summary` field.

`summary` is the retrieval decision point. It must say what this memory is about and why it matters.

**Required:**
```yaml
---
summary: "1-2 line description of what this memory contains"
created: YYYY-MM-DD
---
```

**Optional:**
```yaml
---
summary: "Worker thread memory leak during large file processing - cause and solution"
created: YYYY-MM-DD
updated: YYYY-MM-DD
status: in-progress  # in-progress | resolved | blocked | abandoned
tags: [performance, worker, memory-leak]
related: [src/core/file/fileProcessor.ts]
---
```

## Search Workflow

Use summary-first retrieval:

```bash
python scripts/memory_store.py list
python scripts/memory_store.py search --keyword "your keyword"
```

**Strategy:**
- If you don't know what to search for, call `list` first to see all categories and summaries.
- If `search` returns no results, try a broader keyword or `list` the entire category.

When called by the model, prefer this tool call pattern:

```json
{
  "name": "execute_skill_script",
  "arguments": {
    "skill_id": "agent-memory",
    "script_path": "scripts/memory_store.py",
    "args": ["search", "--keyword", "keyword"]
  }
}
```

## Operations

### Save

1. Check existing memory first (`search`)
2. Save with category + slug + summary + content
3. Verify persistence by calling `list` or `search`
4. Only then report success to user

```bash
python scripts/memory_store.py save \
  --category "project-context" \
  --slug "my-topic" \
  --summary "What this memory is about" \
  --content "Detailed memory content"

python scripts/memory_store.py search --keyword "my-topic"
```

### Update

When information changes:
- re-save with `--overwrite`
- set `updated: YYYY-MM-DD`
- update `status` when relevant (`resolved`, `blocked`, etc.)

```bash
python scripts/memory_store.py save \
  --category "project-context" \
  --slug "my-topic" \
  --summary "Updated summary" \
  --content "Updated content" \
  --overwrite
```

### Delete / Consolidate

- Delete only if memory is obsolete or duplicated
- Prefer merge + keep one canonical file when possible
- Safe delete:
  ```bash
  python scripts/memory_store.py delete --category "project-context" --slug "my-topic"
  ```

## Guidelines

1. Write for future resumption, not for transcript archival.
2. Keep files self-contained and actionable.
3. Keep summaries specific and searchable.
4. Prefer updating existing memory over creating duplicates.
5. Never store secrets or credentials.
6. Never claim persistence success without script output confirming `{"ok": true}`.
