-- Migration to fix Scrapbook Agent visibility
-- This updates the is_hidden status for existing installations where it was previously set to 1 (True)

UPDATE agents
SET is_hidden = 0
WHERE id = '33333333-3333-3333-3333-333333333333';
