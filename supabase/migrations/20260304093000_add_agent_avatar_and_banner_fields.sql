-- Add avatar and banner customization fields to agents.
-- Safe to run multiple times.

ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS avatar_type TEXT NOT NULL DEFAULT 'emoji';

ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS avatar_image TEXT;

ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS avatar_shape TEXT NOT NULL DEFAULT 'circle';

ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS banner_mode TEXT NOT NULL DEFAULT 'none';

ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS banner_image TEXT;
