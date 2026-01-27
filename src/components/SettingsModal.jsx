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
  MessageSquare,
  Monitor,
  Search,
  RefreshCw,
  Settings,
  Terminal,
  X,
  Database,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useScrollLock from '../hooks/useScrollLock'
import { extractTextFromFile, normalizeExtractedText } from '../lib/documentParser'
import { renderProviderIcon, getModelIcon, getModelIconClassName } from '../lib/modelIcons'
import { getModelsForProvider } from '../lib/models_api'
import { getPublicEnv } from '../lib/publicEnv'
import { GLM_BASE_URL, SILICONFLOW_BASE_URL } from '../lib/providerConstants'
import { loadSettings, saveSettings } from '../lib/settings'
import { fetchRemoteSettings, saveRemoteSettings, testConnection } from '../lib/supabase'
import { THEMES } from '../lib/themes'
import Logo from './Logo'
import { useAppContext } from '../App'
import {
  formatMemorySummariesAppendText,
  upsertMemoryDomainSummary,
  ensureLongTermMemoryIndex,
} from '../lib/longTermMemoryService'
import { getProvider } from '../lib/providers'

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
  embedding_provider TEXT,
  embedding_model TEXT,
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

CREATE TABLE IF NOT EXISTS public.memory_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  domain_key TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}'::text[],
  scope TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_domains_updated_at
  ON public.memory_domains(updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_domains_user_key
  ON public.memory_domains(user_id, domain_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_domains_key_single_user
  ON public.memory_domains(domain_key)
  WHERE user_id IS NULL;

CREATE TRIGGER trg_memory_domains_updated_at
BEFORE UPDATE ON public.memory_domains
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.memory_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES public.memory_domains(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  evidence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_summaries_domain_id
  ON public.memory_summaries(domain_id);
CREATE INDEX IF NOT EXISTS idx_memory_summaries_updated_at
  ON public.memory_summaries(updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_summaries_domain_id_unique
  ON public.memory_summaries(domain_id);

CREATE TRIGGER trg_memory_summaries_updated_at
BEFORE UPDATE ON public.memory_summaries
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
const TOOLS_API_PROVIDER_KEYS = ['tavily']
const DATABASE_PROVIDER_KEYS = ['supabase']

const INTERFACE_LANGUAGE_KEYS = ['en', 'zh-CN']
const DOCUMENT_CHUNK_SIZE = 1200
const DOCUMENT_CHUNK_OVERLAP = 200
const DOCUMENT_MAX_CHUNKS = 60
const DOCUMENT_TOP_K = 3

const EMBEDDING_KEYWORDS = ['embed', 'bge', 'vector']
const MEMORY_DOMAIN_MAX_ITEMS = 8
const MEMORY_DOMAIN_SUMMARY_MAX_CHARS = 240

const matchesEmbeddingKeyword = model => {
  const text = String((model?.value || model?.label) ?? '').toLowerCase()
  return EMBEDDING_KEYWORDS.some(keyword => text.includes(keyword))
}

const normalizeDomainKey = value => {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
  if (!raw) return ''
  return raw.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

const truncateDomainSummary = value => {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  if (trimmed.length <= MEMORY_DOMAIN_SUMMARY_MAX_CHARS) return trimmed
  return `${trimmed.slice(0, MEMORY_DOMAIN_SUMMARY_MAX_CHARS)}...`
}

const extractJsonObject = text => {
  const trimmed = String(text || '').trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1)
  }
  return ''
}

const safeJsonParse = str => {
  let cleaned = String(str || '').trim()
  if (!cleaned) return null

  try {
    return JSON.parse(cleaned)
  } catch (e) {
    // If it fails, it might be using single quotes (common in some Lite models)
    try {
      // Heuristic: swap single quotes with double quotes
      // and handle common issues like trailing commas
      const normalized = cleaned.replace(/'/g, '"').replace(/,\s*([\]}])/g, '$1') // remove trailing commas
      return JSON.parse(normalized)
    } catch (e2) {
      console.warn('[Settings] Final JSON parse attempt failed:', e2)
      return null
    }
  }
}

const parseMemoryDomainExtractionResponse = content => {
  const raw = extractJsonObject(content)
  if (!raw) return []
  const parsed = safeJsonParse(raw)
  if (!parsed) return []

  try {
    const domains = Array.isArray(parsed?.domains) ? parsed.domains : []
    // Flatten tags back to domain_key + aliases logic for DB compatibility
    return domains
      .map(d => {
        const tags = Array.isArray(d.tags)
          ? d.tags.filter(Boolean)
          : d.domain_key
            ? [d.domain_key, ...(Array.isArray(d.aliases) ? d.aliases : [])]
            : []
        if (tags.length === 0) return null
        return {
          domain_key: String(tags[0]).toLowerCase(), // First tag becomes primary ID
          aliases: tags.slice(1).map(t => String(t).toLowerCase()), // Rest become aliases
          summary: d.summary || '',
          scope: d.scope || '',
        }
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

const buildMemoryDomainExtractionPrompt = introText => {
  return [
    `Task: Act as an information extraction expert. Analyze the User's Self-Introduction and extract MULTIPLE significant, granular factual memory tags.`,
    ``,
    `Rules:`,
    `1. Extract separate domains for each category: Career, Skills, Hobbies, Location, Preferences, etc.`,
    `2. Each domain MUST have a 'tags' array (e.g. ["python", "coding", "backend"]) and a 'summary'.`,
    `3. Use the user's PRECISE language for the summary (e.g., if input is Chinese, summary MUST be Chinese).`,
    `4. Return ONLY valid JSON in the specified format.`,
    `5. CRITICAL: Use DOUBLE QUOTES (") for all keys and strings. NEVER use single quotes (').`,
    ``,
    `Example Input:`,
    `"I am a backend dev based in Beijing. I love basketball and hip-hop."`,
    ``,
    `Example Output:`,
    `{`,
    `  "domains": [`,
    `    {"tags": ["career", "backend", "developer"], "summary": "User is a backend developer.", "scope": "Career"},`,
    `    {"tags": ["location", "beijing"], "summary": "User is based in Beijing.", "scope": "Location"},`,
    `    {"tags": ["sports", "basketball"], "summary": "User loves basketball.", "scope": "Hobbies"},`,
    `    {"tags": ["music", "hiphop"], "summary": "User enjoys hip-hop music.", "scope": "Interests"}`,
    `  ]`,
    `}`,
    ``,
    `Example Input (Chinese):`,
    `"我是一名全栈开发，喜欢单机游戏。"`,
    ``,
    `Example Output (Chinese):`,
    `{`,
    `  "domains": [`,
    `    {"tags": ["career", "fullstack", "developer"], "summary": "用户是一名全栈软件开发程序员。", "scope": "职业背景"},`,
    `    {"tags": ["gaming", "single-player"], "summary": "用户喜欢有剧情的单机游戏。", "scope": "兴趣爱好"}`,
    `  ]`,
    `}`,
    ``,
    `Analyze this Introduction:`,
    `"""`,
    `${introText}`,
    `"""`,
  ].join('\n')
}

const resolveLiteModelConfig = (agent, settings) => {
  const defaultModel = agent?.default_model ?? agent?.defaultModel
  const liteModel = agent?.lite_model ?? agent?.liteModel
  const defaultModelProvider = agent?.default_model_provider ?? agent?.defaultModelProvider ?? ''
  const liteModelProvider = agent?.lite_model_provider ?? agent?.liteModelProvider ?? ''
  const model = (
    liteModel ||
    defaultModel ||
    settings?.liteModel ||
    settings?.defaultModel ||
    ''
  ).trim()
  const provider = (
    liteModelProvider ||
    defaultModelProvider ||
    agent?.provider ||
    settings?.apiProvider ||
    ''
  ).trim()

  if (!model || !provider) return null
  return { model, provider }
}

const validateSettingsForSave = settings => {
  const contextLimit = Number(settings.contextMessageLimit)
  if (!Number.isFinite(contextLimit) || contextLimit < 1 || contextLimit > 50) return false
  const memoryLimit = Number(settings.memoryRecallLimit)
  if (!Number.isFinite(memoryLimit) || memoryLimit < 1 || memoryLimit > 20) return false
  return true
}

const SettingsModal = ({ isOpen, onClose, onOpenSupabaseSetup }) => {
  const { t, i18n } = useTranslation()
  const { defaultAgent } = useAppContext()

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
  const [backendUrl, setBackendUrl] = useState(ENV_VARS.backendUrl || '')
  const [databaseProvider, setDatabaseProvider] = useState('supabase')
  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [supabaseKey, setSupabaseKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
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

  const toolsApiProviderOptions = useMemo(
    () =>
      TOOLS_API_PROVIDER_KEYS.map(key => ({
        key,
        value: key,
        label: t(`settings.toolsApiProviders.${key}`),
      })),
    [t],
  )

  const databaseProviderOptions = useMemo(
    () =>
      DATABASE_PROVIDER_KEYS.map(key => ({
        key,
        value: key,
        label: t(`settings.databaseProviders.${key}`),
        icon: renderProviderIcon(key, {
          size: 18,
          compact: true,
          wrapperClassName: 'bg-transparent p-0 shadow-none',
          imgClassName: 'w-4 h-4',
        }),
      })),
    [t],
  )
  const selectedDatabaseProviderOption = databaseProviderOptions.find(
    option => option.value === databaseProvider,
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
      if (settings.databaseProvider) setDatabaseProvider(settings.databaseProvider)
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
      if (settings.backendUrl && !ENV_VARS.backendUrl) setBackendUrl(settings.backendUrl)
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
      if (
        settings.databaseProvider === 'supabase' &&
        settings.supabaseUrl &&
        settings.supabaseKey
      ) {
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
            if (data.backendUrl && !ENV_VARS.backendUrl) setBackendUrl(data.backendUrl)
            if (data.embeddingProvider) setEmbeddingProvider(data.embeddingProvider)
            if (data.embeddingModelSource)
              setEmbeddingModelSource(data.embeddingModelSource || 'list')
            if (data.embeddingModel) setEmbeddingModel(data.embeddingModel)
            if (data.embeddingModelSource === 'custom')
              setEmbeddingCustomModel(data.embeddingModel || '')
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

  useEffect(() => {
    if (isOpen && activeTab === 'model') {
      loadEmbeddingModels()
    }
  }, [activeTab, isOpen])

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
  const isSupabaseProvider = databaseProvider === 'supabase'

  if (!isOpen) return null

  const resolveBackendUrlForHealthCheck = () => {
    const settings = loadSettings()
    return ENV_VARS.backendUrl || backendUrl || settings.backendUrl || 'http://localhost:3001'
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

  const handleTestConnection = async () => {
    if (!isSupabaseProvider) return
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
      const settingsToSave = {
        apiProvider,
        googleApiKey,
        searchProvider,
        tavilyApiKey,
        backendUrl,
        // API Keys
        OpenAICompatibilityKey,
        OpenAICompatibilityUrl,
        GoogleApiKey: googleApiKey,
        SiliconFlowKey,
        NvidiaKey,
        MinimaxKey,
        GlmKey,
        ModelScopeKey,
        KimiKey,
        // Providers
        databaseProvider,
        supabaseUrl,
        supabaseKey,
        // UI
        themeColor,
        messageFontSize: fontSize,
        interfaceLanguage,
        followInterfaceLanguage,
        // Advanced
        developerMode,
        // Chat
        enableRelatedQuestions,
        contextMessageLimit,
        // Memory
        enableLongTermMemory,
        memoryRecallLimit,
        userSelfIntro,
        // Embedding
        embeddingProvider,
        embeddingModel,
        embeddingModelSource,
        embeddingCustomModel,
      }

      const didPassValidation = validateSettingsForSave(settingsToSave)
      if (!didPassValidation) {
        // Validation failed (toast/alert would handle it inside validate or UI)
        return
      }

      // Save to local storage
      await saveSettings(settingsToSave)

      // Handle personal intro memory extraction if changed
      const introChanged = userSelfIntro.trim() !== (initialSelfIntroRef.current || '').trim()

      if (userSelfIntro && introChanged) {
        console.log('[Settings] Intro changed, starting memory extraction...')
        try {
          // 1. Update the base profile domain immediately
          await ensureLongTermMemoryIndex({ text: userSelfIntro })

          // 2. Resolve a lightweight model and its corresponding provider
          const liteConfig = resolveLiteModelConfig(defaultAgent, settingsToSave)
          const extractionProviderName = liteConfig?.provider || apiProvider
          const extractionProvider = getProvider(extractionProviderName)

          const canRunExtraction =
            extractionProvider &&
            (extractionProvider.streamChatCompletion || extractionProvider.generateChatCompletion)

          console.log(
            `[Settings] Extraction check: provider=${liteConfig?.provider || apiProvider}, model=${liteConfig?.model}, canRun=${!!canRunExtraction}`,
          )

          if (canRunExtraction && liteConfig?.model) {
            const extractionPrompt = buildMemoryDomainExtractionPrompt(userSelfIntro)
            const messages = [
              { role: 'system', content: 'You are a precise JSON extractor.' },
              { role: 'user', content: extractionPrompt },
            ]

            let fullContent = ''
            try {
              if (extractionProvider.streamChatCompletion) {
                // Resolve the specific API Key for the extraction provider
                let extractionApiKey = ''
                switch (extractionProviderName) {
                  case 'gemini':
                    extractionApiKey = googleApiKey
                    break
                  case 'openai':
                    extractionApiKey = OpenAICompatibilityKey
                    break
                  case 'siliconflow':
                    extractionApiKey = SiliconFlowKey
                    break
                  case 'nvidia':
                    extractionApiKey = NvidiaKey
                    break
                  case 'minimax':
                    extractionApiKey = MinimaxKey
                    break
                  case 'glm':
                    extractionApiKey = GlmKey
                    break
                  case 'kimi':
                    extractionApiKey = KimiKey
                    break
                  case 'modelscope':
                    extractionApiKey = ModelScopeKey
                    break
                }

                await extractionProvider.streamChatCompletion({
                  ...settingsToSave,
                  apiKey: extractionApiKey, // Explicitly pass as apiKey
                  baseUrl: extractionProviderName === 'openai' ? OpenAICompatibilityUrl : undefined,
                  model: liteConfig.model,
                  messages,
                  temperature: 0.1,
                  responseFormat: { type: 'json_object' },
                  onChunk: chunk => {
                    const text = typeof chunk === 'string' ? chunk : chunk?.content || ''
                    fullContent += text
                  },
                  onFinish: result => {
                    if (result?.content) fullContent = result.content
                  },
                })
              } else {
                // Fallback for non-streaming providers if any (currently mostly stream)
              }

              // Parse and save extracted domains
              if (fullContent) {
                console.log('[Settings] Extraction raw output:', fullContent)
                const domains = parseMemoryDomainExtractionResponse(fullContent)
                if (Array.isArray(domains) && domains.length > 0) {
                  for (const domain of domains) {
                    await upsertMemoryDomainSummary({
                      domainKey: domain.domain_key,
                      summary: domain.summary,
                      aliases: domain.aliases,
                      scope: domain.scope,
                    })
                  }
                  console.log('[Settings] Extracted and saved memory domains:', domains.length)
                } else {
                  console.warn('[Settings] No domains extracted from model output.')
                }
              }
            } catch (extractError) {
              console.error('[Settings] Failed to extract memory domains:', extractError)
            }
          }
        } catch (memoryError) {
          console.error('[Settings] Failed to update memory profile:', memoryError)
        }

        // Update ref
        initialSelfIntroRef.current = userSelfIntro
      }

      // Prevent accidental overwrite of remote keys with empty local keys
      if (isSupabaseProvider && supabaseUrl && supabaseKey) {
        try {
          const { data: remoteData } = await fetchRemoteSettings()
          if (remoteData) {
            // Keys to keep on sync mismatch
            const SYNC_KEYS = [
              'OpenAICompatibilityKey',
              'OpenAICompatibilityUrl',
              'SiliconFlowKey',
              'GlmKey',
              'ModelScopeKey',
              'KimiKey',
              'googleApiKey',
              'tavilyApiKey',
              'backendUrl',
              'NvidiaKey',
              'MinimaxKey',
              'embeddingProvider',
              'embeddingModel',
              'embeddingModelSource',
              'enableLongTermMemory',
              'userSelfIntro',
            ]

            SYNC_KEYS.forEach(key => {
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
      if (isSupabaseProvider && supabaseUrl && supabaseKey) {
        await saveRemoteSettings(settingsToSave)
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
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#f9f9f987] dark:bg-[#191a1a]">
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
                  <div className="relative w-full">
                    <Select
                      value={interfaceLanguage}
                      onValueChange={val => {
                        setInterfaceLanguage(val)
                        i18n.changeLanguage(val)
                      }}
                    >
                      <SelectTrigger className="w-full pl-10 h-10">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center">
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

                  <div className="relative">
                    <Select value={apiProvider} onValueChange={setApiProvider}>
                      <SelectTrigger className="w-full pl-10 h-10">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center">
                          <Box size={16} className="text-gray-400" />
                        </div>
                        <SelectValue>
                          <div className="flex items-center gap-3">
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
                            'w-full pl-10 pr-4 py-2.5 bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
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
                              'w-full pl-10 pr-4 py-2.5 bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
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
                              'w-full pl-10 pr-4 py-2.5 bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
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
                              'w-full pl-10 pr-4 py-2.5 bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
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
                              'w-full pl-10 pr-4 py-2.5 bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
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
                              'w-full pl-10 pr-4 py-2.5 bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
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
                              'w-full pl-10 pr-4 py-2.5 bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
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
                              'w-full pl-10 pr-4 py-2.5 bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
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
                              'w-full pl-10 pr-4 py-2.5 bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
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
                          onChange={e => {
                            setBackendUrl(e.target.value)
                            setBackendHealthState({ status: 'idle', message: '' })
                          }}
                          placeholder={t('settings.backendUrlPlaceholder')}
                          disabled={Boolean(ENV_VARS.backendUrl)}
                          className={clsx(
                            'w-full pl-10 pr-4 py-2.5 bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
                            ENV_VARS.backendUrl && 'opacity-70 cursor-not-allowed',
                          )}
                        />
                      </div>
                      {renderEnvHint(Boolean(ENV_VARS.backendUrl))}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleBackendHealthCheck}
                        disabled={backendHealthState.status === 'loading'}
                        className="px-3 py-2 text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {backendHealthState.status === 'loading'
                          ? t('settings.backendHealthChecking')
                          : t('settings.backendHealthCheck')}
                      </button>
                      {backendHealthState.status !== 'idle' && backendHealthState.message && (
                        <p
                          className={clsx(
                            'text-sm font-medium',
                            backendHealthState.status === 'success' &&
                              'text-emerald-600 dark:text-emerald-400',
                            backendHealthState.status === 'error' &&
                              'text-rose-600 dark:text-rose-400',
                            backendHealthState.status === 'loading' &&
                              'text-gray-500 dark:text-gray-400',
                          )}
                        >
                          {backendHealthState.message}
                        </p>
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
                      <div className="relative w-full">
                        <Select value={databaseProvider} onValueChange={setDatabaseProvider}>
                          <SelectTrigger className="w-full h-10">
                            <div className="flex items-center gap-3">
                              <Database size={16} className="text-gray-400" />
                              <SelectValue placeholder={t('settings.databaseProvider')} />
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            {databaseProviderOptions.map(option => (
                              <SelectItem key={option.key} value={option.value}>
                                <div className="flex items-center gap-3">
                                  {option.icon}
                                  <span>{option.label}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {databaseProvider === 'supabase' && (
                      <>
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
                              disabled={true} // Locked - use Reconfigure button
                              className={clsx(
                                'w-full pl-10 pr-4 py-2.5 bg-gray-50/50 dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none cursor-not-allowed text-gray-500 dark:text-gray-400',
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
                              disabled={true} // Locked - use Reconfigure button
                              className={clsx(
                                'w-full pl-10 pr-4 py-2.5 bg-gray-50/50 dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none cursor-not-allowed text-gray-500 dark:text-gray-400',
                              )}
                            />
                          </div>
                          {renderEnvHint(Boolean(ENV_VARS.supabaseKey))}
                        </div>
                      </>
                    )}
                  </div>

                  {databaseProvider === 'supabase' && (
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={onOpenSupabaseSetup}
                        className="self-start px-4 py-2 text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors border border-primary-200 dark:border-primary-900/40"
                      >
                        {t('settings.reconfigureSupabase') || 'Reconfigure Connection'}
                      </button>

                      {/* Explicit Test removed as reconfiguration handles it */}
                    </div>
                  )}
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
                        <Select value={searchProvider} onValueChange={setSearchProvider}>
                          <SelectTrigger className="w-full pl-10 h-10">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center">
                              <Search size={16} className="text-gray-400" />
                            </div>
                            <SelectValue>
                              <div className="flex items-center gap-3">
                                {renderProviderIcon(searchProvider, {
                                  size: 16,
                                  alt: t(`settings.toolsApiProviders.${searchProvider}`),
                                })}
                                <span>
                                  {toolsApiProviderOptions.find(
                                    option => option.value === searchProvider,
                                  )?.label || searchProvider}
                                </span>
                              </div>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {toolsApiProviderOptions.map(option => (
                              <SelectItem key={option.key} value={option.value}>
                                <div className="flex items-center gap-3">
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

                    {searchProvider === 'tavily' && (
                      <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {t('settings.toolsApiKey')}
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                            <Key size={16} />
                          </div>
                          <input
                            type="password"
                            value={tavilyApiKey}
                            onChange={e => setTavilyApiKey(e.target.value)}
                            placeholder={t('settings.toolsApiKeyPlaceholder')}
                            disabled={Boolean(ENV_VARS.tavilyApiKey)}
                            className={clsx(
                              'w-full pl-10 pr-4 py-2.5 bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600',
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
                          <div className="flex flex-col gap-2 relative">
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                              {t('settings.embeddingProvider')}
                            </span>
                            <Select value={embeddingProvider} onValueChange={setEmbeddingProvider}>
                              <SelectTrigger className="w-full h-10">
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
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                              {t('settings.embeddingModel')}
                            </span>
                            {embeddingModelSource === 'list' ? (
                              <Select
                                value={embeddingModel}
                                onValueChange={setEmbeddingModel}
                                disabled={!activeEmbeddingModels.length}
                              >
                                <SelectTrigger className="w-full h-10">
                                  <SelectValue placeholder={t('agents.model.notSelected')}>
                                    <div className="flex items-center gap-2 truncate">
                                      {getModelIcon(embeddingModel) && (
                                        <img
                                          src={getModelIcon(embeddingModel)}
                                          alt=""
                                          className={clsx(
                                            'w-4 h-4 shrink-0',
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
                                                'w-4 h-4 shrink-0',
                                                getModelIconClassName(model.value),
                                              )}
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
                                value={embeddingCustomModel}
                                onChange={e => {
                                  const nextValue = e.target.value
                                  setEmbeddingCustomModel(nextValue)
                                  setEmbeddingModel(nextValue)
                                }}
                                placeholder={t('settings.customModelIdPlaceholder')}
                                className="w-full px-3 py-2 bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
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
                    {/* <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('settings.enableLongTermMemoryHint')}
                    </p> */}
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
                    className="w-32 mt-1 px-3 py-2 bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

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
                    disabled={!enableLongTermMemory}
                    className="w-full px-4 py-2 text-sm bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-none disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            )}

            {activeTab === 'personalization' && (
              <div className="flex flex-col gap-8 max-w-2xl">
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
                      className="w-full px-3 py-2 bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600"
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
                    <div className="rounded-lg border border-gray-200 dark:border-zinc-800 bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 p-3 text-xs text-gray-700 dark:text-gray-300 space-y-1">
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
                      className="w-full px-3 py-2 bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600"
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
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {Object.entries(THEMES).map(([themeKey, theme]) => (
                    <button
                      key={themeKey}
                      type="button"
                      onClick={() => setThemeColor(themeKey)}
                      className={clsx(
                        'group relative flex flex-col items-center gap-2 p-3 rounded-2xl border text-left transition-all duration-300',
                        themeColor === themeKey
                          ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/20 shadow-md scale-[1.02]'
                          : 'border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800 hover:shadow-md hover:scale-[1.01]',
                      )}
                    >
                      {/* Color preview with gradient */}
                      <div className="relative w-full aspect-square rounded-xl overflow-hidden shadow-inner">
                        <div
                          className="absolute inset-0"
                          style={{
                            background: `linear-gradient(135deg, ${theme.colors['--color-primary-400']} 0%, ${theme.colors['--color-primary-600']} 100%)`,
                          }}
                        />
                        {/* Highlight effect */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="flex flex-col items-center w-full">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white truncate w-full text-center">
                          {theme.label}
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono uppercase tracking-wider">
                          {theme.colors['--color-primary-500']}
                        </span>
                      </div>
                      {/* Check indicator */}
                      <div
                        className={clsx(
                          'absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200',
                          themeColor === themeKey
                            ? 'bg-primary-500 text-white scale-100'
                            : 'bg-white/80 dark:bg-zinc-800/80 text-transparent scale-90 opacity-0 group-hover:scale-100 group-hover:opacity-100',
                        )}
                      >
                        <Check size={14} strokeWidth={3} />
                      </div>
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
