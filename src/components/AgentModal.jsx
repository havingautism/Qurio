import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Info, Check, ChevronDown, RefreshCw } from 'lucide-react'
import useScrollLock from '../hooks/useScrollLock'
import EmojiDisplay from './EmojiDisplay'
import CustomEmojiPicker from './CustomEmojiPicker'
import Checkbox from './ui/Checkbox'
import clsx from 'clsx'
import { getModelsForProvider } from '../lib/models_api'
import { useAppContext } from '../App'
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
  const { defaultAgent, agents = [] } = useAppContext()
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
  const [isDefaultProviderOpen, setIsDefaultProviderOpen] = useState(false)
  const [isLiteProviderOpen, setIsLiteProviderOpen] = useState(false)
  const [defaultModelSource, setDefaultModelSource] = useState('list')
  const [liteModelSource, setLiteModelSource] = useState('list')
  const [defaultCustomModel, setDefaultCustomModel] = useState('')
  const [liteCustomModel, setLiteCustomModel] = useState('')
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
  const [temperature, setTemperature] = useState(null)
  const [topP, setTopP] = useState(null)
  const [frequencyPenalty, setFrequencyPenalty] = useState(null)
  const [presencePenalty, setPresencePenalty] = useState(null)
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)

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
  const defaultProviderRef = useRef(null)
  const liteProviderRef = useRef(null)

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
        const resolvedTopP = editingAgent.topP ?? editingAgent.top_p ?? null
        const hasAdvancedOverrides =
          (editingAgent.temperature !== null && editingAgent.temperature !== undefined) ||
          (resolvedTopP !== null && resolvedTopP !== undefined) ||
          (editingAgent.frequencyPenalty !== null && editingAgent.frequencyPenalty !== undefined) ||
          (editingAgent.frequency_penalty !== null &&
            editingAgent.frequency_penalty !== undefined) ||
          (editingAgent.presencePenalty !== null && editingAgent.presencePenalty !== undefined) ||
          (editingAgent.presence_penalty !== null && editingAgent.presence_penalty !== undefined)
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
        const nextDefaultModel = parsedDefaultModel.modelId || ''
        const nextLiteModel = parsedLiteModel.modelId || ''
        setLiteModel(nextLiteModel)
        setDefaultModel(nextDefaultModel)
        setDefaultModelSource(editingAgent?.defaultModelSource || 'list')
        setLiteModelSource(editingAgent?.liteModelSource || 'list')
        setDefaultCustomModel(
          editingAgent?.defaultModelSource === 'custom' ? nextDefaultModel : '',
        )
        setLiteCustomModel(editingAgent?.liteModelSource === 'custom' ? nextLiteModel : '')
        setDefaultModelProvider(parsedDefaultModel.provider || '')
        setLiteModelProvider(parsedLiteModel.provider || '')
        setResponseLanguage(
          editingAgent.responseLanguage ||
            defaultAgent?.responseLanguage ||
            settings.llmAnswerLanguage ||
            'English',
        )
        setBaseTone(
          editingAgent.baseTone || defaultAgent?.baseTone || settings.baseTone || 'technical',
        )
        setTraits(editingAgent.traits || defaultAgent?.traits || settings.traits || 'default')
        setWarmth(editingAgent.warmth || defaultAgent?.warmth || settings.warmth || 'default')
        setEnthusiasm(
          editingAgent.enthusiasm || defaultAgent?.enthusiasm || settings.enthusiasm || 'default',
        )
        setHeadings(
          editingAgent.headings || defaultAgent?.headings || settings.headings || 'default',
        )
        setEmojis(editingAgent.emojis || defaultAgent?.emojis || settings.emojis || 'default')
        setCustomInstruction(editingAgent.customInstruction || '')
        setTemperature(editingAgent.temperature ?? null)
        setTopP(resolvedTopP)
        setFrequencyPenalty(editingAgent.frequencyPenalty ?? editingAgent.frequency_penalty ?? null)
        setPresencePenalty(editingAgent.presencePenalty ?? editingAgent.presence_penalty ?? null)
        setIsAdvancedOpen(!!hasAdvancedOverrides)
      } else {
        // Reset defaults
        setName('')
        setDescription('')
        setPrompt(
          defaultAgent?.prompt || settings.systemPrompt || t('agents.defaults.systemPrompt'),
        )
        setEmoji('🤻')
        setProvider(defaultAgent?.provider || settings.apiProvider || 'gemini')
        const nextLiteModel =
          parseStoredModel(defaultAgent?.liteModel || settings.liteModel).modelId || ''
        const nextDefaultModel =
          parseStoredModel(defaultAgent?.defaultModel || settings.defaultModel).modelId || ''
        setLiteModel(nextLiteModel)
        setDefaultModel(nextDefaultModel)
        setDefaultModelSource('list')
        setLiteModelSource('list')
        setDefaultCustomModel('')
        setLiteCustomModel('')
        setResponseLanguage(
          defaultAgent?.responseLanguage || settings.llmAnswerLanguage || 'English',
        )
        setBaseTone(defaultAgent?.baseTone || settings.baseTone || 'technical')
        setTraits(defaultAgent?.traits || settings.traits || 'default')
        setWarmth(defaultAgent?.warmth || settings.warmth || 'default')
        setEnthusiasm(defaultAgent?.enthusiasm || settings.enthusiasm || 'default')
        setHeadings(defaultAgent?.headings || settings.headings || 'default')
        setEmojis(defaultAgent?.emojis || settings.emojis || 'default')
        setCustomInstruction(defaultAgent?.customInstruction || settings.customInstruction || '')
        setTemperature(null)
        setTopP(null)
        setFrequencyPenalty(null)
        setPresencePenalty(null)
        setIsAdvancedOpen(false)
      }
      setActiveTab('general')
      setError('')
      setIsSaving(false)

      // Load API keys and fetch models
      loadKeysAndFetchModels()
    }
  }, [isOpen, editingAgent, t, defaultAgent])

  const handleSaveWrapper = async () => {
    if (!editingAgent?.isDefault && !name.trim()) {
      setError(t('agents.validation.nameRequired'))
      return
    }
    if (!editingAgent?.isDefault) {
      const normalizedName = name.trim().toLowerCase()
      const duplicateName = agents.some(
        agent =>
          agent.id !== editingAgent?.id &&
          (agent.name || '').trim().toLowerCase() === normalizedName,
      )
      if (duplicateName) {
        setError(t('agents.validation.nameDuplicate'))
        return
      }
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
        name: editingAgent?.isDefault ? editingAgent?.name || name.trim() : name.trim(),
        description: editingAgent?.isDefault
          ? editingAgent?.description || description.trim()
          : description.trim(),
        prompt: prompt.trim(),
        emoji,
        provider: derivedProvider,
        liteModel: encodeModelId(resolvedLiteProvider, liteModel),
        defaultModel: encodeModelId(resolvedDefaultProvider, defaultModel),
        defaultModelSource,
        liteModelSource,
        responseLanguage,
        baseTone,
        traits,
        warmth,
        enthusiasm,
        headings,
        emojis,
        customInstruction: customInstruction.trim(),
        temperature,
        topP,
        frequencyPenalty,
        presencePenalty,
      })
      onClose()
    } catch (err) {
      console.error('Failed to save agent agent:', err)
      setError(err.message || t('agents.errors.saveFailed'))
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
      if (defaultProviderRef.current && !defaultProviderRef.current.contains(event.target))
        setIsDefaultProviderOpen(false)
      if (liteProviderRef.current && !liteProviderRef.current.contains(event.target))
        setIsLiteProviderOpen(false)
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
    isDefaultProviderOpen,
    isLiteProviderOpen,
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

  const hasAdvancedOverrides =
    temperature !== null || topP !== null || frequencyPenalty !== null || presencePenalty !== null

  useEffect(() => {
    if (hasAdvancedOverrides) {
      setIsAdvancedOpen(true)
    }
  }, [hasAdvancedOverrides])

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
  }, [availableProviders, defaultModel, groupedModels, isOpen, liteModel])

  useEffect(() => {
    if (!defaultModel) return
    if (defaultModelSource !== 'list') return
    const existsInList = Object.values(groupedModels)
      .flat()
      .some(model => model.value === defaultModel)
    if (!existsInList) {
      setDefaultModelSource('custom')
      setDefaultCustomModel(defaultModel)
    }
  }, [defaultModel, defaultModelSource, groupedModels])

  useEffect(() => {
    if (!liteModel) return
    if (liteModelSource !== 'list') return
    const existsInList = Object.values(groupedModels)
      .flat()
      .some(model => model.value === liteModel)
    if (!existsInList) {
      setLiteModelSource('custom')
      setLiteCustomModel(liteModel)
    }
  }, [liteModel, liteModelSource, groupedModels])

  // Keep lite provider independent so users can mix providers between default and lite models.

  const renderModelPicker = ({
    label,
    helper,
    value,
    onChange,
    activeProvider,
    onProviderChange,
    isProviderOpen,
    setIsProviderOpen,
    providerRef,
    customValue,
    onCustomValueChange,
    modelSource,
    onModelSourceChange,
    sourceName,
    allowEmpty = false,
    hideProviderSelector = false,
  }) => {
    const providers = availableProviders.length > 0 ? availableProviders : PROVIDER_KEYS
    const activeModels = groupedModels[activeProvider] || []
    const selectedLabel = getModelLabel(value)
    const showList = modelSource === 'list'
    const displayLabel = showList
      ? selectedLabel
      : customValue || value || t('agents.model.custom')

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name={sourceName}
                  checked={modelSource === 'list'}
                  onChange={() => {
                    onModelSourceChange('list')
                    const existsInList = activeModels.some(m => m.value === value)
                    if (!existsInList) onChange('')
                  }}
                  className="h-3 w-3"
                />
                <span>{t('agents.model.sourceList')}</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name={sourceName}
                  checked={modelSource === 'custom'}
                  onChange={() => {
                    onModelSourceChange('custom')
                    const nextValue = value || customValue || ''
                    onCustomValueChange(nextValue)
                    onChange(nextValue)
                  }}
                  className="h-3 w-3"
                />
                <span>{t('agents.model.sourceCustom')}</span>
              </label>
            </div>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{displayLabel}</span>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3">
          <div className="flex flex-col gap-3">
            {!hideProviderSelector && (
              <div className="flex flex-col gap-2 relative" ref={providerRef}>
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {t('agents.model.providers')}
                </span>
                <button
                  type="button"
                  onClick={() => setIsProviderOpen(!isProviderOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                >
                  <div className="flex items-center gap-3">
                    {renderProviderIcon(activeProvider, {
                      size: 16,
                      alt: t(`settings.providers.${activeProvider}`),
                    })}
                    <span>{t(`settings.providers.${activeProvider}`)}</span>
                  </div>
                  <ChevronDown
                    size={16}
                    className={clsx(
                      'text-gray-400 transition-transform',
                      isProviderOpen && 'rotate-180',
                    )}
                  />
                </button>
                {isProviderOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    {providers.map(key => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          onProviderChange(key)
                          setIsProviderOpen(false)
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          {renderProviderIcon(key, {
                            size: 16,
                            alt: t(`settings.providers.${key}`),
                          })}
                          <span>{t(`settings.providers.${key}`)}</span>
                        </div>
                        {activeProvider === key && <Check size={14} className="text-primary-500" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {t('agents.model.models')}
              </span>
              {showList ? (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-zinc-700">
                {allowEmpty && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange('')
                    }}
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
                      onClick={() => {
                        onChange(model.value)
                      }}
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
              ) : (
                <input
                  value={customValue}
                  onChange={e => {
                    const nextValue = e.target.value
                    onCustomValueChange(nextValue)
                    onChange(nextValue)
                  }}
                  placeholder={t('agents.model.customPlaceholder')}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderAdvancedControl = ({
    label,
    param,
    description,
    value,
    onChange,
    min,
    max,
    step,
    defaultValue,
  }) => {
    const isEnabled = value !== null && value !== undefined
    const displayValue = isEnabled ? value : ''
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{label}</span>
              <span className="px-2 py-0.5 text-xs rounded-md bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 font-mono">
                {param}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{description}</p>
          </div>
          <Checkbox
            checked={isEnabled}
            onChange={checked => {
              if (checked) {
                onChange(defaultValue)
              } else {
                onChange(null)
              }
            }}
            className="shrink-0"
          />
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={isEnabled ? value : defaultValue}
            onChange={e => onChange(parseFloat(e.target.value))}
            disabled={!isEnabled}
            className="flex-1 accent-black dark:accent-white cursor-pointer disabled:opacity-40"
          />
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={displayValue}
            onChange={e => {
              const next = e.target.value
              if (next === '') {
                onChange(null)
              } else {
                onChange(parseFloat(next))
              }
            }}
            placeholder={t('agents.advanced.auto')}
            disabled={!isEnabled}
            className="w-20 h-10 px-3 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600 disabled:opacity-40"
          />
        </div>
      </div>
    )
  }

  if (!isOpen) return null

  const displayName = editingAgent?.isDefault ? t('agents.defaults.name') : name
  const displayDescription = editingAgent?.isDefault
    ? t('agents.defaults.description')
    : description

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
            <div className="flex flex-col gap-6 h-full">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('agents.general.avatar')} & {t('agents.general.name')}
                </label>
                <div className="flex items-center gap-3">
                  <div className="relative inline-block w-fit">
                    <button
                      ref={buttonRef}
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-zinc-800 flex items-center justify-center text-2xl hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors border border-gray-200 dark:border-zinc-700"
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
                  <input
                    value={displayName}
                    onChange={e => setName(e.target.value)}
                    placeholder={t('agents.general.namePlaceholder')}
                    disabled={editingAgent?.isDefault}
                    className="flex-1 px-4 py-2.5 h-12 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('agents.general.description')}
                </label>
                <textarea
                  value={displayDescription}
                  onChange={e => setDescription(e.target.value)}
                  placeholder={t('agents.general.descriptionPlaceholder')}
                  disabled={editingAgent?.isDefault}
                  rows={2}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-none"
                />
              </div>

              <div className="flex flex-col gap-2 flex-1 min-h-0">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('agents.general.systemPrompt')}
                </label>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder={t('agents.general.systemPromptPlaceholder')}
                  rows={6}
                  className="w-full flex-1 min-h-0 px-4 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-none font-mono text-sm"
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
                    isProviderOpen: isDefaultProviderOpen,
                    setIsProviderOpen: setIsDefaultProviderOpen,
                    providerRef: defaultProviderRef,
                    customValue: defaultCustomModel,
                    onCustomValueChange: setDefaultCustomModel,
                    modelSource: defaultModelSource,
                    onModelSourceChange: setDefaultModelSource,
                    sourceName: 'default-model-source',
                  })}

                  {renderModelPicker({
                    label: t('agents.model.liteModel'),
                    helper: t('agents.model.liteHelper'),
                    value: liteModel,
                    onChange: setLiteModel,
                    activeProvider: liteModelProvider || provider,
                    onProviderChange: setLiteModelProvider,
                    isProviderOpen: isLiteProviderOpen,
                    setIsProviderOpen: setIsLiteProviderOpen,
                    providerRef: liteProviderRef,
                    customValue: liteCustomModel,
                    onCustomValueChange: setLiteCustomModel,
                    modelSource: liteModelSource,
                    onModelSourceChange: setLiteModelSource,
                    sourceName: 'lite-model-source',
                    allowEmpty: true,
                    hideProviderSelector: false,
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

              <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                <button
                  type="button"
                  onClick={() => {
                    if (hasAdvancedOverrides) return
                    setIsAdvancedOpen(prev => !prev)
                  }}
                  className={clsx(
                    'w-full flex items-center justify-between px-4 py-3 text-sm font-medium',
                    isAdvancedOpen
                      ? 'text-gray-900 dark:text-gray-100'
                      : 'text-gray-600 dark:text-gray-400',
                  )}
                >
                  <span>{t('agents.advanced.title')}</span>
                  <div className="flex items-center gap-3">
                    <ChevronDown
                      size={16}
                      className={clsx(
                        'text-gray-400 transition-transform',
                        isAdvancedOpen && 'rotate-180',
                      )}
                    />
                  </div>
                </button>

                {isAdvancedOpen && (
                  <div className="px-4 pb-4 pt-4 border-t border-gray-200 dark:border-zinc-700 space-y-5">
                    {renderAdvancedControl({
                      label: t('agents.advanced.frequencyPenaltyLabel'),
                      param: t('agents.advanced.frequencyPenaltyParam'),
                      description: t('agents.advanced.frequencyPenaltyDesc'),
                      value: frequencyPenalty,
                      onChange: setFrequencyPenalty,
                      min: -2,
                      max: 2,
                      step: 0.1,
                      defaultValue: 0,
                    })}
                    {renderAdvancedControl({
                      label: t('agents.advanced.presencePenaltyLabel'),
                      param: t('agents.advanced.presencePenaltyParam'),
                      description: t('agents.advanced.presencePenaltyDesc'),
                      value: presencePenalty,
                      onChange: setPresencePenalty,
                      min: -2,
                      max: 2,
                      step: 0.1,
                      defaultValue: 0,
                    })}
                    {renderAdvancedControl({
                      label: t('agents.advanced.temperatureLabel'),
                      param: t('agents.advanced.temperatureParam'),
                      description: t('agents.advanced.temperatureDesc'),
                      value: temperature,
                      onChange: setTemperature,
                      min: 0,
                      max: 2,
                      step: 0.1,
                      defaultValue: 1,
                    })}
                    {renderAdvancedControl({
                      label: t('agents.advanced.topPLabel'),
                      param: t('agents.advanced.topPParam'),
                      description: t('agents.advanced.topPDesc'),
                      value: topP,
                      onChange: setTopP,
                      min: 0,
                      max: 1,
                      step: 0.01,
                      defaultValue: 1,
                    })}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setTemperature(null)
                          setTopP(null)
                          setFrequencyPenalty(null)
                          setPresencePenalty(null)
                        }}
                        className="text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400"
                      >
                        {t('agents.advanced.reset')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-16 border-t border-gray-200 dark:border-zinc-800 flex items-center justify-between px-6 shrink-0 bg-white dark:bg-[#191a1a]">
          {editingAgent && onDelete && !editingAgent.isDefault ? (
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
