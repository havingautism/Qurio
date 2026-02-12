export const THINKING_TOGGLE_STORAGE_KEY = 'qurio:toggle:thinking'
export const SEARCH_TOGGLE_STORAGE_KEY = 'qurio:toggle:search'
export const SEARCH_BACKEND_STORAGE_KEY = 'qurio:toggle:searchBackend'
export const SEARCH_TOOLS_STORAGE_KEY = 'qurio:toggle:searchTools'

export const parseStoredBoolean = value => {
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

export const loadTogglePreferences = () => {
  const searchEnabled = parseStoredBoolean(localStorage.getItem(SEARCH_TOGGLE_STORAGE_KEY))
  const thinkingEnabled = parseStoredBoolean(localStorage.getItem(THINKING_TOGGLE_STORAGE_KEY))
  const searchBackend = localStorage.getItem(SEARCH_BACKEND_STORAGE_KEY)

  // Academic search selections should NOT be persisted.
  // Keep compatibility by clearing any legacy saved values.
  if (localStorage.getItem(SEARCH_TOOLS_STORAGE_KEY) != null) {
    localStorage.removeItem(SEARCH_TOOLS_STORAGE_KEY)
  }

  return {
    searchEnabled,
    thinkingEnabled,
    searchBackend,
    searchTools: [],
  }
}

export const persistThinkingPreference = enabled => {
  localStorage.setItem(THINKING_TOGGLE_STORAGE_KEY, String(Boolean(enabled)))
}

export const persistSearchEnabledPreference = enabled => {
  localStorage.setItem(SEARCH_TOGGLE_STORAGE_KEY, String(Boolean(enabled)))
}

export const persistSearchBackendPreference = backend => {
  if (backend) {
    localStorage.setItem(SEARCH_BACKEND_STORAGE_KEY, String(backend))
  } else {
    localStorage.removeItem(SEARCH_BACKEND_STORAGE_KEY)
  }
}

export const persistSearchToolsPreference = tools => {
  // Academic search selections should NOT be persisted.
  // Always clear legacy storage instead of writing new values.
  void tools
  localStorage.removeItem(SEARCH_TOOLS_STORAGE_KEY)
}
