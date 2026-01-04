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

-- Touch conversations.updated_at on new/updated messages
CREATE OR REPLACE FUNCTION public.touch_conversation_updated_at()
RETURNS trigger AS $$
BEGIN
  UPDATE public.conversations
  SET updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1) Spaces
CREATE TABLE IF NOT EXISTS public.spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emoji TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL,
  description TEXT,
  is_deep_research BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_spaces_updated_at
BEFORE UPDATE ON public.spaces
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- 2) Agents
CREATE TABLE IF NOT EXISTS public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  emoji TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  description TEXT,
  prompt TEXT,
  is_deep_research BOOLEAN NOT NULL DEFAULT FALSE,
  provider TEXT,
  default_model_provider TEXT,
  lite_model_provider TEXT,
  default_model_source TEXT NOT NULL DEFAULT 'list',
  lite_model_source TEXT NOT NULL DEFAULT 'list',
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
  temperature DOUBLE PRECISION,
  top_p DOUBLE PRECISION,
  frequency_penalty DOUBLE PRECISION,
  presence_penalty DOUBLE PRECISION,
  tool_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
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
  last_agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  agent_selection_mode TEXT NOT NULL DEFAULT 'auto' CHECK (agent_selection_mode IN ('auto', 'manual')),
  title TEXT NOT NULL DEFAULT 'New Conversation',
  title_emojis JSONB NOT NULL DEFAULT '[]'::jsonb,
  api_provider TEXT NOT NULL DEFAULT 'gemini',
  is_search_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_thinking_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_favorited BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_space_id ON public.conversations(space_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON public.conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON public.conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_title ON public.conversations(title);
CREATE INDEX IF NOT EXISTS idx_conversations_space_created ON public.conversations(space_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_space_updated ON public.conversations(space_id, updated_at DESC);

CREATE TRIGGER trg_conversations_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- 4) Conversation messages
CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content JSONB NOT NULL,
  provider TEXT,
  model TEXT,
  agent_id UUID,
  agent_name TEXT,
  agent_emoji TEXT,
  agent_is_default BOOLEAN NOT NULL DEFAULT FALSE,
  thinking_process TEXT,
  tool_calls JSONB,
  tool_call_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  research_step_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_questions JSONB,
  sources JSONB,
  grounding_supports JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
  ON public.conversation_messages(conversation_id, created_at);

CREATE TRIGGER trg_messages_touch_conversation
AFTER INSERT OR UPDATE ON public.conversation_messages
FOR EACH ROW EXECUTE PROCEDURE public.touch_conversation_updated_at();

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

-- 8) Home notes (single-user memo widget)
CREATE TABLE IF NOT EXISTS public.home_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_home_notes_updated_at
  ON public.home_notes(updated_at DESC);

CREATE TRIGGER trg_home_notes_updated_at
BEFORE UPDATE ON public.home_notes
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- 9) User Settings (Key-Value Store for API Keys etc.)
CREATE TABLE IF NOT EXISTS public.user_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_user_settings_updated_at
BEFORE UPDATE ON public.user_settings
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- 10) Seed: Deep Research Space + Agent
INSERT INTO public.agents (
  is_default,
  emoji,
  name,
  description,
  prompt,
  is_deep_research,
  provider,
  default_model_provider,
  lite_model_provider,
  default_model_source,
  lite_model_source,
  lite_model,
  default_model,
  response_language,
  base_tone,
  traits,
  warmth,
  enthusiasm,
  headings,
  emojis,
  custom_instruction,
  temperature,
  top_p,
  frequency_penalty,
  presence_penalty,
  created_at,
  updated_at
)
SELECT
  FALSE,
  '🔬',
  'Deep Research Agent',
  'Deep research agent (deep-research)',
  'You are a deep research assistant. You will receive a research plan produced by a lightweight model. Treat the plan as the outline of the answer, and expand every section in depth. For each plan item, explicitly address it with thorough explanations, evidence, and reasoning. Do not skip or compress any item. Add background, definitions, step-by-step analysis, trade-offs, risks, and actionable recommendations. If sources are available, cite them. If information is missing, state assumptions and uncertainty. Use clear headings that mirror the plan structure. Prioritize completeness over brevity and deliver a long, detailed response. Match the user''s language unless a response language override is set.',
  TRUE,
  'gemini',
  'gemini',
  'gemini',
  'list',
  'list',
  '',
  '',
  '',
  'academic',
  'detailed',
  'direct',
  'low',
  'detailed',
  'none',
  '',
  NULL,
  NULL,
  NULL,
  NULL,
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM public.agents
  WHERE name = 'Deep Research Agent' OR description LIKE '%deep-research%'
);

INSERT INTO public.spaces (
  emoji,
  label,
  description,
  is_deep_research,
  created_at,
  updated_at
)
SELECT
  '🔬',
  'Deep Research',
  'System space (deep-research)',
  TRUE,
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM public.spaces
  WHERE label = 'Deep Research' OR description LIKE '%deep-research%'
);

INSERT INTO public.space_agents (
  space_id,
  agent_id,
  sort_order,
  is_primary,
  created_at
)
SELECT
  s.id,
  a.id,
  0,
  TRUE,
  NOW()
FROM public.spaces s
JOIN public.agents a
  ON (a.name = 'Deep Research Agent' OR a.description LIKE '%deep-research%')
WHERE (s.label = 'Deep Research' OR s.description LIKE '%deep-research%')
  AND NOT EXISTS (
    SELECT 1 FROM public.space_agents sa
    WHERE sa.space_id = s.id AND sa.agent_id = a.id
  );

