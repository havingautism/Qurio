/**
 * Backend Provider Module
 * Provides unified interface for multiple AI model providers including OpenAI, SiliconFlow, and Google Gemini.
 * Supports streaming, tool calling, thinking mode, and various provider-specific features.
 */

import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { getPublicEnv } from './publicEnv'
// import { DynamicRetrievalMode } from '@google/generative-ai'

// Default base URLs for different providers
const OPENAI_DEFAULT_BASE = 'https://api.openai.com/v1'
const SILICONFLOW_BASE = 'https://api.siliconflow.cn/v1'
const GLM_BASE = getPublicEnv('PUBLIC_GLM_BASE_URL') || 'https://open.bigmodel.cn/api/paas/v4'
const MODELSCOPE_BASE =
  getPublicEnv('PUBLIC_MODELSCOPE_BASE_URL') || 'https://api-inference.modelscope.cn/v1'
const KIMI_BASE = getPublicEnv('PUBLIC_KIMI_BASE_URL') || 'https://api.moonshot.cn/v1'

const resolveAbsoluteBase = baseUrl => {
  if (!baseUrl || typeof baseUrl !== 'string') return baseUrl
  if (baseUrl.startsWith('/')) {
    const origin = typeof window !== 'undefined' ? window.location?.origin : ''
    return origin ? `${origin}${baseUrl}` : baseUrl
  }
  return baseUrl
}
/**
 * Normalizes text content from various formats into a plain string.
 * Handles strings, arrays of parts, and objects with parts property.
 * @param {*} content - The content to normalize (string, array, or object)
 * @returns {string} - Normalized text content
 */
const normalizeTextContent = content => {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part
        if (part?.type === 'text' && part.text) return part.text
        if (part?.text) return part.text
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (content && typeof content === 'object' && Array.isArray(content.parts)) {
    return content.parts.map(p => (typeof p === 'string' ? p : p?.text || '')).join('\n')
  }
  return content ? String(content) : ''
}

/**
 * Builds a payload for Google Gemini API requests.
 * Separates system instructions from conversation contents and applies generation config.
 * @param {Object} params - Parameters including messages, temperature, top_k, top_p, tools, and thinking config
 * @returns {Object} - Gemini API payload object
 */
const normalizeGeminiTools = tools => {
  if (Array.isArray(tools)) return tools

  return []
}

const buildGeminiPayload = ({ messages, temperature, top_k, top_p, tools, thinking }) => {
  const systemTexts = (messages || [])
    .filter(m => m.role === 'system')
    .map(m => normalizeTextContent(m.content))
    .filter(Boolean)
  const systemInstruction = systemTexts.length
    ? { parts: [{ text: systemTexts.join('\n') }] }
    : undefined

  const contents = (messages || [])
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' || m.role === 'ai' ? 'model' : 'user',
      parts: [{ text: normalizeTextContent(m.content) }],
    }))

  const generationConfig = {}
  if (temperature !== undefined) generationConfig.temperature = temperature
  if (top_k !== undefined) generationConfig.topK = top_k
  if (top_p !== undefined) generationConfig.topP = top_p
  if (thinking?.thinkingConfig) {
    generationConfig.thinkingConfig = thinking.thinkingConfig
  }

  const payload = { contents }
  if (systemInstruction) payload.systemInstruction = systemInstruction
  if (Object.keys(generationConfig).length) payload.generationConfig = generationConfig
  const normalizedTools = normalizeGeminiTools(tools)
  if (normalizedTools.length) payload.tools = normalizedTools
  return payload
}

/**
 * Normalizes message parts into a format suitable for the current provider.
 * Converts various part types (text, image_url, quote) into standardized format.
 * @param {*} content - The content to normalize
 * @returns {string|Array} - Normalized parts (string if single text part, otherwise array)
 */
const normalizeParts = content => {
  if (!Array.isArray(content)) return content

  const parts = content
    .map(part => {
      if (typeof part === 'string') return { type: 'text', text: part }
      if (part?.type === 'text' && part.text) return { type: 'text', text: part.text }
      if (part?.type === 'quote' && part.text) return { type: 'text', text: part.text }
      if (part?.type === 'image_url') {
        const url = part.image_url?.url || part.url
        if (!url) return null
        return { type: 'image_url', image_url: { url } }
      }
      if (part?.text) return { type: 'text', text: part.text }
      return null
    })
    .filter(Boolean)

  if (parts.length === 1 && parts[0].type === 'text') {
    return parts[0].text
  }
  return parts
}

/**
 * Applies a context limit to messages by keeping only the most recent non-system messages.
 * All system messages are always preserved.
 * @param {Array} messages - Array of messages to limit
 * @param {number|string} limit - Maximum number of non-system messages to keep
 * @returns {Array} - Trimmed messages array
 */
const applyContextLimitRaw = (messages, limit) => {
  const numericLimit = parseInt(limit, 10)
  if (!Array.isArray(messages) || !numericLimit || numericLimit < 1) return messages

  const systemMessages = messages.filter(m => m?.role === 'system')
  const nonSystemMessages = messages.filter(m => m?.role !== 'system')
  const trimmedNonSystem = nonSystemMessages.slice(-numericLimit)

  return [...systemMessages, ...trimmedNonSystem]
}

/**
 * Converts internal message format to LangChain message format.
 * Handles system, assistant (ai), tool, and human (user) message types.
 * @param {Array} messages - Array of internal messages
 * @returns {Array} - Array of LangChain message instances
 */
const toLangChainMessages = messages => {
  return (messages || []).map(message => {
    const role = message.role === 'ai' ? 'assistant' : message.role
    const content = normalizeParts(message.content)

    if (role === 'system') return new SystemMessage(content)
    if (role === 'assistant') {
      const additional_kwargs = message.tool_calls ? { tool_calls: message.tool_calls } : undefined
      return new AIMessage({ content, additional_kwargs })
    }
    if (role === 'tool') {
      return new ToolMessage({ content, tool_call_id: message.tool_call_id })
    }
    return new HumanMessage(content)
  })
}

// const mapMessagesForOpenAI = messages =>
//   (messages || []).map(message => ({
//     role: message.role === 'ai' ? 'assistant' : message.role,
//     content: message.content,
//     ...(message.tool_calls && { tool_calls: message.tool_calls }),
//     ...(message.tool_call_id && { tool_call_id: message.tool_call_id }),
//     ...(message.name && { name: message.name }),
//   }))

/**
 * Creates a handler function for parsing tagged text blocks (think/thought tags).
 * Separates regular text from thought content based on XML-like tags.
 * @param {Object} params - Object containing emitText and emitThought callbacks
 * @param {Function} params.emitText - Callback for regular text content
 * @param {Function} params.emitThought - Callback for thought content
 * @returns {Function} - Handler function that processes tagged text
 */
const handleTaggedTextFactory = ({ emitText, emitThought }) => {
  let inThoughtBlock = false
  return text => {
    let remaining = text
    while (remaining) {
      if (!inThoughtBlock) {
        const matchIndex = remaining.search(/<think>|<thought>/i)
        if (matchIndex === -1) {
          emitText(remaining)
          return
        }
        emitText(remaining.slice(0, matchIndex))
        remaining = remaining.slice(matchIndex)
        const openMatch = remaining.match(/^<(think|thought)>/i)
        if (openMatch) {
          remaining = remaining.slice(openMatch[0].length)
          inThoughtBlock = true
        } else {
          emitText(remaining)
          return
        }
      } else {
        const matchIndex = remaining.search(/<\/think>|<\/thought>/i)
        if (matchIndex === -1) {
          emitThought(remaining)
          return
        }
        emitThought(remaining.slice(0, matchIndex))
        remaining = remaining.slice(matchIndex)
        const closeMatch = remaining.match(/^<\/(think|thought)>/i)
        if (closeMatch) {
          remaining = remaining.slice(closeMatch[0].length)
          inThoughtBlock = false
        } else {
          emitThought(remaining)
          return
        }
      }
    }
  }
}

