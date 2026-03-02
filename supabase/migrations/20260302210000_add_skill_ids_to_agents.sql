-- Add skill_ids column to agents table
-- This supports custom Agno skills per agent.
-- Safe to run multiple times.

ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS skill_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
