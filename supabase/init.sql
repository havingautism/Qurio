-- Supabase initialization script (local-first, single-user)
-- Run in Supabase SQL editor to create core tables for spaces, conversations, messages, and attachments.

-- Extensions (Supabase usually preinstalls these; keep for safety)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Helper trigger to maintain updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update conversations.updated_at only when non-title fields change.
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
FOR EACH ROW EXECUTE PROCEDURE public.set_conversation_updated_at();

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
  document_sources JSONB DEFAULT '[]'::jsonb,
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

-- 7) Space documents (parsed text only)
CREATE TABLE IF NOT EXISTS public.space_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  content_text TEXT NOT NULL,
  embedding_provider TEXT,
  embedding_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_space_documents_space_id ON public.space_documents(space_id);

CREATE TRIGGER trg_space_documents_updated_at
BEFORE UPDATE ON public.space_documents
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- 8) Conversation <-> Documents (manual selection)
CREATE TABLE IF NOT EXISTS public.conversation_documents (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.space_documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_documents_conversation_id
  ON public.conversation_documents(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_documents_document_id
  ON public.conversation_documents(document_id);

-- 9) Document sections & chunks (for embeddings)
CREATE TABLE IF NOT EXISTS public.document_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.space_documents(id) ON DELETE CASCADE,
  external_section_id INT NOT NULL,
  title_path TEXT[] NOT NULL DEFAULT '{}',
  level INT DEFAULT 0,
  loc JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_sections_document_id
  ON public.document_sections(document_id);

CREATE TRIGGER trg_document_sections_updated_at
BEFORE UPDATE ON public.document_sections
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.space_documents(id) ON DELETE CASCADE,
  section_id UUID REFERENCES public.document_sections(id) ON DELETE CASCADE,
  external_chunk_id TEXT,
  chunk_index INT,
  content_type TEXT,
  text TEXT NOT NULL,
  token_count INT,
  chunk_hash TEXT,
  loc JSONB,
  source_hint TEXT,
  embedding REAL[] NOT NULL DEFAULT '{}',
  fts tsvector GENERATED ALWAYS AS (to_tsvector('english', text || ' ' || coalesce(source_hint, ''))) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id
  ON public.document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_section_id
  ON public.document_chunks(section_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_chunks_document_hash
  ON public.document_chunks(document_id, chunk_hash);

CREATE TRIGGER trg_document_chunks_updated_at
BEFORE UPDATE ON public.document_chunks
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- Match document chunks by cosine similarity (server-side)
CREATE OR REPLACE FUNCTION public.match_document_chunks(
  document_ids UUID[],
  query_embedding REAL[],
  match_count INT DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  text TEXT,
  source_hint TEXT,
  chunk_index INT,
  similarity REAL
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    dc.id,
    dc.document_id,
    dc.text,
    dc.source_hint,
    dc.chunk_index,
    (
      SELECT
        SUM(q.val * d.val)
        / NULLIF(
            SQRT(SUM(q.val * q.val)) * SQRT(SUM(d.val * d.val)),
            0
          )
      FROM UNNEST(dc.embedding) WITH ORDINALITY AS d(val, idx)
      JOIN UNNEST(query_embedding) WITH ORDINALITY AS q(val, idx)
        USING (idx)
    ) AS similarity
  FROM public.document_chunks AS dc
  WHERE dc.document_id = ANY(document_ids)
    AND array_length(dc.embedding, 1) = array_length(query_embedding, 1)
  ORDER BY similarity DESC
  LIMIT GREATEST(match_count, 1);
  LIMIT GREATEST(match_count, 1);
$$;

-- Create Index for FTS
CREATE INDEX IF NOT EXISTS idx_document_chunks_fts ON public.document_chunks USING GIN (fts);

-- Hybrid Search Function using RRF (Reciprocal Rank Fusion)
CREATE OR REPLACE FUNCTION public.hybrid_search(
  document_ids UUID[],
  query_text TEXT,
  query_embedding REAL[],
  match_count INT DEFAULT 10,
  rrf_k INT DEFAULT 60
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  text TEXT,
  source_hint TEXT,
  chunk_index INT,
  similarity REAL,
  fts_score REAL,
  score REAL
)
LANGUAGE sql
STABLE
AS $$
  WITH vector_search AS (
    SELECT
      dc.id,
      ROW_NUMBER() OVER (ORDER BY (
        (
            SELECT
                SUM(q.val * d.val)
                / NULLIF(
                    SQRT(SUM(q.val * q.val)) * SQRT(SUM(d.val * d.val)),
                    0
                )
            FROM UNNEST(dc.embedding) WITH ORDINALITY AS d(val, idx)
            JOIN UNNEST(query_embedding) WITH ORDINALITY AS q(val, idx)
            USING (idx)
        )
      ) DESC) as rank_vec,
      (
          SELECT
              SUM(q.val * d.val)
              / NULLIF(
                  SQRT(SUM(q.val * q.val)) * SQRT(SUM(d.val * d.val)),
                  0
              )
          FROM UNNEST(dc.embedding) WITH ORDINALITY AS d(val, idx)
          JOIN UNNEST(query_embedding) WITH ORDINALITY AS q(val, idx)
          USING (idx)
      ) as similarity
    FROM public.document_chunks dc
    WHERE dc.document_id = ANY(document_ids)
    AND array_length(dc.embedding, 1) = array_length(query_embedding, 1)
    ORDER BY similarity DESC
    LIMIT match_count * 2
  ),
  keyword_search AS (
    SELECT
      dc.id,
      ROW_NUMBER() OVER (ORDER BY ts_rank_cd(fts, websearch_to_tsquery('english', query_text)) DESC) as rank_fts,
      ts_rank_cd(fts, websearch_to_tsquery('english', query_text)) as fts_score
    FROM public.document_chunks dc
    WHERE dc.document_id = ANY(document_ids)
    AND fts @@ websearch_to_tsquery('english', query_text)
    ORDER BY fts_score DESC
    LIMIT match_count * 2
  )
  SELECT
    COALESCE(v.id, k.id) as id,
    dc.document_id,
    dc.text,
    dc.source_hint,
    dc.chunk_index,
    COALESCE(v.similarity, 0.0) as similarity,
    COALESCE(k.fts_score, 0.0) as fts_score,
    (
      COALESCE(1.0 / (rrf_k + v.rank_vec), 0.0) +
      COALESCE(1.0 / (rrf_k + k.rank_fts), 0.0)
    ) as score
  FROM vector_search v
  FULL OUTER JOIN keyword_search k ON v.id = k.id
  JOIN public.document_chunks dc ON dc.id = COALESCE(v.id, k.id)
  ORDER BY score DESC
  LIMIT match_count;
$$;

-- 10) Space <-> Agents (many-to-many binding)
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

 -- 11) Home notes (single-user memo widget)
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

 -- 12) User Settings (Key-Value Store for API Keys etc.)
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

