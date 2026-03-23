ALTER TABLE public.conversation_messages
ADD COLUMN IF NOT EXISTS turn_summary TEXT;
