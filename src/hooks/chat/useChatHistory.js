import { useCallback, useEffect, useRef, useState } from 'react'
import { listMessages } from '../../lib/conversationsService'

// Internal helper function
const splitThoughtFromContent = rawContent => {
  if (rawContent && typeof rawContent === 'object' && !Array.isArray(rawContent)) {
    const contentValue = typeof rawContent.content !== 'undefined' ? rawContent.content : rawContent
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

  return { content, thought }
}

// Internal helper function
const mapMessageFromApi = (m, effectiveDefaultModel, activeConversation) => {
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
    toolCallHistory: m.tool_call_history || undefined,
    researchSteps: m.research_step_history || undefined,
    sources: m.sources || undefined,
    groundingSupports: m.grounding_supports || undefined,
    provider: m.provider || activeConversation?.api_provider,
    model: m.model || effectiveDefaultModel,
    agentId: m.agent_id ?? m.agentId ?? null,
    agentName: m.agent_name ?? m.agentName ?? null,
    agentEmoji: m.agent_emoji ?? m.agentEmoji ?? '',
    agentIsDefault: m.agent_is_default ?? m.agentIsDefault ?? false,
    documentSources: m.document_sources || undefined,
    thinkingEnabled:
      m.is_thinking_enabled ??
      m.generated_with_thinking ??
      (thought || researchPlan ? true : undefined),
  }
}

/**
 * useChatHistory Hook
 * Manages conversation history loading, message mapping, and loading state
 *
 * @param {object} params
 * @param {object} params.activeConversation - Current active conversation
 * @param {string} params.conversationId - Current conversation ID from store
 * @param {string} params.effectiveDefaultModel - Default model name
 * @param {boolean} params.isSwitchingConversation - Whether currently switching conversations
 *
 * @returns {object}
 * @property {boolean} isLoadingHistory - Whether history is currently loading
 * @property {boolean} showHistoryLoader - Whether to show the history loader UI
 * @property {function} loadConversationMessages - Function to load and map messages for a conversation
 * @property {function} hasLoadedMessages - Check if messages have been loaded for a conversation
 */
const useChatHistory = ({
  activeConversation,
  conversationId,
  effectiveDefaultModel,
  isSwitchingConversation,
}) => {
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [showHistoryLoader, setShowHistoryLoader] = useState(false)
  const historyLoaderTimeoutRef = useRef(null)
  const loadedMessagesRef = useRef(new Set())
  const lastLoadedConversationIdRef = useRef(null)

  // Handle history loader display with delay
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

    return () => {
      if (historyLoaderTimeoutRef.current) {
        clearTimeout(historyLoaderTimeoutRef.current)
      }
    }
  }, [isLoadingHistory, isSwitchingConversation])

  /**
   * Load messages for a conversation and map them to the internal format
   */
  const loadConversationMessages = useCallback(
    async convId => {
      if (!convId) {
        return { data: null, error: new Error('No conversation ID provided') }
      }

      setIsLoadingHistory(true)

      try {
        const { data, error } = await listMessages(convId)
        if (!error && data) {
          const mapped = data.map(m =>
            mapMessageFromApi(m, effectiveDefaultModel, activeConversation),
          )
          loadedMessagesRef.current.add(convId)
          lastLoadedConversationIdRef.current = convId
          setIsLoadingHistory(false)
          return { data: mapped, error: null }
        }
        setIsLoadingHistory(false)
        return { data: null, error }
      } catch (err) {
        console.error('Failed to load conversation messages:', err)
        setIsLoadingHistory(false)
        return { data: null, error: err }
      }
    },
    [effectiveDefaultModel, activeConversation],
  )

  /**
   * Check if messages have already been loaded for a conversation
   */
  const hasLoadedMessages = useCallback(convId => {
    return loadedMessagesRef.current.has(convId)
  }, [])

  return {
    isLoadingHistory,
    showHistoryLoader,
    loadConversationMessages,
    hasLoadedMessages,
    loadedMessagesRef,
    setIsLoadingHistory,
  }
}

export default useChatHistory
