-- Supabase initialization script (local-first, single-user)
-- Run in Supabase SQL editor to create core tables for spaces, conversations, messages, and attachments.

-- Extensions (Supabase usually preinstalls these; keep for safety)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Helper trigger to maintain updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1) Spaces
CREATE TABLE IF NOT EXISTS public.spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emoji TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL,
  description TEXT,
  prompt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_spaces_updated_at
BEFORE UPDATE ON public.spaces
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- 2) Conversations (chat sessions)
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID REFERENCES public.spaces(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  api_provider TEXT NOT NULL DEFAULT 'gemini',
  is_search_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_thinking_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_favorited BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_space_id ON public.conversations(space_id);

CREATE TRIGGER trg_conversations_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- 3) Conversation messages
CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content JSONB NOT NULL,
  tool_calls JSONB,
  related_questions JSONB,
  sources JSONB,
  grounding_supports JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
  ON public.conversation_messages(conversation_id, created_at);

-- 4) Conversation events (optional audit of mid-session state changes)
CREATE TABLE IF NOT EXISTS public.conversation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_conversation_created_at
  ON public.conversation_events(conversation_id, created_at);

-- 5) Attachments (files/images tied to messages)
CREATE TABLE IF NOT EXISTS public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.conversation_messages(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON public.attachments(message_id);

