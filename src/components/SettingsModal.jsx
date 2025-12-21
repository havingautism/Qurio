import Image from 'next/image'
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
  Smile,
  Github,
  RefreshCw,
  Copy,
} from 'lucide-react'
import Logo from './Logo'
import clsx from 'clsx'
import { saveSettings, loadSettings } from '../lib/settings'
import { testConnection } from '../lib/supabase'
import { getModelsForProvider } from '../lib/models_api'
import useScrollLock from '../hooks/useScrollLock'
import { THEMES } from '../lib/themes'
import { SILICONFLOW_BASE_URL } from '../lib/providerConstants'
import { PROVIDER_ICONS, getModelIcon } from '../lib/modelIcons'

const ENV_VARS = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_KEY,
  openAIKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
  openAIBaseUrl: process.env.NEXT_PUBLIC_OPENAI_BASE_URL,
  googleApiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
  siliconFlowKey: process.env.NEXT_PUBLIC_SILICONFLOW_API_KEY,
}

// Minimal copy of supabase/init.sql for quick remediation in-app
const INIT_SQL_SCRIPT = `-- Supabase initialization script (local-first, single-user)
-- Run in Supabase SQL editor to create core tables for spaces, conversations, messages, and attachments.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emoji TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL,
  description TEXT,
  prompt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_spaces_updated_at
BEFORE UPDATE ON public.spaces
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID REFERENCES public.spaces(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  api_provider TEXT NOT NULL DEFAULT 'gemini',
  is_search_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_thinking_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_favorited BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_space_id ON public.conversations(space_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON public.conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_title ON public.conversations(title);
CREATE INDEX IF NOT EXISTS idx_conversations_space_created ON public.conversations(space_id, created_at DESC);

CREATE TRIGGER trg_conversations_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content JSONB NOT NULL,
  provider TEXT,
  model TEXT,
  thinking_process TEXT,
  tool_calls JSONB,
  related_questions JSONB,
  sources JSONB,
  grounding_supports JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
  ON public.conversation_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS public.conversation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_conversation_created_at
  ON public.conversation_events(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.conversation_messages(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON public.attachments(message_id);`

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

const INTERFACE_LANGUAGE_OPTIONS = [{ value: 'en', label: 'English' }]

const LLM_ANSWER_LANGUAGE_OPTIONS = [
  { value: 'English', label: 'English' },
  { value: 'Chinese (Simplified)', label: 'Chinese (Simplified)' },
  { value: 'Chinese (Traditional)', label: 'Chinese (Traditional)' },
  { value: 'Japanese', label: 'Japanese' },
  { value: 'Korean', label: 'Korean' },
  { value: 'Spanish', label: 'Spanish' },
  { value: 'French', label: 'French' },
  { value: 'German', label: 'German' },
  { value: 'Portuguese', label: 'Portuguese' },
  { value: 'Italian', label: 'Italian' },
]

const STYLE_BASE_TONE_OPTIONS = [
  { value: 'technical', label: 'Technical' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'professional', label: 'Professional' },
  { value: 'academic', label: 'Academic' },
  { value: 'creative', label: 'Creative' },
]

const STYLE_TRAIT_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'concise', label: 'Concise' },
  { value: 'structured', label: 'Structured' },
  { value: 'detailed', label: 'Detailed' },
  { value: 'actionable', label: 'Actionable' },
]

const STYLE_WARMTH_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'gentle', label: 'Gentle' },
  { value: 'empathetic', label: 'Empathetic' },
  { value: 'direct', label: 'Direct' },
]

const STYLE_ENTHUSIASM_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'low', label: 'Low' },
  { value: 'high', label: 'High' },
]

const STYLE_HEADINGS_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'structured', label: 'Headings & Lists' },
]

const STYLE_EMOJI_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'none', label: 'None' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
]

