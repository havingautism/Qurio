import { getPublicEnv } from './publicEnv'

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

export const updateMemorySettings = settings => {
  Object.assign(memorySettings, settings)
}

export const loadSettings = (overrides = {}) => {
  // Supabase Env Vars
  const envSupabaseUrl = getPublicEnv('PUBLIC_SUPABASE_URL')
  const envSupabaseKey = getPublicEnv('PUBLIC_SUPABASE_KEY')
  const envBackendUrl = getPublicEnv('PUBLIC_BACKEND_URL')

  // OpenAI Env Vars
  const envOpenAIKey = getPublicEnv('PUBLIC_OPENAI_API_KEY')
  const envOpenAIBaseUrl = getPublicEnv('PUBLIC_OPENAI_BASE_URL')
  const envTavilyApiKey = getPublicEnv('PUBLIC_TAVILY_API_KEY')

  // LocalStorage - Only load non-sensitive or essential connection configs
  const localSupabaseUrl = localStorage.getItem('supabaseUrl')
  const localSupabaseKey = localStorage.getItem('supabaseKey')
  const localSearchProvider = localStorage.getItem('searchProvider')
  const localBackendUrl = localStorage.getItem('backendUrl')

  // Model configuration
  const localSystemPrompt = localStorage.getItem('systemPrompt')
  const localContextMessageLimit = localStorage.getItem('contextMessageLimit')
  const localThemeColor = localStorage.getItem('themeColor')
  const localEnableRelatedQuestions = localStorage.getItem('enableRelatedQuestions')
  const localInterfaceLanguage = localStorage.getItem('interfaceLanguage')
  const localLlmAnswerLanguage = localStorage.getItem('llmAnswerLanguage')
  const localFontSize = localStorage.getItem('fontSize')
  const localEnableLongTermMemory = localStorage.getItem('enableLongTermMemory')
  const localMemoryRecallLimit = localStorage.getItem('memoryRecallLimit')
  const localEmbeddingProvider = localStorage.getItem('embeddingProvider')
  const localEmbeddingModel = localStorage.getItem('embeddingModel')
  const localEmbeddingModelSource = localStorage.getItem('embeddingModelSource')
  const localUserSelfIntro = localStorage.getItem('userSelfIntro')
  const localDeveloperMode = localStorage.getItem('developerMode')

  // Style settings
  const localStyleBaseTone = localStorage.getItem('styleBaseTone')
  const localStyleTraits = localStorage.getItem('styleTraits')
  const localStyleWarmth = localStorage.getItem('styleWarmth')
  const localStyleEnthusiasm = localStorage.getItem('styleEnthusiasm')
  const localStyleHeadings = localStorage.getItem('styleHeadings')
  const localStyleEmojis = localStorage.getItem('styleEmojis')
  const localStyleCustomInstruction = localStorage.getItem('styleCustomInstruction')

  const parsedContextLimit = parseInt(localContextMessageLimit, 10)
  const resolvedContextLimit = Number.isFinite(parsedContextLimit)
    ? parsedContextLimit
    : overrides.contextMessageLimit || 12
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

  const settings = {
    // Supabase (Must be local/env to connect)
    supabaseUrl: envSupabaseUrl || localSupabaseUrl || overrides.supabaseUrl || '',
    supabaseKey: envSupabaseKey || localSupabaseKey || overrides.supabaseKey || '',

    // Init with Env/Local (for migration), but Memory wins below
    // We intentionally don't read API keys from LS here to prefer Memory/Env
    // But for migration, maybe we should check LS if Memory is empty?
    // No, user wants to Stop storing in LS.

    // Model configuration
    liteModel: overrides.liteModel || '',
    defaultModel: overrides.defaultModel || '',

    // Backend API
    backendUrl: envBackendUrl || localBackendUrl || overrides.backendUrl || 'http://localhost:3001',

    // Search provider
    searchProvider: localSearchProvider || overrides.searchProvider || 'tavily',

    // Chat behavior
    systemPrompt: localSystemPrompt || overrides.systemPrompt || '',
    contextMessageLimit: resolvedContextLimit,
    themeColor: localThemeColor || overrides.themeColor || 'violet',
    enableRelatedQuestions: resolvedRelatedQuestionsPreference,
    interfaceLanguage: localInterfaceLanguage || overrides.interfaceLanguage || 'en',
    llmAnswerLanguage: localLlmAnswerLanguage || overrides.llmAnswerLanguage || 'English',
    fontSize: localFontSize || overrides.fontSize || 'medium',
    enableLongTermMemory: resolvedLongTermMemoryPreference,
    memoryRecallLimit: resolvedMemoryRecallLimit,
    embeddingProvider: localEmbeddingProvider || overrides.embeddingProvider || '',
    embeddingModel: localEmbeddingModel || overrides.embeddingModel || '',
    embeddingModelSource: localEmbeddingModelSource || overrides.embeddingModelSource || 'list',
    userSelfIntro: localUserSelfIntro || overrides.userSelfIntro || '',
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

    ...overrides,
  }

  // Merge Memory Settings (API Keys from Supabase)
  // This overrides everything else for keys
  const mergedSettings = { ...settings, ...memorySettings }

  if (envBackendUrl) {
    mergedSettings.backendUrl = envBackendUrl
  }

  // Fallback to Env if memory is empty
  if (!mergedSettings.OpenAICompatibilityKey)
    mergedSettings.OpenAICompatibilityKey = envOpenAIKey || ''
  if (!mergedSettings.OpenAICompatibilityUrl)
    mergedSettings.OpenAICompatibilityUrl = envOpenAIBaseUrl || ''
  if (!mergedSettings.SiliconFlowKey)
    mergedSettings.SiliconFlowKey = getPublicEnv('PUBLIC_SILICONFLOW_API_KEY') || ''
  if (!mergedSettings.GlmKey) mergedSettings.GlmKey = getPublicEnv('PUBLIC_GLM_API_KEY') || ''
  if (!mergedSettings.ModelScopeKey)
    mergedSettings.ModelScopeKey = getPublicEnv('PUBLIC_MODELSCOPE_API_KEY') || ''
  if (!mergedSettings.KimiKey) mergedSettings.KimiKey = getPublicEnv('PUBLIC_KIMI_API_KEY') || ''
  if (!mergedSettings.googleApiKey)
    mergedSettings.googleApiKey = getPublicEnv('PUBLIC_GOOGLE_API_KEY') || ''
  if (!mergedSettings.tavilyApiKey) mergedSettings.tavilyApiKey = envTavilyApiKey || ''
  if (!mergedSettings.NvidiaKey) mergedSettings.NvidiaKey = ''

  return {
    ...mergedSettings,
    responseStylePrompt: buildResponseStylePrompt(mergedSettings),
  }
}

