-- Migration: Add tool_ids to agents table
-- Description: Store enabled local tool ids per agent
-- Date: 2026-01-02

ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS tool_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Verify the change
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'agents'
  AND column_name = 'tool_ids';
