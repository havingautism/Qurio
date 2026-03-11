import { getPublicEnv } from './publicEnv'

export const DEFAULT_BACKEND_URL = 'http://127.0.0.1:3002'

const DEFAULT_SECRET_PLACEHOLDERS = new Set([
  'your-api-key',
  'your_api_key',
  'your api key',
  'your-secret',
  'your_secret',
  'changeme',
  'replace-me',
  'replace_me',
])

export const isConfiguredApiSecret = (value, placeholders = []) => {
  const trimmed = String(value || '').trim()
  if (!trimmed) return false
  const normalized = trimmed.toLowerCase()
  if (DEFAULT_SECRET_PLACEHOLDERS.has(normalized)) return false
  return !placeholders.map(item => String(item || '').trim().toLowerCase()).includes(normalized)
}

const isElectronRuntime = () =>
  typeof window !== 'undefined' &&
  (window.location.protocol === 'file:' || navigator.userAgent.includes('Electron'))

const getElectronBackendUrlFromBridge = () => {
  if (!isElectronRuntime() || typeof window === 'undefined') return ''
  const raw = window.qurioRuntime?.backendUrl
  const trimmed = String(raw || '').trim()
  if (!trimmed) return ''
  return /^https?:\/\/[^/]+$/i.test(trimmed) ? trimmed : ''
}

const getElectronBackendUrlOverride = () => {
  if (!isElectronRuntime() || typeof window === 'undefined') return ''
  try {
    const value = new URLSearchParams(window.location.search).get('backend_url') || ''
    const trimmed = value.trim()
    if (!trimmed) return ''
    return /^https?:\/\/[^/]+/i.test(trimmed) ? trimmed.replace(/\/+$/, '') : ''
  } catch {
    return ''
  }
}

/**
 * Centralized Settings Management
 *
 * Handles loading and saving of application configuration including:
 * - Supabase credentials
 * - OpenAI compatibility settings
 */

/**
 * Load settings from various sources (Env -> LocalStorage -> Args)
 * @param {Object} [overrides={}] - Optional overrides
 * @returns {Object} The consolidated settings object
 */
const DEFAULT_STYLE_SETTINGS = {
  baseTone: 'technical',
  traits: 'default',
  warmth: 'default',
  enthusiasm: 'default',
  headings: 'default',
  emojis: 'default',
  customInstruction: '',
}

const DEFAULT_SCRAPBOOK_STYLE_SETTINGS = {
  scrapbookBaseTone: '',
  scrapbookTraits: '',
  scrapbookWarmth: '',
  scrapbookEnthusiasm: '',
  scrapbookHeadings: '',
  scrapbookEmojis: '',
  scrapbookCustomInstruction: '',
}

const STYLE_PROMPTS = {
  baseTone: {
    technical: 'Use a technical, precise tone suitable for developers.',
    friendly: 'Use a friendly, approachable tone.',
    professional: 'Use a professional, business-appropriate tone.',
    academic: 'Use an academic, formal tone with clear reasoning.',
    creative: 'Use a creative, vivid tone when appropriate.',
    casual: 'Use a casual, conversational tone.',
  },
  traits: {
    default: '',
    concise: 'Be concise and avoid filler.',
    structured: 'Prefer structured answers with clear sections.',
    detailed: 'Provide thorough explanations with necessary detail.',
    actionable: 'Prioritize actionable steps and concrete recommendations.',
    analytical: 'Use an analytical mindset and highlight trade-offs.',
  },
  warmth: {
    default: '',
    gentle: 'Be gentle and considerate in phrasing.',
    empathetic: 'Show empathy and acknowledge user intent or concerns.',
    direct: 'Keep warmth minimal and focus on direct delivery.',
    supportive: 'Be supportive and reassuring when appropriate.',
  },
  enthusiasm: {
    default: '',
    low: 'Keep enthusiasm low and neutral.',
    medium: 'Maintain a balanced, positive tone.',
    high: 'Use an upbeat, energetic tone.',
  },
  headings: {
    default: '',
    minimal: 'Use minimal formatting and avoid excessive headings.',
    structured: 'Use headings and lists to improve scanability.',
    detailed: 'Use clear headings, lists, and short summaries.',
  },
  emojis: {
    default: '',
    none: 'Avoid using emojis.',
    light: 'Use emojis sparingly.',
    moderate: 'Use a moderate amount of emojis when fitting.',
    expressive: 'Feel free to use emojis to add warmth and clarity.',
  },
}

