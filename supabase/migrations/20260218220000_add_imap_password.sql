-- Migration: Switch email provider from OAuth2 to IMAP + App Password
-- Adds imap_password column; keeps oauth columns for backward compatibility.

-- Add imap_password column (stores the App Password for IMAP login)
ALTER TABLE public.email_provider_configs
  ADD COLUMN IF NOT EXISTS imap_password TEXT;

-- Optional: add a comment to clarify the column purpose
COMMENT ON COLUMN public.email_provider_configs.imap_password
  IS 'IMAP App Password (e.g. Google App Password). Not the regular login password.';
