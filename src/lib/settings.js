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
  },
  traits: {
    default: '',
    concise: 'Be concise and avoid filler.',
    structured: 'Prefer structured answers with clear sections.',
    detailed: 'Provide thorough explanations with necessary detail.',
    actionable: 'Prioritize actionable steps and concrete recommendations.',
  },
  warmth: {
    default: '',
    gentle: 'Be gentle and considerate in phrasing.',
    empathetic: 'Show empathy and acknowledge user intent or concerns.',
    direct: 'Keep warmth minimal and focus on direct delivery.',
  },
  enthusiasm: {
    default: '',
    low: 'Keep enthusiasm low and neutral.',
    high: 'Use an upbeat, energetic tone.',
  },
  headings: {
    default: '',
    minimal: 'Use minimal formatting and avoid excessive headings.',
    structured: 'Use headings and lists to improve scanability.',
  },
  emojis: {
    default: '',
    none: 'Avoid using emojis.',
    light: 'Use emojis sparingly.',
    moderate: 'Use a moderate amount of emojis when fitting.',
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
  return `Response style:\n${rules.map(rule => `- ${rule}`).join('\n')}`
}

export const loadSettings = (overrides = {}) => {
  // Supabase Env Vars
  const envSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const envSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY

  // OpenAI Env Vars
  const envOpenAIKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY
  const envOpenAIBaseUrl = process.env.NEXT_PUBLIC_OPENAI_BASE_URL

  // LocalStorage
  const localSupabaseUrl = localStorage.getItem('supabaseUrl')
  const localSupabaseKey = localStorage.getItem('supabaseKey')
  const localOpenAIKey = localStorage.getItem('OpenAICompatibilityKey')
  const localOpenAIUrl = localStorage.getItem('OpenAICompatibilityUrl')
  const localSiliconFlowKey = localStorage.getItem('SiliconFlowKey')

  // Model configuration
  const localLiteModel = localStorage.getItem('liteModel')
  const localDefaultModel = localStorage.getItem('defaultModel')
  const localSystemPrompt = localStorage.getItem('systemPrompt')
  const localContextMessageLimit = localStorage.getItem('contextMessageLimit')
  const localThemeColor = localStorage.getItem('themeColor')
  const localEnableRelatedQuestions = localStorage.getItem('enableRelatedQuestions')
  const localInterfaceLanguage = localStorage.getItem('interfaceLanguage')
  const localLlmAnswerLanguage = localStorage.getItem('llmAnswerLanguage')
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

  const settings = {
    // Supabase
    supabaseUrl:
      envSupabaseUrl ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      localSupabaseUrl ||
      overrides.supabaseUrl ||
      '',
    supabaseKey:
      envSupabaseKey ||
      process.env.NEXT_PUBLIC_SUPABASE_KEY ||
      localSupabaseKey ||
      overrides.supabaseKey ||
      '',

    // OpenAI
    OpenAICompatibilityKey:
      envOpenAIKey ||
      process.env.NEXT_PUBLIC_OPENAI_API_KEY ||
      localOpenAIKey ||
      overrides.OpenAICompatibilityKey ||
      '',
    OpenAICompatibilityUrl:
      envOpenAIBaseUrl ||
      process.env.NEXT_PUBLIC_OPENAI_BASE_URL ||
      localOpenAIUrl ||
      overrides.OpenAICompatibilityUrl ||
      '',
    SiliconFlowKey:
      process.env.NEXT_PUBLIC_SILICONFLOW_API_KEY ||
      localSiliconFlowKey ||
      overrides.SiliconFlowKey ||
      '',

    // API Provider
    apiProvider: localStorage.getItem('apiProvider') || overrides.apiProvider || 'gemini',
    googleApiKey:
      process.env.NEXT_PUBLIC_GOOGLE_API_KEY ||
      localStorage.getItem('googleApiKey') ||
      overrides.googleApiKey ||
      '',

    // Model configuration
    liteModel: localLiteModel || overrides.liteModel || 'gemini-2.5-flash',
    defaultModel: localDefaultModel || overrides.defaultModel || 'gemini-2.5-flash',

    // Chat behavior
    systemPrompt: localSystemPrompt || overrides.systemPrompt || '',
    contextMessageLimit: resolvedContextLimit,
    themeColor: localThemeColor || overrides.themeColor || 'violet',
    enableRelatedQuestions: resolvedRelatedQuestionsPreference,
    interfaceLanguage: localInterfaceLanguage || overrides.interfaceLanguage || 'en',
    llmAnswerLanguage: localLlmAnswerLanguage || overrides.llmAnswerLanguage || 'English',
    baseTone:
      localStyleBaseTone || overrides.baseTone || DEFAULT_STYLE_SETTINGS.baseTone,
    traits: localStyleTraits || overrides.traits || DEFAULT_STYLE_SETTINGS.traits,
    warmth: localStyleWarmth || overrides.warmth || DEFAULT_STYLE_SETTINGS.warmth,
    enthusiasm:
      localStyleEnthusiasm || overrides.enthusiasm || DEFAULT_STYLE_SETTINGS.enthusiasm,
    headings: localStyleHeadings || overrides.headings || DEFAULT_STYLE_SETTINGS.headings,
    emojis: localStyleEmojis || overrides.emojis || DEFAULT_STYLE_SETTINGS.emojis,
    customInstruction:
      localStyleCustomInstruction ||
      overrides.customInstruction ||
      DEFAULT_STYLE_SETTINGS.customInstruction,

    ...overrides,
  }

  return {
    ...settings,
    responseStylePrompt: buildResponseStylePrompt(settings),
  }
}

/**
 * Save user settings to LocalStorage
 *
 * @param {Object} settings - The settings object.
 */
export const saveSettings = async settings => {
  if (settings.supabaseUrl !== undefined) {
    localStorage.setItem('supabaseUrl', settings.supabaseUrl)
  }
  if (settings.supabaseKey !== undefined) {
    localStorage.setItem('supabaseKey', settings.supabaseKey)
  }
  if (settings.OpenAICompatibilityKey !== undefined) {
    localStorage.setItem('OpenAICompatibilityKey', settings.OpenAICompatibilityKey)
  }
  if (settings.OpenAICompatibilityUrl !== undefined) {
    localStorage.setItem('OpenAICompatibilityUrl', settings.OpenAICompatibilityUrl)
  }
  if (settings.SiliconFlowKey !== undefined) {
    localStorage.setItem('SiliconFlowKey', settings.SiliconFlowKey)
  }
  if (settings.apiProvider !== undefined) {
    localStorage.setItem('apiProvider', settings.apiProvider)
  }
  if (settings.googleApiKey !== undefined) {
    localStorage.setItem('googleApiKey', settings.googleApiKey)
  }
  // Save model configuration
  if (settings.liteModel !== undefined) {
    localStorage.setItem('liteModel', settings.liteModel)
  }
  if (settings.defaultModel !== undefined) {
    localStorage.setItem('defaultModel', settings.defaultModel)
  }
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

  window.dispatchEvent(new Event('settings-changed'))
  console.log('Settings saved:', settings)
}