const buildResponseStylePrompt = settings => {
  const rules = []
  const baseTonePrompt = STYLE_PROMPTS.baseTone[settings.baseTone]
  if (baseTonePrompt) rules.push(baseTonePrompt)

  const traitPrompt = STYLE_PROMPTS.traits[settings.traits]
  if (traitPrompt) rules.push(traitPrompt)

  const warmthPrompt = STYLE_PROMPTS.warmth[settings.warmth]
  if (warmthPrompt) rules.push(warmthPrompt)

  const enthusiasmPrompt = STYLE_PROMPTS.enthusiasm[settings.enthusiasm]
  if (enthusiasmPrompt) rules.push(enthusiasmPrompt)

  const headingsPrompt = STYLE_PROMPTS.headings[settings.headings]
  if (headingsPrompt) rules.push(headingsPrompt)

  const emojisPrompt = STYLE_PROMPTS.emojis[settings.emojis]
  if (emojisPrompt) rules.push(emojisPrompt)

  const customInstruction =
    typeof settings.customInstruction === 'string' ? settings.customInstruction.trim() : ''
  if (customInstruction) rules.push(customInstruction)

  if (rules.length === 0) return ''
  return `## Response Style\n${rules.map(rule => `- ${rule}`).join('\n')}`
}

export const resolveScrapbookStyleSettings = settings => {
  const source = settings && typeof settings === 'object' ? settings : {}
  return {
    baseTone: source.scrapbookBaseTone || source.baseTone || DEFAULT_STYLE_SETTINGS.baseTone,
    traits: source.scrapbookTraits || source.traits || DEFAULT_STYLE_SETTINGS.traits,
    warmth: source.scrapbookWarmth || source.warmth || DEFAULT_STYLE_SETTINGS.warmth,
    enthusiasm:
      source.scrapbookEnthusiasm || source.enthusiasm || DEFAULT_STYLE_SETTINGS.enthusiasm,
    headings: source.scrapbookHeadings || source.headings || DEFAULT_STYLE_SETTINGS.headings,
    emojis: source.scrapbookEmojis || source.emojis || DEFAULT_STYLE_SETTINGS.emojis,
    customInstruction:
      source.scrapbookCustomInstruction ||
      source.customInstruction ||
      DEFAULT_STYLE_SETTINGS.customInstruction,
  }
}

export const buildScrapbookResponseStylePrompt = settings => {
  const resolved = resolveScrapbookStyleSettings(settings)
  return buildResponseStylePrompt(resolved)
}

export const buildResponseStylePromptFromAgent = agent => {
  if (!agent) return ''
  const rules = []
  const baseTone = agent.base_tone || agent.baseTone
  const traits = agent.traits
  const warmth = agent.warmth
  const enthusiasm = agent.enthusiasm
  const headings = agent.headings
  const emojis = agent.emojis
  const customInstruction = agent.custom_instruction || agent.customInstruction

  const baseTonePrompt = STYLE_PROMPTS.baseTone[baseTone]
  if (baseTonePrompt) rules.push(baseTonePrompt)
  const traitPrompt = STYLE_PROMPTS.traits[traits]
  if (traitPrompt) rules.push(traitPrompt)
  const warmthPrompt = STYLE_PROMPTS.warmth[warmth]
  if (warmthPrompt) rules.push(warmthPrompt)
  const enthusiasmPrompt = STYLE_PROMPTS.enthusiasm[enthusiasm]
  if (enthusiasmPrompt) rules.push(enthusiasmPrompt)
  const headingsPrompt = STYLE_PROMPTS.headings[headings]
  if (headingsPrompt) rules.push(headingsPrompt)
  const emojisPrompt = STYLE_PROMPTS.emojis[emojis]
  if (emojisPrompt) rules.push(emojisPrompt)

  const trimmedCustom = typeof customInstruction === 'string' ? customInstruction.trim() : ''
  if (trimmedCustom) rules.push(trimmedCustom)

  if (rules.length === 0) return ''
  return `## Response Style\n${rules.map(rule => `- ${rule}`).join('\n')}`
}

// In-memory cache for sensitive settings (API keys) fetched from Supabase
let memorySettings = {}
let legacySensitiveSettingsMigrated = false

