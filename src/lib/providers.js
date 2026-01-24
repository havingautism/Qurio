import { createBackendProvider } from './backendProviderForBackend'
import {
  GLM_BASE_URL,
  MODELSCOPE_BASE_URL,
  NVIDIA_BASE_URL,
  SILICONFLOW_BASE_URL,
  MINIMAX_BASE_URL,
} from './providerConstants'
import { getPublicEnv } from './publicEnv'
import { createSearchToolDefinition, DEFAULT_SEARCH_TOOL_ID } from './searchTools'

/**
 * Provider Registry
 *
 * Centralizes configuration and adaptation logic for different API providers.
 * Each provider implements a standard interface for credentials and capabilities.
 */
/**
 * Default message parser (handles <thought> tags)
 */
const extractText = value => {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map(part => {
        if (typeof part === 'string') return part
        if (part?.type === 'text' && part.text) return part.text
        if (part?.text) return part.text
        return ''
      })
      .join('')
  }
  if (value && typeof value === 'object' && Array.isArray(value.parts)) {
    return value.parts.map(p => (typeof p === 'string' ? p : p?.text || '')).join('')
  }
  return value ? String(value) : ''
}

const defaultParseMessage = input => {
  const hasExplicitThought =
    input &&
    typeof input === 'object' &&
    (Object.prototype.hasOwnProperty.call(input, 'thought') ||
      Object.prototype.hasOwnProperty.call(input, 'thinking_process') ||
      Object.prototype.hasOwnProperty.call(input, 'thinkingProcess') ||
      Object.prototype.hasOwnProperty.call(input, 'reasoning_content'))

  let thought = null
  let rawContent = ''

  if (hasExplicitThought) {
    const thoughtField =
      input.thought ??
      input.thinking_process ??
      input.thinkingProcess ??
      input?.thought ??
      input?.reasoning_content
    thought = extractText(thoughtField) || null
    rawContent = extractText(input.content || '')
  } else {
    rawContent = typeof input === 'string' ? input : extractText(input?.content ?? input)
  }

  // Support both <thought> and <think> tags
  const thoughtMatch = /<(thought|think)>([\s\S]*?)(?:<\/\1>|$)/i.exec(rawContent)
  if (thoughtMatch) {
    const extractedThought = thoughtMatch[2]
    // Clean content of the first found tag block
    const cleanedContent = rawContent.replace(/<(thought|think)>[\s\S]*?(?:<\/\1>|$)/i, '').trim()

    return {
      thought: thought ? `${thought}\n\n${extractedThought}`.trim() : extractedThought,
      content: cleanedContent,
    }
  }

  return { content: rawContent, thought }
}

