import { TOOL_TRANSLATION_KEYS } from './toolConstants'

export const DEFAULT_SEARCH_TOOL_ID = 'web_search'

const FALLBACK_SEARCH_TOOL_OPTIONS = [
  { id: DEFAULT_SEARCH_TOOL_ID, labelKey: 'tools.ddgWebSearch' },
  { id: 'search_news', labelKey: 'tools.ddgNewsSearch' },
]

const SEARCH_TOOL_DENYLIST = new Set([
  'Tavily_web_search',
  'Tavily_academic_search',
  'web_search_with_tavily',
  'extract_url_content',
  'read_arxiv_papers',
])

const QUICK_SEARCH_TOOL_ALLOWLIST = new Set([
  'web_search',
  'search_news',
  'search_arxiv_and_return_articles',
  'search_wikipedia',
])

let searchToolRegistry = new Map()

const normalizeToolId = tool => String(tool?.id || tool?.name || '').trim()

export const isQuickSearchTool = tool => {
  if (!tool) return false
  const id = normalizeToolId(tool)
  if (SEARCH_TOOL_DENYLIST.has(id) || SEARCH_TOOL_DENYLIST.has(tool.name)) return false
  return (
    tool.category === 'search' ||
    QUICK_SEARCH_TOOL_ALLOWLIST.has(id) ||
    QUICK_SEARCH_TOOL_ALLOWLIST.has(tool.name)
  )
}

export const TAVILY_TOOL_IDS = new Set([
  'Tavily_web_search',
  'Tavily_academic_search',
  'web_search_with_tavily',
  'extract_url_content',
])

export const SEARCH_BACKEND_OPTIONS = [
  { id: 'auto', labelKey: 'searchBackends.auto' },
  { id: 'duckduckgo', labelKey: 'searchBackends.duckduckgo' },
  { id: 'google', labelKey: 'searchBackends.google' },
  { id: 'bing', labelKey: 'searchBackends.bing' },
  { id: 'brave', labelKey: 'searchBackends.brave' },
  { id: 'yandex', labelKey: 'searchBackends.yandex' },
  { id: 'yahoo', labelKey: 'searchBackends.yahoo' },
]

export const ACADEMIC_SEARCH_TOOL_OPTIONS = [
  { id: 'search_arxiv_and_return_articles', labelKey: 'tools.arxivSearch' },
  { id: 'search_wikipedia', labelKey: 'tools.wikipediaSearch' },
]

export const setSearchToolRegistry = tools => {
  searchToolRegistry = new Map()
  ;(tools || [])
    .filter(isQuickSearchTool)
    .forEach(tool => {
      const id = normalizeToolId(tool)
      if (!id) return
      searchToolRegistry.set(id, tool)
      if (tool.name && tool.name !== id) {
        searchToolRegistry.set(String(tool.name), tool)
      }
    })
}

export const getSearchToolOptions = () => {
  const options = []
  const seen = new Set()
  for (const [id, tool] of searchToolRegistry.entries()) {
    if (!id || seen.has(id)) continue
    const labelKey = TOOL_TRANSLATION_KEYS[tool.name] || TOOL_TRANSLATION_KEYS[tool.id]
    options.push({ id, labelKey: labelKey || tool.name || id })
    seen.add(id)
  }
  return options.length > 0 ? options : FALLBACK_SEARCH_TOOL_OPTIONS
}

export const getDefaultSearchToolId = () => {
  const options = getSearchToolOptions()
  return options[0]?.id || DEFAULT_SEARCH_TOOL_ID
}

export const createSearchToolDefinition = toolId => {
  const resolvedId = String(toolId || '').trim() || DEFAULT_SEARCH_TOOL_ID
  let tool = searchToolRegistry.get(resolvedId)
  if (!tool) {
    const fallbackId = getDefaultSearchToolId()
    tool = searchToolRegistry.get(fallbackId)
  }
  const name = tool?.name || resolvedId
  return {
    type: 'function',
    function: {
      name,
      description: tool?.description || 'Search the web for current information.',
      parameters:
        tool?.parameters || {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query.' },
          },
          required: ['query'],
        },
    },
  }
}
