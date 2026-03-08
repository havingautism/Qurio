import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import useChatStore from '../lib/chatStore'
import FancyLoader from './FancyLoader'
import MessageList from './MessageList'
// import QuestionNavigator from './QuestionNavigator'
import clsx from 'clsx'
import ArrowDown from 'lucide-react/dist/esm/icons/arrow-down'
import { useAppContext } from '../App'
import { useToast } from '../contexts/ToastContext'
import { notifyConversationPatched, updateConversation } from '../lib/conversationsService'
import {
  listConversationDocumentIds,
  listSpaceDocuments,
  setConversationDocuments,
} from '../lib/documentsService'
import { getProvider, providerSupportsSearch, resolveThinkingToggleRule } from '../lib/providers'
import QuestionTimelineController from './QuestionTimelineController'

import useAgentManagement from '../hooks/chat/useAgentManagement'
import useChatHistory from '../hooks/chat/useChatHistory'
import useSpaceManagement from '../hooks/chat/useSpaceManagement'
import { useSidebarOffset } from '../hooks/useSidebarOffset'
import { isConfiguredApiSecret, loadSettings } from '../lib/settings'
import { deleteMessageById } from '../lib/supabase'
import ChatHeader from './chat/ChatHeader'
import ChatInputBar from './chat/ChatInputBar'
import { resolveEmbeddingConfig } from '../lib/embeddingService'
import {
  ACADEMIC_SEARCH_TOOL_OPTIONS,
  DEFAULT_EXA_SEARCH_TOOL_ID,
  EXA_SEARCH_TOOL_IDS,
  EXA_SEARCH_TOOL_OPTIONS,
  SEARCH_BACKEND_OPTIONS,
  getSearchToolOptions,
  setSearchToolRegistry,
  TAVILY_TOOL_IDS,
} from '../lib/searchTools'
import {
  loadTogglePreferences,
  persistSearchBackendPreference,
  persistSearchEnabledPreference,
  persistSearchToolsPreference,
  persistThinkingModePreference,
  persistThinkingPreference,
} from '../lib/togglePreferences'
import { listToolsViaBackend } from '../lib/backendClient'
import { getLanguageInstruction, applyLanguageInstructionToText } from '../lib/chat/prompts'
import { getModelConfigForConversation } from '../lib/chat/modelConfig'
import ScrapbookContextBanner from './ScrapbookContextBanner'
import { getScrapbookEntryById } from '../lib/scrapbookService'

const DOCUMENT_CONTEXT_MAX_TOTAL = 12000
const DOCUMENT_CONTEXT_MAX_PER_DOC = 4000
const truncateText = (text, limit) => {
  if (!text) return ''
  if (text.length <= limit) return text
  return `${text.slice(0, limit)}...`
}

const buildDocumentContext = documents => {
  const items = (documents || [])
    .map(doc => {
      const content = String(doc?.content_text || '').trim()
      if (!content) return null
      const title = doc?.name || 'Document'
      const typeLabel = doc?.file_type ? ` (${doc.file_type})` : ''
      return `### ${title}${typeLabel}\n${truncateText(content, DOCUMENT_CONTEXT_MAX_PER_DOC)}`
    })
    .filter(Boolean)

  if (items.length === 0) return ''

  let context = `Background documents:\n\n${items.join('\n\n')}`
  if (context.length > DOCUMENT_CONTEXT_MAX_TOTAL) {
    context = `${context.slice(0, DOCUMENT_CONTEXT_MAX_TOTAL)}\n\n[Truncated]`
  }
  return context
}

const DOCUMENT_SNIPPET_MAX_CHARS = 450
const buildDocumentSources = documents => {
  return (documents || [])
    .map(doc => {
      const content = String(doc?.content_text || '').trim()
      if (!content) return null
      return {
        id: String(doc.id),
        title: doc?.name || 'Document',
        fileType: doc?.file_type || '',
        snippet: truncateText(content, DOCUMENT_SNIPPET_MAX_CHARS),
      }
    })
    .filter(Boolean)
}

const buildEmbeddingModelKey = ({ model }) => {
  const normalizedModel = typeof model === 'string' ? model.trim() : ''
  return normalizedModel || null
}

const getInitialThinkingPreference = () => {
  if (typeof window === 'undefined') return false
  try {
    const { thinkingEnabled, thinkingMode } = loadTogglePreferences()
    if (thinkingMode === 'deep') return true
    if (thinkingMode === 'fast') return false
    return Boolean(thinkingEnabled)
  } catch {
    return false
  }
}

const getInitialThinkingModePreference = () => {
  if (typeof window === 'undefined') return 'smart'
  try {
    const { thinkingMode, thinkingEnabled } = loadTogglePreferences()
    if (thinkingMode === 'smart' || thinkingMode === 'deep' || thinkingMode === 'fast') {
      return thinkingMode
    }
    return thinkingEnabled ? 'deep' : 'fast'
  } catch {
    return 'smart'
  }
}

const getRelevanceLabel = similarity => {
  if (similarity == null) return 'Medium relevance'
  if (similarity >= 0.8) return 'High relevance'
  if (similarity >= 0.68) return 'Medium relevance'
  return 'Low relevance'
}

