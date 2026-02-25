/**
 * Scrapbook Service
 * Wraps the backend /api/scrapbook REST endpoints.
 * Model config is read from global settings (defaultModelProvider / defaultModel)
 * and can be overridden by scrapbookProvider / scrapbookModel.
 */
import { loadSettings } from './settings'
import { getPublicEnv } from './publicEnv'

const ENV_VARS = {
  openAIKey: getPublicEnv('PUBLIC_OPENAI_API_KEY'),
  googleApiKey: getPublicEnv('PUBLIC_GOOGLE_API_KEY'),
  siliconflowKey: getPublicEnv('PUBLIC_SILICONFLOW_API_KEY'),
  glmKey: getPublicEnv('PUBLIC_GLM_API_KEY'),
  deepseekKey: getPublicEnv('PUBLIC_DEEPSEEK_API_KEY'),
  volcengineKey: getPublicEnv('PUBLIC_VOLCENGINE_API_KEY'),
  modelscopeKey: getPublicEnv('PUBLIC_MODELSCOPE_API_KEY'),
  kimiKey: getPublicEnv('PUBLIC_KIMI_API_KEY'),
  nvidiaKey: getPublicEnv('PUBLIC_NVIDIA_API_KEY'),
  minimaxKey: getPublicEnv('PUBLIC_MINIMAX_API_KEY'),
  openAIBase: getPublicEnv('PUBLIC_OPENAI_API_BASE'),
}

const getBackendUrl = () => {
  const settings = loadSettings()
  return settings.backendUrl || 'http://127.0.0.1:3002'
}

const getSelectedDatabaseProvider = () => {
  const settings = loadSettings()
  return settings.databaseProviderId || settings.databaseProvider || ''
}

/** Resolve the effective AI model config for Scrapbook. */
export const resolveScrapbookModelConfig = () => {
  const settings = loadSettings()
  return {
    provider: settings.scrapbookProvider || settings.defaultModelProvider || '',
    model: settings.scrapbookModel || settings.defaultModel || '',
    apiKey: _getApiKey(settings.scrapbookProvider || settings.defaultModelProvider || '', settings),
    baseUrl: _getBaseUrl(
      settings.scrapbookProvider || settings.defaultModelProvider || '',
      settings,
    ),
  }
}

const _getApiKey = (provider, settings) => {
  const map = {
    gemini: settings.googleApiKey || ENV_VARS.googleApiKey,
    openai_compatibility: settings.OpenAICompatibilityKey || ENV_VARS.openAIKey,
    siliconflow: settings.SiliconFlowKey || ENV_VARS.siliconflowKey,
    glm: settings.GlmKey || ENV_VARS.glmKey,
    deepseek: settings.DeepSeekKey || ENV_VARS.deepseekKey,
    volcengine: settings.VolcengineKey || ENV_VARS.volcengineKey,
    modelscope: settings.ModelScopeKey || ENV_VARS.modelscopeKey,
    kimi: settings.KimiKey || ENV_VARS.kimiKey,
    nvidia: settings.NvidiaKey || ENV_VARS.nvidiaKey,
    minimax: settings.MinimaxKey || ENV_VARS.minimaxKey,
  }
  return map[provider] || ''
}

const _getBaseUrl = (provider, settings) => {
  if (provider === 'openai_compatibility')
    return settings.OpenAICompatibilityUrl || ENV_VARS.openAIBase || ''
  return ''
}

/**
 * List scrapbook entries (newest first).
 */
export const listScrapbookEntries = async ({ platform, q, limit = 50 } = {}) => {
  try {
    const params = new URLSearchParams()
    const databaseProvider = getSelectedDatabaseProvider()
    if (platform && platform !== 'all') params.set('platform', platform)
    if (q) params.set('q', q)
    if (limit) params.set('limit', String(limit))
    if (databaseProvider) params.set('database_provider', databaseProvider)
    const res = await fetch(`${getBackendUrl()}/api/scrapbook?${params.toString()}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    return { data: json.items || [], error: json.error || null }
  } catch (err) {
    return { data: [], error: err?.message || 'Failed to fetch scrapbook' }
  }
}

/**
 * Get a scrapbook entry by id.
 */
export const getScrapbookEntryById = async id => {
  try {
    const params = new URLSearchParams()
    const databaseProvider = getSelectedDatabaseProvider()
    if (databaseProvider) params.set('database_provider', databaseProvider)
    const suffix = params.toString() ? `?${params.toString()}` : ''
    const res = await fetch(`${getBackendUrl()}/api/scrapbook/${id}${suffix}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    return { data: json.item, error: null }
  } catch (err) {
    return { data: null, error: err?.message || 'Failed to fetch entry' }
  }
}

/**
 * Create a scrapbook entry.
 * If source_url is provided and title/content empty, backend auto-fetches + generates.
 * @param {Object} entry - { title, summary, content, source_url, platform, thumbnail, tags }
 * @param {Object} modelConfig - { provider, apiKey, baseUrl, model } — passed to backend for AI
 */
export const createScrapbookEntry = async (entry, modelConfig = {}) => {
  try {
    const resolved = resolveScrapbookModelConfig()
    const databaseProvider = getSelectedDatabaseProvider()
    const payload = {
      ...entry,
      ...(databaseProvider ? { database_provider: databaseProvider } : {}),
      // AI model config — frontend resolves the key and passes it to backend
      provider: modelConfig.provider || resolved.provider,
      api_key: modelConfig.apiKey || resolved.apiKey,
      base_url: modelConfig.baseUrl || resolved.baseUrl || null,
      model: modelConfig.model || resolved.model || null,
    }
    const res = await fetch(`${getBackendUrl()}/api/scrapbook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || `HTTP ${res.status}`)
    }
    const json = await res.json()
    return { data: json.item, error: null }
  } catch (err) {
    return { data: null, error: err?.message || 'Failed to create entry' }
  }
}

/**
 * Delete a scrapbook entry by id.
 */
export const deleteScrapbookEntry = async id => {
  try {
    const params = new URLSearchParams()
    const databaseProvider = getSelectedDatabaseProvider()
    if (databaseProvider) params.set('database_provider', databaseProvider)
    const suffix = params.toString() ? `?${params.toString()}` : ''
    const res = await fetch(`${getBackendUrl()}/api/scrapbook/${id}${suffix}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { error: null }
  } catch (err) {
    return { error: err?.message || 'Failed to delete entry' }
  }
}

/** Platform display metadata */
export const PLATFORM_LABELS = {
  xhs: '小红书',
  wechat: '微信',
  youtube: 'YouTube',
  bilibili: 'Bilibili',
  twitter: 'X / Twitter',
  telegram: 'Telegram',
  rss: 'RSS',
  manual: '手动',
  unknown: '其他',
}

export const getPlatformLabel = platform => PLATFORM_LABELS[platform] || platform || '其他'
