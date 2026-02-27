import { getProvider } from '../providers'

const isLiteTask = task =>
  task === 'generateTitle' ||
  task === 'generateEmoji' ||
  task === 'generateTitleAndSpace' ||
  task === 'generateRelatedQuestions' ||
  task === 'generateResearchPlan' ||
  task === 'generateDocumentQuery' ||
  task === 'generateMemoryQuery' ||
  task === 'sessionContentSummary' ||
  task === 'lite'

const getGlobalModelConfig = (settings, task, fallbackAgent) => {
  const liteTask = isLiteTask(task)
  const model = liteTask ? settings?.liteModel || settings?.defaultModel : settings?.defaultModel
  const provider = liteTask
    ? settings?.liteModelProvider || settings?.defaultModelProvider || settings?.apiProvider
    : settings?.defaultModelProvider || settings?.apiProvider
  return {
    provider: provider || fallbackAgent?.provider || '',
    model: model || '',
  }
}

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

    const useGlobalModelSettingsRaw =
      candidate.use_global_model_settings ?? candidate.useGlobalModelSettings
    const useGlobalModelSettings =
      useGlobalModelSettingsRaw === undefined ? true : Boolean(useGlobalModelSettingsRaw)
    if (useGlobalModelSettings) return null

    const defaultModel = candidate.default_model ?? candidate.defaultModel
    const liteModel = candidate.lite_model ?? candidate.liteModel
    const defaultModelProvider =
      candidate.default_model_provider ?? candidate.defaultModelProvider ?? ''
    const liteModelProvider = candidate.lite_model_provider ?? candidate.liteModelProvider ?? ''
    const hasDefault = typeof defaultModel === 'string' && defaultModel.trim() !== ''
    const hasLite = typeof liteModel === 'string' && liteModel.trim() !== ''

    if (!hasDefault && !hasLite) return null

    const liteTask = isLiteTask(task)
    const model = liteTask ? liteModel || defaultModel : defaultModel || liteModel
    const provider = liteTask
      ? liteModelProvider || defaultModelProvider || candidate.provider
      : defaultModelProvider || liteModelProvider || candidate.provider

    if (!model || !provider) return null
    return { provider, model }
  }

  const primary = resolveFromAgent(agent)
  if (primary) return primary

  const fallback = resolveFromAgent(fallbackAgent)
  if (fallback) return fallback

  return getGlobalModelConfig(settings, task, fallbackAgent)
}

/**
 * Gets model configuration for conversation-scoped actions.
 * If selected agent explicitly enables global model settings,
 * force global model config and do not fall back to default agent's private models.
 */
export const getModelConfigForConversation = (
  selectedAgent,
  fallbackAgent,
  settings,
  task = 'streamChatCompletion',
) => {
  const selectedUseGlobalRaw =
    selectedAgent?.use_global_model_settings ?? selectedAgent?.useGlobalModelSettings
  const selectedUseGlobal =
    selectedAgent != null
      ? selectedUseGlobalRaw === undefined
        ? true
        : Boolean(selectedUseGlobalRaw)
      : false

  if (selectedAgent && selectedUseGlobal) {
    return getGlobalModelConfig(settings, task, fallbackAgent)
  }

  return getModelConfigForAgent(selectedAgent, settings, task, fallbackAgent)
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
