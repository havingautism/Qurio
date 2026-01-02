/**
 * Stream Chat service
 * Handles streaming chat completion with support for multiple AI providers
 */

import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { normalizeTextContent, safeJsonParse, toLangChainMessages } from './serviceUtils.js'

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
  toolCall?.tool?.function?.arguments ||
  null

const collectKimiSourcesFromToolCalls = (toolCalls, sourcesMap) => {
  if (!Array.isArray(toolCalls)) return
  for (const toolCall of toolCalls) {
    const toolName = getToolCallName(toolCall)
    if (toolName !== '$web_search' && toolName !== 'web_search' && toolName !== 'search') continue
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
export const streamChat = async function* (params) {
  const debugStream = process.env.DEBUG_STREAM === '1'
  if (debugStream) {
    console.log('[streamChat] Starting with provider:', params.provider)
  }

  const {
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
    stream = true,
    signal,
  } = params
  const debugSources = process.env.DEBUG_SOURCES === '1'
  let loggedAdditional = false
  let loggedGemini = false

  const trimmedMessages = applyContextLimitRaw(messages, contextMessageLimit)
  let currentMessages = trimmedMessages

  if (debugStream) {
    console.log('[streamChat] Messages prepared, count:', langchainMessages.length)
  }

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
          tools,
          toolChoice,
          responseFormat,
          thinking,
          streaming: false,
        })
      : null

  if (debugStream) {
    console.log('[streamChat] Model created, calling stream()...')
  }

  let fullContent = ''
  let fullThought = ''
  const toolCallsMap = new Map()
  const sourcesMap = new Map()
  const geminiSources = []
  let groundingSupports = undefined

  const chunks = []

  const emitText = text => {
    if (!text) return
    fullContent += text
    chunks.push({ type: 'text', content: text })
  }

  const emitThought = text => {
    if (!text) return
    fullThought += text
    chunks.push({ type: 'thought', content: text })
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
      const streamIterator = streamResponse?.stream || streamResponse

      for await (const response of streamIterator) {
        const groundingMetadata = response?.candidates?.[0]?.groundingMetadata
        if (debugSources && groundingMetadata && !loggedGemini) {
          loggedGemini = true
          console.log(
            '[streamChat] gemini groundingMetadata:',
            JSON.stringify(groundingMetadata).slice(0, 2000),
          )
        }
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

        // Yield accumulated chunks
        while (chunks.length > 0) {
          yield chunks.shift()
        }
      }

      // Final result
      yield {
        type: 'done',
        content: fullContent,
        thought: fullThought || undefined,
        sources: geminiSources.length ? geminiSources : undefined,
        groundingSupports: groundingSupports?.length ? groundingSupports : undefined,
        toolCalls: toolCallsMap.size ? Array.from(toolCallsMap.values()) : undefined,
      }
      return
    }

    let finalToolCalls = null
    let lastFinishReason = null
    let safetyCounter = 0

    let preProcessedToolCall = false

    while (true) {
      safetyCounter += 1
      if (safetyCounter > 3) break

      if (provider === 'kimi' && stream && !preProcessedToolCall) {
        const nonStreamMessages = toLangChainMessages(currentMessages)
        const response = await nonStreamingKimiModel.invoke(
          nonStreamMessages,
          signal ? { signal } : undefined,
        )

        const finishReason = getFinishReasonFromResponse(response)
        const toolCalls = getToolCallsFromResponse(response)

        if (debugSources && response?.additional_kwargs?.__raw_response) {
          console.log(
            '[streamChat] kimi non-stream __raw_response:',
            JSON.stringify(response.additional_kwargs.__raw_response).slice(0, 4000),
          )
        }

        if (finishReason === 'tool_calls' && Array.isArray(toolCalls) && toolCalls.length > 0) {
          const assistantToolCalls = toolCalls
            .map(toolCall => ({
              id: toolCall.id,
              type: toolCall.type,
              function: toolCall.function
                ? { name: toolCall.function.name, arguments: toolCall.function.arguments || '' }
                : undefined,
            }))
            .filter(toolCall => toolCall?.id && toolCall?.function?.name)

          if (assistantToolCalls.length > 0) {
            currentMessages = [
              ...currentMessages,
              { role: 'assistant', content: '', tool_calls: assistantToolCalls },
            ]

            for (const toolCall of assistantToolCalls) {
              const rawArgs = getToolCallArguments(toolCall)
              const toolArgs = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs ?? {})
              currentMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: toolCall.function.name,
                content: toolArgs,
              })
            }
          }

          preProcessedToolCall = true
          continue
        }

        const contentValue = getResponseContent(response)
        const chunkText = normalizeTextContent(contentValue)
        if (chunkText) {
          handleTaggedText(chunkText)
          while (chunks.length > 0) {
            yield chunks.shift()
          }
        }

        const reasoning = getResponseReasoning(response)
        if (reasoning) {
          emitThought(String(reasoning))
          while (chunks.length > 0) {
            yield chunks.shift()
          }
        }

        yield {
          type: 'done',
          content: fullContent,
          thought: fullThought || undefined,
          sources: sourcesMap.size ? Array.from(sourcesMap.values()) : undefined,
          toolCalls: undefined,
        }
        return
      }

      const toolCallsMap = new Map()
      const toolCallsByIndex = []
      lastFinishReason = null

      const langchainMessages = toLangChainMessages(currentMessages)
      const streamIterator = await modelInstance.stream(
        langchainMessages,
        signal ? { signal } : undefined,
      )

      if (debugStream) {
        console.log('[streamChat] Stream created, iterating chunks...')
      }

      for await (const chunk of streamIterator) {
        const messageChunk = chunk?.message ?? chunk
        const contentValue = messageChunk?.content ?? chunk?.content
        if (debugSources && !loggedAdditional && messageChunk?.additional_kwargs) {
          loggedAdditional = true
          console.log(
            '[streamChat] additional_kwargs:',
            JSON.stringify(messageChunk.additional_kwargs).slice(0, 2000),
          )
        }

        const rawFinishReason =
          messageChunk?.additional_kwargs?.__raw_response?.choices?.[0]?.finish_reason
        if (rawFinishReason) {
          lastFinishReason = rawFinishReason
        }

        // Debug log
        // console.log('[streamChat] chunk:', JSON.stringify({ contentValue }).slice(0, 200))

        // Process GLM web_search results
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

        // Process Kimi web_search tool results
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
              if (
                toolName === '$web_search' ||
                toolName === 'web_search' ||
                toolName === 'search'
              ) {
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
          if (parsed) {
            while (chunks.length > 0) {
              yield chunks.shift()
            }
            continue
          }
        }

        const chunkText = normalizeTextContent(contentValue)

        if (chunkText) {
          handleTaggedText(chunkText)
        }

        const toolCalls = messageChunk?.additional_kwargs?.tool_calls
        if (toolCalls) {
          if (provider === 'kimi') {
            mergeToolCallsByIndex(toolCallsByIndex, toolCalls)
          } else {
            updateToolCallsMap(toolCallsMap, toolCalls)
          }
        }

        if (provider === 'kimi') {
          const rawToolCalls =
            messageChunk?.additional_kwargs?.__raw_response?.choices?.[0]?.delta?.tool_calls
          if (Array.isArray(rawToolCalls)) {
            mergeToolCallsByIndex(toolCallsByIndex, rawToolCalls)
          }
          collectKimiSourcesFromToolCalls(toolCallsByIndex.filter(Boolean), sourcesMap)
        }

        const reasoning =
          messageChunk?.additional_kwargs?.__raw_response?.choices?.[0]?.delta?.reasoning_content ||
          messageChunk?.additional_kwargs?.__raw_response?.choices?.[0]?.delta?.reasoning ||
          messageChunk?.additional_kwargs?.reasoning_content ||
          messageChunk?.additional_kwargs?.reasoning

        if (reasoning) {
          emitThought(String(reasoning))
        }

        // Yield accumulated chunks
        while (chunks.length > 0) {
          yield chunks.shift()
        }
      }

      if (provider === 'kimi') {
        const toolCallsList = toolCallsByIndex.filter(Boolean)
        finalToolCalls = toolCallsList.length ? toolCallsList : null

        if (lastFinishReason === 'tool_calls' && toolCallsList.length > 0) {
          const assistantToolCalls = toolCallsList
            .map(toolCall => ({
              id: toolCall.id,
              type: toolCall.type,
              function: toolCall.function
                ? { name: toolCall.function.name, arguments: toolCall.function.arguments || '' }
                : undefined,
            }))
            .filter(toolCall => toolCall?.id && toolCall?.function?.name)

          if (assistantToolCalls.length > 0) {
            currentMessages = [
              ...currentMessages,
              { role: 'assistant', content: '', tool_calls: assistantToolCalls },
            ]

            for (const toolCall of assistantToolCalls) {
              const rawArgs = getToolCallArguments(toolCall)
              const toolArgs = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs ?? {})
              currentMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: toolCall.function.name,
                content: toolArgs,
              })
            }

            continue
          }
        }
      } else {
        finalToolCalls = toolCallsMap.size ? Array.from(toolCallsMap.values()) : null
      }

      break
    }

    // Final result
    if (debugStream) {
      console.log(
        '[streamChat] Stream completed, yielding done. Content length:',
        fullContent.length,
      )
    }
    yield {
      type: 'done',
      content: fullContent,
      thought: fullThought || undefined,
      sources: sourcesMap.size ? Array.from(sourcesMap.values()) : undefined,
      toolCalls: finalToolCalls || undefined,
    }
  } catch (error) {
    console.error('[streamChat] Error caught:', error.message)
    if (signal?.aborted) return
    yield {
      type: 'error',
      error: error.message || 'Streaming error',
    }
  }
}
