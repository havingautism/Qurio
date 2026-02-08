# Stream Blocks Migration (SQLite + Supabase)

## Why

`stream_blocks` stores ordered rendering blocks for each assistant message, so UI can render by actual appearance order:

- `text`
- `reasoning`
- `tool`

This avoids relying on tag parsing and avoids reordering after page refresh.

## New columns

Table: `conversation_messages`

- `stream_blocks`
  - SQLite: `TEXT` (JSON string), default `'[]'`
  - Supabase: `JSONB`, default `'[]'::jsonb`
- `stream_schema_version`
  - SQLite: `INTEGER`, default `1`
  - Supabase: `SMALLINT`, default `1`

## SQLite migration

SQL file:

- `docs/sqlite-migrations/2026-02-08-stream-blocks.sql`

## Supabase migration

SQL file:

- `supabase/migrations/20260208103000_add_stream_blocks_to_conversation_messages.sql`

Also synced in bootstrap schema:

- `supabase/init.sql`

## Backfill strategy

Current migration intentionally **does not force backfill** historical rows.

Reason:

- Legacy messages already rely on `thinking_process` and `tool_call_history`.
- Forced backfill with partial data can degrade old rendering accuracy.

Frontend logic:

- If `stream_blocks` exists and is non-empty, render by `seq`.
- Otherwise fallback to legacy fields.

## Verification

### SQLite

```sql
PRAGMA table_info(conversation_messages);
```

Expected new columns:

- `stream_blocks`
- `stream_schema_version`

### Supabase/Postgres

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'conversation_messages'
  AND column_name IN ('stream_blocks', 'stream_schema_version');
```

