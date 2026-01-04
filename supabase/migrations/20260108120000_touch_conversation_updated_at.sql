-- Migration: touch conversation updated_at on message insert/update
CREATE OR REPLACE FUNCTION public.touch_conversation_updated_at()
RETURNS trigger AS $$
BEGIN
  UPDATE public.conversations
  SET updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
  ON public.conversations(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_space_updated
  ON public.conversations(space_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_messages_touch_conversation ON public.conversation_messages;
CREATE TRIGGER trg_messages_touch_conversation
AFTER INSERT OR UPDATE ON public.conversation_messages
FOR EACH ROW EXECUTE PROCEDURE public.touch_conversation_updated_at();