const ChatInterface = ({
  spaces = [],
  activeConversation = null,
  initialMessage = '',
  initialAttachments = [],
  initialDocumentIds = [],
  initialToggles = {},
  initialSpaceSelection = { mode: 'auto', space: null },
  initialAgentSelection = null,
  initialIsAgentAutoMode = true,
  onTitleAndSpaceGenerated,
  isSidebarPinned = false,
  isSpaceSelectionLocked = false,
  MessageListComponent = MessageList,
  systemContextPrefix = '',
  scrapbookEntry = null,
}) => {
  const normalizeTitleEmojis = value => {
    if (Array.isArray(value)) {
      return value
        .map(item => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 1)
    }
    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) {
          return parsed
            .map(item => String(item || '').trim())
            .filter(Boolean)
            .slice(0, 1)
        }
      } catch {
        return []
      }
    }
    return []
  }

  // Lock body scroll when component mounts (defensive measure for iOS keyboard interactions)
  // useEffect(() => {
  //   document.body.classList.add('scroll-locked')

  //   return () => {
  //     // Unlock body scroll when component unmounts
  //     document.body.classList.remove('scroll-locked')
  //   }
  // }, [])

  const { t } = useTranslation()
  const toast = useToast()
  const {
    messages,
    setMessages,
    conversationId,
    setConversationId,
    conversationTitle,
    setConversationTitle,
    conversationTitleEmojis,
    setConversationTitleEmojis,
    isLoading,
    isMetaLoading,
    isAgentPreselecting,
    sendMessage,
    stopGeneration,
    submitInteractiveForm,
    resetLoading,
  } = useChatStore(
    useShallow(state => ({
      messages: state.messages,
      setMessages: state.setMessages,
      conversationId: state.conversationId,
      setConversationId: state.setConversationId,
      conversationTitle: state.conversationTitle,
      setConversationTitle: state.setConversationTitle,
      conversationTitleEmojis: state.conversationTitleEmojis,
      setConversationTitleEmojis: state.setConversationTitleEmojis,

      isLoading: state.isLoading,
      isMetaLoading: state.isMetaLoading,
      isAgentPreselecting: state.isAgentPreselecting,
      sendMessage: state.sendMessage,
      stopGeneration: state.stopGeneration,
      submitInteractiveForm: state.submitInteractiveForm,
      resetLoading: state.resetLoading,
    })),
  )

  // Reset loading state on mount to prevent stale loaders
  useEffect(() => {
    resetLoading()
  }, [])

  const [currentScrapbookEntry, setCurrentScrapbookEntry] = useState(scrapbookEntry)

  // Hydrate scrapbook entry if scrapbook_id is present in conversation but entry isn't loaded
  useEffect(() => {
    // If we already have the entry in state (passed from router), or no id to fetch, skip
    const scrapbookId = activeConversation?.scrapbook_id
    if (!scrapbookId) {
      // If conversation has no scrapbook_id, ensure we don't show a stale entry from a previous conversation state
      if (currentScrapbookEntry && !scrapbookEntry) {
        setCurrentScrapbookEntry(null)
      }
      return
    }

    // Fetch if missing or id mismatch
    if (!currentScrapbookEntry || currentScrapbookEntry.id !== scrapbookId) {
      getScrapbookEntryById(scrapbookId).then(({ data, error }) => {
        if (!error && data) {
          setCurrentScrapbookEntry(data)
        }
      })
    }
  }, [activeConversation?.scrapbook_id, scrapbookEntry])

  const activeConversationId = activeConversation?.id || conversationId
  const {
    toggleSidebar,
    agents: appAgents = [],
    defaultAgent,
    setConversationStatus,
  } = useAppContext()

  useEffect(() => {
    if (!activeConversationId) return
    if (isLoading) {
      setConversationStatus(activeConversationId, 'loading')
    } else if (prevLoadingRef.current) {
      setConversationStatus(activeConversationId, 'done')
    }
    prevLoadingRef.current = isLoading
  }, [isLoading, activeConversationId, setConversationStatus])

  const [quotedText, setQuotedText] = useState(null)
  const [quoteContext, setQuoteContext] = useState(null)
  const [editingSeed, setEditingSeed] = useState({ text: '', attachments: [] })
  const sendInFlightRef = useRef(false)
  const formSubmitInFlightRef = useRef(false)
  const quoteTextRef = useRef('')
  const quoteSourceRef = useRef('')
  const lastTitleConversationIdRef = useRef(null)
  const [spaceDocuments, setSpaceDocuments] = useState([])
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [selectedDocumentIds, setSelectedDocumentIds] = useState([])
  const [pendingDocumentIds, setPendingDocumentIds] = useState([])
  const [isDocumentSelectorOpen, setIsDocumentSelectorOpen] = useState(false)
  const documentSelectorRef = useRef(null)
  const pendingDocumentIdsRef = useRef([])
  const normalizedInitialDocumentIds = useMemo(
    () => (initialDocumentIds || []).map(id => String(id)).filter(Boolean),
    [initialDocumentIds],
  )
  const hasAppliedInitialDocumentsRef = useRef(false)
  const previousSpaceIdRef = useRef(null)
  const [settings, setSettings] = useState(loadSettings())
  const isRelatedEnabled = Boolean(settings.enableRelatedQuestions)

  // New state for toggles and attachments
  const [isSearchActive, setIsSearchActive] = useState(false)
  const [isThinkingActive, setIsThinkingActive] = useState(getInitialThinkingPreference)
  const [thinkingMode, setThinkingMode] = useState(getInitialThinkingModePreference)
  const [isExpertMode, setIsExpertMode] = useState(false)
  const previousExpertModeRef = useRef(false)
  const [searchBackend, setSearchBackend] = useState(null)
  const [selectedExaSearchTools, setSelectedExaSearchTools] = useState([])
  const [selectedSearchTools, setSelectedSearchTools] = useState([])
  const [isSearchMenuOpen, setIsSearchMenuOpen] = useState(false)
  const togglePrefsHydratedRef = useRef(false)
  const togglePrefsHydrationTimerRef = useRef(null)
  const hasExaApiKey = useMemo(
    () => isConfiguredApiSecret(settings?.exaApiKey, ['your-exa-api-key', 'your_exa_api_key']),
    [settings?.exaApiKey],
  )

  const handleSelectSearchTool = useCallback(toolId => {
    if (!toolId) {
      setSelectedSearchTools([])
      setSelectedExaSearchTools([])
      return
    }
    setSearchBackend(null)
    setSelectedExaSearchTools([])
    setSelectedSearchTools(prev => {
      const normalized = String(toolId)
      return prev.includes(normalized)
        ? prev.filter(id => id !== normalized)
        : [...prev, normalized]
    })
  }, [])

  const handleSelectExaSearchTool = useCallback(toolId => {
    if (!toolId) {
      setSelectedExaSearchTools([DEFAULT_EXA_SEARCH_TOOL_ID])
      return
    }
    const normalized = String(toolId)
    setSearchBackend('exa')
    setSelectedExaSearchTools([normalized])
  }, [])

  const handleSelectSearchBackend = useCallback(
    backendId => {
      if (!backendId) {
        setSearchBackend(null)
        setSelectedExaSearchTools([])
        return
      }
      setSelectedSearchTools([])
      const normalized = String(backendId)
      if (normalized === 'exa' && !hasExaApiKey) return
      setSearchBackend(normalized)
      if (normalized === 'exa') {
        setSelectedExaSearchTools(prev =>
          prev.length > 0 ? [prev[0]] : [DEFAULT_EXA_SEARCH_TOOL_ID],
        )
      } else {
        setSelectedExaSearchTools([])
      }
    },
    [hasExaApiKey],
  )

  const handleClearSearchSelection = useCallback(() => {
    setSearchBackend(null)
    setSelectedExaSearchTools([])
    setSelectedSearchTools([])
    setIsSearchMenuOpen(false)
  }, [])

  const handleSearchMenuClose = useCallback(() => {
    setIsSearchMenuOpen(false)
  }, [])

  const toggleSearchMenu = useCallback(() => {
    setIsSearchMenuOpen(prev => !prev)
  }, [])

  const refreshSearchTools = useCallback(async tavilyEnabledOverride => {
    try {
      const tools = await listToolsViaBackend()
      const tavilyEnabled =
        typeof tavilyEnabledOverride === 'boolean'
          ? tavilyEnabledOverride
          : Boolean(loadSettings().tavilyApiKey)
      const filteredTools = tavilyEnabled
        ? tools
        : tools.filter(tool => {
            const id = String(tool?.id || tool?.name || '')
            return !TAVILY_TOOL_IDS.has(id)
          })

      setSearchToolRegistry(filteredTools)
      const options = getSearchToolOptions()
      setSelectedSearchTools(prev => prev.filter(id => options.some(option => option.id === id)))
    } catch (err) {
      console.error('Failed to load search tools:', err)
    }
  }, [])

  const isPlaceholderConversation = Boolean(activeConversation?._isPlaceholder)

  useEffect(() => {
    pendingDocumentIdsRef.current = pendingDocumentIds
  }, [pendingDocumentIds])

  useEffect(() => {
    hasAppliedInitialDocumentsRef.current = false
  }, [normalizedInitialDocumentIds.join('|')])

  // Space management hook (must be called after useAppContext)
  const {
    selectedSpace,
    isManualSpaceSelection,
    isSelectorOpen,
    selectorRef,
    displaySpace,
    availableSpaces,
    conversationSpace,
    setSelectedSpace,
    setIsManualSpaceSelection,
    setIsSelectorOpen,
    handleSelectSpace,
    handleClearSpaceSelection,
    manualSpaceOverrideRef,
  } = useSpaceManagement({
    spaces,
    initialSpaceSelection,
    activeConversation,
    deepResearchSpace: null,
    conversationId,
  })

  // Agent management hook
  const {
    spaceAgentIds,
    spacePrimaryAgentId,
    isAgentsLoading,
    agentsLoadingLabel,
    agentLoadingDots,
    isAgentResolving,
    selectedAgentId,
    isAgentAutoMode,
    isAgentSelectorOpen,
    pendingAgentId,
    setSelectedAgentId,
    setIsAgentAutoMode,
    setIsAgentSelectorOpen,
    setPendingAgentId,
    reloadSpaceAgents,
    manualAgentSelectionRef,
    agentSelectorRef,
    initialAgentAppliedRef,
  } = useAgentManagement({
    appAgents,
    defaultAgent,
    displaySpace,
    initialAgentSelection,
    initialIsAgentAutoMode,
    isPlaceholderConversation,
    activeConversation,
    conversationId,
    isDeepResearchConversation: false,
    deepResearchAgent: null,
    selectedSpace,
    isManualSpaceSelection,
    isAgentPreselecting,
    t,
  })

  useEffect(() => {
    let isMounted = true
    const loadDocuments = async () => {
      if (!displaySpace?.id) {
        previousSpaceIdRef.current = null
        setSpaceDocuments([])
        setSelectedDocumentIds([])
        setPendingDocumentIds([])
        setIsDocumentSelectorOpen(false)
        return
      }

      if (previousSpaceIdRef.current !== displaySpace.id) {
        setSpaceDocuments([])
        setSelectedDocumentIds([])
        setPendingDocumentIds([])
        setIsDocumentSelectorOpen(false)
      }
      previousSpaceIdRef.current = displaySpace.id

      setDocumentsLoading(true)
      const { data, error } = await listSpaceDocuments(displaySpace.id)
      if (!isMounted) return
      if (!error) {
        setSpaceDocuments(data || [])
        const allowed = new Set((data || []).map(doc => String(doc.id)))
        setSelectedDocumentIds(prev => prev.filter(id => allowed.has(String(id))))
      } else {
        console.error('Failed to load space documents:', error)
        toast.error(t('chatInterface.documentsLoadFailed'))
      }
      setDocumentsLoading(false)
    }

    loadDocuments()
    return () => {
      isMounted = false
    }
  }, [displaySpace?.id, t, toast])

  useEffect(() => {
    const conversationKey =
      !isPlaceholderConversation && (activeConversation?.id || conversationId)
        ? activeConversation?.id || conversationId
        : null

    if (!displaySpace?.id) {
      return
    }

    if (normalizedInitialDocumentIds.length > 0 && !hasAppliedInitialDocumentsRef.current) {
      setSelectedDocumentIds(normalizedInitialDocumentIds)
      setPendingDocumentIds(normalizedInitialDocumentIds)
      hasAppliedInitialDocumentsRef.current = true
      return
    }

    if (!conversationKey) {
      setSelectedDocumentIds(pendingDocumentIdsRef.current || [])
      return
    }

    let isMounted = true
    const loadSelection = async () => {
      const { data, error } = await listConversationDocumentIds(conversationKey)
      if (!isMounted) return
      if (!error) {
        setSelectedDocumentIds(data || [])
      } else {
        console.error('Failed to load conversation documents:', error)
        toast.error(t('chatInterface.documentsSelectionLoadFailed'))
      }
    }
    loadSelection()
    return () => {
      isMounted = false
    }
  }, [
    activeConversation?.id,
    conversationId,
    displaySpace?.id,
    normalizedInitialDocumentIds,
    isPlaceholderConversation,
    t,
    toast,
  ])

  // Chat history hook (manages message loading and history state)
  const isSwitchingConversation = Boolean(
    activeConversation?.id && activeConversation.id !== conversationId,
  )
  const {
    isLoadingHistory,
    showHistoryLoader,
    loadConversationMessages,
    loadedMessagesRef,
    setIsLoadingHistory,
  } = useChatHistory({
    activeConversation,
    conversationId,
    effectiveDefaultModel: defaultAgent?.model || 'gpt-4o',
    isSwitchingConversation,
  })

  const hasResolvedTitle =
    typeof conversationTitle === 'string' &&
    conversationTitle.trim() !== '' &&
    conversationTitle !== 'New Conversation'
  const isPlaceholderTitle =
    Boolean(activeConversation?._isPlaceholder) &&
    (!conversationTitle || conversationTitle === 'New Conversation')
  const isTitleLoading =
    !hasResolvedTitle &&
    (isMetaLoading || isLoadingHistory || isSwitchingConversation || isPlaceholderTitle)

  useEffect(() => {
    if (!activeConversation?.id || activeConversation?._isPlaceholder) return
    const nextTitle = activeConversation.title || ''
    const nextEmojis = normalizeTitleEmojis(
      activeConversation.title_emojis ?? activeConversation.titleEmojis,
    )
    const emojisChanged =
      nextEmojis.length !== conversationTitleEmojis.length ||
      nextEmojis.some((emoji, index) => emoji !== conversationTitleEmojis[index])

    const hasIncomingTitle = nextTitle && nextTitle !== 'New Conversation'
    const hasIncomingEmojis = nextEmojis.length > 0
    const shouldUpdateTitle = hasIncomingTitle && nextTitle !== conversationTitle
    const shouldUpdateEmojis = hasIncomingEmojis && emojisChanged

    if (!shouldUpdateTitle && !shouldUpdateEmojis) return

    if (shouldUpdateTitle) {
      setConversationTitle(nextTitle)
    }
    if (shouldUpdateEmojis) {
      setConversationTitleEmojis(nextEmojis)
    }
    lastTitleConversationIdRef.current = activeConversation.id
  }, [
    activeConversation?.id,
    activeConversation?.title,
    activeConversation?.title_emojis,
    activeConversation?.titleEmojis,
    conversationTitle,
    conversationTitleEmojis,
    setConversationTitle,
    setConversationTitleEmojis,
  ])

  const initialAgentSelectionId = initialAgentSelection?.id || null
  const messageRefs = useRef({})
  const bottomRef = useRef(null)
  const inputAreaRef = useRef(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [inputAreaHeight, setInputAreaHeight] = useState(0)
  const [isRegeneratingTitle, setIsRegeneratingTitle] = useState(false)
  const lastLoadedConversationIdRef = useRef(null)
  const hasPendingHitlInput = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i]
      if (msg?.role !== 'ai') continue
      const toolCallHistory = Array.isArray(msg.toolCallHistory) ? msg.toolCallHistory : []
      const hasPendingForm = toolCallHistory.some(
        tool => tool?.name === 'interactive_form' && tool?.status !== 'done',
      )
      if (!hasPendingForm) continue
      const nextMsg = messages[i + 1]
      const isInterrupted = nextMsg && nextMsg.role === 'user' && !nextMsg.hitlRunId
      if (!isInterrupted) return true
    }
    return false
  }, [messages])

  // Track the last synced conversation ID to avoid redundant updates
  const lastSyncedConversationIdRef = useRef(null)
  const prevLoadingRef = useRef(false)

  // Sync conversationId from props/activeConversation to chatStore
  // This ensures that when navigating from HomeView with a newly created conversation,
  // the chatStore's conversationId is set correctly
  useEffect(() => {
    const targetConversationId = activeConversation?.id || conversationId || null

    // Reset the sync tracking if we're switching to a different conversation
    if (targetConversationId !== lastSyncedConversationIdRef.current) {
      // Clear expert mode when switching conversations
      setIsExpertMode(false)

      // Check if the store's conversationId is different from the target
      if (targetConversationId && targetConversationId !== conversationId) {
        setConversationId(targetConversationId)
        lastSyncedConversationIdRef.current = targetConversationId
      } else if (!targetConversationId && conversationId) {
        // Clear conversationId when switching to new chat
        setConversationId(null)
        lastSyncedConversationIdRef.current = null
      }
    }
  }, [activeConversation?.id, conversationId, setConversationId])

  // conversationSpace is provided by useSpaceManagement hook
  // Function to reload space agents (used when space changes or settings change)

  // reloadSpaceAgents is now provided by useAgentManagement hook

  const spaceAgents = useMemo(() => {
    if (!displaySpace?.id) {
      return []
    }
    const idSet = new Set(spaceAgentIds.map(id => String(id)))
    const filteredAgents = appAgents.filter(agent => idSet.has(String(agent.id)))
    return filteredAgents
  }, [appAgents, displaySpace?.id, spaceAgentIds])

  const selectableAgents = useMemo(() => {
    const list = [...spaceAgents]
    // Only include default agent if no space is selected (space is None)
    // When a space is selected, only show agents that are explicitly added to that space
    if (!displaySpace && defaultAgent) {
      const hasDefault = list.some(agent => String(agent.id) === String(defaultAgent.id))
      if (!hasDefault) list.unshift(defaultAgent)
    }
    // Only include selected agent if it's not already in the list AND no space is selected
    // When a space is selected, don't force-add agents that aren't in that space
    if (!displaySpace && selectedAgentId) {
      const hasSelected = list.some(agent => String(agent.id) === String(selectedAgentId))
      if (!hasSelected) {
        const selected = appAgents.find(agent => String(agent.id) === String(selectedAgentId))
        if (selected) list.unshift(selected)
      }
    }
    return list
  }, [spaceAgents, defaultAgent, selectedAgentId, appAgents, displaySpace])

  const selectedAgent = useMemo(() => {
    const agent =
      selectableAgents.find(agent => String(agent.id) === String(selectedAgentId)) || null
    return agent
  }, [selectableAgents, selectedAgentId])

  const selectedDocuments = useMemo(() => {
    const idSet = new Set((selectedDocumentIds || []).map(id => String(id)))
    return (spaceDocuments || []).filter(doc => idSet.has(String(doc.id)))
  }, [selectedDocumentIds, spaceDocuments])

  const baseDocumentSources = useMemo(
    () => buildDocumentSources(selectedDocuments),
    [selectedDocuments],
  )

  // Agent selection is fully user-controlled:
  // - Auto mode: updated via onAgentResolved callback (preselection before sending)
  // - Manual mode: user's choice is preserved, no auto updates
  // useEffect(() => {
  //   const lastAgentMessage = [...messages]
  //     .reverse()
  //     .find(msg => msg.role === 'ai' && msg.agentId)
  //   const nextAgentId = lastAgentMessage?.agentId || null
  //   if (nextAgentId && String(nextAgentId) !== String(selectedAgentId)) {
  //     setSelectedAgentId(nextAgentId)
  //     setPendingAgentId(nextAgentId)
  //   }
  // }, [messages, selectedAgentId])

  // agentsLoadingLabel is now provided by useAgentManagement hook

  const effectiveAgent = useMemo(
    () => selectedAgent || defaultAgent || null,
    [selectedAgent, defaultAgent],
  )
  const fallbackProvider = defaultAgent?.provider || ''
  const fallbackDefaultModel = defaultAgent?.defaultModel || ''
  const effectiveProvider = effectiveAgent?.provider || fallbackProvider
  const effectiveDefaultModel = effectiveAgent?.defaultModel || fallbackDefaultModel

  // Helper to get model config for agent or fallback to global default agent
  const getModelConfig = React.useCallback(
    (task = 'streamChatCompletion') =>
      getModelConfigForConversation(effectiveAgent, defaultAgent, settings, task),
    [defaultAgent, effectiveAgent, settings],
  )

  const handleToggleDocument = useCallback(
    async documentId => {
      const docKey = String(documentId)
      const next = selectedDocumentIds.some(id => String(id) === docKey)
        ? selectedDocumentIds.filter(id => String(id) !== docKey)
        : [...selectedDocumentIds, docKey]

      setSelectedDocumentIds(next)

      const conversationKey =
        !isPlaceholderConversation && (activeConversation?.id || conversationId)
          ? activeConversation?.id || conversationId
          : null

      if (!conversationKey) {
        setPendingDocumentIds(next)
        return
      }

      const { error } = await setConversationDocuments(conversationKey, next)
      if (error) {
        console.error('Failed to update conversation documents:', error)
        toast.error(t('chatInterface.documentsSelectionSaveFailed'))
      }
    },
    [
      activeConversation?.id,
      conversationId,
      isPlaceholderConversation,
      selectedDocumentIds,
      t,
      toast,
    ],
  )

  const activeModelConfig = getModelConfig('streamChatCompletion')
  const resolvedModelName = activeModelConfig?.model || effectiveDefaultModel || ''
  const thinkingRule = resolveThinkingToggleRule(effectiveProvider, resolvedModelName)
  const isThinkingLocked = thinkingRule.isLocked

  useEffect(() => {
    const wasExpertMode = previousExpertModeRef.current
    if (!wasExpertMode && isExpertMode && !isThinkingLocked) {
      setIsThinkingActive(true)
      setThinkingMode('deep')
    }
    previousExpertModeRef.current = isExpertMode
  }, [isExpertMode, isThinkingLocked])

  const resolvedSearchBackendOptions = useMemo(
    () =>
      SEARCH_BACKEND_OPTIONS.map(option =>
        option.id === 'exa'
          ? {
              ...option,
              disabled: !hasExaApiKey,
              titleKey: !hasExaApiKey ? 'searchBackends.exaRequiresKey' : null,
            }
          : option,
      ),
    [hasExaApiKey],
  )

  const resolvedExaSearchOptions = useMemo(
    () =>
      EXA_SEARCH_TOOL_OPTIONS.map(option => ({
        ...option,
        disabled: !hasExaApiKey,
        titleKey: !hasExaApiKey ? 'searchBackends.exaRequiresKey' : null,
      })),
    [hasExaApiKey],
  )

  const resolvedSearchToolIds = useMemo(() => {
    const ids = new Set()
    if (searchBackend === 'exa') {
      ids.add('search_exa')
    } else if (searchBackend) {
      ids.add('web_search')
    }
    selectedSearchTools.forEach(id => ids.add(String(id)))
    return Array.from(ids)
  }, [searchBackend, selectedSearchTools])

  useEffect(() => {
    if (!isThinkingLocked) return
    setIsThinkingActive(thinkingRule.isThinkingActive)
    setThinkingMode(thinkingRule.isThinkingActive ? 'deep' : 'fast')
  }, [isThinkingLocked, thinkingRule.isThinkingActive])

  useEffect(() => {
    if (isThinkingLocked) return
    setIsThinkingActive(thinkingMode === 'deep')
  }, [thinkingMode, isThinkingLocked])

  useEffect(() => {
    togglePrefsHydratedRef.current = false
    if (togglePrefsHydrationTimerRef.current) {
      clearTimeout(togglePrefsHydrationTimerRef.current)
      togglePrefsHydrationTimerRef.current = null
    }

    try {
      const {
        searchEnabled: storedSearchEnabled,
        thinkingEnabled: storedThinkingEnabled,
        thinkingMode: storedThinkingMode,
        searchBackend: storedSearchBackend,
        searchTools: parsedSearchTools,
      } = loadTogglePreferences()

      if (!isThinkingLocked) {
        if (
          storedThinkingMode === 'smart' ||
          storedThinkingMode === 'deep' ||
          storedThinkingMode === 'fast'
        ) {
          setThinkingMode(storedThinkingMode)
          setIsThinkingActive(storedThinkingMode === 'deep')
        } else if (typeof storedThinkingEnabled === 'boolean') {
          setIsThinkingActive(storedThinkingEnabled)
          setThinkingMode(storedThinkingEnabled ? 'deep' : 'fast')
        }
      }

      const hasStoredSearchSelection = Boolean(storedSearchBackend) || parsedSearchTools.length > 0
      if (storedSearchEnabled || hasStoredSearchSelection) {
        setSearchBackend(storedSearchBackend || 'auto')
        const exaIds = parsedSearchTools.filter(id => EXA_SEARCH_TOOL_IDS.has(String(id)))
        const academicIds = parsedSearchTools.filter(id => !EXA_SEARCH_TOOL_IDS.has(String(id)))
        setSelectedExaSearchTools(
          storedSearchBackend === 'exa'
            ? exaIds.length > 0
              ? [String(exaIds[0])]
              : [DEFAULT_EXA_SEARCH_TOOL_ID]
            : [],
        )
        setSelectedSearchTools(academicIds)
      }
    } catch (error) {
      console.error('Failed to load toggle preferences from localStorage:', error)
    } finally {
      // Let state setters flush first, then enable persistence.
      togglePrefsHydrationTimerRef.current = setTimeout(() => {
        togglePrefsHydratedRef.current = true
        togglePrefsHydrationTimerRef.current = null
      }, 0)
    }

    return () => {
      if (togglePrefsHydrationTimerRef.current) {
        clearTimeout(togglePrefsHydrationTimerRef.current)
        togglePrefsHydrationTimerRef.current = null
      }
    }
  }, [isThinkingLocked])

  useEffect(() => {
    if (!togglePrefsHydratedRef.current) return
    if (isThinkingLocked) return
    persistThinkingPreference(isThinkingActive)
  }, [isThinkingActive, isThinkingLocked])

  useEffect(() => {
    if (!togglePrefsHydratedRef.current) return
    if (isThinkingLocked) return
    persistThinkingModePreference(thinkingMode)
  }, [thinkingMode, isThinkingLocked])

  useEffect(() => {
    if (!togglePrefsHydratedRef.current) return
    persistSearchEnabledPreference(isSearchActive)
  }, [isSearchActive])

  useEffect(() => {
    if (!togglePrefsHydratedRef.current) return
    persistSearchBackendPreference(searchBackend)
  }, [searchBackend])

  useEffect(() => {
    if (!togglePrefsHydratedRef.current) return
    persistSearchToolsPreference([...selectedExaSearchTools, ...selectedSearchTools])
  }, [selectedExaSearchTools, selectedSearchTools])

  // Effect to handle initial message from homepage
  const hasInitialized = useRef(false)
  const isProcessingInitial = useRef(false)
  // Track whether the scrapbook systemContextPrefix has already been used in first message
  const systemContextUsedRef = useRef(false)

  useEffect(() => {
    const handleSettingsChange = () => {
      const nextSettings = loadSettings()
      setSettings(nextSettings)

      const nextProvider = effectiveAgent?.provider || defaultAgent?.provider
      if (!nextProvider || !providerSupportsSearch(nextProvider)) {
        setSearchBackend(null)
        setSelectedExaSearchTools([])
        setSelectedSearchTools([])
        setIsSearchMenuOpen(false)
      }
      if (!nextSettings.exaApiKey && searchBackend === 'exa') {
        setSearchBackend(null)
        setSelectedExaSearchTools([])
      }
      void refreshSearchTools(Boolean(nextSettings.tavilyApiKey))
    }

    window.addEventListener('settings-changed', handleSettingsChange)
    return () => {
      window.removeEventListener('settings-changed', handleSettingsChange)
    }
  }, [effectiveAgent?.provider, defaultAgent?.provider, refreshSearchTools, searchBackend])

  useEffect(() => {
    const processInitialMessage = async () => {
      // Prevent multiple initializations and ensure we have content to process
      if (
        hasInitialized.current ||
        isProcessingInitial.current ||
        (!initialMessage && initialAttachments.length === 0)
      ) {
        return
      }

      // Sync Check: If initialSpaceSelection is provided, wait for displaySpace to match
      // This prevents sending explicit null for selectedSpace when it should be set
      if (
        initialSpaceSelection?.space &&
        (!displaySpace || displaySpace.id !== initialSpaceSelection.space.id)
      ) {
        // Space state not yet synced, wait for next render cycle
        return
      }

      // IMPORTANT: Use the prop conversationId from URL/activeConversation, not the store's conversationId
      // The store's conversationId might be stale or null
      const conversationIdToSend = activeConversation?.id || conversationId || null

      // If we don't have a conversation to send to, wait
      if (!conversationIdToSend) {
        return
      }

      const initialSendKey = conversationIdToSend
        ? `initialMessageSent:${conversationIdToSend}`
        : null
      if (initialSendKey && sessionStorage.getItem(initialSendKey)) {
        return
      }

      // Check if this is an existing conversation with messages
      // If so, skip auto-send (we're just viewing history)
      const hasExistingMessages = messages.length > 0
      if (hasExistingMessages) {
        return
      }

      // Only wait for auto-mode agent resolution; manual selection can proceed.
      if (initialIsAgentAutoMode && initialAgentSelection && !selectedAgent && isAgentResolving) {
        return
      }

      if (normalizedInitialDocumentIds.length > 0 && documentsLoading) {
        return
      }

      isProcessingInitial.current = true
      hasInitialized.current = true

      // Set initial state
      if (initialToggles.search) {
        const initialBackend =
          typeof initialToggles.searchBackend === 'string' ? initialToggles.searchBackend : 'auto'
        setSearchBackend(initialBackend || 'auto')
        const initialTools = Array.isArray(initialToggles.searchTool)
          ? initialToggles.searchTool
          : initialToggles.searchTool
            ? [initialToggles.searchTool]
            : []
        const academicIds = new Set(ACADEMIC_SEARCH_TOOL_OPTIONS.map(option => option.id))
        const exaIds = new Set(EXA_SEARCH_TOOL_OPTIONS.map(option => option.id))
        const initialAcademic = initialTools.filter(id => academicIds.has(String(id)))
        const initialExa = initialTools.filter(id => exaIds.has(String(id)))
        setSelectedExaSearchTools(
          initialBackend === 'exa'
            ? initialExa.length > 0
              ? [String(initialExa[0])]
              : [DEFAULT_EXA_SEARCH_TOOL_ID]
            : [],
        )
        setSelectedSearchTools(initialAcademic.map(id => String(id)))
      }
      if (initialToggles.thinkingMode) {
        const mode = String(initialToggles.thinkingMode)
        if (mode === 'smart' || mode === 'deep' || mode === 'fast') {
          setThinkingMode(mode)
          setIsThinkingActive(mode === 'deep')
        }
      } else if (initialToggles.thinking) {
        setIsThinkingActive(true)
        setThinkingMode('deep')
      }
      if (initialToggles.expertMode) setIsExpertMode(true)

      // CRITICAL: Sync conversationId to store IMMEDIATELY before sending
      // This ensures sendMessage uses the correct conversation ID
      if (conversationId !== conversationIdToSend) {
        // Sync synchronously (not in useEffect) to ensure it's set before sending
        setConversationId(conversationIdToSend)
      }

      // Small delay to ensure state update is processed
      await new Promise(resolve => setTimeout(resolve, 0))

      // Trigger send immediately
      try {
        await handleSendMessage(initialMessage, initialAttachments, initialToggles)
        if (initialSendKey) {
          sessionStorage.setItem(initialSendKey, '1')
        }
      } finally {
        isProcessingInitial.current = false
      }
    }

    processInitialMessage()
  }, [
    initialMessage,
    initialAttachments,
    initialToggles,
    conversationId,
    activeConversation?.id,
    isAgentResolving,
    selectedAgentId,
    selectedAgent,
    messages.length,
    isLoadingHistory,
    documentsLoading,
    normalizedInitialDocumentIds,
  ])

  useEffect(() => {
    refreshSearchTools()
  }, [refreshSearchTools])

  useEffect(() => {
    const active =
      Boolean(searchBackend) || selectedExaSearchTools.length > 0 || selectedSearchTools.length > 0
    setIsSearchActive(active)
  }, [searchBackend, selectedExaSearchTools, selectedSearchTools])

  useEffect(() => {
    if (hasExaApiKey) return
    if (searchBackend !== 'exa') return
    setSearchBackend(null)
    setSelectedExaSearchTools([])
  }, [hasExaApiKey, searchBackend])

  // Load existing conversation messages when switching conversations
  useEffect(() => {
    const loadHistory = async () => {
      if (!activeConversation?.id) {
        const hasLocalConversation = conversationId && messages.length > 0
        const hasInitialPayload =
          !conversationId &&
          (hasInitialized.current || initialMessage || initialAttachments.length > 0)

        if (hasLocalConversation || hasInitialPayload) {
          setIsLoadingHistory(false)
          return
        }

        // When switching to new chat, always clear conversationId and reset navigation flag
        // This ensures that when a new conversation is created, it can navigate correctly

        // If we're switching from an old conversation (conversationId is not null),
        // we should clear the old messages even if we have initialMessage
        const isFromOldConversation = conversationId !== null

        setIsLoadingHistory(false)
        setConversationId(null)

        // If we're in a brand new chat kicked off from the home input (not from an old conversation),
        // avoid clearing the just-added first message bubble.
        if (
          !isFromOldConversation &&
          (hasInitialized.current || initialMessage || initialAttachments.length > 0)
        ) {
          return
        }

        // Clear all other states for a fresh start
        setConversationTitle('')
        setConversationTitleEmojis([])
        setMessages([])
        setQuotedText(null)
        setQuoteContext(null)
        quoteTextRef.current = ''
        quoteSourceRef.current = ''

        const shouldPreserveAutoSpace = !isManualSpaceSelection && selectedSpace
        if (!shouldPreserveAutoSpace) {
          setSelectedSpace(null)
          setIsManualSpaceSelection(false)
        }
        return
      }

      // Sync space state for the active conversation
      // This ensures space is always up-to-date, even when activeConversation updates from placeholder
      const currentSpaceId = conversationSpace?.id || null
      const needsSync =
        manualSpaceOverrideRef.current.conversationId !== activeConversation.id ||
        manualSpaceOverrideRef.current.spaceId !== currentSpaceId

      if (needsSync) {
        setSelectedSpace(conversationSpace)
        setIsManualSpaceSelection(true)
        manualSpaceOverrideRef.current = {
          conversationId: activeConversation.id,
          spaceId: currentSpaceId,
        }
      }

      if (
        loadedMessagesRef.current.has(activeConversation.id) &&
        lastLoadedConversationIdRef.current === activeConversation.id
      ) {
        if (activeConversation.id !== conversationId) {
          setConversationId(activeConversation.id)
        }
        if (lastTitleConversationIdRef.current !== activeConversation.id) {
          const nextTitle = activeConversation.title || ''
          const nextEmojis = normalizeTitleEmojis(
            activeConversation.title_emojis ?? activeConversation.titleEmojis,
          )
          const shouldAdoptTitle =
            (nextTitle && nextTitle !== 'New Conversation') ||
            !conversationTitle ||
            conversationTitle === 'New Conversation'
          if (shouldAdoptTitle) {
            setConversationTitle(nextTitle)
            setConversationTitleEmojis(nextEmojis)
          }
          lastTitleConversationIdRef.current = activeConversation.id
        } else if (
          activeConversation.title &&
          (!conversationTitle || conversationTitle === 'New Conversation')
        ) {
          setConversationTitle(activeConversation.title)
          setConversationTitleEmojis(
            normalizeTitleEmojis(activeConversation.title_emojis ?? activeConversation.titleEmojis),
          )
        }
        // Space is synced by unified logic above
        const shouldSyncAgent =
          manualAgentSelectionRef.current.conversationId !== activeConversation.id
        if (shouldSyncAgent) {
          const agentSelectionMode =
            activeConversation?.agent_selection_mode ??
            activeConversation?.agentSelectionMode ??
            'auto'
          setIsAgentAutoMode(agentSelectionMode !== 'manual')
          const resolvedAgentId =
            activeConversation?.last_agent_id ?? activeConversation?.lastAgentId ?? null
          if (resolvedAgentId) {
            setSelectedAgentId(resolvedAgentId)
            setPendingAgentId(resolvedAgentId)
          } else {
            setPendingAgentId(null)
            setSelectedAgentId(defaultAgent?.id || null)
          }
        }
        setIsLoadingHistory(false)
        return
      }

      if (
        hasInitialized.current &&
        messages.length > 0 &&
        activeConversation.id !== conversationId &&
        !loadedMessagesRef.current.has(activeConversation.id)
      ) {
        // IMPORTANT: Don't return early - we need to load the new conversation's messages
        // Clear the flag to allow loading, but continue with the loading logic below
        hasInitialized.current = false
      }

      // If we're navigating to a conversation that we just created (conversationId matches),
      // check if we already have messages in the store
      if (activeConversation.id === conversationId && messages.length > 0) {
        // We already have messages (they're being streamed or just completed)
        // Only adopt the stored title if it isn't a default placeholder.
        if (lastTitleConversationIdRef.current !== activeConversation.id) {
          const nextTitle = activeConversation.title || ''
          const nextEmojis = normalizeTitleEmojis(
            activeConversation.title_emojis ?? activeConversation.titleEmojis,
          )
          const shouldAdoptTitle =
            (nextTitle && nextTitle !== 'New Conversation') ||
            !conversationTitle ||
            conversationTitle === 'New Conversation'
          if (shouldAdoptTitle) {
            setConversationTitle(nextTitle)
            setConversationTitleEmojis(nextEmojis)
          }
          lastTitleConversationIdRef.current = activeConversation.id
        } else if (
          activeConversation.title &&
          (!conversationTitle || conversationTitle === 'New Conversation')
        ) {
          setConversationTitle(activeConversation.title)
          setConversationTitleEmojis(
            normalizeTitleEmojis(activeConversation.title_emojis ?? activeConversation.titleEmojis),
          )
        }
        // Space is synced by unified logic above
        setIsLoadingHistory(false)
        return
      }

      // IMPORTANT: Don't clear messages if we're currently processing an initial message
      // The initial message flow adds messages optimistically, and we don't want to lose them
      if (isProcessingInitial.current) {
        setIsLoadingHistory(false)
        return
      }

      // Reset hasInitialized when loading an existing conversation
      hasInitialized.current = false

      setIsLoadingHistory(true)
      loadedMessagesRef.current.add(activeConversation.id)
      if (activeConversation.id !== conversationId) {
        // Clear stale messages while the new conversation history loads
        setMessages([])
      }
      setConversationId(activeConversation.id)
      if (lastTitleConversationIdRef.current !== activeConversation.id) {
        const nextTitle = activeConversation.title || ''
        const nextEmojis = normalizeTitleEmojis(
          activeConversation.title_emojis ?? activeConversation.titleEmojis,
        )
        const shouldAdoptTitle =
          (nextTitle && nextTitle !== 'New Conversation') ||
          !conversationTitle ||
          conversationTitle === 'New Conversation'
        if (shouldAdoptTitle) {
          setConversationTitle(nextTitle)
          setConversationTitleEmojis(nextEmojis)
        }
        lastTitleConversationIdRef.current = activeConversation.id
      } else if (
        activeConversation.title &&
        (!conversationTitle || conversationTitle === 'New Conversation')
      ) {
        setConversationTitle(activeConversation.title)
        setConversationTitleEmojis(
          normalizeTitleEmojis(activeConversation.title_emojis ?? activeConversation.titleEmojis),
        )
      } else if (!conversationTitle) {
        setConversationTitle('')
        setConversationTitleEmojis([])
      }
      const isNewConversation =
        activeConversation?.id && activeConversation.id !== lastLoadedConversationIdRef.current
      if (isNewConversation) {
        lastLoadedConversationIdRef.current = activeConversation.id
      }
      // Space is synced by unified logic above
      const conversationLastAgentId =
        activeConversation?.last_agent_id ?? activeConversation?.lastAgentId ?? null
      const { data: mapped, error } = await loadConversationMessages(activeConversation.id)
      if (!error && mapped) {
        if (messages.length > 0 && (isProcessingInitial.current || hasInitialized.current)) {
          setIsLoadingHistory(false)
          return
        }
        setMessages(mapped)
        // Restore agent selection mode from conversation unless user just picked manually
        const shouldSyncAgent =
          manualAgentSelectionRef.current.conversationId !== activeConversation.id
        if (shouldSyncAgent) {
          const agentSelectionMode =
            activeConversation?.agent_selection_mode ??
            activeConversation?.agentSelectionMode ??
            'auto'
          setIsAgentAutoMode(agentSelectionMode !== 'manual')
          const resolvedAgentId = conversationLastAgentId || null
          if (resolvedAgentId) {
            setSelectedAgentId(resolvedAgentId)
            setPendingAgentId(resolvedAgentId)
          } else {
            setPendingAgentId(null)
            setSelectedAgentId(defaultAgent?.id || null)
          }
        }
        loadedMessagesRef.current.add(activeConversation.id)
      } else {
        console.error('Failed to load conversation messages:', error)
        setMessages([])
        loadedMessagesRef.current.delete(activeConversation.id)
      }
      setIsLoadingHistory(false)
    }
    loadHistory()
  }, [
    activeConversation,
    conversationSpace,
    settings,
    effectiveDefaultModel,
    conversationTitle,
    messages.length,
    selectedSpace,
    isManualSpaceSelection,
    appAgents,
    defaultAgent?.id,
  ])

  useEffect(() => {
    const conversationKey = activeConversation?.id || conversationId || 'new'
    const hasStoredAgent = Boolean(activeConversation?.last_agent_id) && !isPlaceholderConversation
    if (hasStoredAgent) return

    if (manualAgentSelectionRef.current.conversationId === conversationKey) {
      return
    }

    const lastApplied = initialAgentAppliedRef.current
    if (
      lastApplied.key === conversationKey &&
      lastApplied.agentId === initialAgentSelectionId &&
      lastApplied.isAgentAutoMode === initialIsAgentAutoMode
    ) {
      return
    }

    if (initialAgentSelectionId) {
      setPendingAgentId(initialAgentSelectionId)
      if (!initialIsAgentAutoMode) {
        setSelectedAgentId(initialAgentSelectionId)
      }
    } else {
      setPendingAgentId(null)
      if (initialIsAgentAutoMode) {
        setSelectedAgentId(null)
      }
    }
    setIsAgentAutoMode(initialIsAgentAutoMode)
    initialAgentAppliedRef.current = {
      key: conversationKey,
      agentId: initialAgentSelectionId,
      isAgentAutoMode: initialIsAgentAutoMode,
    }
  }, [
    initialAgentSelectionId,
    activeConversation?.id,
    activeConversation?.last_agent_id,
    initialIsAgentAutoMode,
    isPlaceholderConversation,
    conversationId,
  ])

  // Handle click outside to close selector
  useEffect(() => {
    const handleClickOutside = event => {
      if (selectorRef.current && !selectorRef.current.contains(event.target)) {
        setIsSelectorOpen(false)
      }
      if (agentSelectorRef.current && !agentSelectorRef.current.contains(event.target)) {
        setIsAgentSelectorOpen(false)
      }
      if (documentSelectorRef.current && !documentSelectorRef.current.contains(event.target)) {
        setIsDocumentSelectorOpen(false)
      }
    }

    if (isSelectorOpen || isAgentSelectorOpen || isDocumentSelectorOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isAgentSelectorOpen, isDocumentSelectorOpen, isSelectorOpen])

  useEffect(() => {
    let isMounted = true
    const loadAgents = async () => {
      if (!isMounted) return
      await reloadSpaceAgents()
    }
    loadAgents()
    return () => {
      isMounted = false
    }
  }, [displaySpace?.id, reloadSpaceAgents])

  useEffect(() => {
    if (!displaySpace?.id) {
      // When no space is selected, handle pending agent and set to default if needed
      if (pendingAgentId) {
        // Apply pending agent (should be the default agent when space preselection fails)
        setSelectedAgentId(pendingAgentId)
        setPendingAgentId(null)
      } else if (!selectedAgentId) {
        setSelectedAgentId(defaultAgent?.id || null)
      }
      return
    }
    if (isAgentsLoading) return

    const agentIdStrings = spaceAgentIds.map(String)
    const isDefaultSelection = defaultAgent && String(selectedAgentId) === String(defaultAgent.id)
    const hasSelectedAgent =
      isDefaultSelection ||
      (selectedAgentId ? agentIdStrings.includes(String(selectedAgentId)) : false)

    let nextSelectedAgentId = selectedAgentId
    if (pendingAgentId) {
      if (agentIdStrings.includes(String(pendingAgentId))) {
        nextSelectedAgentId = pendingAgentId
      } else {
        nextSelectedAgentId = defaultAgent?.id || null
      }
    } else if (!hasSelectedAgent) {
      if (selectedAgentId && !isDefaultSelection) {
        nextSelectedAgentId = defaultAgent?.id || null
      } else if (!activeConversation?.id) {
        if (!isManualSpaceSelection && spacePrimaryAgentId) {
          nextSelectedAgentId = spacePrimaryAgentId
        } else {
          nextSelectedAgentId = defaultAgent?.id || null
        }
      } else {
        nextSelectedAgentId = defaultAgent?.id || null
      }
    }

    if (nextSelectedAgentId !== selectedAgentId) {
      setSelectedAgentId(nextSelectedAgentId)
    }
    if (pendingAgentId) {
      setPendingAgentId(null)
    }
  }, [
    displaySpace?.id,
    isAgentsLoading,
    spaceAgentIds,
    spacePrimaryAgentId,
    selectedAgentId,
    pendingAgentId,
    defaultAgent?.id,
    isManualSpaceSelection,
    activeConversation?.id,
  ])

  // handleSelectSpace and handleClearSpaceSelection are now provided by useSpaceManagement hook
  const registerMessageRef = useCallback((id, msg, el) => {
    if (el) {
      messageRefs.current[id] = el
    } else {
      delete messageRefs.current[id]
    }
  }, [])

  const extractUserQuestion = msg => {
    if (!msg) return ''
    if (typeof msg.content === 'string') return msg.content
    if (Array.isArray(msg.content)) {
      const textPart = msg.content.find(c => c.type === 'text')
      return textPart?.text || ''
    }
    return ''
  }

  const [isTimelineSidebarOpen, setIsTimelineSidebarOpen] = useState(false)
  const [isXLScreen, setIsXLScreen] = useState(false)

  // Check screen size
  useEffect(() => {
    const checkScreenSize = () => {
      setIsXLScreen(window.innerWidth >= 1280)
    }

    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)
    return () => window.removeEventListener('resize', checkScreenSize)
  }, [])

  // Update CSS variable for sidebar width when sidebar is open
  useSidebarOffset(isTimelineSidebarOpen)

  const extractPlainText = useCallback(content => {
    if (!content) return ''
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content
        .filter(c => c.type === 'text' && typeof c.text === 'string')
        .map(c => c.text)
        .join('\n')
    }
    return ''
  }, [])

  const isHiddenFormSubmissionMessage = useCallback(
    msg =>
      msg?.role === 'user' &&
      typeof msg?.content === 'string' &&
      msg.content.startsWith('[Form Submission]'),
    [],
  )

  const isHiddenAiContinuationMessage = useCallback(
    index => {
      if (index <= 0) return false
      const current = messages[index]
      const prev = messages[index - 1]
      return current?.role === 'ai' && isHiddenFormSubmissionMessage(prev)
    },
    [isHiddenFormSubmissionMessage, messages],
  )

  const latestEditableUserIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i]
      if (msg?.role === 'user' && !isHiddenFormSubmissionMessage(msg)) return i
    }
    return -1
  }, [isHiddenFormSubmissionMessage, messages])

  const latestRegeneratableAiIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i]
      if (msg?.role === 'ai' && !isHiddenAiContinuationMessage(i)) return i
    }
    return -1
  }, [isHiddenAiContinuationMessage, messages])

  // Scroll to bottom helper
  const scrollToBottom = useCallback((behavior = 'smooth') => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior,
      })
    }
  }, [])

  // State to track if we are editing a message
  const [editingIndex, setEditingIndex] = useState(null)

  const [editingTargetId, setEditingTargetId] = useState(null)
  const [editingPartnerId, setEditingPartnerId] = useState(null)
  const lastDraftConversationKeyRef = useRef(null)

  useEffect(() => {
    const nextKey = activeConversation?.id || conversationId || null
    if (lastDraftConversationKeyRef.current === nextKey) return

    lastDraftConversationKeyRef.current = nextKey
    setQuotedText(null)
    setQuoteContext(null)
    quoteTextRef.current = ''
    quoteSourceRef.current = ''
    setEditingIndex(null)
    setEditingTargetId(null)
    setEditingPartnerId(null)
    setEditingSeed({ text: '', attachments: [] })
  }, [activeConversation?.id, conversationId])

  const handleEdit = useCallback(
    index => {
      if (index !== latestEditableUserIndex) return
      const msg = messages[index]
      if (!msg) return

      // Extract content and attachments
      const text = extractUserQuestion(msg)

      let msgAttachments = []
      if (Array.isArray(msg.content)) {
        msgAttachments = msg.content.filter(c => c.type === 'image_url')
      }

      setEditingSeed({ text, attachments: msgAttachments })
      setEditingIndex(index)
      setQuotedText(null) // Clear quote when editing
      setQuoteContext(null)
      setEditingTargetId(msg.id || null)
      const nextMsg = messages[index + 1]
      const hasPartner = nextMsg && nextMsg.role === 'ai'
      setEditingPartnerId(hasPartner ? nextMsg.id || null : null)
    },
    [latestEditableUserIndex, messages],
  )

  const handleSendMessage = useCallback(
    async (
      msgOverride = null,
      attOverride = null,
      togglesOverride = null,
      { editingInfoOverride = null } = {},
    ) => {
      const textToSend = msgOverride !== null ? msgOverride : ''
      const attToSend = attOverride !== null ? attOverride : []
      const searchActive = togglesOverride ? togglesOverride.search : isSearchActive
      const thinkingModeValue = (() => {
        const raw = togglesOverride?.thinkingMode ?? thinkingMode
        return raw === 'smart' || raw === 'deep' || raw === 'fast' ? raw : 'smart'
      })()
      const thinkingActive =
        thinkingModeValue === 'deep' ? true : thinkingModeValue === 'fast' ? false : false
      const relatedActive = togglesOverride ? togglesOverride.related : isRelatedEnabled
      // Expert mode only applies to the first message (when togglesOverride is provided)
      // Subsequent messages are normal conversation
      const expertModeActive = togglesOverride?.expertMode ?? false
      const searchTool = togglesOverride ? togglesOverride.searchTool : resolvedSearchToolIds
      const searchBackendValue = togglesOverride ? togglesOverride.searchBackend : searchBackend
      const exaSearchCategoryValue =
        togglesOverride?.exaSearchCategory ??
        (searchBackendValue === 'exa'
          ? selectedExaSearchTools[0] || DEFAULT_EXA_SEARCH_TOOL_ID
          : null)

      if (!textToSend.trim() && attToSend.length === 0) return
      if (isLoading) return
      if (sendInFlightRef.current) return
      scrollToBottom('auto')

      const editingInfo =
        editingInfoOverride ||
        (editingIndex !== null
          ? {
              index: editingIndex,
              targetId: editingTargetId,
              partnerId: editingPartnerId,
            }
          : null)

      // If editing an existing user question, drop its existing answers/forms until next user
      if (editingInfo?.index !== undefined && editingInfo?.index !== null) {
        const nextUserIndex = messages.findIndex(
          (m, idx) => idx > editingInfo.index && m.role === 'user',
        )
        const cutEnd = nextUserIndex === -1 ? messages.length : nextUserIndex
        if (cutEnd > editingInfo.index + 1) {
          setMessages(prev => [...prev.slice(0, editingInfo.index + 1), ...prev.slice(cutEnd)])
        }
      }

      // Reset editing state
      setEditingIndex(null)
      setEditingTargetId(null)
      setEditingPartnerId(null)
      setEditingSeed({ text: '', attachments: [] })

      const quoteContextForSend = quoteContext
        ? {
            text: quoteTextRef.current || quoteContext.text,
            sourceContent: quoteSourceRef.current || quoteContext.sourceContent,
            sourceRole: quoteContext.sourceRole,
          }
        : null

      // Clear quote state immediately so UI banner disappears right after sending
      setQuotedText(null)
      setQuoteContext(null)
      quoteTextRef.current = ''
      quoteSourceRef.current = ''

      const agentForSend =
        selectedAgent || (!isAgentAutoMode && initialAgentSelection) || defaultAgent || null

      let skipDocumentRetrieval = false

      if (selectedDocuments.length > 0) {
        const embeddingConfig = resolveEmbeddingConfig()
        const currentModelKey = buildEmbeddingModelKey(embeddingConfig)
        const docModelKeys = selectedDocuments
          .map(doc => buildEmbeddingModelKey({ model: doc.embedding_model }))
          .filter(Boolean)
        const uniqueDocModels = [...new Set(docModelKeys)]
        if (uniqueDocModels.length > 1) {
          toast.error(t('chatInterface.documentEmbeddingMixedModels'))
          skipDocumentRetrieval = true
        } else if (uniqueDocModels.length === 1 && uniqueDocModels[0] !== currentModelKey) {
          toast.error(
            t('chatInterface.documentEmbeddingMismatch', {
              model: uniqueDocModels[0],
            }),
          )
          skipDocumentRetrieval = true
        }
      }

      sendInFlightRef.current = true
      try {
        await sendMessage({
          text: textToSend,
          attachments: attToSend,
          toggles: {
            search: searchActive,
            searchTool,
            searchBackend: searchBackendValue || null,
            exaSearchCategory: exaSearchCategoryValue,
            thinking: thinkingActive,
            thinkingMode: thinkingModeValue,
            expertMode: expertModeActive,
            teamMode: togglesOverride?.teamMode || null,
            leaderAgentId: togglesOverride?.leaderAgentId || null,
            memberAgentIds: togglesOverride?.memberAgentIds || null,
            related: relatedActive,
          },
          settings,
          spaceInfo: { selectedSpace: displaySpace || selectedSpace, isManualSpaceSelection },
          selectedAgent: agentForSend,
          isAgentAutoMode,
          agents: appAgents,
          // Inject scrapbook context as hidden context on first message only (not shown in UI)
          documentContextAppend:
            systemContextPrefix && !systemContextUsedRef.current && messages.length === 0
              ? (() => {
                  systemContextUsedRef.current = true
                  return systemContextPrefix
                })()
              : '',
          documentSources: baseDocumentSources,
          documentSelection: {
            documents: selectedDocuments,
            skipRetrieval: skipDocumentRetrieval,
          },
          editingInfo,
          callbacks: {
            onTitleAndSpaceGenerated,
            onSpaceResolved: space => {
              if (isSpaceSelectionLocked) return
              setSelectedSpace(space)
              setIsManualSpaceSelection(false)
            },
            onConversationReady: async conversation => {
              const pendingIds = pendingDocumentIdsRef.current || []
              if (!conversation?.id || pendingIds.length === 0) return
              const { error } = await setConversationDocuments(conversation.id, pendingIds)
              if (error) {
                console.error('Failed to save conversation documents:', error)
                toast.error(t('chatInterface.documentsSelectionSaveFailed'))
              } else {
                setPendingDocumentIds([])
              }
            },
            onAgentResolved: agent => {
              // Only update selected agent if in auto mode
              // In manual mode, respect user's explicit choice
              if (isAgentAutoMode) {
                const nextAgentId = agent?.id || null
                setPendingAgentId(nextAgentId)
                setSelectedAgentId(nextAgentId)
              }
            },
          },
          spaces,
          quoteContext: quoteContextForSend,
        })
      } finally {
        sendInFlightRef.current = false
      }
    },
    [
      isSearchActive,
      thinkingMode,
      isRelatedEnabled,
      isLoading,
      editingIndex,
      editingTargetId,
      editingPartnerId,
      scrollToBottom,
      sendMessage,
      settings,
      selectedSpace,
      displaySpace,
      effectiveAgent,
      isAgentAutoMode,
      defaultAgent,
      isManualSpaceSelection,
      onTitleAndSpaceGenerated,
      isSpaceSelectionLocked,
      spaces,
      quoteContext,
      resolvedSearchToolIds,
      searchBackend,
      appAgents,
      spaceAgentIds,
      spaceAgents,
      baseDocumentSources,
      t,
      toast,
    ],
  )

  const handleRelatedClick = useCallback(
    q => {
      handleSendMessage(q, [], null, { skipMeta: true })
    },
    [handleSendMessage],
  )

  // Handle interactive form submission
  const handleFormSubmit = useCallback(
    async formSubmission => {
      if (isLoading || formSubmitInFlightRef.current) return
      const agentForSend =
        selectedAgent || (!isAgentAutoMode && initialAgentSelection) || defaultAgent || null

      // Use submitInteractiveForm to continue in the same message
      formSubmitInFlightRef.current = true
      try {
        await submitInteractiveForm({
          formData: formSubmission,
          settings,
          toggles: {
            search: isSearchActive,
            searchTool: resolvedSearchToolIds,
            searchBackend,
            exaSearchCategory:
              searchBackend === 'exa'
                ? selectedExaSearchTools[0] || DEFAULT_EXA_SEARCH_TOOL_ID
                : null,
            thinking: thinkingMode === 'deep',
            thinkingMode,
            expertMode: isExpertMode,
            related: isRelatedEnabled,
          },
          selectedAgent: agentForSend,
          agents: appAgents,
          spaceInfo: { selectedSpace, isManualSpaceSelection },
        })
      } finally {
        formSubmitInFlightRef.current = false
      }
    },
    [
      isLoading,
      isSearchActive,
      resolvedSearchToolIds,
      searchBackend,
      selectedExaSearchTools,
      thinkingMode,
      isExpertMode,
      isRelatedEnabled,
      submitInteractiveForm,
      settings,
      selectedSpace,
      isManualSpaceSelection,
      selectedAgent,
      isAgentAutoMode,
      initialAgentSelection,
      defaultAgent,
      appAgents,
    ],
  )

  const handleQuote = useCallback(payload => {
    const text = typeof payload === 'string' ? payload : payload?.text || ''
    const message = typeof payload === 'object' ? payload?.message : null

    let sourceContent = ''
    let sourceRole = 'assistant'

    if (message) {
      sourceRole = message.role === 'ai' ? 'assistant' : message.role
      if (typeof message.content === 'string') {
        sourceContent = message.content
      } else if (Array.isArray(message.content)) {
        sourceContent = message.content
          .filter(part => part.type === 'text' && typeof part.text === 'string')
          .map(part => part.text)
          .join('\n')
      }
    }

    quoteTextRef.current = text
    quoteSourceRef.current = sourceContent || text

    const previewText = text.length > 200 ? `${text.slice(0, 200)}…` : text

    setQuotedText(previewText || null)
    setQuoteContext(
      text
        ? {
            text,
            sourceRole,
          }
        : null,
    )
    setEditingIndex(null) // Clear editing when quoting
    window.requestAnimationFrame(() => document.getElementById('chat-input-textarea')?.focus())
  }, [])

  const handleRegenerateAnswer = useCallback(
    async aiIndex => {
      if (isLoading) return
      if (aiIndex !== latestRegeneratableAiIndex) return
      const aiMsg = messages[aiIndex]
      if (!aiMsg || aiMsg.role !== 'ai') return

      // Find the associated user message (prefer immediate previous)
      let userIndex = aiIndex - 1
      while (userIndex >= 0 && messages[userIndex].role !== 'user') {
        userIndex -= 1
      }
      if (userIndex < 0) return

      const userMsg = messages[userIndex]
      const msgAttachments = Array.isArray(userMsg.content)
        ? userMsg.content.filter(c => c.type === 'image_url')
        : []
      const text = extractUserQuestion(userMsg)
      if (!text.trim() && msgAttachments.length === 0) return

      // 只删除当前回答及其拼贴/表单：从该 AI 开始，直到下一条用户消息前
      let cutEnd = aiIndex + 1
      const partnerIds = []
      while (cutEnd < messages.length && messages[cutEnd].role !== 'user') {
        partnerIds.push(messages[cutEnd].id)
        cutEnd += 1
      }
      partnerIds.unshift(aiMsg.id)

      const editingInfoOverride = {
        index: userIndex,
        targetId: userMsg.id || null,
        partnerId: aiMsg.id || null,
        partnerIds,
        moveToEnd: true,
      }

      await handleSendMessage(
        text,
        msgAttachments,
        {
          search: isSearchActive,
          searchTool: resolvedSearchToolIds,
          searchBackend,
          exaSearchCategory:
            searchBackend === 'exa'
              ? selectedExaSearchTools[0] || DEFAULT_EXA_SEARCH_TOOL_ID
              : null,
          thinking: thinkingMode === 'deep',
          thinkingMode,
          related: isRelatedEnabled,
        },
        { editingInfoOverride },
      )
    },

    [
      extractUserQuestion,
      handleSendMessage,
      isLoading,
      latestRegeneratableAiIndex,
      messages,
      setMessages,
      isSearchActive,
      resolvedSearchToolIds,
      searchBackend,
      selectedExaSearchTools,
      thinkingMode,
      isRelatedEnabled,
    ],
  )

  const handleRegenerateQuestion = useCallback(
    async userIndex => {
      if (isLoading) return
      if (userIndex !== latestEditableUserIndex) return

      const userMsg = messages[userIndex]
      if (!userMsg || userMsg.role !== 'user') return

      const msgAttachments = Array.isArray(userMsg.content)
        ? userMsg.content.filter(c => c.type === 'image_url')
        : []

      const text = extractUserQuestion(userMsg)
      if (!text.trim() && msgAttachments.length === 0) return

      // 删除该问题下已有的回答/表单直到下一条用户消息前
      let cutEnd = userIndex + 1
      const partnerIds = []
      while (cutEnd < messages.length && messages[cutEnd].role !== 'user') {
        partnerIds.push(messages[cutEnd].id)
        cutEnd += 1
      }
      const editingInfoOverride = {
        index: userIndex,
        targetId: userMsg.id || null,
        partnerId: partnerIds[0] || null,
        partnerIds,
        moveToEnd: true,
      }

      await handleSendMessage(
        text,
        msgAttachments,
        {
          search: isSearchActive,
          searchTool: resolvedSearchToolIds,
          searchBackend,
          exaSearchCategory:
            searchBackend === 'exa'
              ? selectedExaSearchTools[0] || DEFAULT_EXA_SEARCH_TOOL_ID
              : null,
          thinking: thinkingMode === 'deep',
          thinkingMode,
          related: isRelatedEnabled,
        },
        { editingInfoOverride },
      )
    },
    [
      extractUserQuestion,
      handleSendMessage,
      isLoading,
      latestEditableUserIndex,
      messages,
      setMessages,
      isSearchActive,
      resolvedSearchToolIds,
      searchBackend,
      selectedExaSearchTools,
      thinkingMode,
      isRelatedEnabled,
    ],
  )

  const handleDeleteMessage = useCallback(
    async index => {
      if (isLoading) return
      const target = messages[index]
      if (!target) return

      // Determine range to delete: for AI, delete until next user (same question's stitched parts/forms)
      const nextUserIndex =
        target.role === 'ai' ? messages.findIndex((m, idx) => idx > index && m.role === 'user') : -1
      const cutEnd = nextUserIndex === -1 ? index + 1 : nextUserIndex
      const idsToDelete = messages
        .slice(index, cutEnd)
        .map(m => m.id)
        .filter(Boolean)

      if (idsToDelete.length > 0) {
        try {
          await Promise.all(idsToDelete.map(id => deleteMessageById(id)))
        } catch (err) {
          console.error('Failed to delete message(s):', err)
        }
      }

      setMessages(prev => [...prev.slice(0, index), ...prev.slice(cutEnd)])

      if (editingIndex !== null) {
        if (editingIndex >= index && editingIndex < cutEnd) {
          setEditingIndex(null)
          setEditingSeed({ text: '', attachments: [] })
          setEditingTargetId(null)
          setEditingPartnerId(null)
        } else if (editingIndex >= cutEnd) {
          setEditingIndex(editingIndex - (cutEnd - index))
        }
      }

      if (editingTargetId && idsToDelete.includes(editingTargetId)) {
        setEditingTargetId(null)
      }

      if (editingPartnerId && idsToDelete.includes(editingPartnerId)) {
        setEditingPartnerId(null)
      }
    },
    [
      editingIndex,
      editingPartnerId,
      editingTargetId,
      isLoading,
      messages,
      setMessages,
      setEditingIndex,
      setEditingPartnerId,
      setEditingTargetId,
    ],
  )

  // Handle scroll to show/hide button
  useEffect(() => {
    const container = messagesContainerRef.current
    const bottomMarker = bottomRef.current
    if (!container || !bottomMarker) return

    const updateFromScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
      setShowScrollButton(!isNearBottom)
    }

    if (!('IntersectionObserver' in window)) {
      updateFromScroll()
      container.addEventListener('scroll', updateFromScroll)
      window.addEventListener('resize', updateFromScroll)
      return () => {
        container.removeEventListener('scroll', updateFromScroll)
        window.removeEventListener('resize', updateFromScroll)
      }
    }

    const observer = new IntersectionObserver(
      entries => {
        const isVisible = entries.some(entry => entry.isIntersecting)
        setShowScrollButton(!isVisible)
      },
      {
        root: container,
        rootMargin: '0px 0px 80px 0px',
        threshold: 0.01,
      },
    )

    observer.observe(bottomMarker)
    return () => observer.disconnect()
  }, [])

  // Keep following streamed output only when user is already near bottom.
  useEffect(() => {
    if (!isLoading || showScrollButton) return
    const container = messagesContainerRef.current
    if (!container) return

    const lastMessage = messages[messages.length - 1]
    const isStreamingAi = lastMessage?.role === 'ai'
    const hasStreamingText = (() => {
      if (!isStreamingAi) return false
      const content = lastMessage?.content
      if (typeof content === 'string') return content.trim().length > 0
      if (Array.isArray(content)) {
        return content.some(part => {
          if (typeof part === 'string') return part.trim().length > 0
          if (part?.type === 'text' && typeof part.text === 'string') {
            return part.text.trim().length > 0
          }
          if (part?.text != null) return String(part.text).trim().length > 0
          return false
        })
      }
      return false
    })()

    // Once visible text starts streaming, avoid hard sticking to bottom.
    if (hasStreamingText) return

    const rafId = window.requestAnimationFrame(() => {
      scrollToBottom('auto')
    })
    return () => window.cancelAnimationFrame(rafId)
  }, [isLoading, messages, scrollToBottom, showScrollButton])

  const handleRegenerateTitle = useCallback(async () => {
    if (isRegeneratingTitle) return

    const lastMessages = messages.slice(-3)
    const contextText = lastMessages
      .map(m => {
        const text = extractPlainText(m.content).trim()
        if (!text) return ''
        const prefix = m.role === 'user' ? 'User' : 'Assistant'
        return `${prefix}: ${text}`
      })
      .filter(Boolean)
      .join('\n')

    if (!contextText) return

    setIsRegeneratingTitle(true)
    try {
      const modelConfig = getModelConfig('generateTitle')
      const provider = getProvider(modelConfig.provider)
      const credentials = provider.getCredentials(settings)
      const agentForTitle = selectedAgent || defaultAgent || null
      const languageInstruction = getLanguageInstruction(agentForTitle, settings)
      const promptText = applyLanguageInstructionToText(contextText, languageInstruction)
      const convId = conversationId || activeConversation?.id
      let newTitle = ''
      let titleEmojis = Array.isArray(conversationTitleEmojis) ? conversationTitleEmojis : []

      const titlePromise = provider
        .generateTitle(promptText, credentials.apiKey, credentials.baseUrl, modelConfig.model)
        .then(titleResult => {
          const nextTitle = titleResult?.title || ''
          if (nextTitle) {
            newTitle = nextTitle
            setConversationTitle(nextTitle)
          }
          return titleResult
        })

      const emojiPromise =
        typeof provider.generateEmoji === 'function'
          ? provider
              .generateEmoji(promptText, credentials.apiKey, credentials.baseUrl, modelConfig.model)
              .then(emojiResult => {
                const nextEmojis = Array.isArray(emojiResult?.emojis) ? emojiResult.emojis : []
                titleEmojis = nextEmojis
                setConversationTitleEmojis(nextEmojis)
                return emojiResult
              })
              .catch(() => ({ emojis: [] }))
          : Promise.resolve({ emojis: [] })

      await Promise.allSettled([titlePromise, emojiPromise])
      if (!newTitle) return
      if (convId) {
        await updateConversation(convId, {
          title: newTitle,
          title_emojis: titleEmojis,
        })
        notifyConversationPatched({
          id: convId,
          title: newTitle,
          title_emojis: titleEmojis,
        })
      }
    } catch (err) {
      console.error('Failed to regenerate title:', err)
    } finally {
      setIsRegeneratingTitle(false)
    }
  }, [
    activeConversation?.id,
    conversationId,
    extractPlainText,
    getModelConfig,
    isRegeneratingTitle,
    messages,
    settings,
    setConversationTitle,
    setConversationTitleEmojis,
    conversationTitleEmojis,
  ])

  // Create a ref for the messages scroll container
  const messagesContainerRef = useRef(null)
  const inputAgent = selectedAgent
  const inputAgentAutoMode = isAgentAutoMode
  const bottomSpacerHeight = Math.max(96, inputAreaHeight + 20)

  useEffect(() => {
    const inputAreaEl = inputAreaRef.current
    if (!inputAreaEl) return

    const measure = () => {
      const nextHeight = Math.ceil(inputAreaEl.getBoundingClientRect().height || 0)
      setInputAreaHeight(prev => (prev === nextHeight ? prev : nextHeight))
    }

    measure()

    let observer = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => measure())
      observer.observe(inputAreaEl)
    }

    window.addEventListener('resize', measure)
    return () => {
      if (observer) observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  return (
    <div
      className={clsx(
        'bg-background text-foreground relative isolate flex h-full flex-1 flex-col overflow-hidden transition-all duration-300 sm:px-4',
        isSidebarPinned ? 'md:ml-78' : 'md:ml-16',
        // Fixed left shift for large screens
        // 'xl:-translate-x-30',
        // Dynamic movement follows sidebar state for small screens
        !isXLScreen && 'sidebar-shift',
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.22)_0%,rgba(255,255,255,0.06)_34%,rgba(255,255,255,0)_100%)] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.018)_32%,rgba(255,255,255,0)_100%)]" />
        <div className="bg-primary-500/10 dark:bg-primary-500/12 absolute top-12 left-[8%] h-56 w-56 rounded-full blur-[110px]" />
        <div className="bg-primary-400/8 dark:bg-primary-400/10 absolute right-[8%] bottom-24 h-72 w-72 rounded-full blur-[140px]" />
      </div>
      <div className="relative flex min-h-0 w-full flex-1 flex-col">
        {/* Title Bar */}
        <ChatHeader
          toggleSidebar={toggleSidebar}
          isMetaLoading={isMetaLoading}
          isTitleLoading={isTitleLoading}
          displaySpace={displaySpace}
          availableSpaces={availableSpaces}
          selectedSpace={selectedSpace}
          isSelectorOpen={isSelectorOpen}
          setIsSelectorOpen={setIsSelectorOpen}
          selectorRef={selectorRef}
          isDeepResearchConversation={false}
          isSpaceSelectionLocked={isSpaceSelectionLocked}
          onSelectSpace={handleSelectSpace}
          onClearSpaceSelection={handleClearSpaceSelection}
          conversationTitle={conversationTitle}
          conversationTitleEmojis={conversationTitleEmojis}
          isRegeneratingTitle={isRegeneratingTitle}
          onRegenerateTitle={handleRegenerateTitle}
          messages={messages}
          isTimelineSidebarOpen={isTimelineSidebarOpen}
          onToggleTimeline={() => setIsTimelineSidebarOpen(true)}
        />

        {/* Messages Scroll Container */}
        <div
          ref={messagesContainerRef}
          className="no-scrollbar relative flex-1 overflow-x-hidden overflow-y-auto pt-20 sm:px-2 sm:pt-24 sm:pb-2"
        >
          <div className="mx-auto w-full max-w-3xl px-0 sm:px-5">
            {showHistoryLoader && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <FancyLoader />
              </div>
            )}
            <MessageListComponent
              apiProvider={effectiveProvider}
              defaultModel={effectiveDefaultModel}
              onRelatedClick={handleRelatedClick}
              onMessageRef={registerMessageRef}
              onEdit={handleEdit}
              onQuote={handleQuote}
              onRegenerateAnswer={handleRegenerateAnswer}
              onDelete={handleDeleteMessage}
              onUserRegenerate={handleRegenerateQuestion}
              onFormSubmit={handleFormSubmit}
              scrapbookEntry={currentScrapbookEntry}
            />
            {/* Bottom Anchor */}
            <div ref={bottomRef} className="h-1" />
            {/* Reserve scroll space so last card won't be trapped behind input area */}
            <div style={{ height: `${bottomSpacerHeight}px` }} />
          </div>
        </div>

        {/* Bottom Spacer to ensure messages aren't hidden by Input Area */}

        {/* Timeline Sidebar - Keep original QuestionNavigator for fallback on smaller screens */}
        {/* <div className="xl:absolute xl:left-full xl:top-0 xl:ml-8 xl:w-64 xl:h-full mt-8 xl:mt-0 w-full px-4 xl:px-0"> */}
        {/* Original QuestionNavigator - visible only on desktop when sidebar is closed */}
        {/* <div className="hidden xl:block h-full">
            <div className="sticky top-24 max-h-[calc(100vh-10rem)] overflow-y-auto no-scrollbar">
              <QuestionNavigator
                items={questionNavItems}
                onJump={jumpToMessage}
                activeId={activeQuestionId}
              />
            </div>
          </div> */}
        {/* </div> */}

        {/* New Timeline Sidebar */}
        <QuestionTimelineController
          messages={messages}
          messageRefs={messageRefs}
          messagesContainerRef={messagesContainerRef}
          isOpen={isTimelineSidebarOpen}
          onToggle={setIsTimelineSidebarOpen}
        />

        {/* Input Area */}
        <div
          ref={inputAreaRef}
          className="z-50 flex w-full shrink-0 justify-center rounded-b-3xl bg-transparent px-2 pt-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-0"
        >
          <div className="relative w-full max-w-3xl">
            {/* Scrapbook context banner - shown above input before first message */}
            {currentScrapbookEntry && messages.length === 0 && (
              <ScrapbookContextBanner scrapbookEntry={currentScrapbookEntry} variant="input" />
            )}

            {/* Scroll to bottom button - positioned relative to input area */}

            {showScrollButton && (
              <button
                onClick={() => scrollToBottom('smooth')}
                className={clsx(
                  'glass-elite-pill animate-in fade-in slide-in-from-bottom-2 absolute -top-14 left-1/2 z-30 -translate-x-1/2 rounded-full p-2.5 transition-all duration-300 hover:scale-105 active:scale-95',
                  isLoading &&
                    'scroll-to-bottom-breathing border-primary-400/70 dark:border-primary-500/70',
                )}
              >
                <ArrowDown size={18} className="text-gray-700 dark:text-gray-300" strokeWidth={2} />
              </button>
            )}

            <ChatInputBar
              variant="capsule"
              isLoading={isLoading}
              isConversationLocked={hasPendingHitlInput}
              onStop={stopGeneration}
              apiProvider={effectiveProvider}
              isSearchActive={isSearchActive}
              thinkingMode={thinkingMode}
              isThinkingLocked={isThinkingLocked}
              agents={selectableAgents}
              agentsLoading={isAgentsLoading}
              agentsLoadingLabel={agentsLoadingLabel}
              agentsLoadingDots={agentLoadingDots}
              selectedAgent={inputAgent}
              isAgentAutoMode={inputAgentAutoMode}
              onAgentSelect={agent => {
                setSelectedAgentId(agent?.id || null)
                setIsAgentAutoMode(false)
                setPendingAgentId(null)
                setIsAgentSelectorOpen(false)
                const targetConversationId = activeConversation?.id || conversationId
                manualAgentSelectionRef.current = {
                  conversationId: targetConversationId || null,
                  mode: 'manual',
                  agentId: agent?.id || null,
                }
                if (targetConversationId) {
                  updateConversation(targetConversationId, {
                    last_agent_id: agent?.id || null,
                    agent_selection_mode: 'manual',
                  })
                    .then(({ data, error }) => {
                      if (error) throw error
                      notifyConversationPatched(
                        data || {
                          id: targetConversationId,
                          last_agent_id: agent?.id || null,
                          agent_selection_mode: 'manual',
                        },
                      )
                    })
                    .catch(err => console.error('Failed to update agent selection mode:', err))
                }
              }}
              onAgentAutoModeToggle={() => {
                setSelectedAgentId(null) // Clear selected agent when entering auto mode
                setIsAgentAutoMode(true)
                setPendingAgentId(null)
                setIsAgentSelectorOpen(false)
                const targetConversationId = activeConversation?.id || conversationId
                manualAgentSelectionRef.current = {
                  conversationId: targetConversationId || null,
                  mode: 'auto',
                  agentId: null,
                }
                if (targetConversationId) {
                  updateConversation(targetConversationId, {
                    last_agent_id: null,
                    agent_selection_mode: 'auto',
                  })
                    .then(({ data, error }) => {
                      if (error) throw error
                      notifyConversationPatched(
                        data || {
                          id: targetConversationId,
                          last_agent_id: null,
                          agent_selection_mode: 'auto',
                        },
                      )
                    })
                    .catch(err => console.error('Failed to update agent selection mode:', err))
                }
              }}
              isAgentSelectorOpen={isAgentSelectorOpen}
              onAgentSelectorToggle={() => {
                setIsAgentSelectorOpen(prev => !prev)
              }}
              agentSelectorRef={agentSelectorRef}
              onToggleSearch={toggleSearchMenu}
              searchBackend={searchBackend}
              searchBackendOptions={resolvedSearchBackendOptions}
              selectedExaSearchTools={selectedExaSearchTools}
              exaSearchOptions={resolvedExaSearchOptions}
              selectedSearchTools={selectedSearchTools}
              searchOptions={ACADEMIC_SEARCH_TOOL_OPTIONS}
              isSearchMenuOpen={isSearchMenuOpen}
              onSearchToolSelect={handleSelectSearchTool}
              onExaSearchToolSelect={handleSelectExaSearchTool}
              onSearchBackendChange={handleSelectSearchBackend}
              onSearchClear={handleClearSearchSelection}
              onSearchMenuClose={handleSearchMenuClose}
              onThinkingModeChange={setThinkingMode}
              quotedText={quotedText}
              onQuoteClear={() => {
                setQuotedText(null)
                setQuoteContext(null)
                quoteTextRef.current = ''
                quoteSourceRef.current = ''
              }}
              onSend={(text, attachments) =>
                handleSendMessage(text, attachments, null, { skipMeta: false })
              }
              editingSeed={editingSeed}
              onEditingClear={() => {
                setEditingIndex(null)
                setEditingSeed({ text: '', attachments: [] })
              }}
              showEditing={editingIndex !== null && messages[editingIndex]}
              editingLabel={
                editingIndex !== null ? extractUserQuestion(messages[editingIndex]) : ''
              }
              scrollToBottom={scrollToBottom}
              spacePrimaryAgentId={spacePrimaryAgentId}
              documents={spaceDocuments}
              documentsLoading={documentsLoading}
              selectedDocumentIds={selectedDocumentIds}
              onToggleDocument={handleToggleDocument}
            />
            <div className="text-center text-[10px] text-gray-400 sm:text-xs dark:text-gray-500">
              {t('chatInterface.warning')}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default React.memo(ChatInterface)
