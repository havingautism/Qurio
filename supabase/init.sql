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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_spaces_updated_at
BEFORE UPDATE ON public.spaces
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- 2) Agents
CREATE TABLE IF NOT EXISTS public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emoji TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  description TEXT,
  prompt TEXT,
  provider TEXT,
  lite_model TEXT,
  default_model TEXT,
  response_language TEXT,
  base_tone TEXT,
  traits TEXT,
  warmth TEXT,
  enthusiasm TEXT,
  headings TEXT,
  emojis TEXT,
  custom_instruction TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_created_at ON public.agents(created_at DESC);

CREATE TRIGGER trg_agents_updated_at
BEFORE UPDATE ON public.agents
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- 3) Conversations (chat sessions)
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
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON public.conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_title ON public.conversations(title);
CREATE INDEX IF NOT EXISTS idx_conversations_space_created ON public.conversations(space_id, created_at DESC);

CREATE TRIGGER trg_conversations_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- 4) Conversation messages
CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content JSONB NOT NULL,
  provider TEXT,
  model TEXT,
  thinking_process TEXT,
  tool_calls JSONB,
  related_questions JSONB,
  sources JSONB,
  grounding_supports JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
  ON public.conversation_messages(conversation_id, created_at);

-- 5) Conversation events (optional audit of mid-session state changes)
CREATE TABLE IF NOT EXISTS public.conversation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_conversation_created_at
  ON public.conversation_events(conversation_id, created_at);

-- 6) Attachments (files/images tied to messages)
CREATE TABLE IF NOT EXISTS public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.conversation_messages(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON public.attachments(message_id);

-- 7) Space <-> Agents (many-to-many binding)
CREATE TABLE IF NOT EXISTS public.space_agents (
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (space_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_space_agents_agent_id ON public.space_agents(agent_id);
CREATE INDEX IF NOT EXISTS idx_space_agents_space_order
  ON public.space_agents(space_id, sort_order);
