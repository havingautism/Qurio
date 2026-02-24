-- Migration: Add optional emoji to scrapbook entries
ALTER TABLE IF EXISTS public.scrapbook
  ADD COLUMN IF NOT EXISTS emoji TEXT;

COMMENT ON COLUMN public.scrapbook.emoji
  IS 'Optional AI-generated emoji for quick visual scanning of scrapbook entries.';
