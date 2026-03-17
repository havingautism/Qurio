---
name: agent-memory
description: 'Use this skill for independent file-based memory: save durable facts,
  recall prior notes, update stale memories, and organize memory files. Trigger on:
  remember/save/note/recall/check memory/clean memories.'
---

# Agent Memory

Independent file-based memory system for knowledge that survives across conversations.

**Location:** `backend-python/.skills/agent-memory/memories/`
**Scripts:** `scripts/list_categories.py`, `scripts/list_memories.py`, `scripts/search_memories.py`, `scripts/save_memory.py`, `scripts/delete_memory.py`

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

### Mandatory Retrieval Protocol

For any recall/search request, you MUST call `scripts/list_categories.py` first.

Batch-first rule:
- `scripts/list_memories.py` without `--category` is a GLOBAL BATCH retrieval.
- This single call already returns memories across all categories.
- After a global batch call, do not iterate `list_memories.py --category ...` for every category unless the user explicitly asks for per-category drill-down.

Category names are runtime-discovered values, not semantic guesses.
Never infer category names from the user request.
Only use exact category strings returned by `list_categories.py`.

Do not call `search_memories.py --category ...` unless that category was returned by the immediately preceding `list_categories.py` result.

If the user asks for "recent memories", "last notes", or similarly vague recall:
1. Call `list_categories.py`
2. Call `list_memories.py` (without `--category`, global batch)
3. Only then decide whether category-scoped or global search is needed

Calling `search_memories.py` with an invented category is an invalid workflow.

Global search is a fallback step, not the first retrieval step when categories are available.

If `search` returns no results:
1. Retry with a broader keyword
2. Try another valid category from tool output
3. Use global search only after category-scoped attempts are exhausted

Do not ask the user for keyword/category before the first retrieval attempt.

### Invalid Behaviors

- Skipping `list_categories.py`
- Inventing a category not seen in tool output
- Using global search as the first retrieval step when categories are available
- Calling `list_memories.py --category ...` repeatedly after a successful global batch list
- Calling `search_memories.py --category ...` with a value not returned by the latest categories result
- Asking user to provide category names before reading available categories from tool output

When called by the model, prefer this tool call pattern:

```json
{
  "name": "execute_skill_script",
  "arguments": {
    "skill_id": "agent-memory",
    "script_path": "scripts/list_categories.py",
    "args": []
  }
}
```

Then follow with:

```json
{
  "name": "execute_skill_script",
  "arguments": {
    "skill_id": "agent-memory",
    "script_path": "scripts/search_memories.py",
    "args": ["--category", "pets", "--keyword", "cat"]
  }
}
```

Important:
- `args` must be a JSON array of CLI tokens, not an object.
- Correct: `"args": ["--keyword", "cat"]`
- Wrong: `"args": {"action": "recall", "query": "cat"}`
- Runtime guardrail: retrieval calls are preflighted with `list_categories.py` before search execution.

## Operations

### Save

1. Check folders first (`categories`)
2. Check existing memory in the likely category (`search`)
3. Save with category + slug + summary + content
4. Verify persistence by calling `list` or `search`
5. Only then report success to user

```bash
python scripts/save_memory.py \
  --category "project-context" \
  --slug "my-topic" \
  --summary "What this memory is about" \
  --content "Detailed memory content"

python scripts/search_memories.py --keyword "my-topic"
```

### Update

When information changes:
- re-save with `--overwrite`
- set `updated: YYYY-MM-DD`
- update `status` when relevant (`resolved`, `blocked`, etc.)

```bash
python scripts/save_memory.py \
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
  python scripts/delete_memory.py --category "project-context" --slug "my-topic"
  ```

## Guidelines

1. Write for future resumption, not for transcript archival.
2. Keep files self-contained and actionable.
3. Keep summaries specific and searchable.
4. Prefer updating existing memory over creating duplicates.
5. Never store secrets or credentials.
6. Never claim persistence success without script output confirming `{"ok": true}`.
