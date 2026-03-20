import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  X,
  Info,
  Check,
  ChevronDown,
  RefreshCw,
  Upload,
  Trash2,
  Search,
  GraduationCap,
  Eye,
  Calculator,
  Clock,
  FileText,
  ScanText,
  Wrench,
  Code,
  FormInput,
  Globe,
  LineChart,
  Newspaper,
  Video,
  Youtube,
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
import AgentAvatar from './AgentAvatar'
import AgentBannerSurface, { AGENT_BANNER_ASPECT_RATIO } from './AgentBannerSurface'
import CustomEmojiPicker from './CustomEmojiPicker'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import clsx from 'clsx'
import { getModelsForProvider } from '../lib/models_api'
import { useAppContext } from '../App'
import { loadSettings, getBackendUrl } from '../lib/settings'
import {
  DEEP_RESEARCH_AGENT_DESCRIPTION,
  DEEP_RESEARCH_AGENT_NAME,
  DEEP_RESEARCH_AGENT_PROMPT,
  DEEP_RESEARCH_PROFILE,
} from '../lib/deepResearchDefaults'
import { SILICONFLOW_BASE_URL } from '../lib/providerConstants'
import { getModelIcon, getModelIconClassName, renderProviderIcon } from '../lib/modelIcons'
import { getProvider } from '../lib/providers'
import { FALLBACK_MODEL_OPTIONS, PROVIDER_KEYS } from '../lib/modelConstants'
import { getPublicEnv } from '../lib/publicEnv'
import { listToolsViaBackend } from '../lib/backendClient'
import { getUserTools } from '../lib/userToolsService'
import { TOOL_TRANSLATION_KEYS, TOOL_ICONS, TOOL_INFO_KEYS } from '../lib/toolConstants'
import { compressImage } from '../lib/imageCompression'
import {
  AGENT_AVATAR_SHAPE_CIRCLE,
  AGENT_AVATAR_SHAPE_ROUNDED,
  AGENT_AVATAR_TYPE_EMOJI,
  AGENT_AVATAR_TYPE_IMAGE,
  AGENT_BANNER_MODE_MANUAL,
  AGENT_BANNER_MODE_NONE,
} from '../lib/agentAppearance'
import {
  MODAL_INPUT_CLASS,
  MODAL_SELECT_TRIGGER_CLASS,
  MODAL_TEXTAREA_CLASS,
  MODAL_TEXTAREA_MONO_CLASS,
} from '../lib/modalFieldStyles'
import DotLoader from './DotLoader'

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
  openRouterKey: getPublicEnv('PUBLIC_OPENROUTER_API_KEY'),
  liteLLMKey: getPublicEnv('PUBLIC_LITELLM_API_KEY'),
  liteLLMBaseUrl: getPublicEnv('PUBLIC_LITELLM_BASE_URL'),
  huggingFaceKey: getPublicEnv('PUBLIC_HUGGINGFACE_API_KEY'),
  googleApiKey: getPublicEnv('PUBLIC_GOOGLE_API_KEY'),
  siliconFlowKey: getPublicEnv('PUBLIC_SILICONFLOW_API_KEY'),
  glmKey: getPublicEnv('PUBLIC_GLM_API_KEY'),
  deepseekKey: getPublicEnv('PUBLIC_DEEPSEEK_API_KEY'),
  volcengineKey: getPublicEnv('PUBLIC_VOLCENGINE_API_KEY'),
  modelscopeKey: getPublicEnv('PUBLIC_MODELSCOPE_API_KEY'),
  kimiKey: getPublicEnv('PUBLIC_KIMI_API_KEY'),
}

const TOOL_API_REQUIREMENTS = {
  bing_image_search: { key: 'serpapiApiKey', providerLabel: 'SerpApi' },
  google_image_search: { key: 'serpapiApiKey', providerLabel: 'SerpApi' },
  serpapi_image_search: { key: 'serpapiApiKey', providerLabel: 'SerpApi' },
  search_youtube: { key: 'serpapiApiKey', providerLabel: 'SerpApi' },
}

const HIDDEN_AGENT_TOOL_IDS = new Set([
  'web_search',
  'search_news',
  'search_arxiv_and_return_articles',
  'search_wikipedia',
  'execute_skill_script',
  'install_skill_dependency',
])

