import { getSupabaseClient } from './supabase'

const DOCUMENTS_TABLE = 'space_documents'
const CONVERSATION_DOCUMENTS_TABLE = 'conversation_documents'

export const listSpaceDocuments = async spaceId => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: [], error: new Error('Supabase not configured') }
  if (!spaceId) return { data: [], error: new Error('Space id is required') }

  const { data, error } = await supabase
    .from(DOCUMENTS_TABLE)
    .select('id,space_id,name,file_type,content_text,created_at,embedding_provider,embedding_model')
    .eq('space_id', spaceId)
    .order('created_at', { ascending: false })

  return { data: data || [], error }
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

  return { data, error }
}

export const deleteSpaceDocument = async documentId => {
  const supabase = getSupabaseClient()
  if (!supabase) return { success: false, error: new Error('Supabase not configured') }
  if (!documentId) return { success: false, error: new Error('Document id is required') }

  const { error } = await supabase.from(DOCUMENTS_TABLE).delete().eq('id', documentId)

  return { success: !error, error }
}

export const listConversationDocumentIds = async conversationId => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: [], error: new Error('Supabase not configured') }
  if (!conversationId) return { data: [], error: new Error('Conversation id is required') }

  const { data, error } = await supabase
    .from(CONVERSATION_DOCUMENTS_TABLE)
    .select('document_id')
    .eq('conversation_id', conversationId)

  return { data: (data || []).map(row => row.document_id), error }
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
  if (normalized.length === 0) return { success: true, error: null }

  const rows = normalized.map(documentId => ({
    conversation_id: conversationId,
    document_id: documentId,
  }))
  const { error: insertError } = await supabase.from(CONVERSATION_DOCUMENTS_TABLE).insert(rows)

  return { success: !insertError, error: insertError }
}
