import clsx from 'clsx'
import {
  Brain,
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
  Search,
  RefreshCw,
  Settings,
  Terminal,
  User,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useScrollLock from '../hooks/useScrollLock'
import { extractTextFromFile, normalizeExtractedText } from '../lib/documentParser'
import { renderProviderIcon } from '../lib/modelIcons'
import { getModelsForProvider } from '../lib/models_api'
import { getPublicEnv } from '../lib/publicEnv'
import { GLM_BASE_URL, SILICONFLOW_BASE_URL } from '../lib/providerConstants'
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
  tavilyApiKey: getPublicEnv('PUBLIC_TAVILY_API_KEY'),
  backendUrl: getPublicEnv('PUBLIC_BACKEND_URL'),
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

CREATE OR REPLACE FUNCTION public.set_conversation_updated_at()
RETURNS trigger AS $$
BEGIN
  IF (
    (NEW.title IS DISTINCT FROM OLD.title OR NEW.title_emojis IS DISTINCT FROM OLD.title_emojis OR NEW.is_favorited IS DISTINCT FROM OLD.is_favorited OR NEW.space_id IS DISTINCT FROM OLD.space_id)
    AND NEW.last_agent_id IS NOT DISTINCT FROM OLD.last_agent_id
    AND NEW.agent_selection_mode IS NOT DISTINCT FROM OLD.agent_selection_mode
    AND NEW.api_provider IS NOT DISTINCT FROM OLD.api_provider
    AND NEW.is_search_enabled IS NOT DISTINCT FROM OLD.is_search_enabled
    AND NEW.is_thinking_enabled IS NOT DISTINCT FROM OLD.is_thinking_enabled
  ) THEN
    NEW.updated_at = OLD.updated_at;
  ELSE
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.touch_conversation_updated_at()
RETURNS trigger AS $$
BEGIN
  UPDATE public.conversations
  SET updated_at = NOW()
  WHERE id = NEW.conversation_id;
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
  title_emojis JSONB NOT NULL DEFAULT '[]'::jsonb,
  api_provider TEXT NOT NULL DEFAULT 'gemini',
  is_search_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_thinking_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_favorited BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_space_id ON public.conversations(space_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON public.conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON public.conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_title ON public.conversations(title);
CREATE INDEX IF NOT EXISTS idx_conversations_space_created ON public.conversations(space_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_space_updated ON public.conversations(space_id, updated_at DESC);

CREATE TRIGGER trg_conversations_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW EXECUTE PROCEDURE public.set_conversation_updated_at();

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

CREATE TRIGGER trg_messages_touch_conversation
AFTER INSERT OR UPDATE ON public.conversation_messages
FOR EACH ROW EXECUTE PROCEDURE public.touch_conversation_updated_at();

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

CREATE TABLE IF NOT EXISTS public.space_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  content_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_space_documents_space_id ON public.space_documents(space_id);

CREATE TRIGGER trg_space_documents_updated_at
BEFORE UPDATE ON public.space_documents
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.conversation_documents (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.space_documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_documents_conversation_id
  ON public.conversation_documents(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_documents_document_id
  ON public.conversation_documents(document_id);

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
const SEARCH_PROVIDER_KEYS = ['tavily']

const INTERFACE_LANGUAGE_KEYS = ['en', 'zh-CN']
const DOCUMENT_CHUNK_SIZE = 1200
const DOCUMENT_CHUNK_OVERLAP = 200
const DOCUMENT_MAX_CHUNKS = 60
const DOCUMENT_TOP_K = 3

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
  const [NvidiaKey, setNvidiaKey] = useState('')
  const [MinimaxKey, setMinimaxKey] = useState('')
  const [GlmKey, setGlmKey] = useState('')
  const [ModelScopeKey, setModelScopeKey] = useState('')
  const [KimiKey, setKimiKey] = useState('')
  const [apiProvider, setApiProvider] = useState('gemini')
  const [googleApiKey, setGoogleApiKey] = useState('')
  const [searchProvider, setSearchProvider] = useState('tavily')
  const [tavilyApiKey, setTavilyApiKey] = useState('')
  const [backendUrl, setBackendUrl] = useState('')
  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [supabaseKey, setSupabaseKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false)
  const providerDropdownRef = useRef(null)
  const [isSearchProviderDropdownOpen, setIsSearchProviderDropdownOpen] = useState(false)
  const searchProviderDropdownRef = useRef(null)
  const [isInterfaceLanguageDropdownOpen, setIsInterfaceLanguageDropdownOpen] = useState(false)
  const interfaceLanguageDropdownRef = useRef(null)
  const [isEmbeddingProviderDropdownOpen, setIsEmbeddingProviderDropdownOpen] = useState(false)
  const embeddingProviderDropdownRef = useRef(null)
  const [contextMessageLimit, setContextMessageLimit] = useState(12)
  const [themeColor, setThemeColor] = useState('violet')
  const [fontSize, setFontSize] = useState('medium')
  const [isSaving, setIsSaving] = useState(false)
  const [enableRelatedQuestions, setEnableRelatedQuestions] = useState(false)
  const [interfaceLanguage, setInterfaceLanguage] = useState('en')
  const [followInterfaceLanguage, setFollowInterfaceLanguage] = useState(false)
  const [enableLongTermMemory, setEnableLongTermMemory] = useState(false)
  const [memoryRecallLimit, setMemoryRecallLimit] = useState(5)
  const [embeddingProvider, setEmbeddingProvider] = useState('')
  const [embeddingModel, setEmbeddingModel] = useState('')
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
    { id: 'personalization', icon: User },
    { id: 'interface', icon: Monitor },
    { id: 'account', icon: Key },
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

  const searchProviderOptions = useMemo(
    () =>
      SEARCH_PROVIDER_KEYS.map(key => ({
        key,
        value: key,
        label: t(`settings.searchProviders.${key}`),
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
  const embeddingModelCount = useMemo(
    () => Object.values(embeddingGroupedModels).reduce((sum, models) => sum + models.length, 0),
    [embeddingGroupedModels],
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
      if (settings.NvidiaKey) setNvidiaKey(settings.NvidiaKey)
      if (settings.MinimaxKey) setMinimaxKey(settings.MinimaxKey)
      if (settings.GlmKey) setGlmKey(settings.GlmKey)
      if (settings.ModelScopeKey) setModelScopeKey(settings.ModelScopeKey)
      if (settings.KimiKey) setKimiKey(settings.KimiKey)
      if (settings.apiProvider) setApiProvider(settings.apiProvider)
      if (settings.googleApiKey) setGoogleApiKey(settings.googleApiKey)
      if (settings.searchProvider) setSearchProvider(settings.searchProvider)
      if (settings.tavilyApiKey) setTavilyApiKey(settings.tavilyApiKey)
      if (settings.backendUrl) setBackendUrl(settings.backendUrl)
      if (settings.contextMessageLimit) setContextMessageLimit(Number(settings.contextMessageLimit))
      if (settings.themeColor) setThemeColor(settings.themeColor)
      if (settings.fontSize) setFontSize(settings.fontSize)
      if (typeof settings.enableRelatedQuestions === 'boolean')
        setEnableRelatedQuestions(settings.enableRelatedQuestions)
      if (typeof settings.followInterfaceLanguage === 'boolean')
        setFollowInterfaceLanguage(settings.followInterfaceLanguage)
      if (typeof settings.enableLongTermMemory === 'boolean')
        setEnableLongTermMemory(settings.enableLongTermMemory)
      const parsedRecallLimit = Number(settings.memoryRecallLimit)
      if (Number.isFinite(parsedRecallLimit)) setMemoryRecallLimit(parsedRecallLimit)
      if (settings.embeddingProvider) setEmbeddingProvider(settings.embeddingProvider)
      if (settings.embeddingModelSource)
        setEmbeddingModelSource(settings.embeddingModelSource || 'list')
      if (settings.embeddingModel) setEmbeddingModel(settings.embeddingModel)
      if (settings.embeddingModelSource === 'custom')
        setEmbeddingCustomModel(settings.embeddingModel || '')
      if (typeof settings.userSelfIntro === 'string') setUserSelfIntro(settings.userSelfIntro)
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
      if (settings.supabaseUrl && settings.supabaseKey) {
        fetchRemoteSettings().then(({ data }) => {
          if (data) {
            if (data.OpenAICompatibilityKey) setOpenAICompatibilityKey(data.OpenAICompatibilityKey)
            if (data.OpenAICompatibilityUrl) setOpenAICompatibilityUrl(data.OpenAICompatibilityUrl)
            if (data.SiliconFlowKey) setSiliconFlowKey(data.SiliconFlowKey)
            if (data.NvidiaKey) setNvidiaKey(data.NvidiaKey)
            if (data.MinimaxKey) setMinimaxKey(data.MinimaxKey)
            if (data.GlmKey) setGlmKey(data.GlmKey)
            if (data.ModelScopeKey) setModelScopeKey(data.ModelScopeKey)
            if (data.KimiKey) setKimiKey(data.KimiKey)
            if (data.googleApiKey) setGoogleApiKey(data.googleApiKey)
            if (data.searchProvider) setSearchProvider(data.searchProvider)
            if (data.tavilyApiKey) setTavilyApiKey(data.tavilyApiKey)
            if (data.backendUrl) setBackendUrl(data.backendUrl)
          }
        })
      }
    }
  }, [isOpen, i18n])

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

  const fetchEmbeddingVector = async ({ text, taskType }) => {
    const trimmed = text.trim()
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
      for (let index = 0; index < documentChunks.length; index += 1) {
        const chunk = documentChunks[index]
        const vector = await fetchEmbeddingVector({
          text: chunk.text,
          taskType: 'RETRIEVAL_DOCUMENT',
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
      const vector = await fetchEmbeddingVector({
        text: userSelfIntro,
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
      else if (key === 'modelscope') credentials = { apiKey: keys.modelscope }
      else if (key === 'kimi') credentials = { apiKey: keys.kimi }
      else if (key === 'openai_compatibility')
        credentials = { apiKey: keys.openai_compatibility, baseUrl: keys.openai_compatibility_url }

      if (!credentials.apiKey) continue

      enabledProviders.push(key)
      try {
        const models = await getModelsForProvider(key, credentials)
        grouped[key] = Array.isArray(models) ? models : []
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

  useEffect(() => {
    if (isOpen && activeTab === 'model') {
      loadEmbeddingModels()
    }
  }, [activeTab, isOpen])

  useEffect(() => {
    if (embeddingModelSource !== 'list') return
    const activeModels = embeddingGroupedModels[embeddingProvider] || []
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
    setRetestingDb(true)
    const result = await testConnection(supabaseUrl, supabaseKey)
    setTestResult(result)
    setInitModalResult(result)
    setRetestingDb(false)
    if (result.success) {
      setIsInitModalOpen(false)
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

  if (!isOpen) return null

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)

    const result = await testConnection(supabaseUrl, supabaseKey)
    setTestResult(result)
    setTesting(false)
    if (!result.success) {
      setInitModalResult(result)
      setIsInitModalOpen(true)
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
          setInitModalResult(result)
          setIsInitModalOpen(true)
          return
        }
      }

      // TODO: Validate inputs

      const newSettings = {
        apiProvider,
        googleApiKey,
        searchProvider,
        tavilyApiKey,
        backendUrl,
        OpenAICompatibilityKey,
        OpenAICompatibilityUrl,
        SiliconFlowKey,
        NvidiaKey,
        MinimaxKey,
        GlmKey,
        ModelScopeKey,
        KimiKey,
        supabaseUrl,
        supabaseKey,
        contextMessageLimit,
        themeColor,
        fontSize,
        enableRelatedQuestions,
        enableLongTermMemory,
        memoryRecallLimit,
        embeddingProvider,
        embeddingModel,
        embeddingModelSource,
        userSelfIntro,
        interfaceLanguage,
        followInterfaceLanguage,
        developerMode,
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
      <div className="w-full h-[100dvh] md:max-w-5xl md:h-[85vh] bg-white dark:bg-[#191a1a] rounded-none md:rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row border-0 md:border border-gray-200 dark:border-zinc-800 relative">
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
                        setIsSearchProviderDropdownOpen(false)
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
                      'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/40',
                      followInterfaceLanguage
                        ? 'bg-primary-500 border-primary-500'
                        : 'bg-gray-200 dark:bg-zinc-800 border-gray-300 dark:border-zinc-700',
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

                  <div className="relative" ref={providerDropdownRef}>
                    <button
                      onClick={() => {
                        const nextOpen = !isProviderDropdownOpen
                        setIsInterfaceLanguageDropdownOpen(false)
                        setIsSearchProviderDropdownOpen(false)
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

                  {/* MiniMax Settings */}
                  {apiProvider === 'minimax' && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {t('settings.minimaxApiKey', { defaultValue: 'MiniMax API Key' })}
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
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
                              'w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
                            )}
                          />
                        </div>
                      </div>
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

                  {/* NVIDIA Settings */}
                  {apiProvider === 'nvidia' && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {t('settings.nvidiaApiKey', { defaultValue: 'NVIDIA API Key' })}
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
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
                              'w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
                            )}
                          />
                        </div>
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

                {/* Backend Configuration */}
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-900 dark:text-white">
                      {t('settings.backendConfiguration')}
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('settings.backendConfigurationHint')}
                    </p>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {t('settings.backendUrl')}
                      </label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                          <Link size={16} />
                        </div>
                        <input
                          type="text"
                          value={backendUrl}
                          onChange={e => setBackendUrl(e.target.value)}
                          placeholder={t('settings.backendUrlPlaceholder')}
                          disabled={Boolean(ENV_VARS.backendUrl)}
                          className={clsx(
                            'w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
                            ENV_VARS.backendUrl && 'opacity-70 cursor-not-allowed',
                          )}
                        />
                      </div>
                      {renderEnvHint(Boolean(ENV_VARS.backendUrl))}
                    </div>
                  </div>
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
                <div className="h-px bg-gray-100 dark:bg-zinc-800" />

                {/* Search Provider */}
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-900 dark:text-white">
                      {t('settings.searchConfiguration')}
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('settings.searchConfigurationHint')}
                    </p>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {t('settings.searchProvider')}
                      </label>
                      <div className="relative w-full" ref={searchProviderDropdownRef}>
                        <button
                          onClick={() => {
                            const nextOpen = !isSearchProviderDropdownOpen
                            setIsProviderDropdownOpen(false)
                            setIsInterfaceLanguageDropdownOpen(false)
                            setIsSearchProviderDropdownOpen(nextOpen)
                          }}
                          className="w-full flex items-center justify-between pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800"
                        >
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center">
                            <Search size={16} className="text-gray-400" />
                          </div>
                          <div className="flex items-center gap-3">
                            {renderProviderIcon(searchProvider, {
                              size: 16,
                              alt: t(`settings.searchProviders.${searchProvider}`),
                            })}
                            <span>
                              {searchProviderOptions.find(option => option.value === searchProvider)
                                ?.label || searchProvider}
                            </span>
                          </div>
                          <ChevronDown
                            size={16}
                            className={clsx(
                              'text-gray-400 transition-transform duration-200',
                              isSearchProviderDropdownOpen && 'rotate-180',
                            )}
                          />
                        </button>

                        {isSearchProviderDropdownOpen && (
                          <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                            {searchProviderOptions.map(option => (
                              <button
                                key={option.key}
                                onClick={() => {
                                  setSearchProvider(option.value)
                                  setIsSearchProviderDropdownOpen(false)
                                }}
                                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors flex items-center justify-between"
                              >
                                <div className="flex items-center gap-3">
                                  {renderProviderIcon(option.value, {
                                    size: 16,
                                    alt: option.label,
                                  })}
                                  <span>{option.label}</span>
                                </div>
                                {searchProvider === option.value && (
                                  <Check size={14} className="text-primary-500" />
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {searchProvider === 'tavily' && (
                      <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {t('settings.tavilyApiKey')}
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                            <Key size={16} />
                          </div>
                          <input
                            type="password"
                            value={tavilyApiKey}
                            onChange={e => setTavilyApiKey(e.target.value)}
                            placeholder={t('settings.tavilyApiKeyPlaceholder')}
                            disabled={Boolean(ENV_VARS.tavilyApiKey)}
                            className={clsx(
                              'w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
                              ENV_VARS.tavilyApiKey && 'opacity-70 cursor-not-allowed',
                            )}
                          />
                        </div>
                        {ENV_VARS.tavilyApiKey && (
                          <p className="text-emerald-600 text-xs dark:text-emerald-400">
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
              <div className="flex flex-col gap-8 max-w-2xl">
                <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-lg flex gap-3 text-sm text-blue-700 dark:text-blue-300">
                  <Info size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">{t('settings.embeddingConfiguration')}</p>
                    <p className="opacity-90">{t('settings.embeddingConfigurationHint')}</p>
                  </div>
                </div>

                {embeddingModelsLoading ? (
                  <div className="flex items-center justify-center py-8 text-gray-500 gap-2">
                    <RefreshCw className="animate-spin" size={20} />
                    <span>{t('settings.loadingModels')}</span>
                  </div>
                ) : embeddingAvailableProviders.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 dark:border-zinc-700 p-6 text-center text-sm text-gray-500 dark:text-gray-400">
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
                        className="flex items-center gap-1 text-primary-600 hover:text-primary-700 dark:text-primary-400"
                      >
                        <RefreshCw size={14} />
                        {t('settings.embeddingRefreshModels')}
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="flex flex-col gap-2 w-full sm:w-auto">
                          <div className="flex flex-wrap items-center gap-3 w-full">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">
                              {t('settings.embeddingModel')}
                            </label>
                            <div className="flex bg-gray-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-gray-200 dark:border-zinc-700">
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
                                  'px-3 py-1 text-xs font-medium rounded-md transition-all',
                                  embeddingModelSource === 'list'
                                    ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-gray-100 shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
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
                                  'px-3 py-1 text-xs font-medium rounded-md transition-all',
                                  embeddingModelSource === 'custom'
                                    ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-gray-100 shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
                                )}
                              >
                                {t('settings.modelSourceCustom')}
                              </button>
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-2xl">
                            {t('settings.embeddingModelHint')}
                          </p>
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate text-left sm:text-right w-full sm:w-auto mt-1 sm:mt-0">
                          {embeddingDisplayLabel}
                        </span>
                      </div>

                      <div className="rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3">
                        <div className="flex flex-col gap-3">
                          <div
                            className="flex flex-col gap-2 relative"
                            ref={embeddingProviderDropdownRef}
                          >
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                              {t('settings.embeddingProvider')}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const nextOpen = !isEmbeddingProviderDropdownOpen
                                setIsEmbeddingProviderDropdownOpen(nextOpen)
                              }}
                              className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                            >
                              <div className="flex items-center gap-3">
                                {renderProviderIcon(embeddingProvider, {
                                  size: 16,
                                  alt: embeddingProviderLabel,
                                })}
                                <span>{embeddingProviderLabel}</span>
                              </div>
                              <ChevronDown
                                size={16}
                                className={clsx(
                                  'text-gray-400 transition-transform',
                                  isEmbeddingProviderDropdownOpen && 'rotate-180',
                                )}
                              />
                            </button>
                            {isEmbeddingProviderDropdownOpen && (
                              <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                {embeddingAvailableProviders.map(key => (
                                  <button
                                    key={key}
                                    type="button"
                                    onClick={() => {
                                      setEmbeddingProvider(key)
                                      setIsEmbeddingProviderDropdownOpen(false)
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
                                    {embeddingProvider === key && (
                                      <Check size={14} className="text-primary-500" />
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                              {t('settings.embeddingModel')}
                            </span>
                            {embeddingModelSource === 'list' ? (
                              <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-zinc-700">
                                {activeEmbeddingModels.length > 0 ? (
                                  activeEmbeddingModels.map(model => (
                                    <button
                                      key={model.value}
                                      type="button"
                                      onClick={() => {
                                        setEmbeddingModel(model.value)
                                      }}
                                      className={clsx(
                                        'w-full text-left px-4 py-2 text-sm flex items-center justify-between gap-2',
                                        embeddingModel === model.value
                                          ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-200'
                                          : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-zinc-800',
                                      )}
                                    >
                                      <span className="truncate">{model.label}</span>
                                      {embeddingModel === model.value && (
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
                                value={embeddingCustomModel}
                                onChange={e => {
                                  const nextValue = e.target.value
                                  setEmbeddingCustomModel(nextValue)
                                  setEmbeddingModel(nextValue)
                                }}
                                placeholder={t('settings.customModelIdPlaceholder')}
                                className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
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
              <div className="flex flex-col gap-8 max-w-2xl">
                <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-lg flex gap-3 text-sm text-blue-700 dark:text-blue-300">
                  <Info size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">{t('settings.longTermMemory')}</p>
                    <p className="opacity-90">{t('settings.longTermMemoryHint')}</p>
                  </div>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-semibold text-gray-900 dark:text-white">
                      {t('settings.enableLongTermMemory')}
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('settings.enableLongTermMemoryHint')}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enableLongTermMemory}
                    onClick={() => setEnableLongTermMemory(prev => !prev)}
                    className={clsx(
                      'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/40',
                      enableLongTermMemory
                        ? 'bg-primary-500 border-primary-500'
                        : 'bg-gray-200 dark:bg-zinc-800 border-gray-300 dark:border-zinc-700',
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

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    {t('settings.memoryRecallLimit')}
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('settings.memoryRecallLimitHint')}
                  </p>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={memoryRecallLimit}
                    onChange={e =>
                      setMemoryRecallLimit(Math.min(20, Math.max(1, Number(e.target.value) || 1)))
                    }
                    disabled={!enableLongTermMemory}
                    className="w-32 mt-1 px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            )}

            {activeTab === 'personalization' && (
              <div className="flex flex-col gap-8 max-w-2xl">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    {t('settings.userSelfIntro')}
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('settings.userSelfIntroHint')}
                  </p>
                  <textarea
                    value={userSelfIntro}
                    onChange={e => setUserSelfIntro(e.target.value)}
                    placeholder={t('settings.userSelfIntroPlaceholder')}
                    rows={5}
                    className="w-full px-4 py-2 text-sm bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-none"
                  />
                </div>

                <div className="h-px bg-gray-100 dark:bg-zinc-800" />

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
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600"
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleIntroEmbedding}
                      disabled={!canRunIntroEmbedding}
                      className="px-4 py-2 text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 border border-primary-200 dark:border-primary-800"
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
                      className="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 border border-gray-200 dark:border-zinc-700"
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
                    <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-900/20 p-3 text-xs text-emerald-900 dark:text-emerald-100 space-y-2">
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
                      className="w-full text-sm text-gray-600 dark:text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 dark:file:bg-zinc-800 dark:file:text-gray-200 dark:hover:file:bg-zinc-700"
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
                    <div className="rounded-lg border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900 p-3 text-xs text-gray-700 dark:text-gray-300 space-y-1">
                      <div>
                        {t('settings.documentFileLabel')}: {documentParseState.fileName}
                      </div>
                      <div>
                        {t('settings.documentCharacters')}: {documentParseState.characters}
                      </div>
                      <div>
                        {t('settings.documentChunks')}: {documentParseState.chunks}
                        {documentParseState.truncated && (
                          <span className="text-amber-600 dark:text-amber-400 ml-2">
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
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600"
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleDocumentIndex}
                      disabled={!canRunDocumentIndex}
                      className="px-4 py-2 text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 border border-primary-200 dark:border-primary-800"
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
                      className="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 border border-gray-200 dark:border-zinc-700"
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
                      <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-900/20 p-3 text-xs text-emerald-900 dark:text-emerald-100 space-y-3">
                        <div className="font-semibold">{t('settings.documentResultsTitle')}</div>
                        {documentSearchState.results.map(result => (
                          <div
                            key={result.id}
                            className="rounded-md border border-emerald-200/60 dark:border-emerald-900/60 bg-white/60 dark:bg-zinc-900/40 p-2"
                          >
                            <div className="text-emerald-800/80 dark:text-emerald-100/80 mb-1">
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

            {activeTab === 'advanced' && (
              <div className="flex flex-col gap-8 max-w-2xl">
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
                        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/40',
                        developerMode
                          ? 'bg-primary-500 border-primary-500'
                          : 'bg-gray-200 dark:bg-zinc-800 border-gray-300 dark:border-zinc-700',
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
