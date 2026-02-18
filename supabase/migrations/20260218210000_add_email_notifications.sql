-- Migration: Add email notification tables
-- Supports Gmail, Outlook, QQ Mail, 163 Mail via IMAP + App Password.
-- AI-generated email notification summaries using global API keys.

-- Table: stores email provider configurations and IMAP credentials
CREATE TABLE IF NOT EXISTS public.email_provider_configs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  provider TEXT NOT NULL DEFAULT 'gmail',    -- gmail / outlook / qq / 163
  email TEXT NOT NULL,
  imap_password TEXT,                         -- IMAP App Password (not regular login password)

  -- Polling settings
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  poll_interval_minutes INTEGER NOT NULL DEFAULT 15,

  -- Summary model config (uses global API keys, only provider/model needed here)
  summary_provider TEXT,
  summary_model TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: stores AI-generated email notification summaries
CREATE TABLE IF NOT EXISTS public.email_notifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  config_id TEXT REFERENCES public.email_provider_configs(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'gmail',

  -- Email metadata
  message_id TEXT NOT NULL UNIQUE,    -- Email Message-ID, prevents duplicate processing
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

-- Index for querying configs by email (useful for multi-account support)
CREATE INDEX IF NOT EXISTS idx_email_provider_configs_email
  ON public.email_provider_configs(email);

-- Auto-update updated_at on email_provider_configs
DROP TRIGGER IF EXISTS trg_email_provider_configs_updated_at ON public.email_provider_configs;
CREATE TRIGGER trg_email_provider_configs_updated_at
BEFORE UPDATE ON public.email_provider_configs
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- Column comment for clarity
COMMENT ON COLUMN public.email_provider_configs.imap_password
  IS 'IMAP App Password (e.g. Google App Password). Not the regular login password.';
