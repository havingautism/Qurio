-- Migration: add title emojis to conversations
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS title_emojis JSONB NOT NULL DEFAULT '[]'::jsonb;
