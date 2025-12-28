-- Migration: Add user_settings table for persistent API key storage

CREATE TABLE IF NOT EXISTS public.user_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger to update updated_at timestamp
CREATE TRIGGER trg_user_settings_updated_at
BEFORE UPDATE ON public.user_settings
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- Optional: Enable RLS (Security Best Practice)
-- ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all actions for authenticated users" ON public.user_settings FOR ALL USING (auth.role() = 'authenticated');
