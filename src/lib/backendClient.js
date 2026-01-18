/**
 * Backend API Client
 * Handles communication with Qurio backend server
 */

import { loadSettings } from './settings'

const getNodeBackendUrl = () => {
  const settings = loadSettings()
  return settings.backendUrl || 'http://198.18.0.1:3001'
}

const getRustBackendUrl = () => 'http://198.18.0.1:3002'

const getBackendErrorMessage = (error, status) => {
  if (!error || typeof error !== 'object') {
    return `Backend error: ${status}`
  }

  const message = error.error || error.message || error.detail || error.details

  if (Array.isArray(message)) {
    const joined = message.map(item => String(item || '').trim()).filter(Boolean).join('; ')
    return joined || `Backend error: ${status}`
  }

  if (typeof message === 'string' && message.trim()) {
    return message
  }

  return `Backend error: ${status}`
}

/**
 * Generate a title for a conversation based on the first user message
 * @param {string} provider - AI provider name
 * @param {string} message - User's first message
 * @param {string} apiKey - API key for the provider
 * @param {string} baseUrl - Optional custom base URL
 * @param {string} model - Optional model name
 * @returns {Promise<{title: string, emojis?: string[]}>}
 */
export const generateTitleViaBackend = async (provider, message, apiKey, baseUrl, model) => {
  const response = await fetch(`${getNodeBackendUrl()}/api/title`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      provider,
      message,
      apiKey,
      baseUrl,
      model,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(getBackendErrorMessage(error, response.status))
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
export const generateDailyTipViaBackend = async (
  provider,
  language,
  category,
  apiKey,
  baseUrl,
  model,
) => {
  const response = await fetch(`${getNodeBackendUrl()}/api/daily-tip`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      provider,
      language,
      category,
      apiKey,
      baseUrl,
      model,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(getBackendErrorMessage(error, response.status))
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
 * @param {string} researchType - Research type: 'general' or 'academic'
 * @returns {Promise<{plan: string}>}
 */
export const generateResearchPlanViaBackend = async (
  provider,
  message,
  apiKey,
  baseUrl,
  model,
  researchType = 'general',
) => {
  const response = await fetch(`${getNodeBackendUrl()}/api/research-plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      provider,
      message,
      apiKey,
      baseUrl,
      model,
      researchType, // Pass researchType to backend
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(getBackendErrorMessage(error, response.status))
  }

  return response.json()
}

/**
 * Stream research plan generation
 * Uses Server-Sent Events (SSE) for streaming responses
 * @param {Object} params - Stream parameters
 * @param {string} params.provider - AI provider name
 * @param {string} params.message - User message about research
 * @param {string} params.apiKey - API key for the provider
 * @param {string} params.baseUrl - Optional custom base URL
 * @param {string} params.model - Optional model name
 * @param {object} params.responseFormat - Optional response format
 * @param {object} params.thinking - Optional thinking config
 * @param {number} params.temperature - Optional temperature
 * @param {number} params.top_k - Optional top_k
 * @param {number} params.top_p - Optional top_p
 * @param {number} params.frequency_penalty - Optional frequency penalty
 * @param {number} params.presence_penalty - Optional presence penalty
 * @param {number} params.contextMessageLimit - Optional context message limit
 * @param {Array} params.toolIds - Optional tool ids to enable
 * @param {Function} params.onChunk - Callback for each chunk (chunk) => void
 * @param {Function} params.onFinish - Callback when stream completes (result) => void
 * @param {Function} params.onError - Callback for errors (error) => void
 * @param {AbortSignal} params.signal - Optional abort signal
 * @returns {Promise<void>}
 */
export const streamResearchPlanViaBackend = async params => {
  const {
    provider,
    message,
    apiKey,
    baseUrl,
    model,
    responseFormat,
    thinking,
    temperature,
    top_k,
    top_p,
    frequency_penalty,
    presence_penalty,
    contextMessageLimit,
    toolIds,
    onChunk,
    onFinish,
    onError,
    signal,
    researchType, // Add researchType parameter
  } = params

  if (!provider) {
    throw new Error('Missing required field: provider')
  }
  if (!apiKey) {
    throw new Error('Missing required field: apiKey')
  }
  if (!message) {
    throw new Error('Missing required field: message')
  }

  try {
    const response = await fetch(`${getNodeBackendUrl()}/api/research-plan-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider,
        message,
        apiKey,
        baseUrl,
        model,
        responseFormat,
        thinking,
        temperature,
        top_k,
        top_p,
        frequency_penalty,
        presence_penalty,
        contextMessageLimit,
        contextMessageLimit,
        toolIds,
        researchType, // Pass researchType to backend
      }),
      signal,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }))
      throw new Error(getBackendErrorMessage(error, response.status))
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })

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