const SettingsModal = ({ isOpen, onClose }) => {
  const renderEnvHint = hasEnv =>
    hasEnv ? (
      <p className="text-emerald-600 text-xs dark:text-emerald-400">Loaded from environment</p>
    ) : null

  const [activeTab, setActiveTab] = useState('general')
  const [OpenAICompatibilityKey, setOpenAICompatibilityKey] = useState('')
  const [OpenAICompatibilityUrl, setOpenAICompatibilityUrl] = useState('')
  const [SiliconFlowKey, setSiliconFlowKey] = useState('')
  const [apiProvider, setApiProvider] = useState('gemini')
  const [googleApiKey, setGoogleApiKey] = useState('')
  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [supabaseKey, setSupabaseKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false)
  const providerDropdownRef = useRef(null)
  const [isInterfaceLanguageDropdownOpen, setIsInterfaceLanguageDropdownOpen] = useState(false)
  const interfaceLanguageDropdownRef = useRef(null)
  const [isLlmLanguageDropdownOpen, setIsLlmLanguageDropdownOpen] = useState(false)
  const llmLanguageDropdownRef = useRef(null)
  const [contextMessageLimit, setContextMessageLimit] = useState(12)
  const [modelId, setModelId] = useState('')
  // Model configuration states
  const [liteModel, setLiteModel] = useState('gemini-2.5-flash')
  const [defaultModel, setDefaultModel] = useState('gemini-2.5-flash')
  const [themeColor, setThemeColor] = useState('violet')
  const [enableRelatedQuestions, setEnableRelatedQuestions] = useState(false)
  const [interfaceLanguage, setInterfaceLanguage] = useState('en')
  const [llmAnswerLanguage, setLlmAnswerLanguage] = useState('English')
  const [baseTone, setBaseTone] = useState('technical')
  const [traits, setTraits] = useState('default')
  const [warmth, setWarmth] = useState('default')
  const [enthusiasm, setEnthusiasm] = useState('default')
  const [headings, setHeadings] = useState('default')
  const [emojis, setEmojis] = useState('default')
  const [customInstruction, setCustomInstruction] = useState('')
  const [isBaseToneDropdownOpen, setIsBaseToneDropdownOpen] = useState(false)
  const baseToneDropdownRef = useRef(null)
  const [isTraitsDropdownOpen, setIsTraitsDropdownOpen] = useState(false)
  const traitsDropdownRef = useRef(null)
  const [isWarmthDropdownOpen, setIsWarmthDropdownOpen] = useState(false)
  const warmthDropdownRef = useRef(null)
  const [isEnthusiasmDropdownOpen, setIsEnthusiasmDropdownOpen] = useState(false)
  const enthusiasmDropdownRef = useRef(null)
  const [isHeadingsDropdownOpen, setIsHeadingsDropdownOpen] = useState(false)
  const headingsDropdownRef = useRef(null)
  const [isEmojisDropdownOpen, setIsEmojisDropdownOpen] = useState(false)
  const emojisDropdownRef = useRef(null)

  // Dynamic model states
  const [dynamicModels, setDynamicModels] = useState([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [modelsError, setModelsError] = useState(null)
  const [currentProvider, setCurrentProvider] = useState(null) // Track current provider for loading
  const [isInitModalOpen, setIsInitModalOpen] = useState(false)
  const [initModalResult, setInitModalResult] = useState(null)
  const [copiedInitSql, setCopiedInitSql] = useState(false)
  const [retestingDb, setRetestingDb] = useState(false)

  // AbortController for cancelling requests
  const abortControllerRef = useRef(null)

  // Handle click outside provider dropdown
  useEffect(() => {
    const handleClickOutside = event => {
      if (providerDropdownRef.current && !providerDropdownRef.current.contains(event.target)) {
        setIsProviderDropdownOpen(false)
      }
      if (
        interfaceLanguageDropdownRef.current &&
        !interfaceLanguageDropdownRef.current.contains(event.target)
      ) {
        setIsInterfaceLanguageDropdownOpen(false)
      }
      if (llmLanguageDropdownRef.current && !llmLanguageDropdownRef.current.contains(event.target)) {
        setIsLlmLanguageDropdownOpen(false)
      }
      if (baseToneDropdownRef.current && !baseToneDropdownRef.current.contains(event.target)) {
        setIsBaseToneDropdownOpen(false)
      }
      if (traitsDropdownRef.current && !traitsDropdownRef.current.contains(event.target)) {
        setIsTraitsDropdownOpen(false)
      }
      if (warmthDropdownRef.current && !warmthDropdownRef.current.contains(event.target)) {
        setIsWarmthDropdownOpen(false)
      }
      if (enthusiasmDropdownRef.current && !enthusiasmDropdownRef.current.contains(event.target)) {
        setIsEnthusiasmDropdownOpen(false)
      }
      if (headingsDropdownRef.current && !headingsDropdownRef.current.contains(event.target)) {
        setIsHeadingsDropdownOpen(false)
      }
      if (emojisDropdownRef.current && !emojisDropdownRef.current.contains(event.target)) {
        setIsEmojisDropdownOpen(false)
      }
    }

    if (
      isProviderDropdownOpen ||
      isInterfaceLanguageDropdownOpen ||
      isLlmLanguageDropdownOpen ||
      isBaseToneDropdownOpen ||
      isTraitsDropdownOpen ||
      isWarmthDropdownOpen ||
      isEnthusiasmDropdownOpen ||
      isHeadingsDropdownOpen ||
      isEmojisDropdownOpen
    ) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [
    isProviderDropdownOpen,
    isInterfaceLanguageDropdownOpen,
    isLlmLanguageDropdownOpen,
    isBaseToneDropdownOpen,
    isTraitsDropdownOpen,
    isWarmthDropdownOpen,
    isEnthusiasmDropdownOpen,
    isHeadingsDropdownOpen,
    isEmojisDropdownOpen,
  ])

  const menuItems = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'interface', label: 'Interface', icon: Monitor },
    // { id: 'model', label: 'Model', icon: Box },
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
      if (settings.apiProvider) setApiProvider(settings.apiProvider)
      if (settings.googleApiKey) setGoogleApiKey(settings.googleApiKey)
      if (settings.contextMessageLimit) setContextMessageLimit(Number(settings.contextMessageLimit))
      // Load model configuration
      if (settings.liteModel) setLiteModel(settings.liteModel)
      if (settings.defaultModel) setDefaultModel(settings.defaultModel)
      if (settings.themeColor) setThemeColor(settings.themeColor)
      if (typeof settings.enableRelatedQuestions === 'boolean')
        setEnableRelatedQuestions(settings.enableRelatedQuestions)
      if (settings.interfaceLanguage) setInterfaceLanguage(settings.interfaceLanguage)
      if (settings.llmAnswerLanguage) setLlmAnswerLanguage(settings.llmAnswerLanguage)
      if (settings.baseTone) setBaseTone(settings.baseTone)
      if (settings.traits) setTraits(settings.traits)
      if (settings.warmth) setWarmth(settings.warmth)
      if (settings.enthusiasm) setEnthusiasm(settings.enthusiasm)
      if (settings.headings) setHeadings(settings.headings)
      if (settings.emojis) setEmojis(settings.emojis)
      if (typeof settings.customInstruction === 'string')
        setCustomInstruction(settings.customInstruction)
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
          baseUrl: SILICONFLOW_BASE_URL,
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
  }, [googleApiKey, SiliconFlowKey])

  const requiredTables = ['spaces', 'conversations', 'conversation_messages']

  const getMissingTables = result => {
    if (!result?.tables) return requiredTables
    return requiredTables.filter(table => !result.tables[table])
  }

  const openInitSqlModal = result => {
    setInitModalResult(result)
    setIsInitModalOpen(true)
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
    setRetestingDb(true)
    const result = await testConnection(supabaseUrl, supabaseKey)
    setTestResult(result)
    setInitModalResult(result)
    setRetestingDb(false)
    if (result.success) {
      setIsInitModalOpen(false)
    }
  }

  if (!isOpen) return null

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)

    const result = await testConnection(supabaseUrl, supabaseKey)
    setTestResult(result)
    setTesting(false)
    if (!result.success) {
      openInitSqlModal(result)
    }
  }

  const handleSave = async () => {
    // Validate database before saving to guide users through setup
    if (supabaseUrl && supabaseKey) {
      setTesting(true)
      const result = await testConnection(supabaseUrl, supabaseKey)
      setTestResult(result)
      setTesting(false)
      if (!result.success) {
        openInitSqlModal(result)
        return
      }
    }

    // TODO: Validate inputs

    await saveSettings({
      apiProvider,
      googleApiKey,
      OpenAICompatibilityKey,
      OpenAICompatibilityUrl,
      SiliconFlowKey,
      supabaseUrl,
      supabaseKey,
      contextMessageLimit,
      // Save model configuration
      liteModel,
      defaultModel,
      themeColor,
      enableRelatedQuestions,
      interfaceLanguage,
      llmAnswerLanguage,
      baseTone,
      traits,
      warmth,
      enthusiasm,
      headings,
      emojis,
      customInstruction,
    })

    onClose()
  }

  return (
    <div className="fixed inset-0 z-100 flex items-start md:items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4 overflow-y-auto md:overflow-hidden">
      <div className="w-full h-screen md:max-w-4xl md:h-[80vh] bg-white dark:bg-[#191a1a] rounded-none md:rounded-2xl shadow-2xl flex flex-col md:flex-row overflow-hidden border-0 md:border border-gray-200 dark:border-zinc-800">
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
        <div className="w-full md:w-64 bg-primary-50 dark:bg-background/70 border-b md:border-b-0 md:border-r border-gray-200 dark:border-zinc-800 px-1 py-1 sm:py-4 sm:px-4 flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-visible no-scrollbar shrink-0">
          <h2 className="text-xl font-bold mb-0 md:mb-6 px-2 text-gray-900 dark:text-white hidden md:block">
            Settings
          </h2>
          <nav className="flex flex-row md:flex-col gap-1 w-full md:w-auto">
            {menuItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={clsx(
                  'flex items-center gap-1 sm:gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                  activeTab === item.id
                    ? 'bg-primary-100 dark:bg-zinc-800 text-primary-600 dark:text-primary-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-primary-100 dark:hover:bg-zinc-800',
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
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-8 min-h-0">
            {activeTab === 'general' && (
              <div className="flex flex-col gap-8 max-w-2xl">
                {/* ... existing general settings ... */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    Interface Language
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Only English is supported right now.
                  </p>
                  <div className="relative w-full" ref={interfaceLanguageDropdownRef}>
                    <button
                      onClick={() => {
                        const nextOpen = !isInterfaceLanguageDropdownOpen
                        setIsProviderDropdownOpen(false)
                        setIsLlmLanguageDropdownOpen(false)
                        setIsBaseToneDropdownOpen(false)
                        setIsTraitsDropdownOpen(false)
                        setIsWarmthDropdownOpen(false)
                        setIsEnthusiasmDropdownOpen(false)
                        setIsHeadingsDropdownOpen(false)
                        setIsEmojisDropdownOpen(false)
                        setIsInterfaceLanguageDropdownOpen(nextOpen)
                      }}
                      className="w-full flex items-center justify-between pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800"
                    >
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center">
                        <Monitor size={16} className="text-gray-400" />
                      </div>
                      <span>
                        {INTERFACE_LANGUAGE_OPTIONS.find(
                          option => option.value === interfaceLanguage,
                        )?.label || interfaceLanguage}
                      </span>
                      <ChevronDown
                        size={16}
                        className={clsx(
                          'text-gray-400 transition-transform duration-200',
                          isInterfaceLanguageDropdownOpen && 'rotate-180',
                        )}
                      />
                    </button>

                    {isInterfaceLanguageDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                        {INTERFACE_LANGUAGE_OPTIONS.map(option => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setInterfaceLanguage(option.value)
                              setIsInterfaceLanguageDropdownOpen(false)
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors flex items-center justify-between"
                          >
                            <span>{option.label}</span>
                            {interfaceLanguage === option.value && (
                              <Check size={14} className="text-primary-500" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
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
                      onClick={() => {
                        const nextOpen = !isProviderDropdownOpen
                        setIsInterfaceLanguageDropdownOpen(false)
                        setIsLlmLanguageDropdownOpen(false)
                        setIsBaseToneDropdownOpen(false)
                        setIsTraitsDropdownOpen(false)
                        setIsWarmthDropdownOpen(false)
                        setIsEnthusiasmDropdownOpen(false)
                        setIsHeadingsDropdownOpen(false)
                        setIsEmojisDropdownOpen(false)
                        setIsProviderDropdownOpen(nextOpen)
                      }}
                      className="w-full flex items-center justify-between pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800"
                    >
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center">
                        <Box size={16} className="text-gray-400" />
                      </div>
                      <div className="flex items-center gap-3">
                        <Image
                          src={PROVIDER_ICONS[apiProvider]}
                          alt={PROVIDER_LABELS[apiProvider] || apiProvider}
                          width={16}
                          height={16}
                          className="w-4 h-4"
                          unoptimized
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
                            <Image
                              src={PROVIDER_ICONS.gemini}
                              alt="Google Gemini"
                              width={16}
                              height={16}
                              className="w-4 h-4"
                              unoptimized
                            />
                            <span>Google Gemini</span>
                          </div>
                          {apiProvider === 'gemini' && (
                            <Check size={14} className="text-primary-500" />
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
                            <Image
                              src={PROVIDER_ICONS.openai_compatibility}
                              alt="OpenAI"
                              width={16}
                              height={16}
                              className="w-4 h-4"
                              unoptimized
                            />
                            <span>OpenAI Compatible</span>
                          </div>
                          {apiProvider === 'openai_compatibility' && (
                            <Check size={14} className="text-primary-500" />
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
                            <Image
                              src={PROVIDER_ICONS.siliconflow}
                              alt="SiliconFlow"
                              width={16}
                              height={16}
                              className="w-4 h-4"
                              unoptimized
                            />
                            <span>SiliconFlow</span>
                          </div>
                          {apiProvider === 'siliconflow' && (
                            <Check size={14} className="text-primary-500" />
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
                            'w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
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
                              'w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
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
                              'w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
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
                              'w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
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
                          <span
                            className="text-primary-600 dark:text-primary-400"
                            title={modelsError}
                          >
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
                                    className="fixed z-9999 -translate-x-1/2 -translate-y-full w-48 p-2 bg-gray-900 dark:bg-zinc-700 text-white dark:text-gray-100 text-[11px] rounded-lg shadow-xl pointer-events-none animate-in fade-in zoom-in-95 duration-100"
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
                                isOpen && 'ring-2 ring-primary-500/20 border-primary-500',
                              )}
                            >
                              <div className="flex items-center gap-2">
                                {getModelIcon(value) && (
                                  <Image
                                    src={getModelIcon(value)}
                                    alt=""
                                    width={14}
                                    height={14}
                                    className="w-3.5 h-3.5"
                                    unoptimized
                                  />
                                )}
                                <span>{currentLabel}</span>
                              </div>
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
                                      <div className="flex items-center gap-2">
                                        {getModelIcon(opt.value) && (
                                          <Image
                                            src={getModelIcon(opt.value)}
                                            alt=""
                                            width={14}
                                            height={14}
                                            className="w-3.5 h-3.5"
                                            unoptimized
                                          />
                                        )}
                                        <span>{opt.label}</span>
                                      </div>
                                      {value === opt.value && (
                                        <Check size={14} className="text-primary-500" />
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
                                    {isCustom && <Check size={14} className="text-primary-500" />}
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
                                className="w-full px-3 py-2 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
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
                            'w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
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
                            'w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
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
                      className="self-end px-4 py-2 text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

            {activeTab === 'interface' && (
              <div className="flex flex-col gap-8 max-w-2xl">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    Theme Color
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Customize the look and feel of your workspace.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {Object.entries(THEMES).map(([key, theme]) => (
                    <button
                      key={key}
                      onClick={() => setThemeColor(key)}
                      className={clsx(
                        'relative flex flex-col items-center gap-3 p-4 rounded-xl border transition-all',
                        themeColor === key
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/10 ring-1 ring-primary-500/20'
                          : 'border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800',
                      )}
                    >
                      <div className="flex gap-1">
                        <div
                          className="w-6 h-6 rounded-full shadow-sm"
                          style={{ backgroundColor: theme.colors['--color-primary-500'] }}
                        />
                        <div
                          className="w-6 h-6 rounded-full shadow-sm -ml-2"
                          style={{ backgroundColor: theme.colors['--color-primary-300'] }}
                        />
                      </div>
                      <span
                        className={clsx(
                          'text-sm font-medium',
                          themeColor === key
                            ? 'text-primary-700 dark:text-primary-300'
                            : 'text-gray-700 dark:text-gray-300',
                        )}
                      >
                        {theme.label}
                      </span>
                      {themeColor === key && (
                        <div className="absolute top-3 right-3 text-primary-500">
                          <Check size={16} />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'personalization' && (
              <div className="flex flex-col gap-8 max-w-2xl">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    Response Style
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Fine-tune how replies sound and how they are structured.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    Base Style and Tone
                  </label>
                  <div className="relative w-full" ref={baseToneDropdownRef}>
                    <button
                      onClick={() => {
                        const nextOpen = !isBaseToneDropdownOpen
                        setIsProviderDropdownOpen(false)
                        setIsInterfaceLanguageDropdownOpen(false)
                        setIsLlmLanguageDropdownOpen(false)
                        setIsTraitsDropdownOpen(false)
                        setIsWarmthDropdownOpen(false)
                        setIsEnthusiasmDropdownOpen(false)
                        setIsHeadingsDropdownOpen(false)
                        setIsEmojisDropdownOpen(false)
                        setIsBaseToneDropdownOpen(nextOpen)
                      }}
                      className="w-full flex items-center justify-between pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800"
                    >
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center">
                        <Palette size={16} className="text-gray-400" />
                      </div>
                      <span>
                        {STYLE_BASE_TONE_OPTIONS.find(option => option.value === baseTone)?.label ||
                          baseTone}
                      </span>
                      <ChevronDown
                        size={16}
                        className={clsx(
                          'text-gray-400 transition-transform duration-200',
                          isBaseToneDropdownOpen && 'rotate-180',
                        )}
                      />
                    </button>

                    {isBaseToneDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                        {STYLE_BASE_TONE_OPTIONS.map(option => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setBaseTone(option.value)
                              setIsBaseToneDropdownOpen(false)
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors flex items-center justify-between"
                          >
                            <span>{option.label}</span>
                            {baseTone === option.value && (
                              <Check size={14} className="text-primary-500" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">Traits</label>
                  <div className="relative w-full" ref={traitsDropdownRef}>
                    <button
                      onClick={() => {
                        const nextOpen = !isTraitsDropdownOpen
                        setIsProviderDropdownOpen(false)
                        setIsInterfaceLanguageDropdownOpen(false)
                        setIsLlmLanguageDropdownOpen(false)
                        setIsBaseToneDropdownOpen(false)
                        setIsWarmthDropdownOpen(false)
                        setIsEnthusiasmDropdownOpen(false)
                        setIsHeadingsDropdownOpen(false)
                        setIsEmojisDropdownOpen(false)
                        setIsTraitsDropdownOpen(nextOpen)
                      }}
                      className="w-full flex items-center justify-between pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800"
                    >
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center">
                        <Box size={16} className="text-gray-400" />
                      </div>
                      <span>
                        {STYLE_TRAIT_OPTIONS.find(option => option.value === traits)?.label ||
                          traits}
                      </span>
                      <ChevronDown
                        size={16}
                        className={clsx(
                          'text-gray-400 transition-transform duration-200',
                          isTraitsDropdownOpen && 'rotate-180',
                        )}
                      />
                    </button>

                    {isTraitsDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                        {STYLE_TRAIT_OPTIONS.map(option => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setTraits(option.value)
                              setIsTraitsDropdownOpen(false)
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors flex items-center justify-between"
                          >
                            <span>{option.label}</span>
                            {traits === option.value && (
                              <Check size={14} className="text-primary-500" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    Warmth and Care
                  </label>
                  <div className="relative w-full" ref={warmthDropdownRef}>
                    <button
                      onClick={() => {
                        const nextOpen = !isWarmthDropdownOpen
                        setIsProviderDropdownOpen(false)
                        setIsInterfaceLanguageDropdownOpen(false)
                        setIsLlmLanguageDropdownOpen(false)
                        setIsBaseToneDropdownOpen(false)
                        setIsTraitsDropdownOpen(false)
                        setIsEnthusiasmDropdownOpen(false)
                        setIsHeadingsDropdownOpen(false)
                        setIsEmojisDropdownOpen(false)
                        setIsWarmthDropdownOpen(nextOpen)
                      }}
                      className="w-full flex items-center justify-between pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800"
                    >
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center">
                        <User size={16} className="text-gray-400" />
                      </div>
                      <span>
                        {STYLE_WARMTH_OPTIONS.find(option => option.value === warmth)?.label ||
                          warmth}
                      </span>
                      <ChevronDown
                        size={16}
                        className={clsx(
                          'text-gray-400 transition-transform duration-200',
                          isWarmthDropdownOpen && 'rotate-180',
                        )}
                      />
                    </button>

                    {isWarmthDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                        {STYLE_WARMTH_OPTIONS.map(option => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setWarmth(option.value)
                              setIsWarmthDropdownOpen(false)
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors flex items-center justify-between"
                          >
                            <span>{option.label}</span>
                            {warmth === option.value && (
                              <Check size={14} className="text-primary-500" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    Enthusiasm
                  </label>
                  <div className="relative w-full" ref={enthusiasmDropdownRef}>
                    <button
                      onClick={() => {
                        const nextOpen = !isEnthusiasmDropdownOpen
                        setIsProviderDropdownOpen(false)
                        setIsInterfaceLanguageDropdownOpen(false)
                        setIsLlmLanguageDropdownOpen(false)
                        setIsBaseToneDropdownOpen(false)
                        setIsTraitsDropdownOpen(false)
                        setIsWarmthDropdownOpen(false)
                        setIsHeadingsDropdownOpen(false)
                        setIsEmojisDropdownOpen(false)
                        setIsEnthusiasmDropdownOpen(nextOpen)
                      }}
                      className="w-full flex items-center justify-between pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800"
                    >
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center">
                        <MessageSquare size={16} className="text-gray-400" />
                      </div>
                      <span>
                        {STYLE_ENTHUSIASM_OPTIONS.find(option => option.value === enthusiasm)
                          ?.label || enthusiasm}
                      </span>
                      <ChevronDown
                        size={16}
                        className={clsx(
                          'text-gray-400 transition-transform duration-200',
                          isEnthusiasmDropdownOpen && 'rotate-180',
                        )}
                      />
                    </button>

                    {isEnthusiasmDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                        {STYLE_ENTHUSIASM_OPTIONS.map(option => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setEnthusiasm(option.value)
                              setIsEnthusiasmDropdownOpen(false)
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors flex items-center justify-between"
                          >
                            <span>{option.label}</span>
                            {enthusiasm === option.value && (
                              <Check size={14} className="text-primary-500" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    Headings and Lists
                  </label>
                  <div className="relative w-full" ref={headingsDropdownRef}>
                    <button
                      onClick={() => {
                        const nextOpen = !isHeadingsDropdownOpen
                        setIsProviderDropdownOpen(false)
                        setIsInterfaceLanguageDropdownOpen(false)
                        setIsLlmLanguageDropdownOpen(false)
                        setIsBaseToneDropdownOpen(false)
                        setIsTraitsDropdownOpen(false)
                        setIsWarmthDropdownOpen(false)
                        setIsEnthusiasmDropdownOpen(false)
                        setIsEmojisDropdownOpen(false)
                        setIsHeadingsDropdownOpen(nextOpen)
                      }}
                      className="w-full flex items-center justify-between pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800"
                    >
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center">
                        <Info size={16} className="text-gray-400" />
                      </div>
                      <span>
                        {STYLE_HEADINGS_OPTIONS.find(option => option.value === headings)?.label ||
                          headings}
                      </span>
                      <ChevronDown
                        size={16}
                        className={clsx(
                          'text-gray-400 transition-transform duration-200',
                          isHeadingsDropdownOpen && 'rotate-180',
                        )}
                      />
                    </button>

                    {isHeadingsDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                        {STYLE_HEADINGS_OPTIONS.map(option => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setHeadings(option.value)
                              setIsHeadingsDropdownOpen(false)
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors flex items-center justify-between"
                          >
                            <span>{option.label}</span>
                            {headings === option.value && (
                              <Check size={14} className="text-primary-500" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">Emojis</label>
                  <div className="relative w-full" ref={emojisDropdownRef}>
                    <button
                      onClick={() => {
                        const nextOpen = !isEmojisDropdownOpen
                        setIsProviderDropdownOpen(false)
                        setIsInterfaceLanguageDropdownOpen(false)
                        setIsLlmLanguageDropdownOpen(false)
                        setIsBaseToneDropdownOpen(false)
                        setIsTraitsDropdownOpen(false)
                        setIsWarmthDropdownOpen(false)
                        setIsEnthusiasmDropdownOpen(false)
                        setIsHeadingsDropdownOpen(false)
                        setIsEmojisDropdownOpen(nextOpen)
                      }}
                      className="w-full flex items-center justify-between pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800"
                    >
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center">
                        <Smile size={16} className="text-gray-400" />
                      </div>
                      <span>
                        {STYLE_EMOJI_OPTIONS.find(option => option.value === emojis)?.label ||
                          emojis}
                      </span>
                      <ChevronDown
                        size={16}
                        className={clsx(
                          'text-gray-400 transition-transform duration-200',
                          isEmojisDropdownOpen && 'rotate-180',
                        )}
                      />
                    </button>

                    {isEmojisDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                        {STYLE_EMOJI_OPTIONS.map(option => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setEmojis(option.value)
                              setIsEmojisDropdownOpen(false)
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors flex items-center justify-between"
                          >
                            <span>{option.label}</span>
                            {emojis === option.value && (
                              <Check size={14} className="text-primary-500" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    Custom Instruction
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Optional extra guidance appended to the style prompt.
                  </p>
                  <textarea
                    value={customInstruction}
                    onChange={e => setCustomInstruction(e.target.value)}
                    placeholder="Add any extra style notes here..."
                    rows={4}
                    className="w-full p-4 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600 resize-none"
                  />
                </div>
              </div>
            )}

            {activeTab === 'chat' && (
              <div className="flex flex-col gap-8 max-w-2xl">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-semibold text-gray-900 dark:text-white">
                      Related Questions
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Automatically generate follow-up suggestions after the assistant responds.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enableRelatedQuestions}
                    onClick={() => setEnableRelatedQuestions(prev => !prev)}
                    className={clsx(
                      'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/40',
                      enableRelatedQuestions
                        ? 'bg-primary-500 border-primary-500'
                        : 'bg-gray-200 dark:bg-zinc-800 border-gray-300 dark:border-zinc-700',
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
                    className="w-32 mt-1 px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    LLM Answer Language
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Appended to the system prompt for reply language control.
                  </p>
                  <div className="relative w-full" ref={llmLanguageDropdownRef}>
                    <button
                      onClick={() => {
                        const nextOpen = !isLlmLanguageDropdownOpen
                        setIsProviderDropdownOpen(false)
                        setIsInterfaceLanguageDropdownOpen(false)
                        setIsBaseToneDropdownOpen(false)
                        setIsTraitsDropdownOpen(false)
                        setIsWarmthDropdownOpen(false)
                        setIsEnthusiasmDropdownOpen(false)
                        setIsHeadingsDropdownOpen(false)
                        setIsEmojisDropdownOpen(false)
                        setIsLlmLanguageDropdownOpen(nextOpen)
                      }}
                      className="w-full flex items-center justify-between pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800"
                    >
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center">
                        <MessageSquare size={16} className="text-gray-400" />
                      </div>
                      <span>
                        {LLM_ANSWER_LANGUAGE_OPTIONS.find(
                          option => option.value === llmAnswerLanguage,
                        )?.label || llmAnswerLanguage}
                      </span>
                      <ChevronDown
                        size={16}
                        className={clsx(
                          'text-gray-400 transition-transform duration-200',
                          isLlmLanguageDropdownOpen && 'rotate-180',
                        )}
                      />
                    </button>

                    {isLlmLanguageDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                        {LLM_ANSWER_LANGUAGE_OPTIONS.map(option => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setLlmAnswerLanguage(option.value)
                              setIsLlmLanguageDropdownOpen(false)
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors flex items-center justify-between"
                          >
                            <span>{option.label}</span>
                            {llmAnswerLanguage === option.value && (
                              <Check size={14} className="text-primary-500" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600"
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
                  <Logo size={128} className="text-gray-900 dark:text-white" />
                </div>

                <div className="flex flex-col gap-2 items-center">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    Qurio
                    <span className="px-2 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-[10px] font-bold tracking-wide uppercase border border-primary-200 dark:border-primary-800">
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
                    href="https://github.com/havingautism/Qurio"
                    className="p-2 rounded-full bg-gray-50 dark:bg-zinc-900 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-white transition-all border border-gray-200 dark:border-zinc-800"
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
          <div className="h-20 border-t border-gray-200 dark:border-zinc-800 flex items-center justify-end px-6 sm:px-8 gap-3 bg-white dark:bg-[#191a1a] shrink-0">
            <button
              onClick={onClose}
              className="px-4 cursor-pointer py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 cursor-pointer py-2 rounded-lg text-sm font-medium bg-primary-500 text-white  hover:opacity-90 transition-opacity"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
      {isInitModalOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center px-3 sm:px-6">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsInitModalOpen(false)}
          />
          <div className="relative w-full max-w-3xl bg-white dark:bg-[#111] border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Complete Supabase setup
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  We could not verify all required tables. Please run the init.sql once in Supabase,
                  then re-test.
                </p>
              </div>
              <button
                onClick={() => setIsInitModalOpen(false)}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {initModalResult && (
              <div className="rounded-lg border border-primary-200 dark:border-primary-900/40 bg-primary-50 dark:bg-primary-900/20 p-4 space-y-2">
                <div className="text-sm font-medium text-primary-900 dark:text-primary-100">
                  {initModalResult.connection
                    ? 'Connection ok, but schema needs setup.'
                    : 'Connection failed. Check URL/key, then run init.sql.'}
                </div>
                {initModalResult.tables && (
                  <div className="flex flex-wrap gap-2 text-xs text-primary-800 dark:text-primary-100">
                    {requiredTables.map(table => {
                      const exists = initModalResult.tables?.[table]
                      return (
                        <span
                          key={table}
                          className={clsx(
                            'px-2 py-1 rounded-md border',
                            exists
                              ? 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-100'
                              : 'border-primary-200 dark:border-primary-900/40 bg-primary-100/70 dark:bg-primary-900/40',
                          )}
                        >
                          {exists ? 'Ready' : 'Missing'} · {table}
                        </span>
                      )
                    })}
                  </div>
                )}
                {getMissingTables(initModalResult).length > 0 && (
                  <div className="text-xs text-primary-800 dark:text-primary-100">
                    Missing: {getMissingTables(initModalResult).join(', ')}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                Quick fix steps
              </h4>
              <ol className="list-decimal list-inside text-sm text-gray-700 dark:text-gray-300 space-y-1">
                <li>Copy the SQL below and run it once in Supabase SQL Editor.</li>
                <li>Click “Re-test” to verify the required tables.</li>
              </ol>
            </div>

            <div className="relative">
              <button
                onClick={copyInitSql}
                className="absolute top-3 right-3 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-zinc-800 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
              >
                <Copy size={14} />
                {copiedInitSql ? 'Copied' : 'Copy SQL'}
              </button>
              <pre className="max-h-64 overflow-auto text-xs bg-gray-900 text-gray-100 rounded-lg p-4 border border-gray-800 whitespace-pre-wrap">
                {INIT_SQL_SCRIPT}
              </pre>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setIsInitModalOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleRetestAfterInit}
                disabled={retestingDb}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-white hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <RefreshCw size={16} className={retestingDb ? 'animate-spin' : ''} />
                {retestingDb ? 'Re-testing...' : 'Re-test'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SettingsModal
