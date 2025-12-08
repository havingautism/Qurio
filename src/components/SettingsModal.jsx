import { useState, useEffect, useRef } from 'react'
import {
  X,
  Settings,
  MessageSquare,
  Monitor,
  Box,
  Palette,
  User,
  Info,
  Key,
  Link,
  ChevronDown,
  Check,
  Github,
  Twitter,
  Globe,
  RefreshCw,
} from 'lucide-react'
import FiloLogo from './Logo'
import clsx from 'clsx'
import { saveSettings, loadSettings } from '../lib/settings'
import { testConnection } from '../lib/supabase'
import { getModelsForProvider } from '../lib/models_api'
import useScrollLock from '../hooks/useScrollLock'

const ENV_VARS = {
  supabaseUrl: import.meta.env.PUBLIC_SUPABASE_URL,
  supabaseKey: import.meta.env.PUBLIC_SUPABASE_KEY,
  openAIKey: import.meta.env.PUBLIC_OPENAI_API_KEY,
  openAIBaseUrl: import.meta.env.PUBLIC_OPENAI_BASE_URL,
  googleApiKey: import.meta.env.PUBLIC_GOOGLE_API_KEY,
  siliconFlowKey: import.meta.env.PUBLIC_SILICONFLOW_API_KEY,
  siliconFlowBaseUrl: import.meta.env.PUBLIC_SILICONFLOW_BASE_URL,
}

