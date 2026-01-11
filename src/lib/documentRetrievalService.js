import { getSupabaseClient } from './supabase'
import { fetchEmbeddingVector } from './embeddingService'
import { cosineSimilarity } from './vectorUtils'

const CHUNKS_TABLE = 'document_chunks'
const MATCH_DOCUMENT_CHUNKS_RPC = 'match_document_chunks'
const HYBRID_SEARCH_RPC = 'hybrid_search'
const DEFAULT_CHUNK_LIMIT = 250
const DEFAULT_TOP_CHUNKS = 3
const DEFAULT_SNIPPET_LENGTH = 400
const MAX_CONTEXT_CHARS = 12000
const MIN_SIMILARITY_THRESHOLD = 0.2
const NEIGHBOR_CHUNK_WINDOW = 1
const MAX_CHUNKS_PER_SECTION = 4

const truncateText = (text, limit) => {
  const str = String(text || '').trim()
  if (!str) return ''
  if (str.length <= limit) return str
  return `${str.slice(0, limit).trim()}...`
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
    .select('id,document_id,section_id,text,embedding,source_hint,chunk_index,title_path')
    .in('document_id', normalizedIds)
    .limit(limit)

  return { data: data || [], error }
}

export const listDocumentChunksByDocumentIdAndIndices = async (
  documentId,
  indices = [],
  sectionId = null,
) => {
  if (!documentId || !indices.length) {
    return { data: [], error: null }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return { data: [], error: new Error('Supabase not configured') }
  }

  const normalizedIndices = Array.from(new Set(indices))
    .map(value => Number(value))
    .filter(value => Number.isFinite(value))
  if (!normalizedIndices.length) {
    return { data: [], error: null }
  }

  let query = supabase
    .from(CHUNKS_TABLE)
    .select('id,document_id,section_id,text,source_hint,chunk_index,title_path')
    .eq('document_id', String(documentId))
    .in('chunk_index', normalizedIndices)

  if (sectionId) {
    query = query.eq('section_id', String(sectionId))
  }

  const { data, error } = await query

  return { data: data || [], error }
}

export const matchDocumentChunksByEmbedding = async ({
  documentIds = [],
  queryEmbedding = [],
  matchCount = DEFAULT_TOP_CHUNKS,
} = {}) => {
  if (!documentIds.length) {
    return { data: [], error: null }
  }
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
    return { data: [], error: null }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return { data: [], error: new Error('Supabase not configured') }
  }

  const normalizedIds = documentIds.map(id => String(id)).filter(Boolean)
  if (!normalizedIds.length) {
    return { data: [], error: null }
  }

  const { data, error } = await supabase.rpc(MATCH_DOCUMENT_CHUNKS_RPC, {
    document_ids: normalizedIds,
    query_embedding: queryEmbedding,
    match_count: matchCount,
  })

  return { data: data || [], error }
}

