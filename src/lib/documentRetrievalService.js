import { getSupabaseClient } from './supabase'
import { fetchEmbeddingVector } from './embeddingService'
import { cosineSimilarity } from './vectorUtils'

const CHUNKS_TABLE = 'document_chunks'
const DEFAULT_CHUNK_LIMIT = 250
const DEFAULT_TOP_CHUNKS = 3
const DEFAULT_SNIPPET_LENGTH = 400
const MAX_CONTEXT_CHARS = 12000

const truncateText = (text, limit) => {
  const str = String(text || '').trim()
  if (!str) return ''
  if (str.length <= limit) return str
  return `${str.slice(0, limit).trim()}…`
}

export const listDocumentChunksByDocumentIds = async (documentIds = [], options = {}) => {
  if (!documentIds.length) {
    return { data: [], error: null }
  }
  const normalizedIds = documentIds.map(id => String(id)).filter(Boolean)
  if (!normalizedIds.length) {
    return { data: [], error: null }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return { data: [], error: new Error('Supabase not configured') }
  }

  const { limit = DEFAULT_CHUNK_LIMIT } = options

  const { data, error } = await supabase
    .from(CHUNKS_TABLE)
    .select('id,document_id,text,embedding,source_hint,chunk_index')
    .in('document_id', normalizedIds)
    .limit(limit)

  return { data: data || [], error }
}

export const fetchDocumentChunkContext = async ({
  documents = [],
  queryText = '',
  chunkLimit = DEFAULT_CHUNK_LIMIT,
  topChunks = DEFAULT_TOP_CHUNKS,
} = {}) => {
  const trimmedQuery = String(queryText || '').trim()
  if (!documents.length || !trimmedQuery) {
    return null
  }

  const documentIds = documents.map(doc => String(doc.id)).filter(Boolean)
  if (!documentIds.length) {
    return null
  }

  const queryEmbedding = await fetchEmbeddingVector({
    text: trimmedQuery,
    prompt: `query: ${trimmedQuery}`,
  })
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
    return null
  }

  const { data: chunks, error } = await listDocumentChunksByDocumentIds(documentIds, {
    limit: chunkLimit,
  })
  if (error || !chunks || chunks.length === 0) {
    return null
  }

  const docMap = new Map(documents.map(doc => [String(doc.id), doc]))

  const scored = chunks
    .map(chunk => {
      const embedding = Array.isArray(chunk.embedding)
        ? chunk.embedding.map(value => Number(value))
        : []
      if (embedding.length !== queryEmbedding.length) return null
      const score = cosineSimilarity(queryEmbedding, embedding)
      if (score === null) return null
      return {
        chunk,
        score,
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) {
    return null
  }

  const top = scored.slice(0, topChunks).map(({ chunk, score }) => {
    const doc = docMap.get(String(chunk.document_id))
    return {
      id: String(chunk.id),
      documentId: String(chunk.document_id),
      title: doc?.name || 'Document',
      fileType: doc?.file_type || '',
      snippet: truncateText(chunk.text, DEFAULT_SNIPPET_LENGTH),
      sourceHint: chunk.source_hint || '',
      score,
    }
  })

  const contextLines = top.map(source => {
    const label = source.fileType ? `${source.title} (${source.fileType})` : source.title
    return `### ${label}\n${source.snippet}`
  })

  let context = contextLines.join('\n\n')
  if (context.length > MAX_CONTEXT_CHARS) {
    context = `${context.slice(0, MAX_CONTEXT_CHARS)}\n\n[Truncated]`
  }

  return { context, sources: top }
}
