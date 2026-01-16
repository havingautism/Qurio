/**
 * Stream Chat service
 * Handles streaming chat completion with support for multiple AI providers
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatOpenAI } from '@langchain/openai'
import { normalizeTextContent, safeJsonParse, toLangChainMessages } from './serviceUtils.js'
import { executeToolByName, getToolDefinitionsByIds, isLocalToolName } from './toolsService.js'

// Default base URLs
const OPENAI_DEFAULT_BASE = 'https://api.openai.com/v1'
const SILICONFLOW_BASE = 'https://api.siliconflow.cn/v1'
const GLM_BASE = 'https://open.bigmodel.cn/api/paas/v4'
const MODELSCOPE_BASE = 'https://api-inference.modelscope.cn/v1'
const KIMI_BASE = 'https://api.moonshot.cn/v1'

// Default models
const DEFAULT_MODELS = {
  gemini: 'gemini-2.0-flash-exp',
  openai: 'gpt-4o-mini',
  siliconflow: 'Qwen/Qwen2.5-7B-Instruct',
  glm: 'glm-4-flash',
  modelscope: 'AI-ModelScope/glm-4-9b-chat',
  kimi: 'moonshot-v1-8k',
}

/**
 * Apply context limit to messages
 */
const applyContextLimitRaw = (messages, limit) => {
  if (!limit || limit <= 0 || !messages || messages.length <= limit) return messages
  // Keep system messages and recent messages
  const systemMessages = messages.filter(m => m?.role === 'system')
  const nonSystemMessages = messages.filter(m => m?.role !== 'system')
  const recent = nonSystemMessages.slice(-limit)
  return [...systemMessages, ...recent]
}

/**
 * Build Gemini payload for native API
 */
const buildGeminiPayload = ({ messages, temperature, top_k, top_p, tools, thinking }) => {
  const roleMap = { system: 'system', user: 'user', assistant: 'model', tool: 'user' }

  const contents = messages
    .filter(m => m?.role && m?.content)
    .map(m => {
      const role = roleMap[m.role] || 'user'
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      return { role, parts: [{ text: content }] }
    })

  const generationConfig = {}
  if (temperature !== undefined) generationConfig.temperature = temperature
  if (top_k !== undefined) generationConfig.topK = top_k
  if (top_p !== undefined) generationConfig.topP = top_p
  if (thinking?.thinkingConfig) {
    generationConfig.thinkingConfig = thinking.thinkingConfig
  }

  const payload = { contents }
  if (Object.keys(generationConfig).length > 0) {
    payload.generationConfig = generationConfig
  }
  if (Array.isArray(tools) && tools.length > 0) {
    payload.tools = tools
  }

  return payload
}

/**
 * Parse Gemini parts from content array
 */
const parseGeminiParts = (contentValue, { emitText, emitThought, handleTaggedText }) => {
  if (!Array.isArray(contentValue)) return false

  let hasProcessed = false
  for (const part of contentValue) {
    const text = typeof part?.text === 'string' ? part.text : ''
    if (!text) continue
    hasProcessed = true
    if (part?.thought) {
      emitThought(text)
    } else {
      handleTaggedText(text)
    }
  }
  return hasProcessed
}

/**
 * Factory for handleTaggedText function
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
 * Collect GLM web search sources
 */
const collectGLMSources = (webSearch, sourcesMap) => {
  if (!webSearch) return
  const results = webSearch.results || webSearch
  if (!Array.isArray(results)) return

  for (const item of results) {
    const refer = item?.refer || item?.id || item?.link
    if (!refer || sourcesMap.has(refer)) continue
    sourcesMap.set(refer, {
      id: refer,
      title: item?.title || refer,
      url: item?.link || '',
      snippet: item?.content?.substring(0, 200) || item?.snippet || '',
      icon: item?.icon || '',
      media: item?.media || '',
    })
  }
}

/**
 * Collect Kimi web search sources
 */
const collectKimiSources = (toolOutput, sourcesMap) => {
  if (!toolOutput) return
  const parsed = typeof toolOutput === 'string' ? safeJsonParse(toolOutput) : toolOutput
  if (!parsed) return

  const results =
    parsed?.results || parsed?.data || parsed?.items || (Array.isArray(parsed) ? parsed : [])
  if (!Array.isArray(results)) return

  for (const item of results) {
    const url = item?.url || item?.link || item?.href
    if (!url || sourcesMap.has(url)) continue
    sourcesMap.set(url, {
      id: String(sourcesMap.size + 1),
      title: item?.title || url,
      url,
      snippet: item?.snippet || item?.description || item?.content?.substring(0, 200) || '',
    })
  }
}

const getToolCallName = toolCall =>
  toolCall?.function?.name ||
  toolCall?.name ||
  toolCall?.tool?.name ||
  toolCall?.tool?.function?.name ||
  null

const getToolCallArguments = toolCall =>
  toolCall?.function?.arguments ||
  toolCall?.arguments ||
  toolCall?.args ||
  toolCall?.tool?.function?.arguments ||
  toolCall?.tool?.arguments ||
  toolCall?.tool?.args ||
  null

