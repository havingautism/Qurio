-- Add missing embedding metadata columns on space_documents
ALTER TABLE public.space_documents
  ADD COLUMN IF NOT EXISTS embedding_provider TEXT,
  ADD COLUMN IF NOT EXISTS embedding_model TEXT;
