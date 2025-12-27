-- Migration: Add agent_selection_mode to conversations table
-- Description: Add a field to track whether agent selection is 'auto' or 'manual'
-- Date: 2025-12-27

-- Add the new column with a default value
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS agent_selection_mode TEXT NOT NULL DEFAULT 'auto';

-- Add a check constraint to ensure only valid values
ALTER TABLE public.conversations
DROP CONSTRAINT IF EXISTS conversations_agent_selection_mode_check;

ALTER TABLE public.conversations
ADD CONSTRAINT conversations_agent_selection_mode_check
CHECK (agent_selection_mode IN ('auto', 'manual'));

-- Verify the change
SELECT
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'conversations'
  AND column_name = 'agent_selection_mode';
