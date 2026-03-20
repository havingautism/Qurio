import { getBackendUrl } from '../settings'

export const rebuildPptxFromPayload = async requestPayload => {
  try {
    const res = await fetch(`${getBackendUrl()}/api/files/pptx/rebuild`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload || {}),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data?.detail || `HTTP ${res.status}`)
    }
    return { data, error: null }
  } catch (err) {
    return {
      data: null,
      error: err?.message || 'Failed to rebuild PPTX',
    }
  }
}
