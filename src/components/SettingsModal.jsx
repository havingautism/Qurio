import clsx from 'clsx'
import {
  Brain,
  Box,
  Check,
  Copy,
  Github,
  Info,
  Key,
  Link,
  Loader2,
  Mail,
  MessageSquare,
  Monitor,
  Search,
  RefreshCw,
  Settings,
  Terminal,
  X,
  Database,
  ChevronDown,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import useScrollLock from '../hooks/useScrollLock'
import { extractTextFromFile, normalizeExtractedText } from '../lib/documentParser'
import { renderProviderIcon, getModelIcon, getModelIconClassName } from '../lib/modelIcons'
import { getModelsForProvider } from '../lib/models_api'
import { getPublicEnv } from '../lib/publicEnv'
import {
  DEEPSEEK_BASE_URL,
  GLM_BASE_URL,
  SILICONFLOW_BASE_URL,
  VOLCENGINE_BASE_URL,
} from '../lib/providerConstants'
import { getBackendUrl, isConfiguredApiSecret, loadSettings, saveSettings } from '../lib/settings'
import { fetchRemoteSettings, saveRemoteSettings, testConnection } from '../lib/supabase'
import { THEMES } from '../lib/themes'
import Logo from './Logo'
import { useAppContext } from '../App'
import { getProvider } from '../lib/providers'
import { FALLBACK_MODEL_OPTIONS, PROVIDER_KEYS } from '../lib/modelConstants'
import EmailSettingsPanel from './EmailSettingsPanel'
import { useToast } from '../contexts/ToastContext'
import INIT_SQL_SCRIPT from '../assets/init-schema.sql'

const ENV_VARS = {
  supabaseUrl: getPublicEnv('PUBLIC_SUPABASE_URL'),
  supabaseKey: getPublicEnv('PUBLIC_SUPABASE_KEY'),
  openAIKey: getPublicEnv('PUBLIC_OPENAI_API_KEY'),
  openAIBaseUrl: getPublicEnv('PUBLIC_OPENAI_BASE_URL'),
  googleApiKey: getPublicEnv('PUBLIC_GOOGLE_API_KEY'),
  siliconFlowKey: getPublicEnv('PUBLIC_SILICONFLOW_API_KEY'),
  glmKey: getPublicEnv('PUBLIC_GLM_API_KEY'),
  deepseekKey: getPublicEnv('PUBLIC_DEEPSEEK_API_KEY'),
  volcengineKey: getPublicEnv('PUBLIC_VOLCENGINE_API_KEY'),
  modelscopeKey: getPublicEnv('PUBLIC_MODELSCOPE_API_KEY'),
  kimiKey: getPublicEnv('PUBLIC_KIMI_API_KEY'),
  tavilyApiKey: getPublicEnv('PUBLIC_TAVILY_API_KEY'),
  serpapiApiKey: getPublicEnv('PUBLIC_SERPAPI_API_KEY'),
  exaApiKey: getPublicEnv('PUBLIC_EXA_API_KEY'),
  backendUrl: getPublicEnv('PUBLIC_BACKEND_URL'),
}

const isElectronRuntime = () =>
  typeof window !== 'undefined' &&
  (window.location.protocol === 'file:' || navigator.userAgent.includes('Electron'))

const TOOLS_API_PROVIDER_KEYS = ['tavily', 'serpapi', 'exa']

const resolveToolsApiEditorProvider = ({
  searchProvider,
  tavilyApiKey,
  serpapiApiKey,
  exaApiKey,
}) => {
  const normalizedSearchProvider = String(searchProvider || '')
    .trim()
    .toLowerCase()
  if (normalizedSearchProvider === 'tavily' || normalizedSearchProvider === 'serpapi') {
    return normalizedSearchProvider
  }
  if (isConfiguredApiSecret(exaApiKey, ['your-exa-api-key', 'your_exa_api_key'])) return 'exa'
  if (isConfiguredApiSecret(serpapiApiKey)) return 'serpapi'
  if (isConfiguredApiSecret(tavilyApiKey)) return 'tavily'
  return 'tavily'
}

const INTERFACE_LANGUAGE_KEYS = ['en', 'zh-CN']
const DOCUMENT_CHUNK_SIZE = 1200
const DOCUMENT_CHUNK_OVERLAP = 200
const DOCUMENT_MAX_CHUNKS = 60
const DOCUMENT_TOP_K = 3

const EMBEDDING_KEYWORDS = ['embed', 'bge', 'vector']

const matchesEmbeddingKeyword = model => {
  const text = String((model?.value || model?.label) ?? '').toLowerCase()
  return EMBEDDING_KEYWORDS.some(keyword => text.includes(keyword))
}

const validateSettingsForSave = settings => {
  const contextLimit = Number(settings.contextTurns ?? settings.contextMessageLimit)
  if (!Number.isFinite(contextLimit) || contextLimit < 1 || contextLimit > 50) return false

  return true
}

const getEnvManagedSettingKeys = () => {
  const keys = []
  if (ENV_VARS.googleApiKey) {
    keys.push('googleApiKey', 'GoogleApiKey')
  }
  if (ENV_VARS.openAIKey) {
    keys.push('OpenAICompatibilityKey')
  }
  if (ENV_VARS.openAIBaseUrl) {
    keys.push('OpenAICompatibilityUrl')
  }
  if (ENV_VARS.siliconFlowKey) {
    keys.push('SiliconFlowKey')
  }
  if (ENV_VARS.glmKey) {
    keys.push('GlmKey')
  }
  if (ENV_VARS.deepseekKey) {
    keys.push('DeepSeekKey')
  }
  if (ENV_VARS.volcengineKey) {
    keys.push('VolcengineKey')
  }
  if (ENV_VARS.modelscopeKey) {
    keys.push('ModelScopeKey')
  }
  if (ENV_VARS.kimiKey) {
    keys.push('KimiKey')
  }
  if (ENV_VARS.tavilyApiKey) {
    keys.push('tavilyApiKey')
  }
  if (ENV_VARS.serpapiApiKey) {
    keys.push('serpapiApiKey')
  }
  if (ENV_VARS.exaApiKey) {
    keys.push('exaApiKey')
  }
  if (ENV_VARS.backendUrl) {
    keys.push('backendUrl')
  }
  return keys
}

const SettingsModal = ({ isOpen, onClose, onOpenDatabaseSetup }) => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { defaultAgent, showConfirmation } = useAppContext()
  const toast = useToast()
  const electronMode = useMemo(() => isElectronRuntime(), [])

  const renderEnvHint = hasEnv =>
    hasEnv ? (
      <p className="text-xs text-emerald-600 dark:text-emerald-400">
        {t('settings.loadedFromEnvironment')}
      </p>
    ) : null

  const [activeTab, setActiveTab] = useState('general')
  const [OpenAICompatibilityKey, setOpenAICompatibilityKey] = useState('')
  const [OpenAICompatibilityUrl, setOpenAICompatibilityUrl] = useState('')
  const [SiliconFlowKey, setSiliconFlowKey] = useState('')
  const [NvidiaKey, setNvidiaKey] = useState('')
  const [MinimaxKey, setMinimaxKey] = useState('')
  const [GlmKey, setGlmKey] = useState('')
  const [DeepSeekKey, setDeepSeekKey] = useState('')
  const [VolcengineKey, setVolcengineKey] = useState('')
  const [ModelScopeKey, setModelScopeKey] = useState('')
  const [KimiKey, setKimiKey] = useState('')
  const [apiProvider, setApiProvider] = useState('gemini')
  const [googleApiKey, setGoogleApiKey] = useState('')
  const [searchProvider, setSearchProvider] = useState('tavily')
  const [toolsApiProvider, setToolsApiProvider] = useState('tavily')

  const [tavilyApiKey, setTavilyApiKey] = useState('')
  const [serpapiApiKey, setSerpapiApiKey] = useState('')
  const [exaApiKey, setExaApiKey] = useState('')
  const [backendUrl, setBackendUrl] = useState(ENV_VARS.backendUrl || '')
  const [databaseProvider, setDatabaseProvider] = useState('')
  const [dbProviders, setDbProviders] = useState([])
  const [dbAccessKey, setDbAccessKey] = useState('')
  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [supabaseKey, setSupabaseKey] = useState('')
  const initialDbConfigRef = useRef({ provider: '', accessKey: '' })

  const [backendHealthState, setBackendHealthState] = useState({
    status: 'idle',
    message: '',
  })
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false)
  const providerDropdownRef = useRef(null)
  const [isSearchProviderDropdownOpen, setIsSearchProviderDropdownOpen] = useState(false)
  const searchProviderDropdownRef = useRef(null)
  const [isInterfaceLanguageDropdownOpen, setIsInterfaceLanguageDropdownOpen] = useState(false)
  const interfaceLanguageDropdownRef = useRef(null)
  const [isEmbeddingProviderDropdownOpen, setIsEmbeddingProviderDropdownOpen] = useState(false)
  const embeddingProviderDropdownRef = useRef(null)
  const [contextTurns, setContextTurns] = useState(6)
  const [themeColor, setThemeColor] = useState('violet')
  const [fontSize, setFontSize] = useState('medium')
  const [isSaving, setIsSaving] = useState(false)
  const [enableRelatedQuestions, setEnableRelatedQuestions] = useState(false)
  const [interfaceLanguage, setInterfaceLanguage] = useState('en')
  const [followInterfaceLanguage, setFollowInterfaceLanguage] = useState(false)
  const [enableLongTermMemory, setEnableLongTermMemory] = useState(false)
  const [defaultModel, setDefaultModel] = useState('')
  const [liteModel, setLiteModel] = useState('')
  const [defaultModelProvider, setDefaultModelProvider] = useState('')
  const [liteModelProvider, setLiteModelProvider] = useState('')
  const [defaultModelSource, setDefaultModelSource] = useState('list')
  const [liteModelSource, setLiteModelSource] = useState('list')
  const [defaultCustomModel, setDefaultCustomModel] = useState('')
  const [liteCustomModel, setLiteCustomModel] = useState('')
  const [defaultTestAction, setDefaultTestAction] = useState({ status: 'idle', message: '' })
  const [liteTestAction, setLiteTestAction] = useState({ status: 'idle', message: '' })

  const [embeddingProvider, setEmbeddingProvider] = useState('')
  const [embeddingModel, setEmbeddingModel] = useState('')
  const [chatGroupedModels, setChatGroupedModels] = useState({})
  const [isChatModelsLoading, setIsChatModelsLoading] = useState(false)
  const [embeddingModelSource, setEmbeddingModelSource] = useState('list')
  const [embeddingCustomModel, setEmbeddingCustomModel] = useState('')
  const [embeddingGroupedModels, setEmbeddingGroupedModels] = useState({})
  const [embeddingAvailableProviders, setEmbeddingAvailableProviders] = useState([])
  const [embeddingModelsLoading, setEmbeddingModelsLoading] = useState(false)
  const [embeddingModelsError, setEmbeddingModelsError] = useState('')
  const [userSelfIntro, setUserSelfIntro] = useState('')

  // Advanced settings
  const [developerMode, setDeveloperMode] = useState(false)

  // API Configuration States
  const [introQuery, setIntroQuery] = useState('')
  const [introEmbeddingVector, setIntroEmbeddingVector] = useState(null)
  const [introEmbeddingState, setIntroEmbeddingState] = useState({
    status: 'idle',
    message: '',
  })
  const [introSearchState, setIntroSearchState] = useState({
    status: 'idle',
    message: '',
    similarity: null,
    query: '',
    matchText: '',
  })
  const [documentParseState, setDocumentParseState] = useState({
    status: 'idle',
    message: '',
    fileName: '',
    characters: 0,
    chunks: 0,
    truncated: false,
  })
  const [documentText, setDocumentText] = useState('')
  const [documentChunks, setDocumentChunks] = useState([])
  const [documentQuery, setDocumentQuery] = useState('')
  const [documentIndexState, setDocumentIndexState] = useState({
    status: 'idle',
    message: '',
    progress: 0,
  })
  const [documentSearchState, setDocumentSearchState] = useState({
    status: 'idle',
    message: '',
    results: [],
    query: '',
  })

  const [isInitModalOpen, setIsInitModalOpen] = useState(false)
  const [initModalResult, setInitModalResult] = useState(null)
  const [copiedInitSql, setCopiedInitSql] = useState(false)
  const [retestingDb, setRetestingDb] = useState(false)
  const initialSelfIntroRef = useRef('')

  // Handle click outside provider dropdown
  useEffect(() => {
    const handleClickOutside = event => {
      if (providerDropdownRef.current && !providerDropdownRef.current.contains(event.target)) {
        setIsProviderDropdownOpen(false)
      }
      if (
        searchProviderDropdownRef.current &&
        !searchProviderDropdownRef.current.contains(event.target)
      ) {
        setIsSearchProviderDropdownOpen(false)
      }
      if (
        interfaceLanguageDropdownRef.current &&
        !interfaceLanguageDropdownRef.current.contains(event.target)
      ) {
        setIsInterfaceLanguageDropdownOpen(false)
      }
      if (
        embeddingProviderDropdownRef.current &&
        !embeddingProviderDropdownRef.current.contains(event.target)
      ) {
        setIsEmbeddingProviderDropdownOpen(false)
      }
      return
    }

    if (
      isProviderDropdownOpen ||
      isSearchProviderDropdownOpen ||
      isInterfaceLanguageDropdownOpen ||
      isEmbeddingProviderDropdownOpen
    ) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [
    isProviderDropdownOpen,
    isSearchProviderDropdownOpen,
    isInterfaceLanguageDropdownOpen,
    isEmbeddingProviderDropdownOpen,
  ])

  // Menu items - use constant keys for logic, translate labels for display
  const MENU_ITEM_KEYS = [
    { id: 'general', icon: Settings },
    { id: 'model', icon: Box },
    { id: 'chat', icon: MessageSquare },
    { id: 'memory', icon: Brain },
    // { id: 'personalization', icon: User },
    { id: 'interface', icon: Monitor },
    { id: 'account', icon: Key },
    { id: 'email', icon: Mail },
    { id: 'advanced', icon: Terminal },
    { id: 'about', icon: Info },
  ]

  const menuItems = useMemo(
    () => MENU_ITEM_KEYS.map(item => ({ ...item, label: t(`settings.menu.${item.id}`) })),
    [t],
  )

  // Provider options with translated labels
  const providerOptions = useMemo(
    () =>
      PROVIDER_KEYS.map(key => ({
        key,
        value: key,
        label: t(`settings.providers.${key}`),
      })),
    [t],
  )

  const providerConfiguredMap = useMemo(
    () => ({
      gemini: Boolean((googleApiKey || '').trim() || ENV_VARS.googleApiKey),
      openai_compatibility: Boolean((OpenAICompatibilityKey || '').trim() || ENV_VARS.openAIKey),
      siliconflow: Boolean((SiliconFlowKey || '').trim() || ENV_VARS.siliconFlowKey),
      nvidia: Boolean((NvidiaKey || '').trim()),
      minimax: Boolean((MinimaxKey || '').trim()),
      glm: Boolean((GlmKey || '').trim() || ENV_VARS.glmKey),
      deepseek: Boolean((DeepSeekKey || '').trim() || ENV_VARS.deepseekKey),
      volcengine: Boolean((VolcengineKey || '').trim() || ENV_VARS.volcengineKey),
      modelscope: Boolean((ModelScopeKey || '').trim() || ENV_VARS.modelscopeKey),
      kimi: Boolean((KimiKey || '').trim() || ENV_VARS.kimiKey),
    }),
    [
      googleApiKey,
      OpenAICompatibilityKey,
      SiliconFlowKey,
      NvidiaKey,
      MinimaxKey,
      GlmKey,
      DeepSeekKey,
      VolcengineKey,
      ModelScopeKey,
      KimiKey,
    ],
  )
  const configuredChatProviders = useMemo(
    () => PROVIDER_KEYS.filter(key => Boolean(providerConfiguredMap[key])),
    [providerConfiguredMap],
  )

  const toolsApiProviderOptions = useMemo(
    () =>
      TOOLS_API_PROVIDER_KEYS.map(key => ({
        key,
        value: key,
        label: t(`settings.toolsApiProviders.${key}`),
      })),
    [t],
  )
  const toolsApiProviderConfiguredMap = useMemo(
    () => ({
      tavily: isConfiguredApiSecret(tavilyApiKey || ENV_VARS.tavilyApiKey),
      serpapi: isConfiguredApiSecret(serpapiApiKey || ENV_VARS.serpapiApiKey),
      exa: isConfiguredApiSecret(exaApiKey || ENV_VARS.exaApiKey, [
        'your-exa-api-key',
        'your_exa_api_key',
      ]),
    }),
    [tavilyApiKey, serpapiApiKey, exaApiKey],
  )

  // Interface language options with translated labels
  const interfaceLanguageOptions = useMemo(
    () =>
      INTERFACE_LANGUAGE_KEYS.map(key => ({
        key,
        value: key,
        label: t(`settings.language.${key}`),
      })),
    [t],
  )
  const embeddingModelCount = useMemo(
    () => Object.values(embeddingGroupedModels).reduce((sum, models) => sum + models.length, 0),
    [embeddingGroupedModels],
  )

  // TODO: useEffect to load settings from Supabase/LocalStorage on mount
  // Load settings when modal opens
  useEffect(() => {
    const loadProviders = async () => {
      try {
        const headers = {}
        if (dbAccessKey) headers['x-db-access-key'] = dbAccessKey
        const response = await fetch(`${getBackendUrl()}/api/db/providers`, {
          headers,
          cache: 'no-store',
        })
        const payload = await response.json().catch(() => ({}))
        const providers = Array.isArray(payload.providers)
          ? payload.providers
          : payload.provider
            ? [payload.provider]
            : []
        setDbProviders(providers)
        if (!databaseProvider && providers.length > 0) {
          setDatabaseProvider(providers[0].type || '')
        }
      } catch (error) {
        setDbProviders([])
      }
    }

    if (isOpen) {
      const settings = loadSettings()
      if (settings.databaseProvider) setDatabaseProvider(settings.databaseProvider)
      if (settings.dbAccessKey) setDbAccessKey(settings.dbAccessKey)
      initialDbConfigRef.current = {
        provider: settings.databaseProvider || '',
        accessKey: settings.dbAccessKey || '',
      }
      if (settings.supabaseUrl) setSupabaseUrl(settings.supabaseUrl)
      if (settings.supabaseKey) setSupabaseKey(settings.supabaseKey)
      if (settings.OpenAICompatibilityKey)
        setOpenAICompatibilityKey(settings.OpenAICompatibilityKey)
      if (settings.OpenAICompatibilityUrl)
        setOpenAICompatibilityUrl(settings.OpenAICompatibilityUrl)
      if (settings.SiliconFlowKey) setSiliconFlowKey(settings.SiliconFlowKey)
      if (settings.NvidiaKey) setNvidiaKey(settings.NvidiaKey)
      if (settings.MinimaxKey) setMinimaxKey(settings.MinimaxKey)
      if (settings.GlmKey) setGlmKey(settings.GlmKey)
      if (settings.DeepSeekKey) setDeepSeekKey(settings.DeepSeekKey)
      if (settings.VolcengineKey) setVolcengineKey(settings.VolcengineKey)
      if (settings.ModelScopeKey) setModelScopeKey(settings.ModelScopeKey)
      if (settings.KimiKey) setKimiKey(settings.KimiKey)
      if (settings.apiProvider) setApiProvider(settings.apiProvider)
      if (settings.googleApiKey) setGoogleApiKey(settings.googleApiKey)
      if (settings.searchProvider) setSearchProvider(settings.searchProvider)
      if (settings.tavilyApiKey) setTavilyApiKey(settings.tavilyApiKey)
      if (settings.serpapiApiKey) setSerpapiApiKey(settings.serpapiApiKey)
      if (settings.exaApiKey) setExaApiKey(settings.exaApiKey)
      setToolsApiProvider(
        resolveToolsApiEditorProvider({
          searchProvider: settings.searchProvider,
          tavilyApiKey: settings.tavilyApiKey || ENV_VARS.tavilyApiKey,
          serpapiApiKey: settings.serpapiApiKey || ENV_VARS.serpapiApiKey,
          exaApiKey: settings.exaApiKey || ENV_VARS.exaApiKey,
        }),
      )
      if (settings.backendUrl && !ENV_VARS.backendUrl) setBackendUrl(settings.backendUrl)
      if (settings.contextTurns || settings.contextMessageLimit) {
        setContextTurns(Number(settings.contextTurns || settings.contextMessageLimit))
      }
      if (settings.themeColor && THEMES[settings.themeColor]) {
        setThemeColor(settings.themeColor)
      } else {
        setThemeColor('violet')
      }
      if (settings.fontSize) setFontSize(settings.fontSize)
      if (typeof settings.enableRelatedQuestions === 'boolean')
        setEnableRelatedQuestions(settings.enableRelatedQuestions)
      if (typeof settings.followInterfaceLanguage === 'boolean')
        setFollowInterfaceLanguage(settings.followInterfaceLanguage)
      if (typeof settings.enableLongTermMemory === 'boolean')
        setEnableLongTermMemory(settings.enableLongTermMemory)
      if (settings.defaultModel) setDefaultModel(settings.defaultModel)
      if (settings.liteModel) setLiteModel(settings.liteModel)
      if (settings.defaultModelProvider) setDefaultModelProvider(settings.defaultModelProvider)
      if (settings.liteModelProvider) setLiteModelProvider(settings.liteModelProvider)
      if (settings.defaultModelSource) setDefaultModelSource(settings.defaultModelSource)
      if (settings.liteModelSource) setLiteModelSource(settings.liteModelSource)
      if (settings.defaultModelSource === 'custom')
        setDefaultCustomModel(settings.defaultModel || '')
      if (settings.liteModelSource === 'custom') setLiteCustomModel(settings.liteModel || '')

      if (settings.embeddingProvider) setEmbeddingProvider(settings.embeddingProvider)
      if (settings.embeddingModelSource)
        setEmbeddingModelSource(settings.embeddingModelSource || 'list')
      if (settings.embeddingModel) setEmbeddingModel(settings.embeddingModel)
      if (settings.embeddingModelSource === 'custom')
        setEmbeddingCustomModel(settings.embeddingModel || '')
      if (typeof settings.userSelfIntro === 'string') {
        setUserSelfIntro(settings.userSelfIntro)
        initialSelfIntroRef.current = settings.userSelfIntro
      } else {
        initialSelfIntroRef.current = ''
      }
      setDeveloperMode(settings.developerMode || false)
      setIntroQuery('')
      setIntroEmbeddingVector(null)
      setIntroEmbeddingState({ status: 'idle', message: '' })
      setIntroSearchState({
        status: 'idle',
        message: '',
        similarity: null,
        query: '',
        matchText: '',
      })
      setDocumentParseState({
        status: 'idle',
        message: '',
        fileName: '',
        characters: 0,
        chunks: 0,
        truncated: false,
      })
      setDocumentText('')
      setDocumentChunks([])
      setDocumentQuery('')
      setDocumentIndexState({ status: 'idle', message: '', progress: 0 })
      setDocumentSearchState({ status: 'idle', message: '', results: [], query: '' })
      // Initialize interfaceLanguage from i18n.language (which reads from localStorage)
      setInterfaceLanguage(i18n.language)

      // Fetch Remote (Async Update)
      if (settings.databaseProvider) {
        fetchRemoteSettings().then(({ data }) => {
          if (data) {
            if (data.OpenAICompatibilityKey) setOpenAICompatibilityKey(data.OpenAICompatibilityKey)
            if (data.OpenAICompatibilityUrl) setOpenAICompatibilityUrl(data.OpenAICompatibilityUrl)
            if (data.SiliconFlowKey) setSiliconFlowKey(data.SiliconFlowKey)
            if (data.NvidiaKey) setNvidiaKey(data.NvidiaKey)
            if (data.MinimaxKey) setMinimaxKey(data.MinimaxKey)
            if (data.GlmKey) setGlmKey(data.GlmKey)
            if (data.DeepSeekKey) setDeepSeekKey(data.DeepSeekKey)
            if (data.VolcengineKey) setVolcengineKey(data.VolcengineKey)
            if (data.ModelScopeKey) setModelScopeKey(data.ModelScopeKey)
            if (data.KimiKey) setKimiKey(data.KimiKey)
            if (data.googleApiKey) setGoogleApiKey(data.googleApiKey)
            if (data.searchProvider) setSearchProvider(data.searchProvider)
            if (data.tavilyApiKey) setTavilyApiKey(data.tavilyApiKey)
            if (data.serpapiApiKey) setSerpapiApiKey(data.serpapiApiKey)
            if (data.exaApiKey) setExaApiKey(data.exaApiKey)
            setToolsApiProvider(
              resolveToolsApiEditorProvider({
                searchProvider: data.searchProvider || settings.searchProvider,
                tavilyApiKey: data.tavilyApiKey || settings.tavilyApiKey || ENV_VARS.tavilyApiKey,
                serpapiApiKey:
                  data.serpapiApiKey || settings.serpapiApiKey || ENV_VARS.serpapiApiKey,
                exaApiKey: data.exaApiKey || settings.exaApiKey || ENV_VARS.exaApiKey,
              }),
            )
            if (data.backendUrl && !ENV_VARS.backendUrl) setBackendUrl(data.backendUrl)
            if (data.embeddingProvider) setEmbeddingProvider(data.embeddingProvider)
            if (data.embeddingModelSource)
              setEmbeddingModelSource(data.embeddingModelSource || 'list')
            if (data.embeddingModel) setEmbeddingModel(data.embeddingModel)
            if (data.embeddingModelSource === 'custom')
              setEmbeddingCustomModel(data.embeddingModel || '')
            if (data.defaultModel !== undefined) setDefaultModel(data.defaultModel || '')
            if (data.liteModel !== undefined) setLiteModel(data.liteModel || '')
            if (data.defaultModelProvider !== undefined)
              setDefaultModelProvider(data.defaultModelProvider || '')
            if (data.liteModelProvider !== undefined)
              setLiteModelProvider(data.liteModelProvider || '')
            if (data.defaultModelSource) setDefaultModelSource(data.defaultModelSource || 'list')
            if (data.liteModelSource) setLiteModelSource(data.liteModelSource || 'list')
            if (data.defaultModelSource === 'custom') setDefaultCustomModel(data.defaultModel || '')
            if (data.liteModelSource === 'custom') setLiteCustomModel(data.liteModel || '')
            if (data.enableLongTermMemory !== undefined) {
              setEnableLongTermMemory(String(data.enableLongTermMemory) === 'true')
            }
            if (typeof data.userSelfIntro === 'string') {
              setUserSelfIntro(data.userSelfIntro)
              initialSelfIntroRef.current = data.userSelfIntro
            }
          }
        })
      }
      loadProviders()
    }
  }, [isOpen, i18n, dbAccessKey, databaseProvider])

  useEffect(() => {
    if (!isOpen) return
    const handleDatabaseSettingsChanged = () => {
      const settings = loadSettings()
      setDatabaseProvider(settings.databaseProvider || '')
      setDbAccessKey(settings.dbAccessKey || '')
    }
    window.addEventListener('database-settings-changed', handleDatabaseSettingsChanged)
    return () => {
      window.removeEventListener('database-settings-changed', handleDatabaseSettingsChanged)
    }
  }, [isOpen])

  useScrollLock(isOpen)

  const getEmbeddingModelLabel = value => {
    if (!value) return ''
    const models = embeddingGroupedModels[embeddingProvider] || []
    const match = models.find(model => model.value === value)
    return match?.label || value
  }

  const buildOpenAIEmbeddingRequest = async ({ apiKey, baseUrl, modelId, input }) => {
    if (!apiKey) {
      throw new Error(t('settings.embeddingTestMissingKey'))
    }
    if (!baseUrl) {
      throw new Error(t('settings.embeddingTestMissingConfig'))
    }

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: modelId, input }),
    })

    if (!response.ok) {
      const message = await response.text().catch(() => '')
      throw new Error(message || `HTTP ${response.status}`)
    }

    const data = await response.json()
    const embedding = data?.data?.[0]?.embedding
    if (!Array.isArray(embedding)) {
      throw new Error(t('settings.embeddingTestInvalidResponse'))
    }
    return embedding
  }

  const fetchEmbeddingVector = async ({ text, taskType, prompt }) => {
    const payloadSource = prompt !== undefined && prompt !== null ? prompt : text
    const trimmed = String(payloadSource || '').trim()
    if (!trimmed) {
      throw new Error(t('settings.embeddingTestEmptyIntro'))
    }
    if (!embeddingProvider || !embeddingModel) {
      throw new Error(t('settings.embeddingTestMissingConfig'))
    }

    if (embeddingProvider === 'gemini') {
      const apiKey = googleApiKey || ENV_VARS.googleApiKey
      if (!apiKey) {
        throw new Error(t('settings.embeddingTestMissingKey'))
      }
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${embeddingModel}:embedContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: { parts: [{ text: trimmed }] },
            taskType,
          }),
        },
      )

      if (!response.ok) {
        const message = await response.text().catch(() => '')
        throw new Error(message || `HTTP ${response.status}`)
      }
      const data = await response.json()
      const values = data?.embedding?.values
      if (!Array.isArray(values)) {
        throw new Error(t('settings.embeddingTestInvalidResponse'))
      }
      return values
    }

    if (embeddingProvider === 'modelscope') {
      throw new Error(t('settings.embeddingTestProviderUnsupported'))
    }

    if (embeddingProvider === 'openai_compatibility') {
      const apiKey = OpenAICompatibilityKey || ENV_VARS.openAIKey
      const baseUrl =
        OpenAICompatibilityUrl || ENV_VARS.openAIBaseUrl || 'https://api.openai.com/v1'
      return await buildOpenAIEmbeddingRequest({
        apiKey,
        baseUrl,
        modelId: embeddingModel,
        input: trimmed,
      })
    }

    if (embeddingProvider === 'siliconflow') {
      const apiKey = SiliconFlowKey || ENV_VARS.siliconFlowKey
      return await buildOpenAIEmbeddingRequest({
        apiKey,
        baseUrl: SILICONFLOW_BASE_URL,
        modelId: embeddingModel,
        input: trimmed,
      })
    }

    if (embeddingProvider === 'glm') {
      const apiKey = GlmKey || ENV_VARS.glmKey
      return await buildOpenAIEmbeddingRequest({
        apiKey,
        baseUrl: GLM_BASE_URL,
        modelId: embeddingModel,
        input: trimmed,
      })
    }

    if (embeddingProvider === 'kimi') {
      const apiKey = KimiKey || ENV_VARS.kimiKey
      const baseUrl = getPublicEnv('PUBLIC_KIMI_BASE_URL') || 'https://api.moonshot.cn/v1'
      return await buildOpenAIEmbeddingRequest({
        apiKey,
        baseUrl,
        modelId: embeddingModel,
        input: trimmed,
      })
    }

    throw new Error(t('settings.embeddingTestProviderUnsupported'))
  }

  const cosineSimilarity = (left, right) => {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      throw new Error(t('settings.embeddingTestDimensionMismatch'))
    }
    let dot = 0
    let leftNorm = 0
    let rightNorm = 0
    for (let i = 0; i < left.length; i += 1) {
      const l = left[i]
      const r = right[i]
      dot += l * r
      leftNorm += l * l
      rightNorm += r * r
    }
    if (leftNorm === 0 || rightNorm === 0) return 0
    return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
  }

  const splitIntoSentences = text => {
    const regex = /[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/g
    return text.match(regex) || []
  }

  const buildDocumentChunks = text => {
    if (!text) return { chunks: [], truncated: false }
    const paragraphs = text
      .split(/\n{2,}/)
      .map(item => item.trim())
      .filter(Boolean)
    const sentences = paragraphs.flatMap(paragraph => {
      const parts = splitIntoSentences(paragraph)
      return parts.length > 0 ? parts : [paragraph]
    })

    if (sentences.length === 0) {
      return { chunks: [], truncated: false }
    }

    const chunks = []
    let current = ''
    for (const sentence of sentences) {
      const next = current ? `${current} ${sentence}` : sentence
      if (next.length > DOCUMENT_CHUNK_SIZE && current) {
        chunks.push(current.trim())
        const overlap = DOCUMENT_CHUNK_OVERLAP > 0 ? current.slice(-DOCUMENT_CHUNK_OVERLAP) : ''
        current = overlap ? `${overlap} ${sentence}` : sentence
      } else {
        current = next
      }
    }
    if (current.trim()) chunks.push(current.trim())

    const truncated = chunks.length > DOCUMENT_MAX_CHUNKS
    return {
      chunks: truncated ? chunks.slice(0, DOCUMENT_MAX_CHUNKS) : chunks,
      truncated,
    }
  }

  const handleDocumentUpload = async event => {
    const file = event.target.files?.[0]
    if (!file) return

    setDocumentParseState({
      status: 'loading',
      message: t('settings.documentParsing'),
      fileName: file.name,
      characters: 0,
      chunks: 0,
      truncated: false,
    })
    setDocumentText('')
    setDocumentChunks([])
    setDocumentQuery('')
    setDocumentIndexState({ status: 'idle', message: '', progress: 0 })
    setDocumentSearchState({ status: 'idle', message: '', results: [], query: '' })

    try {
      const rawText = await extractTextFromFile(file, {
        unsupportedMessage: t('settings.documentUnsupportedType'),
      })
      const normalized = normalizeExtractedText(rawText)
      if (!normalized) {
        throw new Error(t('settings.documentEmpty'))
      }
      const { chunks, truncated } = buildDocumentChunks(normalized)
      setDocumentText(normalized)
      setDocumentChunks(chunks.map((chunk, index) => ({ id: index, text: chunk, embedding: null })))
      setDocumentParseState({
        status: 'success',
        message: t('settings.documentParsed', { chunks: chunks.length }),
        fileName: file.name,
        characters: normalized.length,
        chunks: chunks.length,
        truncated,
      })
    } catch (err) {
      setDocumentParseState({
        status: 'error',
        message: err?.message || t('settings.documentParseFailed'),
        fileName: file.name,
        characters: 0,
        chunks: 0,
        truncated: false,
      })
    } finally {
      event.target.value = ''
    }
  }

  const handleDocumentIndex = async () => {
    if (!embeddingProvider || !embeddingModel) {
      setDocumentIndexState({
        status: 'error',
        message: t('settings.embeddingTestMissingConfig'),
        progress: 0,
      })
      return
    }
    if (documentChunks.length === 0) {
      setDocumentIndexState({
        status: 'error',
        message: t('settings.documentMissingChunks'),
        progress: 0,
      })
      return
    }

    setDocumentIndexState({
      status: 'loading',
      message: t('settings.documentIndexingProgress', { current: 0, total: documentChunks.length }),
      progress: 0,
    })
    const indexed = []
    try {
      const docTitle = documentParseState.fileName?.trim() || 'Document'
      for (let index = 0; index < documentChunks.length; index += 1) {
        const chunk = documentChunks[index]
        const chunkPrompt = `passage: ${docTitle}. ${chunk.text}`
        const vector = await fetchEmbeddingVector({
          text: chunk.text,
          taskType: 'RETRIEVAL_DOCUMENT',
          prompt: chunkPrompt,
        })
        indexed.push({ ...chunk, embedding: vector })
        setDocumentIndexState({
          status: 'loading',
          message: t('settings.documentIndexingProgress', {
            current: index + 1,
            total: documentChunks.length,
          }),
          progress: (index + 1) / documentChunks.length,
        })
      }
      setDocumentChunks(indexed)
      setDocumentIndexState({
        status: 'success',
        message: t('settings.documentIndexed', { chunks: indexed.length }),
        progress: 1,
      })
    } catch (err) {
      setDocumentIndexState({
        status: 'error',
        message: err?.message || t('settings.documentIndexFailed'),
        progress: 0,
      })
    }
  }

  const handleDocumentSearch = async () => {
    if (!embeddingProvider || !embeddingModel) {
      setDocumentSearchState({
        status: 'error',
        message: t('settings.embeddingTestMissingConfig'),
        results: [],
        query: '',
      })
      return
    }
    const query = documentQuery.trim()
    if (!query) {
      setDocumentSearchState({
        status: 'error',
        message: t('settings.documentMissingQuery'),
        results: [],
        query: '',
      })
      return
    }
    if (!documentChunks.some(chunk => Array.isArray(chunk.embedding))) {
      setDocumentSearchState({
        status: 'error',
        message: t('settings.documentMissingVectors'),
        results: [],
        query: '',
      })
      return
    }

    setDocumentSearchState({
      status: 'loading',
      message: t('settings.testing'),
      results: [],
      query,
    })
    try {
      const queryVector = await fetchEmbeddingVector({
        text: query,
        prompt: `query: ${query}`,
        taskType: 'RETRIEVAL_QUERY',
      })
      const scored = documentChunks
        .filter(chunk => Array.isArray(chunk.embedding))
        .map(chunk => ({
          id: chunk.id,
          text: chunk.text,
          score: cosineSimilarity(chunk.embedding, queryVector),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, DOCUMENT_TOP_K)

      setDocumentSearchState({
        status: 'success',
        message: t('settings.documentSearchDone', { count: scored.length }),
        results: scored,
        query,
      })
    } catch (err) {
      setDocumentSearchState({
        status: 'error',
        message: err?.message || t('settings.documentSearchFailed'),
        results: [],
        query: '',
      })
    }
  }

  const handleIntroEmbedding = async () => {
    setIntroEmbeddingState({ status: 'loading', message: t('settings.testing') })
    setIntroSearchState({
      status: 'idle',
      message: '',
      similarity: null,
      query: '',
      matchText: '',
    })
    try {
      const introPrompt = `passage: Self intro. ${userSelfIntro}`
      const vector = await fetchEmbeddingVector({
        text: userSelfIntro,
        prompt: introPrompt,
        taskType: 'RETRIEVAL_DOCUMENT',
      })
      setIntroEmbeddingVector(vector)
      setIntroEmbeddingState({
        status: 'success',
        message: t('settings.embeddingTestStored', { count: vector.length }),
      })
    } catch (err) {
      setIntroEmbeddingState({
        status: 'error',
        message: err?.message || t('errors.generic'),
      })
    }
  }

  const handleIntroSearchTest = async () => {
    if (!introEmbeddingVector) {
      setIntroSearchState({
        status: 'error',
        message: t('settings.embeddingTestMissingVector'),
        similarity: null,
        query: '',
        matchText: '',
      })
      return
    }
    setIntroSearchState({
      status: 'loading',
      message: t('settings.testing'),
      similarity: null,
      query: '',
      matchText: '',
    })
    try {
      const queryText = introQuery.trim() || userSelfIntro.trim()
      const queryVector = await fetchEmbeddingVector({
        text: queryText,
        prompt: `query: ${queryText}`,
        taskType: 'RETRIEVAL_QUERY',
      })
      const similarity = cosineSimilarity(introEmbeddingVector, queryVector)
      setIntroSearchState({
        status: 'success',
        message: t('settings.embeddingTestSimilarity', {
          score: similarity.toFixed(3),
        }),
        similarity,
        query: queryText,
        matchText: userSelfIntro.trim(),
      })
    } catch (err) {
      setIntroSearchState({
        status: 'error',
        message: err?.message || t('errors.generic'),
        similarity: null,
        query: '',
        matchText: '',
      })
    }
  }

  const loadEmbeddingModels = async () => {
    setEmbeddingModelsLoading(true)
    setEmbeddingModelsError('')
    const keys = {
      gemini: googleApiKey || ENV_VARS.googleApiKey,
      openai_compatibility: OpenAICompatibilityKey || ENV_VARS.openAIKey,
      openai_compatibility_url: OpenAICompatibilityUrl || ENV_VARS.openAIBaseUrl,
      siliconflow: SiliconFlowKey || ENV_VARS.siliconFlowKey,
      nvidia: NvidiaKey,
      minimax: MinimaxKey,
      glm: GlmKey || ENV_VARS.glmKey,
      deepseek: DeepSeekKey || ENV_VARS.deepseekKey,
      volcengine: VolcengineKey || ENV_VARS.volcengineKey,
      modelscope: ModelScopeKey || ENV_VARS.modelscopeKey,
      kimi: KimiKey || ENV_VARS.kimiKey,
    }

    const enabledProviders = []
    const grouped = {}

    for (const key of PROVIDER_KEYS) {
      let credentials = {}
      if (key === 'gemini') credentials = { apiKey: keys.gemini }
      else if (key === 'siliconflow')
        credentials = { apiKey: keys.siliconflow, baseUrl: SILICONFLOW_BASE_URL }
      else if (key === 'nvidia')
        credentials = { apiKey: keys.nvidia, baseUrl: 'https://integrate.api.nvidia.com/v1' } // Hardcode or import constant? I cannot import constant in React component easily if not already imported or if it conflicts. But I imported SILICONFLOW_BASE_URL. I should import NVIDIA_BASE_URL or just hardcode as I did. Wait, check imports.
      else if (key === 'glm') credentials = { apiKey: keys.glm }
      else if (key === 'deepseek')
        credentials = { apiKey: keys.deepseek, baseUrl: DEEPSEEK_BASE_URL }
      else if (key === 'volcengine')
        credentials = { apiKey: keys.volcengine, baseUrl: VOLCENGINE_BASE_URL }
      else if (key === 'modelscope') credentials = { apiKey: keys.modelscope }
      else if (key === 'kimi') credentials = { apiKey: keys.kimi }
      else if (key === 'openai_compatibility')
        credentials = { apiKey: keys.openai_compatibility, baseUrl: keys.openai_compatibility_url }

      if (!credentials.apiKey) continue

      try {
        const models = await getModelsForProvider(key, credentials)
        const filtered = (Array.isArray(models) ? models : []).filter(matchesEmbeddingKeyword)
        if (filtered.length === 0) {
          grouped[key] = []
          continue
        }
        grouped[key] = filtered
        enabledProviders.push(key)
      } catch (err) {
        console.error(`Failed to fetch models for ${key}`, err)
        grouped[key] = []
      }
    }

    const uniqueProviders = Array.from(new Set(enabledProviders))
    setEmbeddingAvailableProviders(uniqueProviders)
    setEmbeddingGroupedModels(grouped)

    if (uniqueProviders.length === 0) {
      setEmbeddingProvider('')
      setEmbeddingModelsLoading(false)
      return
    }

    const fallbackProvider = uniqueProviders.includes(embeddingProvider)
      ? embeddingProvider
      : uniqueProviders.includes(apiProvider)
        ? apiProvider
        : uniqueProviders[0]

    if (fallbackProvider && fallbackProvider !== embeddingProvider) {
      setEmbeddingProvider(fallbackProvider)
    }

    setEmbeddingModelsLoading(false)
  }

  const findProviderForModel = modelId => {
    if (!modelId) return ''
    for (const [pKey, models] of Object.entries(chatGroupedModels)) {
      if (models.some(m => m.value === modelId)) return pKey
    }
    return ''
  }

  const getModelLabel = modelId => {
    if (!modelId) return t('agents.model.notSelected')
    const match = Object.values(chatGroupedModels)
      .flat()
      .find(m => m.value === modelId)
    if (match) return match.label
    return t('agents.model.notFound')
  }

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
    const modelToTest = defaultModelSource === 'list' ? defaultModel : defaultCustomModel
    const resolvedProvider = resolveProvider(
      modelToTest,
      defaultModelProvider || apiProvider,
      defaultModelSource,
      defaultModelProvider,
    )
    setDefaultTestAction({ status: 'loading', message: t('agents.model.testing') })
    try {
      await runModelTest({
        modelId: modelToTest,
        providerKey: resolvedProvider,
        structured: false,
      })
      setDefaultTestAction({ status: 'success', message: t('agents.model.testConnectivityOk') })
    } catch (err) {
      setDefaultTestAction({
        status: 'error',
        message: t('agents.model.testFailed', { message: err?.message || 'Unknown error' }),
      })
    }
  }

  const handleLiteModelTest = async () => {
    const modelToTest = liteModelSource === 'list' ? liteModel : liteCustomModel
    const resolvedProvider = resolveProvider(
      modelToTest,
      liteModelProvider || apiProvider,
      liteModelSource,
      liteModelProvider,
    )
    setLiteTestAction({ status: 'loading', message: t('agents.model.testing') })
    try {
      await runModelTest({
        modelId: modelToTest,
        providerKey: resolvedProvider,
        structured: false,
      })
      const structuredText = await runModelTest({
        modelId: modelToTest,
        providerKey: resolvedProvider,
        structured: true,
      })
      const parsed = parseJsonFromText(structuredText)
      if (!parsed) {
        throw new Error(t('agents.model.testInvalidJson'))
      }
      setLiteTestAction({
        status: 'success',
        message: `${t('agents.model.testConnectivityOk')} ${t('agents.model.testStructuredOk')}`,
      })
    } catch (err) {
      setLiteTestAction({
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
    customValue,
    onCustomValueChange,
    modelSource,
    onModelSourceChange,
    allowEmpty = false,
    hideProviderSelector = false,
    testAction,
    availableProviders = [],
  }) => {
    const providers = availableProviders
    const resolvedProvider = providers.includes(activeProvider)
      ? activeProvider
      : providers[0] || activeProvider
    const activeModels = chatGroupedModels[resolvedProvider] || []
    const selectedLabel = getModelLabel(value)
    const showList = modelSource === 'list'
    const displayLabel = showList ? selectedLabel : customValue || value || t('agents.model.custom')

    return (
      <div className="space-y-3">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="flex w-full flex-col gap-2 sm:w-auto">
            <div className="flex w-full flex-wrap items-center gap-3">
              <label className="shrink-0 text-sm font-medium text-gray-700 dark:text-gray-300">
                {label}
              </label>

              {/* Desktop: Inline Segmented Control */}
              <div className="hidden rounded-lg border border-gray-200 bg-gray-100 p-0.5 sm:flex dark:border-zinc-700 dark:bg-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    onModelSourceChange('list')
                    const existsInList = activeModels.some(m => m.value === value)
                    if (!existsInList) onChange('')
                  }}
                  className={clsx(
                    'rounded-md px-3 py-1 text-xs font-medium transition-all',
                    modelSource === 'list'
                      ? 'bg-black/5 text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:bg-white/10 dark:text-gray-100'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300',
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
                    'rounded-md px-3 py-1 text-xs font-medium transition-all',
                    modelSource === 'custom'
                      ? 'bg-black/5 text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:bg-white/10 dark:text-gray-100'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300',
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
            <div className="flex w-full rounded-lg border border-gray-200 bg-gray-100 p-1 sm:hidden dark:border-zinc-700 dark:bg-zinc-800">
              <button
                type="button"
                onClick={() => {
                  onModelSourceChange('list')
                  const existsInList = activeModels.some(m => m.value === value)
                  if (!existsInList) onChange('')
                }}
                className={clsx(
                  'flex-1 rounded-md py-1.5 text-xs font-medium transition-all',
                  modelSource === 'list'
                    ? 'bg-black/5 text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:bg-white/10 dark:text-gray-100'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300',
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
                  'flex-1 rounded-md py-1.5 text-xs font-medium transition-all',
                  modelSource === 'custom'
                    ? 'bg-black/5 text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:bg-white/10 dark:text-gray-100'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300',
                )}
              >
                {t('agents.model.sourceCustom')}
              </button>
            </div>

            {hint && <p className="max-w-2xl text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
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
            title={displayLabel}
            className="mt-1 w-full text-left text-xs break-all text-gray-500 sm:mt-0 sm:w-auto sm:max-w-[320px] sm:text-right dark:text-gray-400"
          >
            {displayLabel}
          </span>
        </div>
        <div className="rounded-lg border-none bg-black/5 p-3 dark:bg-white/5">
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
                  disabled={!providers.length}
                >
                  <SelectTrigger className="h-10 w-full">
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
              <span className="text-xs font-semibold tracking-wide text-gray-400 uppercase">
                {t('agents.model.models')}
              </span>
              {showList ? (
                <Select
                  value={value || (allowEmpty ? '__none__' : undefined)}
                  onValueChange={val => onChange(val === '__none__' ? '' : val)}
                  disabled={!activeModels.length && !allowEmpty}
                >
                  <SelectTrigger className="h-10 w-full">
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
                  onChange={e => {
                    const nextVal = e.target.value
                    onCustomValueChange(nextVal)
                    onChange(nextVal)
                  }}
                  placeholder={t('agents.model.customPlaceholder')}
                  className="focus:ring-primary-500 focus:border-primary-500 block h-10 w-full rounded-md border-gray-200 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const loadChatModels = async () => {
    setIsChatModelsLoading(true)
    const keys = {
      gemini: googleApiKey || ENV_VARS.googleApiKey,
      openai_compatibility: OpenAICompatibilityKey || ENV_VARS.openAIKey,
      openai_compatibility_url: OpenAICompatibilityUrl || ENV_VARS.openAIBaseUrl,
      siliconflow: SiliconFlowKey || ENV_VARS.siliconFlowKey,
      nvidia: NvidiaKey,
      minimax: MinimaxKey,
      glm: GlmKey || ENV_VARS.glmKey,
      deepseek: DeepSeekKey || ENV_VARS.deepseekKey,
      volcengine: VolcengineKey || ENV_VARS.volcengineKey,
      modelscope: ModelScopeKey || ENV_VARS.modelscopeKey,
      kimi: KimiKey || ENV_VARS.kimiKey,
    }

    const grouped = {}
    const enabledProviders = []
    const promises = configuredChatProviders.map(async key => {
      let credentials = {}
      if (key === 'gemini') credentials = { apiKey: keys.gemini }
      else if (key === 'siliconflow')
        credentials = { apiKey: keys.siliconflow, baseUrl: SILICONFLOW_BASE_URL }
      else if (key === 'nvidia')
        credentials = { apiKey: keys.nvidia, baseUrl: 'https://integrate.api.nvidia.com/v1' }
      else if (key === 'glm') credentials = { apiKey: keys.glm }
      else if (key === 'deepseek')
        credentials = { apiKey: keys.deepseek, baseUrl: DEEPSEEK_BASE_URL }
      else if (key === 'volcengine')
        credentials = { apiKey: keys.volcengine, baseUrl: VOLCENGINE_BASE_URL }
      else if (key === 'modelscope') credentials = { apiKey: keys.modelscope }
      else if (key === 'kimi') credentials = { apiKey: keys.kimi }
      else if (key === 'openai_compatibility')
        credentials = { apiKey: keys.openai_compatibility, baseUrl: keys.openai_compatibility_url }

      try {
        const models = await getModelsForProvider(key, credentials)
        enabledProviders.push(key)
        const normalizedModels = Array.isArray(models) ? models : []
        return {
          key,
          models:
            normalizedModels.length > 0 ? normalizedModels : FALLBACK_MODEL_OPTIONS[key] || [],
        }
      } catch (err) {
        console.error(`Failed to fetch chat models for ${key}`, err)
        enabledProviders.push(key)
        return { key, models: FALLBACK_MODEL_OPTIONS[key] || [] }
      }
    })

    const results = (await Promise.all(promises)).filter(Boolean)
    results.forEach(({ key, models }) => {
      if (models.length > 0) {
        grouped[key] = models
      }
    })

    setChatGroupedModels(grouped)
    const uniqueProviders = Array.from(new Set(enabledProviders))
    if (uniqueProviders.length === 0) {
      setDefaultModelProvider('')
      setLiteModelProvider('')
      setIsChatModelsLoading(false)
      return
    }
    if (!uniqueProviders.includes(defaultModelProvider)) {
      setDefaultModelProvider(uniqueProviders[0])
    }
    if (!uniqueProviders.includes(liteModelProvider)) {
      setLiteModelProvider(uniqueProviders[0])
    }
    setIsChatModelsLoading(false)
  }

  useEffect(() => {
    if (isOpen && activeTab === 'model') {
      loadEmbeddingModels()
      loadChatModels()
    }
  }, [isOpen, activeTab])

  useEffect(() => {
    if (embeddingModelSource !== 'list') return
    const activeModels = embeddingGroupedModels[embeddingProvider] || []
    if (!activeModels.length) {
      return
    }
    if (embeddingModel && !activeModels.some(model => model.value === embeddingModel)) {
      setEmbeddingModel('')
    }
  }, [embeddingModel, embeddingModelSource, embeddingGroupedModels, embeddingProvider])

  useEffect(() => {
    setIntroEmbeddingVector(null)
    setIntroEmbeddingState({ status: 'idle', message: '' })
    setIntroSearchState({ status: 'idle', message: '', similarity: null, query: '', matchText: '' })
  }, [userSelfIntro, embeddingProvider, embeddingModel])

  useEffect(() => {
    setDocumentIndexState({ status: 'idle', message: '', progress: 0 })
    setDocumentSearchState({ status: 'idle', message: '', results: [], query: '' })
    setDocumentChunks(prev => prev.map(chunk => ({ ...chunk, embedding: null })))
  }, [documentText, embeddingProvider, embeddingModel])

  const requiredTables = [
    'spaces',
    'agents',
    'space_agents',
    'conversations',
    'conversation_messages',
  ]

  const getMissingTables = result => {
    if (!result?.tables) return requiredTables
    return requiredTables.filter(table => !result.tables[table])
  }

  const copyInitSql = async () => {
    try {
      await navigator.clipboard.writeText(INIT_SQL_SCRIPT)
      setCopiedInitSql(true)
      setTimeout(() => setCopiedInitSql(false), 2000)
    } catch (err) {
      console.error('Failed to copy init.sql', err)
    }
  }

  const handleRetestAfterInit = async () => {
    if (!isSupabaseProvider) return
    setRetestingDb(true)
    const result = await testConnection()

    setInitModalResult(result)
    setRetestingDb(false)
    if (result.success) {
      setIsInitModalOpen(false)
    }
  }

  const handleTestConnection = async () => {
    setRetestingDb(true)
    const result = await testConnection()
    setInitModalResult(result)
    setRetestingDb(false)
    if (!result?.success) {
      setIsInitModalOpen(true)
    }
  }

  const activeEmbeddingModels = embeddingGroupedModels[embeddingProvider] || []
  const embeddingDisplayLabel = embeddingModel
    ? getEmbeddingModelLabel(embeddingModel)
    : t('agents.model.notSelected')
  const embeddingProviderLabel = embeddingProvider
    ? t(`settings.providers.${embeddingProvider}`)
    : t('settings.embeddingProvider')
  const canRunIntroEmbedding = Boolean(
    userSelfIntro.trim() &&
    embeddingProvider &&
    embeddingModel &&
    introEmbeddingState.status !== 'loading',
  )
  const canRunIntroSearch = Boolean(
    introEmbeddingVector &&
    (introQuery.trim() || userSelfIntro.trim()) &&
    embeddingProvider &&
    embeddingModel &&
    introSearchState.status !== 'loading',
  )
  const canRunDocumentIndex = Boolean(
    documentChunks.length > 0 &&
    embeddingProvider &&
    embeddingModel &&
    documentIndexState.status !== 'loading',
  )
  const canRunDocumentSearch = Boolean(
    documentQuery.trim() &&
    documentChunks.some(chunk => Array.isArray(chunk.embedding)) &&
    embeddingProvider &&
    embeddingModel &&
    documentSearchState.status !== 'loading',
  )
  const selectedDbProvider =
    dbProviders.find(provider => provider.type === databaseProvider) || dbProviders[0]
  const isSupabaseProvider = selectedDbProvider?.type === 'supabase'

  if (!isOpen) return null

  const resolveBackendUrlForHealthCheck = () => {
    return ENV_VARS.backendUrl || backendUrl || getBackendUrl()
  }

  const handleBackendHealthCheck = async () => {
    const baseUrl = resolveBackendUrlForHealthCheck()
    if (!baseUrl) return

    setBackendHealthState({ status: 'loading', message: t('settings.backendHealthChecking') })
    try {
      const normalizedBase = baseUrl.replace(/\/+$/, '')
      const healthUrl = `${normalizedBase}/api/health`
      const response = await fetch(healthUrl, { cache: 'no-store' })
      if (!response.ok) {
        const errorMessage = `${response.status} ${response.statusText}`.trim()
        throw new Error(errorMessage || t('settings.backendHealthCheckFailure'))
      }
      setBackendHealthState({
        status: 'success',
        message: t('settings.backendHealthCheckSuccess'),
      })
    } catch (err) {
      const failureMessage = err?.message
        ? `${t('settings.backendHealthCheckFailure')}: ${err.message}`
        : t('settings.backendHealthCheckFailure')
      setBackendHealthState({ status: 'error', message: failureMessage })
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const resolvedDatabaseProvider = selectedDbProvider?.type || databaseProvider || ''
      const dbChanged =
        resolvedDatabaseProvider !== initialDbConfigRef.current.provider ||
        dbAccessKey !== initialDbConfigRef.current.accessKey
      const settingsToSave = {
        apiProvider,
        googleApiKey,
        searchProvider,
        tavilyApiKey,
        serpapiApiKey,
        exaApiKey,
        backendUrl,
        // API Keys
        OpenAICompatibilityKey,
        OpenAICompatibilityUrl,
        GoogleApiKey: googleApiKey,
        SiliconFlowKey,
        NvidiaKey,
        MinimaxKey,
        GlmKey,
        DeepSeekKey,
        VolcengineKey,
        ModelScopeKey,
        KimiKey,
        // Providers
        databaseProvider: resolvedDatabaseProvider,
        databaseProviderLabel: selectedDbProvider?.label || '',
        dbAccessKey,
        supabaseUrl,
        supabaseKey,
        // UI
        themeColor,
        fontSize,
        interfaceLanguage,
        followInterfaceLanguage,
        // Advanced
        developerMode,
        // Chat
        enableRelatedQuestions,
        contextTurns,
        // Memory
        enableLongTermMemory,

        userSelfIntro,
        // Embedding
        embeddingProvider,
        embeddingModel,
        embeddingModelSource,
        defaultModel: defaultModelSource === 'list' ? defaultModel : defaultCustomModel,
        liteModel: liteModelSource === 'list' ? liteModel : liteCustomModel,
        defaultModelProvider,
        liteModelProvider,
        defaultModelSource,
        liteModelSource,
        developerMode,
        embeddingCustomModel,
      }

      // If a field is managed by environment variables, keep it runtime-readonly:
      // do not persist it to local/remote settings.
      const envManagedKeys = getEnvManagedSettingKeys()
      envManagedKeys.forEach(key => {
        delete settingsToSave[key]
      })

      const didPassValidation = validateSettingsForSave(settingsToSave)
      if (!didPassValidation) {
        // Validation failed (toast/alert would handle it inside validate or UI)
        return
      }

      // Save to local storage
      await saveSettings(settingsToSave)

      // Prevent accidental overwrite of remote keys with empty local keys
      if (resolvedDatabaseProvider) {
        try {
          const { data: remoteData } = await fetchRemoteSettings()
          if (remoteData) {
            // Keys to keep on sync mismatch
            const SYNC_KEYS = [
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
              'backendUrl',
              'NvidiaKey',
              'MinimaxKey',
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
            ]

            SYNC_KEYS.forEach(key => {
              if (envManagedKeys.includes(key)) return
              const val = settingsToSave[key]
              // Only overwrite if local is empty/null/undefined (preserve false/0)
              if ((val === '' || val === null || val === undefined) && remoteData[key]) {
                settingsToSave[key] = remoteData[key]
              }
            })
          }
        } catch (err) {
          console.error('Failed to merge remote settings:', err)
        }
      }

      // Save Remote (if connected)
      if (resolvedDatabaseProvider) {
        await saveRemoteSettings(settingsToSave)
      }

      initialSelfIntroRef.current = userSelfIntro
      onClose()
      if (dbChanged) {
        navigate({ to: '/new_chat' })
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-100 flex items-start justify-center overflow-y-auto bg-black/50 p-0 backdrop-blur-sm md:items-center md:overflow-hidden md:p-4">
      <div className="glass-elite-panel relative flex h-dvh w-full flex-col overflow-hidden rounded-none border-0 md:h-[85vh] md:max-w-5xl md:flex-row md:rounded-3xl">
        {/* Mobile Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-black/5 bg-transparent px-4 md:hidden dark:border-white/5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {t('settings.title')}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800"
          >
            <X size={20} />
          </button>
        </div>

        {/* Sidebar */}
        <div className="no-scrollbar flex w-full shrink-0 flex-row gap-2 overflow-x-auto border-b border-black/5 bg-transparent px-1 py-1 sm:px-4 sm:py-4 md:w-64 md:flex-col md:overflow-visible md:border-r md:border-b-0 dark:border-white/5">
          <h2 className="mb-0 hidden px-2 text-xl font-bold text-gray-900 md:mb-6 md:block dark:text-white">
            {t('settings.title')}
          </h2>
          <nav className="flex w-full flex-row gap-1 md:w-auto md:flex-col">
            {menuItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={clsx(
                  'flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors sm:gap-3',
                  activeTab === item.id
                    ? 'text-primary-600 dark:text-primary-400 bg-black/5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:bg-white/10'
                    : 'text-gray-600 hover:bg-black/5 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white',
                )}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-transparent">
          {/* Header */}
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
          <div
            className="no-scrollbar modal-content-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07)] sm:px-8 sm:py-8"
            style={{ scrollbarGutter: 'stable' }}
          >
            {activeTab === 'general' && (
              <div className="flex max-w-2xl flex-col gap-8">
                {/* ... existing general settings ... */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    {t('settings.interfaceLanguage')}
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('settings.interfaceLanguageHint')}
                  </p>
                  <div className="relative w-full">
                    <Select
                      value={interfaceLanguage}
                      onValueChange={val => {
                        setInterfaceLanguage(val)
                        i18n.changeLanguage(val)
                      }}
                    >
                      <SelectTrigger className="h-10 w-full pl-10">
                        <div className="absolute top-1/2 left-3 flex -translate-y-1/2 items-center">
                          <Monitor size={16} className="text-gray-400" />
                        </div>
                        <SelectValue>
                          {interfaceLanguageOptions.find(
                            option => option.value === interfaceLanguage,
                          )?.label || interfaceLanguage}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {interfaceLanguageOptions.map(option => (
                          <SelectItem key={option.key} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-semibold text-gray-900 dark:text-white">
                      {t('settings.followInterfaceLanguage')}
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('settings.followInterfaceLanguageHint')}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={followInterfaceLanguage}
                    onClick={() => setFollowInterfaceLanguage(prev => !prev)}
                    className={clsx(
                      'focus:ring-primary-500/40 relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus:ring-2 focus:outline-none',
                      followInterfaceLanguage
                        ? 'bg-primary-500 border-primary-500'
                        : 'border-gray-300 bg-gray-200 dark:border-zinc-700 dark:bg-zinc-800',
                    )}
                  >
                    <span
                      className={clsx(
                        'inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform',
                        followInterfaceLanguage ? 'translate-x-[22px]' : 'translate-x-1',
                      )}
                    />
                  </button>
                </div>
                {/* API Provider Selection */}
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-900 dark:text-white">
                      {t('settings.apiProvider')}
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('settings.apiProviderHint')}
                    </p>
                  </div>

                  <div className="relative">
                    <Select value={apiProvider} onValueChange={setApiProvider}>
                      <SelectTrigger className="h-10 w-full pl-10">
                        <div className="absolute top-1/2 left-3 flex -translate-y-1/2 items-center">
                          <Box size={16} className="text-gray-400" />
                        </div>
                        <SelectValue>
                          <div className="flex items-center gap-3">
                            <span
                              className={clsx(
                                'h-2.5 w-2.5 rounded-full',
                                providerConfiguredMap[apiProvider]
                                  ? 'bg-emerald-500'
                                  : 'bg-gray-400 dark:bg-zinc-600',
                              )}
                            />
                            {renderProviderIcon(apiProvider, {
                              size: 16,
                              alt: t(`settings.providers.${apiProvider}`),
                            })}
                            <span>{t(`settings.providers.${apiProvider}`)}</span>
                          </div>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {providerOptions.map(option => (
                          <SelectItem key={option.key} value={option.value}>
                            <div className="flex items-center gap-3">
                              <span
                                className={clsx(
                                  'h-2.5 w-2.5 rounded-full',
                                  providerConfiguredMap[option.value]
                                    ? 'bg-emerald-500'
                                    : 'bg-gray-400 dark:bg-zinc-600',
                                )}
                              />
                              {renderProviderIcon(option.value, { size: 16, alt: option.label })}
                              <span>{option.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Google Settings */}
                  {apiProvider === 'gemini' && (
                    <div className="animate-in fade-in slide-in-from-top-2 flex flex-col gap-2 duration-200">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {t('settings.googleApiKey')}
                      </label>
                      <div className="relative">
                        <div className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
                          <Key size={16} />
                        </div>
                        <input
                          type="password"
                          value={googleApiKey}
                          onChange={e => setGoogleApiKey(e.target.value)}
                          placeholder={t('settings.googleApiKeyPlaceholder')}
                          disabled={Boolean(ENV_VARS.googleApiKey)}
                          className={clsx(
                            'focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-lg border-none bg-black/5 py-2.5 pr-4 pl-10 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none disabled:bg-gray-100/50 disabled:text-gray-500 dark:bg-white/5 dark:text-gray-100 dark:placeholder-zinc-600',
                            ENV_VARS.googleApiKey && 'cursor-not-allowed opacity-70',
                          )}
                        />
                      </div>
                      {ENV_VARS.googleApiKey && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">
                          {t('settings.loadedFromEnvironment')}
                        </p>
                      )}
                    </div>
                  )}

                  {/* MiniMax Settings */}
                  {apiProvider === 'minimax' && (
                    <div className="animate-in fade-in slide-in-from-top-2 flex flex-col gap-4 duration-200">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {t('settings.minimaxApiKey', { defaultValue: 'MiniMax API Key' })}
                        </label>
                        <div className="relative">
                          <div className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
                            <Key size={16} />
                          </div>
                          <input
                            type="password"
                            value={MinimaxKey}
                            onChange={e => setMinimaxKey(e.target.value)}
                            placeholder={t('settings.minimaxApiKeyPlaceholder', {
                              defaultValue: 'Enter your MiniMax API Key',
                            })}
                            className={clsx(
                              'focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-lg border-none bg-black/5 py-2.5 pr-4 pl-10 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none disabled:bg-gray-50/20 dark:bg-white/5 dark:text-gray-100 dark:placeholder-zinc-600',
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* OpenAI Compatible Settings */}
                  {apiProvider === 'openai_compatibility' && (
                    <div className="animate-in fade-in slide-in-from-top-2 flex flex-col gap-4 duration-200">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {t('settings.openaiApiKey')}
                        </label>
                        <div className="relative">
                          <div className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
                            <Key size={16} />
                          </div>
                          <input
                            type="password"
                            value={OpenAICompatibilityKey}
                            onChange={e => setOpenAICompatibilityKey(e.target.value)}
                            placeholder={t('settings.openaiApiKeyPlaceholder')}
                            disabled={Boolean(ENV_VARS.openAIKey)}
                            className={clsx(
                              'focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-lg border-none bg-black/5 py-2.5 pr-4 pl-10 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none disabled:bg-gray-100/50 disabled:text-gray-500 dark:bg-white/5 dark:text-gray-100 dark:placeholder-zinc-600',
                              ENV_VARS.openAIKey && 'cursor-not-allowed opacity-70',
                            )}
                          />
                        </div>
                        {renderEnvHint(Boolean(ENV_VARS.openAIKey))}
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {t('settings.baseUrl')}
                        </label>
                        <div className="relative">
                          <div className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
                            <Link size={16} />
                          </div>
                          <input
                            type="text"
                            value={OpenAICompatibilityUrl}
                            onChange={e => setOpenAICompatibilityUrl(e.target.value)}
                            placeholder={t('settings.baseUrlPlaceholder')}
                            disabled={Boolean(ENV_VARS.openAIBaseUrl)}
                            className={clsx(
                              'focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-lg border-none bg-black/5 py-2.5 pr-4 pl-10 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none disabled:bg-gray-100/50 disabled:text-gray-500 dark:bg-white/5 dark:text-gray-100 dark:placeholder-zinc-600',
                              ENV_VARS.openAIBaseUrl && 'cursor-not-allowed opacity-70',
                            )}
                          />
                        </div>
                        {renderEnvHint(Boolean(ENV_VARS.openAIBaseUrl))}
                      </div>
                    </div>
                  )}

                  {/* SiliconFlow Settings */}
                  {apiProvider === 'siliconflow' && (
                    <div className="animate-in fade-in slide-in-from-top-2 flex flex-col gap-4 duration-200">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {t('settings.siliconflowApiKey')}
                        </label>
                        <div className="relative">
                          <div className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
                            <Key size={16} />
                          </div>
                          <input
                            type="password"
                            value={SiliconFlowKey}
                            onChange={e => setSiliconFlowKey(e.target.value)}
                            placeholder={t('settings.siliconflowApiKeyPlaceholder')}
                            disabled={Boolean(ENV_VARS.siliconFlowKey)}
                            className={clsx(
                              'focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-lg border-none bg-black/5 py-2.5 pr-4 pl-10 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none disabled:bg-gray-50/20 dark:bg-white/5 dark:text-gray-100 dark:placeholder-zinc-600',
                              ENV_VARS.siliconFlowKey && 'cursor-not-allowed opacity-70',
                            )}
                          />
                        </div>
                        {ENV_VARS.siliconFlowKey && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">
                            {t('settings.loadedFromEnvironment')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* NVIDIA Settings */}
                  {apiProvider === 'nvidia' && (
                    <div className="animate-in fade-in slide-in-from-top-2 flex flex-col gap-4 duration-200">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {t('settings.nvidiaApiKey', { defaultValue: 'NVIDIA API Key' })}
                        </label>
                        <div className="relative">
                          <div className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
                            <Key size={16} />
                          </div>
                          <input
                            type="password"
                            value={NvidiaKey}
                            onChange={e => setNvidiaKey(e.target.value)}
                            placeholder={t('settings.nvidiaApiKeyPlaceholder', {
                              defaultValue: 'Enter your NVIDIA API Key',
                            })}
                            className={clsx(
                              'focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-lg border-none bg-black/5 py-2.5 pr-4 pl-10 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none disabled:bg-gray-50/20 dark:bg-white/5 dark:text-gray-100 dark:placeholder-zinc-600',
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* GLM Settings */}
                  {apiProvider === 'glm' && (
                    <div className="animate-in fade-in slide-in-from-top-2 flex flex-col gap-4 duration-200">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {t('settings.glmApiKey')}
                        </label>
                        <div className="relative">
                          <div className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
                            <Key size={16} />
                          </div>
                          <input
                            type="password"
                            value={GlmKey}
                            onChange={e => setGlmKey(e.target.value)}
                            placeholder={t('settings.glmApiKeyPlaceholder')}
                            disabled={Boolean(ENV_VARS.glmKey)}
                            className={clsx(
                              'focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-lg border-none bg-black/5 py-2.5 pr-4 pl-10 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none disabled:bg-gray-50/20 dark:bg-white/5 dark:text-gray-100 dark:placeholder-zinc-600',
                              ENV_VARS.glmKey && 'cursor-not-allowed opacity-70',
                            )}
                          />
                        </div>
                        {ENV_VARS.glmKey && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">
                            {t('settings.loadedFromEnvironment')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* DeepSeek Settings */}
                  {apiProvider === 'deepseek' && (
                    <div className="animate-in fade-in slide-in-from-top-2 flex flex-col gap-4 duration-200">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {t('settings.deepseekApiKey')}
                        </label>
                        <div className="relative">
                          <div className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
                            <Key size={16} />
                          </div>
                          <input
                            type="password"
                            value={DeepSeekKey}
                            onChange={e => setDeepSeekKey(e.target.value)}
                            placeholder={t('settings.deepseekApiKeyPlaceholder')}
                            disabled={Boolean(ENV_VARS.deepseekKey)}
                            className={clsx(
                              'focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-lg border-none bg-black/5 py-2.5 pr-4 pl-10 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none disabled:bg-gray-50/20 dark:bg-white/5 dark:text-gray-100 dark:placeholder-zinc-600',
                              ENV_VARS.deepseekKey && 'cursor-not-allowed opacity-70',
                            )}
                          />
                        </div>
                        {ENV_VARS.deepseekKey && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">
                            {t('settings.loadedFromEnvironment')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Volcengine Settings */}
                  {apiProvider === 'volcengine' && (
                    <div className="animate-in fade-in slide-in-from-top-2 flex flex-col gap-4 duration-200">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {t('settings.volcengineApiKey')}
                        </label>
                        <div className="relative">
                          <div className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
                            <Key size={16} />
                          </div>
                          <input
                            type="password"
                            value={VolcengineKey}
                            onChange={e => setVolcengineKey(e.target.value)}
                            placeholder={t('settings.volcengineApiKeyPlaceholder')}
                            disabled={Boolean(ENV_VARS.volcengineKey)}
                            className={clsx(
                              'focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-lg border-none bg-black/5 py-2.5 pr-4 pl-10 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none disabled:bg-gray-50/20 dark:bg-white/5 dark:text-gray-100 dark:placeholder-zinc-600',
                              ENV_VARS.volcengineKey && 'cursor-not-allowed opacity-70',
                            )}
                          />
                        </div>
                        {ENV_VARS.volcengineKey && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">
                            {t('settings.loadedFromEnvironment')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ModelScope Settings */}
                  {apiProvider === 'modelscope' && (
                    <div className="animate-in fade-in slide-in-from-top-2 flex flex-col gap-4 duration-200">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {t('settings.modelscopeApiKey')}
                        </label>
                        <div className="relative">
                          <div className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
                            <Key size={16} />
                          </div>
                          <input
                            type="password"
                            value={ModelScopeKey}
                            onChange={e => setModelScopeKey(e.target.value)}
                            placeholder={t('settings.modelscopeApiKeyPlaceholder')}
                            disabled={Boolean(ENV_VARS.modelscopeKey)}
                            className={clsx(
                              'focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-lg border-none bg-black/5 py-2.5 pr-4 pl-10 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none disabled:bg-gray-50/20 dark:bg-white/5 dark:text-gray-100 dark:placeholder-zinc-600',
                              ENV_VARS.modelscopeKey && 'cursor-not-allowed opacity-70',
                            )}
                          />
                        </div>
                        {ENV_VARS.modelscopeKey && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">
                            {t('settings.loadedFromEnvironment')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Kimi Settings */}
                  {apiProvider === 'kimi' && (
                    <div className="animate-in fade-in slide-in-from-top-2 flex flex-col gap-4 duration-200">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {t('settings.kimiApiKey')}
                        </label>
                        <div className="relative">
                          <div className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
                            <Key size={16} />
                          </div>
                          <input
                            type="password"
                            value={KimiKey}
                            onChange={e => setKimiKey(e.target.value)}
                            placeholder={t('settings.kimiApiKeyPlaceholder')}
                            disabled={Boolean(ENV_VARS.kimiKey)}
                            className={clsx(
                              'focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-lg border-none bg-black/5 py-2.5 pr-4 pl-10 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none disabled:bg-gray-50/20 dark:bg-white/5 dark:text-gray-100 dark:placeholder-zinc-600',
                              ENV_VARS.kimiKey && 'cursor-not-allowed opacity-70',
                            )}
                          />
                        </div>
                        {ENV_VARS.kimiKey && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">
                            {t('settings.loadedFromEnvironment')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="h-px bg-gray-100 dark:bg-zinc-800" />

                {/* Backend Configuration */}
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-900 dark:text-white">
                      {t('settings.backendConfiguration')}
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {electronMode
                        ? t('settings.backendConfigurationElectronHint')
                        : t('settings.backendConfigurationHint')}
                    </p>
                  </div>

                  <div className="flex flex-col gap-4">
                    {!electronMode && (
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {t('settings.backendUrl')}
                        </label>
                        <div className="relative">
                          <div className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
                            <Link size={16} />
                          </div>
                          <input
                            type="text"
                            value={backendUrl}
                            onChange={e => {
                              setBackendUrl(e.target.value)
                              setBackendHealthState({ status: 'idle', message: '' })
                            }}
                            placeholder={t('settings.backendUrlPlaceholder')}
                            disabled={Boolean(ENV_VARS.backendUrl)}
                            className={clsx(
                              'focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-lg border-none bg-black/5 py-2.5 pr-4 pl-10 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none disabled:bg-gray-50/20 dark:bg-white/5 dark:text-gray-100 dark:placeholder-zinc-600',
                              ENV_VARS.backendUrl && 'cursor-not-allowed opacity-70',
                            )}
                          />
                        </div>
                        {renderEnvHint(Boolean(ENV_VARS.backendUrl))}
                      </div>
                    )}
                    {electronMode && (
                      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
                        {t('settings.backendDesktopManaged', {
                          backendUrl: getBackendUrl(),
                        })}
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleBackendHealthCheck}
                        disabled={backendHealthState.status === 'loading'}
                        className={clsx(
                          'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                          'border-slate-300 text-gray-700 hover:bg-gray-50 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-800',
                        )}
                      >
                        {backendHealthState.status === 'loading' && (
                          <RefreshCw size={12} className="animate-spin" />
                        )}
                        {t('settings.backendHealthCheck')}
                      </button>

                      {backendHealthState.status !== 'idle' && (
                        <div
                          className={clsx(
                            'flex items-center gap-1.5 text-xs font-medium',
                            backendHealthState.status === 'success' &&
                              'text-emerald-600 dark:text-emerald-400',
                            backendHealthState.status === 'error' &&
                              'text-rose-600 dark:text-rose-400',
                            backendHealthState.status === 'loading' &&
                              'text-gray-500 dark:text-gray-400',
                          )}
                        >
                          {backendHealthState.status === 'success' && <Check size={14} />}
                          {backendHealthState.status === 'error' && <X size={14} />}
                          <span>{backendHealthState.message}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="h-px bg-gray-100 dark:bg-zinc-800" />

                {/* Database Config */}
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-900 dark:text-white">
                      {t('settings.databaseConfiguration')}
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('settings.databaseConfigurationHint')}
                    </p>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {t('settings.databaseProvider')}
                      </label>
                      <div className="flex h-10 cursor-not-allowed items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-200">
                        {selectedDbProvider ? (
                          renderProviderIcon(selectedDbProvider.type || selectedDbProvider.id, {
                            size: 16,
                            alt: selectedDbProvider.label || selectedDbProvider.id,
                          })
                        ) : (
                          <Database size={16} className="text-gray-400" />
                        )}
                        <span>
                          {selectedDbProvider?.label ||
                            databaseProvider ||
                            t('settings.databaseProvider')}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={onOpenDatabaseSetup}
                        className={clsx(
                          'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                          'border-slate-300 text-gray-700 hover:bg-gray-50 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-800',
                        )}
                      >
                        <Settings size={12} />
                        {electronMode
                          ? t('settings.openDatabaseManager')
                          : t('settings.configureDatabase') || 'Configure Database'}
                      </button>

                      {databaseProvider && (
                        <>
                          <button
                            onClick={handleTestConnection}
                            disabled={retestingDb}
                            className={clsx(
                              'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                              'border-slate-300 text-gray-700 hover:bg-gray-50 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-800',
                            )}
                          >
                            {retestingDb ? (
                              <RefreshCw size={12} className="animate-spin" />
                            ) : (
                              <RefreshCw size={12} />
                            )}
                            {t('settings.testDatabaseConnection') || 'Test Connection'}
                          </button>

                          {initModalResult && initModalResult.success && (
                            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                              <Check size={14} />
                              <span>{t('settings.initModal.connectionOk') || 'Connection OK'}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="h-px bg-gray-100 dark:bg-zinc-800" />

                {/* Tools API Configuration */}
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-900 dark:text-white">
                      {t('settings.toolsApiConfiguration')}
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('settings.toolsApiConfigurationHint')}
                    </p>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {t('settings.toolsApiProvider')}
                      </label>
                      <div className="relative w-full">
                        <Select value={toolsApiProvider} onValueChange={setToolsApiProvider}>
                          <SelectTrigger className="h-10 w-full pl-10">
                            <div className="absolute top-1/2 left-3 flex -translate-y-1/2 items-center">
                              <Search size={16} className="text-gray-400" />
                            </div>
                            <SelectValue>
                              <div className="flex items-center gap-3">
                                <span
                                  className={clsx(
                                    'h-2.5 w-2.5 rounded-full',
                                    toolsApiProviderConfiguredMap[toolsApiProvider]
                                      ? 'bg-emerald-500'
                                      : 'bg-gray-400 dark:bg-zinc-600',
                                  )}
                                />
                                {renderProviderIcon(toolsApiProvider, {
                                  size: 16,
                                  alt: t(`settings.toolsApiProviders.${toolsApiProvider}`),
                                })}
                                <span>
                                  {toolsApiProviderOptions.find(
                                    option => option.value === toolsApiProvider,
                                  )?.label || toolsApiProvider}
                                </span>
                              </div>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {toolsApiProviderOptions.map(option => (
                              <SelectItem key={option.key} value={option.value}>
                                <div className="flex items-center gap-3">
                                  <span
                                    className={clsx(
                                      'h-2.5 w-2.5 rounded-full',
                                      toolsApiProviderConfiguredMap[option.value]
                                        ? 'bg-emerald-500'
                                        : 'bg-gray-400 dark:bg-zinc-600',
                                    )}
                                  />
                                  {renderProviderIcon(option.value, {
                                    size: 16,
                                    alt: option.label,
                                  })}
                                  <span>{option.label}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {toolsApiProvider === 'tavily' && (
                      <div className="animate-in fade-in slide-in-from-top-2 flex flex-col gap-2 duration-200">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {t('settings.toolsApiKey')} (Tavily)
                        </label>
                        <div className="relative">
                          <div className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
                            <Key size={16} />
                          </div>
                          <input
                            type="password"
                            value={tavilyApiKey}
                            onChange={e => setTavilyApiKey(e.target.value)}
                            placeholder={t('settings.toolsApiKeyPlaceholder')}
                            disabled={Boolean(ENV_VARS.tavilyApiKey)}
                            className={clsx(
                              'focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-lg border-none bg-black/5 py-2.5 pr-4 pl-10 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none disabled:bg-gray-50/20 dark:bg-white/5 dark:text-gray-100 dark:placeholder-zinc-600',
                              ENV_VARS.tavilyApiKey && 'cursor-not-allowed opacity-70',
                            )}
                          />
                        </div>
                        {ENV_VARS.tavilyApiKey && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">
                            {t('settings.loadedFromEnvironment')}
                          </p>
                        )}
                      </div>
                    )}
                    {toolsApiProvider === 'serpapi' && (
                      <div className="animate-in fade-in slide-in-from-top-2 flex flex-col gap-2 duration-200">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                            {t('settings.toolsApiKey')} (SerpApi)
                          </label>
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                            {t('settings.imageSearchNote')}
                          </span>
                        </div>
                        <div className="relative">
                          <div className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
                            <Key size={16} />
                          </div>
                          <input
                            type="password"
                            value={serpapiApiKey}
                            onChange={e => setSerpapiApiKey(e.target.value)}
                            placeholder={t('settings.serpApiKeyPlaceholder')}
                            disabled={Boolean(ENV_VARS.serpapiApiKey)}
                            className={clsx(
                              'focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-lg border-none bg-black/5 py-2.5 pr-4 pl-10 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none disabled:bg-gray-50/20 dark:bg-white/5 dark:text-gray-100 dark:placeholder-zinc-600',
                              ENV_VARS.serpapiApiKey && 'cursor-not-allowed opacity-70',
                            )}
                          />
                        </div>
                        {ENV_VARS.serpapiApiKey && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">
                            {t('settings.loadedFromEnvironment')}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-amber-600 italic dark:text-amber-400">
                          *{' '}
                          {t('settings.serpApiImageSearchNote', {
                            defaultValue: 'Currently used for Image Search only.',
                          })}
                        </p>
                      </div>
                    )}
                    {toolsApiProvider === 'exa' && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                            {t('settings.toolsApiKey')} (Exa)
                          </label>
                          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                            {t('settings.exaApiKeyHint')}
                          </span>
                        </div>
                        <div className="relative">
                          <div className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
                            <Key size={16} />
                          </div>
                          <input
                            type="password"
                            value={exaApiKey}
                            onChange={e => setExaApiKey(e.target.value)}
                            placeholder={t('settings.toolsApiKeyPlaceholder')}
                            disabled={Boolean(ENV_VARS.exaApiKey)}
                            className={clsx(
                              'focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-lg border-none bg-black/5 py-2.5 pr-4 pl-10 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none disabled:bg-gray-50/20 dark:bg-white/5 dark:text-gray-100 dark:placeholder-zinc-600',
                              ENV_VARS.exaApiKey && 'cursor-not-allowed opacity-70',
                            )}
                          />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t('settings.exaApiKeyDescription')}
                        </p>
                        {ENV_VARS.exaApiKey && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">
                            {t('settings.loadedFromEnvironment')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'model' && (
              <div className="flex flex-col gap-8">
                {/* Global Dialogue Models Section */}
                <div className="space-y-6">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-gray-900 dark:text-white">
                          {t('settings.globalChatModels')}
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t('settings.globalChatModelsHint')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={loadChatModels}
                        className="text-primary-600 hover:text-primary-700 dark:text-primary-400 flex items-center gap-1 text-xs font-medium"
                      >
                        <RefreshCw
                          size={14}
                          className={clsx(isChatModelsLoading && 'animate-spin')}
                        />
                        {t('agents.model.refresh')}
                      </button>
                    </div>
                  </div>

                  {isChatModelsLoading ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-gray-500">
                      <RefreshCw className="animate-spin" size={20} />
                      <span>{t('settings.loadingModels')}</span>
                    </div>
                  ) : configuredChatProviders.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500 dark:border-zinc-700 dark:text-gray-400">
                      <p className="font-medium text-gray-700 dark:text-gray-300">
                        {t('settings.chatNoProvidersTitle')}
                      </p>
                      <p className="mt-1">{t('settings.chatNoProvidersHint')}</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-8">
                      {renderModelPicker({
                        label: t('settings.defaultModel'),
                        hint: t('settings.defaultModelHelper'),
                        value: defaultModel,
                        onChange: setDefaultModel,
                        activeProvider: defaultModelProvider || apiProvider,
                        onProviderChange: setDefaultModelProvider,
                        customValue: defaultCustomModel,
                        onCustomValueChange: setDefaultCustomModel,
                        modelSource: defaultModelSource,
                        onModelSourceChange: setDefaultModelSource,
                        availableProviders: configuredChatProviders,
                        testAction: {
                          label: t('agents.model.testDefault'),
                          onClick: handleDefaultModelTest,
                          status: defaultTestAction.status,
                          message: defaultTestAction.message,
                        },
                      })}

                      {renderModelPicker({
                        label: t('settings.liteModel'),
                        hint: t('settings.liteModelHelper'),
                        value: liteModel,
                        onChange: setLiteModel,
                        activeProvider: liteModelProvider || apiProvider,
                        onProviderChange: setLiteModelProvider,
                        customValue: liteCustomModel,
                        onCustomValueChange: setLiteCustomModel,
                        modelSource: liteModelSource,
                        onModelSourceChange: setLiteModelSource,
                        availableProviders: configuredChatProviders,
                        testAction: {
                          label: t('agents.model.testLite'),
                          onClick: handleLiteModelTest,
                          status: liteTestAction.status,
                          message: liteTestAction.message,
                        },
                      })}
                    </div>
                  )}
                </div>

                <div className="h-px bg-gray-100 dark:bg-zinc-800" />

                <div className="flex gap-3 rounded-lg bg-blue-50 p-4 text-sm text-blue-700 dark:bg-blue-900/10 dark:text-blue-300">
                  <Info size={18} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">{t('settings.embeddingConfiguration')}</p>
                    <p className="opacity-90">{t('settings.embeddingConfigurationHint')}</p>
                  </div>
                </div>

                {embeddingModelsLoading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-gray-500">
                    <RefreshCw className="animate-spin" size={20} />
                    <span>{t('settings.loadingModels')}</span>
                  </div>
                ) : embeddingAvailableProviders.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500 dark:border-zinc-700 dark:text-gray-400">
                    <p className="font-medium text-gray-700 dark:text-gray-300">
                      {t('settings.embeddingNoProvidersTitle')}
                    </p>
                    <p className="mt-1">{t('settings.embeddingNoProvidersHint')}</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>
                        {t('settings.embeddingModelsLoaded', { count: embeddingModelCount })}
                      </span>
                      <button
                        type="button"
                        onClick={loadEmbeddingModels}
                        className="text-primary-600 hover:text-primary-700 dark:text-primary-400 flex items-center gap-1"
                      >
                        <RefreshCw size={14} />
                        {t('settings.embeddingRefreshModels')}
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                        <div className="flex w-full flex-col gap-2 sm:w-auto">
                          <div className="flex w-full flex-wrap items-center gap-3">
                            <label className="shrink-0 text-sm font-medium text-gray-700 dark:text-gray-300">
                              {t('settings.embeddingModel')}
                            </label>
                            <div className="flex rounded-lg border border-gray-200 bg-gray-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
                              <button
                                type="button"
                                onClick={() => {
                                  setEmbeddingModelSource('list')
                                  if (
                                    !activeEmbeddingModels.some(
                                      model => model.value === embeddingModel,
                                    )
                                  ) {
                                    setEmbeddingModel('')
                                  }
                                }}
                                className={clsx(
                                  'rounded-md px-3 py-1 text-xs font-medium transition-all',
                                  embeddingModelSource === 'list'
                                    ? 'bg-black/5 text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:bg-white/10 dark:text-gray-100'
                                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300',
                                )}
                              >
                                {t('settings.modelSourceList')}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEmbeddingModelSource('custom')
                                  const nextValue = embeddingCustomModel || embeddingModel || ''
                                  setEmbeddingCustomModel(nextValue)
                                  setEmbeddingModel(nextValue)
                                }}
                                className={clsx(
                                  'rounded-md px-3 py-1 text-xs font-medium transition-all',
                                  embeddingModelSource === 'custom'
                                    ? 'bg-black/5 text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:bg-white/10 dark:text-gray-100'
                                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300',
                                )}
                              >
                                {t('settings.modelSourceCustom')}
                              </button>
                            </div>
                          </div>
                          <p className="max-w-2xl text-xs text-gray-500 dark:text-gray-400">
                            {t('settings.embeddingModelHint')}
                          </p>
                        </div>
                        <span className="mt-1 w-full truncate text-left text-xs text-gray-500 sm:mt-0 sm:w-auto sm:text-right dark:text-gray-400">
                          {embeddingDisplayLabel}
                        </span>
                      </div>

                      <div className="rounded-lg border-none bg-black/5 p-3 dark:bg-white/5">
                        <div className="flex flex-col gap-3">
                          <div className="relative flex flex-col gap-2">
                            <span className="text-xs font-semibold tracking-wide text-gray-400 uppercase">
                              {t('settings.embeddingProvider')}
                            </span>
                            <Select value={embeddingProvider} onValueChange={setEmbeddingProvider}>
                              <SelectTrigger className="h-10 w-full">
                                <SelectValue>
                                  <div className="flex items-center gap-3">
                                    {renderProviderIcon(embeddingProvider, {
                                      size: 16,
                                      alt: embeddingProviderLabel,
                                    })}
                                    <span>{embeddingProviderLabel}</span>
                                  </div>
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {embeddingAvailableProviders.map(key => (
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

                          <div className="flex flex-col gap-2">
                            <span className="text-xs font-semibold tracking-wide text-gray-400 uppercase">
                              {t('settings.embeddingModel')}
                            </span>
                            {embeddingModelSource === 'list' ? (
                              <Select
                                value={embeddingModel}
                                onValueChange={setEmbeddingModel}
                                disabled={!activeEmbeddingModels.length}
                              >
                                <SelectTrigger className="h-10 w-full">
                                  <SelectValue placeholder={t('agents.model.notSelected')}>
                                    <div className="flex items-center gap-2 truncate">
                                      {getModelIcon(embeddingModel) && (
                                        <img
                                          src={getModelIcon(embeddingModel)}
                                          alt=""
                                          className={clsx(
                                            'h-4 w-4 shrink-0',
                                            getModelIconClassName(embeddingModel),
                                          )}
                                        />
                                      )}
                                      <span className="truncate">
                                        {activeEmbeddingModels.find(m => m.value === embeddingModel)
                                          ?.label ||
                                          embeddingModel ||
                                          t('agents.model.notSelected')}
                                      </span>
                                    </div>
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {activeEmbeddingModels.length > 0 ? (
                                    activeEmbeddingModels.map(model => (
                                      <SelectItem key={model.value} value={model.value}>
                                        <div className="flex items-center gap-2 truncate">
                                          {getModelIcon(model.value) && (
                                            <img
                                              src={getModelIcon(model.value)}
                                              alt=""
                                              className={clsx(
                                                'h-4 w-4 shrink-0',
                                                getModelIconClassName(model.value),
                                              )}
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
                                value={embeddingCustomModel}
                                onChange={e => {
                                  const nextValue = e.target.value
                                  setEmbeddingCustomModel(nextValue)
                                  setEmbeddingModel(nextValue)
                                }}
                                placeholder={t('settings.customModelIdPlaceholder')}
                                className="focus:ring-primary-500/20 w-full rounded-lg border-none bg-black/5 px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:outline-none disabled:bg-gray-50/20 dark:bg-white/5 dark:text-gray-200"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
                {embeddingModelsError && (
                  <div className="text-sm text-red-500">{embeddingModelsError}</div>
                )}
              </div>
            )}

            {activeTab === 'memory' && (
              <div className="flex max-w-3xl flex-col gap-6">
                <div className="flex gap-3 rounded-lg bg-blue-50 p-4 text-sm text-blue-700 dark:bg-blue-900/10 dark:text-blue-300">
                  <Info size={18} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">{t('settings.longTermMemory')}</p>
                    <p className="opacity-90">{t('settings.longTermMemoryHint')}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border-none bg-black/5 p-4 dark:bg-white/5">
                  <div className="space-y-0.5">
                    <label className="text-sm font-semibold text-gray-900 dark:text-white">
                      {t('settings.enableLongTermMemory')}
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('settings.enableLongTermMemoryHint') || t('settings.longTermMemoryHint')}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enableLongTermMemory}
                    onClick={() => setEnableLongTermMemory(prev => !prev)}
                    className={clsx(
                      'focus:ring-primary-500/40 relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus:ring-2 focus:outline-none',
                      enableLongTermMemory
                        ? 'bg-primary-500 border-primary-500'
                        : 'border-gray-300 bg-gray-200 dark:border-zinc-700 dark:bg-zinc-800',
                    )}
                  >
                    <span
                      className={clsx(
                        'inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform',
                        enableLongTermMemory ? 'translate-x-[22px]' : 'translate-x-1',
                      )}
                    />
                  </button>
                </div>

                {enableLongTermMemory && (
                  <div className="animate-in fade-in slide-in-from-top-2 flex flex-col gap-8 duration-300">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-gray-900 dark:text-white">
                          {t('settings.userSelfIntro')}
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t('settings.userSelfIntroHint')}
                        </p>
                      </div>
                      <textarea
                        value={userSelfIntro}
                        onChange={e => setUserSelfIntro(e.target.value)}
                        placeholder={t('settings.userSelfIntroPlaceholder')}
                        rows={4}
                        className="focus:ring-primary-500/20 focus:border-primary-500 w-full resize-none rounded-lg border-none bg-black/5 px-4 py-3 text-sm placeholder-gray-400 transition-all focus:ring-2 focus:outline-none dark:bg-white/5 dark:placeholder-zinc-600"
                      />
                    </div>

                    <div className="h-px bg-gray-100 dark:bg-zinc-800" />

                    <div className="rounded-xl border border-black/5 bg-black/[0.03] p-4 dark:border-white/5 dark:bg-white/[0.03]">
                      <div className="flex flex-col gap-1">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                          {t('settings.memory.fileSkillTitle')}
                        </h3>
                        <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                          {t('settings.memory.fileSkillDescription')}
                        </p>
                        <code className="mt-2 inline-flex w-fit rounded-md bg-black/5 px-2 py-1 text-[11px] text-gray-700 dark:bg-white/5 dark:text-gray-300">
                          backend-python/.skills/agent-memory/memories/
                        </code>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'personalization' && (
              <div className="flex max-w-2xl flex-col gap-8">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-900 dark:text-white">
                      {t('settings.embeddingTestTitle')}
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('settings.embeddingTestHint')}
                    </p>
                  </div>

                  {(!embeddingProvider || !embeddingModel) && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {t('settings.embeddingTestNeedsConfig')}
                    </p>
                  )}

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      {t('settings.embeddingTestQueryLabel')}
                    </label>
                    <input
                      type="text"
                      value={introQuery}
                      onChange={e => setIntroQuery(e.target.value)}
                      placeholder={t('settings.embeddingTestQueryPlaceholder')}
                      className="focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-lg border-none bg-black/5 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none disabled:bg-gray-50/20 dark:bg-white/5 dark:text-gray-100 dark:placeholder-zinc-600"
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleIntroEmbedding}
                      disabled={!canRunIntroEmbedding}
                      className="text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 border-primary-200 dark:border-primary-800 flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {introEmbeddingState.status === 'loading' && (
                        <RefreshCw size={14} className="animate-spin" />
                      )}
                      {introEmbeddingState.status === 'loading'
                        ? t('settings.testing')
                        : t('settings.embeddingTestIndex')}
                    </button>
                    <button
                      type="button"
                      onClick={handleIntroSearchTest}
                      disabled={!canRunIntroSearch}
                      className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-gray-200 dark:hover:bg-zinc-800"
                    >
                      {introSearchState.status === 'loading' && (
                        <RefreshCw size={14} className="animate-spin" />
                      )}
                      {introSearchState.status === 'loading'
                        ? t('settings.testing')
                        : t('settings.embeddingTestSearch')}
                    </button>
                  </div>

                  {introEmbeddingState.message && (
                    <p
                      className={clsx(
                        'text-xs',
                        introEmbeddingState.status === 'error'
                          ? 'text-red-500'
                          : introEmbeddingState.status === 'success'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-gray-500 dark:text-gray-400',
                      )}
                    >
                      {introEmbeddingState.message}
                    </p>
                  )}

                  {introSearchState.message && (
                    <p
                      className={clsx(
                        'text-xs',
                        introSearchState.status === 'error'
                          ? 'text-red-500'
                          : introSearchState.status === 'success'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-gray-500 dark:text-gray-400',
                      )}
                    >
                      {introSearchState.message}
                    </p>
                  )}

                  {introSearchState.status === 'success' && introSearchState.matchText && (
                    <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-100">
                      <div className="font-semibold">{t('settings.embeddingTestResultTitle')}</div>
                      <div className="text-emerald-800/80 dark:text-emerald-100/80">
                        {t('settings.embeddingTestQueryUsed')}: {introSearchState.query}
                      </div>
                      <div className="text-emerald-800/80 dark:text-emerald-100/80">
                        {t('settings.embeddingTestMatchLabel')}:
                      </div>
                      <div className="whitespace-pre-wrap text-emerald-900 dark:text-emerald-100">
                        {introSearchState.matchText}
                      </div>
                    </div>
                  )}
                </div>

                <div className="h-px bg-gray-100 dark:bg-zinc-800" />

                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-900 dark:text-white">
                      {t('settings.documentTestTitle')}
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('settings.documentTestHint')}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      {t('settings.documentUploadLabel')}
                    </label>
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt,.md,.csv,.json,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={handleDocumentUpload}
                      className="w-full text-sm text-gray-600 file:mr-4 file:rounded-lg file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-200 dark:text-gray-300 dark:file:bg-zinc-800 dark:file:text-gray-200 dark:hover:file:bg-zinc-700"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('settings.documentUploadHint')}
                    </p>
                  </div>

                  {documentParseState.message && (
                    <p
                      className={clsx(
                        'text-xs',
                        documentParseState.status === 'error'
                          ? 'text-red-500'
                          : documentParseState.status === 'success'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-gray-500 dark:text-gray-400',
                      )}
                    >
                      {documentParseState.message}
                    </p>
                  )}

                  {documentParseState.status === 'success' && (
                    <div className="space-y-1 rounded-lg border-none bg-black/5 p-3 text-xs text-gray-700 disabled:bg-gray-50/20 dark:bg-white/5 dark:text-gray-300">
                      <div>
                        {t('settings.documentFileLabel')}: {documentParseState.fileName}
                      </div>
                      <div>
                        {t('settings.documentCharacters')}: {documentParseState.characters}
                      </div>
                      <div>
                        {t('settings.documentChunks')}: {documentParseState.chunks}
                        {documentParseState.truncated && (
                          <span className="ml-2 text-amber-600 dark:text-amber-400">
                            {t('settings.documentChunksTruncated', { max: DOCUMENT_MAX_CHUNKS })}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      {t('settings.documentQueryLabel')}
                    </label>
                    <input
                      type="text"
                      value={documentQuery}
                      onChange={e => setDocumentQuery(e.target.value)}
                      placeholder={t('settings.documentQueryPlaceholder')}
                      className="focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-lg border-none bg-black/5 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none disabled:bg-gray-50/20 dark:bg-white/5 dark:text-gray-100 dark:placeholder-zinc-600"
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleDocumentIndex}
                      disabled={!canRunDocumentIndex}
                      className="text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 border-primary-200 dark:border-primary-800 flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {documentIndexState.status === 'loading' && (
                        <RefreshCw size={14} className="animate-spin" />
                      )}
                      {documentIndexState.status === 'loading'
                        ? t('settings.documentIndexing')
                        : t('settings.documentIndex')}
                    </button>
                    <button
                      type="button"
                      onClick={handleDocumentSearch}
                      disabled={!canRunDocumentSearch}
                      className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-gray-200 dark:hover:bg-zinc-800"
                    >
                      {documentSearchState.status === 'loading'
                        ? t('settings.documentSearching')
                        : t('settings.documentSearch')}
                    </button>
                  </div>

                  {documentIndexState.message && (
                    <p
                      className={clsx(
                        'text-xs',
                        documentIndexState.status === 'error'
                          ? 'text-red-500'
                          : documentIndexState.status === 'success'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-gray-500 dark:text-gray-400',
                      )}
                    >
                      {documentIndexState.message}
                    </p>
                  )}

                  {documentSearchState.message && (
                    <p
                      className={clsx(
                        'text-xs',
                        documentSearchState.status === 'error'
                          ? 'text-red-500'
                          : documentSearchState.status === 'success'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-gray-500 dark:text-gray-400',
                      )}
                    >
                      {documentSearchState.message}
                    </p>
                  )}

                  {documentSearchState.status === 'success' &&
                    documentSearchState.results.length > 0 && (
                      <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-100">
                        <div className="font-semibold">{t('settings.documentResultsTitle')}</div>
                        {documentSearchState.results.map(result => (
                          <div
                            key={result.id}
                            className="rounded-md border border-emerald-200/60 bg-white/60 p-2 dark:border-emerald-900/60 dark:bg-zinc-900/40"
                          >
                            <div className="mb-1 text-emerald-800/80 dark:text-emerald-100/80">
                              {t('settings.documentResultScore')}: {result.score.toFixed(3)}
                            </div>
                            <div className="whitespace-pre-wrap text-emerald-900 dark:text-emerald-100">
                              {result.text.length > 400
                                ? `${result.text.slice(0, 400)}...`
                                : result.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              </div>
            )}

            {activeTab === 'interface' && (
              <div className="flex max-w-2xl flex-col gap-8">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    {t('settings.themeColor')}
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('settings.themeColorHint')}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {Object.entries(THEMES).map(([themeKey, theme]) => (
                    <button
                      key={themeKey}
                      type="button"
                      onClick={() => setThemeColor(themeKey)}
                      className={clsx(
                        'group relative flex flex-col items-center gap-2 rounded-2xl border p-3 text-left transition-all duration-300',
                        themeColor === themeKey
                          ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/20 scale-[1.02] shadow-md'
                          : 'border-none bg-black/5 hover:scale-[1.01] hover:bg-black/10 hover:shadow-md dark:bg-white/5 dark:hover:bg-white/10',
                      )}
                    >
                      {/* Color preview with gradient */}
                      <div className="relative aspect-square w-full overflow-hidden rounded-xl shadow-inner">
                        <div
                          className="absolute inset-0"
                          style={{
                            background: `linear-gradient(135deg, ${theme.colors['--color-primary-400']} 0%, ${theme.colors['--color-primary-600']} 100%)`,
                          }}
                        />
                        {/* Highlight effect */}
                        <div className="absolute inset-0 bg-linear-to-tr from-white/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                      <div className="flex w-full flex-col items-center">
                        <span className="w-full truncate text-center text-sm font-semibold text-gray-900 dark:text-white">
                          {theme.label}
                        </span>
                        <span className="font-mono text-[10px] tracking-wider text-gray-400 uppercase">
                          {theme.colors['--color-primary-500']}
                        </span>
                      </div>
                      {/* Check indicator */}
                      <div
                        className={clsx(
                          'absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full transition-all duration-200',
                          themeColor === themeKey
                            ? 'bg-primary-500 scale-100 text-white'
                            : 'scale-90 bg-white/80 text-transparent opacity-0 group-hover:scale-100 group-hover:opacity-100 dark:bg-zinc-800/80',
                        )}
                      >
                        <Check size={14} strokeWidth={3} />
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-8 flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    {t('settings.messageFontSize')}
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('settings.messageFontSizeHint')}
                  </p>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {['small', 'medium', 'large', 'extra-large'].map(size => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setFontSize(size)}
                      className={clsx(
                        'flex items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-medium transition-all',
                        fontSize === size
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                          : 'border-slate-300 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-400 dark:hover:bg-zinc-800',
                      )}
                    >
                      {t(`settings.fontSize.${size}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'chat' && (
              <div className="flex max-w-2xl flex-col gap-8">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-semibold text-gray-900 dark:text-white">
                      {t('settings.relatedQuestions')}
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('settings.relatedQuestionsHint')}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enableRelatedQuestions}
                    onClick={() => setEnableRelatedQuestions(prev => !prev)}
                    className={clsx(
                      'focus:ring-primary-500/40 relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus:ring-2 focus:outline-none',
                      enableRelatedQuestions
                        ? 'bg-primary-500 border-primary-500'
                        : 'border-gray-300 bg-gray-200 dark:border-zinc-700 dark:bg-zinc-800',
                    )}
                  >
                    <span
                      className={clsx(
                        'inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform',
                        enableRelatedQuestions ? 'translate-x-[22px]' : 'translate-x-1',
                      )}
                    />
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    {t('settings.contextMessages')}
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('settings.contextMessagesHint')}
                  </p>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={contextTurns}
                    onChange={e =>
                      setContextTurns(Math.min(50, Math.max(1, Number(e.target.value) || 1)))
                    }
                    className="focus:ring-primary-500/20 focus:border-primary-500 mt-1 w-32 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100 dark:placeholder-zinc-600"
                  />
                </div>
              </div>
            )}
            {activeTab === 'about' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 flex h-full flex-col items-center justify-center gap-6 text-center duration-500">
                <div className="mb-2 rounded-3xl p-4">
                  <Logo size={128} className="text-gray-900 dark:text-white" />
                </div>

                <div className="flex flex-col items-center gap-2">
                  <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
                    Qurio
                    <span className="bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border-primary-200 dark:border-primary-800 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase">
                      {t('settings.about.beta')}
                    </span>
                  </h1>
                  <p className="max-w-md text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                    {t('settings.about.description')}
                  </p>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <a
                    href="https://github.com/havingautism/Qurio"
                    className="rounded-full border border-gray-200 bg-gray-50 p-2 text-gray-600 transition-all hover:bg-gray-100 hover:text-gray-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-white"
                  >
                    <Github size={18} />
                  </a>
                  {/* <a
                    href="#"
                    className="p-2 rounded-full bg-gray-50 dark:bg-zinc-900 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-white transition-all border border-gray-200 dark:border-zinc-800"
                  >
                    <Twitter size={18} />
                  </a>
                  <a
                    href="#"
                    className="p-2 rounded-full bg-gray-50 dark:bg-zinc-900 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-white transition-all border border-gray-200 dark:border-zinc-800"
                  >
                    <Globe size={18} />
                  </a> */}
                </div>

                <div className="mt-8 flex w-full max-w-xs flex-col gap-1 border-t border-gray-100 pt-8 dark:border-zinc-800">
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500">
                    {t('settings.about.designedAndBuiltBy')}
                  </p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    havingautism & allabouturmind
                  </p>
                </div>

                <p className="mt-auto text-[10px] text-gray-300 dark:text-gray-600">
                  {t('settings.about.version')}
                </p>
              </div>
            )}

            {activeTab === 'advanced' && (
              <div className="flex max-w-2xl flex-col gap-8">
                <div className="flex flex-col gap-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-semibold text-gray-900 dark:text-white">
                        {t('settings.advanced.developerMode')}
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t('settings.advanced.developerModeHint')}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={developerMode}
                      onClick={() => setDeveloperMode(prev => !prev)}
                      className={clsx(
                        'focus:ring-primary-500/40 relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus:ring-2 focus:outline-none',
                        developerMode
                          ? 'bg-primary-500 border-primary-500'
                          : 'border-gray-300 bg-gray-200 dark:border-zinc-700 dark:bg-zinc-800',
                      )}
                    >
                      <span
                        className={clsx(
                          'inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform',
                          developerMode ? 'translate-x-[22px]' : 'translate-x-1',
                        )}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Gmail Settings Panel */}
            {activeTab === 'email' && <EmailSettingsPanel backendUrl={getBackendUrl()} />}
          </div>

          {/* Footer */}
          <div className="flex h-20 shrink-0 items-center justify-end gap-3 border-t border-black/5 bg-transparent px-6 sm:px-8 dark:border-white/5">
            <button
              onClick={onClose}
              className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-zinc-800"
            >
              {t('settings.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-primary-500 flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving && <Loader2 size={16} className="animate-spin" />}
              {t('settings.saveChanges')}
            </button>
          </div>
        </div>
      </div>
      {isInitModalOpen && (
        <div className="fixed inset-0 z-130 flex items-center justify-center px-3 sm:px-6">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsInitModalOpen(false)}
          />
          <div className="glass-elite-panel relative w-full max-w-3xl space-y-4 rounded-3xl border-0 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('settings.initModal.title')}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('settings.initModal.description')}
                </p>
              </div>
              <button
                onClick={() => setIsInitModalOpen(false)}
                className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {initModalResult && (
              <div className="border-primary-200 dark:border-primary-900/40 bg-primary-50 dark:bg-primary-900/20 space-y-2 rounded-lg border p-4">
                <div className="text-primary-900 dark:text-primary-100 text-sm font-medium">
                  {initModalResult.connection
                    ? t('settings.initModal.connectionOk')
                    : t('settings.initModal.connectionFailed')}
                </div>
                {initModalResult.tables && (
                  <div className="text-primary-800 dark:text-primary-100 flex flex-wrap gap-2 text-xs">
                    {requiredTables.map(table => {
                      const exists = initModalResult.tables?.[table]
                      return (
                        <span
                          key={table}
                          className={clsx(
                            'rounded-md border px-2 py-1',
                            exists
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-100'
                              : 'border-primary-200 dark:border-primary-900/40 bg-primary-100/70 dark:bg-primary-900/40',
                          )}
                        >
                          {exists ? t('settings.initModal.ready') : t('settings.initModal.missing')}{' '}
                          鐠?{table}
                        </span>
                      )
                    })}
                  </div>
                )}
                {getMissingTables(initModalResult).length > 0 && (
                  <div className="text-primary-800 dark:text-primary-100 text-xs">
                    {t('settings.initModal.missingLabel')}{' '}
                    {getMissingTables(initModalResult).join(', ')}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                {t('settings.initModal.quickFixSteps')}
              </h4>
              <ol className="list-inside list-decimal space-y-1 text-sm text-gray-700 dark:text-gray-300">
                <li>{t('settings.initModal.step1')}</li>
                <li>{t('settings.initModal.step2')}</li>
              </ol>
            </div>

            <div className="relative">
              <button
                onClick={copyInitSql}
                className="absolute top-3 right-3 flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700"
              >
                <Copy size={14} />
                {copiedInitSql ? t('settings.initModal.copied') : t('settings.initModal.copySql')}
              </button>
              <pre className="max-h-64 overflow-auto rounded-lg border border-gray-800 bg-gray-900 p-4 text-xs whitespace-pre-wrap text-gray-100">
                {INIT_SQL_SCRIPT}
              </pre>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setIsInitModalOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800"
              >
                {t('settings.initModal.close')}
              </button>
              <button
                onClick={handleRetestAfterInit}
                disabled={retestingDb}
                className="bg-primary-500 hover:bg-primary-600 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw size={16} className={retestingDb ? 'animate-spin' : ''} />
                {retestingDb ? t('settings.initModal.retesting') : t('settings.initModal.retest')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SettingsModal
