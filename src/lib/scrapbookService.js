/**
 * Scrapbook Service
 * Wraps the backend /api/scrapbook REST endpoints.
 * Model config and personalization are stored on a hidden system scrapbook agent.
 */
import {
  buildScrapbookResponseStylePrompt,
  getBackendUrl,
  loadSettings,
  resolveScrapbookStyleSettings,
} from './settings'
import { createAgent, getAgentById, updateAgent } from './agentsService'
import { getModelConfigForAgent } from './chat/modelConfig'
import { getLanguageInstruction } from './chat/prompts'
import { getPublicEnv } from './publicEnv'
import { buildScrapbookSystemAgentPayload, SCRAPBOOK_AGENT_ID } from './systemAgents'

const ENV_VARS = {
  openAIKey: getPublicEnv('PUBLIC_OPENAI_API_KEY'),
  openRouterKey: getPublicEnv('PUBLIC_OPENROUTER_API_KEY'),
  liteLLMKey: getPublicEnv('PUBLIC_LITELLM_API_KEY'),
  liteLLMBaseUrl: getPublicEnv('PUBLIC_LITELLM_BASE_URL'),
  huggingFaceKey: getPublicEnv('PUBLIC_HUGGINGFACE_API_KEY'),
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

const buildSecretHeaders = secrets => {
  const headers = {}
  if (String(secrets.apiKey || '').trim()) {
    headers['x-llm-api-key'] = String(secrets.apiKey).trim()
  }
  return headers
}

export const notifyScrapbookChanged = detail => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('scrapbook-changed', { detail: detail || {} }))
}

const SCRAPBOOK_AGENT_SYNC_KEYS = ['name', 'description', 'emoji', 'isHidden']

const isAgentStyleSource = source =>
  Boolean(
    source &&
    typeof source === 'object' &&
    ('useGlobalModelSettings' in source ||
      'baseTone' in source ||
      'base_tone' in source ||
      'defaultModelProvider' in source ||
      'default_model_provider' in source),
  )

const buildScrapbookAgentPatch = (currentAgent, nextAgent) => {
  const patch = {}
  for (const key of SCRAPBOOK_AGENT_SYNC_KEYS) {
    if (!Object.is(currentAgent?.[key] ?? null, nextAgent?.[key] ?? null)) {
      patch[key] = nextAgent[key]
    }
  }
  return patch
}

export const ensureScrapbookAgent = async (settings = loadSettings()) => {
  const desiredAgent = buildScrapbookSystemAgentPayload(settings)
  const { data: currentAgent, error } = await getAgentById(SCRAPBOOK_AGENT_ID)
  if (error) return { data: null, error }

  if (!currentAgent) {
    return createAgent(desiredAgent)
  }

  const patch = buildScrapbookAgentPatch(currentAgent, desiredAgent)
  if (Object.keys(patch).length === 0) {
    return { data: currentAgent, error: null }
  }

  return updateAgent(currentAgent.id, patch)
}

export const resolveScrapbookStyleSettingsFromAgent = (agent, settings = loadSettings()) => {
  if (!agent) return resolveScrapbookStyleSettings(settings)
  return {
    baseTone: agent.baseTone || settings.baseTone || 'technical',
    traits: agent.traits || settings.traits || 'default',
    warmth: agent.warmth || settings.warmth || 'default',
    enthusiasm: agent.enthusiasm || settings.enthusiasm || 'default',
    headings: agent.headings || settings.headings || 'default',
    emojis: agent.emojis || settings.emojis || 'default',
    customInstruction: agent.customInstruction || settings.customInstruction || '',
  }
}

/** Resolve the effective AI model config for Scrapbook. */
export const resolveScrapbookModelConfig = async (defaultAgent, task = 'streamChatCompletion') => {
  const settings = loadSettings()
  const { data: scrapbookAgent, error } = await ensureScrapbookAgent(settings)
  const resolvedAgent = error ? null : scrapbookAgent
  const modelConfig = getModelConfigForAgent(resolvedAgent, settings, task, defaultAgent)
  const isLiteTask =
    task === 'generateTitle' || task === 'generateEmoji' || task === 'generateTitleAndSpace'
  const provider = modelConfig.provider || settings.defaultModelProvider || ''
  const model = modelConfig.model || (isLiteTask ? settings.liteModel : settings.defaultModel) || ''
  const scrapbookStyle = resolveScrapbookStyleSettingsFromAgent(resolvedAgent, settings)
  const taskType = isLiteTask ? 'title' : 'summary'

  return {
    provider,
    model,
    apiKey: _getApiKey(provider, settings),
    baseUrl: _getBaseUrl(provider, settings),
    scrapbookAgent: resolvedAgent,
    scrapbookStyle,
    stylePrompt: buildScrapbookStylePrompt(taskType, resolvedAgent || scrapbookStyle),
  }
}