const AgentModal = ({ isOpen, onClose, editingAgent = null, onSave, onDelete }) => {
  const { t } = useTranslation()
  const { defaultAgent, agents = [], showConfirmation } = useAppContext()
  useScrollLock(isOpen)
  const isDefaultAgent = Boolean(editingAgent?.isDefault)
  const isDeepResearchAgent = Boolean(editingAgent?.isDeepResearchSystem)
  const isNameLocked = Boolean(isDefaultAgent || isDeepResearchAgent)
  const isDescriptionLocked = Boolean(isDeepResearchAgent)
  const isAvatarLocked = false
  const isBannerLocked = false
  const isModelLocked = false
  const isPersonalizationLocked = Boolean(isDeepResearchAgent)
  const isToolsLocked = Boolean(isDeepResearchAgent)
  const isSkillsLocked = Boolean(isDeepResearchAgent)

  const [activeTab, setActiveTab] = useState('general')

  // General Tab
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [prompt, setPrompt] = useState('')
  const [emoji, setEmoji] = useState('🤖')
  const [avatarType, setAvatarType] = useState(AGENT_AVATAR_TYPE_EMOJI)
  const [avatarImage, setAvatarImage] = useState('')
  const [avatarShape, setAvatarShape] = useState(AGENT_AVATAR_SHAPE_CIRCLE)
  const [bannerMode, setBannerMode] = useState(AGENT_BANNER_MODE_NONE)
  const [bannerImage, setBannerImage] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [avatarCropSource, setAvatarCropSource] = useState('')
  const [avatarCropMeta, setAvatarCropMeta] = useState(null)
  const [avatarCropZoom, setAvatarCropZoom] = useState(1)
  const [avatarCropOffsetX, setAvatarCropOffsetX] = useState(0)
  const [avatarCropOffsetY, setAvatarCropOffsetY] = useState(0)
  const [isAvatarCropping, setIsAvatarCropping] = useState(false)
  const [avatarDragState, setAvatarDragState] = useState(null)
  const [bannerCropSource, setBannerCropSource] = useState('')
  const [bannerCropMeta, setBannerCropMeta] = useState(null)
  const [bannerCropZoom, setBannerCropZoom] = useState(1)
  const [bannerCropOffsetX, setBannerCropOffsetX] = useState(0)
  const [bannerCropOffsetY, setBannerCropOffsetY] = useState(0)
  const [isBannerCropping, setIsBannerCropping] = useState(false)
  const [bannerDragState, setBannerDragState] = useState(null)
  const [isBannerPreviewOpen, setIsBannerPreviewOpen] = useState(false)

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
  const [globalDefaultModel, setGlobalDefaultModel] = useState('')
  const [globalLiteModel, setGlobalLiteModel] = useState('')
  const [useGlobalModelSettings, setUseGlobalModelSettings] = useState(true)

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
  const [apiAvailability, setApiAvailability] = useState({})

  // Skills Tab
  const [availableSkills, setAvailableSkills] = useState([])
  const [skillsLoading, setSkillsLoading] = useState(false)
  const [selectedSkillIds, setSelectedSkillIds] = useState([])

  const refreshApiAvailability = () => {
    const settings = loadSettings()
    const next = {}
    for (const [toolName, requirement] of Object.entries(TOOL_API_REQUIREMENTS)) {
      const rawValue = settings?.[requirement.key]
      next[toolName] = typeof rawValue === 'string' ? rawValue.trim().length > 0 : Boolean(rawValue)
    }
    setApiAvailability(next)
  }

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
  const avatarInputRef = useRef(null)
  const bannerInputRef = useRef(null)
  const avatarCropFrameRef = useRef(null)
  const bannerCropFrameRef = useRef(null)
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

  const cropViewportSize = 280
  const bannerViewportWidth = 520
  const bannerViewportHeight = 188
  const avatarPreviewLayout = useMemo(() => {
    const width = Number(avatarCropMeta?.width || 0)
    const height = Number(avatarCropMeta?.height || 0)
    if (!width || !height) return null
    const scale = Math.max(cropViewportSize / width, cropViewportSize / height)
    const baseWidth = width * scale
    const baseHeight = height * scale
    const renderedWidth = baseWidth * avatarCropZoom
    const renderedHeight = baseHeight * avatarCropZoom
    const maxOffsetX = Math.max(0, (renderedWidth - cropViewportSize) / 2)
    const maxOffsetY = Math.max(0, (renderedHeight - cropViewportSize) / 2)
    return { baseWidth, baseHeight, renderedWidth, renderedHeight, maxOffsetX, maxOffsetY }
  }, [avatarCropMeta?.height, avatarCropMeta?.width, avatarCropZoom])
  const bannerPreviewLayout = useMemo(() => {
    const width = Number(bannerCropMeta?.width || 0)
    const height = Number(bannerCropMeta?.height || 0)
    if (!width || !height) return null
    const scale = Math.max(bannerViewportWidth / width, bannerViewportHeight / height)
    const baseWidth = width * scale
    const baseHeight = height * scale
    const renderedWidth = baseWidth * bannerCropZoom
    const renderedHeight = baseHeight * bannerCropZoom
    const maxOffsetX = Math.max(0, (renderedWidth - bannerViewportWidth) / 2)
    const maxOffsetY = Math.max(0, (renderedHeight - bannerViewportHeight) / 2)
    return { baseWidth, baseHeight, renderedWidth, renderedHeight, maxOffsetX, maxOffsetY }
  }, [bannerCropMeta?.height, bannerCropMeta?.width, bannerCropZoom])

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
          subGroupKey = tool.config?.serverName || t('agents.tools.unknownServer')
        } else {
          // All HTTP tools in one group
          subGroupKey = t('agents.tools.httpCustomGroup')
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
  }, [availableTools, t])

  const getToolApiRequirement = tool => TOOL_API_REQUIREMENTS[String(tool?.name || '')] || null
  const isToolUnavailable = tool => {
    const requirement = getToolApiRequirement(tool)
    if (!requirement) return false
    return !apiAvailability[String(tool?.name || '')]
  }
  const getToolUnavailableHint = tool => {
    const requirement = getToolApiRequirement(tool)
    if (!requirement) return ''
    return t('agents.tools.apiRequiredHint', { provider: requirement.providerLabel })
  }

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

      const hiddenAgentTools = validSystemTools.filter(tool =>
        HIDDEN_AGENT_TOOL_IDS.has(String(tool.id || tool.name)),
      )
      searchToolIdSetRef.current = new Set(
        hiddenAgentTools.map(tool => String(tool.id || tool.name)),
      )
      const filteredSystemTools = validSystemTools.filter(tool => {
        const toolId = String(tool.id || tool.name)
        return !searchToolIdSetRef.current.has(toolId)
      })

      setAvailableTools([...filteredSystemTools, ...validUserTools])
      setSelectedToolIds(prev => prev.filter(id => !searchToolIdSetRef.current.has(String(id))))
    } catch (err) {
      console.error('Failed to load tools list:', err)
      setAvailableTools([])
    } finally {
      setToolsLoading(false)
    }
  }

  const loadSkillsList = async () => {
    setSkillsLoading(true)
    try {
      const res = await fetch(`${getBackendUrl()}/api/skills`)
      if (res.ok) {
        const data = await res.json()
        setAvailableSkills(data)
      } else {
        setAvailableSkills([])
      }
    } catch (err) {
      console.error('Failed to load skills list:', err)
      setAvailableSkills([])
    } finally {
      setSkillsLoading(false)
    }
  }

  const loadKeysAndFetchModels = async () => {
    setIsLoadingModels(true)
    setModelsError('')
    const settings = loadSettings()
    const keys = {
      gemini: settings.googleApiKey,
      openai_compatibility: settings.OpenAICompatibilityKey,
      openrouter: settings.OpenRouterKey,
      litellm_openai: settings.LiteLLMKey,
      litellm_openai_url: settings.LiteLLMUrl,
      huggingface: settings.HuggingFaceKey,
      siliconflow: settings.SiliconFlowKey,
      glm: settings.GlmKey,
      deepseek: settings.DeepSeekKey,
      volcengine: settings.VolcengineKey,
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
      else if (key === 'openrouter')
        credentials = { apiKey: keys.openrouter, baseUrl: 'https://openrouter.ai/api/v1' }
      else if (key === 'litellm_openai')
        credentials = { apiKey: keys.litellm_openai, baseUrl: keys.litellm_openai_url }
      else if (key === 'huggingface') credentials = { apiKey: keys.huggingface }
      else if (key === 'siliconflow')
        credentials = { apiKey: keys.siliconflow, baseUrl: SILICONFLOW_BASE_URL }
      else if (key === 'glm') credentials = { apiKey: keys.glm }
      else if (key === 'deepseek')
        credentials = {
          apiKey: keys.deepseek,
          baseUrl: getPublicEnv('PUBLIC_DEEPSEEK_BASE_URL') || 'https://api.deepseek.com/v1',
        }
      else if (key === 'volcengine')
        credentials = {
          apiKey: keys.volcengine,
          baseUrl:
            getPublicEnv('PUBLIC_VOLCENGINE_BASE_URL') ||
            'https://ark.cn-beijing.volces.com/api/v3',
        }
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
        (key === 'openai_compatibility' && ENV_VARS.openAIKey) ||
        (key === 'openrouter' && ENV_VARS.openRouterKey) ||
        (key === 'litellm_openai' && ENV_VARS.liteLLMKey) ||
        (key === 'huggingface' && ENV_VARS.huggingFaceKey)

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
  }

  useEffect(() => {
    if (isOpen) {
      const settings = loadSettings()
      setFollowInterfaceLanguage(Boolean(settings.followInterfaceLanguage))
      setGlobalDefaultModel(settings.defaultModel || '')
      setGlobalLiteModel(settings.liteModel || '')
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
        setAvatarType(
          editingAgent?.avatarType === AGENT_AVATAR_TYPE_IMAGE && editingAgent?.avatarImage
            ? AGENT_AVATAR_TYPE_IMAGE
            : AGENT_AVATAR_TYPE_EMOJI,
        )
        setAvatarImage(editingAgent?.avatarImage || '')
        setAvatarShape(editingAgent?.avatarShape || AGENT_AVATAR_SHAPE_CIRCLE)
        setBannerMode(editingAgent?.bannerMode || AGENT_BANNER_MODE_NONE)
        setBannerImage(editingAgent?.bannerImage || '')
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
        setUseGlobalModelSettings(editingAgent?.useGlobalModelSettings ?? true)
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
        setAvatarType(AGENT_AVATAR_TYPE_EMOJI)
        setAvatarImage('')
        setAvatarShape(AGENT_AVATAR_SHAPE_CIRCLE)
        setBannerMode(AGENT_BANNER_MODE_NONE)
        setBannerImage('')
        setProvider(defaultAgent?.provider || 'gemini')
        const nextLiteModel = defaultAgent?.liteModel || ''
        const nextDefaultModel = defaultAgent?.defaultModel || ''
        setLiteModel(nextLiteModel)
        setDefaultModel(nextDefaultModel)
        setDefaultModelProvider(defaultAgent?.defaultModelProvider || defaultAgent?.provider || '')
        setLiteModelProvider(defaultAgent?.liteModelProvider || defaultAgent?.provider || '')
        setUseGlobalModelSettings(true)
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
        setSelectedSkillIds([])
      }
      if (editingAgent) {
        const incomingToolIds = editingAgent?.toolIds || editingAgent?.tool_ids || []
        setSelectedToolIds(incomingToolIds.filter(id => !HIDDEN_AGENT_TOOL_IDS.has(String(id))))
        setSelectedSkillIds(editingAgent?.skillIds || editingAgent?.skill_ids || [])
      }
      loadToolsList()
      loadSkillsList()
      setActiveTab('general')
      setError('')
      setAvatarCropSource('')
      setAvatarCropMeta(null)
      setAvatarCropZoom(1)
      setAvatarCropOffsetX(0)
      setAvatarCropOffsetY(0)
      setBannerCropSource('')
      setBannerCropMeta(null)
      setBannerCropZoom(1)
      setBannerCropOffsetX(0)
      setBannerCropOffsetY(0)
      setIsSaving(false)
      setDefaultTestState({ status: 'idle', message: '' })
      setLiteTestState({ status: 'idle', message: '' })

      // Load API keys and fetch models
      loadKeysAndFetchModels()
    }
  }, [isOpen, editingAgent, t, defaultAgent])

  useEffect(() => {
    if (!isOpen) return
    refreshApiAvailability()
    const handleSettingsChanged = () => refreshApiAvailability()
    const handleSkillsChanged = () => loadSkillsList()
    window.addEventListener('settings-changed', handleSettingsChanged)
    window.addEventListener('skills-changed', handleSkillsChanged)
    return () => {
      window.removeEventListener('settings-changed', handleSettingsChanged)
      window.removeEventListener('skills-changed', handleSkillsChanged)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || availableTools.length === 0) return
    const unavailableIds = new Set(
      availableTools.filter(tool => isToolUnavailable(tool)).map(tool => String(tool.id)),
    )
    if (unavailableIds.size === 0) return
    setSelectedToolIds(prev => prev.filter(id => !unavailableIds.has(String(id))))
  }, [isOpen, availableTools, apiAvailability])

  const loadImageMeta = source =>
    new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () =>
        resolve({
          image,
          width: image.naturalWidth || image.width,
          height: image.naturalHeight || image.height,
        })
      image.onerror = () => reject(new Error(t('agents.errors.loadImageFailed')))
      image.src = source
    })

  const clampCropOffset = (value, maxOffset) => {
    if (!Number.isFinite(value)) return 0
    return Math.min(maxOffset, Math.max(-maxOffset, value))
  }

  const openAvatarCropper = async source => {
    const meta = await loadImageMeta(source)
    setAvatarCropSource(source)
    setAvatarCropMeta(meta)
    setAvatarCropZoom(1)
    setAvatarCropOffsetX(0)
    setAvatarCropOffsetY(0)
  }

  const openBannerCropper = async source => {
    const meta = await loadImageMeta(source)
    setBannerCropSource(source)
    setBannerCropMeta(meta)
    setBannerCropZoom(1)
    setBannerCropOffsetX(0)
    setBannerCropOffsetY(0)
  }

  const handleAvatarUpload = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const { dataUrl } = await compressImage(file, {
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 0.92,
      })
      await openAvatarCropper(dataUrl)
    } catch (err) {
      setError(err?.message || t('agents.errors.avatarImageProcessFailed'))
    }
  }

  const handleBannerUpload = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const { dataUrl } = await compressImage(file, {
        maxWidth: 1800,
        maxHeight: 900,
        quality: 0.9,
      })
      await openBannerCropper(dataUrl)
    } catch (err) {
      setError(err?.message || t('agents.errors.bannerImageProcessFailed'))
    }
  }

  const handleApplyAvatarCrop = async () => {
    if (!avatarCropSource || !avatarPreviewLayout) return

    try {
      setIsAvatarCropping(true)
      const { image } = avatarCropMeta
      const outputSize = 512
      const canvas = document.createElement('canvas')
      canvas.width = outputSize
      canvas.height = outputSize
      const ctx = canvas.getContext('2d')
      const scale = outputSize / cropViewportSize
      const drawX =
        ((cropViewportSize - avatarPreviewLayout.renderedWidth) / 2 + avatarCropOffsetX) * scale
      const drawY =
        ((cropViewportSize - avatarPreviewLayout.renderedHeight) / 2 + avatarCropOffsetY) * scale

      ctx.clearRect(0, 0, outputSize, outputSize)
      ctx.drawImage(
        image,
        drawX,
        drawY,
        avatarPreviewLayout.renderedWidth * scale,
        avatarPreviewLayout.renderedHeight * scale,
      )

      setAvatarImage(canvas.toDataURL('image/jpeg', 0.92))
      setAvatarType(AGENT_AVATAR_TYPE_IMAGE)
      setAvatarCropSource('')
      setAvatarCropMeta(null)
    } catch (err) {
      setError(err?.message || t('agents.errors.avatarCropFailed'))
    } finally {
      setIsAvatarCropping(false)
    }
  }

  const handleApplyBannerCrop = async () => {
    if (!bannerCropSource || !bannerPreviewLayout) return

    try {
      setIsBannerCropping(true)
      const { image } = bannerCropMeta
      const outputWidth = 1560
      const outputHeight = 564
      const canvas = document.createElement('canvas')
      canvas.width = outputWidth
      canvas.height = outputHeight
      const ctx = canvas.getContext('2d')
      const scaleX = outputWidth / bannerViewportWidth
      const scaleY = outputHeight / bannerViewportHeight
      const drawX =
        ((bannerViewportWidth - bannerPreviewLayout.renderedWidth) / 2 + bannerCropOffsetX) * scaleX
      const drawY =
        ((bannerViewportHeight - bannerPreviewLayout.renderedHeight) / 2 + bannerCropOffsetY) *
        scaleY

      ctx.clearRect(0, 0, outputWidth, outputHeight)
      ctx.drawImage(
        image,
        drawX,
        drawY,
        bannerPreviewLayout.renderedWidth * scaleX,
        bannerPreviewLayout.renderedHeight * scaleY,
      )

      setBannerImage(canvas.toDataURL('image/jpeg', 0.92))
      setBannerMode(AGENT_BANNER_MODE_MANUAL)
      setBannerCropSource('')
      setBannerCropMeta(null)
    } catch (err) {
      setError(err?.message || t('agents.errors.bannerCropFailed'))
    } finally {
      setIsBannerCropping(false)
    }
  }

  useEffect(() => {
    if (!avatarDragState || !avatarPreviewLayout) return undefined

    const handlePointerMove = event => {
      setAvatarCropOffsetX(
        clampCropOffset(
          avatarDragState.startOffsetX + (event.clientX - avatarDragState.startX),
          avatarPreviewLayout.maxOffsetX,
        ),
      )
      setAvatarCropOffsetY(
        clampCropOffset(
          avatarDragState.startOffsetY + (event.clientY - avatarDragState.startY),
          avatarPreviewLayout.maxOffsetY,
        ),
      )
    }

    const handlePointerUp = () => {
      setAvatarDragState(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [avatarDragState, avatarPreviewLayout])

  useEffect(() => {
    if (!bannerDragState || !bannerPreviewLayout) return undefined

    const handlePointerMove = event => {
      setBannerCropOffsetX(
        clampCropOffset(
          bannerDragState.startOffsetX + (event.clientX - bannerDragState.startX),
          bannerPreviewLayout.maxOffsetX,
        ),
      )
      setBannerCropOffsetY(
        clampCropOffset(
          bannerDragState.startOffsetY + (event.clientY - bannerDragState.startY),
          bannerPreviewLayout.maxOffsetY,
        ),
      )
    }

    const handlePointerUp = () => {
      setBannerDragState(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [bannerDragState, bannerPreviewLayout])

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
        : isDefaultAgent
          ? editingAgent?.name || name.trim()
          : name.trim()
      const resolvedDescription = isDeepResearchAgent
        ? DEEP_RESEARCH_AGENT_DESCRIPTION
        : description.trim()
      const resolvedPrompt = isDeepResearchAgent ? DEEP_RESEARCH_AGENT_PROMPT : prompt.trim()
      const resolvedEmoji = isDeepResearchAgent ? emoji : emoji
      const resolvedAvatarType =
        avatarType === AGENT_AVATAR_TYPE_IMAGE && avatarImage
          ? AGENT_AVATAR_TYPE_IMAGE
          : AGENT_AVATAR_TYPE_EMOJI
      const resolvedAvatarImage = avatarImage
      const resolvedAvatarShape = avatarShape
      const resolvedBannerMode = bannerMode
      const resolvedBannerImage = resolvedBannerMode === AGENT_BANNER_MODE_MANUAL ? bannerImage : ''
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
        avatarType: resolvedAvatarType,
        avatarImage: resolvedAvatarImage,
        avatarShape: resolvedAvatarShape,
        bannerMode: resolvedBannerMode,
        bannerImage: resolvedBannerImage,
        provider: derivedProvider,
        defaultModelProvider: resolvedDefaultProvider,
        liteModelProvider: resolvedLiteProvider,
        liteModel,
        defaultModel,
        defaultModelSource,
        liteModelSource,
        useGlobalModelSettings,
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
        skillIds: selectedSkillIds,
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
    <div className="relative flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className={MODAL_SELECT_TRIGGER_CLASS}>
          <SelectValue>
            {options.find(o => (o.value || o) === value)?.label ||
              options.find(o => (o.value || o) === value) ||
              value}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="glass-elite-dropdown border-none">
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
    if (!text || typeof text !== 'string') return null
    const trimmed = text.trim()
    const cleaned = trimmed
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim()
    const normalizePythonishJson = input => {
      return input
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false')
        .replace(/\bNone\b/g, 'null')
        .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, value) => `"${value.replace(/"/g, '\\"')}"`)
    }
    try {
      return JSON.parse(cleaned)
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
      if (!match) return null
      const raw = match[0]
      try {
        return JSON.parse(raw)
      } catch {
        try {
          return JSON.parse(normalizePythonishJson(raw))
        } catch {
          return null
        }
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
        message: t('agents.model.testFailed', {
          message: err?.message || t('agents.errors.unknownError'),
        }),
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
        message: t('agents.model.testFailed', {
          message: err?.message || t('agents.errors.unknownError'),
        }),
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
    disabled = false,
    disabledDisplayValue = '',
  }) => {
    const providers = availableProviders
    const resolvedProvider = providers.includes(activeProvider)
      ? activeProvider
      : providers[0] || activeProvider
    const activeModels = groupedModels[resolvedProvider] || []
    const selectedLabel = getModelLabel(value)
    const showList = modelSource === 'list'
    const displayLabel = showList ? selectedLabel : customValue || value || t('agents.model.custom')
    const shownLabel = disabled && disabledDisplayValue ? disabledDisplayValue : displayLabel

    return (
      <div className={clsx('space-y-3', disabled && 'opacity-60')}>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="flex w-full flex-col gap-2 sm:w-auto">
            <div className="flex w-full flex-wrap items-center gap-3">
              <label className="shrink-0 text-sm font-medium text-gray-700 dark:text-gray-300">
                {label}
              </label>

              {/* Desktop: Inline Segmented Control */}
              <div className="hidden rounded-[18px] bg-black/5 p-1 sm:flex sm:gap-1.5 dark:bg-white/5">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onModelSourceChange('list')
                    const existsInList = activeModels.some(m => m.value === value)
                    if (!existsInList) onChange('')
                  }}
                  className={clsx(
                    'inline-flex h-9 items-center justify-center rounded-[14px] px-3.5 text-xs font-medium transition-all',
                    modelSource === 'list'
                      ? 'bg-white/90 text-gray-900 shadow-[0_1px_3px_rgba(15,23,42,0.08)] dark:bg-white/10 dark:text-gray-100'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300',
                    disabled && 'cursor-not-allowed opacity-60',
                  )}
                >
                  {t('agents.model.sourceList')}
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onModelSourceChange('custom')
                    const nextValue = value || customValue || ''
                    onCustomValueChange(nextValue)
                    onChange(nextValue)
                  }}
                  className={clsx(
                    'inline-flex h-9 items-center justify-center rounded-[14px] px-3.5 text-xs font-medium transition-all',
                    modelSource === 'custom'
                      ? 'bg-white/90 text-gray-900 shadow-[0_1px_3px_rgba(15,23,42,0.08)] dark:bg-white/10 dark:text-gray-100'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300',
                    disabled && 'cursor-not-allowed opacity-60',
                  )}
                >
                  {t('agents.model.sourceCustom')}
                </button>
              </div>

              {testAction && (
                <button
                  type="button"
                  onClick={testAction.onClick}
                  disabled={disabled || testAction.status === 'loading'}
                  className="bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 border-primary-200 dark:border-primary-800 hover:bg-primary-100 dark:hover:bg-primary-900/40 ml-auto flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 sm:ml-0"
                >
                  {testAction.status === 'loading' && (
                    <RefreshCw size={12} className="animate-spin" />
                  )}
                  {testAction.status === 'loading' ? t('agents.model.testing') : testAction.label}
                </button>
              )}
            </div>

            {/* Mobile: Full Width Segmented Control */}
            <div className="flex w-full gap-1.5 rounded-[18px] bg-black/5 p-1 sm:hidden dark:bg-white/5">
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  onModelSourceChange('list')
                  const existsInList = activeModels.some(m => m.value === value)
                  if (!existsInList) onChange('')
                }}
                className={clsx(
                  'inline-flex h-9 flex-1 items-center justify-center rounded-[14px] text-xs font-medium transition-all',
                  modelSource === 'list'
                    ? 'bg-white/90 text-gray-900 shadow-[0_1px_3px_rgba(15,23,42,0.08)] dark:bg-white/10 dark:text-gray-100'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300',
                  disabled && 'cursor-not-allowed opacity-60',
                )}
              >
                {t('agents.model.sourceList')}
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  onModelSourceChange('custom')
                  const nextValue = value || customValue || ''
                  onCustomValueChange(nextValue)
                  onChange(nextValue)
                }}
                className={clsx(
                  'inline-flex h-9 flex-1 items-center justify-center rounded-[14px] text-xs font-medium transition-all',
                  modelSource === 'custom'
                    ? 'bg-white/90 text-gray-900 shadow-[0_1px_3px_rgba(15,23,42,0.08)] dark:bg-white/10 dark:text-gray-100'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300',
                  disabled && 'cursor-not-allowed opacity-60',
                )}
              >
                {t('agents.model.sourceCustom')}
              </button>
            </div>

            {testAction?.message && (
              <p
                className={clsx(
                  'flex items-center gap-1.5 text-xs',
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
          <span
            title={shownLabel}
            className="mt-1 w-full text-left text-xs break-all text-gray-500 sm:mt-0 sm:w-auto sm:max-w-[320px] sm:text-right dark:text-gray-400"
          >
            {shownLabel}
          </span>
        </div>
        {hint && <p className="max-w-2xl text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
        <div
          className={clsx(
            'rounded-lg border-none bg-black/5 p-3 dark:bg-white/5',
            disabled && 'pointer-events-none bg-gray-50/70 dark:bg-zinc-900/70',
          )}
        >
          <div className="flex flex-col gap-3">
            {!hideProviderSelector && (
              <div className="relative flex flex-col gap-2">
                <span className="text-xs font-semibold tracking-wide text-gray-400 uppercase">
                  {t('agents.model.providers')}
                </span>
                <Select
                  value={resolvedProvider}
                  onValueChange={val => {
                    onProviderChange(val)
                    if (modelSource === 'list' && val !== activeProvider) {
                      onChange('')
                    }
                  }}
                  disabled={disabled || !providers.length}
                >
                  <SelectTrigger className={MODAL_SELECT_TRIGGER_CLASS}>
                    <SelectValue>
                      {resolvedProvider ? (
                        <div className="flex items-center gap-3">
                          {renderProviderIcon(resolvedProvider, {
                            size: 16,
                            alt: t(`settings.providers.${resolvedProvider}`),
                          })}
                          <span>{t(`settings.providers.${resolvedProvider}`)}</span>
                        </div>
                      ) : (
                        <span>{t('agents.model.noProviders')}</span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="glass-elite-dropdown border-none">
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
              <span className="text-xs font-semibold tracking-wide text-gray-400 uppercase">
                {t('agents.model.models')}
              </span>
              {showList ? (
                <Select
                  value={value || (allowEmpty ? '__none__' : undefined)}
                  onValueChange={val => onChange(val === '__none__' ? '' : val)}
                  disabled={disabled || (!activeModels.length && !allowEmpty)}
                >
                  <SelectTrigger className={MODAL_SELECT_TRIGGER_CLASS}>
                    <SelectValue placeholder={t('agents.model.notSelected')}>
                      <div className="flex items-center gap-2 truncate">
                        {getModelIcon(value) && (
                          <img
                            src={getModelIcon(value)}
                            alt=""
                            className={clsx('h-4 w-4 shrink-0', getModelIconClassName(value))}
                          />
                        )}
                        <span className="truncate">
                          {value === ''
                            ? label === t('agents.model.defaultModel')
                              ? globalDefaultModel
                                ? `${t('agents.model.none')} (${t('settings.defaultModel')}: ${globalDefaultModel})`
                                : t('agents.model.none')
                              : globalLiteModel
                                ? `${t('agents.model.none')} (${t('settings.liteModel')}: ${globalLiteModel})`
                                : t('agents.model.none')
                            : activeModels.find(m => m.value === value)?.label ||
                              value ||
                              t('agents.model.notSelected')}
                        </span>
                      </div>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="glass-elite-dropdown border-none">
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
                                className={clsx('h-4 w-4', getModelIconClassName(model.value))}
                              />
                            )}
                            <span className="truncate">{model.label}</span>
                          </div>
                        </SelectItem>
                      ))
                    ) : (
                      <div className="px-2 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                        {t('agents.model.noModels')}
                      </div>
                    )}
                  </SelectContent>
                </Select>
              ) : (
                <input
                  value={customValue}
                  disabled={disabled}
                  onChange={e => {
                    const nextValue = e.target.value
                    onCustomValueChange(nextValue)
                    onChange(nextValue)
                  }}
                  placeholder={t('agents.model.customPlaceholder')}
                  className={MODAL_INPUT_CLASS}
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
              <span className="rounded-md bg-black/5 px-2 py-0.5 font-mono text-xs text-gray-500 dark:bg-white/10 dark:text-gray-400">
                {param}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{description}</p>
          </div>
          <Switch
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
            className="flex-1 cursor-pointer accent-black disabled:opacity-40 dark:accent-white"
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
            className={`${MODAL_INPUT_CLASS} w-20`}
          />
        </div>
      </div>
    )
  }

  if (!isOpen) return null

  const displayName = isDefaultAgent
    ? t('agents.defaults.name')
    : isDeepResearchAgent
      ? t('deepResearch.agentName')
      : name
  const displayDescription = isDeepResearchAgent ? t('deepResearch.agentDescription') : description
  const previewProviderId = provider || defaultModelProvider || 'gemini'
  const previewProvider = getProvider(previewProviderId)
  const previewProviderLabel =
    previewProvider?.name || previewProviderId || t('agents.preview.providerFallback')
  const previewProviderFallback = previewProviderLabel
  const previewModel = defaultModel || t('agents.preview.defaultModelFallback')
  const previewAgent = {
    emoji,
    avatarType,
    avatarImage,
    avatarShape,
    name: displayName,
  }
  const compactSegmentGroupClassName =
    'grid grid-cols-2 gap-1 rounded-lg bg-black/5 p-1 dark:bg-white/5'
  const compactSegmentButtonClassName =
    'inline-flex h-10 items-center justify-center rounded-lg px-3.5 text-[13px] font-medium transition-all'
  const compactActionButtonClassName =
    'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white/85 px-3.5 text-[13px] font-medium text-gray-700 shadow-[0_1px_3px_rgba(15,23,42,0.08)] transition-all hover:bg-white hover:text-gray-900 hover:shadow-[0_4px_10px_rgba(15,23,42,0.12)] disabled:cursor-not-allowed disabled:opacity-50 sm:justify-start dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10'
  const compactDangerButtonClassName =
    'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 text-[13px] font-medium text-red-600 shadow-[0_1px_3px_rgba(220,38,38,0.12)] transition-all hover:bg-red-100 hover:text-red-700 hover:shadow-[0_4px_10px_rgba(220,38,38,0.18)] disabled:cursor-not-allowed disabled:opacity-50 sm:justify-start dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/30'
  const bannerActionButtonClassName = compactActionButtonClassName
  const bannerDangerButtonClassName = compactDangerButtonClassName
  const tabItems = [
    { id: 'general', icon: Settings, description: t('agents.tabDescriptions.general') },
    { id: 'model', icon: Box, description: t('agents.tabDescriptions.model') },
    {
      id: 'personalization',
      icon: User,
      description: t('agents.tabDescriptions.personalization'),
    },
    { id: 'tools', icon: Wrench, description: t('agents.tabDescriptions.tools') },
    { id: 'skills', icon: GraduationCap, description: t('agents.tabDescriptions.skills') },
  ]
  const activeTabMeta = tabItems.find(item => item.id === activeTab) || tabItems[0]
  const responseLanguageOptions = LLM_ANSWER_LANGUAGE_KEYS.map(value => ({
    value,
    label: t(`agents.personalization.languageOptions.${value}`, value),
  }))

  return createPortal(
    <div className="modal-overlay-shell">
      <div className="modal-surface-shell modal-surface-shell-wide">
        {/* Mobile Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-black/5 bg-transparent px-4 md:hidden dark:border-white/5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {editingAgent ? t('agents.modal.edit') : t('agents.modal.create')}
          </h3>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X size={20} />
          </button>
        </div>

        {/* Sidebar / Tabs */}
        <div className="no-scrollbar flex w-full shrink-0 flex-row gap-2 overflow-x-auto border-b border-black/5 bg-transparent px-2 py-2 sm:px-4 sm:py-4 md:w-[280px] md:flex-col md:overflow-visible md:border-r md:border-b-0 md:px-4 md:py-5 dark:border-white/5">
          <h2 className="mb-0 hidden px-2 text-[2rem] font-semibold text-gray-900 md:mb-6 md:block dark:text-white">
            {editingAgent ? t('agents.modal.edit') : t('agents.modal.create')}
          </h2>
          <nav className="flex w-full flex-row gap-1 md:w-auto md:flex-col">
            {tabItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={clsx(
                  'flex min-h-10 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-all sm:gap-3 md:min-h-11 md:px-3.5',
                  activeTab === item.id
                    ? 'bg-black/6 text-gray-950 dark:bg-white/10 dark:text-white'
                    : 'text-gray-500 hover:bg-black/4 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/6 dark:hover:text-white',
                )}
              >
                <item.icon size={17} className="shrink-0" />
                <span className="truncate">{t(`agents.tabs.${item.id}`)}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-transparent">
          <div className="hidden border-b border-black/5 px-4 py-5 sm:block sm:px-10 dark:border-white/5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
                  {t(`agents.tabs.${activeTabMeta.id}`)}
                </h3>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-gray-500 dark:text-gray-400">
                  {activeTabMeta.description}
                </p>
              </div>
              <button
                onClick={onClose}
                className="hidden rounded-full p-2 text-gray-500 transition-colors hover:bg-black/5 md:block dark:hover:bg-white/10"
              >
                <X size={20} />
              </button>
            </div>
            {(error || modelsError) && (
              <div className="mt-4 rounded-2xl border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                {error || modelsError}
              </div>
            )}
          </div>

          <div
            className="no-scrollbar modal-content-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07)] sm:px-10 sm:py-8"
            style={{ scrollbarGutter: 'stable' }}
          >
            {activeTab === 'general' && (
              <div className="flex min-h-full flex-col gap-10">
                <div className="flex flex-col gap-2">
                  <label className="mb-2 text-base font-semibold tracking-tight text-gray-900 dark:text-white">
                    {t('agents.general.avatarSettings')}
                  </label>
                  <div className="border-t border-black/5 pt-6 dark:border-white/5">
                    <div className="flex flex-col gap-4">
                      <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-4">
                        <AgentAvatar
                          agent={{ emoji, avatarType, avatarImage, avatarShape, name: displayName }}
                          size="4rem"
                          className="shrink-0 self-start border border-black/8 bg-white/70 shadow-sm sm:h-18 sm:w-18 dark:border-white/10 dark:bg-white/5"
                        />
                        <div className="min-w-0">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                              <div className="text-sm font-medium text-gray-900 dark:text-white">
                                {t('agents.general.avatarType')}
                              </div>
                              <div className={compactSegmentGroupClassName}>
                                <button
                                  type="button"
                                  disabled={isAvatarLocked}
                                  onClick={() => setAvatarType(AGENT_AVATAR_TYPE_EMOJI)}
                                  className={clsx(
                                    compactSegmentButtonClassName,
                                    avatarType === AGENT_AVATAR_TYPE_EMOJI
                                      ? 'bg-white/90 text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:bg-white/10 dark:text-white'
                                      : 'text-gray-500 dark:text-gray-400',
                                    isAvatarLocked && 'cursor-not-allowed opacity-50',
                                  )}
                                >
                                  {t('agents.general.avatarTypeEmoji')}
                                </button>
                                <button
                                  type="button"
                                  disabled={isAvatarLocked}
                                  onClick={() => setAvatarType(AGENT_AVATAR_TYPE_IMAGE)}
                                  className={clsx(
                                    compactSegmentButtonClassName,
                                    avatarType === AGENT_AVATAR_TYPE_IMAGE
                                      ? 'bg-white/90 text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:bg-white/10 dark:text-white'
                                      : 'text-gray-500 dark:text-gray-400',
                                    isAvatarLocked && 'cursor-not-allowed opacity-50',
                                  )}
                                >
                                  {t('agents.general.avatarTypeImage')}
                                </button>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="text-sm font-medium text-gray-900 dark:text-white">
                                {t('agents.general.avatarShape')}
                              </div>
                              <div className={compactSegmentGroupClassName}>
                                <button
                                  type="button"
                                  disabled={isAvatarLocked}
                                  onClick={() => setAvatarShape(AGENT_AVATAR_SHAPE_ROUNDED)}
                                  className={clsx(
                                    compactSegmentButtonClassName,
                                    avatarShape === AGENT_AVATAR_SHAPE_ROUNDED
                                      ? 'bg-white/90 text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:bg-white/10 dark:text-white'
                                      : 'text-gray-500 dark:text-gray-400',
                                    isAvatarLocked && 'cursor-not-allowed opacity-50',
                                  )}
                                >
                                  {t('agents.general.avatarShapeRounded')}
                                </button>
                                <button
                                  type="button"
                                  disabled={isAvatarLocked}
                                  onClick={() => setAvatarShape(AGENT_AVATAR_SHAPE_CIRCLE)}
                                  className={clsx(
                                    compactSegmentButtonClassName,
                                    avatarShape === AGENT_AVATAR_SHAPE_CIRCLE
                                      ? 'bg-white/90 text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:bg-white/10 dark:text-white'
                                      : 'text-gray-500 dark:text-gray-400',
                                    isAvatarLocked && 'cursor-not-allowed opacity-50',
                                  )}
                                >
                                  {t('agents.general.avatarShapeCircle')}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
                        <div className="flex flex-col gap-2">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {t('agents.general.name')}
                          </label>
                          <input
                            value={displayName}
                            onChange={e => setName(e.target.value)}
                            placeholder={t('agents.general.namePlaceholder')}
                            disabled={isNameLocked}
                            className={MODAL_INPUT_CLASS}
                          />
                        </div>

                        {avatarType === AGENT_AVATAR_TYPE_EMOJI ? (
                          <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              {t('agents.general.emojiAvatar')}
                            </label>
                            <div className="relative inline-block w-full sm:w-fit">
                              <button
                                ref={buttonRef}
                                type="button"
                                onClick={() => {
                                  if (isAvatarLocked) return
                                  setShowEmojiPicker(!showEmojiPicker)
                                }}
                                disabled={isAvatarLocked}
                                className={clsx(
                                  compactActionButtonClassName,
                                  'w-full disabled:bg-gray-50/20 sm:w-auto',
                                )}
                              >
                                {/* <AgentAvatar agent={{ emoji }} size="1.6rem" /> */}
                                <span>{t('agents.general.chooseEmoji')}</span>
                              </button>
                              {showEmojiPicker && (
                                <div
                                  ref={pickerRef}
                                  className="absolute top-full left-0 z-50 mt-2 overflow-hidden rounded-xl shadow-2xl"
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
                        ) : (
                          <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              {t('agents.general.imageAvatar')}
                            </label>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={isAvatarLocked}
                                onClick={() => avatarInputRef.current?.click()}
                                className={compactActionButtonClassName}
                              >
                                <Upload size={16} />
                                {t('agents.general.uploadImage')}
                              </button>
                              {avatarImage && (
                                <>
                                  <button
                                    type="button"
                                    disabled={isAvatarLocked}
                                    onClick={() =>
                                      openAvatarCropper(avatarImage).catch(err =>
                                        setError(err.message),
                                      )
                                    }
                                    className={compactActionButtonClassName}
                                  >
                                    {t('agents.general.recrop')}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isAvatarLocked}
                                    onClick={() => {
                                      setAvatarImage('')
                                      setAvatarType(AGENT_AVATAR_TYPE_EMOJI)
                                    }}
                                    className={compactDangerButtonClassName}
                                  >
                                    <Trash2 size={16} />
                                    {t('agents.general.remove')}
                                  </button>
                                </>
                              )}
                            </div>
                            <input
                              ref={avatarInputRef}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={handleAvatarUpload}
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {t('agents.general.avatarHelp')}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="mb-2 text-base font-semibold tracking-tight text-gray-900 dark:text-white">
                    {t('agents.general.description')}
                  </label>
                  <div className="border-t border-black/5 pt-6 dark:border-white/5">
                    <input
                      value={displayDescription}
                      onChange={e => setDescription(e.target.value)}
                      placeholder={t('agents.general.descriptionPlaceholder')}
                      disabled={isDescriptionLocked}
                      className={MODAL_INPUT_CLASS}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="mb-2 text-base font-semibold tracking-tight text-gray-900 dark:text-white">
                    {t('agents.general.bannerTitle')}
                  </label>
                  <div className="border-t border-black/5 pt-6 dark:border-white/5">
                    <div className="rounded-xl border border-black/5 bg-black/3 p-4 dark:border-white/5 dark:bg-white/3">
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] lg:items-start">
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {t('agents.general.bannerDisplayMode')}
                            </div>
                            <div className={compactSegmentGroupClassName}>
                              {[
                                {
                                  value: AGENT_BANNER_MODE_NONE,
                                  label: t('agents.general.bannerModeNone'),
                                },
                                {
                                  value: AGENT_BANNER_MODE_MANUAL,
                                  label: t('agents.general.bannerModeManual'),
                                },
                              ].map(option => (
                                <button
                                  key={option.value}
                                  type="button"
                                  disabled={isBannerLocked}
                                  onClick={() => setBannerMode(option.value)}
                                  className={clsx(
                                    compactSegmentButtonClassName,
                                    bannerMode === option.value
                                      ? 'bg-white/90 text-gray-900 shadow-[0_1px_3px_rgba(15,23,42,0.08)] dark:bg-white/10 dark:text-white'
                                      : 'text-gray-500 dark:text-gray-400',
                                    isBannerLocked && 'cursor-not-allowed opacity-50',
                                  )}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                            {t('agents.general.bannerHelp')}
                          </p>
                          {bannerMode === AGENT_BANNER_MODE_MANUAL && (
                            <div className="grid gap-1.5 sm:flex sm:flex-wrap sm:items-center">
                              <button
                                type="button"
                                disabled={isBannerLocked}
                                onClick={() => bannerInputRef.current?.click()}
                                className={bannerActionButtonClassName}
                              >
                                <Upload size={16} />
                                {t('agents.general.selectBanner')}
                              </button>
                              {bannerImage && (
                                <>
                                  <button
                                    type="button"
                                    disabled={isBannerLocked}
                                    onClick={() =>
                                      openBannerCropper(bannerImage).catch(err =>
                                        setError(err.message),
                                      )
                                    }
                                    className={bannerActionButtonClassName}
                                  >
                                    {t('agents.general.recrop')}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBannerLocked}
                                    onClick={() => setIsBannerPreviewOpen(true)}
                                    className={bannerActionButtonClassName}
                                  >
                                    <Eye size={16} />
                                    {t('agents.general.previewBanner')}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBannerLocked}
                                    onClick={() => {
                                      setBannerImage('')
                                      setIsBannerPreviewOpen(false)
                                    }}
                                    className={bannerDangerButtonClassName}
                                  >
                                    <Trash2 size={16} />
                                    {t('agents.general.removeBanner')}
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                          <input
                            ref={bannerInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleBannerUpload}
                          />
                        </div>
                        <div>
                          {bannerImage ? (
                            <div className="overflow-hidden rounded-[24px] border border-black/8 bg-white/70 dark:border-white/10 dark:bg-white/4">
                              <div style={{ aspectRatio: String(AGENT_BANNER_ASPECT_RATIO) }}>
                                <img
                                  src={bannerImage}
                                  alt={t('agents.general.bannerImageAlt')}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="flex min-h-36 items-center justify-center rounded-[24px] border border-dashed border-black/10 bg-white/30 px-5 text-center text-sm text-gray-500 dark:border-white/10 dark:bg-white/2 dark:text-gray-400">
                              {t('agents.general.bannerEmpty')}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex min-h-64 flex-1 flex-col gap-2">
                  <label className="mb-2 text-base font-semibold tracking-tight text-gray-900 dark:text-white">
                    {t('agents.general.systemPrompt')}
                  </label>
                  <div className="border-t border-black/5 pt-6 dark:border-white/5">
                    <textarea
                      value={prompt}
                      onChange={e => setPrompt(e.target.value)}
                      placeholder={t('agents.general.systemPromptPlaceholder')}
                      rows={8}
                      disabled={isDeepResearchAgent}
                      className={`min-h-64 flex-1 resize-y leading-6 ${MODAL_TEXTAREA_MONO_CLASS}`}
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'model' && (
              <div className="space-y-6">
                <div className="flex gap-3 rounded-lg bg-blue-50 p-4 text-sm text-blue-700 dark:bg-blue-900/10 dark:text-blue-300">
                  <Info size={18} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">{t('agents.model.crossProviderTitle')}</p>
                    <p className="opacity-90">{t('agents.model.crossProviderHint')}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {t('agents.model.useGlobal')}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {t('agents.model.useGlobalHint')}
                    </span>
                  </div>
                  <Switch
                    checked={useGlobalModelSettings}
                    disabled={isModelLocked}
                    onCheckedChange={checked => setUseGlobalModelSettings(Boolean(checked))}
                  />
                </div>

                {isLoadingModels ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-gray-500">
                    <DotLoader />
                  </div>
                ) : availableProviders.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500 dark:border-zinc-700 dark:text-gray-400">
                    <p className="font-medium text-gray-700 dark:text-gray-300">
                      {t('settings.chatNoProvidersTitle')}
                    </p>
                    <p className="mt-1">{t('settings.chatNoProvidersHint')}</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>{t('agents.model.modelsLoaded', { count: totalModelCount })}</span>
                      <button
                        type="button"
                        onClick={loadKeysAndFetchModels}
                        disabled={isModelLocked}
                        className="text-primary-600 hover:text-primary-700 dark:text-primary-400 flex items-center gap-1"
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
                      disabled: useGlobalModelSettings || isModelLocked,
                      disabledDisplayValue: globalDefaultModel || t('agents.model.notSelected'),
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
                      disabled: useGlobalModelSettings || isModelLocked,
                      disabledDisplayValue: globalLiteModel || t('agents.model.notSelected'),
                    })}
                  </>
                )}
              </div>
            )}

            {activeTab === 'personalization' && (
              <div className="space-y-4 sm:space-y-6">
                <div className="flex gap-3 rounded-lg bg-blue-50 p-4 text-sm text-blue-700 dark:bg-blue-900/10 dark:text-blue-300">
                  <Info size={18} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">{t('settings.responseStyle')}</p>
                    <p className="opacity-90">{t('settings.responseStyleHint')}</p>
                  </div>
                </div>
                {renderDropdown(
                  t('settings.respondLanguage'),
                  responseLanguage,
                  setResponseLanguage,
                  responseLanguageOptions,
                  isResponseLanguageOpen,
                  setIsResponseLanguageOpen,
                  responseLanguageRef,
                  false,
                  isPersonalizationLocked || followInterfaceLanguage,
                )}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                    isPersonalizationLocked,
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
                    isPersonalizationLocked,
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                    isPersonalizationLocked,
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
                    isPersonalizationLocked,
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                    isPersonalizationLocked,
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
                    isPersonalizationLocked,
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
                    disabled={isPersonalizationLocked}
                    className={MODAL_TEXTAREA_CLASS}
                  />
                </div>

                <div className="rounded-xl border border-black/5 bg-transparent p-1 dark:border-white/5">
                  <button
                    type="button"
                    disabled={isPersonalizationLocked}
                    onClick={() => {
                      if (hasAdvancedOverrides) return
                      setIsAdvancedOpen(prev => !prev)
                    }}
                    className={clsx(
                      'flex w-full items-center justify-between px-4 py-3 text-sm font-medium',
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
                    <div className="space-y-5 border-t border-gray-200 px-4 pt-4 pb-4 dark:border-zinc-700">
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
                          disabled={isPersonalizationLocked}
                          onClick={() => {
                            setTemperature(null)
                            setTopP(null)
                            setFrequencyPenalty(null)
                            setPresencePenalty(null)
                          }}
                          className="hover:text-primary-600 dark:hover:text-primary-400 text-xs font-medium text-gray-600 dark:text-gray-300"
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
                <div className="flex gap-3 rounded-lg bg-blue-50 p-4 text-sm text-blue-700 dark:bg-blue-900/10 dark:text-blue-300">
                  <Info size={18} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">{t('agents.tools.title')}</p>
                    <p className="opacity-90">{t('agents.tools.hint')}</p>
                  </div>
                </div>

                {toolsLoading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-gray-500">
                    <DotLoader />
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
                                    <div className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                      {subGroupName}
                                    </span>
                                    <span className="text-xs text-gray-400 dark:text-gray-500">
                                      ({tools.length})
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={isToolsLocked}
                                    onClick={() => {
                                      if (isToolsLocked) return
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
                                    className="text-primary-500 hover:text-primary-600 bg-primary-500/5 hover:bg-primary-500/10 rounded px-2 py-1 text-[10px] font-bold tracking-tight uppercase transition-colors"
                                  >
                                    {allSelected ? t('common.deselectAll') : t('common.selectAll')}
                                  </button>
                                </div>
                                {/* Tools in sub-group */}
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                  {tools.map(tool => {
                                    const checked = selectedToolIds.includes(tool.id)
                                    const disabled = isToolUnavailable(tool) || isToolsLocked
                                    const iconName = TOOL_ICONS[tool.name]
                                    const IconComponent = iconName
                                      ? {
                                          Search,
                                          GraduationCap,
                                          Eye,
                                          Calculator,
                                          Clock,
                                          FileText,
                                          ScanText,
                                          Wrench,
                                          FormInput,
                                          Globe,
                                          LineChart,
                                          Newspaper,
                                          Video,
                                          Youtube,
                                          User,
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
                                          'group/tool flex items-start gap-3 rounded-lg border p-3 transition-colors',
                                          disabled && 'cursor-not-allowed opacity-50',
                                          !disabled && 'cursor-pointer',
                                          checked
                                            ? 'border-primary-400 bg-primary-50/40 dark:bg-primary-900/20'
                                            : 'border-black/10 hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-zinc-800/40',
                                        )}
                                      >
                                        <Checkbox
                                          checked={checked}
                                          disabled={disabled}
                                          onCheckedChange={() => {
                                            if (disabled) return
                                            setSelectedToolIds(prev =>
                                              prev.includes(tool.id)
                                                ? prev.filter(id => id !== tool.id)
                                                : [...prev, tool.id],
                                            )
                                          }}
                                        />
                                        <div className="min-w-0 flex-1 space-y-1.5">
                                          <div className="flex min-w-0 items-center gap-2">
                                            {IconComponent && (
                                              <IconComponent
                                                size={16}
                                                className="shrink-0 text-gray-500 dark:text-gray-400"
                                              />
                                            )}
                                            <div
                                              className="flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-100"
                                              title={localizedName}
                                            >
                                              {localizedName}
                                            </div>
                                          </div>
                                          {(infoKey || tool.description) && (
                                            <div className="line-clamp-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                                              {infoKey ? t(infoKey) : tool.description}
                                            </div>
                                          )}
                                          {disabled && (
                                            <div className="text-xs text-amber-600 dark:text-amber-400">
                                              {getToolUnavailableHint(tool)}
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
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            {groupData.tools.map(tool => {
                              const checked = selectedToolIds.includes(tool.id)
                              const disabled = isToolUnavailable(tool) || isToolsLocked
                              const iconName = TOOL_ICONS[tool.name]
                              const IconComponent = iconName
                                ? {
                                    Search,
                                    GraduationCap,
                                    Eye,
                                    Calculator,
                                    Clock,
                                    FileText,
                                    ScanText,
                                    Wrench,
                                    FormInput,
                                    Globe,
                                    LineChart,
                                    Newspaper,
                                    Video,
                                    Youtube,
                                    User,
                                  }[iconName]
                                : Code
                              const infoKey = TOOL_INFO_KEYS[tool.name]
                              return (
                                <label
                                  key={tool.id}
                                  className={clsx(
                                    'flex items-start gap-3 rounded-lg border p-3 transition-colors',
                                    disabled && 'cursor-not-allowed opacity-50',
                                    !disabled && 'cursor-pointer',
                                    checked
                                      ? 'border-primary-400 bg-primary-50/40 dark:bg-primary-900/20'
                                      : 'border-black/10 hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-zinc-800/40',
                                  )}
                                >
                                  <Checkbox
                                    checked={checked}
                                    disabled={disabled}
                                    onCheckedChange={() => {
                                      if (disabled) return
                                      setSelectedToolIds(prev =>
                                        prev.includes(tool.id)
                                          ? prev.filter(id => id !== tool.id)
                                          : [...prev, tool.id],
                                      )
                                    }}
                                  />
                                  <div className="min-w-0 flex-1 space-y-1.5">
                                    <div className="flex min-w-0 items-center gap-2">
                                      {IconComponent && (
                                        <IconComponent
                                          size={16}
                                          className="shrink-0 text-gray-500 dark:text-gray-400"
                                        />
                                      )}
                                      <div
                                        className="flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-100"
                                        title={t(TOOL_TRANSLATION_KEYS[tool.name] || tool.name)}
                                      >
                                        {t(TOOL_TRANSLATION_KEYS[tool.name] || tool.name)}
                                      </div>
                                    </div>
                                    {(infoKey || tool.description) && (
                                      <div className="truncate-2-lines text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                                        {infoKey ? t(infoKey) : tool.description}
                                      </div>
                                    )}
                                    {disabled && (
                                      <div className="text-xs text-amber-600 dark:text-amber-400">
                                        {getToolUnavailableHint(tool)}
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

            {activeTab === 'skills' && (
              <div className="space-y-6">
                <div className="flex gap-3 rounded-lg bg-blue-50 p-4 text-sm text-blue-700 dark:bg-blue-900/10 dark:text-blue-300">
                  <Info size={18} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">{t('agents.skills.title')}</p>
                    <p className="opacity-90">{t('agents.skills.description')}</p>
                  </div>
                </div>

                {skillsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="animate-spin text-gray-400" size={24} />
                  </div>
                ) : availableSkills.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center dark:border-zinc-800">
                    <GraduationCap className="mx-auto mb-3 h-8 w-8 text-gray-400" />
                    <p className="font-medium text-gray-900 dark:text-white">
                      {t('agents.skills.empty')}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">{t('agents.skills.emptyHint')}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {availableSkills.map(skill => {
                      const checked = selectedSkillIds.includes(skill.id)
                      return (
                        <label
                          key={skill.id}
                          className={clsx(
                            'group/skill flex items-start gap-3 rounded-lg border p-3 transition-colors',
                            isSkillsLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                            checked
                              ? 'border-primary-400 bg-primary-50/40 dark:bg-primary-900/20'
                              : 'border-black/10 hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-zinc-800/40',
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={isSkillsLocked}
                            onCheckedChange={() => {
                              if (isSkillsLocked) return
                              setSelectedSkillIds(prev =>
                                prev.includes(skill.id)
                                  ? prev.filter(id => id !== skill.id)
                                  : [...prev, skill.id],
                              )
                            }}
                          />
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex min-w-0 items-center gap-2">
                              <GraduationCap
                                size={16}
                                className="shrink-0 text-gray-500 dark:text-gray-400"
                              />
                              <div
                                className="flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-100"
                                title={skill.name}
                              >
                                {skill.name}
                              </div>
                            </div>
                            {skill.description && (
                              <div className="truncate-2-lines text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                                {skill.description}
                              </div>
                            )}
                          </div>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex h-20 shrink-0 items-center justify-between border-t border-black/5 bg-transparent px-6 sm:px-8 dark:border-white/5">
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
                className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                {t('agents.actions.delete')}
              </button>
            ) : (
              <div />
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-zinc-800"
              >
                {t('agents.actions.cancel')}
              </button>
              <button
                onClick={handleSaveWrapper}
                disabled={isSaving}
                className="bg-primary-500 flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
      {avatarCropSource && avatarPreviewLayout && (
        <div className="fixed inset-0 z-120 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[28px] border border-white/10 bg-white/95 p-5 shadow-2xl dark:bg-zinc-950/95">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('agents.crop.avatarTitle')}
                </h4>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {t('agents.crop.avatarDescription')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAvatarCropSource('')
                  setAvatarCropMeta(null)
                }}
                className="rounded-full p-2 text-gray-500 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-6 lg:flex-row">
              <div className="flex justify-center lg:flex-1">
                <div
                  ref={avatarCropFrameRef}
                  className={clsx(
                    'relative touch-none overflow-hidden border border-black/8 bg-gray-100 dark:border-white/10 dark:bg-zinc-900',
                    avatarShape === AGENT_AVATAR_SHAPE_CIRCLE ? 'rounded-full' : 'rounded-[28px]',
                    avatarDragState ? 'cursor-grabbing' : 'cursor-grab',
                  )}
                  style={{ width: cropViewportSize, height: cropViewportSize }}
                  onPointerDown={event => {
                    event.preventDefault()
                    setAvatarDragState({
                      startX: event.clientX,
                      startY: event.clientY,
                      startOffsetX: avatarCropOffsetX,
                      startOffsetY: avatarCropOffsetY,
                    })
                  }}
                >
                  <img
                    src={avatarCropSource}
                    alt={t('agents.crop.avatarSourceAlt')}
                    className="pointer-events-none absolute max-w-none select-none"
                    style={{
                      width: avatarPreviewLayout.renderedWidth,
                      height: avatarPreviewLayout.renderedHeight,
                      left: '50%',
                      top: '50%',
                      transform: `translate(calc(-50% + ${avatarCropOffsetX}px), calc(-50% + ${avatarCropOffsetY}px))`,
                    }}
                  />
                </div>
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-4">
                <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
                  {t('agents.crop.zoom')}
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.01"
                    value={avatarCropZoom}
                    onChange={event => {
                      const nextZoom = Number(event.target.value)
                      setAvatarCropZoom(nextZoom)
                      if (avatarPreviewLayout) {
                        const ratio = nextZoom / avatarCropZoom
                        const nextMaxX = Math.max(
                          0,
                          (avatarPreviewLayout.baseWidth * nextZoom - cropViewportSize) / 2,
                        )
                        const nextMaxY = Math.max(
                          0,
                          (avatarPreviewLayout.baseHeight * nextZoom - cropViewportSize) / 2,
                        )
                        setAvatarCropOffsetX(prev => clampCropOffset(prev * ratio, nextMaxX))
                        setAvatarCropOffsetY(prev => clampCropOffset(prev * ratio, nextMaxY))
                      }
                    }}
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
                  {t('agents.crop.horizontal')}
                  <input
                    type="range"
                    min={-avatarPreviewLayout.maxOffsetX}
                    max={avatarPreviewLayout.maxOffsetX}
                    step="1"
                    value={avatarCropOffsetX}
                    onChange={event =>
                      setAvatarCropOffsetX(
                        clampCropOffset(Number(event.target.value), avatarPreviewLayout.maxOffsetX),
                      )
                    }
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
                  {t('agents.crop.vertical')}
                  <input
                    type="range"
                    min={-avatarPreviewLayout.maxOffsetY}
                    max={avatarPreviewLayout.maxOffsetY}
                    step="1"
                    value={avatarCropOffsetY}
                    onChange={event =>
                      setAvatarCropOffsetY(
                        clampCropOffset(Number(event.target.value), avatarPreviewLayout.maxOffsetY),
                      )
                    }
                  />
                </label>
                <div className="rounded-2xl border border-black/5 bg-black/3 px-4 py-3 text-xs text-gray-500 dark:border-white/5 dark:bg-white/3 dark:text-gray-400">
                  {t('agents.crop.avatarFrameLabel', {
                    shape: t(
                      avatarShape === AGENT_AVATAR_SHAPE_CIRCLE
                        ? 'agents.general.avatarShapeCircle'
                        : 'agents.general.avatarShapeRounded',
                    ),
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setAvatarCropSource('')
                  setAvatarCropMeta(null)
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/10"
              >
                {t('agents.actions.cancel')}
              </button>
              <button
                type="button"
                onClick={handleApplyAvatarCrop}
                disabled={isAvatarCropping}
                className="bg-primary-500 hover:bg-primary-600 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
              >
                {isAvatarCropping ? t('agents.actions.processing') : t('agents.crop.applyAvatar')}
              </button>
            </div>
          </div>
        </div>
      )}
      {isBannerPreviewOpen && bannerImage && (
        <div className="fixed inset-0 z-120 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-6xl rounded-[28px] border border-white/10 bg-white/95 p-5 shadow-2xl dark:bg-zinc-950/95">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('agents.preview.bannerPreviewTitle')}
                </h4>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {t('agents.preview.bannerPreviewDescription')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBannerPreviewOpen(false)}
                className="rounded-full p-2 text-gray-500 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <section className="rounded-2xl border border-black/8 bg-black/3 p-4 dark:border-white/10 dark:bg-white/3">
                <div className="mb-2 text-xs font-semibold tracking-[0.08em] text-gray-500 uppercase dark:text-gray-400">
                  {t('agents.preview.desktop')}
                </div>
                <div className="rounded-xl bg-slate-100 p-3 dark:bg-zinc-900">
                  <AgentBannerSurface
                    imageSrc={bannerImage}
                    imageAlt={displayName || t('agents.preview.bannerImageFallback')}
                    agent={previewAgent}
                    displayName={displayName || t('agents.preview.agentFallback')}
                    providerId={previewProviderId}
                    providerLabel={previewProviderLabel}
                    providerFallback={previewProviderFallback}
                    model={previewModel}
                  />
                </div>
              </section>
              <section className="rounded-2xl border border-black/8 bg-black/3 p-4 dark:border-white/10 dark:bg-white/3">
                <div className="mb-2 text-xs font-semibold tracking-[0.08em] text-gray-500 uppercase dark:text-gray-400">
                  {t('agents.preview.mobile')}
                </div>
                <div className="rounded-xl bg-slate-100 px-2 py-4 dark:bg-zinc-900">
                  <div className="mx-auto w-full max-w-[390px]">
                    <AgentBannerSurface
                      imageSrc={bannerImage}
                      imageAlt={displayName || t('agents.preview.bannerImageFallback')}
                      agent={previewAgent}
                      displayName={displayName || t('agents.preview.agentFallback')}
                      providerId={previewProviderId}
                      providerLabel={previewProviderLabel}
                      providerFallback={previewProviderFallback}
                      model={previewModel}
                    />
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
      {bannerCropSource && bannerPreviewLayout && (
        <div className="fixed inset-0 z-120 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[28px] border border-white/10 bg-white/95 p-5 shadow-2xl dark:bg-zinc-950/95">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('agents.crop.bannerTitle')}
                </h4>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {t('agents.crop.bannerDescription')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBannerCropSource('')
                  setBannerCropMeta(null)
                }}
                className="rounded-full p-2 text-gray-500 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-5">
              <div className="flex justify-center">
                <div
                  ref={bannerCropFrameRef}
                  className={clsx(
                    'touch-none',
                    bannerDragState ? 'cursor-grabbing' : 'cursor-grab',
                  )}
                  style={{ width: bannerViewportWidth }}
                  onPointerDown={event => {
                    event.preventDefault()
                    setBannerDragState({
                      startX: event.clientX,
                      startY: event.clientY,
                      startOffsetX: bannerCropOffsetX,
                      startOffsetY: bannerCropOffsetY,
                    })
                  }}
                >
                  <AgentBannerSurface
                    imageAlt={t('agents.crop.bannerSourceAlt')}
                    backgroundNode={
                      <img
                        src={bannerCropSource}
                        alt={t('agents.crop.bannerSourceAlt')}
                        className="pointer-events-none absolute max-w-none select-none"
                        style={{
                          width: bannerPreviewLayout.renderedWidth,
                          height: bannerPreviewLayout.renderedHeight,
                          left: '50%',
                          top: '50%',
                          transform: `translate(calc(-50% + ${bannerCropOffsetX}px), calc(-50% + ${bannerCropOffsetY}px))`,
                        }}
                      />
                    }
                    agent={previewAgent}
                    displayName={displayName || t('agents.preview.agentFallback')}
                    providerId={previewProviderId}
                    providerLabel={previewProviderLabel}
                    providerFallback={previewProviderFallback}
                    model={previewModel}
                    frameClassName="bg-gray-100 dark:bg-zinc-900"
                    frameStyle={{ width: '100%', aspectRatio: String(AGENT_BANNER_ASPECT_RATIO) }}
                  />
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                <div className="rounded-2xl border border-black/5 bg-black/3 px-4 py-3 text-xs text-gray-500 dark:border-white/5 dark:bg-white/3 dark:text-gray-400">
                  {t('agents.crop.dragToAdjustPosition')}
                </div>
                <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
                  {t('agents.crop.zoom')}
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.01"
                    value={bannerCropZoom}
                    onChange={event => {
                      const nextZoom = Number(event.target.value)
                      setBannerCropZoom(nextZoom)
                      if (bannerPreviewLayout) {
                        const ratio = nextZoom / bannerCropZoom
                        const nextMaxX = Math.max(
                          0,
                          (bannerPreviewLayout.baseWidth * nextZoom - bannerViewportWidth) / 2,
                        )
                        const nextMaxY = Math.max(
                          0,
                          (bannerPreviewLayout.baseHeight * nextZoom - bannerViewportHeight) / 2,
                        )
                        setBannerCropOffsetX(prev => clampCropOffset(prev * ratio, nextMaxX))
                        setBannerCropOffsetY(prev => clampCropOffset(prev * ratio, nextMaxY))
                      }
                    }}
                  />
                </label>
                <div className="rounded-2xl border border-black/5 bg-black/3 px-4 py-3 text-xs text-gray-500 dark:border-white/5 dark:bg-white/3 dark:text-gray-400">
                  {t('agents.crop.bannerHint')}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setBannerCropSource('')
                  setBannerCropMeta(null)
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/10"
              >
                {t('agents.actions.cancel')}
              </button>
              <button
                type="button"
                onClick={handleApplyBannerCrop}
                disabled={isBannerCropping}
                className="bg-primary-500 hover:bg-primary-600 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
              >
                {isBannerCropping ? t('agents.actions.processing') : t('agents.crop.applyBanner')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}

export default AgentModal
