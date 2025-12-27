ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS default_model_source TEXT NOT NULL DEFAULT 'list',
ADD COLUMN IF NOT EXISTS lite_model_source TEXT NOT NULL DEFAULT 'list';
