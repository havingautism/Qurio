-- Migration: add explicit model provider fields for agents
ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS default_model_provider TEXT,
ADD COLUMN IF NOT EXISTS lite_model_provider TEXT;

-- Backfill from encoded model id if available
UPDATE public.agents
SET default_model_provider = split_part(default_model, '::', 1)
WHERE default_model IS NOT NULL AND default_model_provider IS NULL AND position('::' in default_model) > 0;

UPDATE public.agents
SET lite_model_provider = split_part(lite_model, '::', 1)
WHERE lite_model IS NOT NULL AND lite_model_provider IS NULL AND position('::' in lite_model) > 0;

-- Strip legacy provider prefix from model fields
UPDATE public.agents
SET default_model = split_part(default_model, '::', 2)
WHERE default_model IS NOT NULL AND position('::' in default_model) > 0;

UPDATE public.agents
SET lite_model = split_part(lite_model, '::', 2)
WHERE lite_model IS NOT NULL AND position('::' in lite_model) > 0;
