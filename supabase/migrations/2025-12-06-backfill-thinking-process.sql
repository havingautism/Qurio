-- Backfill thinking_process from <thought>...</thought> embedded in content strings
-- Run in Supabase SQL Editor or psql.

-- 1) Ensure column exists
ALTER TABLE public.conversation_messages
ADD COLUMN IF NOT EXISTS thinking_process TEXT;

-- 2) Backfill for simple string content that inlined thoughts
WITH extracted AS (
  SELECT
    id,
    (regexp_match(content #>> '{}', '(?s)<thought>(.*?)</thought>'))[1] AS thought_text,
    trim(regexp_replace(content #>> '{}', '(?s)<thought>.*?</thought>', '', 'g')) AS cleaned_content
  FROM public.conversation_messages
  WHERE jsonb_typeof(content) = 'string'
    AND (content #>> '{}') ~ '<thought>'
)
UPDATE public.conversation_messages AS cm
SET
  thinking_process = COALESCE(cm.thinking_process, extracted.thought_text),
  content = to_jsonb(extracted.cleaned_content)
FROM extracted
WHERE cm.id = extracted.id;

-- 3) Optional: report rows that still have inlined thoughts (non-string JSON shapes)
-- SELECT id, content FROM public.conversation_messages
-- WHERE thinking_process IS NULL AND content::text ILIKE '%<thought>%';