/**
 * Generate title, select space, and optionally select agent
 * @param {string} provider - AI provider name
 * @param {string} message - User's first message
 * @param {Array} spacesWithAgents - Array of { label, description, agents: [{name, description?}] }
 * @param {string} apiKey - API key for the provider
 * @param {string} baseUrl - Optional custom base URL
 * @param {string} model - Optional model name
 * @returns {Promise<{title: string, spaceLabel: string|null, agentName: string|null, emojis?: string[]}>}
 */
export const generateTitleSpaceAndAgentViaBackend = async (
  provider,
  message,
  spacesWithAgents,
  apiKey,
  baseUrl,
  model,
) => {
  const response = await fetch(`${getNodeBackendUrl()}/api/title-space-agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      provider,
      message,
      spacesWithAgents,
      apiKey,
      baseUrl,
      model,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(getBackendErrorMessage(error, response.status))
  }

  return response.json()
}

/**
 * Health check for backend
 * @returns {Promise<boolean>} - True if backend is running
 */
export const checkBackendHealth = async () => {
  try {
    const response = await fetch(`${getRustBackendUrl()}/api/health`)
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
 * @returns {Promise<{title: string, space: object|null, emojis?: string[]}>}
 */
export const generateTitleAndSpaceViaBackend = async (
  provider,
  message,
  spaces,
  apiKey,
  baseUrl,
  model,
) => {
  const response = await fetch(`${getNodeBackendUrl()}/api/title-and-space`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      provider,
      message,
      spaces,
      apiKey,
      baseUrl,
      model,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(getBackendErrorMessage(error, response.status))
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
export const generateAgentForAutoViaBackend = async (
  provider,
  message,
  currentSpace,
  apiKey,
  baseUrl,
  model,
) => {
  const response = await fetch(`${getNodeBackendUrl()}/api/agent-for-auto`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      provider,
      message,
      currentSpace,
      apiKey,
      baseUrl,
      model,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(getBackendErrorMessage(error, response.status))
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
export const generateRelatedQuestionsViaBackend = async (
  provider,
  messages,
  apiKey,
  baseUrl,
  model,
) => {
  const response = await fetch(`${getNodeBackendUrl()}/api/related-questions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      provider,
      messages,
      apiKey,
      baseUrl,
      model,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(getBackendErrorMessage(error, response.status))
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
 * @param {Array} params.toolIds - Optional tool ids to enable
 * @param {object} params.toolChoice - Optional tool choice
 * @param {object} params.responseFormat - Optional response format
 * @param {object} params.thinking - Optional thinking config
 * @param {number} params.temperature - Optional temperature
 * @param {number} params.top_k - Optional top_k
 * @param {number} params.top_p - Optional top_p
 * @param {number} params.frequency_penalty - Optional frequency penalty
 * @param {number} params.presence_penalty - Optional presence penalty
 * @param {number} params.contextMessageLimit - Optional context message limit
 * @param {string} params.searchProvider - Optional search provider
 * @param {string} params.tavilyApiKey - Optional Tavily API key
 * @param {Function} params.onChunk - Callback for each chunk (chunk) => void
 * @param {Function} params.onFinish - Callback when stream completes (result) => void
 * @param {Function} params.onError - Callback for errors (error) => void
 * @param {AbortSignal} params.signal - Optional abort signal
 * @returns {Promise<void>}
 */
export const streamChatViaBackend = async params => {
  const {
    provider,
    apiKey,
    baseUrl,
    model,
    messages,
    tools,
    toolIds,
    toolChoice,
    responseFormat,
    thinking,
    temperature,
    top_k,
    top_p,
    frequency_penalty,
    presence_penalty,
    contextMessageLimit,
    searchProvider,
    tavilyApiKey,
    userTools,
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
  const response = await fetch(`${getRustBackendUrl()}/api/stream-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider,
        apiKey,
        baseUrl,
        model,
        messages,
        tools,
        toolIds,
        toolChoice,
        responseFormat,
        thinking,
        temperature,
        top_k,
        top_p,
        frequency_penalty,
        presence_penalty,
        contextMessageLimit,
        searchProvider,
        tavilyApiKey,
        userTools,
      }),
      signal,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }))
      throw new Error(getBackendErrorMessage(error, response.status))
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
          // console.log('[streamChatViaBackend] Calling onChunk with:', chunk)
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

/**
 * Stream deep research execution
 * Uses Server-Sent Events (SSE) for streaming responses
 */
export const streamDeepResearchViaBackend = async params => {
  const {
    provider,
    apiKey,
    baseUrl,
    model,
    messages,
    tools,
    toolIds,
    toolChoice,
    temperature,
    top_k,
    top_p,
    frequency_penalty,
    presence_penalty,
    contextMessageLimit,
    plan,
    question,
    researchType, // 'general' or 'academic'
    concurrentExecution, // Enable concurrent step execution (experimental)
    searchProvider,
    tavilyApiKey,
    onChunk,
    onFinish,
    onError,
    signal,
  } = params

  // Debug: Log concurrentExecution before sending to backend
  console.log('[BackendClient] Sending concurrentExecution:', concurrentExecution)

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
  const response = await fetch(`${getNodeBackendUrl()}/api/stream-deep-research`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider,
        apiKey,
        baseUrl,
        model,
        messages,
        tools,
        toolIds,
        toolChoice,
        temperature,
        top_k,
        top_p,
        frequency_penalty,
        presence_penalty,
        contextMessageLimit,
        plan,
        question,
        researchType, // Pass researchType to backend
        concurrentExecution, // Pass concurrentExecution to backend
        searchProvider,
        tavilyApiKey,
      }),
      signal,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }))
      throw new Error(getBackendErrorMessage(error, response.status))
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) continue

        const data = line.slice(6)
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
            })
            return
          }

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

export const listToolsViaBackend = async () => {
  const response = await fetch(`${getRustBackendUrl()}/api/tools`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(getBackendErrorMessage(error, response.status))
  }
  const data = await response.json()
  return data?.tools || []
}

/**
 * List user custom tools via backend
 * @returns {Promise<Array>}
 */
export const listUserToolsViaBackend = async () => {
  const response = await fetch(`${getNodeBackendUrl()}/api/user-tools`, {
    headers: { 'x-user-id': 'default' },
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(getBackendErrorMessage(error, response.status))
  }
  const data = await response.json()
  return data?.tools || []
}

/**
 * Create user custom tool via backend
 * @param {Object} toolData
 * @returns {Promise<Object>}
 */
export const createUserToolViaBackend = async toolData => {
  const response = await fetch(`${getNodeBackendUrl()}/api/user-tools`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': 'default',
    },
    body: JSON.stringify(toolData),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(getBackendErrorMessage(error, response.status))
  }
  return response.json()
}

/**
 * Update user custom tool via backend
 * @param {string} id
 * @param {Object} toolData
 * @returns {Promise<Object>}
 */
export const updateUserToolViaBackend = async (id, toolData) => {
  const response = await fetch(`${getNodeBackendUrl()}/api/user-tools/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': 'default',
    },
    body: JSON.stringify(toolData),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(getBackendErrorMessage(error, response.status))
  }
  return response.json()
}

/**
 * Delete user custom tool via backend
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export const deleteUserToolViaBackend = async id => {
  const response = await fetch(`${getNodeBackendUrl()}/api/user-tools/${id}`, {
    method: 'DELETE',
    headers: { 'x-user-id': 'default' },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(getBackendErrorMessage(error, response.status))
  }
  return true
}

/**
 * Fetch MCP tools from a server URL (temporary connection)
 * @param {string} name - Server name
 * @param {string} url - Server URL
 * @param {object} options - Optional MCP config
 * @returns {Promise<Object>} { success, tools, total }
 */
export const fetchMcpToolsViaBackend = async (name, url, options = {}) => {
  const response = await fetch(`${getNodeBackendUrl()}/api/mcp-tools/fetch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      url,
      transport: options.transport,
      bearerToken: options.bearerToken,
      headers: options.headers,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(getBackendErrorMessage(error, response.status))
  }

  return response.json()
}