/**
 * Parses Gemini response parts, extracting text and thought content.
 * Handles parts marked with the 'thought' property separately.
 * @param {Array} parts - Array of Gemini response parts
 * @param {Object} handlers - Object containing emitText, emitThought, and handleTaggedText callbacks
 * @returns {boolean} - True if any text was processed, false otherwise
 */
const parseGeminiParts = (parts, { emitText, emitThought, handleTaggedText }) => {
  if (!Array.isArray(parts)) return false
  let sawAny = false
  for (const part of parts) {
    const text = typeof part?.text === 'string' ? part.text : ''
    if (!text) continue
    sawAny = true
    if (part?.thought) {
      emitThought(text)
    } else {
      handleTaggedText(text)
    }
  }
  return sawAny
}

/**
 * Normalizes related questions from various response formats.
 * Handles arrays, objects with different property names, and malformed data.
 * @param {*} payload - The payload containing related questions
 * @returns {Array<string>} - Array of sanitized question strings
 */
const normalizeRelatedQuestions = payload => {
  const sanitize = arr =>
    (arr || [])
      .map(q => {
        if (typeof q === 'string') return q.trim()
        if (q === null || q === undefined) return ''
        try {
          return String(q).trim()
        } catch {
          return ''
        }
      })
      .filter(Boolean)

  if (Array.isArray(payload)) return sanitize(payload)
  if (payload && typeof payload === 'object') {
    const candidates = [
      payload.questions,
      payload.follow_up_questions,
      payload.followUpQuestions,
      payload.followups,
      payload.followUps,
    ]
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return sanitize(candidate)
    }
    const firstArray = Object.values(payload).find(v => Array.isArray(v))
    if (firstArray) return sanitize(firstArray)
  }
  return []
}

/**
 * Normalizes Gemini messages by ensuring system messages come first.
 * Gemini requires system messages to precede other message types.
 * @param {Array} messages - Array of messages to normalize
 * @returns {Array} - Ordered messages array with system messages first
 */
const normalizeGeminiMessages = messages => {
  if (!Array.isArray(messages) || messages.length === 0) return messages
  const systemMessages = messages.filter(m => m?.role === 'system')
  const nonSystemMessages = messages.filter(m => m?.role !== 'system')
  if (systemMessages.length === 0) return messages
  return [...systemMessages, ...nonSystemMessages]
}

/**
 * Collects source information from Gemini grounding metadata.
 * Extracts URLs and titles from grounding chunks.
 * @param {Object} metadata - Gemini grounding metadata containing chunks
 * @param {Array} sourcesList - Array to store collected sources in chunk order
 */
const collectGeminiSources = (metadata, sourcesList) => {
  const chunks = metadata?.groundingChunks
  if (!Array.isArray(chunks)) return
  if (!Array.isArray(sourcesList)) return
  if (sourcesList.length === chunks.length && sourcesList.length > 0) return
  sourcesList.length = 0
  for (const chunk of chunks) {
    const web = chunk?.web
    const url = web?.uri
    if (!url) continue
    sourcesList.push({ url, title: web?.title || url })
  }
}

/**
 * Collects source information from GLM web_search results.
 * Extracts refer ID, title, URL, and content snippet from search results.
 * @param {Array} webSearchResults - Array of web search result objects from GLM
 * @param {Map} sourceMap - Map to store collected sources (refer -> {id, title, url, snippet})
 */
const collectGLMSources = (webSearchResults, sourceMap) => {
  if (!Array.isArray(webSearchResults)) return
  for (const result of webSearchResults) {
    const refer = result?.refer
    if (!refer || sourceMap.has(refer)) continue
    sourceMap.set(refer, {
      id: refer,
      title: result?.title || refer,
      url: result?.link || '',
      snippet: result?.content?.substring(0, 200) || '',
      icon: result?.icon || '',
      media: result?.media || '',
    })
  }
}

/**
 * Collects source information from Kimi web_search tool results.
 * Extracts title, URL, and snippet from search results returned by web_search tool.
 * @param {string|Object} toolResult - JSON string or object containing web search results from Kimi
 * @param {Map} sourceMap - Map to store collected sources (url -> {id, title, url, snippet})
 */
const collectKimiSources = (toolResult, sourceMap) => {
  if (!toolResult) return
  // Parse JSON if string
  let parsed = typeof toolResult === 'string' ? safeJsonParse(toolResult) : toolResult
  if (!parsed) return

  // Handle different possible response formats from Kimi web_search
  const results =
    parsed?.results || parsed?.data || parsed?.items || (Array.isArray(parsed) ? parsed : [])

  if (!Array.isArray(results)) return

  for (const result of results) {
    const url = result?.url || result?.link || result?.href
    if (!url || sourceMap.has(url)) continue
    sourceMap.set(url, {
      id: String(sourceMap.size + 1),
      title: result?.title || url,
      url: url,
      snippet: result?.snippet || result?.description || result?.content?.substring(0, 200) || '',
    })
  }
}

/**
 * Safely parses JSON from a string, with fallback to extracting JSON objects/arrays.
 * Handles malformed input by attempting to extract the first valid JSON structure.
 * @param {string} text - String to parse as JSON
 * @returns {Object|null} - Parsed object or null if parsing fails
 */
