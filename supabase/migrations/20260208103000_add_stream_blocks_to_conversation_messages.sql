-- Stream blocks migration for ordered rendering (Supabase/Postgres)
-- Safe to run multiple times.

ALTER TABLE public.conversation_messages
  ADD COLUMN IF NOT EXISTS stream_blocks JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.conversation_messages
  ADD COLUMN IF NOT EXISTS stream_schema_version SMALLINT NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_messages_stream_blocks_gin
  ON public.conversation_messages USING GIN (stream_blocks);

-- NOTE:
-- This migration does not force backfill old rows.
-- Keeping existing rows as stream_blocks='[]' lets frontend fall back to legacy fields
-- (thinking_process/tool_call_history) without losing historical rendering behavior.