const formatToolArgumentsFromValue = value => {
  if (!value) return ''
  if (typeof value === 'string') {
    const parsed = safeJsonParse(value)
    return parsed ? JSON.stringify(parsed) : value
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const buildToolCallEvent = (toolCall, argsOverride) => ({
  type: 'tool_call',
  id: toolCall?.id || null,
  name: getToolCallName(toolCall),
  arguments:
    typeof argsOverride !== 'undefined'
      ? formatToolArgumentsFromValue(argsOverride)
      : formatToolArgumentsFromValue(getToolCallArguments(toolCall)),
})

const buildToolResultEvent = (toolCall, error, durationMs, output) => ({
  type: 'tool_result',
  id: toolCall?.id || null,
  name: getToolCallName(toolCall),
  status: error ? 'error' : 'done',
  duration_ms: typeof durationMs === 'number' ? durationMs : undefined,
  output: typeof output !== 'undefined' ? output : undefined,
  error: error ? String(error.message || error) : undefined,
})

const collectKimiSourcesFromToolCalls = (toolCalls, sourcesMap) => {
  if (!Array.isArray(toolCalls)) return
  for (const toolCall of toolCalls) {
    const toolName = getToolCallName(toolCall)
    if (
      toolName !== '$web_search' &&
      toolName !== 'web_search' &&
      toolName !== 'search' &&
      toolName !== 'Tavily_web_search' &&
      toolName !== 'Tavily_academic_search'
    )
      continue
    const rawArgs = getToolCallArguments(toolCall)
    const parsedArgs = typeof rawArgs === 'string' ? safeJsonParse(rawArgs) : rawArgs
    collectKimiSources(parsedArgs, sourcesMap)
  }
}

const getKimiToolName = toolResp =>
  toolResp?.name ||
  toolResp?.tool?.name ||
  toolResp?.function?.name ||
  toolResp?.tool?.function?.name ||
  null

const isSearchToolName = name =>
  name === 'Tavily_web_search' ||
  name === 'Tavily_academic_search' ||
  name === 'web_search' ||
  name === '$web_search' ||
  name === 'search'

/**
 * Collect Gemini grounding sources
 */
const collectGeminiSources = (groundingMetadata, geminiSources) => {
  const chunks = groundingMetadata?.groundingChunks
  if (!Array.isArray(chunks)) return
  if (!Array.isArray(geminiSources)) return
  if (geminiSources.length === chunks.length && geminiSources.length > 0) return
  geminiSources.length = 0
  for (const chunk of chunks) {
    const web = chunk?.web
    const url = web?.uri
    if (!url) continue
    geminiSources.push({ url, title: web?.title || url })
  }
}

/**
 * Collect Tavily web search sources
 */
const collectWebSearchSources = (result, sourcesMap) => {
  if (!result?.results || !Array.isArray(result.results)) return
  result.results.forEach(item => {
    const url = item.url
    if (url && !sourcesMap.has(url)) {
      sourcesMap.set(url, {
        title: item.title || 'Unknown Source',
        uri: url,
      })
    }
  })
}

/**
 * Update tool calls map
 */
const updateToolCallsMap = (toolCallsMap, newToolCalls) => {
  if (!Array.isArray(newToolCalls)) return

  for (const toolCall of newToolCalls) {
    if (!toolCall?.id) continue
    toolCallsMap.set(toolCall.id, toolCall)
  }
}

const mergeToolCallsByIndex = (toolCallsByIndex, newToolCalls) => {
  if (!Array.isArray(newToolCalls)) return

  for (const toolCall of newToolCalls) {
    const index = typeof toolCall?.index === 'number' ? toolCall.index : toolCallsByIndex.length
    const current = toolCallsByIndex[index] || {}
    const currentFunction = current.function || {}
    const nextFunction = toolCall?.function || {}
    const nextArguments = nextFunction.arguments || ''
    const mergedArguments = nextArguments
      ? `${currentFunction.arguments || ''}${nextArguments}`
      : currentFunction.arguments

    toolCallsByIndex[index] = {
      ...current,
      ...toolCall,
      function: {
        ...currentFunction,
        ...nextFunction,
        ...(mergedArguments ? { arguments: mergedArguments } : {}),
      },
    }
  }
}

const getToolCallsFromResponse = response => {
  const raw = response?.additional_kwargs?.__raw_response
  const choice = raw?.choices?.[0]
  const message = choice?.message
  return (
    message?.tool_calls || response?.additional_kwargs?.tool_calls || response?.tool_calls || null
  )
}

const getFinishReasonFromResponse = response => {
  const raw = response?.additional_kwargs?.__raw_response
  return raw?.choices?.[0]?.finish_reason || null
}

const getResponseContent = response => {
  const raw = response?.additional_kwargs?.__raw_response
  const message = raw?.choices?.[0]?.message
  return message?.content ?? response?.content
}

const getResponseReasoning = response => {
  const raw = response?.additional_kwargs?.__raw_response
  return (
    raw?.choices?.[0]?.message?.reasoning_content ||
    raw?.choices?.[0]?.message?.reasoning ||
    response?.additional_kwargs?.reasoning_content ||
    response?.additional_kwargs?.reasoning ||
    null
  )
}

// ============================================================================
// Model builders
// ============================================================================

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
  if (!apiKey) throw new Error('Missing API key')

  return new ChatGoogleGenerativeAI({
    apiKey,
    model: model || DEFAULT_MODELS.gemini,
    temperature,
    topK: top_k,
    ...(top_p !== undefined ? { topP: top_p } : {}),
    streaming,
  })
}

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
  streaming,
}) => {
  if (!apiKey) throw new Error('Missing API key')

  const modelKwargs = {}
  modelKwargs.response_format = responseFormat || { type: 'text' }
  if (thinking) {
    const budget = thinking.budget_tokens || thinking.budgetTokens || 1024
    modelKwargs.extra_body = { thinking_budget: budget }
    modelKwargs.enable_thinking = true
    modelKwargs.thinking_budget = budget
  }
  if (top_k !== undefined) modelKwargs.top_k = top_k
  if (top_p !== undefined) modelKwargs.top_p = top_p
  if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
  if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty
  if (tools && tools.length > 0) modelKwargs.tools = tools
  if (toolChoice) modelKwargs.tool_choice = toolChoice
  if (streaming) {
    modelKwargs.stream_options = { include_usage: false }
  }

  return new ChatOpenAI({
    apiKey,
    modelName: model || DEFAULT_MODELS.siliconflow,
    temperature,
    streaming,
    __includeRawResponse: true,
    modelKwargs,
    configuration: { baseURL: SILICONFLOW_BASE },
  })
}

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
  streaming,
}) => {
  if (!apiKey) throw new Error('Missing API key')

  const modelKwargs = {}
  if (responseFormat) modelKwargs.response_format = responseFormat
  const thinkingType = thinking?.type || 'disabled'
  modelKwargs.thinking = { type: thinkingType }
  if (thinking?.type) {
    modelKwargs.extra_body = { thinking: { type: thinkingType } }
  }
  if (top_k !== undefined) modelKwargs.top_k = top_k
  if (top_p !== undefined) modelKwargs.top_p = top_p
  if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
  if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty
  if (tools && tools.length > 0) modelKwargs.tools = tools
  if (toolChoice) modelKwargs.tool_choice = toolChoice
  if (streaming) {
    modelKwargs.stream_options = { include_usage: false }
  }

  return new ChatOpenAI({
    apiKey,
    modelName: model || DEFAULT_MODELS.glm,
    temperature,
    streaming,
    __includeRawResponse: true,
    modelKwargs,
    configuration: { baseURL: GLM_BASE },
  })
}

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
  streaming,
}) => {
  if (!apiKey) throw new Error('Missing API key')

  const modelKwargs = {}
  if (responseFormat) modelKwargs.response_format = responseFormat
  const thinkingType = thinking?.type || 'disabled'
  modelKwargs.thinking = { type: thinkingType }
  if (thinking?.type) {
    modelKwargs.extra_body = { thinking: { type: thinkingType } }
  }
  if (top_k !== undefined) modelKwargs.top_k = top_k
  if (top_p !== undefined) modelKwargs.top_p = top_p
  if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
  if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty
  if (tools && tools.length > 0) modelKwargs.tools = tools
  if (toolChoice) modelKwargs.tool_choice = toolChoice
  if (streaming) {
    modelKwargs.stream_options = { include_usage: false }
  }

  return new ChatOpenAI({
    apiKey,
    modelName: model || DEFAULT_MODELS.modelscope,
    temperature,
    streaming,
    __includeRawResponse: true,
    modelKwargs,
    configuration: { baseURL: MODELSCOPE_BASE },
  })
}

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
  streaming,
}) => {
  if (!apiKey) throw new Error('Missing API key')

  const modelKwargs = {}
  if (responseFormat) modelKwargs.response_format = responseFormat
  if (top_k !== undefined) modelKwargs.top_k = top_k
  if (top_p !== undefined) modelKwargs.top_p = top_p
  if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
  if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty
  if (tools && tools.length > 0) modelKwargs.tools = tools
  if (toolChoice) modelKwargs.tool_choice = toolChoice
  if (streaming) {
    modelKwargs.stream_options = { include_usage: false }
  }

  return new ChatOpenAI({
    apiKey,
    modelName: model || DEFAULT_MODELS.kimi,
    temperature,
    streaming,
    __includeRawResponse: true,
    modelKwargs,
    configuration: { baseURL: KIMI_BASE },
  })
}

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
  streaming,
}) => {
  if (!apiKey) throw new Error('Missing API key')

  const resolvedBase = baseUrl || OPENAI_DEFAULT_BASE

  const modelKwargs = {}
  if (tools && tools.length > 0) modelKwargs.tools = tools
  if (toolChoice) modelKwargs.tool_choice = toolChoice
  if (responseFormat) modelKwargs.response_format = responseFormat
  if (top_k !== undefined) modelKwargs.top_k = top_k
  if (top_p !== undefined) modelKwargs.top_p = top_p
  if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
  if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty
  if (streaming) {
    modelKwargs.stream_options = { include_usage: false }
  }

  return new ChatOpenAI({
    apiKey,
    modelName: model || DEFAULT_MODELS.openai,
    temperature,
    streaming,
    __includeRawResponse: true,
    modelKwargs,
    configuration: { baseURL: resolvedBase },
  })
}

