import { getSupabaseClient } from './supabase'

const DOCUMENTS_TABLE = 'space_documents'
const CONVERSATION_DOCUMENTS_TABLE = 'conversation_documents'
const SPACE_DOCUMENTS_CACHE_TTL = 10000
const CONVERSATION_DOCS_CACHE_TTL = 10000
const spaceDocumentsCache = new Map()
const spaceDocumentsInFlight = new Map()
const conversationDocsCache = new Map()
const conversationDocsInFlight = new Map()

const getSpaceDocumentsCacheKey = spaceId => String(spaceId)
const getConversationDocsCacheKey = conversationId => String(conversationId)

const getSpaceDocumentsFromCache = spaceId => {
  const cacheKey = getSpaceDocumentsCacheKey(spaceId)
  const cached = spaceDocumentsCache.get(cacheKey)
  if (!cached) return null
  if (Date.now() - cached.timestamp > SPACE_DOCUMENTS_CACHE_TTL) {
    spaceDocumentsCache.delete(cacheKey)
    return null
  }
  return cached
}

const setSpaceDocumentsCache = (spaceId, result) => {
  const cacheKey = getSpaceDocumentsCacheKey(spaceId)
  spaceDocumentsCache.set(cacheKey, { ...result, timestamp: Date.now() })
}

const invalidateSpaceDocumentsCache = spaceId => {
  if (spaceId) {
    const cacheKey = getSpaceDocumentsCacheKey(spaceId)
    spaceDocumentsCache.delete(cacheKey)
    spaceDocumentsInFlight.delete(cacheKey)
    return
  }
  spaceDocumentsCache.clear()
  spaceDocumentsInFlight.clear()
}

const getConversationDocsFromCache = conversationId => {
  const cacheKey = getConversationDocsCacheKey(conversationId)
  const cached = conversationDocsCache.get(cacheKey)
  if (!cached) return null
  if (Date.now() - cached.timestamp > CONVERSATION_DOCS_CACHE_TTL) {
    conversationDocsCache.delete(cacheKey)
    return null
  }
  return cached
}

const setConversationDocsCache = (conversationId, result) => {
  const cacheKey = getConversationDocsCacheKey(conversationId)
  conversationDocsCache.set(cacheKey, { ...result, timestamp: Date.now() })
}

const invalidateConversationDocsCache = conversationId => {
  if (conversationId) {
    const cacheKey = getConversationDocsCacheKey(conversationId)
    conversationDocsCache.delete(cacheKey)
    conversationDocsInFlight.delete(cacheKey)
    return
  }
  conversationDocsCache.clear()
  conversationDocsInFlight.clear()
}

export const listSpaceDocuments = async spaceId => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: [], error: new Error('Supabase not configured') }
  if (!spaceId) return { data: [], error: new Error('Space id is required') }

  const cached = getSpaceDocumentsFromCache(spaceId)
  if (cached) return { data: cached.data || [], error: cached.error || null }

  const cacheKey = getSpaceDocumentsCacheKey(spaceId)
  if (spaceDocumentsInFlight.has(cacheKey)) {
    return spaceDocumentsInFlight.get(cacheKey)
  }

  const request = (async () => {
    const { data, error } = await supabase
      .from(DOCUMENTS_TABLE)
      .select(
        'id,space_id,name,file_type,content_text,created_at,embedding_provider,embedding_model',
      )
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false })

    const result = { data: data || [], error }
    if (!error) {
      setSpaceDocumentsCache(spaceId, result)
    }
    return result
  })()

  spaceDocumentsInFlight.set(cacheKey, request)
  try {
    return await request
  } finally {
    spaceDocumentsInFlight.delete(cacheKey)
  }
}

export const createSpaceDocument = async ({
  spaceId,
  name,
  fileType,
  contentText,
  embeddingProvider = null,
  embeddingModel = null,
}) => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }
  if (!spaceId) return { data: null, error: new Error('Space id is required') }
  if (!name) return { data: null, error: new Error('Document name is required') }
  if (!fileType) return { data: null, error: new Error('Document file type is required') }
  if (!contentText) return { data: null, error: new Error('Document content is required') }

  const { data, error } = await supabase
    .from(DOCUMENTS_TABLE)
    .insert([
      {
        space_id: spaceId,
        name,
        file_type: fileType,
        content_text: contentText,
        embedding_provider: embeddingProvider,
        embedding_model: embeddingModel,
      },
    ])
    .select()
    .single()

  if (!error) {
    invalidateSpaceDocumentsCache(spaceId)
  }
  return { data, error }
}

export const deleteSpaceDocument = async (documentId, spaceId = null) => {
  const supabase = getSupabaseClient()
  if (!supabase) return { success: false, error: new Error('Supabase not configured') }
  if (!documentId) return { success: false, error: new Error('Document id is required') }

  const { error } = await supabase.from(DOCUMENTS_TABLE).delete().eq('id', documentId)
  if (!error) {
    invalidateSpaceDocumentsCache(spaceId)
    invalidateConversationDocsCache()
  }

  return { success: !error, error }
}

export const listConversationDocumentIds = async conversationId => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: [], error: new Error('Supabase not configured') }
  if (!conversationId) return { data: [], error: new Error('Conversation id is required') }

  const cached = getConversationDocsFromCache(conversationId)
  if (cached) return { data: cached.data || [], error: cached.error || null }

  const cacheKey = getConversationDocsCacheKey(conversationId)
  if (conversationDocsInFlight.has(cacheKey)) {
    return conversationDocsInFlight.get(cacheKey)
  }

  const request = (async () => {
    const { data, error } = await supabase
      .from(CONVERSATION_DOCUMENTS_TABLE)
      .select('document_id')
      .eq('conversation_id', conversationId)

    const result = { data: (data || []).map(row => row.document_id), error }
    if (!error) {
      setConversationDocsCache(conversationId, result)
    }
    return result
  })()

  conversationDocsInFlight.set(cacheKey, request)
  try {
    return await request
  } finally {
    conversationDocsInFlight.delete(cacheKey)
  }
}

export const setConversationDocuments = async (conversationId, documentIds = []) => {
  const supabase = getSupabaseClient()
  if (!supabase) return { success: false, error: new Error('Supabase not configured') }
  if (!conversationId) return { success: false, error: new Error('Conversation id is required') }

  const normalized = (documentIds || []).map(String).filter(Boolean)
  const { error: deleteError } = await supabase
    .from(CONVERSATION_DOCUMENTS_TABLE)
    .delete()
    .eq('conversation_id', conversationId)

  if (deleteError) return { success: false, error: deleteError }
  if (normalized.length === 0) {
    setConversationDocsCache(conversationId, { data: [], error: null })
    return { success: true, error: null }
  }

  const rows = normalized.map(documentId => ({
    conversation_id: conversationId,
    document_id: documentId,
  }))
  const { error: insertError } = await supabase.from(CONVERSATION_DOCUMENTS_TABLE).insert(rows)

  if (!insertError) {
    setConversationDocsCache(conversationId, { data: normalized, error: null })
  }

  return { success: !insertError, error: insertError }
}
