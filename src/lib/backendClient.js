/**
 * Backend API Client
 * Handles communication with Qurio backend server
 */

// Backend URL - can be overridden via environment variable
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

/**
 * Generate a title for a conversation based on the first user message
 * @param {string} provider - AI provider name
 * @param {string} message - User's first message
 * @param {string} apiKey - API key for the provider
 * @param {string} baseUrl - Optional custom base URL
 * @param {string} model - Optional model name
 * @returns {Promise<{title: string}>}
 */
export const generateTitleViaBackend = async (provider, message, apiKey, baseUrl, model) => {
  const response = await fetch(`${BACKEND_URL}/api/title`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      provider,
      message,
      apiKey,
      baseUrl,
      model
    })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(error.message || `Backend error: ${response.status}`)
  }

  return response.json()
}

/**
 * Generate a short, practical tip for today
 * @param {string} provider - AI provider name
 * @param {string} language - Language code (optional)
 * @param {string} category - Tip category (optional)
 * @param {string} apiKey - API key for the provider
 * @param {string} baseUrl - Optional custom base URL
 * @param {string} model - Optional model name
 * @returns {Promise<{tip: string}>}
 */
export const generateDailyTipViaBackend = async (provider, language, category, apiKey, baseUrl, model) => {
  const response = await fetch(`${BACKEND_URL}/api/daily-tip`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      provider,
      language,
      category,
      apiKey,
      baseUrl,
      model
    })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(error.message || `Backend error: ${response.status}`)
  }

  return response.json()
}

/**
 * Generate a structured deep research plan
 * @param {string} provider - AI provider name
 * @param {string} message - User message about research
 * @param {string} apiKey - API key for the provider
 * @param {string} baseUrl - Optional custom base URL
 * @param {string} model - Optional model name
 * @returns {Promise<{plan: string}>}
 */
export const generateResearchPlanViaBackend = async (provider, message, apiKey, baseUrl, model) => {
  const response = await fetch(`${BACKEND_URL}/api/research-plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      provider,
      message,
      apiKey,
      baseUrl,
      model
    })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(error.message || `Backend error: ${response.status}`)
  }

  return response.json()
}

/**
 * Generate title, select space, and optionally select agent
 * @param {string} provider - AI provider name
 * @param {string} message - User's first message
 * @param {Array} spacesWithAgents - Array of { label, description, agents: [{name, description?}] }
 * @param {string} apiKey - API key for the provider
 * @param {string} baseUrl - Optional custom base URL
 * @param {string} model - Optional model name
 * @returns {Promise<{title: string, spaceLabel: string|null, agentName: string|null}>}
 */
export const generateTitleSpaceAndAgentViaBackend = async (provider, message, spacesWithAgents, apiKey, baseUrl, model) => {
  const response = await fetch(`${BACKEND_URL}/api/title-space-agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      provider,
      message,
      spacesWithAgents,
      apiKey,
      baseUrl,
      model
    })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(error.message || `Backend error: ${response.status}`)
  }

  return response.json()
}

/**
 * Health check for backend
 * @returns {Promise<boolean>} - True if backend is running
 */
export const checkBackendHealth = async () => {
  try {
    const response = await fetch(`${BACKEND_URL}/api/health`)
    return response.ok
  } catch {
    return false
  }
}

/**
 * Generate title and select space
 * @param {string} provider - AI provider name
 * @param {string} message - User's first message
 * @param {Array} spaces - Available spaces
 * @param {string} apiKey - API key for the provider
 * @param {string} baseUrl - Optional custom base URL
 * @param {string} model - Optional model name
 * @returns {Promise<{title: string, space: object|null}>}
 */
export const generateTitleAndSpaceViaBackend = async (provider, message, spaces, apiKey, baseUrl, model) => {
  const response = await fetch(`${BACKEND_URL}/api/title-and-space`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      provider,
      message,
      spaces,
      apiKey,
      baseUrl,
      model
    })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(error.message || `Backend error: ${response.status}`)
  }

  return response.json()
}

