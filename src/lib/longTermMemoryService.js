import { fetchEmbeddingVector, resolveEmbeddingConfig } from './embeddingService'
import { cosineSimilarity } from './vectorUtils'
import { getSupabaseClient } from './supabase'

const MEMORY_STORAGE_KEY = 'longTermMemoryIndex'
const MEMORY_TABLE = 'long_term_memory'
const DEFAULT_SIMILARITY_THRESHOLD = 0.3
const DIRECT_MEMORY_MAX_CHARS = 600
const MEMORY_CONTEXT_MAX_CHARS = 1600
const CACHE_TTL_MS = 5 * 60 * 1000

let memoryCache = { record: null, fetchedAt: 0 }

const buildMemoryEmbeddingPrompt = text => `passage: Long-term memory. ${text}`

const normalizeEmbedding = embedding =>
  Array.isArray(embedding) ? embedding.map(value => Number(value)) : []

const hashText = text => {
  const str = String(text || '')
  let hash = 5381
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 33) ^ str.charCodeAt(i)
  }
  return (hash >>> 0).toString(16)
}

const truncateMemoryText = text => {
  const trimmed = String(text || '').trim()
  if (!trimmed) return ''
  if (trimmed.length <= MEMORY_CONTEXT_MAX_CHARS) return trimmed
  return `${trimmed.slice(0, MEMORY_CONTEXT_MAX_CHARS)}...`
}

const loadLocalMemoryRecord = () => {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(MEMORY_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed) return null
    return parsed
  } catch {
    return null
  }
}

const saveLocalMemoryRecord = record => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(record))
}

const clearLocalMemoryRecord = () => {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(MEMORY_STORAGE_KEY)
}

export const getLongTermMemoryRecord = async () => {
  const now = Date.now()
  if (memoryCache.record && now - memoryCache.fetchedAt < CACHE_TTL_MS) {
    return memoryCache.record
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    const local = loadLocalMemoryRecord()
    memoryCache = { record: local, fetchedAt: now }
    return local
  }

  const { data, error } = await supabase
    .from(MEMORY_TABLE)
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('Failed to fetch long-term memory:', error)
    const local = loadLocalMemoryRecord()
    memoryCache = { record: local, fetchedAt: now }
    return local
  }

  memoryCache = { record: data || null, fetchedAt: now }
  return data || null
}

const saveLongTermMemoryRecord = record => {
  memoryCache = { record, fetchedAt: Date.now() }
  saveLocalMemoryRecord(record)
}

const clearLongTermMemoryRecord = () => {
  memoryCache = { record: null, fetchedAt: Date.now() }
  clearLocalMemoryRecord()
}

export const ensureLongTermMemoryIndex = async ({ text, provider, model }) => {
  const trimmed = String(text || '').trim()
  if (!trimmed) {
    const supabase = getSupabaseClient()
    if (supabase) {
      await supabase.from(MEMORY_TABLE).delete().neq('id', '')
    }
    clearLongTermMemoryRecord()
    return { updated: false, cleared: true }
  }

  const contentHash = hashText(trimmed)
  const supabase = getSupabaseClient()
  const existing = await getLongTermMemoryRecord()
  const shouldEmbed = trimmed.length > DIRECT_MEMORY_MAX_CHARS && provider && model
  const sameContent = existing?.content_hash === contentHash
  const sameProvider = existing?.embedding_provider === provider
  const sameModel = existing?.embedding_model === model
  const hasEmbedding = Array.isArray(existing?.embedding)

  if (sameContent && sameProvider && sameModel && (!shouldEmbed || hasEmbedding)) {
    return { updated: false, cleared: false }
  }

  let embedding = null
  if (shouldEmbed) {
    embedding = await fetchEmbeddingVector({
      text: trimmed,
      prompt: buildMemoryEmbeddingPrompt(trimmed),
      taskType: 'RETRIEVAL_DOCUMENT',
      overrides: { provider, model },
    })
  }

  const payload = {
    content_text: trimmed,
    content_hash: contentHash,
    embedding: embedding ? normalizeEmbedding(embedding) : null,
    embedding_provider: shouldEmbed ? provider : null,
    embedding_model: shouldEmbed ? model : null,
    updated_at: new Date().toISOString(),
  }

  if (supabase) {
    if (existing?.id) {
      const { data, error } = await supabase
        .from(MEMORY_TABLE)
        .update(payload)
        .eq('id', existing.id)
        .select()
        .maybeSingle()
      if (!error && data) {
        saveLongTermMemoryRecord(data)
        return { updated: true, cleared: false, record: data }
      }
      console.error('Failed to update long-term memory:', error)
    } else {
      const { data, error } = await supabase
        .from(MEMORY_TABLE)
        .insert([payload])
        .select()
        .maybeSingle()
      if (!error && data) {
        saveLongTermMemoryRecord(data)
        return { updated: true, cleared: false, record: data }
      }
      console.error('Failed to insert long-term memory:', error)
    }
  }

  const localRecord = {
    id: existing?.id || `memory-${Date.now()}`,
    content_text: trimmed,
    content_hash: contentHash,
    embedding: payload.embedding,
    embedding_provider: payload.embedding_provider,
    embedding_model: payload.embedding_model,
    updated_at: payload.updated_at,
  }
  saveLongTermMemoryRecord(localRecord)
  return { updated: true, cleared: false, record: localRecord }
}

export const searchLongTermMemory = async ({
  record,
  queryText,
  similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD,
}) => {
  const trimmed = String(queryText || '').trim()
  if (!trimmed) return { matches: [], query: '' }
  if (!record) return { matches: [], query: trimmed }

  const { provider, model } = resolveEmbeddingConfig()
  if (!record.embedding || !provider || !model) {
    return { matches: [], query: trimmed, skipped: 'no_embedding' }
  }
  if (provider !== record.embedding_provider || model !== record.embedding_model) {
    return { matches: [], query: trimmed, skipped: 'embedding_mismatch' }
  }

  const queryEmbedding = await fetchEmbeddingVector({
    text: trimmed,
    prompt: `query: ${trimmed}`,
    taskType: 'RETRIEVAL_QUERY',
  })

  const queryVector = normalizeEmbedding(queryEmbedding)
  if (!queryVector.length) return { matches: [], query: trimmed }

  const embedding = normalizeEmbedding(record.embedding)
  if (!embedding.length || embedding.length !== queryVector.length) {
    return { matches: [], query: trimmed }
  }

  const score = cosineSimilarity(queryVector, embedding)
  if (score === null) return { matches: [], query: trimmed }

  const passes = score >= similarityThreshold
  if (!passes) {
    return { matches: [], query: trimmed, score }
  }

  return {
    matches: [
      {
        id: record.id,
        text: truncateMemoryText(record.content_text),
        score,
      },
    ],
    query: trimmed,
    score,
  }
}

export const formatMemoryAppendText = matches => {
  if (!Array.isArray(matches) || matches.length === 0) return ''
  const lines = matches.map(item => {
    const score = typeof item.score === 'number' ? item.score.toFixed(2) : 'n/a'
    return `- [score=${score}] ${item.text}`
  })
  return ['# Long-term memory:', ...lines].join('\n')
}

export const shouldUseDirectMemory = record => {
  if (!record?.content_text) return false
  return String(record.content_text).length <= DIRECT_MEMORY_MAX_CHARS
}

export const buildDirectMemoryContext = record => {
  if (!record?.content_text) return ''
  const text = truncateMemoryText(record.content_text)
  return text ? `# Long-term memory:\n${text}` : ''
}
