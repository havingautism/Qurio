import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { getPublicEnv } from './publicEnv'

const OPENAI_DEFAULT_BASE = 'https://api.openai.com/v1'
const SILICONFLOW_BASE = 'https://api.siliconflow.cn/v1'

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

const applyContextLimitRaw = (messages, limit) => {
  const numericLimit = parseInt(limit, 10)
  if (!Array.isArray(messages) || !numericLimit || numericLimit < 1) return messages

  const systemMessages = messages.filter(m => m?.role === 'system')
  const nonSystemMessages = messages.filter(m => m?.role !== 'system')
  const trimmedNonSystem = nonSystemMessages.slice(-numericLimit)

  return [...systemMessages, ...trimmedNonSystem]
}

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

const resolveOpenAIBase = (provider, baseUrl) => {
  if (provider === 'siliconflow') return SILICONFLOW_BASE
  return baseUrl || getPublicEnv('PUBLIC_OPENAI_BASE_URL') || OPENAI_DEFAULT_BASE
}

const buildOpenAIModel = ({
  provider,
  apiKey,
  baseUrl,
  model,
  temperature,
  top_k,
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
  const resolvedBase = resolveOpenAIBase(provider, baseUrl)

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
  if (streaming) {
    modelKwargs.stream_options = { include_usage: false }
  }

  let modelInstance = new ChatOpenAI({
    openAIApiKey: resolvedKey,
    modelName: model,
    temperature,
    streaming,
    streamUsage: false,
    __includeRawResponse: true,
    modelKwargs,
    configuration: { baseURL: resolvedBase, dangerouslyAllowBrowser: true },
  })

  const bindParams = {}
  if (tools && tools.length > 0) bindParams.tools = tools
  if (toolChoice) bindParams.tool_choice = toolChoice
  if (responseFormat && provider !== 'siliconflow') {
    bindParams.response_format = responseFormat
  }
  if (thinking?.extra_body) bindParams.extra_body = thinking.extra_body
  if (top_k !== undefined && provider !== 'siliconflow') {
    bindParams.extra_body = { ...(bindParams.extra_body || {}), top_k }
  }

  if (Object.keys(bindParams).length) {
    modelInstance = modelInstance.bind(bindParams)
  }

  return modelInstance
}

const buildSiliconFlowModel = ({
  apiKey,
  model,
  temperature,
  top_k,
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
  if (streaming) {
    modelKwargs.stream_options = { include_usage: false }
  }

  let modelInstance = new ChatOpenAI({
    openAIApiKey: resolvedKey,
    modelName: model,
    temperature,
    streaming,
    streamUsage: false,
    __includeRawResponse: true,
    modelKwargs,
    configuration: { baseURL: resolvedBase, dangerouslyAllowBrowser: true },
  })

  const bindParams = {}
  if (tools && tools.length > 0) bindParams.tools = tools
  if (toolChoice) bindParams.tool_choice = toolChoice
  if (responseFormat) bindParams.response_format = responseFormat
  if (thinking?.extra_body) bindParams.extra_body = thinking.extra_body
  if (top_k !== undefined) bindParams.extra_body = { ...(bindParams.extra_body || {}), top_k }

  if (Object.keys(bindParams).length) {
    modelInstance = modelInstance.bind(bindParams)
  }

  return modelInstance
}
const buildGeminiModel = ({ apiKey, model, temperature, top_k, tools, thinking, streaming }) => {
  const resolvedKey = apiKey || getPublicEnv('PUBLIC_GOOGLE_API_KEY')
  if (!resolvedKey) {
    throw new Error('Missing API key')
  }

  let modelInstance = new ChatGoogleGenerativeAI({
    apiKey: resolvedKey,
    model,
    temperature,
    topK: top_k,
    streaming,
    // thinkingConfig: { includeThoughts: true, thinkingBudget: 1024 },
  })

  const bindParams = {}
  if (tools && tools.length > 0) bindParams.tools = tools
  if (thinking?.thinkingConfig) bindParams.thinkingConfig = thinking.thinkingConfig
  if (Object.keys(bindParams).length) {
    modelInstance = modelInstance.bind(bindParams)
  }

  return modelInstance
}

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
  contextMessageLimit,
  onChunk,
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
      tools,
      thinking,
      streaming: true,
    })
  } else if (provider === 'siliconflow') {
    modelInstance = buildSiliconFlowModel({
      apiKey,
      model,
      temperature,
      top_k,
      tools,
      thinking,
      streaming: true,
    })
  } else {
    modelInstance = buildOpenAIModel({
      provider,
      apiKey,
      baseUrl,
      model,
      temperature,
      top_k,
      tools,
      toolChoice,
      responseFormat,
      thinking,
      streaming: true,
    })
  }

  const stream = await modelInstance.stream(langchainMessages, signal ? { signal } : undefined)

  let fullContent = ''
  let fullThought = ''
  const toolCallsMap = new Map()
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
    for await (const chunk of stream) {
      console.log('Chunk:', JSON.stringify(chunk, null, 2))
      const messageChunk = chunk?.message ?? chunk
      const contentValue = messageChunk?.content ?? chunk?.content

      if (provider === 'gemini' && Array.isArray(contentValue)) {
        const parsed = parseGeminiParts(contentValue, {
          emitText,
          emitThought,
          handleTaggedText,
        })
        if (parsed) {
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

const requestOpenAICompat = async ({
  provider,
  apiKey,
  baseUrl,
  model,
  messages,
  temperature,
  top_k,
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
    tools,
    toolChoice,
    responseFormat,
    thinking,
    streaming: stream,
  })

  const langchainMessages = toLangChainMessages(messages || [])
  const response = await modelInstance.invoke(langchainMessages, { signal })

  return typeof response.content === 'string'
    ? response.content
    : normalizeTextContent(response.content)
}

const requestSiliconFlow = async ({
  provider,
  apiKey,
  baseUrl,
  model,
  messages,
  temperature,
  top_k,
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
    tools,
    toolChoice,
    responseFormat,
    thinking,
    streaming: stream,
  })

  const langchainMessages = toLangChainMessages(messages || [])
  const response = await modelInstance.invoke(langchainMessages, { signal })

  return typeof response.content === 'string'
    ? response.content
    : normalizeTextContent(response.content)
}
const requestGemini = async ({
  apiKey,
  model,
  messages,
  temperature,
  top_k,
  tools,
  thinking,
  signal,
}) => {
  const modelInstance = buildGeminiModel({
    apiKey,
    model,
    temperature,
    top_k,
    tools,
    thinking,
    streaming: false,
  })

  const langchainMessages = toLangChainMessages(messages || [])
  const response = await modelInstance.invoke(langchainMessages, { signal })

  return typeof response.content === 'string'
    ? response.content
    : normalizeTextContent(response.content)
}

const generateTitle = async (provider, firstMessage, apiKey, baseUrl, model) => {
  const promptMessages = [
    {
      role: 'system',
      content:
        "Generate a short, concise title (max 5 words) for this conversation based on the user's first message. Do not use quotes.",
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
      streaming: false,
    })
  } else {
    content = await requestOpenAICompat({
      provider,
      apiKey,
      baseUrl,
      model,
      messages: promptMessages,
      streaming: false,
    })
  }
  return content?.trim?.() || 'New Conversation'
}