// ============================================================================
// Stream chat completion
// ============================================================================

/**
 * Stream chat completion
 * Returns an async generator that yields SSE events
 */
/**
 * Stream chat completion with tool calling support
 * This is an async generator function that yields streaming chunks and handles multi-turn tool calls
 *
 * Tool Calling Flow:
 * 1. Prepare tool definitions from agent's toolIds
 * 2. Merge with external tools (e.g., web search)
 * 3. Send to AI model with messages
 * 4. If AI requests tool calls, execute them locally
 * 5. Add tool results to message history
 * 6. Call AI again with updated history (recursive via while loop)
 * 7. AI generates natural language response
 * 8. Stream response to frontend
 */
export const streamChat = async function* (params) {
  // Debug flag for stream logging
  const debugStream = process.env.DEBUG_STREAM === '1'
  if (debugStream) {
    console.log('[streamChat] Starting with provider:', params.provider)
  }

  // ============================================================================
  // STEP 1: Extract parameters
  // ============================================================================
  const {
    provider, // AI provider: 'openai', 'gemini', 'glm', etc.
    apiKey, // API key for the provider
    baseUrl, // Optional custom base URL
    model, // Model name
    messages, // Conversation history array
    tools, // External tools (e.g., Tavily_web_search from frontend)
    toolChoice, // Tool choice strategy: 'auto', 'required', or specific tool
    responseFormat, // Response format (e.g., JSON mode)
    thinking, // Thinking/reasoning mode configuration
    temperature, // Randomness (0-2)
    top_k, // Top-K sampling
    top_p, // Top-P (nucleus) sampling
    frequency_penalty, // Frequency penalty
    presence_penalty, // Presence penalty
    contextMessageLimit, // Max number of messages to include (context window)
    stream = true, // Whether to use streaming
    signal, // AbortSignal for cancellation
    toolIds = [], // Agent's enabled tool IDs (e.g., ['calculator', 'local_time'])
    searchProvider,
    tavilyApiKey,
  } = params

  const toolConfig = { searchProvider, tavilyApiKey }

  const debugSources = process.env.DEBUG_SOURCES === '1'
  let loggedAdditional = false
  let loggedGemini = false

  // ============================================================================
  // STEP 2: Prepare messages with context limit

  // ============================================================================
  // Apply context limit to prevent exceeding token limits
  const trimmedMessages = applyContextLimitRaw(messages, contextMessageLimit)
  // currentMessages will be updated throughout the tool calling loop
  // It accumulates: user message → assistant tool_calls → tool results
  let currentMessages = trimmedMessages

  if (debugStream) {
    console.log('[streamChat] Messages prepared, count:', langchainMessages.length)
  }

  // ============================================================================
  // STEP 3: Prepare tool definitions
  // ============================================================================
  let modelInstance = undefined

  // Get agent tool definitions from toolIds (e.g., ['calculator', 'local_time'])
  // Returns OpenAI Function Calling format: [{ type: 'function', function: { name, description, parameters } }]
  // Note: Gemini doesn't support agent tools in this implementation
  const agentToolDefinitions = provider === 'gemini' ? [] : getToolDefinitionsByIds(toolIds)

  // Merge external tools (from frontend, like Tavily_web_search) with agent tools
  const combinedTools = [...(Array.isArray(tools) ? tools : []), ...agentToolDefinitions].filter(
    Boolean,
  )

  // Deduplicate tools by name (prevent defining the same tool twice)
  const normalizedTools = []
  const toolNames = new Set()
  for (const tool of combinedTools) {
    const name = tool?.function?.name
    if (name && toolNames.has(name)) continue // Skip duplicates
    if (name) toolNames.add(name)
    normalizedTools.push(tool)
  }

  // Inject citation prompt if Tavily_web_search is enabled
  if (
    normalizedTools.some(
      t => t.function?.name === 'Tavily_web_search' || t.function?.name === 'web_search',
    )
  ) {
    const citationPrompt =
      '\n\n[IMPORTANT] You have access to a "Tavily_web_search" tool. When you use this tool to answer a question, you MUST cite the search results in your answer using the format [1], [2], etc., corresponding to the index of the search result provided in the tool output. Do not fabricate citations.'

    // Find system message and append, or create one
    const systemMessageIndex = currentMessages.findIndex(m => m.role === 'system')
    if (systemMessageIndex !== -1) {
      currentMessages[systemMessageIndex].content += citationPrompt
    } else {
      currentMessages.unshift({ role: 'system', content: citationPrompt })
    }
  }

  // Set tool_choice: if tools are available and no explicit choice, use 'auto' (let AI decide)
  const effectiveToolChoice =
    toolChoice !== undefined ? toolChoice : normalizedTools.length > 0 ? 'auto' : undefined

  // ============================================================================
  // STEP 4: Create AI model instance
  // ============================================================================
  // Create model instance with normalized tools
  // All providers receive the same tool definitions in OpenAI Function Calling format
  if (provider === 'gemini') {
    modelInstance = buildGeminiModel({
      apiKey,
      model,
      temperature,
      top_k,
      top_p,
      tools: normalizedTools, // Tools in OpenAI format
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
      tools: normalizedTools,
      toolChoice: effectiveToolChoice, // 'auto', 'required', or specific tool
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
      tools: normalizedTools,
      toolChoice: effectiveToolChoice,
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
      tools: normalizedTools,
      toolChoice: effectiveToolChoice,
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
      tools: normalizedTools,
      toolChoice: effectiveToolChoice,
      responseFormat,
      thinking,
      streaming: stream,
    })
  } else {
    // Default to OpenAI-compatible model
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
      tools: normalizedTools,
      toolChoice: effectiveToolChoice,
      responseFormat,
      thinking,
      streaming: stream,
    })
  }

  // ============================================================================
  // STEP 5: Create non-streaming model instances for special providers
  // ============================================================================
  // Provider streaming tool_calls support (tested 2026-01-03):
  // - OpenAI, SiliconFlow, GLM: ✅ Streaming supports tool_calls
  // - Kimi: ❌ Streaming returns incomplete arguments (needs non-streaming)
  // - ModelScope: ❌ API doesn't support tools + stream together (needs non-streaming)

  // Kimi: Needs non-streaming for tool calls (streaming tool_calls tested but arguments format issues)
  const nonStreamingKimiModel =
    provider === 'kimi' && stream
      ? buildKimiModel({
          apiKey,
          model,
          temperature,
          top_k,
          top_p,
          frequency_penalty,
          presence_penalty,
          tools: normalizedTools,
          toolChoice: effectiveToolChoice,
          responseFormat,
          thinking,
          streaming: false, // Non-streaming to get tool_calls properly
        })
      : null

  // ModelScope: API doesn't support tools + stream together
  // GLM tested and confirmed to support streaming tool_calls (2026-01-03)
  const nonStreamingModelScopeModel =
    provider === 'modelscope' && stream && normalizedTools.length > 0
      ? buildModelScopeModel({
          apiKey,
          model,
          temperature,
          top_k,
          top_p,
          frequency_penalty,
          presence_penalty,
          tools: normalizedTools,
          toolChoice: effectiveToolChoice,
          responseFormat,
          thinking,
          streaming: false, // Non-streaming to get tool_calls
        })
      : null
  const nonStreamingGlmModel =
    provider === 'glm' && stream && normalizedTools.length > 0
      ? buildGLMModel({
          apiKey,
          model,
          temperature,
          top_k,
          top_p,
          frequency_penalty,
          presence_penalty,
          tools: normalizedTools,
          toolChoice: effectiveToolChoice,
          responseFormat,
          thinking,
          streaming: false,
        })
      : null
  const nonStreamingSiliconFlowModel =
    provider === 'siliconflow' && stream && normalizedTools.length > 0
      ? buildSiliconFlowModel({
          apiKey,
          model,
          temperature,
          top_k,
          top_p,
          frequency_penalty,
          presence_penalty,
          responseFormat,
          tools: normalizedTools,
          toolChoice: effectiveToolChoice,
          thinking,
          streaming: false,
        })
      : null
  const nonStreamingOpenAIModel =
    provider === 'openai' && stream && normalizedTools.length > 0
      ? buildOpenAIModel({
          provider,
          apiKey,
          baseUrl,
          model,
          temperature,
          top_k,
          top_p,
          frequency_penalty,
          presence_penalty,
          tools: normalizedTools,
          toolChoice: effectiveToolChoice,
          responseFormat,
          thinking,
          streaming: false,
        })
      : null
  const nonStreamingToolModel =
    stream && normalizedTools.length > 0 && provider !== 'gemini'
      ? nonStreamingKimiModel ||
        nonStreamingModelScopeModel ||
        nonStreamingGlmModel ||
        nonStreamingSiliconFlowModel ||
        nonStreamingOpenAIModel
      : null
  const useNonStreamingToolCalls = Boolean(nonStreamingToolModel)

  if (debugStream) {
    console.log('[streamChat] Model created, calling stream()...')
  }

  // ============================================================================
  // STEP 6: Initialize accumulators and helper functions
  // ============================================================================
  let fullContent = '' // Accumulates all text content
  let fullThought = '' // Accumulates all thinking/reasoning content
  const toolCallsMap = new Map() // Stores tool calls by ID
  const sourcesMap = new Map() // Stores search sources
  const geminiSources = [] // Gemini-specific sources
  let groundingSupports = undefined // Gemini grounding supports for citation

  // Chunk buffer for streaming output
  const chunks = []

  // Helper: Add text content to accumulator and chunk buffer
  const emitText = text => {
    if (!text) return
    fullContent += text
    chunks.push({ type: 'text', content: text })
  }

  // Helper: Add thinking/reasoning content to accumulator and chunk buffer
  const emitThought = text => {
    if (!text) return
    fullThought += text
    chunks.push({ type: 'thought', content: text })
  }

  // Factory function to handle tagged text (e.g., <thinking>...</thinking>)
  const handleTaggedText = handleTaggedTextFactory({ emitText, emitThought })

  // ============================================================================
  // STEP 7: Main streaming logic
  // ============================================================================
  try {
    // ------------------------------------------------------------------------
    // GEMINI PROVIDER: Uses native Gemini SDK for streaming
    // Note: Gemini has a separate code path because its API is different
    // ------------------------------------------------------------------------
    if (provider === 'gemini') {
      // Build Gemini-specific payload
      const payload = buildGeminiPayload({
        messages: trimmedMessages,
        temperature,
        top_k,
        top_p,
        tools,
        thinking,
      })
      // Call Gemini's generateContentStream API
      const streamResponse = await modelInstance.client.generateContentStream(payload, { signal })
      const streamIterator = streamResponse?.stream || streamResponse

      // Process each streaming chunk from Gemini
      for await (const response of streamIterator) {
        // Extract grounding metadata (search sources) from Gemini response
        const groundingMetadata = response?.candidates?.[0]?.groundingMetadata
        if (debugSources && groundingMetadata && !loggedGemini) {
          loggedGemini = true
          console.log(
            '[streamChat] gemini groundingMetadata:',
            JSON.stringify(groundingMetadata).slice(0, 2000),
          )
        }
        // Collect search sources from grounding metadata
        if (groundingMetadata) {
          collectGeminiSources(groundingMetadata, geminiSources)
          if (Array.isArray(groundingMetadata.groundingSupports)) {
            groundingSupports = groundingMetadata.groundingSupports
          }
        }
        // Extract content parts from response
        const parts = response?.candidates?.[0]?.content?.parts || []
        if (!Array.isArray(parts)) continue
        // Process each part (text or thought)
        for (const part of parts) {
          const text = typeof part?.text === 'string' ? part.text : ''
          if (!text) continue
          if (part?.thought) {
            emitThought(text) // Reasoning/thinking content
          } else {
            handleTaggedText(text) // Regular text content
          }
        }

        // Yield accumulated chunks to frontend (streaming output)
        while (chunks.length > 0) {
          yield chunks.shift()
        }
      }

      // Gemini streaming complete - yield final result
      yield {
        type: 'done',
        content: fullContent,
        thought: fullThought || undefined,
        sources: geminiSources.length ? geminiSources : undefined,
        groundingSupports: groundingSupports?.length ? groundingSupports : undefined,
        toolCalls: toolCallsMap.size ? Array.from(toolCallsMap.values()) : undefined,
      }
      return // Exit for Gemini - doesn't use the while loop below
    }

    // ========================================================================
    // NON-GEMINI PROVIDERS: Use LangChain for streaming with tool calling
    // ========================================================================
    // These providers use a while loop for iterative tool calling:
    // Loop 1: Send user message → AI returns tool_calls
    // Loop 2: Execute tools, add results → AI returns final response

    let finalToolCalls = null // Store final tool calls to return
    let lastFinishReason = null // Track finish reason from AI
    let safetyCounter = 0 // Prevent infinite loops

    let preProcessedToolCall = false // Flag: tool calls already processed in this iteration

    // ------------------------------------------------------------------------
    // MAIN TOOL CALLING LOOP
    // This loop continues until AI returns content without tool_calls
    // or max iterations (3) is reached
    // ------------------------------------------------------------------------
    while (true) {
      safetyCounter += 1
      if (!useNonStreamingToolCalls && safetyCounter > 3) break // Safety limit for streaming path

      // ----------------------------------------------------------------------
      // NON-STREAMING TOOL CALLS (ALL PROVIDERS)
      // When tools are enabled, we always handle tool calls in non-streaming mode
      // and return the final answer as a single response.
      // ----------------------------------------------------------------------
      if (useNonStreamingToolCalls && !preProcessedToolCall) {
        const nonStreamMessages = toLangChainMessages(currentMessages)
        const response = await nonStreamingToolModel.invoke(
          nonStreamMessages,
          signal ? { signal } : undefined,
        )

        const finishReason = getFinishReasonFromResponse(response)
        const toolCalls = getToolCallsFromResponse(response)

        if (finishReason === 'tool_calls' && Array.isArray(toolCalls) && toolCalls.length > 0) {
          const assistantToolCalls = toolCalls
            .map(toolCall => {
              const toolName = getToolCallName(toolCall)
              const toolArgs = getToolCallArguments(toolCall)
              return {
                id: toolCall.id,
                type: toolCall.type,
                function: toolName
                  ? { name: toolName, arguments: formatToolArgumentsFromValue(toolArgs) }
                  : undefined,
              }
            })
            .filter(toolCall => toolCall?.id && toolCall?.function?.name)

          if (assistantToolCalls.length > 0) {
            currentMessages = [
              ...currentMessages,
              { role: 'assistant', content: '', tool_calls: assistantToolCalls },
            ]

            for (const toolCall of assistantToolCalls) {
              const rawArgs = getToolCallArguments(toolCall)
              const parsedArgs =
                typeof rawArgs === 'string' ? safeJsonParse(rawArgs) : rawArgs || {}
              yield buildToolCallEvent(toolCall, parsedArgs)
              const startedAt = Date.now()
              const toolName = toolCall.function.name

              if (!isLocalToolName(toolName)) {
                currentMessages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  name: toolName,
                  content: JSON.stringify({ error: `Unknown tool: ${toolName}` }),
                })
                yield buildToolResultEvent(
                  toolCall,
                  new Error(`Unknown tool: ${toolName}`),
                  Date.now() - startedAt,
                )
                continue
              }

              try {
                const result = await executeToolByName(toolName, parsedArgs || {}, toolConfig)
                if (isSearchToolName(toolName)) {
                  collectWebSearchSources(result, sourcesMap)
                }
                currentMessages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  name: toolName,
                  content: JSON.stringify(result),
                })
                yield buildToolResultEvent(toolCall, null, Date.now() - startedAt, result)
              } catch (error) {
                console.error(`Tool execution error (${toolName}):`, error)
                currentMessages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  name: toolName,
                  content: JSON.stringify({ error: `Tool execution failed: ${error.message}` }),
                })
                yield buildToolResultEvent(toolCall, error, Date.now() - startedAt)
              }
            }
          }

          preProcessedToolCall = true
          continue
        }
        preProcessedToolCall = true
      }

      // ----------------------------------------------------------------------
      // KIMI PROVIDER: Special handling (non-streaming for tool detection)
      // Kimi's streaming tool_calls has argument format issues, so we:
      // 1. First call non-streaming to check for tool_calls
      // 2. If tool_calls found, execute them and continue loop
      // 3. If no tool_calls, proceed with streaming response
      // ----------------------------------------------------------------------
      if (provider === 'kimi' && stream && !preProcessedToolCall) {
        // Convert messages to LangChain format
        const nonStreamMessages = toLangChainMessages(currentMessages)
        // Call Kimi in non-streaming mode to get tool_calls
        const response = await nonStreamingKimiModel.invoke(
          nonStreamMessages,
          signal ? { signal } : undefined,
        )

        // Extract finish reason and tool calls from response
        const finishReason = getFinishReasonFromResponse(response)
        const toolCalls = getToolCallsFromResponse(response)

        if (debugSources && response?.additional_kwargs?.__raw_response) {
          console.log(
            '[streamChat] kimi non-stream __raw_response:',
            JSON.stringify(response.additional_kwargs.__raw_response).slice(0, 4000),
          )
        }

        // Check if AI requested tool calls
        if (finishReason === 'tool_calls' && Array.isArray(toolCalls) && toolCalls.length > 0) {
          // Format tool calls into standard structure
          const assistantToolCalls = toolCalls
            .map(toolCall => {
              const toolName = getToolCallName(toolCall)
              const toolArgs = getToolCallArguments(toolCall)
              return {
                id: toolCall.id,
                type: toolCall.type,
                function: toolName
                  ? { name: toolName, arguments: formatToolArgumentsFromValue(toolArgs) }
                  : undefined,
              }
            })
            .filter(toolCall => toolCall?.id && toolCall?.function?.name)

          if (assistantToolCalls.length > 0) {
            // STEP A: Add assistant's tool_calls to message history
            // This records "AI requested to call these tools"
            currentMessages = [
              ...currentMessages,
              { role: 'assistant', content: '', tool_calls: assistantToolCalls },
            ]

            // STEP B: Execute each tool and add results to message history
            for (const toolCall of assistantToolCalls) {
              const rawArgs = getToolCallArguments(toolCall)
              const parsedArgs =
                typeof rawArgs === 'string' ? safeJsonParse(rawArgs) : rawArgs || {}
              yield buildToolCallEvent(toolCall, parsedArgs)
              const startedAt = Date.now()
              const toolArgs = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs ?? {})
              const toolName = toolCall.function.name

              // Check if this is a local tool (calculator, local_time, etc.)
              if (isLocalToolName(toolName)) {
                // Parse arguments and execute the tool locally
                try {
                  const result = await executeToolByName(toolName, parsedArgs || {}, toolConfig)
                  // Add tool result to message history
                  currentMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    name: toolName,
                    content: JSON.stringify(result), // Tool result as JSON string
                  })
                  yield buildToolResultEvent(toolCall, null, Date.now() - startedAt, result)
                } catch (error) {
                  console.error(`Tool execution error (${toolName}):`, error)
                  currentMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    name: toolName,
                    content: JSON.stringify({ error: `Tool execution failed: ${error.message}` }),
                  })
                  yield buildToolResultEvent(toolCall, error, Date.now() - startedAt)
                }
                continue // Process next tool call
              }
              // For non-local tools (external APIs), add args as content
              currentMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: toolCall.function.name,
                content: toolArgs,
              })
              yield buildToolResultEvent(toolCall, null, Date.now() - startedAt)
            }
          }

          // STEP C: Mark as processed and continue loop
          // Next iteration will call AI with updated currentMessages
          // that now includes tool results
          preProcessedToolCall = true
          continue // ← KEY: Go back to while(true) with tool results added
        }

        // No tool calls detected - fall through to general streaming path
        // This ensures user gets streaming output even when no tools are called
      }
      // ----------------------------------------------------------------------
      // MODELSCOPE PROVIDER: API doesn't support tools + stream together
      // GLM confirmed to support streaming tool_calls, so it uses general path
      // ----------------------------------------------------------------------
      if (nonStreamingModelScopeModel && !preProcessedToolCall) {
        const nonStreamMessages = toLangChainMessages(currentMessages)
        const response = await nonStreamingModelScopeModel.invoke(
          nonStreamMessages,
          signal ? { signal } : undefined,
        )

        const finishReason = getFinishReasonFromResponse(response)
        const toolCalls = getToolCallsFromResponse(response)

        // Check if AI requested tool calls
        if (finishReason === 'tool_calls' && Array.isArray(toolCalls) && toolCalls.length > 0) {
          const assistantToolCalls = toolCalls
            .map(toolCall => {
              const toolName = getToolCallName(toolCall)
              const toolArgs = getToolCallArguments(toolCall)
              return {
                id: toolCall.id,
                type: toolCall.type,
                function: toolName
                  ? { name: toolName, arguments: formatToolArgumentsFromValue(toolArgs) }
                  : undefined,
              }
            })
            .filter(toolCall => toolCall?.id && toolCall?.function?.name)

          if (assistantToolCalls.length > 0) {
            // Add assistant's tool_calls to message history
            currentMessages = [
              ...currentMessages,
              { role: 'assistant', content: '', tool_calls: assistantToolCalls },
            ]

            // Execute each tool
            for (const toolCall of assistantToolCalls) {
              const rawArgs = getToolCallArguments(toolCall)
              const parsedArgs =
                typeof rawArgs === 'string' ? safeJsonParse(rawArgs) : rawArgs || {}
              yield buildToolCallEvent(toolCall, parsedArgs)
              const startedAt = Date.now()
              const toolName = toolCall.function.name

              // Check if NOT a local tool - return error
              if (!isLocalToolName(toolName)) {
                currentMessages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  name: toolName,
                  content: JSON.stringify({ error: `Unknown tool: ${toolName}` }),
                })
                yield buildToolResultEvent(
                  toolCall,
                  new Error(`Unknown tool: ${toolName}`),
                  Date.now() - startedAt,
                )
                continue
              }
              // Execute local tool
              try {
                const result = await executeToolByName(toolName, parsedArgs || {}, toolConfig)
                currentMessages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  name: toolName,
                  content: JSON.stringify(result),
                })
                yield buildToolResultEvent(toolCall, null, Date.now() - startedAt, result)
              } catch (error) {
                console.error(`Tool execution error (${toolName}):`, error)
                currentMessages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  name: toolName,
                  content: JSON.stringify({ error: `Tool execution failed: ${error.message}` }),
                })
                yield buildToolResultEvent(toolCall, error, Date.now() - startedAt)
              }
            }
          }

          // Continue loop with tool results
          preProcessedToolCall = true
          continue
        }

        // No tool calls detected - fall through to general streaming path
        // This ensures user gets streaming output even when no tools are called
      }

      // ----------------------------------------------------------------------
      // GENERAL STREAMING: All providers use this path for streaming response
      // - OpenAI, SiliconFlow, GLM: Direct streaming (supports tool_calls in stream)
      // - Kimi, ModelScope: After tool calls processed via non-streaming,
      //   they also fall through here for the final streaming response
      // ----------------------------------------------------------------------
      const toolCallsMap = new Map() // Track tool calls during streaming
      const toolCallsByIndex = [] // Tool calls indexed by position
      lastFinishReason = null

      // Convert messages and start streaming
      const langchainMessages = toLangChainMessages(currentMessages)
      const streamIterator = await modelInstance.stream(
        langchainMessages,
        signal ? { signal } : undefined,
      )

      if (debugStream) {
        console.log('[streamChat] Stream created, iterating chunks...')
      }

      // Process each streaming chunk
      for await (const chunk of streamIterator) {
        const messageChunk = chunk?.message ?? chunk
        const contentValue = messageChunk?.content ?? chunk?.content

        // Debug logging for additional kwargs
        if (debugSources && !loggedAdditional && messageChunk?.additional_kwargs) {
          loggedAdditional = true
          console.log(
            '[streamChat] additional_kwargs:',
            JSON.stringify(messageChunk.additional_kwargs).slice(0, 2000),
          )
        }

        // Extract finish reason from raw response
        const rawFinishReason =
          messageChunk?.additional_kwargs?.__raw_response?.choices?.[0]?.finish_reason
        if (rawFinishReason) {
          lastFinishReason = rawFinishReason
        }

        // Debug log
        // console.log('[streamChat] chunk:', JSON.stringify({ contentValue }).slice(0, 200))

        // Collect search sources from GLM/ModelScope web_search results
        if (provider === 'glm' || provider === 'modelscope') {
          const rawResp = messageChunk?.additional_kwargs?.__raw_response
          if (debugSources && rawResp?.web_search) {
            console.log(
              '[streamChat] web_search payload:',
              JSON.stringify(rawResp.web_search).slice(0, 2000),
            )
          }
          collectGLMSources(rawResp?.web_search, sourcesMap)
        }

        // Collect search sources from Kimi search tool
        if (provider === 'kimi') {
          if (debugSources && messageChunk?.additional_kwargs?.__raw_response) {
            console.log(
              '[streamChat] kimi __raw_response:',
              JSON.stringify(messageChunk.additional_kwargs.__raw_response).slice(0, 4000),
            )
          }
          const toolResponses = messageChunk?.additional_kwargs?.tool_responses
          if (debugSources && Array.isArray(toolResponses) && toolResponses.length > 0) {
            console.log(
              '[streamChat] tool_responses payload:',
              JSON.stringify(toolResponses).slice(0, 2000),
            )
          }
          if (Array.isArray(toolResponses)) {
            for (const toolResp of toolResponses) {
              const toolName = getKimiToolName(toolResp)
              if (isSearchToolName(toolName)) {
                collectKimiSources(toolResp?.output || toolResp?.content, sourcesMap)
              }
            }
          }
        }

        // Handle Gemini array content format
        if (provider === 'gemini' && Array.isArray(contentValue)) {
          const parsed = parseGeminiParts(contentValue, {
            emitText,
            emitThought,
            handleTaggedText,
          })
          if (parsed) {
            while (chunks.length > 0) {
              yield chunks.shift()
            }
            continue
          }
        }

        // Process text content from chunk
        const chunkText = normalizeTextContent(contentValue)

        if (chunkText) {
          handleTaggedText(chunkText)
        }

        // ----------------------------------------------------------------
        // Collect tool_calls from streaming chunks
        // Tool calls come in fragments and need to be merged by index
        // ----------------------------------------------------------------
        const toolCalls =
          messageChunk?.tool_calls ||
          messageChunk?.additional_kwargs?.tool_calls ||
          messageChunk?.additional_kwargs?.tool_calls
        if (Array.isArray(toolCalls)) {
          mergeToolCallsByIndex(toolCallsByIndex, toolCalls) // Merge fragments
          updateToolCallsMap(toolCallsMap, toolCalls)
        }

        // Also check raw response for tool calls (OpenAI format)
        const rawToolCalls =
          messageChunk?.additional_kwargs?.__raw_response?.choices?.[0]?.delta?.tool_calls ||
          messageChunk?.additional_kwargs?.__raw_response?.choices?.[0]?.tool_calls
        if (Array.isArray(rawToolCalls)) {
          mergeToolCallsByIndex(toolCallsByIndex, rawToolCalls)
          updateToolCallsMap(toolCallsMap, rawToolCalls)
        }

        // Kimi-specific tool calls handling
        if (provider === 'kimi') {
          const kimiToolCalls =
            messageChunk?.additional_kwargs?.__raw_response?.choices?.[0]?.delta?.tool_calls
          if (Array.isArray(kimiToolCalls)) {
            mergeToolCallsByIndex(toolCallsByIndex, kimiToolCalls)
          }
          collectKimiSourcesFromToolCalls(toolCallsByIndex.filter(Boolean), sourcesMap)
        }

        // Extract reasoning/thinking content
        const reasoning =
          messageChunk?.additional_kwargs?.__raw_response?.choices?.[0]?.delta?.reasoning_content ||
          messageChunk?.additional_kwargs?.__raw_response?.choices?.[0]?.delta?.reasoning ||
          messageChunk?.additional_kwargs?.reasoning_content ||
          messageChunk?.additional_kwargs?.reasoning

        if (reasoning) {
          emitThought(String(reasoning))
        }

        // Yield accumulated chunks to frontend (streaming output)
        while (chunks.length > 0) {
          yield chunks.shift()
        }
      }

      // ----------------------------------------------------------------
      // POST-STREAMING: Check if AI returned tool_calls during stream
      // If so, execute tools and loop back for another AI call
      // ----------------------------------------------------------------
      if (provider === 'kimi') {
        // Kimi: Collect all tool calls from streaming
        const toolCallsList = toolCallsByIndex.filter(Boolean)
        finalToolCalls = toolCallsList.length ? toolCallsList : null

        // Check if we should handle tool calls
        const shouldHandleToolCalls =
          !useNonStreamingToolCalls &&
          (lastFinishReason === 'tool_calls' || !lastFinishReason) &&
          toolCallsList.length > 0
        if (shouldHandleToolCalls) {
          // Format tool calls
          const assistantToolCalls = toolCallsList
            .map(toolCall => {
              const toolName = getToolCallName(toolCall)
              const toolArgs = getToolCallArguments(toolCall)
              return {
                id: toolCall.id,
                type: toolCall.type,
                function: toolName
                  ? { name: toolName, arguments: formatToolArgumentsFromValue(toolArgs) }
                  : undefined,
              }
            })
            .filter(toolCall => toolCall?.id && toolCall?.function?.name)

          if (assistantToolCalls.length > 0) {
            // Add assistant's tool_calls to message history
            currentMessages = [
              ...currentMessages,
              { role: 'assistant', content: '', tool_calls: assistantToolCalls },
            ]

            // Execute each tool and add results
            for (const toolCall of assistantToolCalls) {
              const rawArgs = getToolCallArguments(toolCall)
              const toolArgs = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs ?? {})
              const toolName = toolCall.function.name
              const parsedArgs =
                typeof rawArgs === 'string' ? safeJsonParse(rawArgs) : rawArgs || {}
              yield buildToolCallEvent(toolCall, parsedArgs)
              const startedAt = Date.now()
              if (isLocalToolName(toolName)) {
                try {
                  const result = await executeToolByName(toolName, parsedArgs || {}, toolConfig)
                  // Special handling for search tool: collect sources for UI
                  if (isSearchToolName(toolName)) {
                    collectWebSearchSources(result, sourcesMap)
                  }

                  currentMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    name: toolName,
                    content: JSON.stringify(result),
                  })
                  yield buildToolResultEvent(toolCall, null, Date.now() - startedAt, result)
                } catch (error) {
                  console.error(`Tool execution error (${toolName}):`, error)
                  currentMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    name: toolName,
                    content: JSON.stringify({ error: `Tool execution failed: ${error.message}` }),
                  })
                  yield buildToolResultEvent(toolCall, error, Date.now() - startedAt)
                }
                continue
              }
              currentMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: toolCall.function.name,
                content: toolArgs,
              })
              yield buildToolResultEvent(toolCall, null, Date.now() - startedAt)
            }

            continue // ← Loop back to call AI again with tool results
          }
        }
        if (
          useNonStreamingToolCalls &&
          lastFinishReason === 'tool_calls' &&
          toolCallsList.length === 0 &&
          nonStreamingKimiModel
        ) {
          const nonStreamMessages = toLangChainMessages(currentMessages)
          const response = await nonStreamingKimiModel.invoke(
            nonStreamMessages,
            signal ? { signal } : undefined,
          )
          const finishReason = getFinishReasonFromResponse(response)
          const toolCalls = getToolCallsFromResponse(response)
          if (finishReason === 'tool_calls' && Array.isArray(toolCalls) && toolCalls.length > 0) {
            const assistantToolCalls = toolCalls
              .map(toolCall => {
                const toolName = getToolCallName(toolCall)
                const toolArgs = getToolCallArguments(toolCall)
                return {
                  id: toolCall.id,
                  type: toolCall.type,
                  function: toolName
                    ? { name: toolName, arguments: formatToolArgumentsFromValue(toolArgs) }
                    : undefined,
                }
              })
              .filter(toolCall => toolCall?.id && toolCall?.function?.name)

            if (assistantToolCalls.length > 0) {
              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content: '', tool_calls: assistantToolCalls },
              ]

              for (const toolCall of assistantToolCalls) {
                const rawArgs = getToolCallArguments(toolCall)
                const toolArgs =
                  typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs ?? {})
                const toolName = toolCall.function.name
                const parsedArgs =
                  typeof rawArgs === 'string' ? safeJsonParse(rawArgs) : rawArgs || {}
                yield buildToolCallEvent(toolCall, parsedArgs)
                const startedAt = Date.now()
                if (isLocalToolName(toolName)) {
                  try {
                    const result = await executeToolByName(toolName, parsedArgs || {}, toolConfig)
                    if (isSearchToolName(toolName)) {
                      collectWebSearchSources(result, sourcesMap)
                    }

                    currentMessages.push({
                      role: 'tool',
                      tool_call_id: toolCall.id,
                      name: toolName,
                      content: JSON.stringify(result),
                    })
                    yield buildToolResultEvent(toolCall, null, Date.now() - startedAt, result)
                  } catch (error) {
                    console.error(`Tool execution error (${toolName}):`, error)
                    currentMessages.push({
                      role: 'tool',
                      tool_call_id: toolCall.id,
                      name: toolName,
                      content: JSON.stringify({ error: `Tool execution failed: ${error.message}` }),
                    })
                    yield buildToolResultEvent(toolCall, error, Date.now() - startedAt)
                  }
                  continue
                }
                currentMessages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  name: toolCall.function.name,
                  content: toolArgs,
                })
                yield buildToolResultEvent(toolCall, null, Date.now() - startedAt)
              }

              continue
            }
          }
        }
      } else {
        // ----------------------------------------------------------------
        // OTHER PROVIDERS (OpenAI, SiliconFlow, etc.)
        // Same logic: check for tool_calls, execute, and loop if needed
        // ----------------------------------------------------------------
        const toolCallsList = toolCallsByIndex.filter(Boolean)
        finalToolCalls = toolCallsList.length ? toolCallsList : null
        const shouldHandleToolCalls =
          (lastFinishReason === 'tool_calls' || !lastFinishReason) && toolCallsList.length > 0
        if (shouldHandleToolCalls) {
          const assistantToolCalls = toolCallsList
            .map(toolCall => {
              const toolName = getToolCallName(toolCall)
              const toolArgs = getToolCallArguments(toolCall)
              return {
                id: toolCall.id,
                type: toolCall.type,
                function: toolName
                  ? { name: toolName, arguments: formatToolArgumentsFromValue(toolArgs) }
                  : undefined,
              }
            })
            .filter(toolCall => toolCall?.id && toolCall?.function?.name)

          if (assistantToolCalls.length > 0) {
            // Add assistant's tool_calls to message history
            currentMessages = [
              ...currentMessages,
              { role: 'assistant', content: '', tool_calls: assistantToolCalls },
            ]

            // Execute each tool
            for (const toolCall of assistantToolCalls) {
              const rawArgs = getToolCallArguments(toolCall)
              const parsedArgs =
                typeof rawArgs === 'string' ? safeJsonParse(rawArgs) : rawArgs || {}
              yield buildToolCallEvent(toolCall, parsedArgs)
              const startedAt = Date.now()
              const toolName = toolCall.function.name

              // Unknown tool: return error message
              if (!isLocalToolName(toolName)) {
                currentMessages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  name: toolName,
                  content: JSON.stringify({ error: `Unknown tool: ${toolName}` }),
                })
                yield buildToolResultEvent(
                  toolCall,
                  new Error(`Unknown tool: ${toolName}`),
                  Date.now() - startedAt,
                )
                continue
              }

              // Execute local tool with error handling
              try {
                const result = await executeToolByName(toolName, parsedArgs || {}, toolConfig)

                // Special handling for search tool: collect sources for UI
                if (isSearchToolName(toolName)) {
                  collectWebSearchSources(result, sourcesMap)
                }

                currentMessages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  name: toolName,
                  content: JSON.stringify(result),
                })
                yield buildToolResultEvent(toolCall, null, Date.now() - startedAt, result)
              } catch (error) {
                console.error(`Tool execution error (${toolName}):`, error)
                currentMessages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  name: toolName,
                  content: JSON.stringify({ error: `Tool execution failed: ${error.message}` }),
                })
                yield buildToolResultEvent(toolCall, error, Date.now() - startedAt)
              }
            }

            continue // ← Loop back to call AI again with tool results
          }
        }
        if (
          useNonStreamingToolCalls &&
          lastFinishReason === 'tool_calls' &&
          toolCallsList.length === 0 &&
          nonStreamingToolModel
        ) {
          const nonStreamMessages = toLangChainMessages(currentMessages)
          const response = await nonStreamingToolModel.invoke(
            nonStreamMessages,
            signal ? { signal } : undefined,
          )
          const finishReason = getFinishReasonFromResponse(response)
          const toolCalls = getToolCallsFromResponse(response)
          if (finishReason === 'tool_calls' && Array.isArray(toolCalls) && toolCalls.length > 0) {
            const assistantToolCalls = toolCalls
              .map(toolCall => {
                const toolName = getToolCallName(toolCall)
                const toolArgs = getToolCallArguments(toolCall)
                return {
                  id: toolCall.id,
                  type: toolCall.type,
                  function: toolName
                    ? { name: toolName, arguments: formatToolArgumentsFromValue(toolArgs) }
                    : undefined,
                }
              })
              .filter(toolCall => toolCall?.id && toolCall?.function?.name)

            if (assistantToolCalls.length > 0) {
              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content: '', tool_calls: assistantToolCalls },
              ]

              for (const toolCall of assistantToolCalls) {
                const rawArgs = getToolCallArguments(toolCall)
                const toolArgs =
                  typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs ?? {})
                const toolName = toolCall.function.name
                const parsedArgs =
                  typeof rawArgs === 'string' ? safeJsonParse(rawArgs) : rawArgs || {}
                yield buildToolCallEvent(toolCall, parsedArgs)
                const startedAt = Date.now()

                if (!isLocalToolName(toolName)) {
                  currentMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    name: toolName,
                    content: JSON.stringify({ error: `Unknown tool: ${toolName}` }),
                  })
                  yield buildToolResultEvent(
                    toolCall,
                    new Error(`Unknown tool: ${toolName}`),
                    Date.now() - startedAt,
                  )
                  continue
                }

                try {
                  const result = await executeToolByName(toolName, parsedArgs || {}, toolConfig)
                  if (isSearchToolName(toolName)) {
                    collectWebSearchSources(result, sourcesMap)
                  }
                  currentMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    name: toolName,
                    content: JSON.stringify(result),
                  })
                  yield buildToolResultEvent(toolCall, null, Date.now() - startedAt, result)
                } catch (error) {
                  console.error(`Tool execution error (${toolName}):`, error)
                  currentMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    name: toolName,
                    content: JSON.stringify({ error: `Tool execution failed: ${error.message}` }),
                  })
                  yield buildToolResultEvent(toolCall, error, Date.now() - startedAt)
                }
              }

              continue
            }
          }
        }
      }

      // No more tool calls - exit the while loop
      break
    }

    // ========================================================================
    // STEP 9: Final result - streaming complete
    // ========================================================================
    if (debugStream) {
      console.log(
        '[streamChat] Stream completed, yielding done. Content length:',
        fullContent.length,
      )
    }
    // Yield final result with all accumulated content
    yield {
      type: 'done',
      content: fullContent, // Complete response text
      thought: fullThought || undefined, // Complete thinking/reasoning
      sources: sourcesMap.size ? Array.from(sourcesMap.values()) : undefined, // Search sources
      toolCalls: finalToolCalls || undefined, // Any tool calls made
    }
  } catch (error) {
    // ========================================================================
    // ERROR HANDLING
    // ========================================================================
    console.error('[streamChat] Error caught:', error.message)
    if (signal?.aborted) return // Don't yield error if request was cancelled
    yield {
      type: 'error',
      error: error.message || 'Streaming error',
    }
  }
}
