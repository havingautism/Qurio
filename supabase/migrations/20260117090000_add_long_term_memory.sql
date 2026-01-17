-- Add long-term memory storage (single-user friendly)
CREATE TABLE IF NOT EXISTS public.long_term_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content_text TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  embedding REAL[] DEFAULT '{}',
  embedding_provider TEXT,
  embedding_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_long_term_memory_updated_at
  ON public.long_term_memory(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_long_term_memory_content_hash
  ON public.long_term_memory(content_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_long_term_memory_user_id
  ON public.long_term_memory(user_id)
  WHERE user_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_long_term_memory_updated_at'
  ) THEN
    CREATE TRIGGER trg_long_term_memory_updated_at
    BEFORE UPDATE ON public.long_term_memory
    FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
  END IF;
END;
$$;
