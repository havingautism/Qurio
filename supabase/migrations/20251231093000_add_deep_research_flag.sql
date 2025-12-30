-- Add explicit deep research flags
ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS is_deep_research BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS is_deep_research BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill existing deep research rows (legacy tag/label)
UPDATE public.spaces
SET is_deep_research = TRUE
WHERE is_deep_research = FALSE
  AND (label = 'Deep Research' OR description LIKE '%deep-research%');

UPDATE public.agents
SET is_deep_research = TRUE
WHERE is_deep_research = FALSE
  AND (name = 'Deep Research Agent' OR description LIKE '%deep-research%');
