-- Migration: Add email notification tables
-- Adds Gmail OAuth2 config storage and AI-generated email notification summaries.

-- Table: stores Gmail OAuth2 credentials and per-account settings
CREATE TABLE IF NOT EXISTS public.email_provider_configs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  provider TEXT NOT NULL DEFAULT 'gmail',
  email TEXT NOT NULL,

  -- OAuth2 credentials (user-supplied from their own Google Cloud project)
  oauth_client_id TEXT,
  oauth_client_secret TEXT,
  oauth_refresh_token TEXT,           -- stored after user completes OAuth flow

  -- Polling settings
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  poll_interval_minutes INTEGER NOT NULL DEFAULT 15,

  -- Dedicated summary model config (independent of global Lite model)
  summary_provider TEXT,
  summary_model TEXT,
  summary_api_key TEXT,
  summary_base_url TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: stores AI-generated email notification summaries
CREATE TABLE IF NOT EXISTS public.email_notifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  config_id TEXT REFERENCES public.email_provider_configs(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'gmail',

  -- Email metadata
  message_id TEXT NOT NULL UNIQUE,    -- Gmail message ID, prevents duplicate processing
  subject TEXT,
  sender TEXT,
  received_at TIMESTAMPTZ,

  -- AI-generated summary
  summary TEXT,

  -- Read state
  is_read BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_email_notifications_is_read
  ON public.email_notifications(is_read);

CREATE INDEX IF NOT EXISTS idx_email_notifications_created_at
  ON public.email_notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_notifications_config_id
  ON public.email_notifications(config_id);

-- Auto-update updated_at on email_provider_configs
DROP TRIGGER IF EXISTS trg_email_provider_configs_updated_at ON public.email_provider_configs;
CREATE TRIGGER trg_email_provider_configs_updated_at
BEFORE UPDATE ON public.email_provider_configs
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
