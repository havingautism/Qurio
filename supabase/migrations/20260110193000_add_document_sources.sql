ALTER TABLE IF EXISTS public.conversation_messages
ADD COLUMN IF NOT EXISTS document_sources JSONB DEFAULT '[]'::jsonb;
