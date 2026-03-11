import { getBackendUrl } from './settings'

const pendingDocumentUploadJobs = new Map()
const SESSION_STORAGE_KEY_PREFIX = 'document-upload-job:'

const getSessionStorage = () => {
  if (typeof sessionStorage !== 'undefined') return sessionStorage
  if (typeof globalThis !== 'undefined' && globalThis.sessionStorage) {
    return globalThis.sessionStorage
  }
  return null
}

const getPendingUploadStorageKey = spaceId =>
  `${SESSION_STORAGE_KEY_PREFIX}${String(spaceId || '').trim()}`

const persistPendingDocumentUploadJob = record => {
  const storage = getSessionStorage()
  if (!storage || !record?.spaceId) return
  storage.setItem(getPendingUploadStorageKey(record.spaceId), JSON.stringify(record))
}

const readPersistedPendingDocumentUploadJob = spaceId => {
  const storage = getSessionStorage()
  if (!storage) return null
  const raw = storage.getItem(getPendingUploadStorageKey(spaceId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      spaceId: String(parsed.spaceId || spaceId || '').trim(),
      jobId: String(parsed.jobId || '').trim(),
      fileName: String(parsed.fileName || '').trim(),
    }
  } catch {
    return null
  }
}

const clearPersistedPendingDocumentUploadJob = spaceId => {
  const storage = getSessionStorage()
  if (!storage) return
  storage.removeItem(getPendingUploadStorageKey(spaceId))
}

export const shouldUseBackendDocumentExtraction = file => {
  const name = String(file?.name || '').toLowerCase()
  const type = String(file?.type || '').toLowerCase()
  return (
    name.endsWith('.pdf') ||
    name.endsWith('.docx') ||
    type === 'application/pdf' ||
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
}

const getErrorMessage = async response => {
  const payload = await response.json().catch(() => null)
  return payload?.detail || payload?.message || `Backend error: ${response.status}`
}

const buildSecretHeaders = apiKey => {
  const headers = { 'Content-Type': 'application/json' }
  if (String(apiKey || '').trim()) {
    headers['x-llm-api-key'] = String(apiKey).trim()
  }
  return headers
}

export const extractDocumentTextViaBackend = async file => {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${getBackendUrl()}/api/document-kb/extract`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response))
  }

  return response.json()
}

export const createDocumentUploadJob = async ({
  file,
  spaceId,
  title,
  provider,
  model,
  baseUrl,
  apiKey,
}) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('space_id', spaceId)
  if (title) formData.append('title', title)
  if (provider) formData.append('provider', provider)
  if (model) formData.append('model', model)
  if (baseUrl) formData.append('base_url', baseUrl)

  const headers = {}
  if (String(apiKey || '').trim()) {
    headers['x-llm-api-key'] = String(apiKey).trim()
  }

  const response = await fetch(`${getBackendUrl()}/api/document-kb/upload-jobs`, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response))
  }

  return response.json()
}

export const getDocumentUploadJob = async jobId => {
  const response = await fetch(`${getBackendUrl()}/api/document-kb/upload-jobs/${jobId}`)

  if (!response.ok) {
    throw new Error(await getErrorMessage(response))
  }

  return response.json()
}

export const cancelDocumentUploadJob = async jobId => {
  const response = await fetch(`${getBackendUrl()}/api/document-kb/upload-jobs/${jobId}/cancel`, {
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response))
  }

  return response.json()
}

export const getDocumentUploadMessageKey = job => {
  const stage = String(job?.stage || '').trim().toLowerCase()
  if (stage === 'uploading') return 'views.spaceView.documentUploading'
  if (stage === 'parsing') return 'views.spaceView.documentParsing'
  if (stage === 'indexing') return 'views.spaceView.documentIndexing'
  if (stage === 'completed') return 'views.spaceView.documentUploaded'
  return 'views.spaceView.documentUploadFailed'
}

export const savePendingDocumentUploadJob = ({ spaceId, jobId, fileName }) => {
  const normalizedSpaceId = String(spaceId || '').trim()
  const normalizedJobId = String(jobId || '').trim()
  if (!normalizedSpaceId || !normalizedJobId) return null
  const record = {
    spaceId: normalizedSpaceId,
    jobId: normalizedJobId,
    fileName: String(fileName || '').trim(),
  }
  pendingDocumentUploadJobs.set(normalizedSpaceId, record)
  persistPendingDocumentUploadJob(record)
  return record
}

export const getPendingDocumentUploadJob = spaceId => {
  const normalizedSpaceId = String(spaceId || '').trim()
  const inMemory = pendingDocumentUploadJobs.get(normalizedSpaceId)
  if (inMemory) return inMemory
  const persisted = readPersistedPendingDocumentUploadJob(normalizedSpaceId)
  if (!persisted?.spaceId || !persisted?.jobId) return null
  pendingDocumentUploadJobs.set(normalizedSpaceId, persisted)
  return persisted
}

export const clearPendingDocumentUploadJob = spaceId => {
  const normalizedSpaceId = String(spaceId || '').trim()
  pendingDocumentUploadJobs.delete(normalizedSpaceId)
  clearPersistedPendingDocumentUploadJob(normalizedSpaceId)
}

export const ingestDocumentKnowledge = async ({
  spaceId,
  documentId,
  title,
  fileType,
  contentText,
  provider,
  model,
  baseUrl,
  apiKey,
}) => {
  const response = await fetch(`${getBackendUrl()}/api/document-kb/ingest`, {
    method: 'POST',
    headers: buildSecretHeaders(apiKey),
    body: JSON.stringify({
      space_id: spaceId,
      doc_id: documentId,
      title,
      file_type: fileType,
      content_text: contentText,
      provider,
      model,
      base_url: baseUrl,
    }),
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response))
  }

  return response.json()
}

export const deleteDocumentKnowledge = async ({ spaceId, documentId }) => {
  const response = await fetch(`${getBackendUrl()}/api/document-kb/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      space_id: spaceId,
      doc_id: documentId,
    }),
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response))
  }

  return response.json()
}

