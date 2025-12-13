import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from '@tanstack/react-router'
import { useShallow } from 'zustand/react/shallow'
import useChatStore from '../lib/chatStore'
import MessageList from './MessageList'
import FancyLoader from './FancyLoader'
import QuestionNavigator from './QuestionNavigator'
import { updateConversation } from '../lib/conversationsService'
import { getProvider } from '../lib/providers'
import { getModelForTask } from '../lib/modelSelector.js'
import {
  Paperclip,
  ArrowRight,
  Globe,
  ChevronDown,
  Check,
  X,
  LayoutGrid,
  Brain,
  Sparkles,
  ArrowDown,
  Menu,
} from 'lucide-react'
import clsx from 'clsx'
import { useAppContext } from '../App'

import { loadSettings } from '../lib/settings'
import { listMessages } from '../lib/conversationsService'
import TwemojiDisplay from './TwemojiDisplay'

const ChatInterface = ({
  spaces = [],
  activeConversation = null,
  initialMessage = '',
  initialAttachments = [],
  initialToggles = {},
  initialSpaceSelection = { mode: 'auto', space: null },
  onTitleAndSpaceGenerated,
  isSidebarPinned = false,
}) => {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    messages,
    setMessages,
    conversationId,
    setConversationId,
    conversationTitle,
    setConversationTitle,
    isLoading,
    setIsLoading,
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

  const [selectedSpace, setSelectedSpace] = useState(
    initialSpaceSelection.mode === 'manual' ? initialSpaceSelection.space : null,
  )
  const [isSelectorOpen, setIsSelectorOpen] = useState(false)
  const selectorRef = useRef(null)
  const [isManualSpaceSelection, setIsManualSpaceSelection] = useState(
    initialSpaceSelection.mode === 'manual' && !!initialSpaceSelection.space,
  )

  const [settings, setSettings] = useState(loadSettings())
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const hasPushedConversation = useRef(false)
  const lastConversationId = useRef(null) // Track the last conversationId we navigated to
  const messageRefs = useRef({})
  const bottomRef = useRef(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [isRegeneratingTitle, setIsRegeneratingTitle] = useState(false)
  const conversationSpace = React.useMemo(() => {
    if (!activeConversation?.space_id) return null
    const sid = String(activeConversation.space_id)
    return spaces.find(s => String(s.id) === sid) || null
  }, [activeConversation?.space_id, spaces])

  // If user has manually selected a space (or None), use that; otherwise use conversation's space
  const displaySpace = isManualSpaceSelection
    ? selectedSpace
    : selectedSpace || conversationSpace || null

  // Effect to handle initial message from homepage
  const hasInitialized = useRef(false)
  const isProcessingInitial = useRef(false)

  useEffect(() => {
    const handleSettingsChange = () => {
      setSettings(loadSettings())
      if (
        settings.apiProvider === 'openai_compatibility' ||
        settings.apiProvider === 'siliconflow'
      ) {
        setIsSearchActive(false)
      }
    }

    window.addEventListener('settings-changed', handleSettingsChange)
    return () => window.removeEventListener('settings-changed', handleSettingsChange)
  }, [])

  useEffect(() => {
    const processInitialMessage = async () => {
      // Prevent multiple initializations and ensure we have content to process
      if (
        hasInitialized.current ||
        isProcessingInitial.current ||
        (!initialMessage && initialAttachments.length === 0) ||
        conversationId || // Already have a conversation, don't create new one
        activeConversation?.id // If an existing conversation is provided, skip auto-send
      ) {
        return
      }

      isProcessingInitial.current = true
      hasInitialized.current = true

      // Set initial state
      // Set initial state
      if (initialToggles.search) setIsSearchActive(true)
      if (initialToggles.thinking) setIsThinkingActive(true)

      // Trigger send immediately
      await handleSendMessage(initialMessage, initialAttachments, initialToggles)
      isProcessingInitial.current = false
    }

    processInitialMessage()
  }, [initialMessage, initialAttachments, initialToggles, conversationId, activeConversation?.id])

  // Load existing conversation messages when switching conversations
  useEffect(() => {
    const loadHistory = async () => {
      if (!activeConversation?.id) {
        // When switching to new chat, always clear conversationId and reset navigation flag
        // This ensures that when a new conversation is created, it can navigate correctly

        // If we're switching from an old conversation (conversationId is not null),
        // we should clear the old messages even if we have initialMessage
        const isFromOldConversation = conversationId !== null

        setIsLoadingHistory(false)
        setConversationId(null)
        hasPushedConversation.current = false

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
        setSelectedSpace(null)
        setIsManualSpaceSelection(false)
        return
      }

      // If we're navigating to a conversation that we just created (conversationId matches),
      // check if we already have messages in the store
      if (activeConversation.id === conversationId && messages.length > 0) {
        // We already have messages (they're being streamed or just completed)
        // Just update the title and space from the loaded conversation data
        setConversationTitle(activeConversation.title || 'New Conversation')
        setSelectedSpace(conversationSpace)
        setIsManualSpaceSelection(!!conversationSpace)
        return
      }

      // Reset hasInitialized when loading an existing conversation
      hasInitialized.current = false

      setIsLoadingHistory(true)
      if (activeConversation.id !== conversationId) {
        // Clear stale messages while the new conversation history loads
        setMessages([])
      }
      setConversationId(activeConversation.id)
      setConversationTitle(activeConversation.title || 'New Conversation')
      setSelectedSpace(conversationSpace)
      setIsManualSpaceSelection(!!conversationSpace)
      const { data, error } = await listMessages(activeConversation.id)
      if (!error && data) {
        const mapped = data.map(m => {
          const { content: cleanedContent, thought: thoughtFromContent } = splitThoughtFromContent(
            m.content,
          )
          const thought = m.thinking_process ?? m.thought ?? thoughtFromContent ?? undefined

          return {
            id: m.id,
            created_at: m.created_at,
            role: m.role === 'assistant' ? 'ai' : m.role,
            content: cleanedContent,
            thought,
            related: m.related_questions || undefined,
            tool_calls: m.tool_calls || undefined,
            sources: m.sources || undefined,
            groundingSupports: m.grounding_supports || undefined,
            thinkingEnabled:
              m.is_thinking_enabled ?? m.generated_with_thinking ?? (thought ? true : undefined),
          }
        })
        setMessages(mapped)
      } else {
        console.error('Failed to load conversation messages:', error)
        setMessages([])
      }
      setIsLoadingHistory(false)
    }
    loadHistory()
  }, [activeConversation, conversationSpace])

  useEffect(() => {
    // Check if conversationId has changed (new conversation created)
    const idChanged = conversationId !== lastConversationId.current
    if (idChanged) {
      lastConversationId.current = conversationId
      // Reset the flag when conversationId changes to allow navigation to the new conversation
      hasPushedConversation.current = false
    }

    // Check if we're on a new chat page (not on a specific conversation route)
    const isOnNewChatPage = location.pathname === '/new_chat' || location.pathname === '/'

    // Only navigate if we have a conversationId AND it has just changed (to avoid navigating on stale IDs)
    const shouldNavigate =
      conversationId && isOnNewChatPage && !hasPushedConversation.current && idChanged

    if (shouldNavigate) {
      navigate({
        to: '/conversation/$conversationId',
        params: { conversationId: String(conversationId) },
        replace: true,
      })
      hasPushedConversation.current = true
    }
  }, [conversationId, location.pathname, navigate])

  useEffect(() => {
    if (initialSpaceSelection?.mode === 'manual' && initialSpaceSelection.space) {
      setSelectedSpace(initialSpaceSelection.space)
      setIsManualSpaceSelection(true)
    } else if (initialSpaceSelection?.mode === 'auto') {
      setSelectedSpace(null)
      setIsManualSpaceSelection(false)
    }
  }, [initialSpaceSelection])

  // Handle click outside to close selector
  useEffect(() => {
    const handleClickOutside = event => {
      if (selectorRef.current && !selectorRef.current.contains(event.target)) {
        setIsSelectorOpen(false)
      }
    }

    if (isSelectorOpen) {
      document.addEventListener('click', handleClickOutside)
    }

    return () => {
      document.removeEventListener('click', handleClickOutside)
    }
  }, [isSelectorOpen])

  const handleSelectSpace = space => {
    setSelectedSpace(space)
    setIsManualSpaceSelection(true)
    setIsSelectorOpen(false)
    if (conversationId || activeConversation?.id) {
      updateConversation(conversationId || activeConversation.id, {
        space_id: space?.id || null,
      })
        .then(() => {
          // Trigger event to refresh sidebar
          window.dispatchEvent(new Event('conversations-changed'))
        })
        .catch(err => console.error('Failed to update conversation space:', err))
    }
  }

  const handleClearSpaceSelection = () => {
    setSelectedSpace(null)
    setIsManualSpaceSelection(true) // Keep as true because selecting "None" is a manual action
    setIsSelectorOpen(false)
    if (conversationId || activeConversation?.id) {
      updateConversation(conversationId || activeConversation.id, {
        space_id: null,
      })
        .then(() => {
          // Trigger event to refresh sidebar
          window.dispatchEvent(new Event('conversations-changed'))
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
    if (!node) return

    // Calculate position with offset for sticky header
    const yOffset = -100 // Adjust based on your header height
    const y = node.getBoundingClientRect().top + window.pageYOffset + yOffset

    window.scrollTo({ top: y, behavior: 'smooth' })
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
      root: null,
      rootMargin: '-10% 0px -60% 0px', // Trigger when element is near the top
      threshold: [0.1],
    })

    Object.values(messageRefs.current).forEach(el => {
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [messages])

  const questionNavItems = React.useMemo(
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
          }
        })
        .filter(Boolean),
    [messages],
  )

  // Scroll to bottom helper
  const scrollToBottom = useCallback((behavior = 'smooth') => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior,
    })
  }, [])

  // State to track if we are editing a message
  const [editingIndex, setEditingIndex] = useState(null)
  const [editingTargetTimestamp, setEditingTargetTimestamp] = useState(null)
  const [editingPartnerTimestamp, setEditingPartnerTimestamp] = useState(null)
  const [editingTargetId, setEditingTargetId] = useState(null)
  const [editingPartnerId, setEditingPartnerId] = useState(null)

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

      await sendMessage({
        text: textToSend,
        attachments: attToSend,
        toggles: { search: searchActive, thinking: thinkingActive },
        settings,
        spaceInfo: { selectedSpace, isManualSpaceSelection },
        editingInfo,
        callbacks: {
          onTitleAndSpaceGenerated,
          onSpaceResolved: space => {
            setSelectedSpace(space)
            setIsManualSpaceSelection(false)
          },
        },
        spaces,
        quoteContext: quoteContextForSend,
      })
    },
    [
      isSearchActive,
      isThinkingActive,
      isLoading,
      editingIndex,
      editingTargetId,
      editingPartnerId,
      sendMessage,
      settings,
      selectedSpace,
      isManualSpaceSelection,
      onTitleAndSpaceGenerated,
      spaces,
      quoteContext,
    ],
  )

  const handleRelatedClick = useCallback(
    q => handleSendMessage(q, [], null, { skipMeta: true }),
    [handleSendMessage],
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
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
      setShowScrollButton(!isNearBottom)
    }

    // Run once on mount to set initial state
    handleScroll()
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
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
      const provider = getProvider(settings.apiProvider)
      const credentials = provider.getCredentials(settings)
      const model = getModelForTask('generateTitle', settings)
      const newTitle = await provider.generateTitle(
        contextText,
        credentials.apiKey,
        credentials.baseUrl,
        model,
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
    isRegeneratingTitle,
    messages,
    settings,
    setConversationTitle,
  ])

  const { toggleSidebar } = useAppContext()

  return (
    <div
      className={clsx(
        'flex-1 min-h-screen bg-background text-foreground relative pb-4 transition-all duration-300',
        isSidebarPinned ? 'md:ml-20' : 'md:ml-16',
      )}
    >
      <div className="w-full max-w-3xl mx-auto relative">
        <div className="flex flex-col w-full">
          {/* Title Bar */}
          <div className="sticky top-0 z-20 w-full max-w-8xl border-b border-gray-200 dark:border-zinc-800 bg-background/80 backdrop-blur-md py-2 mb-3 transition-all flex items-center gap-1 px-5 md:px-0">
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
                onClick={() => setIsSelectorOpen(!isSelectorOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <LayoutGrid size={16} className="text-gray-400 hidden sm:inline" />
                {displaySpace ? (
                  <div className="flex items-center gap-1">
                    <span className="text-lg">
                      <TwemojiDisplay emoji={displaySpace.emoji} size="1.125rem" />
                    </span>
                    <span className="hidden opacity-0 w-0 md:inline md:opacity-100 md:w-auto truncate max-w-[200px] transition-all">
                      {displaySpace.label}
                    </span>
                  </div>
                ) : (
                  <span className="text-gray-500 text-xs sm:text-s">None</span>
                )}
                <ChevronDown size={14} className="text-gray-400" />
              </button>

              {/* Dropdown */}
              {isSelectorOpen && (
                <div className="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-[#202222] border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl z-30 overflow-hidden">
                  <div className="p-2 flex flex-col gap-1">
                    <button
                      onClick={handleClearSpaceSelection}
                      className={`flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left ${
                        !displaySpace ? 'text-primary-500' : 'text-gray-700 dark:text-gray-200'
                      }`}
                    >
                      <span className="text-sm font-medium">None</span>
                      {!displaySpace && <Check size={14} className="text-primary-500" />}
                    </button>
                    <div className="h-px bg-gray-100 dark:bg-zinc-800 my-1" />
                    {spaces.map((space, idx) => {
                      const isSelected = selectedSpace?.label === space.label
                      return (
                        <button
                          key={idx}
                          onClick={() => handleSelectSpace(space)}
                          className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg">
                              <TwemojiDisplay emoji={space.emoji} size="1.125rem" />
                            </span>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                              {space.label}
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
              <h1 className="text-m sm:text-xl font-medium text-gray-800 dark:text-gray-100 truncate">
                {conversationTitle || 'New Conversation'}
              </h1>
              <button
                onClick={handleRegenerateTitle}
                disabled={isRegeneratingTitle || messages.length === 0}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                title="Regenerate title from last 3 messages"
              >
                <Sparkles size={18} />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="w-full max-w-3xl flex-1 pb-32 relative">
            {isLoadingHistory && (
              <div className="absolute inset-0 flex items-center justify-center backdrop-blur-md bg-background/40">
                <FancyLoader />
              </div>
            )}
            <MessageList
              apiProvider={settings.apiProvider}
              onRelatedClick={handleRelatedClick}
              onMessageRef={registerMessageRef}
              onEdit={handleEdit}
              onQuote={handleQuote}
              onRegenerateAnswer={handleRegenerateAnswer}
            />
            {/* Bottom Anchor */}
            <div ref={bottomRef} className="h-1" />
          </div>
        </div>

        {/* Right side navigator - absolute positioned relative to centered container on XL, stacked on mobile */}
        <div className="xl:absolute xl:left-full xl:top-0 xl:ml-8 xl:w-64 xl:h-full mt-8 xl:mt-0 w-full px-4 xl:px-0 flex flex-col">
          <div className="sticky top-24 max-h-[calc(100vh-10rem)] overflow-y-auto no-scrollbar">
            <QuestionNavigator
              items={questionNavItems}
              onJump={jumpToMessage}
              activeId={activeQuestionId}
            />
          </div>

          {showScrollButton && (
            <button
              onClick={() => scrollToBottom('smooth')}
              className="fixed bottom-50 left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:bottom-28 md:right-10 z-30 p-2 bg-background border border-border rounded-full shadow-lg hover:bg-muted transition-all duration-300 animate-in fade-in slide-in-from-bottom-2"
            >
              <ArrowDown size={20} className="text-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Sticky Input Area */}
      <div
        className={clsx(
          'fixed bottom-0 left-0 right-0 bg-linear-to-t from-background via-background to-transparent pb-6 pt-10 px-4 flex justify-center z-10 transition-all duration-300',
          isSidebarPinned ? 'md:left-20' : 'md:left-16',
        )}
      >
        <div className="w-full max-w-3xl">
          <InputBar
            isLoading={isLoading}
            apiProvider={settings.apiProvider}
            isSearchActive={isSearchActive}
            isThinkingActive={isThinkingActive}
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
            editingLabel={editingIndex !== null ? extractUserQuestion(messages[editingIndex]) : ''}
            scrollToBottom={scrollToBottom}
          />
          <div className="text-center mt-2 text-xs text-gray-400 dark:text-gray-500">
            Qurio can make mistakes. Please use with caution.
          </div>
        </div>
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
  }) => {
    const [inputValue, setInputValue] = useState('')
    const [attachments, setAttachments] = useState([])
    const textareaRef = useRef(null)
    const fileInputRef = useRef(null)

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

    const handleSend = () => {
      if (isLoading) return
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
        <div className="absolute inset-0 bg-linear-to-r from-primary-500/20 via-blue-500/15 to-purple-500/20 rounded-xl blur-2xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-500 pointer-events-none" />
        <div className="relative bg-user-bubble dark:bg-zinc-800 border border-transparent focus-within:border-gray-300 dark:focus-within:border-zinc-600 rounded-xl transition-all duration-300 p-3 shadow-sm hover:shadow-lg group-hover:shadow-lg focus-within:shadow-xl">
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
                    className="absolute -top-1.5 -right-1.5 bg-gray-900 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
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
            placeholder="Ask follow-up..."
            className="w-full bg-transparent border-none outline-none resize-none text-base placeholder-gray-500 dark:placeholder-gray-400 min-h-[44px] max-h-[200px] overflow-y-auto py-2"
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
              <button
                onClick={() => fileInputRef.current?.click()}
                className={`p-2 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${
                  attachments.length > 0 ? 'text-primary-500' : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                <Paperclip size={18} />
              </button>
              <button
                onClick={onToggleThinking}
                className={`p-2 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${
                  isThinkingActive
                    ? 'text-primary-500 bg-gray-200 dark:bg-zinc-700'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                <Brain size={18} />
                <span className="hidden md:inline">Think</span>
              </button>
              <button
                disabled={apiProvider === 'openai_compatibility' || apiProvider === 'siliconflow'}
                onClick={onToggleSearch}
                className={`p-2 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${
                  isSearchActive
                    ? 'text-primary-500 bg-gray-200 dark:bg-zinc-700'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                <Globe size={18} />
                <span className="hidden md:inline">Search</span>
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSend}
                disabled={isLoading || (!inputValue.trim() && attachments.length === 0)}
                className="p-2 bg-primary-500 hover:bg-primary-600 text-white rounded-full transition-colors disabled:opacity-50  disabled:hover:bg-primary-500"
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