const safeJsonParse = text => {
  if (!text || typeof text !== 'string') return null
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

/**
 * Resolves the base URL for OpenAI-compatible API requests.
 * Handles provider-specific URLs and custom base URLs.
 * @param {string} provider - The provider name (e.g., 'siliconflow', 'openai')
 * @param {string} baseUrl - Custom base URL override
 * @returns {string} - Resolved base URL
 */
const resolveOpenAIBase = (provider, baseUrl) => {
  if (provider === 'siliconflow') return SILICONFLOW_BASE
  return baseUrl || getPublicEnv('PUBLIC_OPENAI_BASE_URL') || OPENAI_DEFAULT_BASE
}

/**
 * Builds a ChatOpenAI model instance for OpenAI-compatible APIs.
 * Handles provider-specific configurations including SiliconFlow, thinking mode, and tools.
 * @param {Object} params - Configuration parameters for the model
 * @returns {ChatOpenAI} - Configured LangChain ChatOpenAI instance
 */
const buildOpenAIModel = ({
  provider,
  apiKey,
  baseUrl,
  model,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  streaming = true,
}) => {
  const resolvedKey = apiKey || getPublicEnv('PUBLIC_OPENAI_API_KEY')
  if (!resolvedKey) {
    throw new Error('Missing API key')
  }
  const resolvedBase = resolveAbsoluteBase(resolveOpenAIBase(provider, baseUrl))

  const modelKwargs = {}
  if (provider === 'siliconflow') {
    if (!responseFormat) {
      modelKwargs.response_format = { type: 'text' }
    }
    if (thinking) {
      const budget = thinking.budget_tokens || thinking.budgetTokens || 1024
      modelKwargs.extra_body = { thinking_budget: budget }
      modelKwargs.enable_thinking = true
      modelKwargs.thinking_budget = budget
    }
    if (top_k !== undefined) {
      modelKwargs.top_k = top_k
    }
  }
  if (tools && tools.length > 0) modelKwargs.tools = tools
  if (toolChoice) modelKwargs.tool_choice = toolChoice
  if (responseFormat && provider !== 'siliconflow') {
    modelKwargs.response_format = responseFormat
  }
  if (thinking?.extra_body) modelKwargs.extra_body = thinking.extra_body
  if (top_k !== undefined && provider !== 'siliconflow') {
    modelKwargs.top_k = top_k
  }
  if (top_p !== undefined) modelKwargs.top_p = top_p
  if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
  if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty
  if (streaming) {
    modelKwargs.stream_options = { include_usage: false }
  }

  let modelInstance = new ChatOpenAI({
    apiKey: resolvedKey,
    openAIApiKey: resolvedKey,
    modelName: model,
    temperature,
    streaming,
    streamUsage: false,
    __includeRawResponse: true,
    modelKwargs,
    configuration: {
      baseURL: resolvedBase,
      dangerouslyAllowBrowser: true,
      defaultHeaders: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    },
  })

  return modelInstance
}

/**
 * Builds a ChatOpenAI model instance specifically for SiliconFlow API.
 * Configures SiliconFlow-specific settings including thinking mode and response format.
 * @param {Object} params - Configuration parameters for the model
 * @returns {ChatOpenAI} - Configured LangChain ChatOpenAI instance for SiliconFlow
 */
const buildSiliconFlowModel = ({
  apiKey,
  model,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  streaming = true,
}) => {
  const resolvedKey = apiKey || getPublicEnv('PUBLIC_SILICONFLOW_API_KEY')
  if (!resolvedKey) {
    throw new Error('Missing API key')
  }
  const resolvedBase = SILICONFLOW_BASE

  const modelKwargs = {}
  modelKwargs.response_format = responseFormat || { type: 'text' }
  if (thinking) {
    const budget = thinking.budget_tokens || thinking.budgetTokens || 1024
    modelKwargs.extra_body = { thinking_budget: budget }
    modelKwargs.enable_thinking = true
    modelKwargs.thinking_budget = budget
  }
  if (top_k !== undefined) {
    modelKwargs.top_k = top_k
  }
  if (top_p !== undefined) modelKwargs.top_p = top_p
  if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
  if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty
  if (tools && tools.length > 0) modelKwargs.tools = tools
  if (toolChoice) modelKwargs.tool_choice = toolChoice
  if (thinking?.extra_body) {
    modelKwargs.extra_body = { ...(modelKwargs.extra_body || {}), ...thinking.extra_body }
  }
  if (streaming) {
    modelKwargs.stream_options = { include_usage: false }
  }

  let modelInstance = new ChatOpenAI({
    apiKey: resolvedKey,
    openAIApiKey: resolvedKey,
    modelName: model,
    temperature,
    streaming,
    streamUsage: false,
    __includeRawResponse: true,
    modelKwargs,
    configuration: {
      baseURL: resolvedBase,
      dangerouslyAllowBrowser: true,
      defaultHeaders: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    },
  })

  // const bindParams = {}
  // if (tools && tools.length > 0) bindParams.tools = tools
  // if (toolChoice) bindParams.tool_choice = toolChoice
  // if (responseFormat) bindParams.response_format = responseFormat
  // if (thinking?.extra_body) bindParams.extra_body = thinking.extra_body
  // if (top_k !== undefined) bindParams.extra_body = { ...(bindParams.extra_body || {}), top_k }

  // if (Object.keys(bindParams).length) {
  //   modelInstance = modelInstance.bind(bindParams)
  // }

  return modelInstance
}

/**
 * Builds a ChatOpenAI model instance specifically for GLM (Zhipu AI) API.
 * Configures GLM-specific settings including thinking mode and response format.
 * @param {Object} params - Configuration parameters for the model
 * @returns {ChatOpenAI} - Configured LangChain ChatOpenAI instance for GLM
 */
const buildGLMModel = ({
  apiKey,
  model,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  streaming = true,
}) => {
  const resolvedKey = apiKey || getPublicEnv('PUBLIC_GLM_API_KEY')
  if (!resolvedKey) {
    throw new Error('Missing API key')
  }
  const resolvedBase = GLM_BASE

  const modelKwargs = {}
  if (responseFormat) {
    modelKwargs.response_format = responseFormat
  }
  // GLM thinking parameter format: { type: "enabled" | "disabled" }
  // GLM API defaults to {"type": "enabled"} when not specified, so we must explicitly set "disabled"
  // for lightweight tasks (title generation, space selection, related questions)
  const thinkingType = thinking?.type || 'disabled'
  modelKwargs.thinking = { type: thinkingType }
  if (top_k !== undefined) {
    modelKwargs.top_k = top_k
  }
  if (top_p !== undefined) modelKwargs.top_p = top_p
  if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
  if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty
  if (tools && tools.length > 0) {
    modelKwargs.tools = tools
  }
  if (toolChoice) modelKwargs.tool_choice = toolChoice
  if (thinking?.type) {
    modelKwargs.extra_body = { thinking: { type: thinkingType } }
  }
  if (streaming) {
    modelKwargs.stream_options = { include_usage: false }
  }
  const origin = window.location.origin

  let modelInstance = new ChatOpenAI({
    apiKey: resolvedKey,
    openAIApiKey: resolvedKey,
    modelName: model,
    temperature,
    streaming,
    streamUsage: false,
    __includeRawResponse: true,
    modelKwargs,
    configuration: {
      baseURL: resolvedBase,
      dangerouslyAllowBrowser: true,
      defaultHeaders: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': ['GET', 'POST', 'OPTIONS'],
        'Access-Control-Allow-Headers': ['Content-Type', 'Authorization', 'X-Requested-With'],
        'Access-Control-Allow-Credentials': true,
      },
    },
  })

  return modelInstance
}

/**
 * Builds a ChatOpenAI model instance for ModelScope using GLM-compatible settings.
 * Configures thinking mode and response format in the same way as GLM.
 * @param {Object} params - Configuration parameters for the model
 * @returns {ChatOpenAI} - Configured LangChain ChatOpenAI instance for ModelScope
 */
const buildModelScopeModel = ({
  apiKey,
  model,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  streaming = true,
}) => {
  const resolvedKey = apiKey || getPublicEnv('PUBLIC_MODELSCOPE_API_KEY')
  if (!resolvedKey) {
    throw new Error('Missing API key')
  }
  const resolvedBase = MODELSCOPE_BASE

  const modelKwargs = {}
  if (responseFormat) {
    modelKwargs.response_format = responseFormat
  }
  const thinkingType = thinking?.type || 'disabled'
  modelKwargs.thinking = { type: thinkingType }
  if (top_k !== undefined) {
    modelKwargs.top_k = top_k
  }
  if (top_p !== undefined) modelKwargs.top_p = top_p
  if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
  if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty
  if (tools && tools.length > 0) {
    modelKwargs.tools = tools
  }
  if (toolChoice) modelKwargs.tool_choice = toolChoice
  if (thinking?.type) {
    modelKwargs.extra_body = { thinking: { type: thinkingType } }
  }
  if (streaming) {
    modelKwargs.stream_options = { include_usage: false }
  }
  const origin = window.location.origin

  let modelInstance = new ChatOpenAI({
    apiKey: resolvedKey,
    openAIApiKey: resolvedKey,
    modelName: model,
    temperature,
    streaming,
    streamUsage: false,
    __includeRawResponse: true,
    modelKwargs,
    configuration: {
      baseURL: resolvedBase,
      dangerouslyAllowBrowser: true,
      defaultHeaders: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': ['GET', 'POST', 'OPTIONS'],
        'Access-Control-Allow-Headers': ['Content-Type', 'Authorization', 'X-Requested-With'],
        'Access-Control-Allow-Credentials': true,
      },
    },
  })

  return modelInstance
}

/**
 * Builds a ChatOpenAI model instance specifically for Kimi (Moonshot AI) API.
 * Configures Kimi-specific settings including thinking mode and tools.
 * @param {Object} params - Configuration parameters for the model
 * @returns {ChatOpenAI} - Configured LangChain ChatOpenAI instance for Kimi
 */
