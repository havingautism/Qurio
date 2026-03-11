-- Migration to fix Scrapbook Agent visibility
-- This updates the is_hidden status for existing installations where it was previously set to TRUE

UPDATE public.agents
SET is_hidden = FALSE
WHERE id = '33333333-3333-3333-3333-333333333333';