const getSessionStorage = () => {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

const MEMORY_SETTINGS_KEYS = [
  'OpenAICompatibilityKey',
  'OpenAICompatibilityUrl',
  'SiliconFlowKey',
  'GlmKey',
  'DeepSeekKey',
  'VolcengineKey',
  'ModelScopeKey',
  'KimiKey',
  'googleApiKey',
  'tavilyApiKey',
  'serpapiApiKey',
  'exaApiKey',
  'NvidiaKey',
  'MinimaxKey',
  'searchProvider',
  'backendUrl',
  'embeddingProvider',
  'embeddingModel',
  'embeddingModelSource',
  'defaultModel',
  'liteModel',
  'defaultModelProvider',
  'liteModelProvider',
  'defaultModelSource',
  'liteModelSource',
  'enableLongTermMemory',
  'userSelfIntro',
  'scrapbookProvider',
  'scrapbookModel',
  'scrapbookModelSource',
]

const LEGACY_LOCAL_SENSITIVE_KEYS = [
  'tavilyApiKey',
  'serpapiApiKey',
  'exaApiKey',
]

const SESSION_SENSITIVE_KEYS = [
  'OpenAICompatibilityKey',
  'OpenAICompatibilityUrl',
  'SiliconFlowKey',
  'GlmKey',
  'DeepSeekKey',
  'VolcengineKey',
  'ModelScopeKey',
  'KimiKey',
  'googleApiKey',
  'tavilyApiKey',
  'serpapiApiKey',
  'exaApiKey',
  'NvidiaKey',
  'MinimaxKey',
]

export const updateMemorySettings = settings => {
  const source = settings && typeof settings === 'object' ? settings : {}
  MEMORY_SETTINGS_KEYS.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      memorySettings[key] = source[key]
    } else {
      delete memorySettings[key]
    }
  })
}

const migrateLegacySensitiveSettings = () => {
  if (legacySensitiveSettingsMigrated || typeof localStorage === 'undefined') return
  legacySensitiveSettingsMigrated = true
  const session = getSessionStorage()

  LEGACY_LOCAL_SENSITIVE_KEYS.forEach(key => {
    const value = localStorage.getItem(key)
    if (value !== null && memorySettings[key] === undefined) {
      memorySettings[key] = value
    }
    if (value !== null && session && !session.getItem(key)) {
      session.setItem(key, value)
    }
    localStorage.removeItem(key)
  })
}

