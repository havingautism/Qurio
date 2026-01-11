-- Add title_path on document_chunks for easier retrieval context
ALTER TABLE public.document_chunks
ADD COLUMN IF NOT EXISTS title_path TEXT[] NOT NULL DEFAULT '{}';
