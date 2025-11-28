-- Supabase Database Schema
-- This file contains the complete database schema for the AI Chat application
-- Execute this SQL in your Supabase Dashboard > SQL Editor

-- ============================================================================
-- TABLES
-- ============================================================================

-- Create Spaces table (workspaces for organizing conversations)
CREATE TABLE IF NOT EXISTS public.spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Chat Sessions table (conversations)
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  space_id UUID REFERENCES public.spaces(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','model')),
  content TEXT NOT NULL,
  thinking_process TEXT,
  sources JSONB,
  suggested_replies JSONB,
  generated_with_thinking BOOLEAN DEFAULT FALSE,
  generated_with_search BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_spaces_client ON public.spaces(client_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_client ON public.chat_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_space ON public.chat_sessions(space_id);
CREATE INDEX IF NOT EXISTS idx_messages_session ON public.messages(session_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
DO $$ 
BEGIN
  -- Spaces: Users can only access their own spaces
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'spaces' AND policyname = 'spaces_owner'
  ) THEN
    CREATE POLICY spaces_owner ON public.spaces
      USING (
        current_setting('request.headers', true)::jsonb ? 'client-id' 
        AND (current_setting('request.headers', true)::jsonb ->> 'client-id') = client_id
      )
      WITH CHECK (
        current_setting('request.headers', true)::jsonb ? 'client-id' 
        AND (current_setting('request.headers', true)::jsonb ->> 'client-id') = client_id
      );
  END IF;

  -- Chat Sessions: Users can only access their own sessions
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'chat_sessions' AND policyname = 'chat_sessions_owner'
  ) THEN
    CREATE POLICY chat_sessions_owner ON public.chat_sessions
      USING (
        current_setting('request.headers', true)::jsonb ? 'client-id' 
        AND (current_setting('request.headers', true)::jsonb ->> 'client-id') = client_id
      )
      WITH CHECK (
        current_setting('request.headers', true)::jsonb ? 'client-id' 
        AND (current_setting('request.headers', true)::jsonb ->> 'client-id') = client_id
      );
  END IF;

  -- Messages: Users can only access messages from their own sessions
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'messages' AND policyname = 'messages_session_owner'
  ) THEN
    CREATE POLICY messages_session_owner ON public.messages
      USING (
        EXISTS (
          SELECT 1 FROM public.chat_sessions s
          WHERE s.id = session_id 
          AND (current_setting('request.headers', true)::jsonb ->> 'client-id') = s.client_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.chat_sessions s
          WHERE s.id = session_id 
          AND (current_setting('request.headers', true)::jsonb ->> 'client-id') = s.client_id
        )
      );
  END IF;
END $$;