export const loadSettings = (overrides = {}) => {
  migrateLegacySensitiveSettings()
  const session = getSessionStorage()
  const electronMode = isElectronRuntime()
  const electronBackendUrl = getElectronBackendUrlFromBridge() || getElectronBackendUrlOverride()

  // Supabase Env Vars
  const envSupabaseUrl = electronMode ? '' : getPublicEnv('PUBLIC_SUPABASE_URL')
  const envSupabaseKey = electronMode ? '' : getPublicEnv('PUBLIC_SUPABASE_KEY')
  const envBackendUrl = electronMode ? '' : getPublicEnv('PUBLIC_BACKEND_URL')
  const envDbAccessKey = electronMode ? '' : getPublicEnv('PUBLIC_DB_ACCESS_KEY')

  // OpenAI Env Vars
  const envOpenAIKey = electronMode ? '' : getPublicEnv('PUBLIC_OPENAI_API_KEY')
  const envOpenAIBaseUrl = electronMode ? '' : getPublicEnv('PUBLIC_OPENAI_BASE_URL')
  const envTavilyApiKey = electronMode ? '' : getPublicEnv('PUBLIC_TAVILY_API_KEY')
  const envExaApiKey = electronMode ? '' : getPublicEnv('PUBLIC_EXA_API_KEY')

  // LocalStorage - Only load non-sensitive or essential connection configs
  const localDatabaseProvider = localStorage.getItem('databaseProvider')
  const legacyDatabaseProviderId = localStorage.getItem('databaseProviderId')
  const localDatabaseProviderLabel = localStorage.getItem('databaseProviderLabel')
  const localDatabaseSupabaseUrl = localStorage.getItem('databaseSupabaseUrl')
  const localDatabaseSupabaseKey = localStorage.getItem('databaseSupabaseKey')
  const localSupabaseUrl = localStorage.getItem('supabaseUrl')
  const localSupabaseKey = localStorage.getItem('supabaseKey')
  const localDbAccessKey = localStorage.getItem('dbAccessKey')
  const localSearchProvider = localStorage.getItem('searchProvider')
  const localBackendUrl = localStorage.getItem('backendUrl')

  // Model configuration
  const localSystemPrompt = localStorage.getItem('systemPrompt')
  const localContextTurns = localStorage.getItem('contextTurns')
  const localContextMessageLimit = localStorage.getItem('contextMessageLimit')
  const localThemeColor = localStorage.getItem('themeColor')
  const localEnableRelatedQuestions = localStorage.getItem('enableRelatedQuestions')
  const localInterfaceLanguage = localStorage.getItem('interfaceLanguage')
  const localFollowInterfaceLanguage = localStorage.getItem('followInterfaceLanguage')
  const localLlmAnswerLanguage = localStorage.getItem('llmAnswerLanguage')
  const localFontSize = localStorage.getItem('fontSize')
  const localEnableLongTermMemory = localStorage.getItem('enableLongTermMemory')
  const localMemoryRecallLimit = localStorage.getItem('memoryRecallLimit')
  const localEmbeddingProvider = localStorage.getItem('embeddingProvider')
  const localEmbeddingModel = localStorage.getItem('embeddingModel')
  const localEmbeddingModelSource = localStorage.getItem('embeddingModelSource')
  const localScrapbookProvider = localStorage.getItem('scrapbookProvider')
  const localScrapbookModel = localStorage.getItem('scrapbookModel')
  const localScrapbookModelSource = localStorage.getItem('scrapbookModelSource')
  const localScrapbookBaseTone = localStorage.getItem('scrapbookBaseTone')
  const localScrapbookTraits = localStorage.getItem('scrapbookTraits')
  const localScrapbookWarmth = localStorage.getItem('scrapbookWarmth')
  const localScrapbookEnthusiasm = localStorage.getItem('scrapbookEnthusiasm')
  const localScrapbookHeadings = localStorage.getItem('scrapbookHeadings')
  const localScrapbookEmojis = localStorage.getItem('scrapbookEmojis')
  const localScrapbookCustomInstruction = localStorage.getItem('scrapbookCustomInstruction')
  const localDefaultModel = localStorage.getItem('defaultModel')
  const localLiteModel = localStorage.getItem('liteModel')
  const localDefaultModelProvider = localStorage.getItem('defaultModelProvider')
  const localLiteModelProvider = localStorage.getItem('liteModelProvider')
  const localDefaultModelSource = localStorage.getItem('defaultModelSource')
  const localLiteModelSource = localStorage.getItem('liteModelSource')
  const localDeveloperMode = localStorage.getItem('developerMode')
  // Style settings
  const localStyleBaseTone = localStorage.getItem('styleBaseTone')
  const localStyleTraits = localStorage.getItem('styleTraits')
  const localStyleWarmth = localStorage.getItem('styleWarmth')
  const localStyleEnthusiasm = localStorage.getItem('styleEnthusiasm')
  const localStyleHeadings = localStorage.getItem('styleHeadings')
  const localStyleEmojis = localStorage.getItem('styleEmojis')
  const localStyleCustomInstruction = localStorage.getItem('styleCustomInstruction')

  const parsedContextTurns = parseInt(localContextTurns, 10)
  const parsedContextLimit = parseInt(localContextMessageLimit, 10)
  const overrideContextTurns = parseInt(
    String(overrides.contextTurns ?? overrides.contextMessageLimit ?? ''),
    10,
  )
  const resolvedContextLimit = Number.isFinite(parsedContextTurns)
    ? parsedContextTurns
    : Number.isFinite(parsedContextLimit)
      ? parsedContextLimit
      : Number.isFinite(overrideContextTurns)
        ? overrideContextTurns
        : 12
  const resolvedRelatedQuestionsPreference =
    typeof overrides.enableRelatedQuestions === 'boolean'
      ? overrides.enableRelatedQuestions
      : localEnableRelatedQuestions !== null
        ? localEnableRelatedQuestions === 'true'
        : true
  const parsedMemoryRecallLimit = parseInt(localMemoryRecallLimit, 10)
  const resolvedMemoryRecallLimit = Number.isFinite(parsedMemoryRecallLimit)
    ? parsedMemoryRecallLimit
    : overrides.memoryRecallLimit || 5
  const resolvedLongTermMemoryPreference =
    typeof overrides.enableLongTermMemory === 'boolean'
      ? overrides.enableLongTermMemory
      : localEnableLongTermMemory !== null
        ? localEnableLongTermMemory === 'true'
        : false

  const resolvedDatabaseProvider =
    overrides.databaseProvider ||
    localDatabaseProvider ||
    legacyDatabaseProviderId ||
    ''
  const resolvedDatabaseProviderLabel =
    overrides.databaseProviderLabel || localDatabaseProviderLabel || ''
  const overrideSupabaseUrl =
    overrides.supabaseUrl ||
    overrides.databaseSupabaseUrl ||
    overrides?.databaseConfig?.supabase?.url ||
    ''
  const overrideSupabaseKey =
    overrides.supabaseKey ||
    overrides.databaseSupabaseKey ||
    overrides?.databaseConfig?.supabase?.key ||
    ''
  const resolvedSupabaseUrl =
    envSupabaseUrl || localDatabaseSupabaseUrl || localSupabaseUrl || overrideSupabaseUrl || ''
  const resolvedSupabaseKey =
    envSupabaseKey || localDatabaseSupabaseKey || localSupabaseKey || overrideSupabaseKey || ''

  const settings = {
    // Database (local/env to connect)
    databaseProvider: resolvedDatabaseProvider,
    databaseProviderLabel: resolvedDatabaseProviderLabel,
    databaseConfig: {
      supabase: {
        url: resolvedSupabaseUrl,
        key: resolvedSupabaseKey,
      },
    },
    // Keep legacy fields for now (derived from database config)
    supabaseUrl: resolvedDatabaseProvider === 'supabase' ? resolvedSupabaseUrl : '',
    supabaseKey: resolvedDatabaseProvider === 'supabase' ? resolvedSupabaseKey : '',

    // Init with Env/Local (for migration), but Memory wins below
    // We intentionally don't read API keys from LS here to prefer Memory/Env
    // But for migration, maybe we should check LS if Memory is empty?
    // No, user wants to Stop storing in LS.

    // Scrapbook AI model (falls back to global default model if not set)
    scrapbookProvider: overrides.scrapbookProvider || localScrapbookProvider || '',
    scrapbookModel: overrides.scrapbookModel || localScrapbookModel || '',
    scrapbookModelSource: overrides.scrapbookModelSource || localScrapbookModelSource || 'list',
    scrapbookBaseTone:
      overrides.scrapbookBaseTone ||
      localScrapbookBaseTone ||
      DEFAULT_SCRAPBOOK_STYLE_SETTINGS.scrapbookBaseTone,
    scrapbookTraits:
      overrides.scrapbookTraits ||
      localScrapbookTraits ||
      DEFAULT_SCRAPBOOK_STYLE_SETTINGS.scrapbookTraits,
    scrapbookWarmth:
      overrides.scrapbookWarmth ||
      localScrapbookWarmth ||
      DEFAULT_SCRAPBOOK_STYLE_SETTINGS.scrapbookWarmth,
    scrapbookEnthusiasm:
      overrides.scrapbookEnthusiasm ||
      localScrapbookEnthusiasm ||
      DEFAULT_SCRAPBOOK_STYLE_SETTINGS.scrapbookEnthusiasm,
    scrapbookHeadings:
      overrides.scrapbookHeadings ||
      localScrapbookHeadings ||
      DEFAULT_SCRAPBOOK_STYLE_SETTINGS.scrapbookHeadings,
    scrapbookEmojis:
      overrides.scrapbookEmojis ||
      localScrapbookEmojis ||
      DEFAULT_SCRAPBOOK_STYLE_SETTINGS.scrapbookEmojis,
    scrapbookCustomInstruction:
      overrides.scrapbookCustomInstruction ||
      localScrapbookCustomInstruction ||
      DEFAULT_SCRAPBOOK_STYLE_SETTINGS.scrapbookCustomInstruction,

    // Model configuration
    liteModel: overrides.liteModel || localLiteModel || '',
    defaultModel: overrides.defaultModel || localDefaultModel || '',
    liteModelProvider: overrides.liteModelProvider || localLiteModelProvider || '',
    defaultModelProvider: overrides.defaultModelProvider || localDefaultModelProvider || '',
    liteModelSource: overrides.liteModelSource || localLiteModelSource || 'list',
    defaultModelSource: overrides.defaultModelSource || localDefaultModelSource || 'list',

    // Backend API
    backendUrl:
      electronBackendUrl ||
      envBackendUrl ||
      localBackendUrl ||
      overrides.backendUrl ||
      DEFAULT_BACKEND_URL,

    // Search provider
    searchProvider: localSearchProvider || overrides.searchProvider || 'tavily',

    // Chat behavior
    systemPrompt: localSystemPrompt || overrides.systemPrompt || '',
    contextTurns: resolvedContextLimit,
    themeColor: localThemeColor || overrides.themeColor || 'violet',
    enableRelatedQuestions: resolvedRelatedQuestionsPreference,
    interfaceLanguage: localInterfaceLanguage || overrides.interfaceLanguage || 'en',
    followInterfaceLanguage:
      localFollowInterfaceLanguage !== null
        ? localFollowInterfaceLanguage === 'true'
        : overrides.followInterfaceLanguage !== undefined
          ? overrides.followInterfaceLanguage
          : false,
    llmAnswerLanguage: localLlmAnswerLanguage || overrides.llmAnswerLanguage || 'English',
    fontSize: localFontSize || overrides.fontSize || overrides.messageFontSize || 'medium',
    enableLongTermMemory: resolvedLongTermMemoryPreference,
    memoryRecallLimit: resolvedMemoryRecallLimit,
    embeddingProvider: localEmbeddingProvider || overrides.embeddingProvider || '',
    embeddingModel: localEmbeddingModel || overrides.embeddingModel || '',
    embeddingModelSource: localEmbeddingModelSource || overrides.embeddingModelSource || 'list',
    userSelfIntro: overrides.userSelfIntro || '',
    developerMode:
      localDeveloperMode !== null
        ? localDeveloperMode === 'true'
        : overrides.developerMode !== undefined
          ? overrides.developerMode
          : false,

    // Style
    baseTone: localStyleBaseTone || overrides.baseTone || DEFAULT_STYLE_SETTINGS.baseTone,
    traits: localStyleTraits || overrides.traits || DEFAULT_STYLE_SETTINGS.traits,
    warmth: localStyleWarmth || overrides.warmth || DEFAULT_STYLE_SETTINGS.warmth,
    enthusiasm: localStyleEnthusiasm || overrides.enthusiasm || DEFAULT_STYLE_SETTINGS.enthusiasm,
    headings: localStyleHeadings || overrides.headings || DEFAULT_STYLE_SETTINGS.headings,
    emojis: localStyleEmojis || overrides.emojis || DEFAULT_STYLE_SETTINGS.emojis,
    customInstruction:
      localStyleCustomInstruction ||
      overrides.customInstruction ||
      DEFAULT_STYLE_SETTINGS.customInstruction,
    dbAccessKey: overrides.dbAccessKey || envDbAccessKey || localDbAccessKey || '',

    ...overrides,
  }

  SESSION_SENSITIVE_KEYS.forEach(key => {
    if (
      !Object.prototype.hasOwnProperty.call(memorySettings, key) &&
      session?.getItem(key) !== null
    ) {
      memorySettings[key] = session.getItem(key)
    }
  })

  // Merge Memory Settings (API Keys from Supabase)
  // This overrides everything else for keys
  const mergedSettings = { ...settings, ...memorySettings }

  if (electronBackendUrl) {
    mergedSettings.backendUrl = electronBackendUrl
  } else if (envBackendUrl) {
    mergedSettings.backendUrl = envBackendUrl
  }

  // Fallback to Env if memory is empty
  if (!mergedSettings.OpenAICompatibilityKey)
    mergedSettings.OpenAICompatibilityKey = envOpenAIKey || ''
  if (!mergedSettings.OpenAICompatibilityUrl)
    mergedSettings.OpenAICompatibilityUrl = envOpenAIBaseUrl || ''
  if (!mergedSettings.SiliconFlowKey)
    mergedSettings.SiliconFlowKey = electronMode
      ? ''
      : getPublicEnv('PUBLIC_SILICONFLOW_API_KEY') || ''
  if (!mergedSettings.GlmKey)
    mergedSettings.GlmKey = electronMode ? '' : getPublicEnv('PUBLIC_GLM_API_KEY') || ''
  if (!mergedSettings.DeepSeekKey)
    mergedSettings.DeepSeekKey = electronMode ? '' : getPublicEnv('PUBLIC_DEEPSEEK_API_KEY') || ''
  if (!mergedSettings.VolcengineKey)
    mergedSettings.VolcengineKey = electronMode
      ? ''
      : getPublicEnv('PUBLIC_VOLCENGINE_API_KEY') || ''
  if (!mergedSettings.ModelScopeKey)
    mergedSettings.ModelScopeKey = electronMode
      ? ''
      : getPublicEnv('PUBLIC_MODELSCOPE_API_KEY') || ''
  if (!mergedSettings.KimiKey)
    mergedSettings.KimiKey = electronMode ? '' : getPublicEnv('PUBLIC_KIMI_API_KEY') || ''
  if (!mergedSettings.googleApiKey)
    mergedSettings.googleApiKey = electronMode ? '' : getPublicEnv('PUBLIC_GOOGLE_API_KEY') || ''
  if (!mergedSettings.tavilyApiKey)
    mergedSettings.tavilyApiKey = envTavilyApiKey || ''
  if (!mergedSettings.exaApiKey) mergedSettings.exaApiKey = envExaApiKey || ''
  if (!mergedSettings.serpapiApiKey)
    mergedSettings.serpapiApiKey = (electronMode ? '' : getPublicEnv('PUBLIC_SERPAPI_API_KEY')) || ''
  if (!mergedSettings.NvidiaKey) mergedSettings.NvidiaKey = ''
  if (!mergedSettings.MinimaxKey)
    mergedSettings.MinimaxKey = electronMode ? '' : getPublicEnv('PUBLIC_MINIMAX_API_KEY') || ''
  if (typeof mergedSettings.enableLongTermMemory === 'string') {
    mergedSettings.enableLongTermMemory = mergedSettings.enableLongTermMemory === 'true'
  }

  return {
    ...mergedSettings,
    responseStylePrompt: buildResponseStylePrompt(mergedSettings),
  }
}