const generateTitleAndSpace = async (provider, firstMessage, spaces, apiKey, baseUrl, model) => {
  const spaceLabels = (spaces || []).map(s => s.label).join(', ')
  const promptMessages = [
    {
      role: 'system',
      content: `You are a helpful assistant.
1. Generate a short, concise title (max 5 words) for this conversation based on the user's first message.
2. Select the most appropriate space from the following list: [${spaceLabels}]. If none fit well, return null.
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
      streaming: false,
    })
  } else {
    content = await requestOpenAICompat({
      provider,
      apiKey,
      baseUrl,
      model,
      messages: promptMessages,
      responseFormat,
      streaming: false,
    })
  }
  const parsed = safeJsonParse(content) || {}
  const title = parsed.title || 'New Conversation'
  const spaceLabel = parsed.spaceLabel
  const selectedSpace = (spaces || []).find(s => s.label === spaceLabel) || null
  return { title, space: selectedSpace }
}

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
      streaming: false,
    })
  } else {
    content = await requestOpenAICompat({
      provider,
      apiKey,
      baseUrl,
      model,
      messages: promptMessages,
      responseFormat,
      streaming: false,
    })
  }
  const parsed = safeJsonParse(content)
  return normalizeRelatedQuestions(parsed)
}

export const createBackendProvider = provider => ({
  streamChatCompletion: params => streamWithLangChain({ provider, ...params }),
  generateTitle: (firstMessage, apiKey, baseUrl, model) =>
    generateTitle(provider, firstMessage, apiKey, baseUrl, model),
  generateTitleAndSpace: (firstMessage, spaces, apiKey, baseUrl, model) =>
    generateTitleAndSpace(provider, firstMessage, spaces, apiKey, baseUrl, model),
  generateRelatedQuestions: (messages, apiKey, baseUrl, model) =>
    generateRelatedQuestions(provider, messages, apiKey, baseUrl, model),
})