-- 11) Seed: Preset Agents

-- Writing Assistant
INSERT INTO public.agents (
  is_default, emoji, name, description, prompt, is_deep_research,
  tool_ids, base_tone, traits, warmth, enthusiasm, headings, emojis
)
SELECT
  FALSE, '📝', 'Writing Assistant', 'Professional writing assistant for content creation and editing.',
  'You are a professional writing assistant with extensive experience in content creation and editing.

Your capabilities include:
- Writing in various formats: articles, essays, reports, emails, social media posts
- Editing and proofreading existing content
- Adapting tone and style to different audiences
- SEO optimization for web content
- Providing writing tips and best practices
- Generating structured outlines before writing
- Suggesting improvements for clarity and flow

When a user asks for help with writing:
1. First understand their requirements (format, length, audience, style)
2. Consider using the interactive_form tool to gather detailed specifications
3. Produce well-structured, engaging content
4. Offer revisions based on feedback

Maintain a professional yet approachable tone.', FALSE,
  '["interactive_form"]'::jsonb, 'friendly', 'detailed', 'gentle', 'medium', 'structured', 'light'
WHERE NOT EXISTS (SELECT 1 FROM public.agents WHERE name = 'Writing Assistant');

-- Code Assistant
INSERT INTO public.agents (
  is_default, emoji, name, description, prompt, is_deep_research,
  tool_ids, base_tone, traits, warmth, enthusiasm, headings, emojis
)
SELECT
  FALSE, '💻', 'Code Assistant', 'Senior software engineer for coding and debugging.',
  'You are a senior software engineer with expertise across multiple programming languages and frameworks.

Your capabilities include:
- Writing clean, efficient, and well-documented code
- Debugging and troubleshooting code issues
- Explaining complex technical concepts clearly
- Suggesting best practices and design patterns
- Code review and optimization
- Converting code between languages (e.g., Python to JavaScript)
- Writing unit tests and integration tests

