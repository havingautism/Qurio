import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Info, Check, ChevronDown, RefreshCw } from 'lucide-react'
import useScrollLock from '../hooks/useScrollLock'
import EmojiDisplay from './EmojiDisplay'
import CustomEmojiPicker from './CustomEmojiPicker'
import clsx from 'clsx'
import { getModelsForProvider } from '../lib/models_api'
import { loadSettings } from '../lib/settings'
import { SILICONFLOW_BASE_URL } from '../lib/providerConstants'
import { getModelIcon, renderProviderIcon } from '../lib/modelIcons'
import { getPublicEnv } from '../lib/publicEnv'

// Logic reused from SettingsModal
const FALLBACK_MODEL_OPTIONS = {
  gemini: [
    { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash Exp' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { value: 'gemini-1.5-flash-8b', label: 'Gemini 1.5 Flash 8B' },
  ],
  openai_compatibility: [
    { value: 'gpt-4o', label: 'gpt-4o' },
    { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
  ],
  siliconflow: [
    { value: 'deepseek-ai/DeepSeek-V2.5', label: 'DeepSeek V2.5' },
    { value: 'deepseek-ai/DeepSeek-Coder-V2', label: 'DeepSeek Coder V2' },
  ],
  glm: [
    { value: 'glm-4', label: 'GLM-4' },
    { value: 'glm-4-flash', label: 'GLM-4 Flash' },
  ],
  kimi: [
    { value: 'moonshot-v1-8k', label: 'Moonshot V1 8K' },
    { value: 'moonshot-v1-32k', label: 'Moonshot V1 32K' },
  ],
  __fallback__: [],
}

const PROVIDER_KEYS = ['gemini', 'openai_compatibility', 'siliconflow', 'glm', 'kimi']
const MODEL_SEPARATOR = '::'

const parseStoredModel = value => {
  if (!value) return { provider: '', modelId: '' }
  const index = value.indexOf(MODEL_SEPARATOR)
  if (index === -1) return { provider: '', modelId: value }
  return {
    provider: value.slice(0, index),
    modelId: value.slice(index + MODEL_SEPARATOR.length),
  }
}

const encodeModelId = (providerKey, modelId) => {
  if (!modelId) return ''
  if (!providerKey) return modelId
  return `${providerKey}${MODEL_SEPARATOR}${modelId}`
}

// Personalization Constants
const LLM_ANSWER_LANGUAGE_KEYS = [
  'English',
  'Chinese (Simplified)',
  'Chinese (Traditional)',
  'Japanese',
  'Korean',
  'Spanish',
  'French',
  'German',
  'Portuguese',
  'Italian',
]

const STYLE_BASE_TONE_KEYS = ['technical', 'friendly', 'professional', 'academic', 'creative']
const STYLE_TRAIT_KEYS = ['default', 'concise', 'structured', 'detailed', 'actionable']
const STYLE_WARMTH_KEYS = ['default', 'gentle', 'empathetic', 'direct']
const STYLE_ENTHUSIASM_KEYS = ['default', 'low', 'high']
const STYLE_HEADINGS_KEYS = ['default', 'minimal', 'structured']
const STYLE_EMOJI_KEYS = ['default', 'none', 'light', 'moderate']

const ENV_VARS = {
  supabaseUrl: getPublicEnv('PUBLIC_SUPABASE_URL'),
  supabaseKey: getPublicEnv('PUBLIC_SUPABASE_KEY'),
  openAIKey: getPublicEnv('PUBLIC_OPENAI_API_KEY'),
  openAIBaseUrl: getPublicEnv('PUBLIC_OPENAI_BASE_URL'),
  googleApiKey: getPublicEnv('PUBLIC_GOOGLE_API_KEY'),
  siliconFlowKey: getPublicEnv('PUBLIC_SILICONFLOW_API_KEY'),
  glmKey: getPublicEnv('PUBLIC_GLM_API_KEY'),
  kimiKey: getPublicEnv('PUBLIC_KIMI_API_KEY'),
}

const AgentModal = ({ isOpen, onClose, editingAgent = null, onSave, onDelete }) => {
  const { t } = useTranslation()
  useScrollLock(isOpen)

  const [activeTab, setActiveTab] = useState('general')

  // General Tab
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [prompt, setPrompt] = useState('')
  const [emoji, setEmoji] = useState('🤖')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  // Model Tab
  // Note: 'provider' is now derived from the selected defaultModel or explicitly stored if needed
  // For UI simplicity, we store the provider that accounts for the "Default Model"
  const [provider, setProvider] = useState('gemini')
  const [liteModel, setLiteModel] = useState('')
  const [defaultModel, setDefaultModel] = useState('')
  const [availableProviders, setAvailableProviders] = useState([])
  const [defaultModelProvider, setDefaultModelProvider] = useState('')
  const [liteModelProvider, setLiteModelProvider] = useState('')
  const [modelsError, setModelsError] = useState('')

  // Dynamic Models State
  // Structure: { [provider]: [ { value, label } ] }
  const [groupedModels, setGroupedModels] = useState({})
  const [isLoadingModels, setIsLoadingModels] = useState(false)

  // Personalization Tab
  const [responseLanguage, setResponseLanguage] = useState('English')
  const [baseTone, setBaseTone] = useState('technical')
  const [traits, setTraits] = useState('default')
  const [warmth, setWarmth] = useState('default')
  const [enthusiasm, setEnthusiasm] = useState('default')
  const [headings, setHeadings] = useState('default')
  const [emojis, setEmojis] = useState('default')
  const [customInstruction, setCustomInstruction] = useState('')

  // Dropdown states
  const [isResponseLanguageOpen, setIsResponseLanguageOpen] = useState(false)
  const [isBaseToneOpen, setIsBaseToneOpen] = useState(false)
  const [isTraitsOpen, setIsTraitsOpen] = useState(false)
  const [isWarmthOpen, setIsWarmthOpen] = useState(false)
  const [isEnthusiasmOpen, setIsEnthusiasmOpen] = useState(false)
  const [isHeadingsOpen, setIsHeadingsOpen] = useState(false)
  const [isEmojisOpen, setIsEmojisOpen] = useState(false)

  // Refs for click outside
  const pickerRef = useRef(null)
  const buttonRef = useRef(null)
  const responseLanguageRef = useRef(null)
  const baseToneRef = useRef(null)
  const traitsRef = useRef(null)
  const warmthRef = useRef(null)
  const enthusiasmRef = useRef(null)
  const headingsRef = useRef(null)
  const emojisRef = useRef(null)

  // State for error and saving
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const loadKeysAndFetchModels = async () => {
    setIsLoadingModels(true)
    setModelsError('')
    const settings = loadSettings()
    const keys = {
      gemini: settings.googleApiKey,
      openai_compatibility: settings.OpenAICompatibilityKey,
      siliconflow: settings.SiliconFlowKey,
      glm: settings.GlmKey,
      kimi: settings.KimiKey,
      // URLs for providers that need it
      openai_compatibility_url: settings.OpenAICompatibilityUrl,
    }

    const enabledProviders = []
    const promises = PROVIDER_KEYS.map(async key => {
      let credentials = {}
      if (key === 'gemini') credentials = { apiKey: keys.gemini }
      else if (key === 'siliconflow')
        credentials = { apiKey: keys.siliconflow, baseUrl: SILICONFLOW_BASE_URL }
      else if (key === 'glm') credentials = { apiKey: keys.glm }
      else if (key === 'kimi') credentials = { apiKey: keys.kimi }
      else if (key === 'openai_compatibility')
        credentials = { apiKey: keys.openai_compatibility, baseUrl: keys.openai_compatibility_url }

      // Check for API key or env var
      const hasApiKey =
        credentials.apiKey ||
        ENV_VARS[`${key}Key`] ||
        ENV_VARS[`${key}ApiKey`] ||
        (key === 'gemini' && ENV_VARS.googleApiKey) ||
        (key === 'openai_compatibility' && ENV_VARS.openAIKey)

      if (!hasApiKey && !credentials.apiKey) {
        return null
      }

      try {
        const models = await getModelsForProvider(key, credentials)
        enabledProviders.push(key)
        return { key, models: models?.length ? models : FALLBACK_MODEL_OPTIONS[key] || [] }
      } catch (err) {
        console.error(`Failed to fetch models for ${key}`, err)
        enabledProviders.push(key)
        return { key, models: FALLBACK_MODEL_OPTIONS[key] || [] }
      }
    })

    const results = (await Promise.all(promises)).filter(Boolean)
    const newGroupedModels = {}
    results.forEach(({ key, models }) => {
      if (models && models.length > 0) {
        newGroupedModels[key] = models
      }
    })
    const uniqueProviders = Array.from(new Set(enabledProviders))
    setAvailableProviders(uniqueProviders)
    setGroupedModels(newGroupedModels)
    setIsLoadingModels(false)
    if (uniqueProviders.length === 0) {
      setModelsError(t('agents.model.noProviders'))
    }
  }

  useEffect(() => {
    if (isOpen) {
      const settings = loadSettings()
      if (editingAgent) {
        const parsedDefaultModel = parseStoredModel(editingAgent.defaultModel)
        const parsedLiteModel = parseStoredModel(editingAgent.liteModel)
        setName(editingAgent.name)
        setDescription(editingAgent.description)
        setPrompt(editingAgent.prompt)
        setEmoji(editingAgent.emoji)
        setProvider(
          editingAgent.provider ||
            parsedDefaultModel.provider ||
            parsedLiteModel.provider ||
            'gemini',
        )
        setLiteModel(parsedLiteModel.modelId || '')
        setDefaultModel(parsedDefaultModel.modelId || '')
        setDefaultModelProvider(parsedDefaultModel.provider || '')
        setLiteModelProvider(parsedLiteModel.provider || '')
        setResponseLanguage(
          editingAgent.responseLanguage || settings.llmAnswerLanguage || 'English',
        )
        setBaseTone(editingAgent.baseTone || settings.baseTone || 'technical')
        setTraits(editingAgent.traits || settings.traits || 'default')
        setWarmth(editingAgent.warmth || settings.warmth || 'default')
        setEnthusiasm(editingAgent.enthusiasm || settings.enthusiasm || 'default')
        setHeadings(editingAgent.headings || settings.headings || 'default')
        setEmojis(editingAgent.emojis || settings.emojis || 'default')
        setCustomInstruction(editingAgent.customInstruction || '')
      } else {
        // Reset defaults
        setName('')
        setDescription('')
        setPrompt(settings.systemPrompt || t('agents.defaults.systemPrompt'))
        setEmoji('??')
        setProvider(settings.apiProvider || 'gemini')
        setLiteModel(parseStoredModel(settings.liteModel).modelId || '')
        setDefaultModel(parseStoredModel(settings.defaultModel).modelId || '')
        setResponseLanguage(settings.llmAnswerLanguage || 'English')
        setBaseTone(settings.baseTone || 'technical')
        setTraits(settings.traits || 'default')
        setWarmth(settings.warmth || 'default')
        setEnthusiasm(settings.enthusiasm || 'default')
        setHeadings(settings.headings || 'default')
        setEmojis(settings.emojis || 'default')
        setCustomInstruction(settings.customInstruction || '')
      }
      setActiveTab('general')
      setError('')
      setIsSaving(false)

      // Load API keys and fetch models
      loadKeysAndFetchModels()
    }
  }, [isOpen, editingAgent, t])

  const handleSaveWrapper = async () => {
    if (!name.trim()) {
      setError(t('agents.validation.nameRequired'))
      return
    }

    setIsSaving(true)
    try {
      const resolveProvider = (modelId, fallback) => {
        if (!modelId) return fallback || ''
        const derived = findProviderForModel(modelId)
        return derived || fallback || ''
      }

      const resolvedDefaultProvider = resolveProvider(
        defaultModel,
        defaultModelProvider || provider,
      )
      const resolvedLiteProvider = resolveProvider(liteModel, liteModelProvider || provider)
      const derivedProvider = resolvedDefaultProvider || provider

      await onSave?.({
        id: editingAgent?.id,
        name: name.trim(),
        description: description.trim(),
        prompt: prompt.trim(),
        emoji,
        provider: derivedProvider,
        liteModel: encodeModelId(resolvedLiteProvider, liteModel),
        defaultModel: encodeModelId(resolvedDefaultProvider, defaultModel),
        responseLanguage,
        baseTone,
        traits,
        warmth,
        enthusiasm,
        headings,
        emojis,
        customInstruction: customInstruction.trim(),
      })
      onClose()
    } catch (err) {
      console.error('Failed to save agent agent:', err)
      setError(t('agents.errors.saveFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  // Click outside handler for dropdowns
  useEffect(() => {
    const handleClickOutside = event => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setShowEmojiPicker(false)
      }
      if (responseLanguageRef.current && !responseLanguageRef.current.contains(event.target))
        setIsResponseLanguageOpen(false)
      if (baseToneRef.current && !baseToneRef.current.contains(event.target))
        setIsBaseToneOpen(false)
      if (traitsRef.current && !traitsRef.current.contains(event.target)) setIsTraitsOpen(false)
      if (warmthRef.current && !warmthRef.current.contains(event.target)) setIsWarmthOpen(false)
      if (enthusiasmRef.current && !enthusiasmRef.current.contains(event.target))
        setIsEnthusiasmOpen(false)
      if (headingsRef.current && !headingsRef.current.contains(event.target))
        setIsHeadingsOpen(false)
      if (emojisRef.current && !emojisRef.current.contains(event.target)) setIsEmojisOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [
    showEmojiPicker,
    isResponseLanguageOpen,
    isBaseToneOpen,
    isTraitsOpen,
    isWarmthOpen,
    isEnthusiasmOpen,
    isHeadingsOpen,
    isEmojisOpen,
  ])

  const renderDropdown = (
    label,
    value,
    onChange,
    options,
    isOpen,
    setIsOpen,
    ref,
    isGrouped = false,
  ) => (
    <div className="flex flex-col gap-2 relative" ref={ref}>
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {isGrouped && getModelIcon(value) && (
            <img src={getModelIcon(value)} alt="" className="w-4 h-4 shrink-0" />
          )}
          <span className="truncate">
            {isGrouped
              ? Object.values(groupedModels)
                  .flat()
                  .find(m => m.value === value)?.label ||
                value ||
                t('agents.model.notSelected')
              : options.find(o => (o.value || o) === value)?.label ||
                options.find(o => (o.value || o) === value) ||
                value}
          </span>
        </div>
        <ChevronDown
          size={16}
          className={clsx('text-gray-400 transition-transform shrink-0', isOpen && 'rotate-180')}
        />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
          {isGrouped
            ? // Grouped Model Rendering
              Object.entries(groupedModels).map(([groupProvider, models]) => (
                <div key={groupProvider}>
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 dark:bg-zinc-800 uppercase tracking-wider flex items-center gap-2">
                    {renderProviderIcon(groupProvider, { size: 12, className: 'shrink-0' })}
                    {t(`settings.providers.${groupProvider}`)}
                  </div>
                  {models.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        onChange(opt.value)
                        setIsOpen(false)
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 truncate">
                        {getModelIcon(opt.value) && (
                          <img src={getModelIcon(opt.value)} alt="" className="w-4 h-4 shrink-0" />
                        )}
                        <span className="truncate">{opt.label}</span>
                      </div>
                      {value === opt.value && (
                        <Check size={14} className="text-primary-500 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              ))
            : // Flat Option Rendering
              options.map(opt => {
                const optValue = opt.value || opt
                const optLabel = opt.label || opt
                return (
                  <button
                    key={optValue}
                    onClick={() => {
                      onChange(optValue)
                      setIsOpen(false)
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 flex items-center justify-between"
                  >
                    <span className="truncate">{optLabel}</span>
                    {value === optValue && (
                      <Check size={14} className="text-primary-500 shrink-0" />
                    )}
                  </button>
                )
              })}
        </div>
      )}
    </div>
  )

  const totalModelCount = useMemo(
    () => Object.values(groupedModels).reduce((sum, models) => sum + models.length, 0),
    [groupedModels],
  )

  const findProviderForModel = modelId => {
    if (!modelId) return ''
    for (const [pKey, models] of Object.entries(groupedModels)) {
      if (models.some(m => m.value === modelId)) return pKey
    }
    return ''
  }

  const getModelLabel = modelId => {
    if (!modelId) return t('agents.model.notSelected')
    const match = Object.values(groupedModels)
      .flat()
      .find(m => m.value === modelId)
    if (match) return match.label
    return t('agents.model.notFound')
  }

  useEffect(() => {
    if (!isOpen) return
    const resolvedDefaultProvider = findProviderForModel(defaultModel)
    const resolvedLiteProvider = findProviderForModel(liteModel)

    // Only auto-resolve provider if not already set or if model changed
    // This prevents overwriting user's manual provider selection
    if (resolvedDefaultProvider && !defaultModelProvider) {
      setDefaultModelProvider(resolvedDefaultProvider)
    } else if (!defaultModelProvider && availableProviders.length > 0) {
      setDefaultModelProvider(availableProviders[0])
    }
    if (resolvedLiteProvider && !liteModelProvider) {
      setLiteModelProvider(resolvedLiteProvider)
    } else if (!liteModelProvider && availableProviders.length > 0) {
      setLiteModelProvider(availableProviders[0])
    }
  }, [
    availableProviders,
    defaultModel,
    groupedModels,
    isOpen,
    liteModel,
  ])

  const renderModelPicker = ({
    label,
    helper,
    value,
    onChange,
    activeProvider,
    onProviderChange,
    allowEmpty = false,
  }) => {
    const providers = availableProviders.length > 0 ? availableProviders : PROVIDER_KEYS
    const activeModels = groupedModels[activeProvider] || []
    const selectedLabel = getModelLabel(value)

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{selectedLabel}</span>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3">
          <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {t('agents.model.providers')}
              </span>
              <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible">
                {providers.map(key => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onProviderChange(key)}
                    className={clsx(
                      'flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors whitespace-nowrap',
                      activeProvider === key
                        ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                        : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700',
                    )}
                  >
                    {renderProviderIcon(key, { size: 14, className: 'shrink-0' })}
                    <span>{t(`settings.providers.${key}`)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {t('agents.model.models')}
              </span>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-zinc-700">
                {allowEmpty && (
                  <button
                    type="button"
                    onClick={() => onChange('')}
                    className={clsx(
                      'w-full text-left px-4 py-2 text-sm flex items-center justify-between',
                      value === ''
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-200'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-zinc-800',
                    )}
                  >
                    <span>{t('agents.model.none')}</span>
                    {value === '' && <Check size={14} className="text-primary-500 shrink-0" />}
                  </button>
                )}
                {activeModels.length > 0 ? (
                  activeModels.map(model => (
                    <button
                      key={model.value}
                      type="button"
                      onClick={() => onChange(model.value)}
                      className={clsx(
                        'w-full text-left px-4 py-2 text-sm flex items-center justify-between gap-2',
                        value === model.value
                          ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-200'
                          : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-zinc-800',
                      )}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {getModelIcon(model.value) && (
                          <img src={getModelIcon(model.value)} alt="" className="w-4 h-4" />
                        )}
                        <span className="truncate">{model.label}</span>
                      </div>
                      {value === model.value && (
                        <Check size={14} className="text-primary-500 shrink-0" />
                      )}
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {t('agents.model.noModels')}
                  </div>
                )}
              </div>
            </div>
          </div>
          {helper && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{helper}</p>}
        </div>
      </div>
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-100 flex items-start md:items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4 overflow-y-auto md:overflow-hidden">
      <div className="w-full h-screen md:max-w-2xl md:h-[85vh] bg-white dark:bg-[#191a1a] rounded-none md:rounded-2xl shadow-2xl flex flex-col overflow-hidden border-0 md:border border-gray-200 dark:border-zinc-800">
        {/* Header */}
        <div className="h-14 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between px-4 sm:px-6 shrink-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {editingAgent ? t('agents.modal.edit') : t('agents.modal.create')}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-zinc-800 px-6 shrink-0 gap-6">
          {['general', 'model', 'personalization'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={clsx(
                'py-3 text-sm font-medium border-b-2 transition-colors capitalize',
                activeTab === tab
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
              )}
            >
              {t(`agents.tabs.${tab}`)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('agents.general.avatar')}
                </label>
                <div className="relative inline-block w-fit">
                  <button
                    ref={buttonRef}
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-zinc-800 flex items-center justify-center text-3xl hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors border border-gray-200 dark:border-zinc-700"
                  >
                    <EmojiDisplay emoji={emoji} />
                  </button>
                  {showEmojiPicker && (
                    <div
                      ref={pickerRef}
                      className="absolute top-full left-0 mt-2 z-50 rounded-xl overflow-hidden shadow-2xl"
                    >
                      <CustomEmojiPicker
                        onEmojiSelect={e => {
                          setEmoji(e?.native || e)
                          setShowEmojiPicker(false)
                        }}
                        onClose={() => setShowEmojiPicker(false)}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('agents.general.name')}
                </label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t('agents.general.namePlaceholder')}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('agents.general.description')}
                </label>
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder={t('agents.general.descriptionPlaceholder')}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('agents.general.systemPrompt')}
                </label>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder={t('agents.general.systemPromptPlaceholder')}
                  rows={6}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-none font-mono text-sm"
                />
              </div>
            </div>
          )}

          {activeTab === 'model' && (
            <div className="space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-lg flex gap-3 text-sm text-blue-700 dark:text-blue-300">
                <Info size={18} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">{t('agents.model.crossProviderTitle')}</p>
                  <p className="opacity-90">{t('agents.model.crossProviderHint')}</p>
                </div>
              </div>

              {isLoadingModels ? (
                <div className="flex items-center justify-center py-8 text-gray-500 gap-2">
                  <RefreshCw className="animate-spin" size={20} />
                  <span>{t('agents.model.loading')}</span>
                </div>
              ) : availableProviders.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 dark:border-zinc-700 p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  <p className="font-medium text-gray-700 dark:text-gray-300">
                    {t('agents.model.noProvidersTitle')}
                  </p>
                  <p className="mt-1">{t('agents.model.noProvidersHint')}</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>{t('agents.model.modelsLoaded', { count: totalModelCount })}</span>
                    <button
                      type="button"
                      onClick={loadKeysAndFetchModels}
                      className="flex items-center gap-1 text-primary-600 hover:text-primary-700 dark:text-primary-400"
                    >
                      <RefreshCw size={14} />
                      {t('agents.model.refresh')}
                    </button>
                  </div>

                  {renderModelPicker({
                    label: t('agents.model.defaultModel'),
                    helper: t('agents.model.defaultHelper'),
                    value: defaultModel,
                    onChange: setDefaultModel,
                    activeProvider: defaultModelProvider || provider,
                    onProviderChange: setDefaultModelProvider,
                  })}

                  {renderModelPicker({
                    label: t('agents.model.liteModel'),
                    helper: t('agents.model.liteHelper'),
                    value: liteModel,
                    onChange: setLiteModel,
                    activeProvider: liteModelProvider || provider,
                    onProviderChange: setLiteModelProvider,
                    allowEmpty: true,
                  })}
                </>
              )}
              {(error || modelsError) && (
                <div className="text-sm text-red-500 mt-4">{error || modelsError}</div>
              )}
            </div>
          )}

          {activeTab === 'personalization' && (
            <div className="space-y-6">
              {renderDropdown(
                t('settings.responseStyle'),
                responseLanguage,
                setResponseLanguage,
                LLM_ANSWER_LANGUAGE_KEYS,
                isResponseLanguageOpen,
                setIsResponseLanguageOpen,
                responseLanguageRef,
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderDropdown(
                  t('settings.styleBaseTone'),
                  baseTone,
                  setBaseTone,
                  STYLE_BASE_TONE_KEYS.map(k => ({
                    value: k,
                    label: t(`settings.baseToneOptions.${k}`),
                  })),
                  isBaseToneOpen,
                  setIsBaseToneOpen,
                  baseToneRef,
                )}
                {renderDropdown(
                  t('settings.traits'),
                  traits,
                  setTraits,
                  STYLE_TRAIT_KEYS.map(k => ({
                    value: k,
                    label: t(`settings.traitsOptions.${k}`),
                  })),
                  isTraitsOpen,
                  setIsTraitsOpen,
                  traitsRef,
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderDropdown(
                  t('settings.warmth'),
                  warmth,
                  setWarmth,
                  STYLE_WARMTH_KEYS.map(k => ({
                    value: k,
                    label: t(`settings.warmthOptions.${k}`),
                  })),
                  isWarmthOpen,
                  setIsWarmthOpen,
                  warmthRef,
                )}
                {renderDropdown(
                  t('settings.enthusiasm'),
                  enthusiasm,
                  setEnthusiasm,
                  STYLE_ENTHUSIASM_KEYS.map(k => ({
                    value: k,
                    label: t(`settings.enthusiasmOptions.${k}`),
                  })),
                  isEnthusiasmOpen,
                  setIsEnthusiasmOpen,
                  enthusiasmRef,
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderDropdown(
                  t('settings.headings'),
                  headings,
                  setHeadings,
                  STYLE_HEADINGS_KEYS.map(k => ({
                    value: k,
                    label: t(`settings.headingsOptions.${k}`),
                  })),
                  isHeadingsOpen,
                  setIsHeadingsOpen,
                  headingsRef,
                )}
                {renderDropdown(
                  t('settings.emojis'),
                  emojis,
                  setEmojis,
                  STYLE_EMOJI_KEYS.map(k => ({
                    value: k,
                    label: t(`settings.emojisOptions.${k}`),
                  })),
                  isEmojisOpen,
                  setIsEmojisOpen,
                  emojisRef,
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('settings.customInstruction')}
                </label>
                <textarea
                  value={customInstruction}
                  onChange={e => setCustomInstruction(e.target.value)}
                  placeholder={t('settings.customInstructionPlaceholder')}
                  rows={3}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-none text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-16 border-t border-gray-200 dark:border-zinc-800 flex items-center justify-between px-6 shrink-0 bg-white dark:bg-[#191a1a]">
          {editingAgent && onDelete ? (
            <button
              onClick={() => onDelete(editingAgent.id)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              {t('agents.actions.delete')}
            </button>
          ) : (
            <div />
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              {t('agents.actions.cancel')}
            </button>
            <button
              onClick={handleSaveWrapper}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-all shadow-md hover:shadow-lg active:scale-95 disabled:opacity-50"
            >
              {isSaving
                ? t('agents.actions.saving')
                : editingAgent
                  ? t('agents.actions.save')
                  : t('agents.actions.create')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AgentModal
