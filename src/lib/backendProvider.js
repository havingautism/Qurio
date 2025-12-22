import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { getPublicEnv } from './publicEnv'

const OPENAI_DEFAULT_BASE = 'https://api.openai.com/v1'
const SILICONFLOW_BASE = 'https://api.siliconflow.cn/v1'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

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

const mapMessagesForOpenAI = messages =>
  (messages || []).map(message => ({
    role: message.role === 'ai' ? 'assistant' : message.role,
    content: message.content,
    ...(message.tool_calls && { tool_calls: message.tool_calls }),
    ...(message.tool_call_id && { tool_call_id: message.tool_call_id }),
    ...(message.name && { name: message.name }),
  }))

const buildGeminiPayload = ({ messages, temperature, top_k, tools, thinking }) => {
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
  if (thinking?.thinkingConfig) {
    generationConfig.thinkingConfig = thinking.thinkingConfig
  }

  const payload = { contents }
  if (systemInstruction) payload.systemInstruction = systemInstruction
  if (Object.keys(generationConfig).length) payload.generationConfig = generationConfig
  if (tools) payload.tools = tools
  return payload
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
      modelKwargs.thinking_budget = budget
      modelKwargs.enable_thinking = true
    }
    if (top_k !== undefined) {
      modelKwargs.top_k = top_k
    }
  }

  let modelInstance = new ChatOpenAI({
    openAIApiKey: resolvedKey,
    modelName: model,
    temperature,
    streaming,
    streamUsage: false,
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

  const modelInstance =
    provider === 'gemini'
      ? buildGeminiModel({
          apiKey,
          model,
          temperature,
          top_k,
          tools,
          thinking,
          streaming: true,
        })
      : buildOpenAIModel({
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

  const stream = await modelInstance.stream(langchainMessages, signal ? { signal } : undefined)

  let fullContent = ''
  let fullThought = ''
  const toolCallsMap = new Map()
  let inThoughtBlock = false

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

  const handleTaggedText = text => {
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

  try {
    for await (const chunk of stream) {
      const chunkText = normalizeTextContent(chunk?.content)
      if (chunkText) {
        handleTaggedText(chunkText)
      }

      const toolCalls = chunk?.additional_kwargs?.tool_calls
      if (toolCalls) {
        updateToolCallsMap(toolCallsMap, toolCalls)
      }

      const reasoning = chunk?.additional_kwargs?.reasoning_content || chunk?.additional_kwargs?.reasoning
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
}) => {
  const resolvedBase = resolveOpenAIBase(provider, baseUrl)
  const resolvedKey = apiKey || getPublicEnv('PUBLIC_OPENAI_API_KEY')
  if (!resolvedKey) {
    throw new Error('Missing API key')
  }

  const payload = {
    model,
    messages: mapMessagesForOpenAI(messages),
    stream: false,
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

  const response = await fetch(`${resolvedBase.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resolvedKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `Upstream error (${response.status})`)
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content ?? ''
  return typeof content === 'string' ? content : normalizeTextContent(content)
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
  const resolvedKey = apiKey || getPublicEnv('PUBLIC_GOOGLE_API_KEY')
  if (!resolvedKey) {
    throw new Error('Missing API key')
  }

  const payload = buildGeminiPayload({ messages, temperature, top_k, tools, thinking })
  const modelPath = model?.includes('/') ? model : `models/${model}`
  const url = `${GEMINI_BASE}/${modelPath}:generateContent?key=${resolvedKey}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `Upstream error (${response.status})`)
  }

  const data = await response.json()
  const parts = data?.candidates?.[0]?.content?.parts || []
  return parts.map(part => part?.text || '').join('')
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

  const content =
    provider === 'gemini'
      ? await requestGemini({ apiKey, model, messages: promptMessages })
      : await requestOpenAICompat({
          provider,
          apiKey,
          baseUrl,
          model,
          messages: promptMessages,
        })
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
  const content =
    provider === 'gemini'
      ? await requestGemini({ apiKey, model, messages: promptMessages })
      : await requestOpenAICompat({
          provider,
          apiKey,
          baseUrl,
          model,
          messages: promptMessages,
          responseFormat,
        })

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
  const content =
    provider === 'gemini'
      ? await requestGemini({ apiKey, model, messages: promptMessages })
      : await requestOpenAICompat({
          provider,
          apiKey,
          baseUrl,
          model,
          messages: promptMessages,
          responseFormat,
        })

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