export const buildScrapbookStylePrompt = (taskType = 'summary', settings = null) => {
  const globalSettings = loadSettings()
  const languageInstruction = isAgentStyleSource(settings)
    ? getLanguageInstruction(settings, globalSettings)
    : ''
  const resolvedSettings = isAgentStyleSource(settings)
    ? resolveScrapbookStyleSettingsFromAgent(settings, globalSettings)
    : settings && typeof settings === 'object'
      ? settings
      : globalSettings
  const taskMap = {
    title:
      'You are generating a title for a Scrapbook entry. Prefer specific, retrievable titles that help the user find the note later.',
    summary:
      'You are generating a structured Scrapbook summary. Focus on preserving key ideas, decisions, examples, and useful takeaways.',
    organize:
      'You are organizing content into a reusable Scrapbook note. Prioritize clarity, information density, and easy scanning.',
  }
  const stylePrompt = buildScrapbookResponseStylePrompt(resolvedSettings)
  return [
    taskMap[taskType] || taskMap.summary,
    'Do not invent facts, quotes, steps, or conclusions that are not supported by the source content.',
    'Keep the output useful for later review, retrieval, and action.',
    languageInstruction ? `## Language\n${languageInstruction}` : '',
    stylePrompt,
  ]
    .filter(Boolean)
    .join('\n\n')
}

const _getApiKey = (provider, settings) => {
  const map = {
    gemini: settings.googleApiKey || ENV_VARS.googleApiKey,
    openai_compatibility: settings.OpenAICompatibilityKey || ENV_VARS.openAIKey,
    openrouter: settings.OpenRouterKey || ENV_VARS.openRouterKey,
    litellm_openai: settings.LiteLLMKey || ENV_VARS.liteLLMKey,
    huggingface: settings.HuggingFaceKey || ENV_VARS.huggingFaceKey,
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
  if (provider === 'openai_compatibility') {
    return settings.OpenAICompatibilityUrl || ENV_VARS.openAIBase || ''
  }
  if (provider === 'litellm_openai') {
    return settings.LiteLLMUrl || ENV_VARS.liteLLMBaseUrl || ''
  }
  return ''
}

/**
 * List scrapbook entries (newest first).
 */
export const listScrapbookEntries = async ({ platform, q, cursor, limit = 50, page } = {}) => {
  try {
    const params = new URLSearchParams()
    if (platform && platform !== 'all') params.set('platform', platform)
    if (q) params.set('q', q)
    if (cursor) params.set('cursor', cursor)
    if (page) params.set('page', String(page))
    if (limit) params.set('limit', String(limit))
    const res = await fetch(`${getBackendUrl()}/api/scrapbook?${params.toString()}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    return {
      data: json.items || [],
      count: json.count || 0,
      error: json.error || null,
    }
  } catch (err) {
    return { data: [], count: 0, error: err?.message || 'Failed to fetch scrapbook' }
  }
}

/**
 * Get a scrapbook entry by id.
 */
export const getScrapbookEntryById = async id => {
  try {
    const res = await fetch(`${getBackendUrl()}/api/scrapbook/${id}`)
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
    const resolved = modelConfig.provider
      ? modelConfig
      : await resolveScrapbookModelConfig(modelConfig.defaultAgent, 'generateTitle')
    const payload = {
      ...entry,
      // AI model config — frontend resolves the key and passes it to backend
      provider: modelConfig.provider || resolved.provider,
      base_url: modelConfig.baseUrl || resolved.baseUrl || null,
      model: modelConfig.model || resolved.model || null,
      style_prompt:
        modelConfig.stylePrompt || buildScrapbookStylePrompt('title', resolved.scrapbookStyle),
    }
    const res = await fetch(`${getBackendUrl()}/api/scrapbook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildSecretHeaders({ apiKey: modelConfig.apiKey || resolved.apiKey }),
      },
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
    const res = await fetch(`${getBackendUrl()}/api/scrapbook/${id}`, { method: 'DELETE' })
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

/**
 * Extract domain from a URL for display (e.g. 'https://juejin.cn/post/123' → 'juejin.cn')
 */
const extractDomain = url => {
  if (!url) return null
  try {
    let domain = new URL(url).hostname.toLowerCase()
    if (domain.startsWith('www.')) domain = domain.slice(4)
    return domain || null
  } catch {
    return null
  }
}

/**
 * Get display label for a platform.
 * For known platforms (youtube, bilibili, etc.) returns the Chinese label.
 * For 'unknown' with a source_url, returns the domain name (e.g. 'juejin.cn').
 * For 'manual' (no URL), returns '手动'.
 */
export const getPlatformLabel = (platform, sourceUrl) => {
  if (!platform) return '其他'
  if (PLATFORM_LABELS[platform] && platform !== 'unknown') return PLATFORM_LABELS[platform]
  // For 'unknown' platform, try to extract domain from source_url for display
  if (platform === 'unknown' && sourceUrl) {
    return extractDomain(sourceUrl) || '其他'
  }
  return PLATFORM_LABELS[platform] || platform
}
