DROP FUNCTION IF EXISTS public.match_document_chunks(uuid[], real[], integer);
DROP FUNCTION IF EXISTS public.hybrid_search(uuid[], text, real[], integer, integer);

-- Update FTS column and trigger to include title_path for hybrid search
DROP INDEX IF EXISTS idx_document_chunks_fts;
ALTER TABLE public.document_chunks DROP COLUMN IF EXISTS fts;
ALTER TABLE public.document_chunks ADD COLUMN fts tsvector;

CREATE OR REPLACE FUNCTION public.document_chunks_fts_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.fts :=
    to_tsvector(
      'simple',
      array_to_string(NEW.title_path, ' ') || ' ' || NEW.text || ' ' || coalesce(NEW.source_hint, '')
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_document_chunks_fts ON public.document_chunks;
CREATE TRIGGER trg_document_chunks_fts
BEFORE INSERT OR UPDATE OF title_path, text, source_hint
ON public.document_chunks
FOR EACH ROW EXECUTE PROCEDURE public.document_chunks_fts_trigger();

UPDATE public.document_chunks
SET fts = to_tsvector(
  'simple',
  array_to_string(title_path, ' ') || ' ' || text || ' ' || coalesce(source_hint, '')
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_fts ON public.document_chunks USING GIN (fts);

-- Update vector-only match function to return section metadata
CREATE OR REPLACE FUNCTION public.match_document_chunks(
  document_ids UUID[],
  query_embedding REAL[],
  match_count INT DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  section_id UUID,
  title_path TEXT[],
  text TEXT,
  source_hint TEXT,
  chunk_index INT,
  similarity REAL
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    dc.id,
    dc.document_id,
    dc.section_id,
    dc.title_path,
    dc.text,
    dc.source_hint,
    dc.chunk_index,
    (
      SELECT
        SUM(q.val * d.val)
        / NULLIF(
            SQRT(SUM(q.val * q.val)) * SQRT(SUM(d.val * d.val)),
            0
          )
      FROM UNNEST(dc.embedding) WITH ORDINALITY AS d(val, idx)
      JOIN UNNEST(query_embedding) WITH ORDINALITY AS q(val, idx)
        USING (idx)
    ) AS similarity
  FROM public.document_chunks AS dc
  WHERE dc.document_id = ANY(document_ids)
    AND array_length(dc.embedding, 1) = array_length(query_embedding, 1)
  ORDER BY similarity DESC
  LIMIT GREATEST(match_count, 1);
$$;

-- Update hybrid search to return section metadata
CREATE OR REPLACE FUNCTION public.hybrid_search(
  document_ids UUID[],
  query_text TEXT,
  query_embedding REAL[],
  match_count INT DEFAULT 10,
  rrf_k INT DEFAULT 60
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  section_id UUID,
  title_path TEXT[],
  text TEXT,
  source_hint TEXT,
  chunk_index INT,
  similarity REAL,
  fts_score REAL,
  score REAL
)
LANGUAGE sql
STABLE
AS $$
  WITH vector_search AS (
    SELECT
      dc.id,
      ROW_NUMBER() OVER (ORDER BY (
        (
            SELECT
                SUM(q.val * d.val)
                / NULLIF(
                    SQRT(SUM(q.val * q.val)) * SQRT(SUM(d.val * d.val)),
                    0
                )
            FROM UNNEST(dc.embedding) WITH ORDINALITY AS d(val, idx)
            JOIN UNNEST(query_embedding) WITH ORDINALITY AS q(val, idx)
            USING (idx)
        )
      ) DESC) as rank_vec,
      (
          SELECT
              SUM(q.val * d.val)
              / NULLIF(
                  SQRT(SUM(q.val * q.val)) * SQRT(SUM(d.val * d.val)),
                  0
              )
          FROM UNNEST(dc.embedding) WITH ORDINALITY AS d(val, idx)
          JOIN UNNEST(query_embedding) WITH ORDINALITY AS q(val, idx)
          USING (idx)
      ) as similarity
    FROM public.document_chunks dc
    WHERE dc.document_id = ANY(document_ids)
    AND array_length(dc.embedding, 1) = array_length(query_embedding, 1)
    ORDER BY similarity DESC
    LIMIT match_count * 2
  ),
  keyword_search AS (
    SELECT
      dc.id,
      ROW_NUMBER() OVER (ORDER BY ts_rank_cd(dc.fts, websearch_to_tsquery('simple', query_text)) DESC) as rank_fts,
      ts_rank_cd(dc.fts, websearch_to_tsquery('simple', query_text)) as fts_score
    FROM public.document_chunks dc
    WHERE dc.document_id = ANY(document_ids)
    AND dc.fts @@ websearch_to_tsquery('simple', query_text)
    ORDER BY fts_score DESC
    LIMIT match_count * 2
  )
  SELECT
    COALESCE(v.id, k.id) as id,
    dc.document_id,
    dc.section_id,
    dc.title_path,
    dc.text,
    dc.source_hint,
    dc.chunk_index,
    COALESCE(v.similarity, 0.0) as similarity,
    COALESCE(k.fts_score, 0.0) as fts_score,
    (
      COALESCE(1.0 / (rrf_k + v.rank_vec), 0.0) +
      COALESCE(1.0 / (rrf_k + k.rank_fts), 0.0)
    ) as score
  FROM vector_search v
  FULL OUTER JOIN keyword_search k ON v.id = k.id
  JOIN public.document_chunks dc ON dc.id = COALESCE(v.id, k.id)
  ORDER BY score DESC
  LIMIT match_count;
$$;
