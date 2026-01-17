-- Add memory domains + summaries for long-term memory routing
CREATE TABLE IF NOT EXISTS public.memory_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  domain_key TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  scope TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_domains_updated_at
  ON public.memory_domains(updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_domains_user_key
  ON public.memory_domains(user_id, domain_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_domains_key_single_user
  ON public.memory_domains(domain_key)
  WHERE user_id IS NULL;

CREATE TABLE IF NOT EXISTS public.memory_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES public.memory_domains(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  evidence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_summaries_domain_id
  ON public.memory_summaries(domain_id);
CREATE INDEX IF NOT EXISTS idx_memory_summaries_updated_at
  ON public.memory_summaries(updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_summaries_domain_id_unique
  ON public.memory_summaries(domain_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_memory_domains_updated_at'
  ) THEN
    CREATE TRIGGER trg_memory_domains_updated_at
    BEFORE UPDATE ON public.memory_domains
    FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_memory_summaries_updated_at'
  ) THEN
    CREATE TRIGGER trg_memory_summaries_updated_at
    BEFORE UPDATE ON public.memory_summaries
    FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
  END IF;
END;
$$;
