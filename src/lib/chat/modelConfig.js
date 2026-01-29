import { getProvider } from '../providers'

/**
 * Gets model configuration for a given agent
 * Falls back to system default agent, then global settings if needed
 * @param {Object} agent - Agent object with model settings
 * @param {Object} settings - Global settings for fallback
 * @param {string} task - Task type (streamChatCompletion, generateTitle, etc.)
 * @param {Object} fallbackAgent - System default agent for fallback
 * @returns {Object} Model configuration { provider, model }
 */
export const getModelConfigForAgent = (
  agent,
  settings,
  task = 'streamChatCompletion',
  fallbackAgent,
) => {
  const resolveFromAgent = candidate => {
    if (!candidate) return null

    const defaultModel = candidate.default_model ?? candidate.defaultModel
    const liteModel = candidate.lite_model ?? candidate.liteModel
    const defaultModelProvider =
      candidate.default_model_provider ?? candidate.defaultModelProvider ?? ''
    const liteModelProvider = candidate.lite_model_provider ?? candidate.liteModelProvider ?? ''
    const hasDefault = typeof defaultModel === 'string' && defaultModel.trim() !== ''
    const hasLite = typeof liteModel === 'string' && liteModel.trim() !== ''

    if (!hasDefault && !hasLite) return null

    const isLiteTask =
      task === 'generateTitle' ||
      task === 'generateTitleAndSpace' ||
      task === 'generateRelatedQuestions' ||
      task === 'generateResearchPlan' ||
      task === 'generateDocumentQuery' ||
      task === 'generateMemoryQuery'

    const model = isLiteTask ? liteModel || defaultModel : defaultModel || liteModel
    const provider = isLiteTask
      ? liteModelProvider || defaultModelProvider || candidate.provider
      : defaultModelProvider || liteModelProvider || candidate.provider

    if (!model || !provider) return null
    return { provider, model }
  }

  const primary = resolveFromAgent(agent)
  if (primary) return primary

  const fallback = resolveFromAgent(fallbackAgent)
  if (fallback) return fallback

  return {
    provider: fallbackAgent?.provider || '',
    model: '',
  }
}

export const resolveProviderConfigWithCredentials = (agent, settings, task, fallbackAgent) => {
  const primaryConfig = getModelConfigForAgent(agent, settings, task, fallbackAgent)
  const primaryProvider = getProvider(primaryConfig.provider)
  const primaryCredentials = primaryProvider.getCredentials(settings)

  if (primaryCredentials?.apiKey) {
    return {
      modelConfig: primaryConfig,
      provider: primaryProvider,
      credentials: primaryCredentials,
    }
  }

  const fallbackConfig = getModelConfigForAgent(
    agent,
    settings,
    'streamChatCompletion',
    fallbackAgent,
  )
  const fallbackProvider = getProvider(fallbackConfig.provider)
  const fallbackCredentials = fallbackProvider.getCredentials(settings)

  return {
    modelConfig: fallbackConfig,
    provider: fallbackProvider,
    credentials: fallbackCredentials,
  }
}
