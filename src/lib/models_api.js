/**
 * API for fetching available models from different providers (via backend)
 */

const getApiBasePath = () => {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
  return basePath ? basePath.replace(/\/$/, '') : ''
}

const buildApiUrl = path => `${getApiBasePath()}${path}`

const fetchModelsFromBackend = async (payload, options = {}) => {
  // Add timeout to prevent hanging requests
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort())
  }

  const response = await fetch(buildApiUrl('/api/llm/models'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })

  clearTimeout(timeoutId)

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Invalid API key or insufficient permissions')
    }
    const message = await response.text().catch(() => '')
    throw new Error(message || `HTTP error! status: ${response.status}`)
  }

  const data = await response.json()
  return data?.models || []
}

// Get models for a specific provider
export const getModelsForProvider = async (provider, credentials, options = {}) => {
  switch (provider) {
    case 'gemini':
      return await fetchModelsFromBackend(
        { provider, apiKey: credentials.apiKey },
        options,
      )
    case 'siliconflow':
      return await fetchModelsFromBackend(
        { provider, apiKey: credentials.apiKey, baseUrl: credentials.baseUrl },
        options,
      )
    case 'openai_compatibility':
      // OpenAI compatible doesn't have a standard models endpoint
      // Return empty array to use fallback models
      return []
    default:
      return []
  }
}