const buildKimiModel = ({
  apiKey,
  model,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  streaming = true,
}) => {
  const resolvedKey = apiKey || getPublicEnv('PUBLIC_KIMI_API_KEY')
  if (!resolvedKey) {
    throw new Error('Missing API key')
  }
  const resolvedBase = resolveAbsoluteBase(KIMI_BASE)

  const modelKwargs = {}
  if (responseFormat) {
    modelKwargs.response_format = responseFormat
  }
  // Kimi k2-thinking model specific settings
  if (thinking?.max_tokens) {
    modelKwargs.max_tokens = thinking.max_tokens
  }
  if (thinking?.temperature) {
    modelKwargs.temperature = thinking.temperature
  }
  if (top_k !== undefined) {
    modelKwargs.top_k = top_k
  }
  if (top_p !== undefined) modelKwargs.top_p = top_p
  if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
  if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty
  if (tools && tools.length > 0) {
    modelKwargs.tools = tools
  }
  if (toolChoice) modelKwargs.tool_choice = toolChoice
  if (streaming) {
    modelKwargs.stream_options = { include_usage: false }
  }

  let modelInstance = new ChatOpenAI({
    apiKey: resolvedKey,
    openAIApiKey: resolvedKey,
    modelName: model,
    temperature,
    streaming,
    streamUsage: false,
    __includeRawResponse: true,
    modelKwargs,
    configuration: {
      baseURL: resolvedBase,
      dangerouslyAllowBrowser: true,
      defaultHeaders: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    },
  })

  return modelInstance
}

/**
 * Builds a ChatGoogleGenerativeAI model instance for Google Gemini API.
 * Configures Gemini-specific settings including search retrieval tools and thinking config.
 * @param {Object} params - Configuration parameters for the model
 * @returns {ChatGoogleGenerativeAI} - Configured LangChain ChatGoogleGenerativeAI instance
 */
const buildGeminiModel = ({
  apiKey,
  model,
  temperature,
  top_k,
  top_p,
  tools,
  thinking,
  streaming,
}) => {
  const resolvedKey = apiKey || getPublicEnv('PUBLIC_GOOGLE_API_KEY')
  if (!resolvedKey) {
    throw new Error('Missing API key')
  }
  console.log(tools)
  const normalizedTools = normalizeGeminiTools(tools)
  const baseModel = new ChatGoogleGenerativeAI({
    apiKey: resolvedKey,
    model,
    temperature,
    topK: top_k,
    ...(top_p !== undefined ? { topP: top_p } : {}),
    streaming,
    ...(thinking?.thinkingConfig && { thinkingConfig: thinking.thinkingConfig }),
  })
  let modelInstance = baseModel
  if (normalizedTools.length) {
    modelInstance = modelInstance.bindTools(normalizedTools)
    if (!modelInstance.client) {
      modelInstance.client = baseModel.client
    }
  }

  return modelInstance
}

/**
 * Updates the tool calls map with streaming tool call chunks.
 * Accumulates function names and arguments across multiple chunks.
 * @param {Map} toolCallsMap - Map storing tool call data indexed by tool call ID
 * @param {Array} toolCalls - Array of tool call chunks from streaming response
 */
const updateToolCallsMap = (toolCallsMap, toolCalls) => {
  if (!Array.isArray(toolCalls)) return
  for (const toolCall of toolCalls) {
    const index = toolCall.index ?? toolCall.id ?? 0
    if (!toolCallsMap.has(index)) {
      toolCallsMap.set(index, {
        id: toolCall.id,
        type: toolCall.type,
        function: { name: '', arguments: '' },
      })
    }
    const currentToolCall = toolCallsMap.get(index)
    if (toolCall.id) currentToolCall.id = toolCall.id
    if (toolCall.type) currentToolCall.type = toolCall.type
    if (toolCall.function?.name) currentToolCall.function.name += toolCall.function.name
    if (toolCall.function?.arguments) {
      currentToolCall.function.arguments += toolCall.function.arguments
    }
  }
}

/*
const streamOpenAICompatRaw = async ({
  provider,
  apiKey,
  baseUrl,
  model,
  messages,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  temperature,
  top_k,
  contextMessageLimit,
  onChunk,
  onFinish,
  onError,
  signal,
}) => {
  const resolvedBase = resolveOpenAIBase(provider, baseUrl)
  const resolvedKey = apiKey || getPublicEnv('PUBLIC_OPENAI_API_KEY')
  if (!resolvedKey) {
    onError?.(new Error('Missing API key'))
    return
  }

  const trimmedMessages = applyContextLimitRaw(messages, contextMessageLimit)
  const payload = {
    model,
    messages: mapMessagesForOpenAI(trimmedMessages),
    stream: true,
    stream_options: { include_usage: false },
  }

  if (temperature !== undefined) payload.temperature = temperature
  if (tools && tools.length > 0) payload.tools = tools
  if (toolChoice) payload.tool_choice = toolChoice
  if (provider === 'siliconflow') {
    payload.response_format = responseFormat || { type: 'text' }
  } else if (responseFormat) {
    payload.response_format = responseFormat
  }

  if (thinking?.extra_body) {
    payload.extra_body = { ...(payload.extra_body || {}), ...thinking.extra_body }
  }
  if (provider === 'siliconflow' && thinking) {
    const budget = thinking.budget_tokens || thinking.budgetTokens
    if (budget) {
      payload.thinking_budget = budget
      payload.enable_thinking = true
    }
  }
  if (top_k !== undefined) {
    if (provider === 'siliconflow') {
      payload.top_k = top_k
    } else {
      payload.extra_body = { ...(payload.extra_body || {}), top_k }
    }
  }

  const upstream = await fetch(`${resolvedBase.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resolvedKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  })

  if (!upstream.ok || !upstream.body) {
    const errorText = await upstream.text().catch(() => '')
    onError?.(new Error(errorText || `Upstream error (${upstream.status})`))
    return
  }

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
    let fullContent = ''
    let fullThought = ''
    const toolCallsMap = new Map()
    const sourcesMap = new Map()
    let groundingSupports = undefined

  const emitText = text => {
    if (!text) return
    fullContent += text
    onChunk?.({ type: 'text', content: text })
  }

  const emitThought = text => {
    if (!text) return
    fullThought += text
    onChunk?.({ type: 'thought', content: text })
  }

  const handleTaggedText = handleTaggedTextFactory({ emitText, emitThought })

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')

      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const chunk = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf('\n\n')

        const lines = chunk.split('\n')
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const payloadText = line.slice(5).trim()
          if (!payloadText) continue
          if (payloadText === '[DONE]') {
            onFinish?.({
              content: fullContent,
              thought: fullThought || undefined,
              toolCalls: toolCallsMap.size ? Array.from(toolCallsMap.values()) : undefined,
            })
            return
          }

          let event
          try {
            event = JSON.parse(payloadText)
          } catch {
            continue
          }
          const choice = event?.choices?.[0]
          const delta = choice?.delta
          const reasoningContent = delta?.reasoning_content || delta?.reasoning
          if (reasoningContent) {
            emitThought(String(reasoningContent))
          }
          if (delta?.content) {
            handleTaggedText(delta.content)
          }
          if (delta?.tool_calls) {
            updateToolCallsMap(toolCallsMap, delta.tool_calls)
          }
        }
      }
    }

    onFinish?.({
      content: fullContent,
      thought: fullThought || undefined,
      toolCalls: toolCallsMap.size ? Array.from(toolCallsMap.values()) : undefined,
    })
  } catch (error) {
    if (signal?.aborted) return
    onError?.(error)
  }
}
*/

/**
 * Streams chat completion responses using LangChain library.
 * Supports multiple providers (OpenAI, SiliconFlow, Gemini) with unified streaming interface.
 * Handles text, thoughts, tool calls, and sources (for Gemini).
 * @param {Object} params - Stream parameters
 * @param {string} params.provider - AI provider ('openai', 'siliconflow', 'gemini')
 * @param {string} params.apiKey - API key for authentication
 * @param {string} params.baseUrl - Custom base URL
 * @param {string} params.model - Model name/ID
 * @param {Array} params.messages - Conversation messages
 * @param {Array} params.tools - Optional tools for function calling
 * @param {string} params.toolChoice - Tool choice strategy
 * @param {Object} params.responseFormat - Response format specification
 * @param {Object} params.thinking - Thinking mode configuration
 * @param {number} params.temperature - Sampling temperature
 * @param {number} params.top_k - Top-k sampling parameter
 * @param {number} params.top_p - Top-p sampling parameter
 * @param {number} params.frequency_penalty - Frequency penalty
 * @param {number} params.presence_penalty - Presence penalty
 * @param {number} params.contextMessageLimit - Maximum context messages
 * @param {Function} params.onChunk - Callback for each chunk
 * @param {Function} params.onFinish - Callback when stream completes
 * @param {Function} params.onError - Callback for errors
 * @param {AbortSignal} params.signal - Abort signal for cancellation
 */
