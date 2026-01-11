import { getSupabaseClient } from './supabase'

const sectionsTable = 'document_sections'
const chunksTable = 'document_chunks'

export const persistDocumentSections = async (documentId, sections = []) => {
  if (!documentId || sections.length === 0) return { sectionMap: {}, error: null }
  const payload = sections.map(section => ({
    document_id: documentId,
    external_section_id: section.id,
    title_path: section.titlePath || [],
    level: section.level,
    loc: section.loc || null,
  }))

  const supabase = getSupabaseClient()
  if (!supabase) {
    return { sectionMap: {}, error: new Error('Supabase not configured') }
  }

  const { data, error } = await supabase
    .from(sectionsTable)
    .insert(payload)
    .select('id,external_section_id')

  if (error) return { sectionMap: {}, error }
  const sectionMap = {}
  ;(data || []).forEach(row => {
    if (row.external_section_id != null) {
      sectionMap[row.external_section_id] = row.id
    }
  })
  return { sectionMap, error: null }
}

export const persistDocumentChunks = async (documentId, chunks = [], sectionMap = {}) => {
  if (!documentId || chunks.length === 0) return { error: null }
  const payload = chunks.map(chunk => ({
    document_id: documentId,
    section_id: sectionMap[chunk.parentSectionId] || null,
    external_chunk_id: chunk.chunkId,
    chunk_index: chunk.chunkIndex,
    content_type: chunk.contentType || 'paragraph',
    text: chunk.text,
    token_count: chunk.tokenCount,
    chunk_hash: chunk.chunkHash,
    loc: chunk.loc || null,
    source_hint: chunk.sourceHint,
    embedding: chunk.embedding,
  }))

  const supabase = getSupabaseClient()
  if (!supabase) {
    return { error: new Error('Supabase not configured') }
  }

  const { error } = await supabase
    .from(chunksTable)
    .upsert(payload, { onConflict: ['document_id', 'chunk_hash'] })
  return { error }
}
