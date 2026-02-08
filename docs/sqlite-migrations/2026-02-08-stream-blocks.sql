-- Add ordered stream blocks for assistant message rendering.
-- Run once per database.

PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

-- 1) stream_blocks: JSON text array of ordered blocks.
ALTER TABLE conversation_messages
  ADD COLUMN stream_blocks TEXT NOT NULL DEFAULT '[]';

-- 2) stream_schema_version: schema version for stream_blocks payload.
ALTER TABLE conversation_messages
  ADD COLUMN stream_schema_version INTEGER NOT NULL DEFAULT 1;

COMMIT;
PRAGMA foreign_keys = ON;
