/**
 * API for fetching available models from different providers (direct from browser).
 */

import { getPublicEnv } from './publicEnv'

const OPENAI_DEFAULT_BASE = 'https://api.openai.com/v1'
const SILICONFLOW_BASE = 'https://api.siliconflow.cn/v1'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const GLM_BASE = getPublicEnv('PUBLIC_GLM_BASE_URL') || 'https://open.bigmodel.cn/api/paas/v4'
const MODELSCOPE_BASE =
  getPublicEnv('PUBLIC_MODELSCOPE_BASE_URL') || 'https://api-inference.modelscope.cn/v1'
const KIMI_BASE = getPublicEnv('PUBLIC_KIMI_BASE_URL') || 'https://api.moonshot.cn/v1'

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

// GLM (Zhipu AI) - fetch models from API endpoint
const fetchGLMModels = async ({ apiKey }, options = {}) => {
  const resolvedKey = apiKey || getPublicEnv('PUBLIC_GLM_API_KEY')
  if (!resolvedKey) return []

  const { controller, timeoutId } = withTimeout(options.signal)
  const response = await fetch(`${GLM_BASE}/models`, {
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

// ModelScope - intentionally skip fetching models for now.
const fetchModelScopeModels = async () => []

// Kimi (Moonshot AI) - fetch models from API endpoint (OpenAI-compatible)
const fetchKimiModels = async ({ apiKey }, options = {}) => {
  const resolvedKey = apiKey || getPublicEnv('PUBLIC_KIMI_API_KEY')
  if (!resolvedKey) return []

  const { controller, timeoutId } = withTimeout(options.signal)
  const response = await fetch(`${KIMI_BASE}/models`, {
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
    case 'glm':
      return await fetchGLMModels({ apiKey: credentials.apiKey }, options)
    case 'modelscope':
      return await fetchModelScopeModels()
    case 'kimi':
      return await fetchKimiModels({ apiKey: credentials.apiKey }, options)
    case 'openai_compatibility':
      return await fetchOpenAIModels(
        { apiKey: credentials.apiKey, baseUrl: credentials.baseUrl },
        options,
      )
    default:
      return []
  }
}
