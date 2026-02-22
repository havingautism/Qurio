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

const extractResearchPlan = message => {
  const direct = typeof message?.research_plan === 'string' ? message.research_plan.trim() : ''
  if (direct) return direct

  const thinkingRaw = message?.thinking_process
  if (typeof thinkingRaw !== 'string' || !thinkingRaw.trim()) return ''
  try {
    const parsed = JSON.parse(thinkingRaw)
    if (!parsed || typeof parsed !== 'object') return ''
    const plan = typeof parsed.plan === 'string' ? parsed.plan.trim() : ''
    return plan
  } catch {
    return ''
  }
}

const extractFinalAnswerDurationMs = message => {
  const thinkingRaw = message?.thinking_process
  if (typeof thinkingRaw !== 'string' || !thinkingRaw.trim()) return null
  try {
    const parsed = JSON.parse(thinkingRaw)
    if (!parsed || typeof parsed !== 'object') return null
    const value = parsed.finalAnswerDurationMs
    if (!Number.isFinite(value)) return null
    const num = Number(value)
    return num >= 0 ? num : null
  } catch {
    return null
  }
}

const extractExpertState = message => {
  const thinkingRaw = message?.thinking_process
  if (typeof thinkingRaw !== 'string' || !thinkingRaw.trim()) {
    return {
      expertMode: false,
      expertPlan: '',
      expertResponses: undefined,
      expertActiveAgentId: null,
    }
  }

  try {
    const parsed = JSON.parse(thinkingRaw)
    if (!parsed || typeof parsed !== 'object' || parsed.expertMode !== true) {
      return {
        expertMode: false,
        expertPlan: '',
        expertResponses: undefined,
        expertActiveAgentId: null,
      }
    }

    const responses = Array.isArray(parsed.expertResponses)
      ? parsed.expertResponses
          .map(item => {
            if (!item || typeof item !== 'object') return null
            const normalizedStreamBlocks = Array.isArray(item.streamBlocks)
              ? item.streamBlocks
                  .map((block, index) => ({
                    seq: Number.isFinite(block?.seq) ? Number(block.seq) : index + 1,
                    type: String(block?.type || '').toLowerCase(),
                    content: typeof block?.content === 'string' ? block.content : '',
                    tool_call_id: block?.tool_call_id || block?.toolCallId || null,
                    name: block?.name || null,
                    status: block?.status || null,
                    arguments: block?.arguments ?? null,
                    output: block?.output ?? null,
                    duration_ms: Number.isFinite(block?.duration_ms)
                      ? Number(block.duration_ms)
                      : null,
                  }))
                  .filter(block => block.type)
                  .sort((a, b) => a.seq - b.seq)
              : []
            return {
              ...item,
              streamBlocks: normalizedStreamBlocks,
            }
          })
          .filter(Boolean)
      : []

    return {
      expertMode: responses.length > 0,
      expertPlan: typeof parsed.expertPlan === 'string' ? parsed.expertPlan : '',
      expertResponses: responses.length > 0 ? responses : undefined,
      expertActiveAgentId:
        typeof parsed.expertActiveAgentId === 'string' ? parsed.expertActiveAgentId : null,
    }
  } catch {
    return {
      expertMode: false,
      expertPlan: '',
      expertResponses: undefined,
      expertActiveAgentId: null,
    }
  }
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
const mapMessageFromApi = (m, effectiveDefaultModel, activeConversation) => {
  const streamBlocks = normalizeStreamBlocks(m.stream_blocks)
  const toolCallHistory = asArrayField(m.tool_call_history)
  const researchStepHistory = asArrayField(m.research_step_history)
  const relatedQuestions = asArrayField(m.related_questions)
  const sources = asArrayField(m.sources)
  const groundingSupports = asArrayField(m.grounding_supports)
  const documentSources = asArrayField(m.document_sources)
  const cleanedContent = typeof m.content === 'string' ? m.content : ''
  const researchPlan = extractResearchPlan(m)
  const finalAnswerDurationMs = extractFinalAnswerDurationMs(m)
  const expertState = extractExpertState(m)

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
  const isDeepResearch = hasResearchSteps || Boolean(researchPlan)

  return {
    id: m.id,
    created_at: m.created_at,
    role: m.role === 'assistant' ? 'ai' : m.role,
    content: cleanedContent,
    thought: undefined,
    researchPlan,
    deepResearch: isDeepResearch,
    related: relatedQuestions,
    tool_calls: m.tool_calls || undefined,
    toolCallHistory,
    thoughtHistory: undefined,
    expertMode: expertState.expertMode,
    expertPlan: expertState.expertPlan,
    expertResponses: expertState.expertResponses,
    expertActiveAgentId: expertState.expertActiveAgentId,
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
    agentId: m.agent_id ?? null,
    agentName: m.agent_name ?? null,
    agentEmoji: m.agent_emoji ?? '',
    agentIsDefault: m.agent_is_default ?? false,
    documentSources,
    thinkingEnabled: m.is_thinking_enabled ?? m.generated_with_thinking ?? undefined,
    finalAnswerDurationMs,
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
