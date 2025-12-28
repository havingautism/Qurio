-- Migration: Add home_shortcuts table for homepage shortcuts widget
-- Description: Stores website shortcuts for quick access with emoji/favicon/custom icons

CREATE TABLE IF NOT EXISTS public.home_shortcuts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  icon_type TEXT NOT NULL DEFAULT 'emoji' CHECK (icon_type IN ('emoji', 'favicon', 'custom')),
  icon_name TEXT,
  icon_url TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_home_shortcuts_position
  ON public.home_shortcuts(position ASC);

CREATE TRIGGER trg_home_shortcuts_updated_at
BEFORE UPDATE ON public.home_shortcuts
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
