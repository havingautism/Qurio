/**
 * API for fetching available models from different providers (direct from browser).
 */

import { getPublicEnv } from './publicEnv'

const OPENAI_DEFAULT_BASE = 'https://api.openai.com/v1'
const SILICONFLOW_BASE = 'https://api.siliconflow.cn/v1'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

const withTimeout = (signal, timeoutMs = 10000) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  if (signal) {
    signal.addEventListener('abort', () => controller.abort())
  }

  return { controller, timeoutId }
}

const fetchOpenAIModels = async ({ apiKey, baseUrl }, options = {}) => {
  const resolvedBase = (
    baseUrl ||
    getPublicEnv('PUBLIC_OPENAI_BASE_URL') ||
    OPENAI_DEFAULT_BASE
  ).replace(/\/$/, '')
  const resolvedKey = apiKey || getPublicEnv('PUBLIC_OPENAI_API_KEY')
  if (!resolvedKey) return []

  const { controller, timeoutId } = withTimeout(options.signal)
  const response = await fetch(`${resolvedBase}/models`, {
    headers: { Authorization: `Bearer ${resolvedKey}` },
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
  return (data?.data || []).map(model => ({
    value: model.id,
    label: model.id,
  }))
}

const fetchGeminiModels = async ({ apiKey }, options = {}) => {
  const resolvedKey = apiKey || getPublicEnv('PUBLIC_GOOGLE_API_KEY')
  if (!resolvedKey) return []

  const { controller, timeoutId } = withTimeout(options.signal)
  const response = await fetch(`${GEMINI_BASE}/models?key=${resolvedKey}`, {
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
  return (data?.models || []).map(model => {
    const name = model.name?.replace(/^models\//, '') || model.displayName || 'unknown'
    return {
      value: name,
      label: model.displayName || name,
    }
  })
}

// Get models for a specific provider
export const getModelsForProvider = async (provider, credentials, options = {}) => {
  switch (provider) {
    case 'gemini':
      return await fetchGeminiModels({ apiKey: credentials.apiKey }, options)
    case 'siliconflow':
      return await fetchOpenAIModels(
        { apiKey: credentials.apiKey, baseUrl: SILICONFLOW_BASE },
        options,
      )
    case 'openai_compatibility':
      return await fetchOpenAIModels(
        { apiKey: credentials.apiKey, baseUrl: credentials.baseUrl },
        options,
      )
    default:
      return []
  }
}
