-- Migration: Add research_step_history to conversation_messages table
-- Description: Persist deep research step execution history for UI
-- Date: 2026-01-03

ALTER TABLE public.conversation_messages
ADD COLUMN IF NOT EXISTS research_step_history JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Verify the change
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'conversation_messages'
  AND column_name = 'research_step_history';
