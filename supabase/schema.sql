-- Supabase schema aligned with backend-python adapters
-- Used by backend-python/src/services/db_service.py initialize_provider_schema()

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.touch_conversation_updated_at()
RETURNS trigger AS $$
BEGIN
  UPDATE public.conversations
  SET updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.spaces (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  emoji TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL,
  description TEXT,
  is_deep_research BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agents (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
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
  use_global_model_settings BOOLEAN NOT NULL DEFAULT TRUE,
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

CREATE TABLE IF NOT EXISTS public.conversations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  space_id TEXT REFERENCES public.spaces(id) ON DELETE SET NULL,
  last_agent_id TEXT REFERENCES public.agents(id) ON DELETE SET NULL,
  agent_selection_mode TEXT NOT NULL DEFAULT 'auto',
  title TEXT NOT NULL DEFAULT 'New Conversation',
  title_emojis JSONB NOT NULL DEFAULT '[]'::jsonb,
  api_provider TEXT NOT NULL DEFAULT 'gemini',
  is_search_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_thinking_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_favorited BOOLEAN NOT NULL DEFAULT FALSE,
  session_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id TEXT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content JSONB NOT NULL,
  provider TEXT,
  model TEXT,
  agent_id TEXT,
  agent_name TEXT,
  agent_emoji TEXT,
  agent_is_default BOOLEAN NOT NULL DEFAULT FALSE,
  thinking_process TEXT,
  tool_calls JSONB,
  tool_call_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  research_step_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_questions JSONB,
  sources JSONB,
  document_sources JSONB DEFAULT '[]'::jsonb,
  grounding_supports JSONB,
  stream_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  stream_schema_version SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.conversation_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id TEXT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.attachments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  message_id TEXT NOT NULL REFERENCES public.conversation_messages(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.space_documents (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  space_id TEXT NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  content_text TEXT NOT NULL,
  embedding_provider TEXT,
  embedding_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.conversation_documents (
  conversation_id TEXT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES public.space_documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, document_id)
);

CREATE TABLE IF NOT EXISTS public.document_sections (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  document_id TEXT NOT NULL REFERENCES public.space_documents(id) ON DELETE CASCADE,
  external_section_id INTEGER NOT NULL,
  title_path JSONB NOT NULL DEFAULT '[]'::jsonb,
  level INTEGER DEFAULT 0,
  loc JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.document_chunks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  document_id TEXT NOT NULL REFERENCES public.space_documents(id) ON DELETE CASCADE,
  section_id TEXT REFERENCES public.document_sections(id) ON DELETE CASCADE,
  title_path JSONB NOT NULL DEFAULT '[]'::jsonb,
  external_chunk_id TEXT,
  chunk_index INTEGER,
  content_type TEXT,
  text TEXT NOT NULL,
  token_count INTEGER,
  chunk_hash TEXT,
  loc JSONB,
  source_hint TEXT,
  embedding JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.space_agents (
  space_id TEXT NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (space_id, agent_id)
);

CREATE TABLE IF NOT EXISTS public.home_notes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.home_shortcuts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  icon_type TEXT NOT NULL DEFAULT 'lucide',
  icon_name TEXT,
  icon_url TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.memory_domains (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT,
  domain_key TEXT NOT NULL,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  scope TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.memory_summaries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  domain_id TEXT NOT NULL REFERENCES public.memory_domains(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  evidence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_tools (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'http',
  config JSONB,
  input_schema JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pending_form_runs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  run_id TEXT NOT NULL UNIQUE,
  conversation_id TEXT,
  requirements_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  user_id TEXT,
  agent_model TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  messages JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_chunks_document_hash
  ON public.document_chunks(document_id, chunk_hash);
CREATE INDEX IF NOT EXISTS idx_space_agents_agent_id ON public.space_agents(agent_id);
CREATE INDEX IF NOT EXISTS idx_space_agents_space_order ON public.space_agents(space_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_memory_domains_updated_at ON public.memory_domains(updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_domains_user_key ON public.memory_domains(user_id, domain_key);
CREATE INDEX IF NOT EXISTS idx_memory_summaries_updated_at ON public.memory_summaries(updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_summaries_domain_id_unique ON public.memory_summaries(domain_id);
CREATE INDEX IF NOT EXISTS idx_pending_form_runs_run_id ON public.pending_form_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_pending_form_runs_expires_at ON public.pending_form_runs(expires_at);

DROP TRIGGER IF EXISTS trg_spaces_updated_at ON public.spaces;
CREATE TRIGGER trg_spaces_updated_at
BEFORE UPDATE ON public.spaces
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS trg_agents_updated_at ON public.agents;
CREATE TRIGGER trg_agents_updated_at
BEFORE UPDATE ON public.agents
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS trg_conversations_updated_at ON public.conversations;
CREATE TRIGGER trg_conversations_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS trg_messages_touch_conversation ON public.conversation_messages;
CREATE TRIGGER trg_messages_touch_conversation
AFTER INSERT OR UPDATE ON public.conversation_messages
FOR EACH ROW EXECUTE PROCEDURE public.touch_conversation_updated_at();

DROP TRIGGER IF EXISTS trg_space_documents_updated_at ON public.space_documents;
CREATE TRIGGER trg_space_documents_updated_at
BEFORE UPDATE ON public.space_documents
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS trg_document_sections_updated_at ON public.document_sections;
CREATE TRIGGER trg_document_sections_updated_at
BEFORE UPDATE ON public.document_sections
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS trg_document_chunks_updated_at ON public.document_chunks;
CREATE TRIGGER trg_document_chunks_updated_at
BEFORE UPDATE ON public.document_chunks
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS trg_home_notes_updated_at ON public.home_notes;
CREATE TRIGGER trg_home_notes_updated_at
BEFORE UPDATE ON public.home_notes
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS trg_home_shortcuts_updated_at ON public.home_shortcuts;
CREATE TRIGGER trg_home_shortcuts_updated_at
BEFORE UPDATE ON public.home_shortcuts
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS trg_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER trg_user_settings_updated_at
BEFORE UPDATE ON public.user_settings
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS trg_memory_domains_updated_at ON public.memory_domains;
CREATE TRIGGER trg_memory_domains_updated_at
BEFORE UPDATE ON public.memory_domains
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS trg_memory_summaries_updated_at ON public.memory_summaries;
CREATE TRIGGER trg_memory_summaries_updated_at
BEFORE UPDATE ON public.memory_summaries
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS trg_user_tools_updated_at ON public.user_tools;
CREATE TRIGGER trg_user_tools_updated_at
BEFORE UPDATE ON public.user_tools
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

INSERT INTO public.spaces (id, emoji, label, description, is_deep_research)
VALUES
  ('space-life', '🏠', 'Life', 'Daily planning and practical help.', FALSE),
  ('space-dev', '💻', 'Code Development', 'Software development and debugging.', FALSE),
  ('space-travel', '✈️', 'Travel', 'Trip planning and destination info.', FALSE),
  ('space-entertainment', '🎬', 'Movies & Music', 'Recommendations for films and music.', FALSE),
  ('space-study', '📚', 'Learning', 'Study plans and knowledge growth.', FALSE),
  ('space-health', '💪', 'Health', 'Exercise, sleep, and nutrition guidance.', FALSE),
  ('space-finance', '💰', 'Finance', 'Budgeting, saving, and risk awareness.', FALSE),
  ('space-writing', '✍️', 'Writing', 'Drafting, rewriting, and polish.', FALSE),
  ('space-career', '🚀', 'Career', 'Resume, interview, and job strategy.', FALSE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.agents (
  id, is_default, emoji, name, description, prompt, is_deep_research,
  base_tone, traits, warmth, enthusiasm, headings, emojis, tool_ids
)
VALUES
  ('agent-life-assistant', FALSE, '🏠', 'Life Assistant', 'Helps with routines, tasks, and daily decisions.', 'You are a practical life assistant. Give actionable steps, ask for constraints, and keep responses concise and useful.', FALSE, 'friendly', 'practical', 'gentle', 'medium', 'structured', 'light', '["local_time", "web_search", "calculator", "interactive_form"]'::jsonb),
  ('agent-code-assistant', FALSE, '💻', 'Code Assistant', 'Engineering-focused coding and debugging assistant.', 'You are a senior coding assistant. Clarify requirements, provide correct runnable solutions, and include testing advice.', FALSE, 'technical', 'concise', 'direct', 'low', 'structured', 'none', '["web_search", "json_repair", "extract_text", "summarize_text"]'::jsonb),
  ('agent-travel-planner', FALSE, '✈️', 'Travel Planner', 'Plans routes, schedules, and budgets for trips.', 'You are a travel planner. Confirm origin, budget, duration, and preferences, then return a clear itinerary with options.', FALSE, 'professional', 'detailed', 'supportive', 'medium', 'structured', 'light', '["web_search", "search_news", "search_wikipedia", "local_time", "interactive_form"]'::jsonb),
  ('agent-movie-music-curator', FALSE, '🎬', 'Movie & Music Curator', 'Curates movie and music recommendations by taste.', 'You are a recommendation curator. Identify user taste and provide tiered suggestions with short reasons.', FALSE, 'creative', 'detailed', 'friendly', 'medium', 'structured', 'expressive', '["web_search", "search_news", "search_wikipedia", "duckduckgo_image_search", "duckduckgo_video_search"]'::jsonb),
  ('agent-study-coach', FALSE, '📚', 'Study Coach', 'Builds learning plans and review strategies.', 'You are a study coach. Create phased plans, daily tasks, and review loops based on goals and available time.', FALSE, 'professional', 'structured', 'supportive', 'medium', 'structured', 'light', '["interactive_form", "summarize_text", "extract_text", "web_search"]'::jsonb),
  ('agent-health-wellness', FALSE, '💪', 'Health Coach', 'Supports healthy habits and lifestyle routines.', 'You are a health coach. Focus on habit-level advice for sleep, exercise, and nutrition. Avoid diagnosis and suggest professional care when needed.', FALSE, 'calm', 'practical', 'gentle', 'low', 'structured', 'none', '["interactive_form", "local_time", "calculator", "web_search"]'::jsonb),
  ('agent-finance-planner', FALSE, '💰', 'Finance Planner', 'Helps with budget, savings, and spending decisions.', 'You are a finance planner. Ask for cashflow context and provide conservative, practical allocation suggestions.', FALSE, 'professional', 'analytical', 'neutral', 'low', 'structured', 'none', '["interactive_form", "calculator", "summarize_text", "search_news"]'::jsonb),
  ('agent-writing-assistant', FALSE, '✍️', 'Writing Assistant', 'Improves drafts, structure, and tone.', 'You are a writing assistant. Clarify audience and style, then provide strong structure and polished alternatives.', FALSE, 'friendly', 'detailed', 'gentle', 'medium', 'structured', 'light', '["interactive_form", "summarize_text", "extract_text", "json_repair"]'::jsonb),
  ('agent-career-coach', FALSE, '🚀', 'Career Coach', 'Supports resume quality and interview preparation.', 'You are a career coach. Provide concrete resume edits, interview prep questions, and role-fit guidance.', FALSE, 'professional', 'direct', 'supportive', 'medium', 'structured', 'light', '["interactive_form", "web_search", "summarize_text", "extract_text"]'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.space_agents (space_id, agent_id, sort_order, is_primary)
VALUES
  ('space-life', 'agent-life-assistant', 0, TRUE),
  ('space-dev', 'agent-code-assistant', 0, TRUE),
  ('space-travel', 'agent-travel-planner', 0, TRUE),
  ('space-entertainment', 'agent-movie-music-curator', 0, TRUE),
  ('space-study', 'agent-study-coach', 0, TRUE),
  ('space-health', 'agent-health-wellness', 0, TRUE),
  ('space-finance', 'agent-finance-planner', 0, TRUE),
  ('space-writing', 'agent-writing-assistant', 0, TRUE),
  ('space-career', 'agent-career-coach', 0, TRUE)
ON CONFLICT (space_id, agent_id) DO NOTHING;

UPDATE public.spaces
SET emoji = CASE emoji
  WHEN 'HOME' THEN '🏠'
  WHEN 'DEV' THEN '💻'
  WHEN 'TRIP' THEN '✈️'
  WHEN 'MEDIA' THEN '🎬'
  WHEN 'STUDY' THEN '📚'
  WHEN 'HEALTH' THEN '💪'
  WHEN 'MONEY' THEN '💰'
  WHEN 'WRITE' THEN '✍️'
  WHEN 'CAREER' THEN '🚀'
  ELSE emoji
END
WHERE emoji IN ('HOME', 'DEV', 'TRIP', 'MEDIA', 'STUDY', 'HEALTH', 'MONEY', 'WRITE', 'CAREER');

UPDATE public.agents
SET emoji = CASE emoji
  WHEN 'HOME' THEN '🏠'
  WHEN 'DEV' THEN '💻'
  WHEN 'TRIP' THEN '✈️'
  WHEN 'MEDIA' THEN '🎬'
  WHEN 'STUDY' THEN '📚'
  WHEN 'HEALTH' THEN '💪'
  WHEN 'MONEY' THEN '💰'
  WHEN 'WRITE' THEN '✍️'
  WHEN 'CAREER' THEN '🚀'
  ELSE emoji
END
WHERE emoji IN ('HOME', 'DEV', 'TRIP', 'MEDIA', 'STUDY', 'HEALTH', 'MONEY', 'WRITE', 'CAREER');