const streamWithLangChain = async ({
  provider,
  apiKey,
  baseUrl,
  model,
  messages,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  contextMessageLimit,
  onChunk,
  stream = true,
  onFinish,
  onError,
  signal,
}) => {
  const trimmedMessages = applyContextLimitRaw(messages, contextMessageLimit)
  const langchainMessages = toLangChainMessages(trimmedMessages)

  let modelInstance = undefined
  if (provider === 'gemini') {
    modelInstance = buildGeminiModel({
      apiKey,
      model,
      temperature,
      top_k,
      top_p,
      tools,
      thinking,
      streaming: stream,
    })
  } else if (provider === 'siliconflow') {
    modelInstance = buildSiliconFlowModel({
      apiKey,
      model,
      temperature,
      top_k,
      top_p,
      frequency_penalty,
      presence_penalty,
      responseFormat,
      tools,
      thinking,
      streaming: stream,
    })
  } else if (provider === 'glm') {
    modelInstance = buildGLMModel({
      apiKey,
      model,
      temperature,
      top_k,
      top_p,
      frequency_penalty,
      presence_penalty,
      tools,
      toolChoice,
      responseFormat,
      thinking,
      streaming: stream,
    })
  } else if (provider === 'modelscope') {
    modelInstance = buildModelScopeModel({
      apiKey,
      model,
      temperature,
      top_k,
      top_p,
      frequency_penalty,
      presence_penalty,
      tools,
      toolChoice,
      responseFormat,
      thinking,
      streaming: stream,
    })
  } else if (provider === 'kimi') {
    modelInstance = buildKimiModel({
      apiKey,
      model,
      temperature,
      top_k,
      top_p,
      frequency_penalty,
      presence_penalty,
      tools,
      toolChoice,
      responseFormat,
      thinking,
      streaming: stream,
    })
  } else {
    modelInstance = buildOpenAIModel({
      provider,
      apiKey,
      baseUrl,
      model,
      temperature,
      top_k,
      top_p,
      frequency_penalty,
      presence_penalty,
      tools,
      toolChoice,
      responseFormat,
      thinking,
      streaming: stream,
    })
  }

  let fullContent = ''
  let fullThought = ''
  const toolCallsMap = new Map()
  const sourcesMap = new Map()
  const geminiSources = []
  let groundingSupports = undefined
  const emitText = text => {
    if (!text) return
    fullContent += text
    onChunk?.({ type: 'text', content: text })
  }

  const emitThought = text => {
    if (!text) return
    fullThought += text
    onChunk?.({ type: 'thought', content: text })
  }

  const handleTaggedText = handleTaggedTextFactory({ emitText, emitThought })

  try {
    if (provider === 'gemini') {
      const payload = buildGeminiPayload({
        messages: trimmedMessages,
        temperature,
        top_k,
        top_p,
        tools,
        thinking,
      })
      const streamResponse = await modelInstance.client.generateContentStream(payload, { signal })
      const stream = streamResponse?.stream || streamResponse

      for await (const response of stream) {
        const groundingMetadata = response?.candidates?.[0]?.groundingMetadata
        if (groundingMetadata) {
          collectGeminiSources(groundingMetadata, geminiSources)
          if (Array.isArray(groundingMetadata.groundingSupports)) {
            groundingSupports = groundingMetadata.groundingSupports
          }
        }
        const parts = response?.candidates?.[0]?.content?.parts || []
        if (!Array.isArray(parts)) continue
        for (const part of parts) {
          const text = typeof part?.text === 'string' ? part.text : ''
          if (!text) continue
          if (part?.thought) {
            emitThought(text)
          } else {
            handleTaggedText(text)
          }
        }
      }

      onFinish?.({
        content: fullContent,
        thought: fullThought || undefined,
        sources: geminiSources.length ? geminiSources : undefined,
        groundingSupports: groundingSupports?.length ? groundingSupports : undefined,
        toolCalls: toolCallsMap.size ? Array.from(toolCallsMap.values()) : undefined,
      })
      return
    }

    const stream = await modelInstance.stream(langchainMessages, signal ? { signal } : undefined)

    for await (const chunk of stream) {
      const messageChunk = chunk?.message ?? chunk
      const contentValue = messageChunk?.content ?? chunk?.content

      // Process GLM web_search results
      if (provider === 'glm' || provider === 'modelscope') {
        const rawResp = messageChunk?.additional_kwargs?.__raw_response
        collectGLMSources(rawResp?.web_search, sourcesMap)
      }

      // Process Kimi web_search tool results
      if (provider === 'kimi') {
        // Kimi returns search results in tool responses
        // Check if this is a tool response message
        const toolResponses = messageChunk?.additional_kwargs?.tool_responses
        if (Array.isArray(toolResponses)) {
          for (const toolResp of toolResponses) {
            if (toolResp?.name === 'web_search') {
              collectKimiSources(toolResp?.output || toolResp?.content, sourcesMap)
            }
          }
        }
      }

      if (provider === 'gemini' && Array.isArray(contentValue)) {
        const parsed = parseGeminiParts(contentValue, {
          emitText,
          emitThought,
          handleTaggedText,
        })
        if (parsed) continue
      }

      const chunkText = normalizeTextContent(contentValue)

      if (chunkText) {
        handleTaggedText(chunkText)
      }

      const toolCalls = messageChunk?.additional_kwargs?.tool_calls
      if (toolCalls) {
        updateToolCallsMap(toolCallsMap, toolCalls)
      }

      const reasoning =
        messageChunk?.additional_kwargs?.__raw_response?.choices?.[0]?.delta?.reasoning_content ||
        messageChunk?.additional_kwargs?.__raw_response?.choices?.[0]?.delta?.reasoning ||
        messageChunk?.additional_kwargs?.reasoning_content ||
        messageChunk?.additional_kwargs?.reasoning

      if (reasoning) {
        emitThought(String(reasoning))
      }
    }

    onFinish?.({
      content: fullContent,
      thought: fullThought || undefined,
      sources: sourcesMap.size ? Array.from(sourcesMap.values()) : undefined,
      toolCalls: toolCallsMap.size ? Array.from(toolCallsMap.values()) : undefined,
    })
  } catch (error) {
    if (signal?.aborted) return
    onError?.(error)
  }
}

/**
 * Makes a non-streaming request to OpenAI-compatible API.
 * Returns the complete response content as a string.
 * @param {Object} params - Request parameters
 * @returns {Promise<string>} - Response content as string
 */
const requestOpenAICompat = async ({
  provider,
  apiKey,
  baseUrl,
  model,
  messages,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  signal,
  stream,
}) => {
  const modelInstance = buildOpenAIModel({
    provider,
    apiKey,
    baseUrl,
    model,
    temperature,
    top_k,
    top_p,
    frequency_penalty,
    presence_penalty,
    tools,
    toolChoice,
    responseFormat,
    thinking,
    streaming: false,
  })

  const langchainMessages = toLangChainMessages(messages || [])
  const response = await modelInstance.invoke(langchainMessages, { signal })

  return typeof response.content === 'string'
    ? response.content
    : normalizeTextContent(response.content)
}

/**
 * Makes a non-streaming request to SiliconFlow API.
 * Returns the complete response content as a string.
 * @param {Object} params - Request parameters
 * @returns {Promise<string>} - Response content as string
 */
