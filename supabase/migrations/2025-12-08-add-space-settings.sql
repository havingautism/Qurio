-- Add temperature and top_k columns to spaces table
ALTER TABLE spaces 
ADD COLUMN temperature float DEFAULT NULL,
ADD COLUMN top_k integer DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN spaces.temperature IS 'Model temperature setting (0.0-2.0)';
COMMENT ON COLUMN spaces.top_k IS 'Model Top K sampling setting';
