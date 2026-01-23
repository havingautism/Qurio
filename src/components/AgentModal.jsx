import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  X,
  Info,
  Check,
  ChevronDown,
  RefreshCw,
  Search,
  GraduationCap,
  Calculator,
  Clock,
  FileText,
  ScanText,
  Wrench,
  Code,
  FormInput,
  Globe,
  LineChart,
  Settings,
  User,
  Box,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import useScrollLock from '../hooks/useScrollLock'
import EmojiDisplay from './EmojiDisplay'
import CustomEmojiPicker from './CustomEmojiPicker'
import { Checkbox } from '@/components/ui/checkbox'
import clsx from 'clsx'
import { getModelsForProvider } from '../lib/models_api'
import { useAppContext } from '../App'
import { loadSettings } from '../lib/settings'
import {
  DEEP_RESEARCH_AGENT_DESCRIPTION,
  DEEP_RESEARCH_AGENT_NAME,
  DEEP_RESEARCH_AGENT_PROMPT,
  DEEP_RESEARCH_EMOJI,
  DEEP_RESEARCH_PROFILE,
} from '../lib/deepResearchDefaults'
import { SILICONFLOW_BASE_URL } from '../lib/providerConstants'
import { getModelIcon, getModelIconClassName, renderProviderIcon } from '../lib/modelIcons'
import { getProvider } from '../lib/providers'
import { getPublicEnv } from '../lib/publicEnv'
import { listToolsViaBackend } from '../lib/backendClient'
import { getUserTools } from '../lib/userToolsService'
import { TOOL_TRANSLATION_KEYS, TOOL_ICONS, TOOL_INFO_KEYS } from '../lib/toolConstants'
import { isQuickSearchTool } from '../lib/searchTools'

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
  nvidia: [
    { value: 'deepseek-ai/deepseek-v3.2', label: 'deepseek-v3.2' },
    { value: 'moonshotai/kimi-k2-thinking', label: 'kimi-k2-thinking' },
    { value: 'minimaxai/minimax-m2', label: 'minimax-m2' },
  ],
  minimax: [{ value: 'MiniMax-M2.1', label: 'MiniMax M2.1' }],
  modelscope: [],
  kimi: [
    { value: 'moonshot-v1-8k', label: 'Moonshot V1 8K' },
    { value: 'moonshot-v1-32k', label: 'Moonshot V1 32K' },
  ],
  __fallback__: [],
}

const PROVIDER_KEYS = [
  'gemini',
  'openai_compatibility',
  'siliconflow',
  'nvidia',
  'minimax',
  'glm',
  'modelscope',
  'kimi',
]

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

const STYLE_BASE_TONE_KEYS = [
  'technical',
  'friendly',
  'professional',
  'academic',
  'creative',
  'casual',
]
const STYLE_TRAIT_KEYS = [
  'default',
  'concise',
  'structured',
  'detailed',
  'actionable',
  'analytical',
]
const STYLE_WARMTH_KEYS = ['default', 'gentle', 'empathetic', 'direct', 'supportive']
const STYLE_ENTHUSIASM_KEYS = ['default', 'low', 'medium', 'high']
const STYLE_HEADINGS_KEYS = ['default', 'minimal', 'structured', 'detailed']
const STYLE_EMOJI_KEYS = ['default', 'none', 'light', 'moderate', 'expressive']

const ENV_VARS = {
  supabaseUrl: getPublicEnv('PUBLIC_SUPABASE_URL'),
  supabaseKey: getPublicEnv('PUBLIC_SUPABASE_KEY'),
  openAIKey: getPublicEnv('PUBLIC_OPENAI_API_KEY'),
  openAIBaseUrl: getPublicEnv('PUBLIC_OPENAI_BASE_URL'),
  googleApiKey: getPublicEnv('PUBLIC_GOOGLE_API_KEY'),
  siliconFlowKey: getPublicEnv('PUBLIC_SILICONFLOW_API_KEY'),
  glmKey: getPublicEnv('PUBLIC_GLM_API_KEY'),
  modelscopeKey: getPublicEnv('PUBLIC_MODELSCOPE_API_KEY'),
  kimiKey: getPublicEnv('PUBLIC_KIMI_API_KEY'),
}

