-- Match document chunks by cosine similarity (server-side)
CREATE OR REPLACE FUNCTION public.match_document_chunks(
  document_ids UUID[],
  query_embedding REAL[],
  match_count INT DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
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
