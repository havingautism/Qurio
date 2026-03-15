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

export const resolveEmbeddingConfig = overrides => {
  const settings = loadSettings(overrides)
  return {
    provider:
      overrides?.provider || settings.ocrProvider || settings.embeddingProvider,
    model: overrides?.model || settings.ocrModel || settings.embeddingModel,
    OpenAICompatibilityKey: settings.OpenAICompatibilityKey || '',
    OpenAICompatibilityUrl: settings.OpenAICompatibilityUrl || '',
    SiliconFlowKey: settings.SiliconFlowKey || '',
    GlmKey: settings.GlmKey || '',
    KimiKey: settings.KimiKey || '',
    googleApiKey: settings.googleApiKey || '',
  }
}

export const getEmbeddingConfigIssue = overrides => {
  const config = resolveEmbeddingConfig(overrides)
  const provider = String(config.provider || '').trim()
  const model = String(config.model || '').trim()

  if (!provider || !model) {
    return { code: 'missing_config', config }
  }

  if (provider === 'gemini') {
    const apiKey = config.googleApiKey || getPublicEnv('PUBLIC_GOOGLE_API_KEY')
    return apiKey ? null : { code: 'missing_key', provider, config }
  }

  if (provider === 'openai_compatibility') {
    const apiKey = config.OpenAICompatibilityKey || getPublicEnv('PUBLIC_OPENAI_API_KEY')
    return apiKey ? null : { code: 'missing_key', provider, config }
  }

  if (provider === 'siliconflow') {
    return config.SiliconFlowKey ? null : { code: 'missing_key', provider, config }
  }

  if (provider === 'glm') {
    return config.GlmKey ? null : { code: 'missing_key', provider, config }
  }

  if (provider === 'kimi') {
    return config.KimiKey ? null : { code: 'missing_key', provider, config }
  }

  if (provider === 'modelscope') {
    return { code: 'unsupported_provider', provider, config }
  }

  return null
}

export const fetchEmbeddingVector = async ({
  text,
  prompt,
  taskType = 'RETRIEVAL_DOCUMENT',
  overrides = {},
}) => {
  const sourceText = prompt !== undefined && prompt !== null ? prompt : text
  const trimmed = String(sourceText || '').trim()
  if (!trimmed) {
    throw new Error('Text is empty')
  }
  const config = resolveEmbeddingConfig(overrides)
  const provider = config.provider
  const model = config.model
  const issue = getEmbeddingConfigIssue(overrides)
  if (issue?.code === 'missing_config') {
    throw new Error('Embedding provider and model must be configured')
  }
  if (issue?.code === 'missing_key') {
    throw new Error('Missing API key for embedding provider')
  }
  if (issue?.code === 'unsupported_provider') {
    throw new Error(`Embedding provider '${provider}' is not supported yet`)
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
      config.OpenAICompatibilityUrl ||
      getPublicEnv('PUBLIC_OPENAI_BASE_URL') ||
      'https://api.openai.com/v1'
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