const requestSiliconFlow = async ({
  provider,
  apiKey,
  baseUrl,
  model,
  messages,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  signal,
  stream,
}) => {
  const modelInstance = buildSiliconFlowModel({
    provider,
    apiKey,
    baseUrl,
    model,
    temperature,
    top_k,
    top_p,
    frequency_penalty,
    presence_penalty,
    tools,
    toolChoice,
    responseFormat,
    thinking,
    streaming: false,
  })

  const langchainMessages = toLangChainMessages(messages || [])
  const response = await modelInstance.invoke(langchainMessages, { signal })

  return typeof response.content === 'string'
    ? response.content
    : normalizeTextContent(response.content)
}

/**
 * Makes a non-streaming request to Google Gemini API.
 * Returns the complete response content as a string.
 * @param {Object} params - Request parameters
 * @returns {Promise<string>} - Response content as string
 */
const requestGemini = async ({ apiKey, model, messages, temperature, top_k, top_p, signal }) => {
  const modelInstance = buildGeminiModel({
    apiKey,
    model,
    temperature,
    top_k,
    top_p,
    tools: [],
    thinking: false,
    streaming: false,
  })

  const orderedMessages = normalizeGeminiMessages(messages || [])
  const langchainMessages = toLangChainMessages(orderedMessages)
  const response = await modelInstance.invoke(langchainMessages, { signal })

  return typeof response.content === 'string'
    ? response.content
    : normalizeTextContent(response.content)
}

/**
 * Makes a non-streaming request to GLM (Zhipu AI) API.
 * Returns the complete response content as a string.
 * @param {Object} params - Request parameters
 * @returns {Promise<string>} - Response content as string
 */
const requestGLM = async ({
  apiKey,
  model,
  messages,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  signal,
}) => {
  const modelInstance = buildGLMModel({
    apiKey,
    model,
    temperature,
    top_k,
    top_p,
    frequency_penalty,
    presence_penalty,
    tools: [],
    toolChoice,
    responseFormat,
    thinking: {
      type: 'disabled',
    },
    streaming: false,
  })

  const langchainMessages = toLangChainMessages(messages || [])
  const response = await modelInstance.invoke(langchainMessages, { signal })

  return typeof response.content === 'string'
    ? response.content
    : normalizeTextContent(response.content)
}

/**
 * Makes a non-streaming request to ModelScope API.
 * Returns the complete response content as a string.
 * @param {Object} params - Request parameters
 * @returns {Promise<string>} - Response content as string
 */
const requestModelScope = async ({
  apiKey,
  model,
  messages,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  signal,
}) => {
  const modelInstance = buildModelScopeModel({
    apiKey,
    model,
    temperature,
    top_k,
    top_p,
    frequency_penalty,
    presence_penalty,
    tools: [],
    toolChoice,
    responseFormat,
    thinking: {
      type: 'disabled',
    },
    streaming: false,
  })

  const langchainMessages = toLangChainMessages(messages || [])
  const response = await modelInstance.invoke(langchainMessages, { signal })

  return typeof response.content === 'string'
    ? response.content
    : normalizeTextContent(response.content)
}

/**
 * Makes a non-streaming request to Kimi (Moonshot AI) API.
 * Returns the complete response content as a string.
 * @param {Object} params - Request parameters
 * @returns {Promise<string>} - Response content as string
 */
const requestKimi = async ({
  apiKey,
  model,
  messages,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  signal,
}) => {
  const modelInstance = buildKimiModel({
    apiKey,
    model,
    temperature,
    top_k,
    top_p,
    frequency_penalty,
    presence_penalty,
    tools: [],
    toolChoice,
    responseFormat,
    thinking: undefined, // Disable thinking for title generation
    streaming: false,
  })

  const langchainMessages = toLangChainMessages(messages || [])
  const response = await modelInstance.invoke(langchainMessages, { signal })

  return typeof response.content === 'string'
    ? response.content
    : normalizeTextContent(response.content)
}

/**
 * Generates a concise title for a conversation based on the first user message.
 * Uses the specified AI provider to create a title (max 5 words).
 * @param {string} provider - AI provider to use
 * @param {string} firstMessage - The first user message
 * @param {string} apiKey - API key for authentication
 * @param {string} baseUrl - Custom base URL
 * @param {string} model - Model name/ID
 * @returns {Promise<string>} - Generated conversation title
 */
const generateTitle = async (provider, firstMessage, apiKey, baseUrl, model) => {
  const promptMessages = [
    {
      role: 'system',
      content: `## Task
Generate a short, concise title (max 5 words) for this conversation based on the user's first message. Do not use quotes.

## Output
Return only the title text.`,
    },
    { role: 'user', content: firstMessage },
  ]

  let content = undefined
  if (provider === 'gemini') {
    content = await requestGemini({ apiKey, model, messages: promptMessages })
  } else if (provider === 'siliconflow') {
    content = await requestSiliconFlow({
      provider,
      apiKey,
      baseUrl,
      model,
      messages: promptMessages,
    })
  } else if (provider === 'glm') {
    content = await requestGLM({
      apiKey,
      model,
      messages: promptMessages,
    })
  } else if (provider === 'modelscope') {
    content = await requestModelScope({
      apiKey,
      model,
      messages: promptMessages,
    })
  } else if (provider === 'kimi') {
    content = await requestKimi({
      apiKey,
      model,
      messages: promptMessages,
    })
  } else {
    content = await requestOpenAICompat({
      provider,
      apiKey,
      baseUrl,
      model,
      messages: promptMessages,
    })
  }
  return content?.trim?.() || 'New Conversation'
}

/**
 * Generates a structured deep research plan using a lightweight model.
 * Uses a ReAct-inspired JSON schema for downstream execution.
 * @param {string} provider - AI provider to use
 * @param {string} userMessage - The user's current message
 * @param {string} apiKey - API key for authentication
 * @param {string} baseUrl - Custom base URL
 * @param {string} model - Model name/ID
 * @returns {Promise<string>} - JSON string representing the research plan
 */
