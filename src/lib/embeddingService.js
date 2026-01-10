import { loadSettings } from './settings'
import { getPublicEnv } from './publicEnv'
import { GLM_BASE_URL, SILICONFLOW_BASE_URL } from './providerConstants'

const buildOpenAIEmbeddingRequest = async ({ apiKey, baseUrl, modelId, input }) => {
  if (!apiKey) {
    throw new Error('Missing API key for embedding provider')
  }
  if (!baseUrl) {
    throw new Error('Missing base URL for embedding provider')
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: modelId, input }),
  })

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `HTTP ${response.status}`)
  }

  const data = await response.json()
  const embedding = data?.data?.[0]?.embedding
  if (!Array.isArray(embedding)) {
    throw new Error('Embedding response did not contain vector data')
  }
  return embedding
}

const resolveEmbeddingConfig = overrides => {
  const settings = loadSettings(overrides)
  return {
    provider: overrides?.provider || settings.embeddingProvider,
    model: overrides?.model || settings.embeddingModel,
    OpenAICompatibilityKey: settings.OpenAICompatibilityKey || '',
    OpenAICompatibilityUrl: settings.OpenAICompatibilityUrl || '',
    SiliconFlowKey: settings.SiliconFlowKey || '',
    GlmKey: settings.GlmKey || '',
    KimiKey: settings.KimiKey || '',
    googleApiKey: settings.googleApiKey || '',
  }
}

export const fetchEmbeddingVector = async ({ text, taskType = 'RETRIEVAL_DOCUMENT', overrides = {} }) => {
  const trimmed = (text || '').trim()
  if (!trimmed) {
    throw new Error('Text is empty')
  }
  const config = resolveEmbeddingConfig(overrides)
  const provider = config.provider
  const model = config.model
  if (!provider || !model) {
    throw new Error('Embedding provider and model must be configured')
  }

  if (provider === 'gemini') {
    const apiKey = config.googleApiKey || getPublicEnv('PUBLIC_GOOGLE_API_KEY')
    if (!apiKey) {
      throw new Error('Google API key is required for Gemini embeddings')
    }
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: { parts: [{ text: trimmed }] },
          taskType,
        }),
      },
    )
    if (!response.ok) {
      const message = await response.text().catch(() => '')
      throw new Error(message || `HTTP ${response.status}`)
    }
    const data = await response.json()
    const values = data?.embedding?.values
    if (!Array.isArray(values)) {
      throw new Error('Gemini embedding response invalid')
    }
    return values
  }

  if (provider === 'modelscope') {
    throw new Error('ModelScope embeddings are not supported yet')
  }

  if (provider === 'openai_compatibility') {
    const apiKey = config.OpenAICompatibilityKey || getPublicEnv('PUBLIC_OPENAI_API_KEY')
    const baseUrl =
      config.OpenAICompatibilityUrl || getPublicEnv('PUBLIC_OPENAI_BASE_URL') || 'https://api.openai.com/v1'
    return await buildOpenAIEmbeddingRequest({
      apiKey,
      baseUrl,
      modelId: model,
      input: trimmed,
    })
  }

  if (provider === 'siliconflow') {
    const apiKey = config.SiliconFlowKey
    return await buildOpenAIEmbeddingRequest({
      apiKey,
      baseUrl: SILICONFLOW_BASE_URL,
      modelId: model,
      input: trimmed,
    })
  }

  if (provider === 'glm') {
    const apiKey = config.GlmKey
    return await buildOpenAIEmbeddingRequest({
      apiKey,
      baseUrl: GLM_BASE_URL,
      modelId: model,
      input: trimmed,
    })
  }

  if (provider === 'kimi') {
    const apiKey = config.KimiKey
    const baseUrl = getPublicEnv('PUBLIC_KIMI_BASE_URL') || 'https://api.moonshot.cn/v1'
    return await buildOpenAIEmbeddingRequest({
      apiKey,
      baseUrl,
      modelId: model,
      input: trimmed,
    })
  }

  throw new Error(`Embedding provider '${provider}' is not supported yet`)
}