const normalizeMarkdownSpacing = text => {
  if (!text || typeof text !== 'string') return text
  let normalized = text
  normalized = normalized.replace(/([^\n])(\s*#{1,6}\s+)/g, '$1\n$2')
  normalized = normalized.replace(/([^\n])(\s*[-*+]\s+)/g, '$1\n$2')
  normalized = normalized.replace(/([^\n])(\s*\d+\.\s+)/g, '$1\n$2')
  normalized = normalized.replace(/([^\n])(\s*```)/g, '$1\n$2')
  normalized = normalized.replace(/```(\w+)?(?!\n)/g, '```$1\n')
  normalized = normalized.replace(/([^\n])(\s*\|[-:\s]+\|)/g, '$1\n$2')
  normalized = normalized.replace(/([^\n])(\s*\|[^|\n]+?\|)/g, '$1\n$2')
  return normalized
}

export const TOOL_DISPLAY_NAMES = {
  Tavily_web_search: 'Web Search',
  Tavily_academic_search: 'Academic Search',
}

const resolveSearchTools = (isSearchActive, searchTool) => {
  if (!isSearchActive) return undefined
  const toolIds = Array.isArray(searchTool) ? searchTool : [searchTool]
  const resolved = toolIds.filter(Boolean).map(id => createSearchToolDefinition(id))
  return resolved.length > 0 ? resolved : undefined
}

export const PROVIDERS = {
  openai_compatibility: {
    ...createBackendProvider('openai_compatibility'),
    id: 'openai_compatibility',
    name: 'OpenAI Compatible',
    getCredentials: settings => ({
      apiKey: settings.OpenAICompatibilityKey,
      baseUrl: settings.OpenAICompatibilityUrl,
    }),
    getTools: (isSearchActive, searchTool) => resolveSearchTools(isSearchActive, searchTool),
    getThinking: isThinkingActive =>
      isThinkingActive
        ? {
            extra_body: {
              google: {
                thinking_config: {
                  thinking_budget: 1024,
                  include_thoughts: true,
                },
              },
            },
          }
        : undefined,
    parseMessage: defaultParseMessage,
  },
  siliconflow: {
    ...createBackendProvider('siliconflow'),
    id: 'siliconflow',
    name: 'SiliconFlow',
    getCredentials: settings => ({
      apiKey: settings.SiliconFlowKey,
      baseUrl: SILICONFLOW_BASE_URL,
    }),
    getTools: (isSearchActive, searchTool) => resolveSearchTools(isSearchActive, searchTool),
    getThinking: isThinkingActive =>
      isThinkingActive
        ? {
            budget_tokens: 1024,
          }
        : undefined,
    parseMessage: defaultParseMessage,
  },
  gemini: {
    ...createBackendProvider('gemini'),
    id: 'gemini',
    name: 'Google Gemini',
    getCredentials: settings => ({
      apiKey: settings.googleApiKey || getPublicEnv('PUBLIC_GOOGLE_API_KEY'),
      baseUrl: undefined, // Native SDK usually handles its own endpoints
    }),
    getTools: (isSearchActive, searchTool) => resolveSearchTools(isSearchActive, searchTool),
    // GLM requires explicit { type: "disabled" } to suppress thinking content
    getThinking: isThinkingActive => ({
      type: isThinkingActive ? 'enabled' : 'disabled',
    }),
    parseMessage: defaultParseMessage,
  },
  glm: {
    ...createBackendProvider('glm'),
    id: 'glm',
    name: 'GLM (Zhipu AI)',
    getCredentials: settings => ({
      apiKey: settings.GLMKey || getPublicEnv('PUBLIC_GLM_API_KEY'),
      baseUrl: GLM_BASE_URL,
    }),
    getTools: (isSearchActive, searchTool) => resolveSearchTools(isSearchActive, searchTool),
    getThinking: isThinkingActive => ({
      type: isThinkingActive ? 'enabled' : 'disabled',
    }),
    parseMessage: defaultParseMessage,
  },
  modelscope: {
    ...createBackendProvider('modelscope'),
    id: 'modelscope',
    name: 'ModelScope',
    getCredentials: settings => ({
      apiKey: settings.ModelScopeKey || getPublicEnv('PUBLIC_MODELSCOPE_API_KEY'),
      baseUrl: MODELSCOPE_BASE_URL,
    }),
    getTools: (isSearchActive, searchTool) => resolveSearchTools(isSearchActive, searchTool),
    getThinking: isThinkingActive =>
      isThinkingActive
        ? {
            budget_tokens: 1024,
          }
        : undefined,
    parseMessage: defaultParseMessage,
    // parseMessage: input => {
    //   const parsed = defaultParseMessage(input)
    //   return { ...parsed, content: normalizeMarkdownSpacing(parsed.content) }
    // },
  },
  kimi: {
    ...createBackendProvider('kimi'),
    id: 'kimi',
    name: 'Moonshot AI',
    getCredentials: settings => ({
      apiKey: settings.KimiKey || getPublicEnv('PUBLIC_KIMI_API_KEY'),
      baseUrl: getPublicEnv('PUBLIC_KIMI_BASE_URL'),
    }),
    getTools: (isSearchActive, searchTool) => resolveSearchTools(isSearchActive, searchTool),
    getThinking: (isThinkingActive, modelName) => {
      if (shouldOmitThinkingParam(modelName)) return undefined
      return isThinkingActive
        ? {
            // Kimi k2-thinking model uses reasoning_content field
            // Set max_tokens >= 16000 and temperature = 1.0 for best performance
            max_tokens: 16000,
            temperature: 1.0,
          }
        : undefined
    },
    parseMessage: defaultParseMessage,
  },
  nvidia: {
    ...createBackendProvider('nvidia'),
    id: 'nvidia',
    name: 'NVIDIA NIM',
    getCredentials: settings => ({
      apiKey: settings.NvidiaKey,
      baseUrl: NVIDIA_BASE_URL,
    }),
    getTools: (isSearchActive, searchTool) => resolveSearchTools(isSearchActive, searchTool),
    getThinking: (isThinkingActive, modelName) =>
      shouldOmitThinkingParam(modelName) ? undefined : isThinkingActive ? true : undefined,
    parseMessage: defaultParseMessage,
  },
  minimax: {
    ...createBackendProvider('minimax'),
    id: 'minimax',
    name: 'MiniMax',
    getCredentials: settings => ({
      apiKey: settings.MinimaxKey,
      baseUrl: MINIMAX_BASE_URL,
    }),
    getTools: (isSearchActive, searchTool) => resolveSearchTools(isSearchActive, searchTool),
    getThinking: (isThinkingActive, modelName) => {
      if (shouldOmitThinkingParam(modelName)) return undefined
      return isThinkingActive
        ? {
            // MiniMax uses reasoning_split to separate thinking content
            extra_body: {
              reasoning_split: true,
            },
          }
        : undefined
    },
    parseMessage: defaultParseMessage,
  },
}

/**
 * Get the provider adapter by name.
 * Defaults to 'gemini' if not found.
 *
 * @param {string} providerName
 * @returns {Object} Provider adapter
 */
export const getProvider = providerName => {
  return PROVIDERS[providerName] || PROVIDERS.gemini
}

/**
 * Check if a provider supports search functionality.
 * Determined by whether getTools returns a non-empty array when search is active.
 *
 * @param {string} providerName
 * @returns {boolean} True if search is supported
 */
export const providerSupportsSearch = providerName => {
  const provider = getProvider(providerName)
  if (!provider || !provider.getTools) return false
  const tools = provider.getTools(true, DEFAULT_SEARCH_TOOL_ID)
  return tools && tools.length > 0
}

const THINKING_MODEL_RULES = [
  {
    keywords: ['kimi', 'thinking'],
    isLocked: true,
    isThinkingActive: true,
    omitThinkingParam: true,
  },
  {
    keywords: ['minimax', 'm2'],
    isLocked: true,
    isThinkingActive: true,
    omitThinkingParam: true,
  },
]

const matchesKeywords = (modelName, keywords) => {
  const normalizedModel = String(modelName || '').toLowerCase()
  if (!normalizedModel) return false
  return (keywords || []).every(keyword => normalizedModel.includes(keyword))
}

const shouldOmitThinkingParam = modelName => {
  return THINKING_MODEL_RULES.some(
    rule => rule.omitThinkingParam && matchesKeywords(modelName, rule.keywords),
  )
}

export const resolveThinkingToggleRule = (providerName, modelName) => {
  for (const rule of THINKING_MODEL_RULES) {
    if (matchesKeywords(modelName, rule.keywords)) {
      return { isLocked: rule.isLocked, isThinkingActive: rule.isThinkingActive }
    }
  }
  return { isLocked: false, isThinkingActive: false }
}
