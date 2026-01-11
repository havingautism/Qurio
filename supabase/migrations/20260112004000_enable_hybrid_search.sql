-- Enable pgvector if not already enabled (standard for RAG)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add FTS column to document_chunks
-- We uses 'english' configuration as a safe default.
-- For multi-language support, consider using a specific config or 'simple'.
ALTER TABLE public.document_chunks
ADD COLUMN IF NOT EXISTS fts tsvector GENERATED ALWAYS AS (to_tsvector('simple', text || ' ' || coalesce(source_hint, ''))) STORED;

-- Create Index for FTS
CREATE INDEX IF NOT EXISTS idx_document_chunks_fts ON public.document_chunks USING GIN (fts);

-- Hybrid Search Function using RRF (Reciprocal Rank Fusion)
-- Combines Vector Similarity (Dot Product / Cosine) + Keyword Rank (TS_RANK)
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
        -- Manual Cosine Similarity to ensure compatibility if pgvector <=> operator issues arise,
        -- basically same logic as match_document_chunks
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
    -- Ensure embeddings are same length
    AND array_length(dc.embedding, 1) = array_length(query_embedding, 1)
    ORDER BY similarity DESC
    LIMIT match_count * 2
  ),
  keyword_search AS (
    SELECT
      dc.id,
      ROW_NUMBER() OVER (ORDER BY ts_rank_cd(fts, websearch_to_tsquery('simple', query_text)) DESC) as rank_fts,
      ts_rank_cd(fts, websearch_to_tsquery('simple', query_text)) as fts_score
    FROM public.document_chunks dc
    WHERE dc.document_id = ANY(document_ids)
    AND fts @@ websearch_to_tsquery('simple', query_text)
    ORDER BY fts_score DESC
    LIMIT match_count * 2
  )
  SELECT
    COALESCE(v.id, k.id) as id,
    dc.document_id,
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
