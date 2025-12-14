import OpenAI from 'openai'
import { loadSettings } from './settings'

export const SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1/'

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
export const createOpenAIClient = ({ apiKey, baseUrl = SILICONFLOW_BASE_URL }) => {
  return new OpenAI({
    apiKey,
    baseURL: baseUrl,
    dangerouslyAllowBrowser: true,
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
 * Stream chat completion with SiliconFlow reasoning support.
 *
 * Key differences vs generic OpenAI-compatible:
 * - Emits reasoning_content as thought chunks for UI
 * - Accepts thinking config mapped to SiliconFlow's reasoning fields
 */
export const streamChatCompletion = async ({
  apiKey,
  baseUrl = SILICONFLOW_BASE_URL,
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

    const options = {
      model: resolvedModel,
      messages: trimmedMessages,
      stream: true,
    }

    if (temperature !== undefined) options.temperature = temperature
    if (top_k !== undefined) options.top_k = top_k
    // Some models might require top_k in extra_body if not standard, but SiliconFlow usually supports it? 
    // We will stick to top-level for now as it maps to their API which is OpenAI-like but extended.

    if (tools && tools.length > 0) {
      options.tools = tools
    }

    if (responseFormat) {
      options.response_format = responseFormat
    }

    // SiliconFlow reasoning fields
    if (thinking) {
      options.enable_thinking = true
      options.thinking_budget = thinking.budget_tokens || thinking.budgetTokens || 1024
      if (thinking.extra_body) {
        options.extra_body = thinking.extra_body
      }
    }

    console.log('Starting SiliconFlow stream with options:', { ...options, apiKey: '***' })

    const stream = await client.chat.completions.create(options, { signal })

    let fullContent = ''
    let thoughtContent = ''
    const toolCallsMap = new Map()

    for await (const chunk of stream) {
      const choice = chunk.choices?.[0]
      const delta = choice?.delta
      if (!delta) continue

      if (delta.reasoning_content) {
        thoughtContent += delta.reasoning_content
        onChunk({ type: 'thought', content: delta.reasoning_content })
      }

      if (delta.content) {
        fullContent += delta.content
        onChunk({ type: 'text', content: delta.content })
      }

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

    const finalToolCalls = Array.from(toolCallsMap.values())

    onFinish({
      content: fullContent,
      thought: thoughtContent || undefined,
      toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
    })
  } catch (error) {
    console.error('SiliconFlow stream error:', error)
    onError(error)
  }
}

/**
 * Generate a title for the conversation.
 */
export const generateTitle = async (firstMessage, apiKey, baseUrl = SILICONFLOW_BASE_URL, model) => {
  try {
    const resolvedModel = resolveModel(model, 'liteModel')
    const client = createOpenAIClient({ apiKey, baseUrl })
    const response = await client.chat.completions.create({
      model: resolvedModel,
      messages: [
        {
          role: 'system',
          content:
            "Generate a short, concise title (max 5 words) for this conversation based on the user's first message. Do not use quotes.",
        },
        { role: 'user', content: firstMessage },
      ],
    })
    return response.choices[0]?.message?.content?.trim() || 'New Conversation'
  } catch (error) {
    console.error('SiliconFlow title error:', error)
    return 'New Conversation'
  }
}

/**
 * Generate a title and suggest a space for the conversation.
 */
export const generateTitleAndSpace = async (
  firstMessage,
  spaces,
  apiKey,
  baseUrl = SILICONFLOW_BASE_URL,
  model,
) => {
  try {
    const resolvedModel = resolveModel(model, 'liteModel')
    const client = createOpenAIClient({ apiKey, baseUrl })
    const spaceLabels = spaces.map(s => s.label).join(', ')

    const response = await client.chat.completions.create({
      model: resolvedModel,
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
    console.error('SiliconFlow title/space error:', error)
    return { title: 'New Conversation', space: null }
  }
}

/**
 * Generate related questions based on the conversation history.
 */
export const generateRelatedQuestions = async (
  messages,
  apiKey,
  baseUrl = SILICONFLOW_BASE_URL,
  model,
) => {
  try {
    const resolvedModel = resolveModel(model, 'liteModel')
    const client = createOpenAIClient({ apiKey, baseUrl })
    const response = await client.chat.completions.create({
      model: resolvedModel,
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

    try {
      const parsed = JSON.parse(content)
      return normalizeRelatedQuestions(parsed)
    } catch (e) {
      console.error('SiliconFlow related questions parse error:', e)
      return []
    }
  } catch (error) {
    console.error('SiliconFlow related questions error:', error)
    return []
  }
}
