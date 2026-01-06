-- Add space documents and manual selection mapping
CREATE TABLE IF NOT EXISTS public.space_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  content_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_space_documents_space_id ON public.space_documents(space_id);

CREATE TRIGGER trg_space_documents_updated_at
BEFORE UPDATE ON public.space_documents
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

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
