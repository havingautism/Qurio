import OpenAI from 'openai'
import { loadSettings } from './settings'

/**
 * Resolve model based on provided override or persisted settings.
 * For lite tasks, pass "liteModel"; otherwise default to "defaultModel".
 */
const resolveModel = (model, fallbackKey = 'defaultModel') => {
  if (model) return model
  const settings = loadSettings()
  return settings[fallbackKey]
}

/**
 * Trim conversation history based on user-configured limit.
 * Preserves a leading system prompt if present.
 */
const applyContextLimit = messages => {
  const { contextMessageLimit } = loadSettings()
  const limit = parseInt(contextMessageLimit, 10)
  if (!Array.isArray(messages) || !limit || limit < 1) return messages

  const systemMessages = messages.filter(m => m?.role === 'system')
  const nonSystemMessages = messages.filter(m => m?.role !== 'system')
  const trimmedNonSystem = nonSystemMessages.slice(-limit)

  return [...systemMessages, ...trimmedNonSystem]
}

/**
 * Normalize related questions payloads from varied model responses.
 * Accepts direct arrays or objects with common keys.
 * @param {any} payload
 * @returns {string[]}
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
 * Create an OpenAI client instance.
 * @param {Object} config
 * @param {string} config.apiKey
 * @param {string} config.baseUrl
 * @returns {OpenAI}
 */
export const createOpenAIClient = ({ apiKey, baseUrl }) => {
  return new OpenAI({
    apiKey,
    baseURL: baseUrl,
    dangerouslyAllowBrowser: true, // Required for client-side usage
    defaultHeaders: {
      'x-stainless-arch': null,
      'x-stainless-lang': null,
      'x-stainless-os': null,
      'x-stainless-package-version': null,
      'x-stainless-retry-count': null,
      'x-stainless-runtime': null,
      'x-stainless-runtime-version': null,
      'x-stainless-timeout': null,
    },
  })
}

/**
 * Stream chat completion with support for advanced features.
 *
 * Features supported:
 * - Streaming
 * - Function Calling (Tools)
 * - Image Understanding (Multimodal input via messages)
 * - Structured Output (JSON mode/schema)
 * - Thinking (via model selection or specific params)
 *
 * @param {Object} params
 * @param {string} params.apiKey - API Key
 * @param {string} params.baseUrl - Base URL
 * @param {string} params.model - Model ID
 * @param {Array} params.messages - Conversation history (can include images)
 * @param {Array} [params.tools] - List of tools for function calling
 * @param {string|Object} [params.toolChoice] - Tool choice strategy
 * @param {Object} [params.responseFormat] - Structured output format (e.g. { type: "json_object" })
 * @param {Object} [params.thinking] - Thinking configuration (e.g. { budget_tokens: 1024 }) - mostly for reasoning models
 * @param {Function} params.onChunk - Callback for content chunks
 * @param {Function} params.onFinish - Callback on completion
 * @param {Function} params.onError - Callback on error
 * @param {AbortSignal} [params.signal] - Abort signal
 */
export const streamChatCompletion = async ({
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
  onChunk,
  onFinish,
  onError,
  signal,
}) => {
  try {
    const resolvedModel = resolveModel(model, 'defaultModel')
    const client = createOpenAIClient({ apiKey, baseUrl })
    const trimmedMessages = applyContextLimit(messages)

    // Construct the request options
    const options = {
      model: resolvedModel,
      messages: trimmedMessages,
      stream: true,
    }

    if (temperature !== undefined) options.temperature = temperature
    
    // Handle top_k which is not standard OpenAI
    if (top_k !== undefined) {
      options.extra_body = { ...(options.extra_body || {}), top_k }
    }

    // Optional splicing of features
    if (tools && tools.length > 0) {
      options.tools = tools
      // options.tool_choice = 'auto';
    }

    if (responseFormat) {
      options.response_format = responseFormat
    }

    // Handle "Thinking" or Reasoning parameters if applicable
    if (thinking) {
      // If specific thinking params are needed, add them here.
      //  if (thinking.budget_tokens) {
      //    options.max_completion_tokens = thinking.budget_tokens;
      //  }
      // Support for Google's extra_body structure
      if (thinking.extra_body) {
        options.extra_body = thinking.extra_body
      }
    }

    console.log('Starting stream with options:', { ...options, apiKey: '***' })

    const stream = await client.chat.completions.create(options, { signal })

    let fullContent = ''
    let toolCallsMap = new Map()

    for await (const chunk of stream) {
      const choice = chunk.choices[0]
      const delta = choice?.delta

      if (!delta) continue

      // Handle Content
      if (delta.content) {
        fullContent += delta.content
        onChunk(delta.content)
      }

      // Handle Tool Calls (Streaming)
      if (delta.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          const index = toolCall.index
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
          if (toolCall.function?.arguments)
            currentToolCall.function.arguments += toolCall.function.arguments
        }
      }
    }

    // Process final tool calls if any
    const finalToolCalls = Array.from(toolCallsMap.values())

    onFinish({
      content: fullContent,
      toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
    })
  } catch (error) {
    console.error('Stream error:', error)
    onError(error)
  }
}