/**
 * Save user settings
 * - Non-sensitive -> LocalStorage
 * - Sensitive -> Memory Only (and caller handles Remote Save)
 */
export const saveSettings = async settings => {
  // Update Memory Cache
  updateMemorySettings(settings)

  // Persist Non-Sensitive to LocalStorage
  if (settings.supabaseUrl !== undefined) localStorage.setItem('supabaseUrl', settings.supabaseUrl)
  if (settings.supabaseKey !== undefined) localStorage.setItem('supabaseKey', settings.supabaseKey)

  // CLEANUP: Remove Sensitive Keys from LocalStorage (Security)
  const SENSITIVE_KEYS = [
    'OpenAICompatibilityKey',
    'OpenAICompatibilityUrl',
    'SiliconFlowKey',
    'GlmKey',
    'ModelScopeKey',
    'KimiKey',
    'googleApiKey',
    'tavilyApiKey',
    'NvidiaKey',
  ]
  SENSITIVE_KEYS.forEach(key => localStorage.removeItem(key))

  // ... (Save other non-sensitive preferences)
  if (settings.systemPrompt !== undefined) {
    localStorage.setItem('systemPrompt', settings.systemPrompt)
  }
  if (settings.contextMessageLimit !== undefined) {
    localStorage.setItem('contextMessageLimit', String(settings.contextMessageLimit))
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
  if (settings.searchProvider !== undefined) {
    localStorage.setItem('searchProvider', settings.searchProvider)
  }
  if (settings.backendUrl !== undefined) {
    localStorage.setItem('backendUrl', settings.backendUrl)
  }
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
  if (settings.userSelfIntro !== undefined) {
    localStorage.setItem('userSelfIntro', settings.userSelfIntro)
  }
  if (settings.developerMode !== undefined) {
    localStorage.setItem('developerMode', String(!!settings.developerMode))
  }

  window.dispatchEvent(new Event('settings-changed'))
  console.log('Settings saved (Sensitive keys in memory only)')
}