const AgentModal = ({ isOpen, onClose, editingAgent = null, onSave, onDelete }) => {
  const { t } = useTranslation()
  const { defaultAgent, agents = [], showConfirmation } = useAppContext()
  useScrollLock(isOpen)
  const isDeepResearchAgent = Boolean(editingAgent?.isDeepResearchSystem)
  const isGeneralLocked = Boolean(editingAgent?.isDefault || isDeepResearchAgent)

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
  const [defaultTestState, setDefaultTestState] = useState({ status: 'idle', message: '' })
  const [liteTestState, setLiteTestState] = useState({ status: 'idle', message: '' })

  // Dynamic Models State
  // Structure: { [provider]: [ { value, label } ] }
  const [groupedModels, setGroupedModels] = useState({})
  const [isLoadingModels, setIsLoadingModels] = useState(false)

  // Personalization Tab
  const [responseLanguage, setResponseLanguage] = useState('English')
  const [followInterfaceLanguage, setFollowInterfaceLanguage] = useState(false)
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

  // Tools Tab
  const [availableTools, setAvailableTools] = useState([])
  const [toolsLoading, setToolsLoading] = useState(false)
  const [selectedToolIds, setSelectedToolIds] = useState([])
  const searchToolIdSetRef = useRef(new Set())

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

  const toolsByCategory = useMemo(() => {
    const groups = {}
    for (const tool of availableTools) {
      const category = tool.category || 'other'

      if (category === 'custom') {
        // For custom tools, create sub-groups by MCP server or HTTP
        if (!groups[category]) {
          groups[category] = { type: 'grouped', subGroups: {} }
        }

        let subGroupKey
        if (tool.type === 'mcp') {
          // Group by MCP server name
          subGroupKey = tool.config?.serverName || 'Unknown Server'
        } else {
          // All HTTP tools in one group
          subGroupKey = 'HTTP 自定义工具'
        }

        if (!groups[category].subGroups[subGroupKey]) {
          groups[category].subGroups[subGroupKey] = []
        }
        groups[category].subGroups[subGroupKey].push(tool)
      } else {
        // Non-custom tools, simple grouping
        if (!groups[category]) groups[category] = { type: 'simple', tools: [] }
        groups[category].tools.push(tool)
      }
    }
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === 'custom') return -1
      if (b === 'custom') return 1
      return 0
    })
  }, [availableTools])

  const loadToolsList = async () => {
    setToolsLoading(true)
    try {
      const [systemTools, userTools] = await Promise.all([listToolsViaBackend(), getUserTools()])

      const validSystemTools = Array.isArray(systemTools) ? systemTools : []
      const validUserTools = Array.isArray(userTools)
        ? userTools
            .filter(tool => !tool.config?.disabled)
            .map(tool => ({
              ...tool,
              category: 'custom',
              // Ensure ID is string to match system tools
              id: String(tool.id),
            }))
        : []

      const searchTools = validSystemTools.filter(isQuickSearchTool)
      searchToolIdSetRef.current = new Set(searchTools.map(tool => String(tool.id || tool.name)))
      const filteredSystemTools = validSystemTools.filter(tool => !isQuickSearchTool(tool))

      setAvailableTools([...filteredSystemTools, ...validUserTools])
      setSelectedToolIds(prev => prev.filter(id => !searchToolIdSetRef.current.has(String(id))))
    } catch (err) {
      console.error('Failed to load tools list:', err)
      setAvailableTools([])
    } finally {
      setToolsLoading(false)
    }
  }

  const loadKeysAndFetchModels = async () => {
    setIsLoadingModels(true)
    setModelsError('')
    const settings = loadSettings()
    const keys = {
      gemini: settings.googleApiKey,
      openai_compatibility: settings.OpenAICompatibilityKey,
      siliconflow: settings.SiliconFlowKey,
      glm: settings.GlmKey,
      modelscope: settings.ModelScopeKey,
      kimi: settings.KimiKey,
      nvidia: settings.NvidiaKey,
      minimax: settings.MinimaxKey,
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
      else if (key === 'modelscope') credentials = { apiKey: keys.modelscope }
      else if (key === 'kimi') credentials = { apiKey: keys.kimi }
      else if (key === 'nvidia')
        credentials = { apiKey: keys.nvidia, baseUrl: 'https://integrate.api.nvidia.com/v1' }
      else if (key === 'minimax')
        credentials = { apiKey: keys.minimax, baseUrl: 'https://api.minimax.io/v1' }
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
      setFollowInterfaceLanguage(Boolean(settings.followInterfaceLanguage))
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
        setName(editingAgent.name)
        setDescription(editingAgent.description)
        setPrompt(editingAgent.prompt)
        setEmoji(editingAgent.emoji)
        setProvider(
          editingAgent.provider ||
            editingAgent?.defaultModelProvider ||
            editingAgent?.liteModelProvider ||
            'gemini',
        )
        const nextDefaultModel = editingAgent.defaultModel || ''
        const nextLiteModel = editingAgent.liteModel || ''
        setLiteModel(nextLiteModel)
        setDefaultModel(nextDefaultModel)
        setDefaultModelSource(editingAgent?.defaultModelSource || 'list')
        setLiteModelSource(editingAgent?.liteModelSource || 'list')
        setDefaultCustomModel(editingAgent?.defaultModelSource === 'custom' ? nextDefaultModel : '')
        setLiteCustomModel(editingAgent?.liteModelSource === 'custom' ? nextLiteModel : '')
        setDefaultModelProvider(editingAgent?.defaultModelProvider || editingAgent?.provider || '')
        setLiteModelProvider(editingAgent?.liteModelProvider || editingAgent?.provider || '')
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
        setProvider(defaultAgent?.provider || 'gemini')
        const nextLiteModel = defaultAgent?.liteModel || ''
        const nextDefaultModel = defaultAgent?.defaultModel || ''
        setLiteModel(nextLiteModel)
        setDefaultModel(nextDefaultModel)
        setDefaultModelProvider(defaultAgent?.defaultModelProvider || defaultAgent?.provider || '')
        setLiteModelProvider(defaultAgent?.liteModelProvider || defaultAgent?.provider || '')
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
        setSelectedToolIds([])
      }
      if (editingAgent) {
        setSelectedToolIds(editingAgent?.toolIds || [])
      }
      loadToolsList()
      setActiveTab('general')
      setError('')
      setIsSaving(false)
      setDefaultTestState({ status: 'idle', message: '' })
      setLiteTestState({ status: 'idle', message: '' })

      // Load API keys and fetch models
      loadKeysAndFetchModels()
    }
  }, [isOpen, editingAgent, t, defaultAgent])

  const handleSaveWrapper = async () => {
    if (!editingAgent?.isDefault && !isDeepResearchAgent && !name.trim()) {
      setError(t('agents.validation.nameRequired'))
      return
    }
    if (!editingAgent?.isDefault && !isDeepResearchAgent) {
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
      const resolveProvider = (modelId, fallback, modelSource, explicitProvider) => {
        if (!modelId) return fallback || ''
        if (explicitProvider) return explicitProvider
        if (modelSource && modelSource !== 'list') return fallback || ''
        const derived = findProviderForModel(modelId)
        return derived || fallback || ''
      }

      const resolvedDefaultProvider = resolveProvider(
        defaultModel,
        defaultModelProvider || provider,
        defaultModelSource,
        defaultModelProvider,
      )
      const resolvedLiteProvider = resolveProvider(
        liteModel,
        liteModelProvider || provider,
        liteModelSource,
        liteModelProvider,
      )
      const derivedProvider = resolvedDefaultProvider || provider

      const resolvedName = isDeepResearchAgent
        ? DEEP_RESEARCH_AGENT_NAME
        : editingAgent?.isDefault
          ? editingAgent?.name || name.trim()
          : name.trim()
      const resolvedDescription = isDeepResearchAgent
        ? DEEP_RESEARCH_AGENT_DESCRIPTION
        : editingAgent?.isDefault
          ? editingAgent?.description || description.trim()
          : description.trim()
      const resolvedPrompt = isDeepResearchAgent ? DEEP_RESEARCH_AGENT_PROMPT : prompt.trim()
      const resolvedEmoji = isDeepResearchAgent ? DEEP_RESEARCH_EMOJI : emoji
      const resolvedBaseTone = isDeepResearchAgent ? DEEP_RESEARCH_PROFILE.baseTone : baseTone
      const resolvedTraits = isDeepResearchAgent ? DEEP_RESEARCH_PROFILE.traits : traits
      const resolvedWarmth = isDeepResearchAgent ? DEEP_RESEARCH_PROFILE.warmth : warmth
      const resolvedEnthusiasm = isDeepResearchAgent ? DEEP_RESEARCH_PROFILE.enthusiasm : enthusiasm
      const resolvedHeadings = isDeepResearchAgent ? DEEP_RESEARCH_PROFILE.headings : headings
      const resolvedEmojis = isDeepResearchAgent ? DEEP_RESEARCH_PROFILE.emojis : emojis

      const filteredToolIds = selectedToolIds.filter(
        id => !searchToolIdSetRef.current.has(String(id)),
      )

      await onSave?.({
        id: editingAgent?.id,
        name: resolvedName,
        description: resolvedDescription,
        prompt: resolvedPrompt,
        emoji: resolvedEmoji,
        provider: derivedProvider,
        defaultModelProvider: resolvedDefaultProvider,
        liteModelProvider: resolvedLiteProvider,
        liteModel,
        defaultModel,
        defaultModelSource,
        liteModelSource,
        responseLanguage,
        baseTone: resolvedBaseTone,
        traits: resolvedTraits,
        warmth: resolvedWarmth,
        enthusiasm: resolvedEnthusiasm,
        headings: resolvedHeadings,
        emojis: resolvedEmojis,
        customInstruction: customInstruction.trim(),
        temperature,
        topP,
        frequencyPenalty,
        presencePenalty,
        toolIds: filteredToolIds,
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
    _isOpen,
    _setIsOpen,
    _ref,
    _isGrouped = false,
    disabled = false,
  ) => (
    <div className="flex flex-col gap-2 relative">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-full bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 h-10">
          <SelectValue>
            {options.find(o => (o.value || o) === value)?.label ||
              options.find(o => (o.value || o) === value) ||
              value}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map(opt => {
            const optValue = opt.value || opt
            const optLabel = opt.label || opt
            return (
              <SelectItem key={optValue} value={optValue}>
                {optLabel}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
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
    const resolvedDefaultProvider =
      defaultModelSource === 'list' ? findProviderForModel(defaultModel) : ''
    const resolvedLiteProvider = liteModelSource === 'list' ? findProviderForModel(liteModel) : ''

    // Only auto-resolve provider if not already set or if model changed
    // This prevents overwriting user's manual provider selection
    if (defaultModelSource === 'list') {
      if (resolvedDefaultProvider && !defaultModelProvider) {
        setDefaultModelProvider(resolvedDefaultProvider)
      } else if (!defaultModelProvider && availableProviders.length > 0) {
        setDefaultModelProvider(availableProviders[0])
      }
    }
    if (liteModelSource === 'list') {
      if (resolvedLiteProvider && !liteModelProvider) {
        setLiteModelProvider(resolvedLiteProvider)
      } else if (!liteModelProvider && availableProviders.length > 0) {
        setLiteModelProvider(availableProviders[0])
      }
    }
  }, [availableProviders, defaultModel, groupedModels, isOpen, liteModel])

  useEffect(() => {
    if (!defaultModel) return
    if (defaultModelSource !== 'list') return
    if (isLoadingModels || Object.keys(groupedModels).length === 0) return
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
    if (isLoadingModels || Object.keys(groupedModels).length === 0) return
    const existsInList = Object.values(groupedModels)
      .flat()
      .some(model => model.value === liteModel)
    if (!existsInList) {
      setLiteModelSource('custom')
      setLiteCustomModel(liteModel)
    }
  }, [liteModel, liteModelSource, groupedModels])

  // Keep lite provider independent so users can mix providers between default and lite models.

  const resolveProvider = (modelId, fallback, modelSource, explicitProvider) => {
    if (!modelId) return fallback || ''
    if (explicitProvider) return explicitProvider
    if (modelSource && modelSource !== 'list') return fallback || ''
    const derived = findProviderForModel(modelId)
    return derived || fallback || ''
  }

  const parseJsonFromText = text => {
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch {
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) return null
      try {
        return JSON.parse(match[0])
      } catch {
        return null
      }
    }
  }

  const runModelTest = async ({ modelId, providerKey, structured }) => {
    if (!modelId) {
      throw new Error(t('agents.model.testMissingModel'))
    }
    const providerAdapter = getProvider(providerKey)
    const settings = loadSettings()
    const credentials = providerAdapter?.getCredentials?.(settings) || {}
    const apiKey = credentials.apiKey
    if (!apiKey) {
      throw new Error(t('agents.model.testMissingKey'))
    }
    const responseFormat =
      structured && providerKey !== 'gemini' ? { type: 'json_object' } : undefined
    const prompt = structured
      ? 'Return a JSON object with keys "ok" and "echo". Set ok to true.'
      : 'Reply with "pong".'

    return new Promise((resolve, reject) => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        controller.abort()
        reject(new Error(t('agents.model.testTimeout')))
      }, 20000)

      providerAdapter
        .streamChatCompletion({
          apiKey,
          baseUrl: credentials.baseUrl,
          model: modelId,
          messages: [{ role: 'user', content: prompt }],
          responseFormat,
          stream: false,
          temperature: 0,
          onFinish: result => {
            clearTimeout(timeoutId)
            resolve(result?.content || '')
          },
          onError: err => {
            clearTimeout(timeoutId)
            reject(err)
          },
          signal: controller.signal,
        })
        .catch(err => {
          clearTimeout(timeoutId)
          reject(err)
        })
    })
  }

  const handleDefaultModelTest = async () => {
    const resolvedProvider = resolveProvider(
      defaultModel,
      defaultModelProvider || provider,
      defaultModelSource,
      defaultModelProvider,
    )
    setDefaultTestState({ status: 'loading', message: t('agents.model.testing') })
    try {
      await runModelTest({
        modelId: defaultModel,
        providerKey: resolvedProvider,
        structured: false,
      })
      setDefaultTestState({ status: 'success', message: t('agents.model.testConnectivityOk') })
    } catch (err) {
      setDefaultTestState({
        status: 'error',
        message: t('agents.model.testFailed', { message: err?.message || 'Unknown error' }),
      })
    }
  }

  const handleLiteModelTest = async () => {
    const resolvedProvider = resolveProvider(
      liteModel,
      liteModelProvider || provider,
      liteModelSource,
      liteModelProvider,
    )
    setLiteTestState({ status: 'loading', message: t('agents.model.testing') })
    try {
      await runModelTest({ modelId: liteModel, providerKey: resolvedProvider, structured: false })
      const structuredText = await runModelTest({
        modelId: liteModel,
        providerKey: resolvedProvider,
        structured: true,
      })
      const parsed = parseJsonFromText(structuredText)
      if (!parsed) {
        throw new Error(t('agents.model.testInvalidJson'))
      }
      setLiteTestState({
        status: 'success',
        message: `${t('agents.model.testConnectivityOk')} • ${t('agents.model.testStructuredOk')}`,
      })
    } catch (err) {
      setLiteTestState({
        status: 'error',
        message: t('agents.model.testFailed', { message: err?.message || 'Unknown error' }),
      })
    }
  }

  const renderModelPicker = ({
    label,
    hint,
    value,
    onChange,
    activeProvider,
    onProviderChange,
    _isProviderOpen,
    _setIsProviderOpen,
    _providerRef,
    customValue,
    onCustomValueChange,
    modelSource,
    onModelSourceChange,
    allowEmpty = false,
    hideProviderSelector = false,
    testAction,
  }) => {
    const providers = availableProviders.length > 0 ? availableProviders : PROVIDER_KEYS
    const activeModels = groupedModels[activeProvider] || []
    const selectedLabel = getModelLabel(value)
    const showList = modelSource === 'list'
    const displayLabel = showList ? selectedLabel : customValue || value || t('agents.model.custom')

    return (
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex flex-col gap-2 w-full sm:w-auto">
            <div className="flex flex-wrap items-center gap-3 w-full">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">
                {label}
              </label>

              {/* Desktop: Inline Segmented Control */}
              <div className="hidden sm:flex bg-gray-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-gray-200 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => {
                    onModelSourceChange('list')
                    const existsInList = activeModels.some(m => m.value === value)
                    if (!existsInList) onChange('')
                  }}
                  className={clsx(
                    'px-3 py-1 text-xs font-medium rounded-md transition-all',
                    modelSource === 'list'
                      ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
                  )}
                >
                  {t('agents.model.sourceList')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onModelSourceChange('custom')
                    const nextValue = value || customValue || ''
                    onCustomValueChange(nextValue)
                    onChange(nextValue)
                  }}
                  className={clsx(
                    'px-3 py-1 text-xs font-medium rounded-md transition-all',
                    modelSource === 'custom'
                      ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
                  )}
                >
                  {t('agents.model.sourceCustom')}
                </button>
              </div>

              {testAction && (
                <button
                  type="button"
                  onClick={testAction.onClick}
                  disabled={testAction.status === 'loading'}
                  className="ml-auto sm:ml-0 px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800 text-xs font-medium hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors disabled:opacity-60 flex items-center gap-1.5"
                >
                  {testAction.status === 'loading' && (
                    <RefreshCw size={12} className="animate-spin" />
                  )}
                  {testAction.status === 'loading' ? t('agents.model.testing') : testAction.label}
                </button>
              )}
            </div>

            {/* Mobile: Full Width Segmented Control */}
            <div className="flex sm:hidden w-full bg-gray-100 dark:bg-zinc-800 p-1 rounded-lg border border-gray-200 dark:border-zinc-700">
              <button
                type="button"
                onClick={() => {
                  onModelSourceChange('list')
                  const existsInList = activeModels.some(m => m.value === value)
                  if (!existsInList) onChange('')
                }}
                className={clsx(
                  'flex-1 py-1.5 text-xs font-medium rounded-md transition-all',
                  modelSource === 'list'
                    ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
                )}
              >
                {t('agents.model.sourceList')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onModelSourceChange('custom')
                  const nextValue = value || customValue || ''
                  onCustomValueChange(nextValue)
                  onChange(nextValue)
                }}
                className={clsx(
                  'flex-1 py-1.5 text-xs font-medium rounded-md transition-all',
                  modelSource === 'custom'
                    ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
                )}
              >
                {t('agents.model.sourceCustom')}
              </button>
            </div>

            {hint && <p className="text-xs text-gray-500 dark:text-gray-400 max-w-2xl">{hint}</p>}
            {testAction?.message && (
              <p
                className={clsx(
                  'text-xs flex items-center gap-1.5',
                  testAction.status === 'error'
                    ? 'text-red-500'
                    : testAction.status === 'success'
                      ? 'text-emerald-500'
                      : 'text-gray-500 dark:text-gray-400',
                )}
              >
                {testAction.status === 'success' && <Check size={12} />}
                {testAction.status === 'error' && <X size={12} />}
                {testAction.message}
              </p>
            )}
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate text-left sm:text-right w-full sm:w-auto mt-1 sm:mt-0">
            {displayLabel}
          </span>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3">
          <div className="flex flex-col gap-3">
            {!hideProviderSelector && (
              <div className="flex flex-col gap-2 relative">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {t('agents.model.providers')}
                </span>
                <Select
                  value={activeProvider}
                  onValueChange={val => {
                    onProviderChange(val)
                  }}
                >
                  <SelectTrigger className="w-full h-10">
                    <SelectValue>
                      <div className="flex items-center gap-3">
                        {renderProviderIcon(activeProvider, {
                          size: 16,
                          alt: t(`settings.providers.${activeProvider}`),
                        })}
                        <span>{t(`settings.providers.${activeProvider}`)}</span>
                      </div>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map(key => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-3">
                          {renderProviderIcon(key, {
                            size: 16,
                            alt: t(`settings.providers.${key}`),
                          })}
                          <span>{t(`settings.providers.${key}`)}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {t('agents.model.models')}
              </span>
              {showList ? (
                <Select
                  value={value || (allowEmpty ? '__none__' : undefined)}
                  onValueChange={val => onChange(val === '__none__' ? '' : val)}
                  disabled={!activeModels.length && !allowEmpty}
                >
                  <SelectTrigger className="w-full h-10">
                    <SelectValue placeholder={t('agents.model.notSelected')}>
                      <div className="flex items-center gap-2 truncate">
                        {getModelIcon(value) && (
                          <img
                            src={getModelIcon(value)}
                            alt=""
                            className={clsx('w-4 h-4 shrink-0', getModelIconClassName(value))}
                          />
                        )}
                        <span className="truncate">
                          {value === ''
                            ? t('agents.model.none')
                            : activeModels.find(m => m.value === value)?.label ||
                              value ||
                              t('agents.model.notSelected')}
                        </span>
                      </div>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {allowEmpty && (
                      <SelectItem value="__none__">
                        <span className="text-gray-500">{t('agents.model.none')}</span>
                      </SelectItem>
                    )}
                    {activeModels.length > 0 ? (
                      activeModels.map(model => (
                        <SelectItem key={model.value} value={model.value}>
                          <div className="flex items-center gap-2 truncate">
                            {getModelIcon(model.value) && (
                              <img
                                src={getModelIcon(model.value)}
                                alt=""
                                className={clsx('w-4 h-4', getModelIconClassName(model.value))}
                              />
                            )}
                            <span className="truncate">{model.label}</span>
                          </div>
                        </SelectItem>
                      ))
                    ) : (
                      <div className="px-2 py-2 text-sm text-gray-500 dark:text-gray-400 text-center">
                        {t('agents.model.noModels')}
                      </div>
                    )}
                  </SelectContent>
                </Select>
              ) : (
                <input
                  value={customValue}
                  onChange={e => {
                    const nextValue = e.target.value
                    onCustomValueChange(nextValue)
                    onChange(nextValue)
                  }}
                  placeholder={t('agents.model.customPlaceholder')}
                  className="w-full px-3 py-2 bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
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
            onCheckedChange={checked => {
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
            className="w-20 h-10 px-3 bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600 disabled:opacity-40"
          />
        </div>
      </div>
    )
  }

  if (!isOpen) return null

  const displayName = editingAgent?.isDefault
    ? t('agents.defaults.name')
    : isDeepResearchAgent
      ? t('deepResearch.agentName')
      : name
  const displayDescription = editingAgent?.isDefault
    ? t('agents.defaults.description')
    : isDeepResearchAgent
      ? t('deepResearch.agentDescription')
      : description

  return (
    <div className="fixed inset-0 z-100 flex items-start md:items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4 overflow-y-auto md:overflow-hidden">
      <div className="w-full h-[100dvh] md:max-w-4xl md:h-[85vh] bg-white dark:bg-[#191a1a] rounded-none md:rounded-2xl shadow-2xl flex flex-col md:flex-row overflow-hidden border-0 md:border border-gray-200 dark:border-zinc-800">
        {/* Mobile Header */}
        <div className="md:hidden h-14 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between px-4 bg-white dark:bg-[#191a1a] shrink-0">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {editingAgent ? t('agents.modal.edit') : t('agents.modal.create')}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Sidebar / Tabs */}
        <div className="w-full md:w-64 bg-primary-50 dark:bg-background/70 border-b md:border-b-0 md:border-r border-gray-200 dark:border-zinc-800 px-1 py-1 sm:py-4 sm:px-4 flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-visible no-scrollbar shrink-0">
          <h2 className="text-xl font-bold mb-0 md:mb-6 px-2 text-gray-900 dark:text-white hidden md:block">
            {editingAgent ? t('agents.modal.edit') : t('agents.modal.create')}
          </h2>
          <nav className="flex flex-row md:flex-col gap-1 w-full md:w-auto">
            {[
              { id: 'general', icon: Settings },
              { id: 'model', icon: Box },
              { id: 'personalization', icon: User },
              { id: 'tools', icon: Wrench },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={clsx(
                  'flex items-center gap-1 sm:gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap',
                  activeTab === item.id
                    ? 'bg-primary-100 dark:bg-zinc-800 text-primary-600 dark:text-primary-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-primary-100 dark:hover:bg-zinc-800',
                )}
              >
                <item.icon size={18} />
                {t(`agents.tabs.${item.id}`)}
              </button>
            ))}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#f9f9f987] dark:bg-[#191a1a]">
          {/* Desktop Header */}
          {/* <div className="h-16 border-b border-gray-200 dark:border-zinc-800 hidden md:flex items-center justify-between px-6 sm:px-8">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white capitalize">
              {activeTab}
            </h3>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 transition-colors"
            >
              <X size={20} />
            </button>
          </div> */}

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-8 min-h-0 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07)]">
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
                        onClick={() => {
                          if (isGeneralLocked) return
                          setShowEmojiPicker(!showEmojiPicker)
                        }}
                        disabled={isGeneralLocked}
                        className="w-12 h-12 rounded-xl bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 flex items-center justify-center text-2xl hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors border border-gray-200 dark:border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
                      disabled={isGeneralLocked}
                      className="flex-1 px-4 py-2.5 h-12 text-sm bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    disabled={isGeneralLocked}
                    rows={2}
                    className="w-full px-4 py-2 text-sm bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
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
                    disabled={isDeepResearchAgent}
                    className="w-full flex-1 min-h-0 px-4 py-2 bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-none text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
                      testAction: {
                        label: t('agents.model.testDefault'),
                        onClick: handleDefaultModelTest,
                        status: defaultTestState.status,
                        message: defaultTestState.message,
                      },
                    })}

                    {renderModelPicker({
                      label: t('agents.model.liteModel'),
                      helper: t('agents.model.liteHelper'),
                      hint: t('agents.model.liteHint'),
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
                      testAction: {
                        label: t('agents.model.testLite'),
                        onClick: handleLiteModelTest,
                        status: liteTestState.status,
                        message: liteTestState.message,
                      },
                    })}
                  </>
                )}
                {(error || modelsError) && (
                  <div className="text-sm text-red-500 mt-4">{error || modelsError}</div>
                )}
              </div>
            )}

            {activeTab === 'personalization' && (
              <div className="space-y-4 sm:space-y-6">
                <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-lg flex gap-3 text-sm text-blue-700 dark:text-blue-300">
                  <Info size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">{t('settings.responseStyle')}</p>
                    <p className="opacity-90">{t('settings.responseStyleHint')}</p>
                  </div>
                </div>
                {renderDropdown(
                  t('settings.respondLanguage'),
                  responseLanguage,
                  setResponseLanguage,
                  LLM_ANSWER_LANGUAGE_KEYS,
                  isResponseLanguageOpen,
                  setIsResponseLanguageOpen,
                  responseLanguageRef,
                  false,
                  isDeepResearchAgent || followInterfaceLanguage,
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
                    false,
                    isDeepResearchAgent,
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
                    false,
                    isDeepResearchAgent,
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
                    false,
                    isDeepResearchAgent,
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
                    false,
                    isDeepResearchAgent,
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
                    false,
                    isDeepResearchAgent,
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
                    false,
                    isDeepResearchAgent,
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
                    className="w-full px-4 py-2 bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-none text-sm"
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
            {activeTab === 'tools' && (
              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-zinc-900/60 p-4 rounded-lg text-sm text-gray-600 dark:text-gray-300">
                  <p className="font-medium">{t('agents.tools.title')}</p>
                  <p className="opacity-90">{t('agents.tools.hint')}</p>
                </div>
                {toolsLoading ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {t('agents.tools.loading')}
                  </div>
                ) : toolsByCategory.length === 0 ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {t('agents.tools.empty')}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {toolsByCategory.map(([category, groupData]) => (
                      <div key={category} className="space-y-4">
                        <div className="text-xs tracking-wide text-gray-400">
                          {t(`agents.tools.categories.${category}`, category)}
                        </div>

                        {groupData.type === 'grouped' ? (
                          // Custom tools with sub-groups (MCP servers)
                          Object.entries(groupData.subGroups).map(([subGroupName, tools]) => {
                            const allSelected = tools.every(t => selectedToolIds.includes(t.id))
                            return (
                              <div key={subGroupName} className="space-y-3">
                                {/* Sub-group header */}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                      {subGroupName}
                                    </span>
                                    <span className="text-xs text-gray-400 dark:text-gray-500">
                                      ({tools.length})
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (allSelected) {
                                        // Deselect all in this group
                                        const groupIds = tools.map(t => t.id)
                                        setSelectedToolIds(prev =>
                                          prev.filter(id => !groupIds.includes(id)),
                                        )
                                      } else {
                                        // Select all in this group
                                        const groupIds = tools.map(t => t.id)
                                        setSelectedToolIds(prev => [
                                          ...new Set([...prev, ...groupIds]),
                                        ])
                                      }
                                    }}
                                    className="text-[10px] font-bold text-primary-500 hover:text-primary-600 transition-colors px-2 py-1 rounded bg-primary-500/5 hover:bg-primary-500/10 uppercase tracking-tight"
                                  >
                                    {allSelected ? t('common.deselectAll') : t('common.selectAll')}
                                  </button>
                                </div>
                                {/* Tools in sub-group */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ">
                                  {tools.map(tool => {
                                    const checked = selectedToolIds.includes(tool.id)
                                    const iconName = TOOL_ICONS[tool.name]
                                    const IconComponent = iconName
                                      ? {
                                          Search,
                                          GraduationCap,
                                          Calculator,
                                          Clock,
                                          FileText,
                                          ScanText,
                                          Wrench,
                                          FormInput,
                                          Globe,
                                          LineChart,
                                        }[iconName]
                                      : Code
                                    const infoKey = TOOL_INFO_KEYS[tool.name]
                                    const localizedName = t(
                                      TOOL_TRANSLATION_KEYS[tool.name] || tool.name,
                                    )
                                    return (
                                      <label
                                        key={tool.id}
                                        className={clsx(
                                          'flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer group/tool',
                                          checked
                                            ? 'border-primary-400 bg-primary-50/40 dark:bg-primary-900/20'
                                            : 'border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800/40',
                                        )}
                                      >
                                        <Checkbox
                                          checked={checked}
                                          onCheckedChange={() => {
                                            setSelectedToolIds(prev =>
                                              prev.includes(tool.id)
                                                ? prev.filter(id => id !== tool.id)
                                                : [...prev, tool.id],
                                            )
                                          }}
                                        />
                                        <div className="flex-1 space-y-1.5 min-w-0">
                                          <div className="flex items-center gap-2 min-w-0">
                                            {IconComponent && (
                                              <IconComponent
                                                size={16}
                                                className="text-gray-500 dark:text-gray-400 shrink-0"
                                              />
                                            )}
                                            <div
                                              className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate flex-1"
                                              title={localizedName}
                                            >
                                              {localizedName}
                                            </div>
                                          </div>
                                          {(infoKey || tool.description) && (
                                            <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2">
                                              {infoKey ? t(infoKey) : tool.description}
                                            </div>
                                          )}
                                        </div>
                                      </label>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })
                        ) : (
                          // Simple grouping for non-custom tools
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {groupData.tools.map(tool => {
                              const checked = selectedToolIds.includes(tool.id)
                              const iconName = TOOL_ICONS[tool.name]
                              const IconComponent = iconName
                                ? {
                                    Search,
                                    GraduationCap,
                                    Calculator,
                                    Clock,
                                    FileText,
                                    ScanText,
                                    Wrench,
                                    FormInput,
                                    Globe,
                                    LineChart,
                                  }[iconName]
                                : Code
                              const infoKey = TOOL_INFO_KEYS[tool.name]
                              return (
                                <label
                                  key={tool.id}
                                  className={clsx(
                                    'flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer',
                                    checked
                                      ? 'border-primary-400 bg-primary-50/40 dark:bg-primary-900/20'
                                      : 'border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800/40',
                                  )}
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={() => {
                                      setSelectedToolIds(prev =>
                                        prev.includes(tool.id)
                                          ? prev.filter(id => id !== tool.id)
                                          : [...prev, tool.id],
                                      )
                                    }}
                                  />
                                  <div className="flex-1 space-y-1.5 min-w-0">
                                    <div className="flex items-center gap-2 min-w-0">
                                      {IconComponent && (
                                        <IconComponent
                                          size={16}
                                          className="text-gray-500 dark:text-gray-400 shrink-0"
                                        />
                                      )}
                                      <div
                                        className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate flex-1"
                                        title={t(TOOL_TRANSLATION_KEYS[tool.name] || tool.name)}
                                      >
                                        {t(TOOL_TRANSLATION_KEYS[tool.name] || tool.name)}
                                      </div>
                                    </div>
                                    {(infoKey || tool.description) && (
                                      <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed truncate-2-lines">
                                        {infoKey ? t(infoKey) : tool.description}
                                      </div>
                                    )}
                                  </div>
                                </label>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="h-16 border-t border-gray-200 dark:border-zinc-800 flex items-center justify-between px-6 shrink-0 bg-white dark:bg-[#191a1a]">
            {editingAgent && onDelete && !editingAgent.isDefault ? (
              <button
                onClick={() => {
                  showConfirmation({
                    title: t('confirmation.deleteAgentTitle') || 'Delete Agent',
                    message:
                      t('confirmation.deleteAgentMessage', { name: editingAgent.name }) ||
                      `Are you sure you want to delete ${editingAgent.name}?`,
                    confirmText: t('agents.actions.delete'),
                    isDangerous: true,
                    onConfirm: () => onDelete(editingAgent.id),
                  })
                }}
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
    </div>
  )
}

export default AgentModal
