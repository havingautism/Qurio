/**
 * Stream Chat service
 * Handles streaming chat completion with support for multiple AI providers
 */

import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'

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
  kimi: 'moonshot-v1-8k'
}

/**
 * Safely parse JSON from string
 */
const safeJsonParse = (text) => {
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
 * Normalize text content to string
 */
const normalizeTextContent = (content) => {
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
  return content ? String(content) : ''
}

/**
 * Normalize message content parts
 */
const normalizeParts = (content) => {
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
 * Convert message format to LangChain messages
 */
const toLangChainMessages = (messages) => {
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

/**
 * Normalize Gemini messages - system messages first
 */
const normalizeGeminiMessages = (messages) => {
  if (!Array.isArray(messages) || messages.length === 0) return messages
  const systemMessages = messages.filter(m => m?.role === 'system')
  const nonSystemMessages = messages.filter(m => m?.role !== 'system')
  if (systemMessages.length === 0) return messages
  return [...systemMessages, ...nonSystemMessages]
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

  const payload = { contents }
  if (Object.keys(generationConfig).length > 0) {
    payload.generationConfig = generationConfig
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
    if (part?.type === 'text') {
      handleTaggedText(part.text)
      hasProcessed = true
    }
  }
  return hasProcessed
}

/**
 * Factory for handleTaggedText function
 */
const handleTaggedTextFactory = ({ emitText, emitThought }) => {
  const THOUGHT_START = '<thought>'
  const THOUGHT_END = '</thought>'
  const SOURCE_START = '<source>'
  const SOURCE_END = '</source>'

  return (text) => {
    if (!text) return

    let remaining = text
    let depth = 0

    while (remaining) {
      const thoughtStartIdx = remaining.indexOf(THOUGHT_START)
      const thoughtEndIdx = remaining.indexOf(THOUGHT_END)

      if (thoughtStartIdx === -1 && thoughtEndIdx === -1) {
        emitText(remaining)
        break
      }

      if (thoughtStartIdx !== -1 && (thoughtEndIdx === -1 || thoughtStartIdx < thoughtEndIdx)) {
        if (thoughtStartIdx > 0) {
          emitText(remaining.slice(0, thoughtStartIdx))
        }
        depth++
        remaining = remaining.slice(thoughtStartIdx + THOUGHT_START.length)
      } else if (thoughtEndIdx !== -1) {
        if (thoughtEndIdx > 0) {
          emitThought(remaining.slice(0, thoughtEndIdx))
        }
        depth--
        remaining = remaining.slice(thoughtEndIdx + THOUGHT_END.length)
      } else {
        break
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
    if (!item || !item.link) continue
    const url = item.link
    if (sourcesMap.has(url)) continue

    sourcesMap.set(url, {
      url,
      title: item.title || '',
      snippet: item.content || item.snippet || ''
    })
  }
}

/**
 * Collect Kimi web search sources
 */
const collectKimiSources = (toolOutput, sourcesMap) => {
  if (!toolOutput) return

  const results = toolOutput.results || toolOutput
  if (!Array.isArray(results)) return

  for (const item of results) {
    if (!item || !item.url) continue
    const url = item.url
    if (sourcesMap.has(url)) continue

    sourcesMap.set(url, {
      url,
      title: item.title || '',
      snippet: item.content || item.snippet || ''
    })
  }
}

/**
 * Collect Gemini grounding sources
 */
const collectGeminiSources = (groundingMetadata, geminiSources) => {
  if (!groundingMetadata) return

  const chunks = groundingMetadata.groundingChunks || []
  for (const chunk of chunks) {
    if (!chunk || !chunk.web) continue
    const uri = chunk.web.uri
    if (!uri) continue

    if (!geminiSources.find(s => s.url === uri)) {
      geminiSources.push({
        url: uri,
        title: chunk.web.title || '',
        snippet: chunk.web.snippet || ''
      })
    }
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

// ============================================================================
// Model builders
// ============================================================================

const buildGeminiModel = ({ apiKey, model, temperature, top_k, top_p, tools, thinking, streaming }) => {
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

const buildSiliconFlowModel = ({ apiKey, model, temperature, top_k, top_p, frequency_penalty, presence_penalty, tools, toolChoice, responseFormat, thinking, streaming }) => {
  if (!apiKey) throw new Error('Missing API key')

  const modelKwargs = {}
  modelKwargs.response_format = responseFormat || { type: 'text' }
  if (top_k !== undefined) modelKwargs.top_k = top_k
  if (top_p !== undefined) modelKwargs.top_p = top_p
  if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
  if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty

  return new ChatOpenAI({
    apiKey,
    modelName: model || DEFAULT_MODELS.siliconflow,
    temperature,
    streaming,
    modelKwargs,
    configuration: { baseURL: SILICONFLOW_BASE }
  })
}

const buildGLMModel = ({ apiKey, model, temperature, top_k, top_p, frequency_penalty, presence_penalty, tools, toolChoice, responseFormat, thinking, streaming }) => {
  if (!apiKey) throw new Error('Missing API key')

  const modelKwargs = {}
  if (responseFormat) modelKwargs.response_format = responseFormat
  modelKwargs.thinking = { type: thinking?.type || 'disabled' }
  if (top_k !== undefined) modelKwargs.top_k = top_k
  if (top_p !== undefined) modelKwargs.top_p = top_p
  if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
  if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty

  return new ChatOpenAI({
    apiKey,
    modelName: model || DEFAULT_MODELS.glm,
    temperature,
    streaming,
    modelKwargs,
    configuration: { baseURL: GLM_BASE }
  })
}

const buildModelScopeModel = ({ apiKey, model, temperature, top_k, top_p, frequency_penalty, presence_penalty, tools, toolChoice, responseFormat, thinking, streaming }) => {
  if (!apiKey) throw new Error('Missing API key')

  const modelKwargs = {}
  if (responseFormat) modelKwargs.response_format = responseFormat
  modelKwargs.thinking = { type: thinking?.type || 'disabled' }
  if (top_k !== undefined) modelKwargs.top_k = top_k
  if (top_p !== undefined) modelKwargs.top_p = top_p
  if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
  if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty

  return new ChatOpenAI({
    apiKey,
    modelName: model || DEFAULT_MODELS.modelscope,
    temperature,
    streaming,
    modelKwargs,
    configuration: { baseURL: MODELSCOPE_BASE }
  })
}

const buildKimiModel = ({ apiKey, model, temperature, top_k, top_p, frequency_penalty, presence_penalty, tools, toolChoice, responseFormat, thinking, streaming }) => {
  if (!apiKey) throw new Error('Missing API key')

  const modelKwargs = {}
  if (responseFormat) modelKwargs.response_format = responseFormat
  if (top_k !== undefined) modelKwargs.top_k = top_k
  if (top_p !== undefined) modelKwargs.top_p = top_p
  if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
  if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty

  return new ChatOpenAI({
    apiKey,
    modelName: model || DEFAULT_MODELS.kimi,
    temperature,
    streaming,
    modelKwargs,
    configuration: { baseURL: KIMI_BASE }
  })
}

const buildOpenAIModel = ({ provider, apiKey, baseUrl, model, temperature, top_k, top_p, frequency_penalty, presence_penalty, tools, toolChoice, responseFormat, thinking, streaming }) => {
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

  return new ChatOpenAI({
    apiKey,
    modelName: model || DEFAULT_MODELS.openai,
    temperature,
    streaming,
    modelKwargs,
    configuration: { baseURL: resolvedBase }
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
  console.log('[streamChat] Starting with provider:', params.provider)

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

  const trimmedMessages = applyContextLimitRaw(messages, contextMessageLimit)
  const langchainMessages = toLangChainMessages(trimmedMessages)

  console.log('[streamChat] Messages prepared, count:', langchainMessages.length)

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

  console.log('[streamChat] Model created, calling stream()...')

  let fullContent = ''
  let fullThought = ''
  const toolCallsMap = new Map()
  const sourcesMap = new Map()
  const geminiSources = []
  let groundingSupports = undefined

  const chunks = []

  const emitText = (text) => {
    if (!text) return
    fullContent += text
    chunks.push({ type: 'text', content: text })
  }

  const emitThought = (text) => {
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

    const stream = await modelInstance.stream(langchainMessages, signal ? { signal } : undefined)

    console.log('[streamChat] Stream created, iterating chunks...')

    for await (const chunk of stream) {
      const messageChunk = chunk?.message ?? chunk
      const contentValue = messageChunk?.content ?? chunk?.content

      // Debug log
      console.log('[streamChat] chunk:', JSON.stringify({ contentValue }).slice(0, 200))

      // Process GLM web_search results
      if (provider === 'glm' || provider === 'modelscope') {
        const rawResp = messageChunk?.additional_kwargs?.__raw_response
        collectGLMSources(rawResp?.web_search, sourcesMap)
      }

      // Process Kimi web_search tool results
      if (provider === 'kimi') {
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

      // Yield accumulated chunks
      while (chunks.length > 0) {
        yield chunks.shift()
      }
    }

    // Final result
    console.log('[streamChat] Stream completed, yielding done. Content length:', fullContent.length)
    yield {
      type: 'done',
      content: fullContent,
      thought: fullThought || undefined,
      sources: sourcesMap.size ? Array.from(sourcesMap.values()) : undefined,
      toolCalls: toolCallsMap.size ? Array.from(toolCallsMap.values()) : undefined,
    }
  } catch (error) {
    console.log('[streamChat] Error caught:', error.message)
    if (signal?.aborted) return
    yield {
      type: 'error',
      error: error.message || 'Streaming error'
    }
  }
}
