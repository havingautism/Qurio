import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import useChatStore from '../lib/chatStore'
import FancyLoader from './FancyLoader'
import MessageList from './MessageList'
// import QuestionNavigator from './QuestionNavigator'
import clsx from 'clsx'
import { ArrowDown } from 'lucide-react'
import { useAppContext } from '../App'
import { useToast } from '../contexts/ToastContext'
import { updateConversation } from '../lib/conversationsService'
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
import { loadSettings } from '../lib/settings'
import { deleteMessageById } from '../lib/supabase'
import ChatHeader from './chat/ChatHeader'
import ChatInputBar from './chat/ChatInputBar'

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

const ChatInterface = ({
  spaces = [],
  activeConversation = null,
  initialMessage = '',
  initialAttachments = [],
  initialToggles = {},
  initialSpaceSelection = { mode: 'auto', space: null },
  initialAgentSelection = null,
  initialIsAgentAutoMode = true,
  onTitleAndSpaceGenerated,
  isSidebarPinned = false,
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

  const getLanguageInstruction = agent => {
    const trimmedLanguage =
      typeof (agent?.response_language || agent?.responseLanguage) === 'string'
        ? (agent.response_language || agent.responseLanguage).trim()
        : ''
    return trimmedLanguage ? `Reply in ${trimmedLanguage}.` : ''
  }

  const applyLanguageInstructionToText = (text, instruction) => {
    if (!instruction) return text
    const baseText = typeof text === 'string' ? text.trim() : ''
    return baseText ? `${baseText}\n\n${instruction}` : instruction
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
      submitInteractiveForm: state.submitInteractiveForm,
      resetLoading: state.resetLoading,
    })),
  )

  // Reset loading state on mount to prevent stale loaders
  useEffect(() => {
    resetLoading()
  }, [])

  const activeConversationId = activeConversation?.id || conversationId
  const { toggleSidebar, agents: appAgents = [], defaultAgent, setConversationStatus } =
    useAppContext()

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

  // New state for toggles and attachments
  const [isSearchActive, setIsSearchActive] = useState(false)
  const [isThinkingActive, setIsThinkingActive] = useState(false)

  const isPlaceholderConversation = Boolean(activeConversation?._isPlaceholder)

  useEffect(() => {
    pendingDocumentIdsRef.current = pendingDocumentIds
  }, [pendingDocumentIds])

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
        setSpaceDocuments([])
        setSelectedDocumentIds([])
        setPendingDocumentIds([])
        setIsDocumentSelectorOpen(false)
        return
      }

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

  const [settings, setSettings] = useState(loadSettings())
  const isRelatedEnabled = Boolean(settings.enableRelatedQuestions)
  const messageRefs = useRef({})
  const bottomRef = useRef(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [isRegeneratingTitle, setIsRegeneratingTitle] = useState(false)
  const lastLoadedConversationIdRef = useRef(null)

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

  const documentContext = useMemo(
    () => buildDocumentContext(selectedDocuments),
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
    (task = 'streamChatCompletion') => {
      const resolveFromAgent = agent => {
        if (!agent) return null
        const defaultModel = agent.defaultModel
        const liteModel = agent.liteModel ?? ''
        const defaultModelProvider = agent.defaultModelProvider || ''
        const liteModelProvider = agent.liteModelProvider || ''
        const hasDefault = typeof defaultModel === 'string' && defaultModel.trim() !== ''
        const hasLite = typeof liteModel === 'string' && liteModel.trim() !== ''
        if (!hasDefault && !hasLite) return null

        const isLiteTask =
          task === 'generateTitle' ||
          task === 'generateTitleAndSpace' ||
          task === 'generateRelatedQuestions' ||
          task === 'generateResearchPlan'

        const model = isLiteTask ? liteModel || defaultModel : defaultModel || liteModel
        const provider = isLiteTask
          ? liteModelProvider || defaultModelProvider || agent.provider
          : defaultModelProvider || liteModelProvider || agent.provider

        if (!model || !provider) return null
        return { provider, model }
      }

      const primaryConfig = resolveFromAgent(effectiveAgent)
      if (primaryConfig) return primaryConfig

      const fallbackConfig = resolveFromAgent(defaultAgent)
      if (fallbackConfig) return fallbackConfig

      return {
        provider: fallbackProvider,
        model: '',
      }
    },
    [defaultAgent, effectiveAgent, fallbackProvider],
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
    if (!isThinkingLocked) return
    setIsThinkingActive(thinkingRule.isThinkingActive)
  }, [isThinkingLocked, thinkingRule.isThinkingActive])

  // Effect to handle initial message from homepage
  const hasInitialized = useRef(false)
  const isProcessingInitial = useRef(false)

  useEffect(() => {
    const handleSettingsChange = () => {
      setSettings(loadSettings())

      const nextProvider = effectiveAgent?.provider || defaultAgent?.provider
      if (!nextProvider || !providerSupportsSearch(nextProvider)) {
        setIsSearchActive(false)
      }
    }

    window.addEventListener('settings-changed', handleSettingsChange)
    return () => {
      window.removeEventListener('settings-changed', handleSettingsChange)
    }
  }, [effectiveAgent?.provider, defaultAgent?.provider])

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

      isProcessingInitial.current = true
      hasInitialized.current = true

      // Set initial state
      if (initialToggles.search) setIsSearchActive(true)
      if (initialToggles.thinking) setIsThinkingActive(true)

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
  ])

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
    [messages],
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
      const thinkingActive = togglesOverride ? togglesOverride.thinking : isThinkingActive
      const relatedActive = togglesOverride ? togglesOverride.related : isRelatedEnabled

      if (!textToSend.trim() && attToSend.length === 0) return
      if (isLoading) return
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

      await sendMessage({
        text: textToSend,
        attachments: attToSend,
        toggles: {
          search: searchActive,
          thinking: thinkingActive,
          related: relatedActive,
        },
        settings,
        spaceInfo: { selectedSpace, isManualSpaceSelection },
        selectedAgent: agentForSend,
        isAgentAutoMode,
        agents: appAgents,
        documentContext,
        editingInfo,
        callbacks: {
          onTitleAndSpaceGenerated,
          onSpaceResolved: space => {
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
    },
    [
      isSearchActive,
      isThinkingActive,
      isRelatedEnabled,
      isLoading,
      editingIndex,
      editingTargetId,
      editingPartnerId,
      scrollToBottom,
      sendMessage,
      settings,
      selectedSpace,
      effectiveAgent,
      isAgentAutoMode,
      defaultAgent,
      isManualSpaceSelection,
      onTitleAndSpaceGenerated,
      spaces,
      quoteContext,
      appAgents,
      spaceAgentIds,
      spaceAgents,
      documentContext,
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
    formSubmission => {
      const agentForSend =
        selectedAgent || (!isAgentAutoMode && initialAgentSelection) || defaultAgent || null

      // Use submitInteractiveForm to continue in the same message
      submitInteractiveForm({
        formData: formSubmission,
        settings,
        toggles: {
          search: isSearchActive,
          thinking: isThinkingActive,
          related: isRelatedEnabled,
        },
        selectedAgent: agentForSend,
        agents: appAgents,
        spaceInfo: { selectedSpace, isManualSpaceSelection },
        isAgentAutoMode,
      })
    },
    [
      isSearchActive,
      isThinkingActive,
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

      const idsToDelete = partnerIds.filter(Boolean)
      if (idsToDelete.length > 0) {
        try {
          await Promise.all(idsToDelete.map(id => deleteMessageById(id)))
        } catch (err) {
          console.error('Failed to delete messages on regenerate:', err)
        }
      }

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
          thinking: isThinkingActive,
          related: isRelatedEnabled,
        },
        { editingInfoOverride },
      )
    },

    [
      extractUserQuestion,
      handleSendMessage,
      isLoading,
      messages,
      setMessages,
      isSearchActive,
      isThinkingActive,
      isRelatedEnabled,
    ],
  )

  const handleRegenerateQuestion = useCallback(
    async userIndex => {
      if (isLoading) return

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
      const idsToDelete = partnerIds.filter(Boolean)
      if (idsToDelete.length > 0) {
        try {
          await Promise.all(idsToDelete.map(id => deleteMessageById(id)))
        } catch (err) {
          console.error('Failed to delete messages on question regenerate:', err)
        }
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
          thinking: isThinkingActive,
          related: isRelatedEnabled,
        },
        { editingInfoOverride },
      )
    },
    [
      extractUserQuestion,
      handleSendMessage,
      isLoading,
      messages,
      setMessages,
      isSearchActive,
      isThinkingActive,
      isRelatedEnabled,
    ],
  )

  const handleDeleteMessage = useCallback(
    async index => {
      if (isLoading) return
      const target = messages[index]
      if (!target) return

      // Determine range to delete: for AI, delete until next user (same question's stitched parts/forms)
      const nextUserIndex = target.role === 'ai'
        ? messages.findIndex((m, idx) => idx > index && m.role === 'user')
        : -1
      const cutEnd = nextUserIndex === -1 ? index + 1 : nextUserIndex
      const idsToDelete = messages.slice(index, cutEnd).map(m => m.id).filter(Boolean)

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
      const languageInstruction = getLanguageInstruction(agentForTitle)
      const promptText = applyLanguageInstructionToText(contextText, languageInstruction)
      const titleResult = await provider.generateTitle(
        promptText,
        credentials.apiKey,
        credentials.baseUrl,
        modelConfig.model,
      )
      const newTitle = titleResult?.title || ''
      if (!newTitle) return
      setConversationTitle(newTitle)
      setConversationTitleEmojis(Array.isArray(titleResult?.emojis) ? titleResult.emojis : [])
      const convId = conversationId || activeConversation?.id
      if (convId) {
        await updateConversation(convId, {
          title: newTitle,
          title_emojis: Array.isArray(titleResult?.emojis) ? titleResult.emojis : [],
        })
        window.dispatchEvent(new Event('conversations-changed'))
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
  ])

  // Create a ref for the messages scroll container
  const messagesContainerRef = useRef(null)
  const inputAgent = selectedAgent
  const inputAgentAutoMode = isAgentAutoMode

  return (
    <div
      className={clsx(
        'flex-1 h-full bg-background text-foreground transition-all duration-300 flex flex-col sm:px-4',
        isSidebarPinned ? 'md:ml-72' : 'md:ml-16',
        // Fixed left shift for large screens
        // 'xl:-translate-x-30',
        // Dynamic movement follows sidebar state for small screens
        !isXLScreen && 'sidebar-shift',
      )}
    >
      <div className="w-full relative flex flex-col flex-1 min-h-0">
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
          className="flex-1 overflow-y-auto overflow-x-hidden sm:p-2 relative no-scrollbar"
        >
          <div className="w-full px-0 sm:px-5 max-w-3xl mx-auto">
            {showHistoryLoader && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <FancyLoader />
              </div>
            )}
            <MessageList
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
            />
            {/* Bottom Anchor */}
            <div ref={bottomRef} className="h-1" />
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
        <div className="w-full shrink-0 bg-background pt-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))] px-2 sm:px-0 flex justify-center z-20">
          <div className="w-full max-w-3xl relative">
            {/* Scroll to bottom button - positioned relative to input area */}

            {showScrollButton && (
              <button
                onClick={() => scrollToBottom('smooth')}
                className="absolute -top-12 left-1/2  sm:hover:scale-105 -translate-x-1/2 p-2 bg-background border border-[#0d0d0d1a] dark:border-[#ffffff26] rounded-full shadow-lg hover:bg-muted transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 z-30"
              >
                <ArrowDown size={16} className="text-foreground" />
              </button>
            )}

            <ChatInputBar
              variant="capsule"
              isLoading={isLoading}
              apiProvider={effectiveProvider}
              isSearchActive={isSearchActive}
              isThinkingActive={isThinkingActive}
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
                  }).catch(err => console.error('Failed to update agent selection mode:', err))
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
                  }).catch(err => console.error('Failed to update agent selection mode:', err))
                }
              }}
              isAgentSelectorOpen={isAgentSelectorOpen}
              onAgentSelectorToggle={() => {
                setIsAgentSelectorOpen(prev => !prev)
              }}
              agentSelectorRef={agentSelectorRef}
              onToggleSearch={() => setIsSearchActive(prev => !prev)}
              onToggleThinking={() => setIsThinkingActive(prev => !prev)}
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
            <div className="text-center mt-2 text-xs text-gray-400 dark:text-gray-500">
              Qurio can make mistakes. Please use with caution.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChatInterface
