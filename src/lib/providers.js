import { createBackendProvider } from './backendProvider'
import { GLM_BASE_URL, SILICONFLOW_BASE_URL, KIMI_BASE_URL } from './providerConstants'
import { getPublicEnv } from './publicEnv'

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

  if (hasExplicitThought) {
    const thoughtField =
      input.thought ??
      input.thinking_process ??
      input.thinkingProcess ??
      input?.thought ??
      input?.reasoning_content
    const thoughtText = extractText(thoughtField)
    const rawContent = extractText(input.content || '')
    return {
      thought: thoughtText || null,
      content: rawContent.replace(/<thought>[\s\S]*?(?:<\/thought>|$)/, '').trim(),
    }
  }

  const rawContent = typeof input === 'string' ? input : extractText(input?.content ?? input)

  const thoughtMatch = /<thought>([\s\S]*?)(?:<\/thought>|$)/.exec(rawContent)
  if (thoughtMatch) {
    return {
      thought: thoughtMatch[1],
      content: rawContent.replace(/<thought>[\s\S]*?(?:<\/thought>|$)/, '').trim(),
    }
  }

  return { content: rawContent, thought: null }
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
    getTools: isSearchActive =>
      isSearchActive
        ? [
            {
              type: 'function',
              function: {
                name: 'google_search',
                description: 'Search the web',
                parameters: { type: 'object', properties: { query: { type: 'string' } } },
              },
            },
          ]
        : undefined, //abandoned
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
    getTools: () => undefined,
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
    getTools: isSearchActive => {
      let toolList = []
      if (isSearchActive) {
        toolList.push({ googleSearch: {} })
      }
      return toolList
    }, // Native Gemini Google Search tool
    getThinking: (isThinkingActive, model) => {
      if (!isThinkingActive) return undefined
      const isGemini3Preview = model === 'gemini-3-pro-preview'
      return {
        thinkingConfig: isGemini3Preview
          ? { includeThoughts: true, thinkingLevel: 'high' }
          : { includeThoughts: true, thinkingBudget: 1024 },
      }
    }, // Native Gemini thinking config
    parseMessage: defaultParseMessage,
  },
  glm: {
    ...createBackendProvider('glm'),
    id: 'glm',
    name: 'GLM (Zhipu AI)',
    getCredentials: settings => ({
      apiKey: settings.GlmKey || getPublicEnv('PUBLIC_GLM_API_KEY'),
      baseUrl: GLM_BASE_URL,
    }),
    getTools: isSearchActive =>
      isSearchActive
        ? [
            {
              type: 'web_search',
              web_search: {
                enable: true,
                search_result: true,
                // Add search_prompt to guide GLM to include citation markers
                // search_prompt:
                //   'When answering, mark the resources you have cited. If it is an academic article, use the format [a][b][c]; if it is a web resource (not an academic article), use the format [1][2][3]. Do not fabricate resources. Use the actual referenced resources as the basis.',
              },
            },
          ]
        : undefined,
    // GLM requires explicit { type: "disabled" } to suppress thinking content
    getThinking: isThinkingActive => ({
      type: isThinkingActive ? 'enabled' : 'disabled',
    }),
    parseMessage: defaultParseMessage,
  },
  kimi: {
    ...createBackendProvider('kimi'),
    id: 'kimi',
    name: 'Kimi (Moonshot AI)',
    getCredentials: settings => ({
      apiKey: settings.KimiKey || getPublicEnv('PUBLIC_KIMI_API_KEY'),
      baseUrl: KIMI_BASE_URL,
    }),
    getTools: isSearchActive =>
      isSearchActive
        ? [
            {
              type: 'function',
              function: {
                name: 'web_search',
                description: 'Search the web for current information using Kimi web search tool',
                parameters: {
                  type: 'object',
                  properties: {
                    query: {
                      type: 'string',
                      description: 'The search query string',
                    },
                  },
                  required: ['query'],
                },
              },
            },
          ]
        : undefined,
    getThinking: isThinkingActive =>
      isThinkingActive
        ? {
            // Kimi k2-thinking model uses reasoning_content field
            // Set max_tokens >= 16000 and temperature = 1.0 for best performance
            max_tokens: 16000,
            temperature: 1.0,
          }
        : undefined,
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