export const getBackendUrl = (overrides = {}) => {
  const settings = loadSettings(overrides)
  const value = String(settings.backendUrl || '').trim()
  return value ? value.replace(/\/+$/, '') : DEFAULT_BACKEND_URL
}

/**
 * Save user settings
 * - Non-sensitive -> LocalStorage
 * - Sensitive -> Memory Only (and caller handles Remote Save)
 */
export const saveSettings = async settings => {
  // Update Memory Cache
  updateMemorySettings(settings)
  const session = getSessionStorage()
  if (isElectronRuntime()) {
    const runtimeUrl = getElectronBackendUrlFromBridge() || getElectronBackendUrlOverride()
    if (runtimeUrl) settings.backendUrl = runtimeUrl
  }

  SESSION_SENSITIVE_KEYS.forEach(key => {
    if (!session) return
    const value = settings[key]
    if (value === undefined) return
    if (String(value || '').trim()) {
      session.setItem(key, String(value))
    } else {
      session.removeItem(key)
    }
  })

  // Persist Non-Sensitive to LocalStorage
  if (settings.databaseProvider !== undefined) {
    localStorage.setItem('databaseProvider', settings.databaseProvider)
  }
  localStorage.removeItem('databaseProviderId')
  if (settings.databaseProviderLabel !== undefined) {
    localStorage.setItem('databaseProviderLabel', settings.databaseProviderLabel)
  }

  const supabaseConfig = settings?.databaseConfig?.supabase || {}
  const resolvedSupabaseUrl =
    settings.supabaseUrl ?? settings.databaseSupabaseUrl ?? supabaseConfig.url
  const resolvedSupabaseKey =
    settings.supabaseKey ?? settings.databaseSupabaseKey ?? supabaseConfig.key

  if (resolvedSupabaseUrl !== undefined) {
    localStorage.setItem('databaseSupabaseUrl', resolvedSupabaseUrl)
    localStorage.setItem('supabaseUrl', resolvedSupabaseUrl)
  }
  if (resolvedSupabaseKey !== undefined) {
    localStorage.setItem('databaseSupabaseKey', resolvedSupabaseKey)
    localStorage.setItem('supabaseKey', resolvedSupabaseKey)
  }
  if (settings.dbAccessKey !== undefined) {
    if (String(settings.dbAccessKey || '').trim()) {
      localStorage.setItem('dbAccessKey', String(settings.dbAccessKey))
    } else {
      localStorage.removeItem('dbAccessKey')
    }
  }

  // CLEANUP: Remove Sensitive Keys from LocalStorage (Security)
  const SENSITIVE_KEYS = [
    'OpenAICompatibilityKey',
    'OpenAICompatibilityUrl',
    'SiliconFlowKey',
    'GlmKey',
    'DeepSeekKey',
    'VolcengineKey',
    'ModelScopeKey',
    'KimiKey',
    'googleApiKey',
    'tavilyApiKey',
    'exaApiKey',
    'serpapiApiKey',
    'NvidiaKey',
    'MinimaxKey',
  ]
  SENSITIVE_KEYS.forEach(key => localStorage.removeItem(key))

  // ... (Save other non-sensitive preferences)
  if (settings.systemPrompt !== undefined) {
    localStorage.setItem('systemPrompt', settings.systemPrompt)
  }
  const resolvedContextTurns =
    settings.contextTurns !== undefined
      ? settings.contextTurns
      : settings.contextMessageLimit !== undefined
        ? settings.contextMessageLimit
        : undefined
  if (resolvedContextTurns !== undefined) {
    localStorage.setItem('contextTurns', String(resolvedContextTurns))
    // Migration cleanup: old key replaced by contextTurns.
    localStorage.removeItem('contextMessageLimit')
  }
  if (settings.themeColor !== undefined) {
    localStorage.setItem('themeColor', settings.themeColor)
  }
  if (settings.enableRelatedQuestions !== undefined) {
    localStorage.setItem('enableRelatedQuestions', String(!!settings.enableRelatedQuestions))
  }
  if (settings.interfaceLanguage !== undefined) {
    localStorage.setItem('interfaceLanguage', settings.interfaceLanguage)
  }
  if (settings.followInterfaceLanguage !== undefined) {
    localStorage.setItem('followInterfaceLanguage', String(!!settings.followInterfaceLanguage))
  }
  if (settings.searchProvider !== undefined) {
    localStorage.setItem('searchProvider', settings.searchProvider)
  }
  if (settings.backendUrl !== undefined) {
    localStorage.setItem('backendUrl', settings.backendUrl)
  }
  localStorage.removeItem('tavilyApiKey')
  localStorage.removeItem('exaApiKey')
  localStorage.removeItem('serpapiApiKey')
  if (settings.llmAnswerLanguage !== undefined) {
    localStorage.setItem('llmAnswerLanguage', settings.llmAnswerLanguage)
  }
  if (settings.baseTone !== undefined) {
    localStorage.setItem('styleBaseTone', settings.baseTone)
  }
  if (settings.traits !== undefined) {
    localStorage.setItem('styleTraits', settings.traits)
  }
  if (settings.warmth !== undefined) {
    localStorage.setItem('styleWarmth', settings.warmth)
  }
  if (settings.enthusiasm !== undefined) {
    localStorage.setItem('styleEnthusiasm', settings.enthusiasm)
  }
  if (settings.headings !== undefined) {
    localStorage.setItem('styleHeadings', settings.headings)
  }
  if (settings.emojis !== undefined) {
    localStorage.setItem('styleEmojis', settings.emojis)
  }
  if (settings.customInstruction !== undefined) {
    localStorage.setItem('styleCustomInstruction', settings.customInstruction)
  }
  if (settings.fontSize !== undefined) {
    localStorage.setItem('fontSize', settings.fontSize)
  }
  if (settings.enableLongTermMemory !== undefined) {
    localStorage.setItem('enableLongTermMemory', String(!!settings.enableLongTermMemory))
  }
  if (settings.memoryRecallLimit !== undefined) {
    localStorage.setItem('memoryRecallLimit', String(settings.memoryRecallLimit))
  }
  if (settings.embeddingProvider !== undefined) {
    localStorage.setItem('embeddingProvider', settings.embeddingProvider)
  }
  if (settings.embeddingModel !== undefined) {
    localStorage.setItem('embeddingModel', settings.embeddingModel)
  }
  if (settings.embeddingModelSource !== undefined) {
    localStorage.setItem('embeddingModelSource', settings.embeddingModelSource)
  }
  if (settings.scrapbookProvider !== undefined) {
    localStorage.setItem('scrapbookProvider', settings.scrapbookProvider)
  }
  if (settings.scrapbookModel !== undefined) {
    localStorage.setItem('scrapbookModel', settings.scrapbookModel)
  }
  if (settings.scrapbookModelSource !== undefined) {
    localStorage.setItem('scrapbookModelSource', settings.scrapbookModelSource)
  }
  if (settings.scrapbookBaseTone !== undefined) {
    localStorage.setItem('scrapbookBaseTone', settings.scrapbookBaseTone)
  }
  if (settings.scrapbookTraits !== undefined) {
    localStorage.setItem('scrapbookTraits', settings.scrapbookTraits)
  }
  if (settings.scrapbookWarmth !== undefined) {
    localStorage.setItem('scrapbookWarmth', settings.scrapbookWarmth)
  }
  if (settings.scrapbookEnthusiasm !== undefined) {
    localStorage.setItem('scrapbookEnthusiasm', settings.scrapbookEnthusiasm)
  }
  if (settings.scrapbookHeadings !== undefined) {
    localStorage.setItem('scrapbookHeadings', settings.scrapbookHeadings)
  }
  if (settings.scrapbookEmojis !== undefined) {
    localStorage.setItem('scrapbookEmojis', settings.scrapbookEmojis)
  }
  if (settings.scrapbookCustomInstruction !== undefined) {
    localStorage.setItem('scrapbookCustomInstruction', settings.scrapbookCustomInstruction)
  }
  if (settings.defaultModel !== undefined) {
    localStorage.setItem('defaultModel', settings.defaultModel)
  }
  if (settings.liteModel !== undefined) {
    localStorage.setItem('liteModel', settings.liteModel)
  }
  if (settings.defaultModelProvider !== undefined) {
    localStorage.setItem('defaultModelProvider', settings.defaultModelProvider)
  }
  if (settings.liteModelProvider !== undefined) {
    localStorage.setItem('liteModelProvider', settings.liteModelProvider)
  }
  if (settings.defaultModelSource !== undefined) {
    localStorage.setItem('defaultModelSource', settings.defaultModelSource)
  }
  if (settings.liteModelSource !== undefined) {
    localStorage.setItem('liteModelSource', settings.liteModelSource)
  }
  localStorage.removeItem('userSelfIntro')
  if (settings.developerMode !== undefined) {
    localStorage.setItem('developerMode', String(!!settings.developerMode))
  }
  window.dispatchEvent(new Event('settings-changed'))
  console.log('Settings saved')
}
