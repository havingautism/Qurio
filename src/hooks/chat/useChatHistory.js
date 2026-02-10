import { useCallback, useEffect, useRef, useState } from 'react'
import { listMessages } from '../../lib/conversationsService'

const parseJsonIfString = raw => {
  if (typeof raw !== 'string') return raw
  const trimmed = raw.trim()
  if (!trimmed) return raw
  try {
    return JSON.parse(trimmed)
  } catch {
    return raw
  }
}

const asArrayField = raw => {
  const parsed = parseJsonIfString(raw)
  return Array.isArray(parsed) ? parsed : undefined
}

const normalizeStreamBlocks = raw => {
  if (!raw) return []
  const parsed = parseJsonIfString(raw)
  if (!Array.isArray(parsed)) return []
  return parsed
    .map((item, index) => ({
      seq: Number.isFinite(item?.seq) ? Number(item.seq) : index + 1,
      type: String(item?.type || '').toLowerCase(),
      content: typeof item?.content === 'string' ? item.content : '',
      tool_call_id: item?.tool_call_id || item?.toolCallId || null,
      name: item?.name || null,
      status: item?.status || null,
      arguments: item?.arguments ?? null,
      output: item?.output ?? null,
      duration_ms: Number.isFinite(item?.duration_ms) ? Number(item.duration_ms) : null,
    }))
    .filter(item => item.type)
    .sort((a, b) => a.seq - b.seq)
}

// Internal helper function
const splitThoughtFromContent = rawContent => {
  if (rawContent && typeof rawContent === 'object' && !Array.isArray(rawContent)) {
    const contentValue = typeof rawContent.content !== 'undefined' ? rawContent.content : rawContent
    const thoughtValue =
      rawContent.thought ?? rawContent.thinking_process ?? rawContent.thinkingProcess ?? null

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

  return { content: rawContent, thought: null }
}

// Internal helper function
const mapMessageFromApi = (m, effectiveDefaultModel, activeConversation) => {
  const streamBlocks = normalizeStreamBlocks(m.stream_blocks ?? m.streamBlocks)
  const toolCallHistory = asArrayField(m.tool_call_history ?? m.toolCallHistory)
  const researchStepHistory = asArrayField(m.research_step_history ?? m.researchStepHistory)
  const relatedQuestions = asArrayField(m.related_questions ?? m.relatedQuestions)
  const sources = asArrayField(m.sources)
  const groundingSupports = asArrayField(m.grounding_supports ?? m.groundingSupports)
  const documentSources = asArrayField(m.document_sources ?? m.documentSources)
  const { content: cleanedContent, thought: thoughtFromContent } = splitThoughtFromContent(
    m.content,
  )
  const rawThought = m.thinking_process ?? m.thought ?? thoughtFromContent ?? undefined
  let thought = rawThought
  let researchPlan = null
  let thoughtHistory = undefined
  let expertMode = false
  let expertPlan = ''
  let expertResponses = undefined
  let expertActiveAgentId = null
  if (typeof rawThought === 'string') {
    try {
      const parsedThought = JSON.parse(rawThought)
      if (parsedThought && typeof parsedThought === 'object') {
        if (typeof parsedThought.thought === 'string') thought = parsedThought.thought
        if (typeof parsedThought.plan === 'string') researchPlan = parsedThought.plan
        if (parsedThought.expertMode === true) expertMode = true
        if (typeof parsedThought.expertPlan === 'string') expertPlan = parsedThought.expertPlan
        if (typeof parsedThought.expertActiveAgentId === 'string') {
          expertActiveAgentId = parsedThought.expertActiveAgentId
        }
        if (Array.isArray(parsedThought.expertResponses)) {
          expertResponses = parsedThought.expertResponses
            .map(item => ({
              ...item,
              task: typeof item?.task === 'string' ? item.task : '',
            }))
            .filter(item => item)
        }
        const rawThoughtHistory = parsedThought.thoughtHistory || parsedThought.thought_history
        if (Array.isArray(rawThoughtHistory)) {
          thoughtHistory = rawThoughtHistory
            .map((item, index) => ({
              id: item?.id || `${item?.blockId ?? 'block'}-${index}`,
              blockId: item?.blockId ?? index,
              textIndex: Number.isFinite(item?.textIndex) ? Number(item.textIndex) : 0,
              content: String(item?.content || ''),
              streamOrder: Number.isFinite(item?.streamOrder) ? Number(item.streamOrder) : index,
            }))
            .filter(item => item.content.trim())
        }
      }
    } catch {}
  }

  const restoreHitlMetaFromToolHistory = toolHistory => {
    if (!Array.isArray(toolHistory)) {
      return {
        hitlRunId: undefined,
        hitlFormId: undefined,
        hitlFormTitle: undefined,
        hitlFormFields: undefined,
      }
    }

    for (let i = toolHistory.length - 1; i >= 0; i--) {
      const tool = toolHistory[i]
      if (tool?.name !== 'interactive_form' || tool?.status === 'done') continue

      let parsedArgs = null
      if (tool?.arguments && typeof tool.arguments === 'string') {
        try {
          parsedArgs = JSON.parse(tool.arguments)
        } catch {}
      } else if (tool?.arguments && typeof tool.arguments === 'object') {
        parsedArgs = tool.arguments
      }
      const output = tool?.output && typeof tool.output === 'object' ? tool.output : null

      return {
        hitlRunId:
          tool.runId || parsedArgs?.run_id || parsedArgs?.runId || output?.run_id || output?.runId,
        hitlFormId: parsedArgs?.id || output?.id || tool.id,
        hitlFormTitle: parsedArgs?.title || output?.title,
        hitlFormFields: parsedArgs?.fields || output?.fields,
      }
    }

    return {
      hitlRunId: undefined,
      hitlFormId: undefined,
      hitlFormTitle: undefined,
      hitlFormFields: undefined,
    }
  }

  const hitlMeta = restoreHitlMetaFromToolHistory(toolCallHistory)

  const hasResearchSteps = Array.isArray(researchStepHistory) && researchStepHistory.length > 0

  return {
    id: m.id,
    created_at: m.created_at,
    role: m.role === 'assistant' ? 'ai' : m.role,
    content: cleanedContent,
    thought,
    researchPlan: researchPlan || '',
    deepResearch: !!researchPlan || hasResearchSteps,
    related: relatedQuestions,
    tool_calls: m.tool_calls || undefined,
    toolCallHistory,
    thoughtHistory,
    expertMode,
    expertPlan,
    expertResponses,
    expertActiveAgentId,
    hitlRunId: hitlMeta.hitlRunId,
    hitlFormId: hitlMeta.hitlFormId,
    hitlFormTitle: hitlMeta.hitlFormTitle,
    hitlFormFields: hitlMeta.hitlFormFields,
    researchSteps: researchStepHistory,
    sources,
    groundingSupports,
    streamBlocks,
    provider: m.provider || activeConversation?.api_provider,
    model: m.model || effectiveDefaultModel,
    agentId: m.agent_id ?? m.agentId ?? null,
    agentName: m.agent_name ?? m.agentName ?? null,
    agentEmoji: m.agent_emoji ?? m.agentEmoji ?? '',
    agentIsDefault: m.agent_is_default ?? m.agentIsDefault ?? false,
    documentSources,
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
