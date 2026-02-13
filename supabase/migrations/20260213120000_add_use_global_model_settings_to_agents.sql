-- Add per-agent switch for whether to use global default/lite models.
-- Safe to run multiple times.

ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS use_global_model_settings BOOLEAN;

UPDATE public.agents
SET use_global_model_settings = TRUE
WHERE use_global_model_settings IS NULL;

ALTER TABLE public.agents
ALTER COLUMN use_global_model_settings SET DEFAULT TRUE;

ALTER TABLE public.agents
ALTER COLUMN use_global_model_settings SET NOT NULL;

