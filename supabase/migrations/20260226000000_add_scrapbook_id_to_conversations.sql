-- Migration: Add scrapbook_id to conversations
-- Allows persisting the association between a chat and a specific scrapbook entry.

ALTER TABLE public.conversations 
ADD COLUMN scrapbook_id TEXT REFERENCES public.scrapbook(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.conversations.scrapbook_id 
IS 'Reference to the scrapbook entry this conversation originated from.';
