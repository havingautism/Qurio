export const THINKING_TOGGLE_STORAGE_KEY = 'qurio:toggle:thinking'
export const THINKING_MODE_STORAGE_KEY = 'qurio:toggle:thinkingMode'
export const SEARCH_TOGGLE_STORAGE_KEY = 'qurio:toggle:search'
export const SEARCH_BACKEND_STORAGE_KEY = 'qurio:toggle:searchBackend'
export const SEARCH_TOOLS_STORAGE_KEY = 'qurio:toggle:searchTools'
const PERSISTED_EXA_SEARCH_TOOL_IDS = new Set([
  'auto',
  'company',
  'research paper',
  'news',
  'pdf',
  'github',
])

export const parseStoredBoolean = value => {
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

export const loadTogglePreferences = () => {
  const searchEnabled = parseStoredBoolean(localStorage.getItem(SEARCH_TOGGLE_STORAGE_KEY))
  const thinkingEnabled = parseStoredBoolean(localStorage.getItem(THINKING_TOGGLE_STORAGE_KEY))
  const thinkingModeRaw = (localStorage.getItem(THINKING_MODE_STORAGE_KEY) || '').trim()
  const thinkingMode =
    thinkingModeRaw === 'smart' || thinkingModeRaw === 'deep' || thinkingModeRaw === 'fast'
      ? thinkingModeRaw
      : null
  const searchBackend = localStorage.getItem(SEARCH_BACKEND_STORAGE_KEY)
  const storedSearchTools = (() => {
    try {
      const raw = localStorage.getItem(SEARCH_TOOLS_STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed
        .map(item => String(item || '').trim())
        .filter(item => PERSISTED_EXA_SEARCH_TOOL_IDS.has(item))
    } catch {
      localStorage.removeItem(SEARCH_TOOLS_STORAGE_KEY)
      return []
    }
  })()

  return {
    searchEnabled,
    thinkingEnabled,
    thinkingMode,
    searchBackend,
    searchTools: storedSearchTools,
  }
}

export const persistThinkingPreference = enabled => {
  localStorage.setItem(THINKING_TOGGLE_STORAGE_KEY, String(Boolean(enabled)))
}

export const persistThinkingModePreference = mode => {
  const normalized = String(mode || '').trim()
  if (normalized === 'smart' || normalized === 'deep' || normalized === 'fast') {
    localStorage.setItem(THINKING_MODE_STORAGE_KEY, normalized)
  } else {
    localStorage.removeItem(THINKING_MODE_STORAGE_KEY)
  }
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
  const exaTools = Array.isArray(tools)
    ? tools
        .map(item => String(item || '').trim())
        .filter(item => PERSISTED_EXA_SEARCH_TOOL_IDS.has(item))
    : []
  if (exaTools.length > 0) {
    localStorage.setItem(SEARCH_TOOLS_STORAGE_KEY, JSON.stringify(exaTools))
  } else {
    localStorage.removeItem(SEARCH_TOOLS_STORAGE_KEY)
  }
}
