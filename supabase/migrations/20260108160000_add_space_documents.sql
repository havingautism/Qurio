-- Add space documents and manual selection mapping
CREATE TABLE IF NOT EXISTS public.space_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  content_text TEXT NOT NULL,
  embedding_provider TEXT,
  embedding_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_space_documents_space_id ON public.space_documents(space_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_space_documents_updated_at'
  ) THEN
    CREATE TRIGGER trg_space_documents_updated_at
    BEFORE UPDATE ON public.space_documents
    FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.conversation_documents (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.space_documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_documents_conversation_id
  ON public.conversation_documents(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_documents_document_id
  ON public.conversation_documents(document_id);

CREATE TABLE IF NOT EXISTS public.document_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.space_documents(id) ON DELETE CASCADE,
  external_section_id INT NOT NULL,
  title_path TEXT[] NOT NULL DEFAULT '{}',
  level INT DEFAULT 0,
  loc JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_sections_document_id
  ON public.document_sections(document_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_document_sections_updated_at'
  ) THEN
    CREATE TRIGGER trg_document_sections_updated_at
    BEFORE UPDATE ON public.document_sections
    FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.space_documents(id) ON DELETE CASCADE,
  section_id UUID REFERENCES public.document_sections(id) ON DELETE CASCADE,
  external_chunk_id TEXT,
  chunk_index INT,
  content_type TEXT,
  text TEXT NOT NULL,
  token_count INT,
  chunk_hash TEXT,
  loc JSONB,
  source_hint TEXT,
  embedding REAL[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id
  ON public.document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_section_id
  ON public.document_chunks(section_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_chunks_document_hash
  ON public.document_chunks(document_id, chunk_hash);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_document_chunks_updated_at'
  ) THEN
    CREATE TRIGGER trg_document_chunks_updated_at
    BEFORE UPDATE ON public.document_chunks
    FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
  END IF;
END;
$$;