export const matchDocumentChunksByHybrid = async ({
  documentIds = [],
  queryText = '',
  queryEmbedding = [],
  matchCount = DEFAULT_TOP_CHUNKS,
  rrfK = 60,
} = {}) => {
  if (!documentIds.length) {
    return { data: [], error: null }
  }
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
    return { data: [], error: null }
  }
  const trimmedQuery = String(queryText || '').trim()
  if (!trimmedQuery) {
    return { data: [], error: null }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return { data: [], error: new Error('Supabase not configured') }
  }

  const normalizedIds = documentIds.map(id => String(id)).filter(Boolean)
  if (!normalizedIds.length) {
    return { data: [], error: null }
  }

  const { data, error } = await supabase.rpc(HYBRID_SEARCH_RPC, {
    document_ids: normalizedIds,
    query_text: trimmedQuery,
    query_embedding: queryEmbedding,
    match_count: matchCount,
    rrf_k: rrfK,
  })

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
    taskType: 'RETRIEVAL_QUERY',
  })
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
    return null
  }

  const docMap = new Map(documents.map(doc => [String(doc.id), doc]))
  const matchCount = Math.max(topChunks, 1)

  const { data: hybridMatches, error: hybridError } = await matchDocumentChunksByHybrid({
    documentIds,
    queryText: trimmedQuery,
    queryEmbedding,
    matchCount,
  })

  const { data: matches, error: matchError } = await matchDocumentChunksByEmbedding({
    documentIds,
    queryEmbedding,
    matchCount,
  })

  let scored = []
  if (!hybridError && hybridMatches && hybridMatches.length > 0) {
    const filtered = hybridMatches
      .map(match => {
        const similarity = Number(match.similarity)
        if (Number.isFinite(similarity) && similarity < MIN_SIMILARITY_THRESHOLD) {
          return null
        }
        return {
          chunk: match,
          score: Number(match.score ?? match.similarity),
          similarity,
        }
      })
      .filter(entry => entry && Number.isFinite(entry.score))

    if (filtered.length > 0) {
      scored = filtered
    } else {
      scored = hybridMatches
        .map(match => ({
          chunk: match,
          score: Number(match.score ?? match.similarity),
          similarity: Number(match.similarity),
        }))
        .filter(entry => Number.isFinite(entry.score))
    }
  } else if (!matchError && matches && matches.length > 0) {
    const filtered = matches
      .map(match => {
        const similarity = Number(match.similarity)
        if (Number.isFinite(similarity) && similarity < MIN_SIMILARITY_THRESHOLD) {
          return null
        }
        return {
          chunk: match,
          score: Number(match.similarity),
          similarity,
        }
      })
      .filter(entry => entry && Number.isFinite(entry.score))

    if (filtered.length > 0) {
      scored = filtered
    } else {
      scored = matches
        .map(match => ({
          chunk: match,
          score: Number(match.similarity),
          similarity: Number(match.similarity),
        }))
        .filter(entry => Number.isFinite(entry.score))
    }
  } else {
    const { data: chunks, error } = await listDocumentChunksByDocumentIds(documentIds, {
      limit: chunkLimit,
    })
    if (error || !chunks || chunks.length === 0) {
      return null
    }

    const raw = chunks
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
          similarity: score,
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)

    const filtered = raw.filter(entry => entry.similarity >= MIN_SIMILARITY_THRESHOLD)
    scored = filtered.length > 0 ? filtered : raw

    if (scored.length === 0) {
      return null
    }
  }

  const limited = []
  const sectionCounts = new Map()
  scored.forEach(entry => {
    if (limited.length >= topChunks) return
    const sectionId = entry.chunk.section_id ? String(entry.chunk.section_id) : ''
    if (sectionId) {
      const current = sectionCounts.get(sectionId) || 0
      if (current >= MAX_CHUNKS_PER_SECTION) return
      sectionCounts.set(sectionId, current + 1)
    }
    limited.push(entry)
  })

  const top = limited.map(({ chunk, score, similarity }) => {
    const doc = docMap.get(String(chunk.document_id))
    return {
      id: String(chunk.id),
      documentId: String(chunk.document_id),
      sectionId: chunk.section_id ? String(chunk.section_id) : null,
      title: doc?.name || 'Document',
      fileType: doc?.file_type || '',
      snippet: truncateText(chunk.text, DEFAULT_SNIPPET_LENGTH),
      sourceHint: chunk.source_hint || '',
      chunkIndex: chunk.chunk_index ?? null,
      titlePath: Array.isArray(chunk.title_path) ? chunk.title_path : [],
      isNeighbor: false,
      score,
      similarity: Number.isFinite(similarity) ? similarity : null,
    }
  })

  let orderedSources = top
  if (NEIGHBOR_CHUNK_WINDOW > 0 && top.length > 0) {
    const neighborIndexMap = new Map()
    top.forEach(source => {
      const baseIndex = Number(source.chunkIndex)
      if (!Number.isFinite(baseIndex)) return
      if (!source.sectionId) return
      const docId = String(source.documentId)
      const sectionId = source.sectionId ? String(source.sectionId) : ''
      const key = `${docId}:${sectionId}`
      const indices = neighborIndexMap.get(key) || new Set()
      for (let offset = -NEIGHBOR_CHUNK_WINDOW; offset <= NEIGHBOR_CHUNK_WINDOW; offset += 1) {
        if (offset === 0) continue
        indices.add(baseIndex + offset)
      }
      neighborIndexMap.set(key, indices)
    })

    const neighborChunks = []
    for (const [key, indicesSet] of neighborIndexMap.entries()) {
      const [docId, sectionId] = key.split(':')
      const { data, error } = await listDocumentChunksByDocumentIdAndIndices(
        docId,
        Array.from(indicesSet),
        sectionId || null,
      )
      if (error || !data || data.length === 0) continue
      neighborChunks.push(...data)
    }

    const topIdSet = new Set(top.map(item => item.id))
    const neighborMap = new Map()
    neighborChunks.forEach(chunk => {
      const id = String(chunk.id)
      if (topIdSet.has(id)) return
      const doc = docMap.get(String(chunk.document_id))
      neighborMap.set(`${chunk.document_id}:${chunk.chunk_index}`, {
        id,
        documentId: String(chunk.document_id),
        sectionId: chunk.section_id ? String(chunk.section_id) : null,
        title: doc?.name || 'Document',
        fileType: doc?.file_type || '',
          snippet: truncateText(chunk.text, DEFAULT_SNIPPET_LENGTH),
          sourceHint: chunk.source_hint || '',
          chunkIndex: chunk.chunk_index ?? null,
          titlePath: Array.isArray(chunk.title_path) ? chunk.title_path : [],
          isNeighbor: true,
          score: null,
          similarity: null,
        })
    })

    const ordered = []
    const addedIds = new Set()
    top.forEach(source => {
      const docId = String(source.documentId)
      const baseIndex = Number(source.chunkIndex)
      for (let offset = -NEIGHBOR_CHUNK_WINDOW; offset < 0; offset += 1) {
        const key = `${docId}:${baseIndex + offset}`
        const neighbor = neighborMap.get(key)
        if (neighbor && !addedIds.has(neighbor.id)) {
          ordered.push(neighbor)
          addedIds.add(neighbor.id)
        }
      }
      if (!addedIds.has(source.id)) {
        ordered.push(source)
        addedIds.add(source.id)
      }
      for (let offset = 1; offset <= NEIGHBOR_CHUNK_WINDOW; offset += 1) {
        const key = `${docId}:${baseIndex + offset}`
        const neighbor = neighborMap.get(key)
        if (neighbor && !addedIds.has(neighbor.id)) {
          ordered.push(neighbor)
          addedIds.add(neighbor.id)
        }
      }
    })
    orderedSources = ordered.length ? ordered : top
  }

  const contextLines = orderedSources.map(source => {
    const label = source.fileType ? `${source.title} (${source.fileType})` : source.title
    return `### ${label}\n${source.snippet}`
  })

  let context = contextLines.join('\n\n')
  if (context.length > MAX_CONTEXT_CHARS) {
    context = `${context.slice(0, MAX_CONTEXT_CHARS)}\n\n[Truncated]`
  }

  return { context, sources: orderedSources }
}
