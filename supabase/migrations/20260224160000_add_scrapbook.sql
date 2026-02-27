-- Migration: Add scrapbook table
-- Enables the Scrapbook (随手记) feature for saving and summarizing web/platform content.
-- Supports: xhs, wechat, youtube, bilibili, twitter, telegram, rss, manual

CREATE TABLE IF NOT EXISTS public.scrapbook (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,

  -- AI-generated or user-provided metadata
  title TEXT NOT NULL DEFAULT '',     -- short title (AI-generated or user-typed)
  emoji TEXT,                         -- optional AI-generated emoji for quick visual scanning
  summary TEXT NOT NULL DEFAULT '',   -- 2-3 sentence summary (AI-generated or user-typed)

  -- Original content
  content TEXT NOT NULL DEFAULT '',   -- full original text / transcript

  -- Source info
  source_url TEXT,                    -- original URL (nullable for manual entries)
  platform TEXT NOT NULL DEFAULT 'manual',  -- xhs / wechat / youtube / bilibili / twitter / telegram / rss / manual / unknown
  thumbnail TEXT,                     -- cover image URL (nullable)

  -- Flexible tagging
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for chronological listing (newest first)
CREATE INDEX IF NOT EXISTS idx_scrapbook_created_at
  ON public.scrapbook(created_at DESC);

-- Index for platform filtering
CREATE INDEX IF NOT EXISTS idx_scrapbook_platform
  ON public.scrapbook(platform);

-- Auto-update updated_at on every UPDATE
DROP TRIGGER IF EXISTS trg_scrapbook_updated_at ON public.scrapbook;
CREATE TRIGGER trg_scrapbook_updated_at
BEFORE UPDATE ON public.scrapbook
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- Column comments for clarity
COMMENT ON TABLE public.scrapbook
  IS 'Scrapbook (随手记): saved web/platform content with AI-generated titles and summaries.';

COMMENT ON COLUMN public.scrapbook.platform
  IS 'Platform identifier: xhs | wechat | youtube | bilibili | twitter | telegram | rss | manual | unknown';

COMMENT ON COLUMN public.scrapbook.source_url
  IS 'Original URL of the saved content. NULL for manually typed entries.';