const generateResearchPlan = async (provider, userMessage, apiKey, baseUrl, model) => {
  const promptMessages = [
    {
      role: 'system',
      content: `You are a task planner whose output will be executed step-by-step by another agent.

Create a detailed, execution-ready research plan in ReAct-inspired format.
Return ONLY valid JSON that conforms exactly to this schema:
{
  "goal": "string",
  "assumptions": ["string"],
  "plan": [
   {
  "step": 1,
  "thought": "short reasoning",
  "action": "what to do",
  "expected_output": "what this step should produce",
  "deliverable_format": "bullet list / table / checklist / JSON / paragraph",
  "acceptance_criteria": ["must include ...", "must exclude ..."],
  "depth": "low|medium|high"
}
  ],
  "risks": ["string"],
  "success_criteria": ["string"]
}

Rules:
- Use 4–6 steps.
- Each step must be executable independently by another agent without additional reasoning.
- Actions must include sub-steps or constraints if ambiguity is possible.
- Expected_output must describe format, depth, and purpose (e.g. 'a bullet list of 5 items explaining X').
- Avoid abstract verbs like 'research', 'analyze', or 'consider' without explanation.
- If key information is missing, step 1 must request clarification and pause further planning.
- Output JSON only. No markdown, no commentary.`,
    },
    { role: 'user', content: userMessage },
  ]

  const responseFormat = provider !== 'gemini' ? { type: 'json_object' } : undefined
  let content = undefined
  if (provider === 'gemini') {
    content = await requestGemini({ apiKey, model, messages: promptMessages })
  } else if (provider === 'siliconflow') {
    content = await requestSiliconFlow({
      provider,
      apiKey,
      baseUrl,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else if (provider === 'glm') {
    content = await requestGLM({
      apiKey,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else if (provider === 'modelscope') {
    content = await requestModelScope({
      apiKey,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else if (provider === 'kimi') {
    content = await requestKimi({
      apiKey,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else {
    content = await requestOpenAICompat({
      provider,
      apiKey,
      baseUrl,
      model,
      messages: promptMessages,
      responseFormat,
    })
  }

  const parsed = safeJsonParse(content)
  if (parsed) {
    try {
      return JSON.stringify(parsed, null, 2)
    } catch {
      return content?.trim?.() || ''
    }
  }
  return content?.trim?.() || ''
}

const streamResearchPlan = async (
  provider,
  userMessage,
  apiKey,
  baseUrl,
  model,
  { onChunk, onFinish, onError, signal } = {},
) => {
  const promptMessages = [
    {
      role: 'system',
      content: `You are a task planner whose output will be executed step-by-step by another agent.

Create a detailed, execution-ready research plan in ReAct-inspired format.
Return ONLY valid JSON that conforms exactly to this schema:
{
  "goal": "string",
  "assumptions": ["string"],
  "plan": [
   {
  "step": 1,
  "thought": "short reasoning",
  "action": "what to do",
  "expected_output": "what this step should produce",
  "deliverable_format": "bullet list / table / checklist / JSON / paragraph",
  "acceptance_criteria": ["must include ...", "must exclude ..."],
  "depth": "low|medium|high"
}
  ],
  "risks": ["string"],
  "success_criteria": ["string"]
}

Rules:
- Use 4鈥? steps.
- Each step must be executable independently by another agent without additional reasoning.
- Actions must include sub-steps or constraints if ambiguity is possible.
- Expected_output must describe format, depth, and purpose (e.g. 'a bullet list of 5 items explaining X').
- Avoid abstract verbs like 'research', 'analyze', or 'consider' without explanation.
- If key information is missing, step 1 must request clarification and pause further planning.
- Output JSON only. No markdown, no commentary.`,
    },
    { role: 'user', content: userMessage },
  ]

  const responseFormat = provider !== 'gemini' ? { type: 'json_object' } : undefined
  let fullContent = ''

  await streamWithLangChain({
    provider,
    apiKey,
    baseUrl,
    model,
    messages: promptMessages,
    responseFormat,
    thinking: { type: 'disabled' },
    onChunk: chunk => {
      const text =
        typeof chunk === 'string'
          ? chunk
          : chunk?.type === 'text'
            ? chunk.content
            : ''
      if (!text) return
      fullContent += text
      onChunk?.(text, fullContent)
    },
    onFinish: result => {
      if (result?.content) fullContent = result.content
      onFinish?.(fullContent)
    },
    onError,
    signal,
  })

  return fullContent
}

/**
 * Generates a daily tip for the home page widget.
 * @param {string} provider - AI provider to use
 * @param {string} language - Preferred response language
 * @param {string} category - Tip category or direction
 * @param {string} apiKey - API key for authentication
 * @param {string} baseUrl - Custom base URL
 * @param {string} model - Model name/ID
 * @returns {Promise<string>} - Generated tip text
 */
const generateDailyTip = async (provider, language, category, apiKey, baseUrl, model) => {
  const languageBlock = language ? `\n\n## Language\nReply in ${language}.` : ''
  const categoryBlock = category ? `\n\n## Category\n${category}` : ''
  const promptMessages = [
    {
      role: 'system',
      content: `## Task
Generate a short, practical tip for today. Keep it to 1-2 sentences and avoid emojis.${categoryBlock}${languageBlock}

## Output
Return only the tip text.`,
    },
    { role: 'user', content: 'Daily tip.' },
  ]

  let content = undefined
  if (provider === 'gemini') {
    content = await requestGemini({ apiKey, model, messages: promptMessages })
  } else if (provider === 'siliconflow') {
    content = await requestSiliconFlow({
      provider,
      apiKey,
      baseUrl,
      model,
      messages: promptMessages,
    })
  } else if (provider === 'glm') {
    content = await requestGLM({
      apiKey,
      model,
      messages: promptMessages,
    })
  } else if (provider === 'modelscope') {
    content = await requestModelScope({
      apiKey,
      model,
      messages: promptMessages,
    })
  } else if (provider === 'kimi') {
    content = await requestKimi({
      apiKey,
      model,
      messages: promptMessages,
    })
  } else {
    content = await requestOpenAICompat({
      provider,
      apiKey,
      baseUrl,
      model,
      messages: promptMessages,
    })
  }

  return (content && content.trim?.()) || ''
}

/**
 * Generates both a title and selects an appropriate space for a conversation.
 * Returns an object with the generated title and selected space (or null if no space fits).
 * @param {string} provider - AI provider to use
 * @param {string} firstMessage - The first user message
 * @param {Array} spaces - Available spaces to choose from
 * @param {string} apiKey - API key for authentication
 * @param {string} baseUrl - Custom base URL
 * @param {string} model - Model name/ID
 * @returns {Promise<{title: string, space: Object|null}>} - Generated title and selected space
 */
const generateTitleAndSpace = async (provider, firstMessage, spaces, apiKey, baseUrl, model) => {
  const spaceLabels = (spaces || []).map(s => s.label).join(', ')
  const promptMessages = [
    {
      role: 'system',
      content: `You are a helpful assistant.
## Task
1. Generate a short, concise title (max 5 words) for this conversation based on the user's first message.
2. Select the most appropriate space from the following list: [${spaceLabels}]. If none fit well, return null.

## Output
Return the result as a JSON object with keys "title" and "spaceLabel".`,
    },
    { role: 'user', content: firstMessage },
  ]

  const responseFormat = provider !== 'gemini' ? { type: 'json_object' } : undefined
  let content = undefined
  if (provider === 'gemini') {
    content = await requestGemini({ apiKey, model, messages: promptMessages })
  } else if (provider === 'siliconflow') {
    content = await requestSiliconFlow({
      provider,
      apiKey,
      baseUrl,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else if (provider === 'glm') {
    content = await requestGLM({
      apiKey,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else if (provider === 'modelscope') {
    content = await requestModelScope({
      apiKey,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else if (provider === 'kimi') {
    content = await requestKimi({
      apiKey,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else {
    content = await requestOpenAICompat({
      provider,
      apiKey,
      baseUrl,
      model,
      messages: promptMessages,
      responseFormat,
    })
  }
  const parsed = safeJsonParse(content) || {}
  const title = parsed.title || 'New Conversation'
  const spaceLabel = parsed.spaceLabel
  const selectedSpace = (spaces || []).find(s => s.label === spaceLabel) || null
  return { title, space: selectedSpace }
}

/**
 * Generates a title and selects a space + agent for a conversation.
 * Returns an object with title, selected space label, and agent name (optional).
 * @param {string} provider - AI provider to use
 * @param {string} firstMessage - The first user message
 * @param {Array} spacesWithAgents - Array of { label, description, agents: [{name,description?}] }
 * @param {string} apiKey - API key for authentication
 * @param {string} baseUrl - Custom base URL
 * @param {string} model - Model name/ID
 * @returns {Promise<{title: string, spaceLabel: string|null, agentName: string|null}>}
 */
const generateTitleSpaceAndAgent = async (
  provider,
  firstMessage,
  spacesWithAgents,
  apiKey,
  baseUrl,
  model,
) => {
  const sanitizeOptionText = text =>
    String(text || '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/[{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  const spaceLines = (spacesWithAgents || []).map(space => {
    const agentEntries = (space.agents || []).map(agent => {
      if (typeof agent === 'string') {
        return { name: agent }
      }
      return {
        name: typeof agent?.name === 'string' ? agent.name : '',
        description: agent?.description ?? '',
      }
    })
    const agentTokens = agentEntries
      .map(agent => {
        const name = sanitizeOptionText(agent.name)
        const description = sanitizeOptionText(agent.description)
        if (name && description) return `${name} - ${description}`
        if (name) return name
        return ''
      })
      .filter(Boolean)
      .join(',')
    const spaceLabel = sanitizeOptionText(space.label)
    const spaceDescription = sanitizeOptionText(space.description)
    const spaceToken = spaceDescription ? `${spaceLabel} - ${spaceDescription}` : spaceLabel
    return `${spaceToken}:{${agentTokens}}`
  })
  const promptMessages = [
    {
      role: 'system',
      content: `You are a helpful assistant.
## Task
1. Generate a short, concise title (max 5 words) for this conversation based on the user's first message.
2. Select the most appropriate space from the list below and return its spaceLabel (the space name only, without the description).
3. If the chosen space has agents, select the best matching agent by agentName (agent name only). Otherwise return null.

## Output
Return the result as JSON with keys "title", "spaceLabel", and "agentName".`,
    },
    {
      role: 'user',
      content: `${firstMessage}\n\nSpaces and agents:\n${spaceLines.join('\n')}`,
    },
  ]

  const responseFormat = provider !== 'gemini' ? { type: 'json_object' } : undefined
  let content = undefined
  if (provider === 'gemini') {
    content = await requestGemini({ apiKey, model, messages: promptMessages })
  } else if (provider === 'siliconflow') {
    content = await requestSiliconFlow({
      provider,
      apiKey,
      baseUrl,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else if (provider === 'glm') {
    content = await requestGLM({
      apiKey,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else if (provider === 'modelscope') {
    content = await requestModelScope({
      apiKey,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else if (provider === 'kimi') {
    content = await requestKimi({
      apiKey,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else {
    content = await requestOpenAICompat({
      provider,
      apiKey,
      baseUrl,
      model,
      messages: promptMessages,
      responseFormat,
    })
  }

  const parsed = safeJsonParse(content) || {}
  return {
    title: parsed.title || 'New Conversation',
    spaceLabel: parsed.spaceLabel || null,
    agentName: parsed.agentName || null,
  }
}

/**
 * Generates only the agent selection for auto mode (not title or space).
 * This is used for subsequent messages when agent auto mode is enabled.
 * Selects from agents within the current space only.
 * @param {string} provider - AI provider to use
 * @param {string} userMessage - The user's current message
 * @param {Object} currentSpace - The current space with its agents
 * @param {string} apiKey - API key for authentication
 * @param {string} baseUrl - Custom base URL
 * @param {string} model - Model name/ID
 * @returns {Promise<{agentName: string|null}>} - Selected agent name or null
 */
const generateAgentForAuto = async (
  provider,
  userMessage,
  currentSpace,
  apiKey,
  baseUrl,
  model,
) => {
  const sanitizeOptionText = text =>
    String(text || '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/[{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

  // Build agent list from current space only
  const agentEntries = (currentSpace?.agents || []).map(agent => {
    if (typeof agent === 'string') {
      return { name: agent }
    }
    return {
      name: typeof agent?.name === 'string' ? agent.name : '',
      description: agent?.description ?? '',
    }
  })

  const agentTokens = agentEntries
    .map(agent => {
      const name = sanitizeOptionText(agent.name)
      const description = sanitizeOptionText(agent.description)
      if (name && description) return `${name} - ${description}`
      if (name) return name
      return ''
    })
    .filter(Boolean)
    .join('\n')

  const promptMessages = [
    {
      role: 'system',
      content: `You are a helpful assistant.
## Task
Select the best matching agent for the user's message from the "${currentSpace?.label || 'Default'}" space. Consider the agent's name and description to determine which one is most appropriate. If no agent is a good match, return null.

## Output
Return the result as JSON with key "agentName" (agent name only, or null if no match).`,
    },
    {
      role: 'user',
      content: `${userMessage}\n\nAvailable agents in ${currentSpace?.label || 'this space'}:\n${agentTokens}`,
    },
  ]

  const responseFormat = provider !== 'gemini' ? { type: 'json_object' } : undefined
  let content = undefined
  if (provider === 'gemini') {
    content = await requestGemini({ apiKey, model, messages: promptMessages })
  } else if (provider === 'siliconflow') {
    content = await requestSiliconFlow({
      provider,
      apiKey,
      baseUrl,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else if (provider === 'glm') {
    content = await requestGLM({
      apiKey,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else if (provider === 'modelscope') {
    content = await requestModelScope({
      apiKey,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else if (provider === 'kimi') {
    content = await requestKimi({
      apiKey,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else {
    content = await requestOpenAICompat({
      provider,
      apiKey,
      baseUrl,
      model,
      messages: promptMessages,
      responseFormat,
    })
  }

  const parsed = safeJsonParse(content) || {}
  return {
    agentName: parsed.agentName || null,
  }
}

/**
 * Generates related follow-up questions based on the conversation history.
 * Returns an array of 3 relevant questions that the user might ask next.
 * @param {string} provider - AI provider to use
 * @param {Array} messages - Conversation history messages
 * @param {string} apiKey - API key for authentication
 * @param {string} baseUrl - Custom base URL
 * @param {string} model - Model name/ID
 * @returns {Promise<Array<string>>} - Array of related follow-up questions
 */
const generateRelatedQuestions = async (provider, messages, apiKey, baseUrl, model) => {
  const promptMessages = [
    ...(messages || []),
    {
      role: 'user',
      content:
        'Based on our conversation, suggest 3 short, relevant follow-up questions I might ask. Return them as a JSON array of strings. Example: ["Question 1?", "Question 2?"]',
    },
  ]

  const responseFormat = provider !== 'gemini' ? { type: 'json_object' } : undefined
  let content = undefined
  if (provider === 'gemini') {
    content = await requestGemini({ apiKey, model, messages: promptMessages })
  } else if (provider === 'siliconflow') {
    content = await requestSiliconFlow({
      provider,
      apiKey,
      baseUrl,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else if (provider === 'glm') {
    content = await requestGLM({
      apiKey,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else if (provider === 'modelscope') {
    content = await requestModelScope({
      apiKey,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else {
    content = await requestOpenAICompat({
      provider,
      apiKey,
      baseUrl,
      model,
      messages: promptMessages,
      responseFormat,
    })
  }
  const parsed = safeJsonParse(content)
  return normalizeRelatedQuestions(parsed)
}

/**
 * Factory function that creates a backend provider for a specific AI provider.
 * Returns an object with methods for streaming, title generation, and related questions.
 * @param {string} provider - The AI provider name ('openai', 'siliconflow', 'gemini')
 * @returns {Object} - Provider interface with streaming and generation methods
 */
export const createBackendProvider = provider => ({
  streamChatCompletion: params => streamWithLangChain({ provider, ...params }),
  generateTitle: (firstMessage, apiKey, baseUrl, model) =>
    generateTitle(provider, firstMessage, apiKey, baseUrl, model),
  generateResearchPlan: (userMessage, apiKey, baseUrl, model) =>
    generateResearchPlan(provider, userMessage, apiKey, baseUrl, model),
  streamResearchPlan: (userMessage, apiKey, baseUrl, model, callbacks) =>
    streamResearchPlan(provider, userMessage, apiKey, baseUrl, model, callbacks),
  generateDailyTip: (language, category, apiKey, baseUrl, model) =>
    generateDailyTip(provider, language, category, apiKey, baseUrl, model),
  generateTitleAndSpace: (firstMessage, spaces, apiKey, baseUrl, model) =>
    generateTitleAndSpace(provider, firstMessage, spaces, apiKey, baseUrl, model),
  generateTitleSpaceAndAgent: (firstMessage, spacesWithAgents, apiKey, baseUrl, model) =>
    generateTitleSpaceAndAgent(provider, firstMessage, spacesWithAgents, apiKey, baseUrl, model),
  generateAgentForAuto: (userMessage, currentSpace, apiKey, baseUrl, model) =>
    generateAgentForAuto(provider, userMessage, currentSpace, apiKey, baseUrl, model),
  generateRelatedQuestions: (messages, apiKey, baseUrl, model) =>
    generateRelatedQuestions(provider, messages, apiKey, baseUrl, model),
})
