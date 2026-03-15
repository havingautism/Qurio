import { searchDocumentsViaBackend } from './backendClient'

const DEFAULT_TOP_NODES = 5
const DEFAULT_SNIPPET_LENGTH = 900
const MAX_CONTEXT_CHARS = 12000

const truncateText = (text, limit = DEFAULT_SNIPPET_LENGTH) => {
  const str = String(text || '').trim()
  if (!str) return ''
  if (str.length <= limit) return str
  return `${str.slice(0, limit).trim()}...`
}

const normalizeTitlePath = node => {
  const ancestors = Array.isArray(node?.ancestors)
    ? node.ancestors.map(item => String(item || '').trim()).filter(Boolean)
    : []
  const title = String(node?.title || '').trim()
  return title ? [...ancestors, title] : ancestors
}

export const fetchDocumentChunkContext = async ({
  documents = [],
  queryText = '',
  topChunks = DEFAULT_TOP_NODES,
  liteProvider = '',
  liteModel = '',
  liteApiKey = '',
  liteBaseUrl = '',
  useLiteRetrievalPlan = true,
} = {}) => {
  const trimmedQuery = String(queryText || '').trim()
  if (!trimmedQuery || !Array.isArray(documents) || documents.length === 0) {
    return null
  }

  const docMap = new Map(
    documents
      .map(doc => [String(doc?.id || ''), doc])
      .filter(([id]) => id),
  )
  const documentIds = Array.from(docMap.keys())
  const firstDoc = documents[0]
  const spaceId = String(firstDoc?.space_id || firstDoc?.spaceId || '').trim()
  if (!spaceId || documentIds.length === 0) {
    return null
  }

  const result = await searchDocumentsViaBackend({
    spaceId,
    documentIds,
    queryText: trimmedQuery,
    topK: Math.max(1, Number(topChunks || DEFAULT_TOP_NODES)),
    liteProvider,
    liteModel,
    liteApiKey,
    liteBaseUrl,
    useLiteRetrievalPlan,
  })

  const rawDocuments = Array.isArray(result?.documents) ? result.documents : []
  if (!rawDocuments.length) {
    return null
  }

  const sources = rawDocuments.flatMap(documentResult => {
    const documentId = String(documentResult?.doc_id || '')
    const uiDoc = docMap.get(documentId)
    const nodes = Array.isArray(documentResult?.nodes) ? documentResult.nodes : []

    return nodes.map(node => ({
      id: `${documentId}:${String(node?.node_id || '')}`,
      documentId,
      nodeId: String(node?.node_id || ''),
      title: uiDoc?.name || documentResult?.doc_name || 'Document',
      fileType: uiDoc?.file_type || '',
      titlePath: normalizeTitlePath(node),
      snippet: truncateText(node?.text),
      score: typeof node?.score === 'number' ? node.score : null,
      similarity: typeof node?.score === 'number' ? node.score : null,
      isNeighbor: false,
    }))
  })

  if (!sources.length) {
    return null
  }

  const contextLines = sources.map(source => {
    const label = source.fileType ? `${source.title} (${source.fileType})` : source.title
    return `### ${label}\n${source.snippet}`
  })

  let context = contextLines.join('\n\n')
  if (context.length > MAX_CONTEXT_CHARS) {
    context = `${context.slice(0, MAX_CONTEXT_CHARS)}\n\n[Truncated]`
  }

  return { context, sources }
}
