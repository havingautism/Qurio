-- Migration: keep conversations.updated_at stable on title-only updates
CREATE OR REPLACE FUNCTION public.set_conversation_updated_at()
RETURNS trigger AS $$
BEGIN
  IF (
    (NEW.title IS DISTINCT FROM OLD.title OR NEW.title_emojis IS DISTINCT FROM OLD.title_emojis OR NEW.is_favorited IS DISTINCT FROM OLD.is_favorited OR NEW.space_id IS DISTINCT FROM OLD.space_id)
    AND NEW.last_agent_id IS NOT DISTINCT FROM OLD.last_agent_id
    AND NEW.agent_selection_mode IS NOT DISTINCT FROM OLD.agent_selection_mode
    AND NEW.api_provider IS NOT DISTINCT FROM OLD.api_provider
    AND NEW.is_search_enabled IS NOT DISTINCT FROM OLD.is_search_enabled
    AND NEW.is_thinking_enabled IS NOT DISTINCT FROM OLD.is_thinking_enabled
  ) THEN
    NEW.updated_at = OLD.updated_at;
  ELSE
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_conversations_updated_at ON public.conversations;
CREATE TRIGGER trg_conversations_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW EXECUTE PROCEDURE public.set_conversation_updated_at();
