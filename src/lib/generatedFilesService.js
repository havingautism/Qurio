import { getBackendUrl } from './settings'

const buildBackendError = async response => {
  const payload = await response.json().catch(() => ({ message: 'Unknown error' }))
  const error = new Error(payload?.detail || payload?.message || `Backend error: ${response.status}`)
  error.status = response.status
  error.payload = payload
  return error
}

export const listGeneratedFiles = async ({ kind, q, sort = 'desc' } = {}) => {
  const params = new URLSearchParams()
  if (typeof kind === 'string' && kind.trim()) {
    params.set('kind', kind.trim())
  }
  if (typeof q === 'string' && q.trim()) {
    params.set('q', q.trim())
  }
  if (typeof sort === 'string' && sort.trim()) {
    params.set('sort', sort.trim())
  }

  const query = params.toString()
  const response = await fetch(`${getBackendUrl()}/api/files/generated${query ? `?${query}` : ''}`)
  if (!response.ok) {
    throw await buildBackendError(response)
  }
  return response.json()
}

export const deleteGeneratedFile = async ({ kind, fileId }) => {
  const response = await fetch(
    `${getBackendUrl()}/api/files/generated/${encodeURIComponent(kind)}/${encodeURIComponent(fileId)}`,
    { method: 'DELETE' },
  )
  if (!response.ok) {
    throw await buildBackendError(response)
  }
  return response.json()
}

export const getGeneratedFileDetail = async ({ kind, fileId }) => {
  const response = await fetch(
    `${getBackendUrl()}/api/files/generated/${encodeURIComponent(kind)}/${encodeURIComponent(fileId)}`,
  )
  if (!response.ok) {
    throw await buildBackendError(response)
  }
  return response.json()
}