export const locateDocumentKnowledge = async ({
  spaceId,
  queryText,
  limit = 3,
  documentIds = [],
}) => {
  const response = await fetch(`${getBackendUrl()}/api/document-kb/locate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      space_id: spaceId,
      query: queryText,
      limit,
      document_ids: documentIds,
    }),
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response))
  }

  return response.json()
}

export const readDocumentKnowledge = async ({ spaceId, documentId, sectionId }) => {
  const response = await fetch(`${getBackendUrl()}/api/document-kb/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      space_id: spaceId,
      doc_id: documentId,
      section_id: sectionId,
    }),
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response))
  }

  return response.json()
}

export const buildDocumentContextFromMatches = ({
  locateResult,
  readResults,
  maxSources = 3,
  maxChars = 12000,
}) => {
  const matches = Array.isArray(locateResult?.matches) ? locateResult.matches : []
  const reads = Array.isArray(readResults) ? readResults : []
  const readMap = new Map(reads.map(entry => [`${entry.doc_id}:${entry.section_id}`, entry]))

  const sources = matches
    .map(match => {
      const read = readMap.get(`${match.doc_id}:${match.section_id}`)
      const content = Array.isArray(read?.chunks)
        ? read.chunks
            .map(chunk => String(chunk?.content || '').trim())
            .filter(Boolean)
            .join('\n\n')
        : ''
      if (!content) return null
      return {
        id: `${match.doc_id}:${match.section_id}`,
        title: match.title,
        fileType: match.file_type,
        titlePath:
          (Array.isArray(read?.title_path) && read.title_path.length
            ? read.title_path
            : match.section_title
              ? [match.section_title]
              : []),
        snippet: content.slice(0, maxChars),
        similarity: Number(match.score || 0),
        sectionId: match.section_id,
        path: Array.isArray(read?.chunks) && read.chunks[0]?.path ? read.chunks[0].path : '',
      }
    })
    .filter(Boolean)
    .slice(0, maxSources)

  const appendText = [
    '# The following document excerpts may help answer this question (filesystem knowledge base):',
    ...sources.map(source => {
      const path = source.titlePath.length ? `: ${source.titlePath.join(' > ')}` : ''
      return `- [score=${source.similarity} | ${source.title}]${path}\n  ${source.snippet}`
    }),
  ].join('\n')

  return { sources, appendText }
}

export const fetchDocumentFileContext = async ({
  documents = [],
  queryText = '',
  topSections = 3,
}) => {
  const trimmedQuery = String(queryText || '').trim()
  if (!trimmedQuery || !Array.isArray(documents) || documents.length === 0) {
    return null
  }

  const spaceId = String(documents[0]?.space_id || documents[0]?.spaceId || '').trim()
  if (!spaceId) return null

  const locateResult = await locateDocumentKnowledge({
    spaceId,
    queryText: trimmedQuery,
    limit: Math.max(1, topSections),
    documentIds: documents.map(doc => String(doc?.id || '')).filter(Boolean),
  })
  const matches = Array.isArray(locateResult?.matches) ? locateResult.matches : []
  if (!matches.length) {
    return { sources: [], appendText: '' }
  }

  const readResults = await Promise.all(
    matches.map(match =>
      readDocumentKnowledge({
        spaceId,
        documentId: match.doc_id,
        sectionId: match.section_id,
      }),
    ),
  )

  return buildDocumentContextFromMatches({ locateResult, readResults, maxSources: topSections })
}