When helping with programming:
1. Ask clarifying questions about requirements and constraints
2. Provide code with comprehensive comments
3. Explain your implementation choices
4. Include error handling and edge cases
5. Suggest testing strategies

Always prioritize code quality, readability, and maintainability.', FALSE,
  '[]'::jsonb, 'technical', 'concise', 'direct', 'low', 'structured', 'none'
WHERE NOT EXISTS (SELECT 1 FROM public.agents WHERE name = 'Code Assistant');

-- Research Assistant
INSERT INTO public.agents (
  is_default, emoji, name, description, prompt, is_deep_research,
  tool_ids, base_tone, traits, warmth, enthusiasm, headings, emojis
)
SELECT
  FALSE, '🔍', 'Research Assistant', 'Academic research assistant for scholarly work.',
  'You are an academic research assistant specialized in scholarly work and information gathering.

Your capabilities include:
- Conducting thorough literature reviews
- Finding and evaluating credible sources (primary and secondary)
- Generating proper citations (APA, MLA, Chicago, etc.)
- Synthesizing information from multiple sources
- Identifying research gaps and opportunities
- Summarizing complex academic papers
- Fact-checking information

When assisting with research:
1. Use web search to find relevant, credible sources
2. Always provide citations for referenced information
3. Distinguish between facts, opinions, and hypotheses
4. Suggest additional resources for deeper exploration
5. Maintain academic integrity and objectivity

Prioritize accuracy and scholarly rigor in all responses.', FALSE,
  '["web_search"]'::jsonb, 'academic', 'detailed', 'direct', 'low', 'detailed', 'none'
WHERE NOT EXISTS (SELECT 1 FROM public.agents WHERE name = 'Research Assistant');

-- Creative Assistant
INSERT INTO public.agents (
  is_default, emoji, name, description, prompt, is_deep_research,
  tool_ids, base_tone, traits, warmth, enthusiasm, headings, emojis
)
SELECT
  FALSE, '✨', 'Creative Assistant', 'Creative partner for brainstorming and visual ideas.',
  'You are a creative storyteller with a vivid imagination and mastery of narrative techniques.

Your capabilities include:
- Crafting engaging stories across genres (sci-fi, fantasy, mystery, romance, etc.)
- Developing compelling characters and plots
- Creating immersive world-building
- Writing dialogue that feels natural and purposeful
- Adapting style to match different tones and audiences
- Brainstorming creative concepts for marketing or art
- Generating poetry, lyrics, and scripts

When creating stories:
1. Ask about genre preferences, themes, and target audience
2. Consider using interactive_form to gather story parameters
3. Develop rich, multi-dimensional characters
4. Create plot structures with proper pacing
5. Use descriptive language to create vivid imagery

Let your creativity flow while maintaining narrative coherence.', FALSE,
  '["interactive_form"]'::jsonb, 'creative', 'detailed', 'empathetic', 'high', 'minimal', 'expressive'
WHERE NOT EXISTS (SELECT 1 FROM public.agents WHERE name = 'Creative Assistant');

-- Data Analyst
INSERT INTO public.agents (
  is_default, emoji, name, description, prompt, is_deep_research,
  tool_ids, base_tone, traits, warmth, enthusiasm, headings, emojis
)
SELECT
  FALSE, '📊', 'Data Analyst', 'Expert in data analysis and visualization.',
  'You are a data analysis expert skilled in interpreting data and deriving actionable insights.

Your capabilities include:
- Analyzing datasets and identifying patterns
- Creating data visualizations and dashboards
- Statistical analysis and hypothesis testing
- Predictive modeling and forecasting
- Explaining complex data concepts in simple terms
- Data cleaning and preprocessing
- Identifying KPIs and metrics

When assisting with data analysis:
1. First understand the data source, format, and analysis goals
2. Ask clarifying questions about specific metrics or KPIs
3. Suggest appropriate analytical methods
4. Explain findings in a clear, non-technical manner
5. Provide actionable recommendations based on insights

Focus on turning data into meaningful, actionable information.', FALSE,
  '[]'::jsonb, 'professional', 'analytical', 'supportive', 'medium', 'structured', 'light'
WHERE NOT EXISTS (SELECT 1 FROM public.agents WHERE name = 'Data Analyst');

