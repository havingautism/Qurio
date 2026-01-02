import clsx from 'clsx'
import {
  Box,
  Check,
  ChevronDown,
  Copy,
  Github,
  Info,
  Key,
  Link,
  Loader2,
  MessageSquare,
  Monitor,
  RefreshCw,
  Settings,
  User,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useScrollLock from '../hooks/useScrollLock'
import { renderProviderIcon } from '../lib/modelIcons'
import { getPublicEnv } from '../lib/publicEnv'
import { loadSettings, saveSettings } from '../lib/settings'
import { fetchRemoteSettings, saveRemoteSettings, testConnection } from '../lib/supabase'
import { THEMES } from '../lib/themes'
import Logo from './Logo'

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


CREATE TABLE IF NOT EXISTS public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  emoji TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  description TEXT,
  prompt TEXT,
  provider TEXT,
  default_model_source TEXT NOT NULL DEFAULT 'list',
  lite_model_source TEXT NOT NULL DEFAULT 'list',
  lite_model TEXT,
  default_model TEXT,
  response_language TEXT,
  base_tone TEXT,
  traits TEXT,
  warmth TEXT,
  enthusiasm TEXT,
  headings TEXT,
  emojis TEXT,
  custom_instruction TEXT,
  temperature DOUBLE PRECISION,
  top_p DOUBLE PRECISION,
  frequency_penalty DOUBLE PRECISION,
  presence_penalty DOUBLE PRECISION,
  tool_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_created_at ON public.agents(created_at DESC);

CREATE TRIGGER trg_agents_updated_at
BEFORE UPDATE ON public.agents
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID REFERENCES public.spaces(id) ON DELETE SET NULL,
  last_agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
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
  agent_id UUID,
  agent_name TEXT,
  agent_emoji TEXT,
  agent_is_default BOOLEAN NOT NULL DEFAULT FALSE,
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

CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON public.attachments(message_id);

CREATE TABLE IF NOT EXISTS public.space_agents (
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (space_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_space_agents_agent_id ON public.space_agents(agent_id);
CREATE INDEX IF NOT EXISTS idx_space_agents_space_order
  ON public.space_agents(space_id, sort_order);

CREATE TABLE IF NOT EXISTS public.home_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_home_notes_updated_at
  ON public.home_notes(updated_at DESC);

CREATE TRIGGER trg_home_notes_updated_at
BEFORE UPDATE ON public.home_notes
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.user_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_user_settings_updated_at
BEFORE UPDATE ON public.user_settings
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- Enable RLS (Security Best Practice)
-- ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all actions for authenticated users" ON public.user_settings FOR ALL USING (auth.role() = 'authenticated');
`

// Constant keys for logic - labels will be translated with useMemo
const PROVIDER_KEYS = ['gemini', 'openai_compatibility', 'siliconflow', 'glm', 'modelscope', 'kimi']

const INTERFACE_LANGUAGE_KEYS = ['en', 'zh-CN']

const SettingsModal = ({ isOpen, onClose }) => {
  const { t, i18n } = useTranslation()

  const renderEnvHint = hasEnv =>
    hasEnv ? (
      <p className="text-emerald-600 text-xs dark:text-emerald-400">Loaded from environment</p>
    ) : null

  const [activeTab, setActiveTab] = useState('general')
  const [OpenAICompatibilityKey, setOpenAICompatibilityKey] = useState('')
  const [OpenAICompatibilityUrl, setOpenAICompatibilityUrl] = useState('')
  const [SiliconFlowKey, setSiliconFlowKey] = useState('')
  const [GlmKey, setGlmKey] = useState('')
  const [ModelScopeKey, setModelScopeKey] = useState('')
  const [KimiKey, setKimiKey] = useState('')
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
  const [contextMessageLimit, setContextMessageLimit] = useState(12)
  const [themeColor, setThemeColor] = useState('violet')
  const [fontSize, setFontSize] = useState('medium')
  const [isSaving, setIsSaving] = useState(false)
  const [enableRelatedQuestions, setEnableRelatedQuestions] = useState(false)
  const [interfaceLanguage, setInterfaceLanguage] = useState('en')

  const [isInitModalOpen, setIsInitModalOpen] = useState(false)
  const [initModalResult, setInitModalResult] = useState(null)
  const [copiedInitSql, setCopiedInitSql] = useState(false)
  const [retestingDb, setRetestingDb] = useState(false)

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
      return
    }

    if (isProviderDropdownOpen || isInterfaceLanguageDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isProviderDropdownOpen, isInterfaceLanguageDropdownOpen])

  // Menu items - use constant keys for logic, translate labels for display
  const MENU_ITEM_KEYS = [
    { id: 'general', icon: Settings },
    { id: 'chat', icon: MessageSquare },
    { id: 'interface', icon: Monitor },
    { id: 'account', icon: User },
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
      if (settings.GlmKey) setGlmKey(settings.GlmKey)
      if (settings.ModelScopeKey) setModelScopeKey(settings.ModelScopeKey)
      if (settings.KimiKey) setKimiKey(settings.KimiKey)
      if (settings.apiProvider) setApiProvider(settings.apiProvider)
      if (settings.googleApiKey) setGoogleApiKey(settings.googleApiKey)
      if (settings.contextMessageLimit) setContextMessageLimit(Number(settings.contextMessageLimit))
      if (settings.themeColor) setThemeColor(settings.themeColor)
      if (settings.fontSize) setFontSize(settings.fontSize)
      if (typeof settings.enableRelatedQuestions === 'boolean')
        setEnableRelatedQuestions(settings.enableRelatedQuestions)
      // Initialize interfaceLanguage from i18n.language (which reads from localStorage)
      setInterfaceLanguage(i18n.language)

      // Fetch Remote (Async Update)
      if (settings.supabaseUrl && settings.supabaseKey) {
        fetchRemoteSettings().then(({ data }) => {
          if (data) {
            if (data.OpenAICompatibilityKey) setOpenAICompatibilityKey(data.OpenAICompatibilityKey)
            if (data.OpenAICompatibilityUrl) setOpenAICompatibilityUrl(data.OpenAICompatibilityUrl)
            if (data.SiliconFlowKey) setSiliconFlowKey(data.SiliconFlowKey)
            if (data.GlmKey) setGlmKey(data.GlmKey)
            if (data.ModelScopeKey) setModelScopeKey(data.ModelScopeKey)
            if (data.KimiKey) setKimiKey(data.KimiKey)
            if (data.googleApiKey) setGoogleApiKey(data.googleApiKey)
          }
        })
      }
    }
  }, [isOpen, i18n])

  useScrollLock(isOpen)

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
    setIsSaving(true)
    try {
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

      const newSettings = {
        apiProvider,
        googleApiKey,
        OpenAICompatibilityKey,
        OpenAICompatibilityUrl,
        SiliconFlowKey,
        GlmKey,
        ModelScopeKey,
        KimiKey,
        supabaseUrl,
        supabaseKey,
        contextMessageLimit,
        themeColor,
        fontSize,
        enableRelatedQuestions,
        interfaceLanguage,
      }

      await saveSettings(newSettings)

      // Save Remote (if connected)
      if (supabaseUrl && supabaseKey) {
        await saveRemoteSettings(newSettings)
      }

      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-100 flex items-start md:items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4 overflow-y-auto md:overflow-hidden">
      <div className="w-full h-screen md:max-w-4xl md:h-[80vh] bg-white dark:bg-[#191a1a] rounded-none md:rounded-2xl shadow-2xl flex flex-col md:flex-row overflow-hidden border-0 md:border border-gray-200 dark:border-zinc-800">
        {/* Mobile Header */}
        <div className="md:hidden h-14 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between px-4 bg-white dark:bg-[#191a1a] shrink-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {t('settings.title')}
          </h2>
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
            {t('settings.title')}
          </h2>
          <nav className="flex flex-row md:flex-col gap-1 w-full md:w-auto">
            {menuItems.map(item => (
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
                    {t('settings.interfaceLanguage')}
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('settings.interfaceLanguageHint')}
                  </p>
                  <div className="relative w-full" ref={interfaceLanguageDropdownRef}>
                    <button
                      onClick={() => {
                        const nextOpen = !isInterfaceLanguageDropdownOpen
                        setIsProviderDropdownOpen(false)
                        setIsInterfaceLanguageDropdownOpen(nextOpen)
                      }}
                      className="w-full flex items-center justify-between pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800"
                    >
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center">
                        <Monitor size={16} className="text-gray-400" />
                      </div>
                      <span>
                        {interfaceLanguageOptions.find(option => option.value === interfaceLanguage)
                          ?.label || interfaceLanguage}
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
                        {interfaceLanguageOptions.map(option => (
                          <button
                            key={option.key}
                            onClick={() => {
                              setInterfaceLanguage(option.value)
                              i18n.changeLanguage(option.value)
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
                      {t('settings.apiProvider')}
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('settings.apiProviderHint')}
                    </p>
                  </div>

                  <div className="relative" ref={providerDropdownRef}>
                    <button
                      onClick={() => {
                        const nextOpen = !isProviderDropdownOpen
                        setIsInterfaceLanguageDropdownOpen(false)
                        setIsProviderDropdownOpen(nextOpen)
                      }}
                      className="w-full flex items-center justify-between pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800"
                    >
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center">
                        <Box size={16} className="text-gray-400" />
                      </div>
                      <div className="flex items-center gap-3">
                        {renderProviderIcon(apiProvider, {
                          size: 16,
                          alt: t(`settings.providers.${apiProvider}`),
                        })}
                        <span>{t(`settings.providers.${apiProvider}`)}</span>
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
                        {providerOptions.map(option => (
                          <button
                            key={option.key}
                            onClick={() => {
                              setApiProvider(option.value)
                              setIsProviderDropdownOpen(false)
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors flex items-center justify-between"
                          >
                            <div className="flex items-center gap-3">
                              {renderProviderIcon(option.value, { size: 16, alt: option.label })}
                              <span>{option.label}</span>
                            </div>
                            {apiProvider === option.value && (
                              <Check size={14} className="text-primary-500" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Google Settings */}
                  {apiProvider === 'gemini' && (
                    <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {t('settings.googleApiKey')}
                      </label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                          <Key size={16} />
                        </div>
                        <input
                          type="password"
                          value={googleApiKey}
                          onChange={e => setGoogleApiKey(e.target.value)}
                          placeholder={t('settings.googleApiKeyPlaceholder')}
                          disabled={Boolean(ENV_VARS.googleApiKey)}
                          className={clsx(
                            'w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
                            ENV_VARS.googleApiKey && 'opacity-70 cursor-not-allowed',
                          )}
                        />
                      </div>
                      {ENV_VARS.googleApiKey && (
                        <p className="text-emerald-600 text-xs dark:text-emerald-400">
                          {t('settings.loadedFromEnvironment')}
                        </p>
                      )}
                    </div>
                  )}

                  {/* OpenAI Compatible Settings */}
                  {apiProvider === 'openai_compatibility' && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {t('settings.openaiApiKey')}
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                            <Key size={16} />
                          </div>
                          <input
                            type="password"
                            value={OpenAICompatibilityKey}
                            onChange={e => setOpenAICompatibilityKey(e.target.value)}
                            placeholder={t('settings.openaiApiKeyPlaceholder')}
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
                          {t('settings.baseUrl')}
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                            <Link size={16} />
                          </div>
                          <input
                            type="text"
                            value={OpenAICompatibilityUrl}
                            onChange={e => setOpenAICompatibilityUrl(e.target.value)}
                            placeholder={t('settings.baseUrlPlaceholder')}
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
                          {t('settings.siliconflowApiKey')}
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                            <Key size={16} />
                          </div>
                          <input
                            type="password"
                            value={SiliconFlowKey}
                            onChange={e => setSiliconFlowKey(e.target.value)}
                            placeholder={t('settings.siliconflowApiKeyPlaceholder')}
                            disabled={Boolean(ENV_VARS.siliconFlowKey)}
                            className={clsx(
                              'w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
                              ENV_VARS.siliconFlowKey && 'opacity-70 cursor-not-allowed',
                            )}
                          />
                        </div>
                        {ENV_VARS.siliconFlowKey && (
                          <p className="text-emerald-600 text-xs dark:text-emerald-400">
                            {t('settings.loadedFromEnvironment')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* GLM Settings */}
                  {apiProvider === 'glm' && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {t('settings.glmApiKey')}
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                            <Key size={16} />
                          </div>
                          <input
                            type="password"
                            value={GlmKey}
                            onChange={e => setGlmKey(e.target.value)}
                            placeholder={t('settings.glmApiKeyPlaceholder')}
                            disabled={Boolean(ENV_VARS.glmKey)}
                            className={clsx(
                              'w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
                              ENV_VARS.glmKey && 'opacity-70 cursor-not-allowed',
                            )}
                          />
                        </div>
                        {ENV_VARS.glmKey && (
                          <p className="text-emerald-600 text-xs dark:text-emerald-400">
                            {t('settings.loadedFromEnvironment')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ModelScope Settings */}
                  {apiProvider === 'modelscope' && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {t('settings.modelscopeApiKey')}
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                            <Key size={16} />
                          </div>
                          <input
                            type="password"
                            value={ModelScopeKey}
                            onChange={e => setModelScopeKey(e.target.value)}
                            placeholder={t('settings.modelscopeApiKeyPlaceholder')}
                            disabled={Boolean(ENV_VARS.modelscopeKey)}
                            className={clsx(
                              'w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
                              ENV_VARS.modelscopeKey && 'opacity-70 cursor-not-allowed',
                            )}
                          />
                        </div>
                        {ENV_VARS.modelscopeKey && (
                          <p className="text-emerald-600 text-xs dark:text-emerald-400">
                            {t('settings.loadedFromEnvironment')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Kimi Settings */}
                  {apiProvider === 'kimi' && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {t('settings.kimiApiKey')}
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                            <Key size={16} />
                          </div>
                          <input
                            type="password"
                            value={KimiKey}
                            onChange={e => setKimiKey(e.target.value)}
                            placeholder={t('settings.kimiApiKeyPlaceholder')}
                            disabled={Boolean(ENV_VARS.kimiKey)}
                            className={clsx(
                              'w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
                              ENV_VARS.kimiKey && 'opacity-70 cursor-not-allowed',
                            )}
                          />
                        </div>
                        {ENV_VARS.kimiKey && (
                          <p className="text-emerald-600 text-xs dark:text-emerald-400">
                            {t('settings.loadedFromEnvironment')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="h-px bg-gray-100 dark:bg-zinc-800" />

                {/* Supabase Config */}
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-900 dark:text-white">
                      {t('settings.supabaseConfiguration')}
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('settings.supabaseConfigurationHint')}
                    </p>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {t('settings.supabaseUrl')}
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
                        {t('settings.supabaseKey')}
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
                      {testing ? t('settings.testing') : t('settings.testConnectionAndTables')}
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
                              <span className="text-gray-700 dark:text-gray-300">
                                {t('settings.spacesTable')}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span>{testResult.tables.conversations ? '✅' : '❌'}</span>
                              <span className="text-gray-700 dark:text-gray-300">
                                {t('settings.chatSessionsTable')}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span>{testResult.tables.conversation_messages ? '✅' : '❌'}</span>
                              <span className="text-gray-700 dark:text-gray-300">
                                {t('settings.messagesTable')}
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
                    {t('settings.themeColor')}
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('settings.themeColorHint')}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(THEMES).map(([themeKey, theme]) => (
                    <button
                      key={themeKey}
                      type="button"
                      onClick={() => setThemeColor(themeKey)}
                      className={clsx(
                        'flex items-center justify-between gap-3 px-4 py-3 rounded-lg border text-left transition-colors',
                        themeColor === themeKey
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                          : 'border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 hover:bg-gray-100 dark:hover:bg-zinc-800',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="h-8 w-8 rounded-full border border-black/5 dark:border-white/10"
                          style={{ backgroundColor: theme.colors['--color-primary-500'] }}
                          aria-hidden="true"
                        />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {theme.label}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {theme.colors['--color-primary-500']}
                          </span>
                        </div>
                      </div>
                      {themeColor === themeKey && <Check size={16} className="text-primary-500" />}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-1 mt-8">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    {t('settings.messageFontSize')}
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('settings.messageFontSizeHint')}
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
                  {['small', 'medium', 'large', 'extra-large'].map(size => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setFontSize(size)}
                      className={clsx(
                        'flex items-center justify-center px-4 py-2.5 rounded-lg border text-sm font-medium transition-all',
                        fontSize === size
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                          : 'border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800',
                      )}
                    >
                      {t(`settings.fontSize.${size}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'chat' && (
              <div className="flex flex-col gap-8 max-w-2xl">
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
                    {t('settings.contextMessages')}
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('settings.contextMessagesHint')}
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
                      {t('settings.about.beta')}
                    </span>
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md leading-relaxed">
                    {t('settings.about.description')}
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
                    {t('settings.about.designedAndBuiltBy')}
                  </p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    havingautism & allabouturmind
                  </p>
                </div>

                <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-auto">
                  {t('settings.about.version')}
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
              {t('settings.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 cursor-pointer py-2 rounded-lg text-sm font-medium bg-primary-500 text-white hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving && <Loader2 size={16} className="animate-spin" />}
              {t('settings.saveChanges')}
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
                  {t('settings.initModal.title')}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('settings.initModal.description')}
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
                    ? t('settings.initModal.connectionOk')
                    : t('settings.initModal.connectionFailed')}
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
                          {exists ? t('settings.initModal.ready') : t('settings.initModal.missing')}{' '}
                          · {table}
                        </span>
                      )
                    })}
                  </div>
                )}
                {getMissingTables(initModalResult).length > 0 && (
                  <div className="text-xs text-primary-800 dark:text-primary-100">
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
              <ol className="list-decimal list-inside text-sm text-gray-700 dark:text-gray-300 space-y-1">
                <li>{t('settings.initModal.step1')}</li>
                <li>{t('settings.initModal.step2')}</li>
              </ol>
            </div>

            <div className="relative">
              <button
                onClick={copyInitSql}
                className="absolute top-3 right-3 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-zinc-800 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
              >
                <Copy size={14} />
                {copiedInitSql ? t('settings.initModal.copied') : t('settings.initModal.copySql')}
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
                {t('settings.initModal.close')}
              </button>
              <button
                onClick={handleRetestAfterInit}
                disabled={retestingDb}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-white hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
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
