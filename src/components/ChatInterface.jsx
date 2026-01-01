import { useLocation, useNavigate } from '@tanstack/react-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import useChatStore from '../lib/chatStore'
import FancyLoader from './FancyLoader'
import MessageList from './MessageList'
// import QuestionNavigator from './QuestionNavigator'
import clsx from 'clsx'
import {
  ArrowDown,
  ArrowRight,
  Brain,
  Check,
  ChevronDown,
  FileText,
  Globe,
  Image,
  LayoutGrid,
  Menu,
  PanelRightOpen,
  Paperclip,
  Smile,
  Sparkles,
  X,
} from 'lucide-react'
import { useAppContext } from '../App'
import { updateConversation } from '../lib/conversationsService'
import { getProvider, providerSupportsSearch, resolveThinkingToggleRule } from '../lib/providers'
import QuestionTimelineSidebar from './QuestionTimelineSidebar'

import { useSidebarOffset } from '../hooks/useSidebarOffset'
import { getAgentDisplayName } from '../lib/agentDisplay'
import { getSpaceDisplayLabel } from '../lib/spaceDisplay'
import { listMessages } from '../lib/conversationsService'
import { loadSettings } from '../lib/settings'
import { listSpaceAgents } from '../lib/spacesService'
import { deleteMessageById } from '../lib/supabase'
import EmojiDisplay from './EmojiDisplay'

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
  // Mobile detection
  const isMobile = (() => {
    const ua = navigator.userAgent || navigator.vendor || window.opera
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    return /iPhone|iPod|Android/i.test(ua) || (isTouch && window.innerWidth <= 1024)
  })()

  // Lock body scroll when component mounts (defensive measure for iOS keyboard interactions)
  // useEffect(() => {
  //   document.body.classList.add('scroll-locked')

  //   return () => {
  //     // Unlock body scroll when component unmounts
  //     document.body.classList.remove('scroll-locked')
  //   }
  // }, [])

  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const {
    messages,
    setMessages,
    conversationId,
    setConversationId,
    conversationTitle,
    setConversationTitle,
    isLoading,
    setIsLoading,
    isMetaLoading,
    isAgentPreselecting,
    sendMessage,
  } = useChatStore(
    useShallow(state => ({
      messages: state.messages,
      setMessages: state.setMessages,
      conversationId: state.conversationId,
      setConversationId: state.setConversationId,
      conversationTitle: state.conversationTitle,
      setConversationTitle: state.setConversationTitle,
      isLoading: state.isLoading,
      setIsLoading: state.setIsLoading,
      isMetaLoading: state.isMetaLoading,
      isAgentPreselecting: state.isAgentPreselecting,
      sendMessage: state.sendMessage,
    })),
  )

  const [quotedText, setQuotedText] = useState(null)
  const [quoteContext, setQuoteContext] = useState(null)
  const [editingSeed, setEditingSeed] = useState({ text: '', attachments: [] })
  const quoteTextRef = useRef('')
  const quoteSourceRef = useRef('')

  // New state for toggles and attachments
  const [isSearchActive, setIsSearchActive] = useState(false)
  const [isThinkingActive, setIsThinkingActive] = useState(false)
  const [isDeepResearchActive, setIsDeepResearchActive] = useState(false)

  const isPlaceholderConversation = Boolean(activeConversation?._isPlaceholder)
  const [selectedSpace, setSelectedSpace] = useState(initialSpaceSelection.space || null)
  const [isSelectorOpen, setIsSelectorOpen] = useState(false)
  const selectorRef = useRef(null)
  const agentSelectorRef = useRef(null)
  const [isManualSpaceSelection, setIsManualSpaceSelection] = useState(
    initialSpaceSelection.mode === 'manual',
  )
  const {
    toggleSidebar,
    agents: appAgents = [],
    defaultAgent,
    deepResearchSpace,
    deepResearchAgent,
  } = useAppContext()
  const [spaceAgentIds, setSpaceAgentIds] = useState([])
  const [spacePrimaryAgentId, setSpacePrimaryAgentId] = useState(null)
  const [isAgentsLoading, setIsAgentsLoading] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState(null)
  const [isAgentAutoMode, setIsAgentAutoMode] = useState(() => {
    if (isPlaceholderConversation) return initialIsAgentAutoMode
    return activeConversation?.agent_selection_mode !== 'manual'
  })
  const [isAgentSelectorOpen, setIsAgentSelectorOpen] = useState(false)
  const [pendingAgentId, setPendingAgentId] = useState(null)
  const [agentLoadingDots, setAgentLoadingDots] = useState('')
  const manualSpaceOverrideRef = useRef({ conversationId: null, spaceId: null })
  const initialAgentSelectionId = initialAgentSelection?.id || null
  const initialAgentAppliedRef = useRef({
    key: null,
    agentId: null,
    isAgentAutoMode: null,
  })
  const manualAgentSelectionRef = useRef({
    conversationId: null,
    mode: null,
    agentId: null,
  })

  const [settings, setSettings] = useState(loadSettings())
  const isRelatedEnabled = Boolean(settings.enableRelatedQuestions)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [showHistoryLoader, setShowHistoryLoader] = useState(false)
  const historyLoaderTimeoutRef = useRef(null)
  const loadedMessagesRef = useRef(new Set())
  const messageRefs = useRef({})
  const bottomRef = useRef(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [isRegeneratingTitle, setIsRegeneratingTitle] = useState(false)
  const isSwitchingConversation = Boolean(
    activeConversation?.id && activeConversation.id !== conversationId,
  )
  const lastLoadedConversationIdRef = useRef(null)

  // Track the last synced conversation ID to avoid redundant updates
  const lastSyncedConversationIdRef = useRef(null)

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

  useEffect(() => {
    const shouldShow = isLoadingHistory || isSwitchingConversation
    if (shouldShow) {
      if (historyLoaderTimeoutRef.current) return
      historyLoaderTimeoutRef.current = setTimeout(() => {
        setShowHistoryLoader(true)
        historyLoaderTimeoutRef.current = null
      }, 200)
      return
    }

    if (historyLoaderTimeoutRef.current) {
      clearTimeout(historyLoaderTimeoutRef.current)
      historyLoaderTimeoutRef.current = null
    }
    if (showHistoryLoader) {
      setShowHistoryLoader(false)
    }
  }, [isLoadingHistory, isSwitchingConversation, showHistoryLoader])
  const conversationSpace = useMemo(() => {
    if (!activeConversation?.space_id) return null
    const sid = String(activeConversation.space_id)
    return spaces.find(s => String(s.id) === sid) || null
  }, [activeConversation?.space_id, spaces])
  // If user has manually selected a space (or None), use that; otherwise use conversation's space
  const displaySpace = useMemo(() => {
    const result = isManualSpaceSelection
      ? selectedSpace
      : selectedSpace || conversationSpace || null
    return result
  }, [isManualSpaceSelection, selectedSpace, conversationSpace])
  const isDeepResearchConversation = Boolean(
    deepResearchSpace?.id &&
    displaySpace?.id &&
    String(displaySpace.id) === String(deepResearchSpace.id),
  )
  const availableSpaces = useMemo(() => {
    if (isDeepResearchConversation) return spaces
    const deepResearchId = deepResearchSpace?.id ? String(deepResearchSpace.id) : null
    return spaces.filter(
      space =>
        !(space?.isDeepResearchSystem || space?.isDeepResearch || space?.is_deep_research) &&
        (!deepResearchId || String(space.id) !== deepResearchId),
    )
  }, [spaces, isDeepResearchConversation, deepResearchSpace?.id])

  useEffect(() => {
    if (!isDeepResearchConversation) return
    if (deepResearchSpace && deepResearchSpace.id !== selectedSpace?.id) {
      setSelectedSpace(deepResearchSpace)
      setIsManualSpaceSelection(true)
    }
    if (deepResearchAgent?.id && deepResearchAgent.id !== selectedAgentId) {
      setSelectedAgentId(deepResearchAgent.id)
      setPendingAgentId(deepResearchAgent.id)
      setIsAgentAutoMode(false)
    }
    if (!isDeepResearchActive) {
      setIsDeepResearchActive(true)
      setIsThinkingActive(false)
    }
  }, [
    isDeepResearchConversation,
    deepResearchSpace,
    deepResearchAgent,
    selectedSpace?.id,
    selectedAgentId,
    isDeepResearchActive,
  ])

  // Function to reload space agents (used when space changes or settings change)
  const reloadSpaceAgents = useCallback(async () => {
    if (!displaySpace?.id) {
      setSpaceAgentIds([])
      setSpacePrimaryAgentId(null)
      if (!pendingAgentId && !selectedAgentId) {
        setSelectedAgentId(defaultAgent?.id || null)
      }
      setIsAgentsLoading(false)
      return
    }
    setIsAgentsLoading(true)
    try {
      const { data, error } = await listSpaceAgents(displaySpace.id)
      if (!error && data) {
        const newAgentIds = data.map(item => item.agent_id)
        const primaryAgentId = data.find(item => item.is_primary)?.agent_id || null
        setSpaceAgentIds(newAgentIds)
        setSpacePrimaryAgentId(primaryAgentId)
      } else {
        setSpaceAgentIds([])
        setSpacePrimaryAgentId(null)
      }
    } catch (err) {
      console.error('Failed to reload space agents:', err)
      setSpaceAgentIds([])
      setSpacePrimaryAgentId(null)
    } finally {
      setIsAgentsLoading(false)
    }
  }, [displaySpace?.id, defaultAgent?.id, pendingAgentId, selectedAgentId])

  const spaceAgents = useMemo(() => {
    if (!displaySpace?.id) {
      return []
    }
    const idSet = new Set(spaceAgentIds.map(id => String(id)))
    const filteredAgents = appAgents.filter(agent => idSet.has(String(agent.id)))
    return filteredAgents
  }, [appAgents, displaySpace?.id, spaceAgentIds])

  const selectableAgents = useMemo(() => {
    if (isDeepResearchConversation && deepResearchAgent) {
      return [deepResearchAgent]
    }
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
  }, [
    spaceAgents,
    defaultAgent,
    selectedAgentId,
    appAgents,
    displaySpace,
    isDeepResearchConversation,
    deepResearchAgent,
  ])

  const selectedAgent = useMemo(() => {
    const agent =
      selectableAgents.find(agent => String(agent.id) === String(selectedAgentId)) || null
    return agent
  }, [selectableAgents, selectedAgentId])

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

  // Agent resolving includes: space agents loading, pending agent from UI, or agent preselection in auto mode
  const isAgentResolving = isAgentsLoading || pendingAgentId !== null || isAgentPreselecting
  const baseAgentsLoadingLabel = t('chatInterface.agentsLoading')
  const agentsLoadingLabel = `${baseAgentsLoadingLabel.replace(/\.\.\.$/, '')}${agentLoadingDots}`

  useEffect(() => {
    if (!isAgentResolving) {
      setAgentLoadingDots('')
      return
    }
    let step = 0
    const interval = setInterval(() => {
      step = (step + 1) % 4
      setAgentLoadingDots('.'.repeat(step))
    }, 450)
    return () => clearInterval(interval)
  }, [isAgentResolving])

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
      const MODEL_SEPARATOR = '::'
      const decodeModelId = encodedModel => {
        if (!encodedModel) return ''
        const index = encodedModel.indexOf(MODEL_SEPARATOR)
        if (index === -1) return encodedModel
        return encodedModel.slice(index + MODEL_SEPARATOR.length)
      }
      const getProviderFromEncodedModel = encodedModel => {
        if (!encodedModel) return ''
        const index = encodedModel.indexOf(MODEL_SEPARATOR)
        if (index === -1) return ''
        return encodedModel.slice(0, index)
      }

      const resolveFromAgent = agent => {
        if (!agent) return null
        const defaultModel = agent.defaultModel
        const liteModel = agent.liteModel ?? ''
        const hasDefault = typeof defaultModel === 'string' && defaultModel.trim() !== ''
        const hasLite = typeof liteModel === 'string' && liteModel.trim() !== ''
        if (!hasDefault && !hasLite) return null

        const decodedDefaultModel = hasDefault ? decodeModelId(defaultModel) : ''
        const decodedLiteModel = hasLite ? decodeModelId(liteModel) : ''
        const defaultProvider = getProviderFromEncodedModel(defaultModel)
        const liteProvider = getProviderFromEncodedModel(liteModel)
        const isLiteTask =
          task === 'generateTitle' ||
          task === 'generateTitleAndSpace' ||
          task === 'generateRelatedQuestions' ||
          task === 'generateResearchPlan'

        const model = isLiteTask
          ? decodedLiteModel || decodedDefaultModel
          : decodedDefaultModel || decodedLiteModel
        const provider = isLiteTask
          ? liteProvider || defaultProvider || agent.provider
          : defaultProvider || liteProvider || agent.provider

        if (!model) return null
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
      const newSettings = loadSettings()
      const nextProvider = effectiveAgent?.provider || defaultAgent?.provider
      if (!nextProvider || !providerSupportsSearch(nextProvider)) {
        setIsSearchActive(false)
      }
      // Reload space agents when settings change (e.g., default agent changed in space settings)
      reloadSpaceAgents()
    }

    const handleSpaceAgentsChange = event => {
      const { spaceId } = event.detail || {}
      // Only reload if the changed space matches the current display space
      if (displaySpace?.id && String(displaySpace.id) === String(spaceId)) {
        reloadSpaceAgents()
      }
    }

    window.addEventListener('settings-changed', handleSettingsChange)
    window.addEventListener('space-agents-changed', handleSpaceAgentsChange)
    return () => {
      window.removeEventListener('settings-changed', handleSettingsChange)
      window.removeEventListener('space-agents-changed', handleSpaceAgentsChange)
    }
  }, [effectiveAgent?.provider, reloadSpaceAgents, displaySpace?.id])

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
      if (initialToggles.deepResearch) {
        setIsDeepResearchActive(true)
        setIsThinkingActive(false)
      } else if (initialToggles.thinking) {
        setIsThinkingActive(true)
      }

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
        if (
          activeConversation.title &&
          (activeConversation.title !== 'New Conversation' ||
            conversationTitle === 'New Conversation')
        ) {
          setConversationTitle(activeConversation.title)
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
        if (
          activeConversation.title &&
          (activeConversation.title !== 'New Conversation' || !conversationTitle)
        ) {
          setConversationTitle(activeConversation.title)
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
      if (
        activeConversation.title &&
        (activeConversation.title !== 'New Conversation' || !conversationTitle)
      ) {
        setConversationTitle(activeConversation.title)
      } else if (!conversationTitle) {
        setConversationTitle('')
      }
      const isNewConversation =
        activeConversation?.id && activeConversation.id !== lastLoadedConversationIdRef.current
      if (isNewConversation) {
        lastLoadedConversationIdRef.current = activeConversation.id
      }
      // Space is synced by unified logic above
      const conversationLastAgentId =
        activeConversation?.last_agent_id ?? activeConversation?.lastAgentId ?? null
      const { data, error } = await listMessages(activeConversation.id)
      if (!error && data) {
        if (messages.length > 0 && (isProcessingInitial.current || hasInitialized.current)) {
          setIsLoadingHistory(false)
          return
        }
        const mapped = data.map(m => {
          const { content: cleanedContent, thought: thoughtFromContent } = splitThoughtFromContent(
            m.content,
          )
          const rawThought = m.thinking_process ?? m.thought ?? thoughtFromContent ?? undefined
          let thought = rawThought
          let researchPlan = null
          if (typeof rawThought === 'string') {
            try {
              const parsedThought = JSON.parse(rawThought)
              if (parsedThought && typeof parsedThought === 'object') {
                if (typeof parsedThought.thought === 'string') thought = parsedThought.thought
                if (typeof parsedThought.plan === 'string') researchPlan = parsedThought.plan
              }
            } catch {}
          }

          return {
            id: m.id,
            created_at: m.created_at,
            role: m.role === 'assistant' ? 'ai' : m.role,
            content: cleanedContent,
            thought,
            researchPlan: researchPlan || '',
            deepResearch: !!researchPlan,
            related: m.related_questions || undefined,
            tool_calls: m.tool_calls || undefined,
            sources: m.sources || undefined,
            groundingSupports: m.grounding_supports || undefined,
            provider: m.provider || activeConversation?.api_provider,
            model: m.model || effectiveDefaultModel,
            agentId: m.agent_id ?? m.agentId ?? null,
            agentName: m.agent_name ?? m.agentName ?? null,
            agentEmoji: m.agent_emoji ?? m.agentEmoji ?? '',
            agentIsDefault: m.agent_is_default ?? m.agentIsDefault ?? false,
            thinkingEnabled:
              m.is_thinking_enabled ??
              m.generated_with_thinking ??
              (thought || researchPlan ? true : undefined),
          }
        })
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
    const canAdoptInitialSpace =
      !activeConversation ||
      isPlaceholderConversation ||
      (!activeConversation?.space_id && !selectedSpace && !isManualSpaceSelection)

    if (!canAdoptInitialSpace) return

    if (initialSpaceSelection?.mode === 'manual') {
      // Manual mode: user selected a specific space OR explicitly chose "None"
      // Both cases should prevent automatic space preselection
      setSelectedSpace(initialSpaceSelection.space || null)
      setIsManualSpaceSelection(true)
      return
    }

    if (initialSpaceSelection?.mode === 'auto') {
      if (initialSpaceSelection?.space) {
        setSelectedSpace(initialSpaceSelection.space)
        setIsManualSpaceSelection(false)
      } else if (!selectedSpace && !isManualSpaceSelection) {
        setSelectedSpace(null)
        setIsManualSpaceSelection(false)
      }
    }
  }, [
    initialSpaceSelection,
    activeConversation,
    isPlaceholderConversation,
    selectedSpace,
    isManualSpaceSelection,
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
    }

    if (isSelectorOpen || isAgentSelectorOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isAgentSelectorOpen, isSelectorOpen])

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
    if (!isDeepResearchConversation || !deepResearchAgent?.id) return
    if (selectedAgentId !== deepResearchAgent.id) {
      setSelectedAgentId(deepResearchAgent.id)
    }
    if (pendingAgentId) {
      setPendingAgentId(null)
    }
  }, [isDeepResearchConversation, deepResearchAgent?.id, selectedAgentId, pendingAgentId])

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

  const handleSelectSpace = space => {
    if (isDeepResearchConversation) return
    const isDeepResearchSpace =
      space?.isDeepResearchSystem ||
      space?.isDeepResearch ||
      space?.is_deep_research ||
      (deepResearchSpace?.id && String(space?.id) === String(deepResearchSpace.id))
    if (isDeepResearchSpace) return
    setSelectedSpace(space)
    setIsManualSpaceSelection(true)
    setIsSelectorOpen(false)
    manualSpaceOverrideRef.current = {
      conversationId: activeConversation?.id || conversationId || null,
      spaceId: space?.id || null,
    }
    const conversationLastAgentId =
      activeConversation?.last_agent_id ?? activeConversation?.lastAgentId ?? null
    setPendingAgentId(conversationLastAgentId)
    if (conversationId || activeConversation?.id) {
      updateConversation(conversationId || activeConversation.id, {
        space_id: space?.id || null,
      })
        .then(() => {
          // Trigger event to refresh sidebar
          window.dispatchEvent(new Event('conversations-changed'))
          window.dispatchEvent(
            new CustomEvent('conversation-space-updated', {
              detail: {
                conversationId: conversationId || activeConversation?.id,
                space,
              },
            }),
          )
        })
        .catch(err => console.error('Failed to update conversation space:', err))
    }
  }

  const handleClearSpaceSelection = () => {
    if (isDeepResearchConversation) return
    setSelectedSpace(null)
    setIsManualSpaceSelection(true) // Keep as true because selecting "None" is a manual action
    setIsSelectorOpen(false)
    manualSpaceOverrideRef.current = {
      conversationId: activeConversation?.id || conversationId || null,
      spaceId: null,
    }
    setPendingAgentId(null) // Clear pending agent when clearing space
    setSelectedAgentId(defaultAgent?.id || null)
    if (conversationId || activeConversation?.id) {
      updateConversation(conversationId || activeConversation.id, {
        space_id: null,
      })
        .then(() => {
          // Trigger event to refresh sidebar
          window.dispatchEvent(new Event('conversations-changed'))
          window.dispatchEvent(
            new CustomEvent('conversation-space-updated', {
              detail: {
                conversationId: conversationId || activeConversation?.id,
                space: null,
              },
            }),
          )
        })
        .catch(err => console.error('Failed to clear conversation space:', err))
    }
  }

  const registerMessageRef = useCallback((id, msg, el) => {
    if (el) {
      messageRefs.current[id] = el
    } else {
      delete messageRefs.current[id]
    }
  }, [])

  const jumpToMessage = id => {
    const node = messageRefs.current[id]
    if (!node || !messagesContainerRef.current) return

    // Get the container's position and scroll
    const containerRect = messagesContainerRef.current.getBoundingClientRect()
    const nodeRect = node.getBoundingClientRect()

    // Calculate relative position within container
    const yOffset = 20 // Offset from top of container
    const scrollTop =
      nodeRect.top - containerRect.top + messagesContainerRef.current.scrollTop - yOffset

    messagesContainerRef.current.scrollTo({
      top: scrollTop,
      behavior: 'smooth',
    })
  }

  const extractUserQuestion = msg => {
    if (!msg) return ''
    if (typeof msg.content === 'string') return msg.content
    if (Array.isArray(msg.content)) {
      const textPart = msg.content.find(c => c.type === 'text')
      return textPart?.text || ''
    }
    return ''
  }

  const splitThoughtFromContent = rawContent => {
    if (rawContent && typeof rawContent === 'object' && !Array.isArray(rawContent)) {
      const contentValue =
        typeof rawContent.content !== 'undefined' ? rawContent.content : rawContent
      const thoughtValue =
        rawContent.thought ?? rawContent.thinking_process ?? rawContent.thinkingProcess ?? null

      if (typeof contentValue === 'string') {
        const thoughtMatch = /<thought>([\s\S]*?)(?:<\/thought>|$)/.exec(contentValue)
        if (thoughtMatch) {
          const cleaned = contentValue.replace(/<thought>[\s\S]*?(?:<\/thought>|$)/, '').trim()
          const combinedThought = thoughtValue || thoughtMatch[1]?.trim() || null
          return { content: cleaned, thought: combinedThought }
        }
      }

      if (
        Object.prototype.hasOwnProperty.call(rawContent, 'thought') ||
        Object.prototype.hasOwnProperty.call(rawContent, 'thinking_process') ||
        Object.prototype.hasOwnProperty.call(rawContent, 'thinkingProcess')
      ) {
        return {
          content: contentValue,
          thought: thoughtValue,
        }
      }
    }

    if (typeof rawContent !== 'string') return { content: rawContent, thought: null }

    const thoughtMatch = /<thought>([\s\S]*?)(?:<\/thought>|$)/.exec(rawContent)
    if (!thoughtMatch) return { content: rawContent, thought: null }

    const cleaned = rawContent.replace(/<thought>[\s\S]*?(?:<\/thought>|$)/, '').trim()
    const thought = thoughtMatch[1]?.trim() || null

    return { content: cleaned, thought }
  }

  const [activeQuestionId, setActiveQuestionId] = useState(null)
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

  useEffect(() => {
    const observerCallback = entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.1) {
          // When a message comes into view, check if it's a user message (question)
          // or if it belongs to a question block.
          // Since we want to highlight the question even when reading the answer,
          // we need to find the closest preceding question.

          const id = entry.target.id // message-0, message-1, etc.
          if (!id) return

          const index = parseInt(id.replace('message-', ''), 10)
          if (isNaN(index)) return

          // Find the question for this message
          // If this message is a user message, it IS the question.
          // If it's an AI message, the question is likely index - 1.
          const message = messages[index]
          if (!message) return

          let targetQuestionId = null
          if (message.role === 'user') {
            targetQuestionId = id
          } else if (index > 0 && messages[index - 1].role === 'user') {
            targetQuestionId = `message-${index - 1}`
          }

          if (targetQuestionId) {
            setActiveQuestionId(targetQuestionId)
          }
        }
      })
    }

    const observer = new IntersectionObserver(observerCallback, {
      root: messagesContainerRef.current, // Use messages container as root
      rootMargin: '-10% 0px -60% 0px', // Trigger when element is near the top
      threshold: [0.1],
    })

    Object.values(messageRefs.current).forEach(el => {
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [messages])

  const questionNavItems = useMemo(
    () =>
      messages
        .map((msg, idx) => {
          if (msg.role !== 'user') return null
          const text = extractUserQuestion(msg).trim()
          if (!text) return null
          return {
            id: `message-${idx}`,
            index: idx + 1,
            label: text.length > 120 ? `${text.slice(0, 117)}...` : text,
            timestamp: msg.created_at,
          }
        })
        .filter(Boolean),
    [messages],
  )

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
  const [editingTargetTimestamp, setEditingTargetTimestamp] = useState(null)
  const [editingPartnerTimestamp, setEditingPartnerTimestamp] = useState(null)
  const [editingTargetId, setEditingTargetId] = useState(null)
  const [editingPartnerId, setEditingPartnerId] = useState(null)
  const hasDeepResearchHistory = useMemo(
    () => messages.some(message => message.role === 'user'),
    [messages],
  )
  const isDeepResearchFollowUpLocked = isDeepResearchConversation && hasDeepResearchHistory
  const isDeepResearchInputLocked = isDeepResearchFollowUpLocked && editingIndex === null

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
      setEditingTargetTimestamp(msg.created_at || null)
      setEditingTargetId(msg.id || null)
      const nextMsg = messages[index + 1]
      const hasPartner = nextMsg && nextMsg.role === 'ai'
      setEditingPartnerTimestamp(hasPartner ? nextMsg.created_at || null : null)
      setEditingPartnerId(hasPartner ? nextMsg.id || null : null)
    },
    [messages],
  )

  const handleSendMessage = useCallback(
    async (
      msgOverride = null,
      attOverride = null,
      togglesOverride = null,
      { skipMeta = false, editingInfoOverride = null } = {},
    ) => {
      const textToSend = msgOverride !== null ? msgOverride : ''
      const attToSend = attOverride !== null ? attOverride : []
      const searchActive = togglesOverride ? togglesOverride.search : isSearchActive
      const thinkingActive = togglesOverride ? togglesOverride.thinking : isThinkingActive
      const deepResearchActive = togglesOverride
        ? togglesOverride.deepResearch
        : isDeepResearchActive
      const relatedActive = deepResearchActive
        ? false
        : togglesOverride
          ? togglesOverride.related
          : isRelatedEnabled
      const resolvedThinkingActive = deepResearchActive ? false : thinkingActive

      const isEditing = Boolean(editingInfoOverride || editingIndex !== null)
      if (isDeepResearchFollowUpLocked && !isEditing) return

      if (!textToSend.trim() && attToSend.length === 0) return
      if (isLoading) return

      const editingInfo =
        editingInfoOverride ||
        (editingIndex !== null
          ? {
              index: editingIndex,
              targetId: editingTargetId,
              partnerId: editingPartnerId,
            }
          : null)

      // Reset editing state
      setEditingIndex(null)
      setEditingTargetTimestamp(null)
      setEditingPartnerTimestamp(null)
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

      const resolvedDeepResearchAgent =
        deepResearchActive && deepResearchAgent ? deepResearchAgent : null
      const agentForSend =
        resolvedDeepResearchAgent ||
        selectedAgent ||
        (!isAgentAutoMode && initialAgentSelection) ||
        defaultAgent ||
        null
      const agentAutoModeForSend = deepResearchActive ? false : isAgentAutoMode

      await sendMessage({
        text: textToSend,
        attachments: attToSend,
        toggles: {
          search: searchActive,
          thinking: resolvedThinkingActive,
          deepResearch: deepResearchActive,
          related: relatedActive,
        },
        settings,
        spaceInfo: { selectedSpace, isManualSpaceSelection },
        selectedAgent: agentForSend,
        isAgentAutoMode: agentAutoModeForSend,
        agents: appAgents,
        editingInfo,
        callbacks: {
          onTitleAndSpaceGenerated,
          onSpaceResolved: space => {
            setSelectedSpace(space)
            setIsManualSpaceSelection(false)
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
      isDeepResearchActive,
      isDeepResearchFollowUpLocked,
      isRelatedEnabled,
      isLoading,
      editingIndex,
      editingTargetId,
      editingPartnerId,
      sendMessage,
      settings,
      selectedSpace,
      effectiveAgent,
      isAgentAutoMode,
      deepResearchAgent,
      defaultAgent,
      isManualSpaceSelection,
      onTitleAndSpaceGenerated,
      spaces,
      quoteContext,
      appAgents,
      spaceAgentIds,
      spaceAgents,
    ],
  )

  const handleRelatedClick = useCallback(
    q => {
      if (isDeepResearchFollowUpLocked) return
      handleSendMessage(q, [], null, { skipMeta: true })
    },
    [handleSendMessage, isDeepResearchFollowUpLocked],
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

  const handleRegenerateQuestion = useCallback(() => {
    if (isLoading) return

    const lastUserIndex = [...messages]
      .map((m, idx) => (m.role === 'user' ? idx : -1))
      .filter(idx => idx !== -1)
      .pop()

    if (lastUserIndex === undefined || lastUserIndex === -1) return

    const userMsg = messages[lastUserIndex]
    const nextMsg = messages[lastUserIndex + 1]
    const hasPartner = nextMsg && nextMsg.role === 'ai'

    const msgAttachments = Array.isArray(userMsg.content)
      ? userMsg.content.filter(c => c.type === 'image_url')
      : []

    const text = extractUserQuestion(userMsg)
    if (!text.trim() && msgAttachments.length === 0) return

    const editingInfoOverride = {
      index: lastUserIndex,
      targetId: userMsg.id || null,
      partnerId: hasPartner ? nextMsg.id || null : null,
    }

    handleSendMessage(text, msgAttachments, null, { editingInfoOverride })
  }, [extractUserQuestion, handleSendMessage, isLoading, messages])

  const handleResendMessage = useCallback(
    userIndex => {
      if (isLoading) return

      const userMsg = messages[userIndex]
      if (!userMsg || userMsg.role !== 'user') return

      const nextMsg = messages[userIndex + 1]
      const hasPartner = nextMsg && nextMsg.role === 'ai'

      const msgAttachments = Array.isArray(userMsg.content)
        ? userMsg.content.filter(c => c.type === 'image_url')
        : []

      const text = extractUserQuestion(userMsg)
      if (!text.trim() && msgAttachments.length === 0) return

      const editingInfoOverride = {
        index: userIndex,
        targetId: userMsg.id || null,
        partnerId: hasPartner ? nextMsg.id || null : null,
      }

      handleSendMessage(text, msgAttachments, null, { editingInfoOverride })
    },
    [extractUserQuestion, handleSendMessage, isLoading, messages],
  )

  const handleRegenerateAnswer = useCallback(
    aiIndex => {
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

      const editingInfoOverride = {
        index: userIndex,
        targetId: userMsg.id || null,
        partnerId: aiMsg.id || null,
      }

      handleSendMessage(text, msgAttachments, null, { editingInfoOverride })
    },

    [
      extractUserQuestion,
      handleSendMessage,
      isLoading,
      messages,
      setEditingIndex,
      setEditingPartnerId,
      setEditingPartnerTimestamp,
      setEditingTargetId,
      setEditingTargetTimestamp,
    ],
  )

  const handleDeleteMessage = useCallback(
    async index => {
      if (isLoading) return
      const target = messages[index]
      if (!target) return

      if (target.id) {
        try {
          await deleteMessageById(target.id)
        } catch (err) {
          console.error('Failed to delete message:', err)
        }
      }

      setMessages(prev => prev.filter((_, idx) => idx !== index))

      if (editingIndex !== null) {
        if (editingIndex === index) {
          setEditingIndex(null)
          setEditingSeed({ text: '', attachments: [] })
          setEditingTargetId(null)
          setEditingTargetTimestamp(null)
          setEditingPartnerId(null)
          setEditingPartnerTimestamp(null)
        } else if (editingIndex > index) {
          setEditingIndex(editingIndex - 1)
        }
      }

      if (editingTargetId && target.id === editingTargetId) {
        setEditingTargetId(null)
        setEditingTargetTimestamp(null)
      }

      if (editingPartnerId && target.id === editingPartnerId) {
        setEditingPartnerId(null)
        setEditingPartnerTimestamp(null)
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
      setEditingPartnerTimestamp,
      setEditingTargetId,
      setEditingTargetTimestamp,
    ],
  )

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

  // Handle scroll to show/hide button
  useEffect(() => {
    const handleScroll = () => {
      if (messagesContainerRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
        setShowScrollButton(!isNearBottom)
      }
    }

    // Run once on mount to set initial state
    handleScroll()

    const container = messagesContainerRef.current
    if (container) {
      container.addEventListener('scroll', handleScroll)
      return () => container.removeEventListener('scroll', handleScroll)
    }
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
      const newTitle = await provider.generateTitle(
        contextText,
        credentials.apiKey,
        credentials.baseUrl,
        modelConfig.model,
      )
      if (!newTitle) return
      setConversationTitle(newTitle)
      const convId = conversationId || activeConversation?.id
      if (convId) {
        await updateConversation(convId, { title: newTitle })
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
  const inputAgent =
    isDeepResearchConversation && deepResearchAgent ? deepResearchAgent : selectedAgent
  const inputAgentAutoMode = isDeepResearchConversation ? false : isAgentAutoMode

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
        <div className="shrink-0 z-20 w-full border-b border-gray-200 dark:border-zinc-800 bg-background/80 backdrop-blur-md pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] transition-all flex justify-center">
          <div className="w-full max-w-3xl flex items-center gap-1 px-3">
            {/* Mobile Menu Button */}
            <button
              onClick={toggleSidebar}
              className="md:hidden p-2 -ml-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg shrink-0"
            >
              <Menu size={20} />
            </button>

            {/* Space Selector */}
            <div className="relative" ref={selectorRef}>
              <button
                onMouseDown={e => {
                  e.stopPropagation()
                  if (isDeepResearchConversation) return
                  setIsSelectorOpen(prev => !prev)
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm font-medium text-gray-700 dark:text-gray-300 ${
                  isDeepResearchConversation
                    ? 'opacity-60 cursor-not-allowed'
                    : 'hover:bg-gray-100 dark:hover:bg-zinc-800'
                }`}
              >
                <LayoutGrid size={16} className="text-gray-400 hidden sm:inline" />
                {isMetaLoading ? (
                  <span className="text-gray-500 animate-pulse">...</span>
                ) : displaySpace ? (
                  <div className="flex items-center gap-1">
                    <span className="text-lg">
                      <EmojiDisplay emoji={displaySpace.emoji} size="1.125rem" />
                    </span>
                    <span className="hidden opacity-0 w-0 md:inline md:opacity-100 md:w-auto truncate max-w-[200px] transition-all">
                      {getSpaceDisplayLabel(displaySpace, t)}
                    </span>
                  </div>
                ) : (
                  <span className="text-gray-500 text-xs sm:text-s">None</span>
                )}
                <ChevronDown size={14} className="text-gray-400" />
              </button>

              {/* Dropdown */}
              {isSelectorOpen && (
                <div
                  className="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-[#202222] border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl z-30 overflow-hidden"
                  onMouseDown={e => e.stopPropagation()}
                >
                  <div className="p-2 flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={handleClearSpaceSelection}
                      className={`flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left ${
                        !displaySpace ? 'text-primary-500' : 'text-gray-700 dark:text-gray-200'
                      }`}
                    >
                      <span className="text-sm font-medium">None</span>
                      {!displaySpace && <Check size={14} className="text-primary-500" />}
                    </button>
                    <div className="h-px bg-gray-100 dark:bg-zinc-800 my-1" />
                    {availableSpaces.map((space, idx) => {
                      const isSelected = selectedSpace?.label === space.label
                      return (
                        <button
                          type="button"
                          key={idx}
                          onClick={() => handleSelectSpace(space)}
                          className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg">
                              <EmojiDisplay emoji={space.emoji} size="1.125rem" />
                            </span>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                              {getSpaceDisplayLabel(space, t)}
                            </span>
                          </div>
                          {isSelected && <Check size={14} className="text-primary-500" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-1 min-w-0">
              <h1 className="text-m sm:text-xl font-medium text-gray-800 dark:text-gray-100 truncate flex items-center gap-2">
                {isMetaLoading ? (
                  <span className="inline-block h-5 w-40 sm:w-56 rounded-md bg-gray-200 dark:bg-zinc-700 animate-pulse" />
                ) : (
                  conversationTitle || 'New Conversation'
                )}
                {isRegeneratingTitle && <span className="animate-pulse">...</span>}
              </h1>
              <button
                onClick={handleRegenerateTitle}
                disabled={isRegeneratingTitle || messages.length === 0}
                className="hidden sm:block p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                title={t('chatInterface.regenerateTitle')}
              >
                <Sparkles size={18} />
              </button>
            </div>

            {/* Timeline Button - only show on screens where sidebar can be toggled (xl and below) */}
            {/* Timeline Button - only show on screens where sidebar can be toggled (xl and below), and hide when open */}
            {!isTimelineSidebarOpen && (
              <button
                onClick={() => setIsTimelineSidebarOpen(true)}
                className="xl:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-600 dark:text-gray-300 transition-colors shrink-0"
                title={t('chatInterface.openTimeline')}
              >
                <PanelRightOpen size={20} />
              </button>
            )}
          </div>
        </div>

        {/* Messages Scroll Container */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto sm:p-2 relative no-scrollbar"
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
              onResend={handleResendMessage}
              onDelete={handleDeleteMessage}
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
        <QuestionTimelineSidebar
          items={questionNavItems}
          onJump={jumpToMessage}
          activeId={activeQuestionId}
          isOpen={isTimelineSidebarOpen}
          onToggle={setIsTimelineSidebarOpen}
        />

        {/* Input Area */}
        {!isDeepResearchInputLocked && (
          <div className="w-full shrink-0 bg-background pt-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))] px-2 sm:px-0 flex justify-center z-20">
            <div className="w-full max-w-3xl relative">
              {/* Scroll to bottom button - positioned relative to input area */}
              {showScrollButton && (
                <button
                  onClick={() => scrollToBottom('smooth')}
                  className="absolute bottom-40 left-1/2 -translate-x-1/2 p-2 bg-background border border-border rounded-full shadow-lg hover:bg-muted transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 z-30"
                >
                  <ArrowDown size={20} className="text-foreground" />
                </button>
              )}

              <InputBar
                isLoading={isLoading}
                apiProvider={effectiveProvider}
                isSearchActive={isSearchActive}
                isThinkingActive={isThinkingActive}
                isThinkingLocked={isThinkingLocked}
                isFollowUpLocked={isDeepResearchInputLocked}
                agents={selectableAgents}
                agentsLoading={isAgentsLoading}
                agentsLoadingLabel={agentsLoadingLabel}
                agentsLoadingDots={agentLoadingDots}
                selectedAgent={inputAgent}
                isAgentAutoMode={inputAgentAutoMode}
                isAgentSelectionLocked={isDeepResearchConversation}
                onAgentSelect={agent => {
                  if (isDeepResearchConversation) return
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
                  if (isDeepResearchConversation) return
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
                  if (isDeepResearchConversation) return
                  setIsAgentSelectorOpen(prev => !prev)
                }}
                agentSelectorRef={agentSelectorRef}
                onToggleSearch={() => setIsSearchActive(prev => !prev)}
                onToggleThinking={() =>
                  setIsThinkingActive(prev => {
                    const next = !prev
                    if (next) setIsDeepResearchActive(false)
                    return next
                  })
                }
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
              />
              <div className="text-center mt-2 text-xs text-gray-400 dark:text-gray-500">
                Qurio can make mistakes. Please use with caution.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ChatInterface

const InputBar = React.memo(
  ({
    isLoading,
    apiProvider,
    isSearchActive,
    isThinkingActive,
    isThinkingLocked,
    isFollowUpLocked,
    agents,
    agentsLoading,
    agentsLoadingLabel,
    agentsLoadingDots,
    selectedAgent,
    isAgentAutoMode,
    isAgentSelectionLocked,
    onAgentSelect,
    onAgentAutoModeToggle,
    isAgentSelectorOpen,
    onAgentSelectorToggle,
    agentSelectorRef,
    onToggleSearch,
    onToggleThinking,
    quotedText,
    onQuoteClear,
    onSend,
    editingSeed,
    onEditingClear,
    showEditing,
    editingLabel,
    scrollToBottom,
    spacePrimaryAgentId,
  }) => {
    const { t } = useTranslation()
    const [inputValue, setInputValue] = useState('')
    const [attachments, setAttachments] = useState([])
    const textareaRef = useRef(null)
    const fileInputRef = useRef(null)
    const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false)
    const uploadMenuRef = useRef(null)

    useEffect(() => {
      setInputValue(editingSeed?.text || '')
      setAttachments(editingSeed?.attachments || [])
      if (editingSeed?.text || (editingSeed?.attachments || []).length > 0) {
        window.requestAnimationFrame(() => textareaRef.current?.focus())
      }
    }, [editingSeed])

    React.useLayoutEffect(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
      }
    }, [inputValue])

    useEffect(() => {
      if (!isUploadMenuOpen) return
      const handleClickOutside = event => {
        if (uploadMenuRef.current && !uploadMenuRef.current.contains(event.target)) {
          setIsUploadMenuOpen(false)
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isUploadMenuOpen])

    const handleFileChange = e => {
      const files = Array.from(e.target.files)
      if (files.length === 0) return

      files.forEach(file => {
        if (!file.type.startsWith('image/')) return

        const reader = new FileReader()
        reader.onload = evt => {
          setAttachments(prev => [
            ...prev,
            {
              type: 'image_url',
              image_url: { url: evt.target.result },
            },
          ])
        }
        reader.readAsDataURL(file)
      })

      e.target.value = ''
    }

    const handleUploadImage = () => {
      setIsUploadMenuOpen(false)
      fileInputRef.current?.click()
    }

    const handleSend = () => {
      if (isFollowUpLocked || isLoading) return
      const text = inputValue
      const hasContent = text.trim() || attachments.length > 0
      if (!hasContent) return
      onSend(text, attachments)
      setInputValue('')
      setAttachments([])
      onEditingClear?.()
      scrollToBottom('auto')
    }

    const handleKeyDown = e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    }

    return (
      <div className="w-full max-w-3xl relative group">
        <div className="absolute inset-0 input-glow-veil rounded-xl blur-2xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-500 pointer-events-none" />
        <div className="relative bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700/50 focus-within:border-primary-500/50 rounded-2xl transition-all duration-300 p-3 shadow-md hover:shadow-lg group-hover:shadow-lg focus-within:shadow-xl">
          {showEditing && (
            <div className="flex items-center justify-between bg-gray-200 dark:bg-zinc-700/50 rounded-lg px-3 py-2 mb-2 ">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-primary-600 dark:text-primary-400 uppercase tracking-wide">
                    Editing
                  </span>
                  <span className="text-sm text-gray-600 dark:text-gray-300 truncate max-w-[200px] md:max-w-md">
                    {editingLabel}
                  </span>
                </div>
              </div>
              <button
                onClick={() => onEditingClear?.()}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors rounded-full hover:bg-gray-300 dark:hover:bg-zinc-600"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {quotedText && (
            <div className="flex items-center justify-between bg-gray-200 dark:bg-zinc-700/50 rounded-lg px-3 py-2 mb-2">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-primary-600 dark:text-primary-400 uppercase tracking-wide">
                    Quote
                  </span>
                  <span className="text-sm text-gray-600 dark:text-gray-300 truncate max-w-[200px] md:max-w-md italic">
                    &quot;{quotedText}&quot;
                  </span>
                </div>
              </div>
              <button
                onClick={onQuoteClear}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors rounded-full hover:bg-gray-300 dark:hover:bg-zinc-600"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {attachments.length > 0 && (
            <div className="flex gap-2 mb-3 px-1 overflow-x-auto py-1">
              {attachments.map((att, idx) => (
                <div key={idx} className="relative group shrink-0">
                  <div className="w-16 h-16 rounded-xl overflow-hidden border border-gray-200 dark:border-zinc-700 shadow-sm">
                    <img
                      src={att.image_url.url}
                      alt="attachment"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <button
                    onClick={() => setAttachments(attachments.filter((_, i) => i !== idx))}
                    className="absolute -top-1.5 -right-1.5 bg-gray-900 text-white rounded-full p-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow-md"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            id="chat-input-textarea"
            value={inputValue}
            ref={textareaRef}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isFollowUpLocked
                ? t('chatInterface.deepResearchSingleTurn')
                : t('chatInterface.askFollowUp')
            }
            disabled={isFollowUpLocked}
            className="w-full bg-transparent border-none outline-none resize-none text-base placeholder-gray-500 dark:placeholder-gray-400 min-h-[44px] max-h-[200px] overflow-y-auto py-2 disabled:cursor-not-allowed"
            rows={1}
          />

          <div className="flex justify-between items-center mt-2">
            <div className="flex gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                multiple
                className="hidden"
              />
              <div className="relative" ref={uploadMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsUploadMenuOpen(prev => !prev)}
                  className={`p-2 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${
                    attachments.length > 0 ? 'text-primary-500' : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <Paperclip size={18} />
                </button>
                {isUploadMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-48 bg-white dark:bg-[#202222] border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl z-30 overflow-hidden">
                    <div className="p-2 flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={handleUploadImage}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left text-sm text-gray-700 dark:text-gray-200"
                      >
                        <Image size={16} />
                        {t('common.uploadImage')}
                      </button>
                      <button
                        type="button"
                        disabled
                        onClick={() => setIsUploadMenuOpen(false)}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left text-sm text-gray-400 dark:text-gray-500 cursor-not-allowed"
                      >
                        <FileText size={16} />
                        {t('common.uploadDocument')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <button
                disabled={isThinkingLocked}
                onClick={onToggleThinking}
                className={`p-2 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${
                  isThinkingActive
                    ? 'text-primary-500 bg-gray-200 dark:bg-zinc-700'
                    : 'text-gray-500 dark:text-gray-400'
                } ${isThinkingLocked ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-200 dark:hover:bg-zinc-700'}`}
              >
                <Brain size={18} />
                <span className="hidden md:inline">{t('homeView.think')}</span>
              </button>
              <button
                disabled={!apiProvider || !providerSupportsSearch(apiProvider)}
                onClick={onToggleSearch}
                className={`p-2 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${
                  isSearchActive
                    ? 'text-primary-500 bg-gray-200 dark:bg-zinc-700'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                <Globe size={18} />
                <span className="hidden md:inline">{t('homeView.search')}</span>
              </button>
              <div className="relative" ref={agentSelectorRef}>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    e.preventDefault()
                    onAgentSelectorToggle()
                  }}
                  className={`p-2 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${
                    selectedAgent || isAgentAutoMode
                      ? 'text-primary-500 bg-gray-200 dark:bg-zinc-700'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                  disabled={agentsLoading || isAgentSelectionLocked}
                >
                  {isAgentAutoMode || !selectedAgent ? (
                    <Smile size={18} />
                  ) : (
                    <EmojiDisplay emoji={selectedAgent.emoji} size="1.125rem" />
                  )}
                  {agentsLoading && (
                    <span className="inline-flex text-[10px] leading-none opacity-70 animate-pulse">
                      {agentsLoadingDots || '...'}
                    </span>
                  )}
                  <span className="hidden md:inline truncate max-w-[120px]">
                    {agentsLoading
                      ? agentsLoadingLabel || t('chatInterface.agentsLoading')
                      : isAgentAutoMode
                        ? t('chatInterface.agentAuto')
                        : getAgentDisplayName(selectedAgent, t) || t('chatInterface.agentsLabel')}
                  </span>
                  <ChevronDown size={14} />
                </button>
                {isAgentSelectorOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-56 bg-white dark:bg-[#202222] border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl z-30 overflow-hidden">
                    <div className="p-2 flex flex-col gap-1">
                      {/* Auto mode option */}
                      <button
                        type="button"
                        onClick={() => onAgentAutoModeToggle()}
                        className={`flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left ${
                          isAgentAutoMode ? 'text-primary-500' : 'text-gray-700 dark:text-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg">🤖</span>
                          <span className="text-sm font-medium truncate">
                            {t('chatInterface.agentAuto')}
                          </span>
                        </div>
                        {isAgentAutoMode && <Check size={14} className="text-primary-500" />}
                      </button>
                      <div className="h-px bg-gray-100 dark:bg-zinc-800 my-1" />
                      {/* Manual agent options */}
                      {agents.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                          {t('chatInterface.agentsNone')}
                        </div>
                      ) : (
                        agents.map(agent => {
                          const isSelected = !isAgentAutoMode && selectedAgent?.id === agent.id
                          const isDefault =
                            agent.isDefault || String(agent.id) === String(spacePrimaryAgentId)
                          return (
                            <button
                              key={agent.id}
                              type="button"
                              onClick={() => onAgentSelect(agent)}
                              className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-lg">
                                  <EmojiDisplay emoji={agent.emoji} size="1.125rem" />
                                </span>
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                                  {getAgentDisplayName(agent, t)}
                                </span>
                                {isDefault && (
                                  <span className="text-xs px-1.5 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-md font-medium">
                                    {t('chatInterface.default')}
                                  </span>
                                )}
                              </div>
                              {isSelected && <Check size={14} className="text-primary-500" />}
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSend}
                disabled={
                  isFollowUpLocked || isLoading || (!inputValue.trim() && attachments.length === 0)
                }
                className="p-2 bg-primary-500 dark:bg-primary-800 hover:bg-primary-600 text-white rounded-full transition-colors disabled:opacity-50  disabled:hover:bg-primary-500"
              >
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  },
)

InputBar.displayName = 'InputBar'