/**
 * Generate a title for the conversation.
 * @param {string} firstMessage
 * @param {string} apiKey
 * @param {string} baseUrl
 * @returns {Promise<string>}
 */
export const generateTitle = async (firstMessage, apiKey, baseUrl, model) => {
  try {
    const resolvedModel = resolveModel(model, 'liteModel')
    const client = createOpenAIClient({ apiKey, baseUrl })
    const response = await client.chat.completions.create({
      model: resolvedModel, // Use dynamic model parameter
      messages: [
        {
          role: 'system',
          content:
            "Generate a short, concise title (max 5 words) for this conversation based on the user's first message. Do not use quotes.",
        },
        { role: 'user', content: firstMessage },
      ],
      // max_tokens: 15
    })
    return response.choices[0]?.message?.content?.trim() || 'New Conversation'
  } catch (error) {
    console.error('Error generating title:', error)
    return 'New Conversation'
  }
}

/**
 * Generate a title and suggest a space for the conversation.
 * @param {string} firstMessage
 * @param {Array} spaces - List of available spaces { label, emoji }
 * @param {string} apiKey
 * @param {string} baseUrl
 * @returns {Promise<{title: string, space: Object|null}>}
 */
export const generateTitleAndSpace = async (firstMessage, spaces, apiKey, baseUrl, model) => {
  try {
    const resolvedModel = resolveModel(model, 'liteModel')
    const client = createOpenAIClient({ apiKey, baseUrl })
    const spaceLabels = spaces.map(s => s.label).join(', ')

    const response = await client.chat.completions.create({
      model: resolvedModel, // Use dynamic model parameter
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant. 
          1. Generate a short, concise title (max 5 words) for this conversation based on the user's first message.
          2. Select the most appropriate space from the following list: [${spaceLabels}]. If none fit well, return null.
          Return the result as a JSON object with keys "title" and "spaceLabel".`,
        },
        { role: 'user', content: firstMessage },
      ],
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content
    if (!content) return { title: 'New Conversation', space: null }

    const parsed = JSON.parse(content)
    const title = parsed.title || 'New Conversation'
    const spaceLabel = parsed.spaceLabel

    const selectedSpace = spaces.find(s => s.label === spaceLabel) || null

    return { title, space: selectedSpace }
  } catch (error) {
    console.error('Error generating title and space:', error)
    return { title: 'New Conversation', space: null }
  }
}

/**
 * Generate related questions based on the conversation history.
 * @param {Array} messages
 * @param {string} apiKey
 * @param {string} baseUrl
 * @returns {Promise<Array<string>>}
 */
export const generateRelatedQuestions = async (messages, apiKey, baseUrl, model) => {
  try {
    const resolvedModel = resolveModel(model, 'liteModel')
    const client = createOpenAIClient({ apiKey, baseUrl })
    const response = await client.chat.completions.create({
      model: resolvedModel, // Use dynamic model parameter
      messages: [
        ...messages,
        {
          role: 'user',
          content:
            'Based on our conversation, suggest 3 short, relevant follow-up questions I might ask. Return them as a JSON array of strings. Example: ["Question 1?", "Question 2?"]',
        },
      ],
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content
    if (!content) return []

    // Attempt to parse JSON
    try {
      const parsed = JSON.parse(content)
      return normalizeRelatedQuestions(parsed)
    } catch (e) {
      console.error('Failed to parse related questions JSON:', e)
      return []
    }
  } catch (error) {
    console.error('Error generating related questions:', error)
    return []
  }
}
