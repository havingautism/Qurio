ALTER TABLE public.conversation_messages
  ADD COLUMN IF NOT EXISTS pipeline_trace JSONB;