/**
 * Generate agent for auto mode
 * @param {string} provider - AI provider name
 * @param {string} message - User's message
 * @param {object} currentSpace - Current space with agents
 * @param {string} apiKey - API key for the provider
 * @param {string} baseUrl - Optional custom base URL
 * @param {string} model - Optional model name
 * @returns {Promise<{agentName: string|null}>}
 */
export const generateAgentForAutoViaBackend = async (provider, message, currentSpace, apiKey, baseUrl, model) => {
  const response = await fetch(`${BACKEND_URL}/api/agent-for-auto`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      provider,
      message,
      currentSpace,
      apiKey,
      baseUrl,
      model
    })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(error.message || `Backend error: ${response.status}`)
  }

  return response.json()
}

/**
 * Generate related questions
 * @param {string} provider - AI provider name
 * @param {Array} messages - Conversation messages
 * @param {string} apiKey - API key for the provider
 * @param {string} baseUrl - Optional custom base URL
 * @param {string} model - Optional model name
 * @returns {Promise<{questions: string[]}>}
 */
export const generateRelatedQuestionsViaBackend = async (provider, messages, apiKey, baseUrl, model) => {
  const response = await fetch(`${BACKEND_URL}/api/related-questions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      provider,
      messages,
      apiKey,
      baseUrl,
      model
    })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(error.message || `Backend error: ${response.status}`)
  }

  return response.json()
}

/**
 * Stream chat completion
 * Uses Server-Sent Events (SSE) for streaming responses
 * @param {Object} params - Stream parameters
 * @param {string} params.provider - AI provider name
 * @param {string} params.apiKey - API key for the provider
 * @param {string} params.baseUrl - Optional custom base URL
 * @param {string} params.model - Optional model name
 * @param {Array} params.messages - Conversation messages
 * @param {Array} params.tools - Optional tools
 * @param {object} params.toolChoice - Optional tool choice
 * @param {object} params.responseFormat - Optional response format
 * @param {object} params.thinking - Optional thinking config
 * @param {number} params.temperature - Optional temperature
 * @param {number} params.top_k - Optional top_k
 * @param {number} params.top_p - Optional top_p
 * @param {number} params.frequency_penalty - Optional frequency penalty
 * @param {number} params.presence_penalty - Optional presence penalty
 * @param {number} params.contextMessageLimit - Optional context message limit
 * @param {Function} params.onChunk - Callback for each chunk (chunk) => void
 * @param {Function} params.onFinish - Callback when stream completes (result) => void
 * @param {Function} params.onError - Callback for errors (error) => void
 * @param {AbortSignal} params.signal - Optional abort signal
 * @returns {Promise<void>}
 */
export const streamChatViaBackend = async (params) => {
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
    onChunk,
    onFinish,
    onError,
    signal,
  } = params

  if (!provider) {
    throw new Error('Missing required field: provider')
  }
  if (!apiKey) {
    throw new Error('Missing required field: apiKey')
  }
  if (!messages || !Array.isArray(messages)) {
    throw new Error('Missing required field: messages')
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/stream-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
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
      }),
      signal,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }))
      throw new Error(error.message || `Backend error: ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    console.log('[streamChatViaBackend] Starting to read stream...')

    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        console.log('[streamChatViaBackend] Stream done')
        break
      }

      buffer += decoder.decode(value, { stream: true })
      console.log('[streamChatViaBackend] Received data:', buffer.slice(0, 200))

      // Process complete SSE messages
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) continue

        const data = line.slice(6) // Remove 'data: ' prefix
        if (!data.trim()) continue

        try {
          const chunk = JSON.parse(data)

          if (chunk.type === 'error') {
            onError?.(new Error(chunk.error || 'Stream error'))
            return
          }

          if (chunk.type === 'done') {
            onFinish?.({
              content: chunk.content,
              thought: chunk.thought,
              sources: chunk.sources,
              groundingSupports: chunk.groundingSupports,
              toolCalls: chunk.toolCalls,
            })
            return
          }

          // Regular chunk (text, thought, etc.)
          console.log('[streamChatViaBackend] Calling onChunk with:', chunk)
          onChunk?.(chunk)
        } catch (e) {
          console.error('Failed to parse SSE chunk:', data, e)
        }
      }
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    onError?.(error)
  }
}