// Fallback model options for when API is unavailable or for providers without model listing
const FALLBACK_MODEL_OPTIONS = {
  gemini: [
    { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  ],
  openai_compatibility: [
    { value: 'gpt-4o', label: 'gpt-4o' },
    { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
    { value: 'gpt-4.1', label: 'gpt-4.1' },
    { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
    { value: 'o3-mini', label: 'o3-mini' },
  ],
  siliconflow: [
    { value: 'deepseek-chat', label: 'deepseek-chat' },
    { value: 'deepseek-reasoner', label: 'deepseek-reasoner' },
    { value: 'deepseek-reasoner-lite', label: 'deepseek-reasoner-lite' },
    { value: 'gpt-4o', label: 'gpt-4o' },
  ],
  __fallback__: [],
}

const getModelOptionsForProvider = (provider, dynamicModels) =>
  dynamicModels && dynamicModels.length > 0
    ? dynamicModels
    : FALLBACK_MODEL_OPTIONS[provider] || FALLBACK_MODEL_OPTIONS.__fallback__

const PROVIDER_LABELS = {
  gemini: 'Google Gemini',
  openai_compatibility: 'OpenAI Compatible',
  siliconflow: 'SiliconFlow',
}

// Provider favicon URLs
const PROVIDER_FAVICONS = {
  gemini: 'https://www.google.com/favicon.ico',
  openai_compatibility: 'https://openai.com/favicon.ico',
  siliconflow: 'https://siliconflow.cn/favicon.ico',
}

const SettingsModal = ({ isOpen, onClose }) => {
  const renderEnvHint = hasEnv =>
    hasEnv ? <p className="text-[10px] text-emerald-500">Loaded from environment</p> : null

  const [activeTab, setActiveTab] = useState('general')
  const [OpenAICompatibilityKey, setOpenAICompatibilityKey] = useState('')
  const [OpenAICompatibilityUrl, setOpenAICompatibilityUrl] = useState('')
  const [SiliconFlowKey, setSiliconFlowKey] = useState('')
  const [SiliconFlowUrl, setSiliconFlowUrl] = useState('')
  const [apiProvider, setApiProvider] = useState('gemini')
  const [googleApiKey, setGoogleApiKey] = useState('')
  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [supabaseKey, setSupabaseKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false)
  const providerDropdownRef = useRef(null)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [contextMessageLimit, setContextMessageLimit] = useState(12)
  const [modelId, setModelId] = useState('')
  // Model configuration states
  const [liteModel, setLiteModel] = useState('gemini-2.5-flash')
  const [defaultModel, setDefaultModel] = useState('gemini-2.5-flash')

  // Dynamic model states
  const [dynamicModels, setDynamicModels] = useState([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [modelsError, setModelsError] = useState(null)
  const [currentProvider, setCurrentProvider] = useState(null) // Track current provider for loading

  // AbortController for cancelling requests
  const abortControllerRef = useRef(null)

  // Handle click outside provider dropdown
  useEffect(() => {
    const handleClickOutside = event => {
      if (providerDropdownRef.current && !providerDropdownRef.current.contains(event.target)) {
        setIsProviderDropdownOpen(false)
      }
    }

    if (isProviderDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isProviderDropdownOpen])

  const menuItems = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'interface', label: 'Interface', icon: Monitor },
    { id: 'model', label: 'Model', icon: Box },
    { id: 'personalization', label: 'Personalization', icon: Palette },
    { id: 'account', label: 'Account', icon: User },
    { id: 'about', label: 'About', icon: Info },
  ]

  // TODO: useEffect to load settings from Supabase/LocalStorage on mount
  // Load settings when modal opens
  useEffect(() => {
    if (isOpen) {
      const settings = loadSettings()
      if (settings.supabaseUrl) setSupabaseUrl(settings.supabaseUrl)
      if (settings.supabaseKey) setSupabaseKey(settings.supabaseKey)
      if (settings.OpenAICompatibilityKey)
        setOpenAICompatibilityKey(settings.OpenAICompatibilityKey)
      if (settings.OpenAICompatibilityUrl)
        setOpenAICompatibilityUrl(settings.OpenAICompatibilityUrl)
      if (settings.SiliconFlowKey) setSiliconFlowKey(settings.SiliconFlowKey)
      if (settings.SiliconFlowUrl) setSiliconFlowUrl(settings.SiliconFlowUrl)
      if (settings.apiProvider) setApiProvider(settings.apiProvider)
      if (settings.googleApiKey) setGoogleApiKey(settings.googleApiKey)
      if (settings.systemPrompt) setSystemPrompt(settings.systemPrompt)
      if (settings.contextMessageLimit) setContextMessageLimit(Number(settings.contextMessageLimit))
      // Load model configuration
      if (settings.liteModel) setLiteModel(settings.liteModel)
      if (settings.defaultModel) setDefaultModel(settings.defaultModel)
    }
  }, [isOpen])

  useScrollLock(isOpen)

  // Cleanup abort controller when component unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  // Function to fetch models for the current provider
  const fetchModelsForProvider = async provider => {
    // Use the current provider if not specified
    const targetProvider = provider || apiProvider

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Create new AbortController for this request
    const controller = new AbortController()
    abortControllerRef.current = controller

    // Set current provider immediately
    const currentProviderRef = targetProvider
    setCurrentProvider(currentProviderRef)

    // Skip for openai_compatibility as it doesn't support model listing
    if (targetProvider === 'openai_compatibility') {
      setDynamicModels([])
      setModelsError(null)
      setIsLoadingModels(false)
      return
    }

    setIsLoadingModels(true)
    setModelsError(null)

    try {
      let credentials = {}

      if (targetProvider === 'gemini') {
        credentials = { apiKey: googleApiKey }
      } else if (targetProvider === 'siliconflow') {
        credentials = {
          apiKey: SiliconFlowKey,
          baseUrl: SiliconFlowUrl || 'https://api.siliconflow.cn/v1',
        }
      }

      if (!credentials.apiKey) {
        setDynamicModels([])
        setIsLoadingModels(false)
        return
      }

      const models = await getModelsForProvider(targetProvider, credentials, {
        signal: controller.signal,
      })

      // Check if request was aborted
      if (controller.signal.aborted) {
        console.log('Request was aborted')
        return
      }

      // Update states regardless of provider change since we want to show the fetched models
      console.log(`Successfully fetched ${models.length} models for ${targetProvider}`)
      setDynamicModels(models)
      setModelsError(null)
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Request was cancelled')
        return
      }

      console.error('Failed to fetch models:', error)

      // Only update error state if request wasn't aborted
      if (!controller.signal.aborted) {
        setModelsError(error.message)
        setDynamicModels([])
      }
    } finally {
      // Always update loading state when request completes
      if (!controller.signal.aborted) {
        setIsLoadingModels(false)
      }
    }
  }

  // Fetch models when provider changes or when modal opens with valid credentials
  useEffect(() => {
    if (isOpen) {
      // Check if we should fetch models for this provider
      const hasValidCredentials =
        (apiProvider === 'gemini' && googleApiKey) ||
        (apiProvider === 'siliconflow' && SiliconFlowKey) ||
        apiProvider === 'openai_compatibility'

      if (hasValidCredentials) {
        // Clear previous state when provider changes
        setModelsError(null)
        setDynamicModels([])
        setIsLoadingModels(false)

        const debounceTimer = setTimeout(() => {
          fetchModelsForProvider(apiProvider)
        }, 500) // Debounce to avoid too many API calls

        return () => clearTimeout(debounceTimer)
      } else {
        // No valid credentials, clear model state
        setDynamicModels([])
        setModelsError(null)
        setIsLoadingModels(false)
      }
    }
  }, [apiProvider, isOpen])

  // Fetch models when credentials change for current provider (excluding apiProvider to avoid duplicate calls)
  useEffect(() => {
    if (isOpen && apiProvider) {
      const hasValidCredentials =
        (apiProvider === 'gemini' && googleApiKey) ||
        (apiProvider === 'siliconflow' && SiliconFlowKey)

      if (hasValidCredentials) {
        const debounceTimer = setTimeout(() => {
          fetchModelsForProvider(apiProvider)
        }, 1000)

        return () => clearTimeout(debounceTimer)
      }
    }
  }, [googleApiKey, SiliconFlowKey, SiliconFlowUrl])

  if (!isOpen) return null

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)

    const result = await testConnection(supabaseUrl, supabaseKey)
    setTestResult(result)
    setTesting(false)
  }

  const handleSave = async () => {
    // TODO: Validate inputs

    await saveSettings({
      apiProvider,
      googleApiKey,
      OpenAICompatibilityKey,
      OpenAICompatibilityUrl,
      SiliconFlowKey,
      SiliconFlowUrl,
      supabaseUrl,
      supabaseKey,
      systemPrompt,
      contextMessageLimit,
      // Save model configuration
      liteModel,
      defaultModel,
    })

    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start md:items-center justify-center bg-black/50 backdrop-blur-sm p-3 md:p-4 overflow-y-auto md:overflow-hidden">
      <div className="w-full max-w-4xl h-[calc(100vh-1.5rem)] md:h-[80vh] max-h-[calc(100vh-1.5rem)] bg-white dark:bg-[#191a1a] rounded-2xl shadow-2xl flex flex-col md:flex-row overflow-hidden border border-gray-200 dark:border-zinc-800">
        {/* Mobile Header */}
        <div className="md:hidden h-14 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between px-4 bg-white dark:bg-[#191a1a] shrink-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Sidebar */}
        <div className="w-full md:w-64 bg-gray-50 dark:bg-[#202222] border-b md:border-b-0 md:border-r border-gray-200 dark:border-zinc-800 p-4 flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-visible shrink-0">
          <h2 className="text-xl font-bold mb-0 md:mb-6 px-2 text-gray-900 dark:text-white hidden md:block">
            Settings
          </h2>
          <nav className="flex flex-row md:flex-col gap-1 w-full md:w-auto">
            {menuItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                  activeTab === item.id
                    ? 'bg-gray-100 dark:bg-zinc-800 text-cyan-600 dark:text-cyan-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-800',
                )}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white dark:bg-[#191a1a]">
          {/* Header */}
          <div className="h-16 border-b border-gray-200 dark:border-zinc-800 hidden md:flex items-center justify-between px-6 sm:px-8">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white capitalize">
              {activeTab}
            </h3>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6 sm:p-8 min-h-0">
            {activeTab === 'general' && (
              <div className="flex flex-col gap-8 max-w-2xl">
                {/* ... existing general settings ... */}
                {/* API Provider Selection */}
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-900 dark:text-white">
                      API Provider
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Choose your preferred AI provider.
                    </p>
                  </div>

                  <div className="relative" ref={providerDropdownRef}>
                    <button
                      onClick={() => setIsProviderDropdownOpen(!isProviderDropdownOpen)}
                      className="w-full flex items-center justify-between pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800"
                    >
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center">
                        <Box size={16} className="text-gray-400" />
                      </div>
                      <div className="flex items-center gap-3">
                        <img
                          src={PROVIDER_FAVICONS[apiProvider]}
                          alt={PROVIDER_LABELS[apiProvider] || apiProvider}
                          className="w-4 h-4"
                        />
                        <span>{PROVIDER_LABELS[apiProvider] || apiProvider}</span>
                      </div>
                      <ChevronDown
                        size={16}
                        className={clsx(
                          'text-gray-400 transition-transform duration-200',
                          isProviderDropdownOpen && 'rotate-180',
                        )}
                      />
                    </button>

                    {isProviderDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                        <button
                          onClick={() => {
                            // Cancel any ongoing request before switching
                            if (abortControllerRef.current) {
                              abortControllerRef.current.abort()
                              abortControllerRef.current = null
                            }

                            setApiProvider('gemini')
                            setIsProviderDropdownOpen(false)
                            // Clear all model-related state when switching providers
                            setModelsError(null)
                            setDynamicModels([])
                            setIsLoadingModels(false)
                            setCurrentProvider('gemini')
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <img
                              src={PROVIDER_FAVICONS.gemini}
                              alt="Google Gemini"
                              className="w-4 h-4"
                            />
                            <span>Google Gemini</span>
                          </div>
                          {apiProvider === 'gemini' && (
                            <Check size={14} className="text-cyan-500" />
                          )}
                        </button>
                        <button
                          onClick={() => {
                            // Cancel any ongoing request before switching
                            if (abortControllerRef.current) {
                              abortControllerRef.current.abort()
                              abortControllerRef.current = null
                            }

                            setApiProvider('openai_compatibility')
                            setIsProviderDropdownOpen(false)
                            // Clear all model-related state when switching providers
                            setModelsError(null)
                            setDynamicModels([])
                            setIsLoadingModels(false)
                            setCurrentProvider('openai_compatibility')
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <img
                              src={PROVIDER_FAVICONS.openai_compatibility}
                              alt="OpenAI"
                              className="w-4 h-4"
                            />
                            <span>OpenAI Compatible</span>
                          </div>
                          {apiProvider === 'openai_compatibility' && (
                            <Check size={14} className="text-cyan-500" />
                          )}
                        </button>
                        <button
                          onClick={() => {
                            // Cancel any ongoing request before switching
                            if (abortControllerRef.current) {
                              abortControllerRef.current.abort()
                              abortControllerRef.current = null
                            }

                            setApiProvider('siliconflow')
                            setIsProviderDropdownOpen(false)
                            // Clear all model-related state when switching providers
                            setModelsError(null)
                            setDynamicModels([])
                            setIsLoadingModels(false)
                            setCurrentProvider('siliconflow')
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <img
                              src={PROVIDER_FAVICONS.siliconflow}
                              alt="SiliconFlow"
                              className="w-4 h-4"
                            />
                            <span>SiliconFlow</span>
                          </div>
                          {apiProvider === 'siliconflow' && (
                            <Check size={14} className="text-cyan-500" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Google Settings */}
                  {apiProvider === 'gemini' && (
                    <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Google API Key
                      </label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                          <Key size={16} />
                        </div>
                        <input
                          type="password"
                          value={googleApiKey}
                          onChange={e => setGoogleApiKey(e.target.value)}
                          placeholder="AIzaSy..."
                          disabled={Boolean(ENV_VARS.googleApiKey)}
                          className={clsx(
                            'w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
                            ENV_VARS.googleApiKey && 'opacity-70 cursor-not-allowed',
                          )}
                        />
                      </div>
                      {apiProvider === 'gemini' && googleApiKey && (
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={() => fetchModelsForProvider(apiProvider)}
                            disabled={isLoadingModels}
                            className="flex items-center gap-1 text-xs px-3 py-1 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-50"
                          >
                            <RefreshCw
                              size={12}
                              className={clsx(isLoadingModels && 'animate-spin')}
                            />
                            {isLoadingModels ? 'Refreshing...' : 'Refresh Models'}
                          </button>
                        </div>
                      )}
                      {renderEnvHint(Boolean(ENV_VARS.googleApiKey))}
                    </div>
                  )}

                  {/* OpenAI Compatible Settings */}
                  {apiProvider === 'openai_compatibility' && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          OpenAI Compatible API Key
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                            <Key size={16} />
                          </div>
                          <input
                            type="password"
                            value={OpenAICompatibilityKey}
                            onChange={e => setOpenAICompatibilityKey(e.target.value)}
                            placeholder="sk-..."
                            disabled={Boolean(ENV_VARS.openAIKey)}
                            className={clsx(
                              'w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
                              ENV_VARS.openAIKey && 'opacity-70 cursor-not-allowed',
                            )}
                          />
                        </div>
                        {renderEnvHint(Boolean(ENV_VARS.openAIKey))}
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          Base URL
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                            <Link size={16} />
                          </div>
                          <input
                            type="text"
                            value={OpenAICompatibilityUrl}
                            onChange={e => setOpenAICompatibilityUrl(e.target.value)}
                            placeholder="https://api.openai.com/v1"
                            disabled={Boolean(ENV_VARS.openAIBaseUrl)}
                            className={clsx(
                              'w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
                              ENV_VARS.openAIBaseUrl && 'opacity-70 cursor-not-allowed',
                            )}
                          />
                        </div>
                        {renderEnvHint(Boolean(ENV_VARS.openAIBaseUrl))}
                      </div>
                    </div>
                  )}

                  {/* SiliconFlow Settings */}
                  {apiProvider === 'siliconflow' && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          SiliconFlow API Key
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                            <Key size={16} />
                          </div>
                          <input
                            type="password"
                            value={SiliconFlowKey}
                            onChange={e => setSiliconFlowKey(e.target.value)}
                            placeholder="sk-..."
                            disabled={Boolean(ENV_VARS.siliconFlowKey)}
                            className={clsx(
                              'w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
                              ENV_VARS.siliconFlowKey && 'opacity-70 cursor-not-allowed',
                            )}
                          />
                        </div>
                        {apiProvider === 'siliconflow' && SiliconFlowKey && (
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={() => fetchModelsForProvider(apiProvider)}
                              disabled={isLoadingModels}
                              className="flex items-center gap-1 text-xs px-3 py-1 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-50"
                            >
                              <RefreshCw
                                size={12}
                                className={clsx(isLoadingModels && 'animate-spin')}
                              />
                              {isLoadingModels ? 'Refreshing...' : 'Refresh Models'}
                            </button>
                          </div>
                        )}
                        {renderEnvHint(Boolean(ENV_VARS.siliconFlowKey))}
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          Base URL
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                            <Link size={16} />
                          </div>
                          <input
                            type="text"
                            value={SiliconFlowUrl}
                            onChange={e => setSiliconFlowUrl(e.target.value)}
                            placeholder="https://api.siliconflow.cn/v1"
                            disabled={Boolean(ENV_VARS.siliconFlowBaseUrl)}
                            className={clsx(
                              'w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
                              ENV_VARS.siliconFlowBaseUrl && 'opacity-70 cursor-not-allowed',
                            )}
                          />
                        </div>
                        {renderEnvHint(Boolean(ENV_VARS.siliconFlowBaseUrl))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="h-px bg-gray-100 dark:bg-zinc-800" />
                {/* Model Configuration */}
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-900 dark:text-white">
                      Model Configuration
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Choose different models for different tasks, or enter a custom model ID.
                    </p>
                    {apiProvider !== 'openai_compatibility' && (
                      <div className="flex items-center gap-2 text-xs">
                        {isLoadingModels && (
                          <div className="flex items-center gap-1 text-gray-500">
                            <div className="w-3 h-3 border border-gray-300 border-t-transparent rounded-full animate-spin"></div>
                            <span>Loading models...</span>
                          </div>
                        )}
                        {!isLoadingModels && dynamicModels.length > 0 && (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            ✓ {dynamicModels.length} models loaded
                          </span>
                        )}
                        {modelsError && (
                          <span className="text-amber-600 dark:text-amber-400" title={modelsError}>
                            ⚠ Using fallback models
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {(() => {
                    const modelOptions = getModelOptionsForProvider(apiProvider, dynamicModels)

                    const ModelCard = ({ label, helper, value, onChange }) => {
                      const [isOpen, setIsOpen] = useState(false)
                      const [showTooltip, setShowTooltip] = useState(false)
                      const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 })
                      const dropdownRef = useRef(null)
                      const isCustom = !modelOptions.some(opt => opt.value === value)
                      const currentLabel =
                        modelOptions.find(opt => opt.value === value)?.label || 'Custom...'

                      useEffect(() => {
                        const handleClickOutside = event => {
                          if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                            setIsOpen(false)
                          }
                        }

                        if (isOpen) {
                          document.addEventListener('mousedown', handleClickOutside)
                        }
                        return () => {
                          document.removeEventListener('mousedown', handleClickOutside)
                        }
                      }, [isOpen])

                      const handleMouseEnter = e => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        setTooltipPos({
                          top: rect.top - 8,
                          left: rect.left + rect.width / 2,
                        })
                        setShowTooltip(true)
                      }

                      return (
                        <div className="flex flex-col gap-3 p-4 border border-gray-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 shadow-sm transition-all hover:shadow-md">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {label}
                              </p>
                              <div
                                className="relative flex items-center"
                                onMouseEnter={handleMouseEnter}
                                onMouseLeave={() => setShowTooltip(false)}
                              >
                                <Info
                                  size={13}
                                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help transition-colors"
                                />
                                {showTooltip && (
                                  <div
                                    className="fixed z-[9999] -translate-x-1/2 -translate-y-full w-48 p-2 bg-gray-900 dark:bg-zinc-700 text-white dark:text-gray-100 text-[11px] rounded-lg shadow-xl pointer-events-none animate-in fade-in zoom-in-95 duration-100"
                                    style={{
                                      top: tooltipPos.top,
                                      left: tooltipPos.left,
                                    }}
                                  >
                                    {helper}
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-zinc-700" />
                                  </div>
                                )}
                              </div>
                            </div>
                            <span className="text-[10px] px-2 py-1 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-zinc-700">
                              {isCustom ? 'Custom' : 'Preset'}
                            </span>
                          </div>

                          <div className="relative" ref={dropdownRef}>
                            <button
                              onClick={() => setIsOpen(!isOpen)}
                              className={clsx(
                                'w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm transition-all text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800',
                                isOpen && 'ring-2 ring-cyan-500/20 border-cyan-500',
                              )}
                            >
                              <span>{currentLabel}</span>
                              <ChevronDown
                                size={16}
                                className={clsx(
                                  'text-gray-400 transition-transform duration-200',
                                  isOpen && 'rotate-180',
                                )}
                              />
                            </button>

                            {isOpen && (
                              <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                <div className="max-h-[200px] overflow-y-auto">
                                  {modelOptions.map(opt => (
                                    <button
                                      key={opt.value}
                                      onClick={() => {
                                        onChange(opt.value)
                                        setIsOpen(false)
                                      }}
                                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors flex items-center justify-between"
                                    >
                                      <span>{opt.label}</span>
                                      {value === opt.value && (
                                        <Check size={14} className="text-cyan-500" />
                                      )}
                                    </button>
                                  ))}
                                  <div className="h-px bg-gray-100 dark:bg-zinc-800 my-1" />
                                  <button
                                    onClick={() => {
                                      onChange('') // Clear value for custom input
                                      setIsOpen(false)
                                    }}
                                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors flex items-center justify-between"
                                  >
                                    <span>Custom...</span>
                                    {isCustom && <Check size={14} className="text-cyan-500" />}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          {isCustom && (
                            <div className="flex flex-col gap-1 animate-in fade-in slide-in-from-top-1 duration-200">
                              <label className="text-[11px] text-gray-500 dark:text-gray-400">
                                Custom model ID
                              </label>
                              <input
                                type="text"
                                value={value}
                                onChange={e => onChange(e.target.value)}
                                placeholder="Enter your own model id"
                                className="w-full px-3 py-2 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                              />
                            </div>
                          )}
                        </div>
                      )
                    }

                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <ModelCard
                          label="Lite"
                          helper="Titles, related questions, space suggestions"
                          value={liteModel}
                          onChange={setLiteModel}
                        />
                        <ModelCard
                          label="Default"
                          helper="Primary chat responses"
                          value={defaultModel}
                          onChange={setDefaultModel}
                        />
                      </div>
                    )
                  })()}
                </div>

                <div className="h-px bg-gray-100 dark:bg-zinc-800" />

                {/* Supabase Config */}
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-900 dark:text-white">
                      Supabase Configuration
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Used for syncing and storing chat history.
                    </p>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Supabase URL
                      </label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                          <Link size={16} />
                        </div>
                        <input
                          type="text"
                          value={supabaseUrl}
                          onChange={e => setSupabaseUrl(e.target.value)}
                          placeholder="https://your-project.supabase.co"
                          disabled={Boolean(ENV_VARS.supabaseUrl)}
                          className={clsx(
                            'w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
                            ENV_VARS.supabaseUrl && 'opacity-70 cursor-not-allowed',
                          )}
                        />
                      </div>
                      {renderEnvHint(Boolean(ENV_VARS.supabaseUrl))}
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Anon Key
                      </label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                          <Key size={16} />
                        </div>
                        <input
                          type="password"
                          value={supabaseKey}
                          onChange={e => setSupabaseKey(e.target.value)}
                          placeholder="••••••••••••••••••••••••••••••••"
                          disabled={Boolean(ENV_VARS.supabaseKey)}
                          className={clsx(
                            'w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
                            ENV_VARS.supabaseKey && 'opacity-70 cursor-not-allowed',
                          )}
                        />
                      </div>
                      {renderEnvHint(Boolean(ENV_VARS.supabaseKey))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <button
                      onClick={handleTestConnection}
                      disabled={testing || !supabaseUrl || !supabaseKey}
                      className="self-end px-4 py-2 text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {testing ? 'Testing...' : 'Test Connection & Database Tables'}
                    </button>

                    {testResult && (
                      <div
                        className={clsx(
                          'p-4 rounded-lg border',
                          testResult.success
                            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                            : testResult.connection
                              ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
                        )}
                      >
                        <div className="text-sm font-medium mb-2 text-gray-900 dark:text-white">
                          {testResult.message}
                        </div>

                        {testResult.connection && (
                          <div className="space-y-1 text-xs">
                            <div className="flex items-center gap-2">
                              <span>{testResult.tables.spaces ? '✅' : '❌'}</span>
                              <span className="text-gray-700 dark:text-gray-300">spaces table</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span>{testResult.tables.conversations ? '✅' : '❌'}</span>
                              <span className="text-gray-700 dark:text-gray-300">
                                chat_sessions table
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span>{testResult.tables.conversation_messages ? '✅' : '❌'}</span>
                              <span className="text-gray-700 dark:text-gray-300">
                                messages table
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'chat' && (
              <div className="flex flex-col gap-8 max-w-2xl">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    Context Messages
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    How many recent messages to send with each request (excluding spaces/system
                    prompts).
                  </p>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={contextMessageLimit}
                    onChange={e =>
                      setContextMessageLimit(Math.min(50, Math.max(1, Number(e.target.value) || 1)))
                    }
                    className="w-32 mt-1 px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    System Prompt
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Customize the behavior and personality of the AI.
                  </p>
                </div>
                <div className="relative">
                  <textarea
                    value={systemPrompt}
                    onChange={e => setSystemPrompt(e.target.value)}
                    placeholder="You are a helpful AI assistant..."
                    rows={6}
                    className="w-full p-4 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600 resize-none"
                  />
                </div>
              </div>
            )}

            {activeTab === 'model' && (
              <div className="flex flex-col gap-8 max-w-2xl">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    Model Configuration
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Configure the specific model ID for your selected provider.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {apiProvider === 'gemini'
                      ? 'Gemini Model ID'
                      : apiProvider === 'siliconflow'
                        ? 'SiliconFlow Model ID'
                        : 'OpenAI Model ID'}
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <Box size={16} />
                    </div>
                    <input
                      type="text"
                      value={modelId}
                      onChange={e => setModelId(e.target.value)}
                      placeholder={
                        apiProvider === 'gemini'
                          ? 'gemini-2.0-flash-exp'
                          : apiProvider === 'siliconflow'
                            ? 'deepseek-chat'
                            : 'gpt-4o'
                      }
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600"
                    />
                  </div>
                  <p className="text-[10px] text-gray-400">
                    Enter the specific model identifier you wish to use (e.g.,{' '}
                    {apiProvider === 'gemini'
                      ? 'gemini-1.5-pro'
                      : apiProvider === 'siliconflow'
                        ? 'deepseek-reasoner'
                        : 'gpt-3.5-turbo'}
                    ).
                  </p>
                </div>
              </div>
            )}
            {activeTab === 'about' && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="p-4  rounded-3xl mb-2">
                  <FiloLogo size={64} className="text-gray-900 dark:text-white" />
                </div>

                <div className="flex flex-col gap-2 items-center">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    Filo
                    <span className="px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 text-[10px] font-bold tracking-wide uppercase border border-cyan-200 dark:border-cyan-800">
                      Beta
                    </span>
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md leading-relaxed">
                    An advanced AI assistant interface designed for clarity, speed, and precision.
                    Built with the latest web technologies for a seamless experience.
                  </p>
                </div>

                <div className="flex items-center gap-3 mt-4">
                  <a
                    href="#"
                    className="p-2 rounded-full bg-gray-50 dark:bg-zinc-900 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-white transition-all border border-gray-200 dark:border-zinc-800"
                  >
                    <Github size={18} />
                  </a>
                  <a
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
                  </a>
                </div>

                <div className="mt-8 pt-8 border-t border-gray-100 dark:border-zinc-800 w-full max-w-xs flex flex-col gap-1">
                  <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                    Designed & Built by
                  </p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    havingautism & allabouturmind
                  </p>
                </div>

                <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-auto">
                  v0.1.0 • © 2025 All rights reserved
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="h-20 border-t border-gray-200 dark:border-zinc-800 flex items-center justify-end px-6 sm:px-8 gap-3 bg-gray-50/50 dark:bg-[#191a1a] shrink-0">
            <button
              onClick={onClose}
              className="px-4 cursor-pointer py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 cursor-pointer py-2 rounded-lg text-sm font-medium bg-black dark:bg-white text-white dark:text-black hover:opacity-90 transition-opacity"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal
