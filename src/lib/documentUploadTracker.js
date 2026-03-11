const PREFIX = 'document-upload-state:'
const listeners = new Map()
const stateMap = new Map()

const getStorage = () => {
  if (typeof sessionStorage !== 'undefined') return sessionStorage
  if (typeof globalThis !== 'undefined' && globalThis.sessionStorage) {
    return globalThis.sessionStorage
  }
  return null
}

const getKey = spaceId => `${PREFIX}${String(spaceId || '').trim()}`

const notify = spaceId => {
  const key = String(spaceId || '').trim()
  const subs = listeners.get(key)
  if (!subs) return
  const nextState = stateMap.get(key) || null
  subs.forEach(listener => listener(nextState))
}

export const getTrackedDocumentUploadState = spaceId => {
  const key = String(spaceId || '').trim()
  if (!key) return null
  if (stateMap.has(key)) return stateMap.get(key)
  const storage = getStorage()
  const raw = storage?.getItem(getKey(key))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    stateMap.set(key, parsed)
    return parsed
  } catch {
    return null
  }
}

export const setTrackedDocumentUploadState = (spaceId, nextState) => {
  const key = String(spaceId || '').trim()
  if (!key) return
  const storage = getStorage()
  if (!nextState || nextState.status === 'idle') {
    stateMap.delete(key)
    storage?.removeItem(getKey(key))
    notify(key)
    return
  }
  stateMap.set(key, nextState)
  storage?.setItem(getKey(key), JSON.stringify(nextState))
  notify(key)
}

export const subscribeToTrackedDocumentUploadState = (spaceId, listener) => {
  const key = String(spaceId || '').trim()
  if (!key || typeof listener !== 'function') return () => {}
  const subs = listeners.get(key) || new Set()
  subs.add(listener)
  listeners.set(key, subs)
  return () => {
    const current = listeners.get(key)
    if (!current) return
    current.delete(listener)
    if (current.size === 0) listeners.delete(key)
  }
}
