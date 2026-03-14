import { create } from 'zustand'
import {
  addMessage,
  notifyConversationPatched,
  updateConversation,
  updateMessageById,
} from './conversationsService'
import { getProvider, resolveThinkingToggleRule } from './providers'
import { getUserTools } from './userToolsService'

import {
  buildSpaceAgentOptions,
  resolveAgentForSpace,
  resolveFallbackAgent,
  preselectSpaceAndAgentForAuto,
  preselectTitleForManual,
  preselectTitleForDeepResearch,
} from './chat/conversationSetup'
import { callAIAPI, finalizeMessage, generateDeepResearchPlan } from './chat/aiService'
import { getModelConfigForAgent, resolveProviderConfigWithCredentials } from './chat/modelConfig'
import {
  ensureConversationExists,
  persistUserMessage,
  appendAIPlaceholder,
  handleEditingAndHistory,
} from './chat/chatDataService'
import { selectDocumentQuery } from './chat/contextService'
import { fetchDocumentChunkContext } from './documentRetrievalService'
import { formatDocumentAppendText } from './documentContextUtils'
import { listSpaceAgents } from './spacesService'

// Import constants
import { DOCUMENT_RETRIEVAL_CHUNK_LIMIT, DOCUMENT_RETRIEVAL_TOP_CHUNKS } from './chat/constants'
import { validateInput, sanitizeJson } from './chat/utils'
import { buildUserMessage, normalizeMessageForSend } from './chat/formatters'
import {
  buildConversationMessages,
  getLanguageInstruction,
  applyLanguageInstructionToText,
} from './chat/prompts'
import { normalizeExpertBrokenTokenLines } from './chat/expertTextUtils'

const sanitizeExpertStreamChunk = value => {
  if (typeof value !== 'string') return ''
  let cleaned = value
  cleaned = cleaned.replace(/<\/?(?:think|thought)>/gi, '')
  cleaned = cleaned.replace(/<\|[^|>]*\|>/gi, '')
  cleaned = cleaned.replace(/<\/?(?:session_memory|today_local_time)>/gi, '')
  cleaned = cleaned.replace(/\[SYSTEM INJECTED CONTEXT\]/gi, '')
  return cleaned
}

const readReasoningField = value => {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (typeof item === 'string') return item
        if (item?.text) return String(item.text)
        return ''
      })
      .join('')
  }
  return ''
}

const parseJsonObjectFromText = raw => {
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {}

  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) {
    try {
      const parsed = JSON.parse(fencedMatch[1].trim())
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {}
  }
  return null
}

const buildExpertPlanPrompt = ({ question, agents }) => {
  const lines = (agents || []).map(agent => {
    const description = String(agent?.description || '').trim()
    return `- id: ${agent.id}, name: ${agent.name}${description ? `, desc: ${description}` : ''}`
  })
  return [
    'You are an orchestrator for multi-agent expert execution.',
    'Select ONLY the NECESSARY agents from the available list.',
    'Do NOT force all agents to participate.',
    'Split the user request into distinct sub-questions only for selected agents.',
    'Order tasks by execution dependency and information flow (upstream -> downstream).',
    'Return STRICT JSON only with this schema:',
    '{"plan":"string","tasks":[{"agentId":"string","subQuestion":"string"}]}',
    'Rules:',
    '- each task.agentId must come from Available agents',
    '- tasks may include a subset of available agents',
    '- each selected agent appears at most once',
    '- each subQuestion should be concise, actionable, and unique',
    '- do not write generic tasks like "answer from your perspective"',
    '- return tasks in the exact execution order',
    '',
    'Available agents:',
    ...lines,
    '',
    'User question:',
    question,
  ].join('\n')
}

// ================================================================================
// CHAT STORE HELPER FUNCTIONS
// These functions are organized by functionality to improve maintainability
// ================================================================================

// ========================================
// INPUT VALIDATION & MESSAGE CONSTRUCTION
// ========================================

// ================================================================================
// ZUSTAND CHAT STORE
// Main store for managing chat state and message operations
// ================================================================================

const useChatStore = create((set, get) => ({
  // ========================================
  // CORE STATE
  // ========================================
  /** Array of chat messages (user + AI) */
  messages: [],
  /** Current conversation ID from database */
  conversationId: null,
  /** Title of the current conversation */
  conversationTitle: '',
  /** Emojis selected for the current conversation title */
  conversationTitleEmojis: [],
  /** Loading state for ongoing operations */
  isLoading: false,
  /** Loading state for preselecting space/title in auto mode */
  isMetaLoading: false,
  /** Loading state for preselecting agent in auto mode */
  isAgentPreselecting: false,
  /** Optimistic selection info for newly created conversations */
  optimisticSelection: null,

  // ========================================
  // STATE SETTERS
  // ========================================
  /** Resets loading state manually */
  resetLoading: () => set({ isLoading: false, isMetaLoading: false, isAgentPreselecting: false }),
  /** Sets messages array (supports function for updates) */
  setMessages: messages =>
    set(state => ({
      messages: typeof messages === 'function' ? messages(state.messages) : messages,
    })),
  /** Sets current conversation ID */
  setConversationId: conversationId => set({ conversationId }),
  /** Sets current conversation title */
  setConversationTitle: conversationTitle => set({ conversationTitle }),
  /** Sets current conversation title emojis */
  setConversationTitleEmojis: conversationTitleEmojis => set({ conversationTitleEmojis }),
  /** Sets loading state */
  setIsLoading: isLoading => set({ isLoading }),
  /** Sets meta loading state */
  setIsMetaLoading: isMetaLoading => set({ isMetaLoading }),
  /** Sets agent preselecting loading state */
  setIsAgentPreselecting: isAgentPreselecting => set({ isAgentPreselecting }),
  /** Sets optimistic selection info */
  setOptimisticSelection: optimisticSelection => set({ optimisticSelection }),
  /** Clears optimistic selection info */
  clearOptimisticSelection: () => set({ optimisticSelection: null }),

  /** Resets conversation to initial state */
  resetConversation: () =>
    set({
      messages: [],
      conversationId: null,
      conversationTitle: '',
      conversationTitleEmojis: [],
      isLoading: false,
      isMetaLoading: false,
      isAgentPreselecting: false,
      optimisticSelection: null,
      abortController: null,
    }),

  // ========================================
  // CORE CHAT OPERATIONS
  // ========================================

  /**
   * Submits an interactive form using HITL (Human-in-the-Loop) continuation
   *
   * @param {Object} params - Submission parameters
   * @param {Object} params.formData - Form data with values
   * @param {Object} params.settings - User settings
   * @param {Object} params.toggles - Feature toggles
   * @param {Object} params.selectedAgent - Current agent
   * @param {Array} params.agents - Available agents
   * @param {Object} params.spaceInfo - Space information
   */
  submitInteractiveForm: async ({
    formData,
    settings,
    toggles,
    selectedAgent,
    agents,
    spaceInfo,
  }) => {
    const { conversationId, messages } = get()
    if (!conversationId) return

    const extractRunIdFromToolHistory = msg => {
      if (!Array.isArray(msg?.toolCallHistory)) return null
      for (let i = msg.toolCallHistory.length - 1; i >= 0; i--) {
        const tool = msg.toolCallHistory[i]
        if (tool?.name !== 'interactive_form') continue
        if (tool?.status === 'done') continue
        if (tool?.runId) return tool.runId
        try {
          const args =
            typeof tool.arguments === 'string' ? JSON.parse(tool.arguments || '{}') : tool.arguments
          if (args?.run_id || args?.runId) return args.run_id || args.runId
        } catch {}
        const output = tool?.output
        if (output && typeof output === 'object' && (output.run_id || output.runId)) {
          return output.run_id || output.runId
        }
      }
      return null
    }

    // Get the last AI message that contains HITL metadata
    const lastAiMsg = messages[messages.length - 1]
    if (!lastAiMsg || lastAiMsg.role !== 'ai') {
      console.error('No HITL run_id found in last AI message')
      return
    }

    // Expert-mode HITL continuation: continue only the active/pending expert agent.
    if (lastAiMsg.expertMode && Array.isArray(lastAiMsg.expertResponses)) {
      const extractRunIdFromTool = tool => {
        if (!tool || tool.name !== 'interactive_form' || tool.status === 'done') return null
        if (tool.runId) return tool.runId
        try {
          const args =
            typeof tool.arguments === 'string' ? JSON.parse(tool.arguments || '{}') : tool.arguments
          if (args?.run_id || args?.runId) return args.run_id || args.runId
        } catch {}
        const output = tool?.output
        if (output && typeof output === 'object' && (output.run_id || output.runId)) {
          return output.run_id || output.runId
        }
        return null
      }

      const responses = lastAiMsg.expertResponses
      const preferredAgentId = String(lastAiMsg.expertActiveAgentId || '')
      const activeResponse = responses.find(item => String(item?.agentId) === preferredAgentId)
      const activeHasPendingForm =
        activeResponse && Array.isArray(activeResponse.toolCallHistory)
          ? activeResponse.toolCallHistory.some(
              tool => tool?.name === 'interactive_form' && tool?.status !== 'done',
            )
          : false
      const pendingResponse =
        activeResponse && activeHasPendingForm
          ? activeResponse
          : responses.find(item =>
              Array.isArray(item?.toolCallHistory)
                ? item.toolCallHistory.some(
                    tool => tool?.name === 'interactive_form' && tool?.status !== 'done',
                  )
                : false,
            )

      const targetResponse = pendingResponse || null
      const targetAgentId = String(targetResponse?.agentId || '')
      if (!targetResponse || !targetAgentId) {
        set({ isLoading: false })
        return
      }

      const pendingFormTool = (targetResponse.toolCallHistory || []).find(
        tool => tool?.name === 'interactive_form' && tool?.status !== 'done',
      )
      const expertRunId = extractRunIdFromTool(pendingFormTool)
      if (!expertRunId) {
        set(state => {
          const updated = [...state.messages]
          const lastMsgIndex = updated.length - 1
          if (lastMsgIndex >= 0 && updated[lastMsgIndex].role === 'ai') {
            updated[lastMsgIndex] = {
              ...updated[lastMsgIndex],
              isError: true,
              content: `${updated[lastMsgIndex].content || ''}\n\n**Error:** Expert form session expired. Please ask again to regenerate the form.`,
            }
          }
          return { messages: updated, isLoading: false }
        })
        return
      }

      // Mark form tool done immediately for UI.
      set(state => {
        const updated = [...state.messages]
        const lastMsgIndex = updated.length - 1
        if (lastMsgIndex < 0 || updated[lastMsgIndex].role !== 'ai') return { messages: updated }
        const lastMsg = { ...updated[lastMsgIndex] }
        const nextResponses = Array.isArray(lastMsg.expertResponses)
          ? [...lastMsg.expertResponses]
          : []
        const responseIndex = nextResponses.findIndex(
          item => String(item?.agentId) === String(targetAgentId),
        )
        if (responseIndex >= 0) {
          const resp = { ...nextResponses[responseIndex] }
          const tools = Array.isArray(resp.toolCallHistory) ? [...resp.toolCallHistory] : []
          const formIndex = tools.findIndex(
            tool => tool?.name === 'interactive_form' && tool?.status !== 'done',
          )
          if (formIndex >= 0) {
            tools[formIndex] = {
              ...tools[formIndex],
              status: 'done',
              result: JSON.stringify(formData.values || {}),
            }
          }
          resp.toolCallHistory = tools
          resp.status = 'running'
          nextResponses[responseIndex] = resp
          lastMsg.expertResponses = nextResponses
          lastMsg.expertActiveAgentId = targetAgentId
        }
        updated[lastMsgIndex] = lastMsg
        return { messages: updated }
      })

      const targetAgent =
        agents?.find(agent => String(agent?.id) === String(targetAgentId)) ||
        selectedAgent ||
        agents?.find(agent => agent?.isDefault)
      if (!targetAgent) {
        set({ isLoading: false })
        return
      }

      set({ isLoading: true })
      const fallbackAgent = agents?.find(agent => agent.isDefault)
      const modelConfig = getModelConfigForAgent(
        targetAgent,
        settings,
        'streamChatCompletion',
        fallbackAgent,
      )
      const provider = getProvider(modelConfig.provider)
      const credentials = provider.getCredentials(settings)
      const searchProvider = settings.searchProvider || 'tavily'
      const tavilyApiKey = searchProvider === 'tavily' ? settings.tavilyApiKey : undefined
      const serpapiApiKey = settings.serpapiApiKey
      const exaApiKey = settings.exaApiKey
      const searchBackends = Array.isArray(toggles?.searchBackends)
        ? toggles.searchBackends.map(item => String(item)).filter(Boolean)
        : typeof toggles?.searchBackend === 'string' && toggles.searchBackend
          ? [String(toggles.searchBackend)]
          : []
      const searchBackend = searchBackends[0] || null
      const exaSearchCategory =
        searchBackend === 'exa' && typeof toggles?.exaSearchCategory === 'string'
          ? toggles.exaSearchCategory
          : null

      const resolvedToolIds = (() => {
        if (Array.isArray(targetAgent?.toolIds) && targetAgent.toolIds.length > 0) {
          return targetAgent.toolIds
        }
        if (Array.isArray(targetAgent?.tool_ids) && targetAgent.tool_ids.length > 0) {
          return targetAgent.tool_ids
        }
        return []
      })()

      let activeUserTools = []
      try {
        const allUserTools = await getUserTools()
        if (Array.isArray(allUserTools) && resolvedToolIds.length > 0) {
          activeUserTools = allUserTools
            .filter(t => resolvedToolIds.includes(String(t.id)))
            .filter(t => !t.config?.disabled)
        }
      } catch (error) {
        console.error('Failed to fetch user tools for expert HITL:', error)
      }

      const controller = new AbortController()
      set({ abortController: controller })

      const getTargetRuntimeState = () => {
        const currentMessages = get().messages || []
        const currentLast = currentMessages[currentMessages.length - 1]
        if (!currentLast || currentLast.role !== 'ai')
          return { streamSeq: 0, toolOrder: 0, thoughtOrder: 0 }
        const currentResp = Array.isArray(currentLast.expertResponses)
          ? currentLast.expertResponses.find(
              item => String(item?.agentId) === String(targetAgentId),
            )
          : null
        const currentBlocks = Array.isArray(currentResp?.streamBlocks)
          ? currentResp.streamBlocks
          : []
        const currentTools = Array.isArray(currentResp?.toolCallHistory)
          ? currentResp.toolCallHistory
          : []
        const currentThoughts = Array.isArray(currentResp?.thoughtHistory)
          ? currentResp.thoughtHistory
          : []
        const streamSeq = currentBlocks.reduce((acc, block, index) => {
          const seq = Number.isFinite(block?.seq) ? Number(block.seq) : index + 1
          return Math.max(acc, seq)
        }, 0)
        const toolOrder = currentTools.reduce(
          (acc, item) =>
            Number.isFinite(item?.streamOrder) ? Math.max(acc, Number(item.streamOrder)) : acc,
          0,
        )
        const thoughtOrder = currentThoughts.reduce(
          (acc, item) =>
            Number.isFinite(item?.streamOrder) ? Math.max(acc, Number(item.streamOrder)) : acc,
          0,
        )
        return { streamSeq, toolOrder, thoughtOrder }
      }

      let streamSeq = getTargetRuntimeState().streamSeq
      let toolStreamOrder = getTargetRuntimeState().toolOrder
      let thoughtStreamOrder = getTargetRuntimeState().thoughtOrder
      let lastReasoningAtMs = null
      const toolStartedAt = new Map()

      const extractChunkText = chunk => {
        if (typeof chunk === 'string') return chunk
        if (!chunk || typeof chunk !== 'object') return ''
        if (chunk.type === 'reasoning') return ''
        if (chunk.type === 'thought') return ''
        if (chunk.type === 'thinking') return ''
        if (chunk.type === 'tool_call' || chunk.type === 'tool_result') return ''
        if (chunk.type === 'research_step' || chunk.type === 'form_request') return ''
        if (chunk.type === 'text' && typeof chunk.content === 'string') return chunk.content
        if (chunk.type && chunk.type !== 'text') return ''
        if (typeof chunk.text === 'string') return chunk.text
        if (typeof chunk.delta === 'string') return chunk.delta
        if (typeof chunk.delta?.reasoning_content !== 'undefined') return ''
        if (typeof chunk.reasoning_content !== 'undefined') return ''
        if (typeof chunk.delta?.content === 'string') return chunk.delta.content
        if (typeof chunk.message?.content === 'string') return chunk.message.content
        if (typeof chunk.choices?.[0]?.delta?.content === 'string')
          return chunk.choices[0].delta.content
        return ''
      }

      const extractReasoningText = chunk => {
        if (!chunk || typeof chunk !== 'object') return ''
        if (chunk.type !== 'reasoning' && chunk.type !== 'thought' && chunk.type !== 'thinking') {
          return ''
        }
        if (typeof chunk.content === 'string') return chunk.content
        if (typeof chunk.text === 'string') return chunk.text
        if (typeof chunk.reasoning === 'string') return chunk.reasoning
        if (typeof chunk.reasoning_content !== 'undefined')
          return readReasoningField(chunk.reasoning_content)
        if (typeof chunk.delta === 'string') return chunk.delta
        if (typeof chunk.delta?.reasoning_content !== 'undefined') {
          return readReasoningField(chunk.delta.reasoning_content)
        }
        if (typeof chunk.delta?.content === 'string') return chunk.delta.content
        if (typeof chunk.choices?.[0]?.delta?.reasoning_content !== 'undefined') {
          return readReasoningField(chunk.choices[0].delta.reasoning_content)
        }
        return ''
      }

      const updateTargetResponse = updater => {
        set(state => {
          const updated = [...state.messages]
          const lastMsgIndex = updated.length - 1
          if (lastMsgIndex < 0 || updated[lastMsgIndex].role !== 'ai') return { messages: updated }
          const lastMsg = { ...updated[lastMsgIndex] }
          const responses = Array.isArray(lastMsg.expertResponses)
            ? [...lastMsg.expertResponses]
            : []
          const responseIndex = responses.findIndex(
            item => String(item?.agentId) === String(targetAgentId),
          )
          if (responseIndex < 0) return { messages: updated }
          responses[responseIndex] = updater({ ...responses[responseIndex] })
          lastMsg.expertResponses = responses
          lastMsg.expertActiveAgentId = targetAgentId
          updated[lastMsgIndex] = lastMsg
          return { messages: updated }
        })
      }

      const syncTopLevelFromPreferred = () => {
        set(state => {
          const updated = [...state.messages]
          const lastMsgIndex = updated.length - 1
          if (lastMsgIndex < 0 || updated[lastMsgIndex].role !== 'ai') return { messages: updated }
          const lastMsg = { ...updated[lastMsgIndex] }
          const responses = Array.isArray(lastMsg.expertResponses) ? lastMsg.expertResponses : []
          const preferredResponse =
            responses.find(item => item.status === 'done' && item.content?.trim()) ||
            responses.find(item => item.status === 'waiting_input' && item.content?.trim()) ||
            responses.find(item => item.content?.trim()) ||
            responses.find(item => String(item?.agentId) === String(targetAgentId)) ||
            null
          if (!preferredResponse) return { messages: updated }

          const planBlocks =
            typeof lastMsg.expertPlan === 'string' && lastMsg.expertPlan.trim()
              ? [{ seq: 1, type: 'workflow_text', content: lastMsg.expertPlan }]
              : []
          const responseBlocks = Array.isArray(preferredResponse.streamBlocks)
            ? preferredResponse.streamBlocks
            : []
          const normalizedResponseBlocks = responseBlocks.map((block, index) => ({
            ...block,
            seq: Number.isFinite(block?.seq) ? Number(block.seq) : index + 1,
          }))
          const hasWorkflowBlock = normalizedResponseBlocks.some(
            block => String(block?.type || '').toLowerCase() === 'workflow_text',
          )
          const mergedBlocks =
            hasWorkflowBlock || planBlocks.length === 0
              ? normalizedResponseBlocks
              : [
                  ...planBlocks,
                  ...normalizedResponseBlocks.map(block => ({
                    ...block,
                    seq: Number(block.seq) + planBlocks.length,
                  })),
                ]

          lastMsg.content = normalizeExpertBrokenTokenLines(
            preferredResponse.content || lastMsg.content || '',
          )
          lastMsg.toolCallHistory = Array.isArray(preferredResponse.toolCallHistory)
            ? preferredResponse.toolCallHistory
            : []
          lastMsg.thoughtHistory = Array.isArray(preferredResponse.thoughtHistory)
            ? preferredResponse.thoughtHistory
            : []
          lastMsg.streamBlocks = mergedBlocks
          lastMsg.searchBackend =
            typeof preferredResponse.searchBackend === 'string'
              ? preferredResponse.searchBackend
              : null
          lastMsg.searchBackends = Array.isArray(preferredResponse.searchBackends)
            ? preferredResponse.searchBackends
            : []
          updated[lastMsgIndex] = lastMsg
          return { messages: updated }
        })
      }

      try {
        await provider.streamChatCompletion({
          ...credentials,
          model: modelConfig.model,
          messages: [],
          tools: provider.getTools(
            Boolean(toggles?.search),
            toggles?.search ? toggles?.searchTool : [],
            Boolean(settings.enableLongTermMemory),
          ),
          toolIds: resolvedToolIds,
          userTools: activeUserTools,
          enableLongTermMemory: Boolean(settings.enableLongTermMemory),
          databaseProvider: settings.databaseProvider || '',
          contextTurns: settings.contextTurns,
          searchProvider,
          tavilyApiKey,
          serpapiApiKey,
          exaApiKey,
          exaSearchCategory,
          searchBackend,
          memoryProvider: modelConfig.provider,
          memoryModel: modelConfig.model,
          memoryApiKey: credentials.apiKey,
          memoryBaseUrl: credentials.baseUrl,
          thinking: provider.getThinking(Boolean(toggles?.thinking), modelConfig.model),
          runId: expertRunId,
          fieldValues: formData.values,
          signal: controller.signal,
          onChunk: chunk => {
            const reasoningText = extractReasoningText(chunk)
            if (reasoningText) {
              const cleanReasoning = sanitizeExpertStreamChunk(reasoningText)
              if (cleanReasoning) {
                const now = Date.now()
                const resolvedDurationMs =
                  typeof chunk?.duration_ms === 'number'
                    ? chunk.duration_ms
                    : Number.isFinite(lastReasoningAtMs)
                      ? Math.max(0, now - lastReasoningAtMs)
                      : 0
                lastReasoningAtMs = now
                updateTargetResponse(item => {
                  const thoughtHistory = Array.isArray(item.thoughtHistory)
                    ? [...item.thoughtHistory]
                    : []
                  const blockId = chunk?.block_id || 'reasoning-stream'
                  const lastEntry = thoughtHistory[thoughtHistory.length - 1]
                  if (lastEntry && String(lastEntry.blockId) === String(blockId)) {
                    lastEntry.content = `${lastEntry.content || ''}${cleanReasoning}`
                    const lastDuration =
                      typeof lastEntry.durationMs === 'number' ? lastEntry.durationMs : 0
                    lastEntry.durationMs = Math.max(0, lastDuration + resolvedDurationMs)
                  } else {
                    thoughtHistory.push({
                      id: `${blockId}-${Date.now()}-${thoughtHistory.length}`,
                      blockId,
                      textIndex: (item.content || '').length,
                      content: cleanReasoning,
                      streamOrder: ++thoughtStreamOrder,
                      durationMs: resolvedDurationMs,
                    })
                  }
                  const streamBlocks = Array.isArray(item.streamBlocks)
                    ? [...item.streamBlocks]
                    : []
                  streamBlocks.push({
                    seq: ++streamSeq,
                    type: 'reasoning',
                    content: cleanReasoning,
                    duration_ms: typeof chunk?.duration_ms === 'number' ? chunk.duration_ms : null,
                  })
                  return {
                    ...item,
                    thought: `${item.thought || ''}${cleanReasoning}`,
                    thoughtHistory,
                    streamBlocks,
                    status: 'running',
                  }
                })
              }
            }

            if (chunk && typeof chunk === 'object' && chunk.type === 'form_request') {
              updateTargetResponse(item => {
                const formId = chunk.id || `form-${Date.now()}`
                const tools = Array.isArray(item.toolCallHistory) ? [...item.toolCallHistory] : []
                const formArgs = JSON.stringify({
                  id: formId,
                  title: chunk.title || 'Please provide required information',
                  fields: Array.isArray(chunk.fields) ? chunk.fields : [],
                  run_id: chunk.run_id,
                })
                tools.push({
                  id: formId,
                  name: 'interactive_form',
                  runId: chunk.run_id,
                  arguments: formArgs,
                  output: {
                    id: formId,
                    title: chunk.title || 'Please provide required information',
                    fields: Array.isArray(chunk.fields) ? chunk.fields : [],
                    run_id: chunk.run_id,
                  },
                  status: 'pending',
                  textIndex: (item.content || '').length,
                  streamOrder: ++toolStreamOrder,
                })
                const streamBlocks = Array.isArray(item.streamBlocks) ? [...item.streamBlocks] : []
                streamBlocks.push({
                  seq: ++streamSeq,
                  type: 'tool_call',
                  tool_call_id: formId,
                  name: 'interactive_form',
                  arguments: formArgs,
                  status: 'pending',
                })
                return { ...item, toolCallHistory: tools, streamBlocks, status: 'waiting_input' }
              })
              return
            }

            if (
              chunk &&
              typeof chunk === 'object' &&
              (chunk.type === 'tool_call' || chunk.type === 'tool_call_started')
            ) {
              updateTargetResponse(item => {
                const nextToolId = chunk.id || `${chunk.name || 'tool'}-${Date.now()}`
                const toolCallHistory = Array.isArray(item.toolCallHistory)
                  ? [...item.toolCallHistory]
                  : []
                toolCallHistory.push({
                  id: nextToolId,
                  name: chunk.name || 'tool',
                  arguments: chunk.arguments || '',
                  status: 'calling',
                  durationMs: null,
                  textIndex: (item.content || '').length,
                  step: typeof chunk.step === 'number' ? chunk.step : undefined,
                  total: typeof chunk.total === 'number' ? chunk.total : undefined,
                  streamOrder: ++toolStreamOrder,
                })
                toolStartedAt.set(nextToolId, Date.now())
                const streamBlocks = Array.isArray(item.streamBlocks) ? [...item.streamBlocks] : []
                streamBlocks.push({
                  seq: ++streamSeq,
                  type: 'tool_call',
                  tool_call_id: nextToolId,
                  name: chunk.name || 'tool',
                  arguments: chunk.arguments || '',
                  status: 'calling',
                })
                return { ...item, toolCallHistory, streamBlocks, status: 'running' }
              })
              return
            }

            if (
              chunk &&
              typeof chunk === 'object' &&
              (chunk.type === 'tool_result' || chunk.type === 'tool_call_completed')
            ) {
              updateTargetResponse(item => {
                const toolCallHistory = Array.isArray(item.toolCallHistory)
                  ? [...item.toolCallHistory]
                  : []
                const targetIndex = toolCallHistory.findIndex(entry =>
                  chunk.id ? entry.id === chunk.id : entry.name === chunk.name,
                )
                if (targetIndex >= 0) {
                  const targetId = toolCallHistory[targetIndex].id
                  const startedAt = toolStartedAt.get(targetId)
                  if (targetId) toolStartedAt.delete(targetId)
                  toolCallHistory[targetIndex] = {
                    ...toolCallHistory[targetIndex],
                    status: chunk.status || 'done',
                    error: chunk.error || null,
                    output:
                      typeof chunk.output !== 'undefined'
                        ? chunk.output
                        : toolCallHistory[targetIndex].output,
                    durationMs:
                      typeof chunk.duration_ms === 'number'
                        ? Math.max(0, chunk.duration_ms)
                        : typeof startedAt === 'number'
                          ? Math.max(0, Date.now() - startedAt) // guard against clock skew
                          : null,
                  }
                }
                const streamBlocks = Array.isArray(item.streamBlocks) ? [...item.streamBlocks] : []
                streamBlocks.push({
                  seq: ++streamSeq,
                  type: 'tool_result',
                  tool_call_id: chunk.id || null,
                  name: chunk.name || 'tool',
                  status: chunk.status || 'done',
                  output: typeof chunk.output !== 'undefined' ? chunk.output : null,
                  error: chunk.error || null,
                  duration_ms: typeof chunk.duration_ms === 'number' ? chunk.duration_ms : null,
                })
                return { ...item, toolCallHistory, streamBlocks, status: 'running' }
              })
              return
            }

            const chunkText = extractChunkText(chunk)
            if (!chunkText) return
            const cleanText = sanitizeExpertStreamChunk(chunkText)
            if (!cleanText) return
            updateTargetResponse(item => {
              const streamBlocks = Array.isArray(item.streamBlocks) ? [...item.streamBlocks] : []
              streamBlocks.push({ seq: ++streamSeq, type: 'text', content: cleanText })
              return {
                ...item,
                content: `${item.content || ''}${cleanText}`,
                streamBlocks,
                status: 'running',
              }
            })
          },
          onFinish: result => {
            const finalText =
              typeof result?.content === 'string'
                ? normalizeExpertBrokenTokenLines(result.content)
                : undefined
            const finalThought =
              typeof result?.thought === 'string'
                ? normalizeExpertBrokenTokenLines(sanitizeExpertStreamChunk(result.thought))
                : typeof result?.reasoning === 'string'
                  ? normalizeExpertBrokenTokenLines(sanitizeExpertStreamChunk(result.reasoning))
                  : ''
            updateTargetResponse(item => {
              const hasPendingForm = (item.toolCallHistory || []).some(
                entry => entry.name === 'interactive_form' && entry.status !== 'done',
              )
              return {
                ...item,
                status: hasPendingForm ? 'waiting_input' : 'done',
                content: finalText ?? item.content ?? '',
                thought: finalThought || item.thought || '',
              }
            })
            syncTopLevelFromPreferred()
          },
          onError: error => {
            updateTargetResponse(item => ({
              ...item,
              status: 'error',
              error: error?.message || 'Failed',
            }))
            syncTopLevelFromPreferred()
          },
        })
      } catch (e) {
        console.error('Expert form submission stream failed', e)
        updateTargetResponse(item => ({
          ...item,
          status: 'error',
          error: e?.message || 'Failed',
        }))
      } finally {
        syncTopLevelFromPreferred()
        set({ isLoading: false, abortController: null })

        try {
          const currentMessages = get().messages || []
          const currentLast = currentMessages[currentMessages.length - 1]
          if (currentLast?.id) {
            const finalResponses = Array.isArray(currentLast.expertResponses)
              ? currentLast.expertResponses
              : []
            const preferredResponse =
              finalResponses.find(item => item.status === 'done' && item.content?.trim()) ||
              finalResponses.find(
                item => item.status === 'waiting_input' && item.content?.trim(),
              ) ||
              finalResponses.find(item => item.content?.trim()) ||
              null

            const planBlocks =
              typeof currentLast.expertPlan === 'string' && currentLast.expertPlan.trim()
                ? [{ seq: 1, type: 'workflow_text', content: currentLast.expertPlan }]
                : []
            const responseBlocks = Array.isArray(preferredResponse?.streamBlocks)
              ? preferredResponse.streamBlocks
              : []
            const normalizedResponseBlocks = responseBlocks.map((block, index) => ({
              ...block,
              seq: Number.isFinite(block?.seq) ? Number(block.seq) : index + 1,
            }))
            const hasWorkflowBlock = normalizedResponseBlocks.some(
              block => String(block?.type || '').toLowerCase() === 'workflow_text',
            )
            const mergedBlocks =
              hasWorkflowBlock || planBlocks.length === 0
                ? normalizedResponseBlocks
                : [
                    ...planBlocks,
                    ...normalizedResponseBlocks.map(block => ({
                      ...block,
                      seq: Number(block.seq) + planBlocks.length,
                    })),
                  ]

            const expertThinkingPayload = JSON.stringify({
              expertMode: true,
              expertPlan: currentLast.expertPlan || '',
              expertResponses: finalResponses,
              expertActiveAgentId: currentLast.expertActiveAgentId || '',
            })
            const databaseProviderKey = String(settings?.databaseProvider || '').toLowerCase()
            const shouldPersistStreamBlocks =
              databaseProviderKey.includes('sqlite') ||
              databaseProviderKey.includes('supabase') ||
              databaseProviderKey.includes('postgres')

            await updateMessageById(currentLast.id, {
              content: sanitizeJson(currentLast.content || ''),
              thinking_process: expertThinkingPayload,
              tool_call_history: sanitizeJson(
                preferredResponse && Array.isArray(preferredResponse.toolCallHistory)
                  ? preferredResponse.toolCallHistory
                  : [],
              ),
              ...(shouldPersistStreamBlocks && {
                stream_blocks: sanitizeJson(mergedBlocks),
                stream_schema_version: 1,
              }),
            })
          }
        } catch (persistError) {
          console.error('Failed to persist expert HITL continuation:', persistError)
        }
      }
      return
    }

    const runId = lastAiMsg.hitlRunId || extractRunIdFromToolHistory(lastAiMsg)
    if (!runId) {
      set(state => {
        const updated = [...state.messages]
        const lastMsgIndex = updated.length - 1
        if (lastMsgIndex >= 0 && updated[lastMsgIndex].role === 'ai') {
          updated[lastMsgIndex] = {
            ...updated[lastMsgIndex],
            isError: true,
            content: `${updated[lastMsgIndex].content || ''}\n\n**Error:** Form session expired. Please ask again to regenerate the form.`,
          }
        }
        return { messages: updated, isLoading: false }
      })
      return
    }

    // 1. Mark the form tool as done to transition the UI badge to "Submitted"
    set(state => {
      const updated = [...state.messages]
      const lastMsgIndex = updated.length - 1
      if (
        lastMsgIndex >= 0 &&
        updated[lastMsgIndex].role === 'ai' &&
        updated[lastMsgIndex].toolCallHistory
      ) {
        const tools = [...updated[lastMsgIndex].toolCallHistory]
        // Find the most recent interactive_form that isn't done
        const formToolIndex = tools.findIndex(
          t => t.name === 'interactive_form' && t.status !== 'done',
        )
        if (formToolIndex !== -1) {
          tools[formToolIndex] = {
            ...tools[formToolIndex],
            status: 'done',
            result: JSON.stringify(formData.values), // Fixed: use 'values' instead of 'field_values'
          }
          updated[lastMsgIndex] = { ...updated[lastMsgIndex], toolCallHistory: tools }
        }
      }
      return { messages: updated }
    })

    // 2. Resume streaming with run_id and field_values
    // We reuse the existing AI message and append to it
    const effectiveAgent = (() => {
      // Find the original agent that triggered the form
      if (lastAiMsg?.agentId) {
        const formAgent = agents?.find(a => a.id === lastAiMsg.agentId)
        if (formAgent) return formAgent
      }
      return selectedAgent || agents?.find(agent => agent.isDefault)
    })()

    set({ isLoading: true })

    const fallbackAgent = agents?.find(agent => agent.isDefault)
    const summaryModelConfig = getModelConfigForAgent(
      effectiveAgent,
      settings,
      'sessionContentSummary',
      fallbackAgent,
    )

    try {
      // Call AI API with run_id and field_values
      // The backend rebuilds continuation messages and resumes with stream arun.
      await callAIAPI(
        [], // No context messages needed (continuation uses stored state)
        null, // No placeholder (we append to existing message)
        settings,
        toggles,
        null, // callbacks
        [], // spaces
        spaceInfo,
        effectiveAgent,
        agents,
        '', // preselectedTitle
        [], // emojis
        get,
        set,
        messages.length - 1, // Target index: the last AI message
        '', // firstUserText
        [], // documentSources
        false, // isAgentAutoMode
        'general', // researchType
        summaryModelConfig, // Pass session summary config for HITL
        runId, // HITL run_id (new parameter)
        formData.values, // HITL field_values (new parameter)
      )
    } catch (e) {
      console.error('Form submission stream failed', e)
      set({ isLoading: false })
    }
  },

  /**
   * Sends a message to AI and handles the complete chat flow
   *
   * @param {Object} params - Message parameters
   * @param {string} params.text - The message text to send
   * @param {Array} params.attachments - File attachments (optional)
   * @param {Object} params.toggles - Feature toggles { search, thinking }
   * @param {Object} params.spaceInfo - Space selection information { selectedSpace, isManualSpaceSelection }
   * @param {Object|null} params.selectedAgent - Currently selected agent (optional)
   * @param {boolean} params.isAgentAutoMode - Whether agent selection is in auto mode (agent preselects every message, space/title only on first turn)
   * @param {Array} params.agents - Available agents list (optional)
   * @param {string} params.documentContextAppend - Optional document information appended to user question
   * @param {Array} params.documentSources - Optional metadata for document references (used by UI)
   * @param {Object|null} params.documentSelection - Optional document selection context
   * @param {Array} params.documentSelection.documents - Selected documents for retrieval
   * @param {boolean} params.documentSelection.skipRetrieval - Skip retrieval when embedding config is incompatible
   * @param {Object|null} params.editingInfo - Information about message being edited { index, targetId, partnerId }
   * @param {Object|null} params.callbacks - Callback functions { onTitleAndSpaceGenerated, onSpaceResolved, onAgentResolved, onConversationReady }
   * @param {Array} params.spaces - Available spaces for auto-generation (optional)
   * @param {Object} params.quoteContext - Quote context { text, sourceContent, sourceRole }
   *
   * @returns {Promise<void>}
   *
   * Process:
   * 1. Validates input and checks for ongoing operations
   * 2. Constructs user message with attachments
   * 3. Handles message editing and history context
   * 4. Preselects space/agent/title:
   *    - Space & Title: only on first turn (isFirstTurn = true)
   *    - Agent: every message when isAgentAutoMode = true, otherwise uses selectedAgent
   * 5. Ensures conversation exists in database
   * 6. Persists user message
   * 7. Prepares AI message placeholder for streaming
   * 8. Calls AI API with streaming support
   * 9. Handles response finalization (title, space, related questions)
   */
  sendMessage: async ({
    text,
    attachments = [],
    toggles, // { search, thinking, deepResearch }
    settings, // passed from component to ensure freshness
    spaceInfo, // { selectedSpace, isManualSpaceSelection }
    selectedAgent = null, // Currently selected agent (optional)
    isAgentAutoMode = false, // Whether agent selection is in auto mode
    agents = [], // available agents list for resolving defaults
    documentContextAppend = '',
    documentSources = [],
    documentSelection = null,
    editingInfo, // { index, targetId, partnerId } (optional)
    callbacks, // { onTitleAndSpaceGenerated, onSpaceResolved } (optional)
    spaces = [], // passed from component
    quoteContext = null, // { text, sourceContent, sourceRole }
    researchType = 'general', // 'general' or 'academic' for deep research
  }) => {
    const { messages, conversationId, isLoading } = get()

    // ========================================
    // MESSAGE SENDING PIPELINE
    // ========================================

    // Step 1: Input Validation
    const validation = validateInput(text, attachments, isLoading)
    if (!validation.isValid) {
      return // Exit early if validation fails
    }

    set({ isLoading: true })

    // Step 2: Construct User Message (defer document context append until retrieval completes)
    const { userMessage } = buildUserMessage(text, attachments, quoteContext, '')
    userMessage.deepResearch = !!toggles?.deepResearch

    // When quoting, the original answer has already been embedded into textWithPrefix,
    // so we don't need to resend it as separate context.
    const historyOverride = quoteContext ? [] : null

    // Step 3: Handle Editing & History
    const { newMessages, historyForSend, idsToDelete } = handleEditingAndHistory(
      messages,
      editingInfo,
      userMessage,
      historyOverride,
    )
    set({ messages: newMessages })
    const hasEditingInfo = editingInfo?.index !== undefined && editingInfo?.index !== null
    const historyLengthBeforeSend = hasEditingInfo ? editingInfo.index : messages.length

    // Step 4: Ensure conversation exists early to sync ID
    let convInfo
    try {
      const fallbackAgent = agents?.find(agent => agent.isDefault)
      const providerOverride = selectedAgent?.provider || fallbackAgent?.provider || ''
      convInfo = await ensureConversationExists(
        conversationId,
        settings,
        toggles,
        spaceInfo,
        set,
        providerOverride,
        selectedAgent,
      )
    } catch (convError) {
      return // Early return on conversation creation failure
    }
    const convId = convInfo.id

    if (convInfo.isNew && callbacks?.onConversationReady) {
      callbacks.onConversationReady(
        convInfo.data || {
          id: convId,
          title: 'New Conversation',
          space_id: spaceInfo?.selectedSpace?.id || null,
          api_provider:
            selectedAgent?.provider || agents?.find(agent => agent.isDefault)?.provider || '',
        },
      )
    }

    // Step 5: Preselect space/agent/title
    // - Space & Title: only on first turn (isFirstTurn = true)
    // - Agent: every message when isAgentAutoMode = true, otherwise uses selectedAgent
    let resolvedSpaceInfo = spaceInfo
    // Only use selectedAgent if user manually selected one (not auto mode)
    // In auto mode, let AI choose or fallback to space default/global default
    let resolvedAgent = isAgentAutoMode ? null : selectedAgent
    let preselectedTitle = null
    let preselectedEmojis = []
    const isFirstTurn = historyLengthBeforeSend === 0 && !hasEditingInfo
    const isDeepResearchMode = !!toggles?.deepResearch
    // Only preselect space/title on first turn, never reload in existing conversations
    const shouldPreselectSpaceTitle =
      isFirstTurn &&
      !isDeepResearchMode &&
      !spaceInfo?.isManualSpaceSelection &&
      !spaceInfo?.selectedSpace &&
      text.trim()
    const shouldPreselectTitleForManual =
      isFirstTurn &&
      !isDeepResearchMode &&
      spaceInfo?.isManualSpaceSelection &&
      spaceInfo?.selectedSpace
    // In auto mode, always preselect agent (including first turn)
    // For regenerate/edit flows, skip extra auto-agent preselect network call to reduce latency.
    const shouldPreselectAgent =
      isAgentAutoMode && text.trim() && !isDeepResearchMode && !hasEditingInfo
    const shouldPreselectDeepResearchTitle = isFirstTurn && isDeepResearchMode && text.trim()
    const shouldGenerateTitleAsync =
      isFirstTurn &&
      (shouldPreselectSpaceTitle ||
        shouldPreselectTitleForManual ||
        shouldPreselectDeepResearchTitle)

    if (shouldGenerateTitleAsync) {
      ;(async () => {
        try {
          let titleResult = null
          if (shouldPreselectDeepResearchTitle) {
            titleResult = await preselectTitleForDeepResearch(text, settings, selectedAgent, agents)
          } else {
            titleResult = await preselectTitleForManual(text, settings, selectedAgent, agents)
          }
          const title = titleResult?.title
          if (!title) return

          // Conversation may have switched while async title generation was running.
          if (get().conversationId !== convId) return

          const emojis = Array.isArray(titleResult?.emojis) ? titleResult.emojis : []
          set({ conversationTitle: title, conversationTitleEmojis: emojis })
          try {
            const { data: updatedConversation, error: updateError } = await updateConversation(
              convId,
              {
                title,
                title_emojis: emojis,
              },
            )
            if (updateError) throw updateError
            notifyConversationPatched(
              updatedConversation || {
                id: convId,
                title,
                title_emojis: emojis,
              },
            )
          } catch (error) {
            console.error('Async title update failed:', error)
          }
        } catch (error) {
          console.error('Async title preselection failed:', error)
        }
      })()
    }

    // Preselect space/agent only (title runs asynchronously and does not block streaming).
    if (shouldPreselectSpaceTitle) {
      set({ isMetaLoading: true })
      try {
        const selectableSpaces = toggles?.deepResearch
          ? spaces
          : (spaces || []).filter(
              space =>
                !(space?.isDeepResearchSystem || space?.isDeepResearch || space?.is_deep_research),
            )

        // Optimization: If space is already selected (e.g. from Sidebar/Expert Mode),
        // only pass that space to avoid scanning all 9 spaces.
        const spacesToScan = spaceInfo?.selectedSpace ? [spaceInfo.selectedSpace] : selectableSpaces

        const { space, agent } = await preselectSpaceAndAgentForAuto(
          text,
          settings,
          spacesToScan,
          agents,
          selectedAgent,
        )
        if (space) {
          resolvedSpaceInfo = { ...spaceInfo, selectedSpace: space }
          callbacks?.onSpaceResolved?.(space)
        }
        if (agent) {
          resolvedAgent = agent
          callbacks?.onAgentResolved?.(agent)
        }

        // Fallback: use space default agent, then global default agent
        if (!resolvedAgent) {
          const fallbackAgent = await resolveFallbackAgent(space, agents)
          if (fallbackAgent) {
            resolvedAgent = fallbackAgent
            callbacks?.onAgentResolved?.(fallbackAgent)
          }
        }
      } catch (error) {
        console.error('Preselection failed:', error)
      } finally {
        set({ isMetaLoading: false })
      }
    }

    // Preselect agent silently without affecting title/space loading state
    if (shouldPreselectAgent && !shouldPreselectSpaceTitle) {
      set({ isAgentPreselecting: true })
      try {
        // Get the current space for agent preselection
        const currentSpaceForAgent = resolvedSpaceInfo?.selectedSpace || spaceInfo?.selectedSpace
        let agentPreselected = false

        if (currentSpaceForAgent) {
          // Build space-agent options for the current space
          const spaceAgents = await buildSpaceAgentOptions([currentSpaceForAgent], agents)
          const spaceWithAgents = {
            label: currentSpaceForAgent.label,
            description: currentSpaceForAgent.description,
            agents: spaceAgents[0]?.agents || [],
          }

          // Use selected agent if available, otherwise use global default agent for agent preselection
          // Global default agent always exists (cannot be deleted)
          const fallbackAgent = agents?.find(agent => agent.isDefault)
          const agentForPreselection = selectedAgent || fallbackAgent
          const modelConfig = getModelConfigForAgent(
            agentForPreselection,
            settings,
            'generateTitleAndSpace',
            fallbackAgent,
          )
          const provider = getProvider(modelConfig.provider)
          const credentials = provider.getCredentials(settings)
          const languageInstruction = getLanguageInstruction(agentForPreselection, settings)
          const promptText = applyLanguageInstructionToText(text, languageInstruction)

          if (provider.generateAgentForAuto && credentials?.apiKey) {
            const { agentName } = await provider.generateAgentForAuto(
              promptText,
              spaceWithAgents,
              credentials.apiKey,
              credentials.baseUrl,
              modelConfig.model,
            )
            if (agentName) {
              // Find the agent from the current space's agents
              const agentCandidate = (spaceWithAgents.agents || []).find(a => {
                const name = typeof a === 'string' ? a : a?.name
                return String(name) === String(agentName)
              })
              if (agentCandidate) {
                // Find the full agent object from the agents list
                const agentNameForMatch =
                  typeof agentCandidate === 'string' ? agentCandidate : agentCandidate?.name
                const matchedAgent = (agents || []).find(
                  a => String(a.name) === String(agentNameForMatch),
                )
                if (matchedAgent) {
                  resolvedAgent = matchedAgent
                  agentPreselected = true
                  callbacks?.onAgentResolved?.(matchedAgent)
                }
              }
            }
          } else if (provider.generateAgentForAuto && !credentials?.apiKey) {
            console.warn(
              `[AgentAuto] Skip auto agent preselection for provider "${modelConfig.provider}" because API key is missing.`,
            )
          }
        }

        // Fallback: space default agent, then global default agent
        if (!agentPreselected && !resolvedAgent) {
          const fallbackAgent = await resolveFallbackAgent(currentSpaceForAgent, agents)
          if (fallbackAgent) {
            resolvedAgent = fallbackAgent
            callbacks?.onAgentResolved?.(fallbackAgent)
          }
        }
      } catch (error) {
        console.error('Agent preselection failed:', error)
      } finally {
        set({ isAgentPreselecting: false })
      }
    }

    // Step 6: Final fallback for agent (defensive)
    if (toggles?.expertMode && toggles?.leaderAgentId) {
      // In Expert Mode, if a leader is explicitly specified, use it
      const expertLeader = (agents || []).find(a => String(a.id) === String(toggles.leaderAgentId))
      if (expertLeader) {
        resolvedAgent = expertLeader
        callbacks?.onAgentResolved?.(expertLeader)
      }
    }

    if (!resolvedAgent) {
      const fallbackAgent = await resolveFallbackAgent(resolvedSpaceInfo?.selectedSpace, agents)
      if (fallbackAgent) {
        resolvedAgent = fallbackAgent
        callbacks?.onAgentResolved?.(fallbackAgent)
      }
    }

    // Ensure thinking toggle reflects the resolved agent (auto mode can resolve late).
    const resolvedToggles = (() => {
      const next = { ...toggles }
      if (next.expertMode) {
        // Expert mode defaults to reasoning-enabled execution per-agent.
        next.thinking = true
      }
      // Debug: log toggles
      console.log('[Debug] resolvedToggles:', {
        leaderAgentId: next.leaderAgentId,
        memberAgentIds: next.memberAgentIds,
      })
      const fallbackAgent = agents?.find(agent => agent.isDefault)
      const modelConfig = getModelConfigForAgent(
        resolvedAgent || fallbackAgent,
        settings,
        'streamChatCompletion',
        fallbackAgent,
      )
      const thinkingRule = resolveThinkingToggleRule(modelConfig.provider, modelConfig.model)
      if (thinkingRule.isLocked) {
        next.thinking = thinkingRule.isThinkingActive
      }
      return next
    })()

    // Cache optimistic selections for route handoff on first turn
    if (isFirstTurn) {
      set({
        optimisticSelection: {
          conversationId: convId,
          space: resolvedSpaceInfo?.selectedSpace || null,
          isManualSpaceSelection: !!resolvedSpaceInfo?.isManualSpaceSelection,
          agentId: resolvedAgent?.id || null,
          isAgentAutoMode,
        },
      })
    }

    // Step 7: Persist User Message
    if (convId) {
      // Pass idsToDelete to persist function to ensure DB consistency
      await persistUserMessage(convId, editingInfo, userMessage.content, set, idsToDelete)
    }

    const isExpertMode = Boolean(resolvedToggles?.expertMode)
    const selectedSpaceId = resolvedSpaceInfo?.selectedSpace?.id

    if (isExpertMode && selectedSpaceId) {
      try {
        let expertAgents = []
        if (Array.isArray(resolvedToggles?.memberAgentIds)) {
          // Use explicitly selected members
          const memberIds = resolvedToggles.memberAgentIds.map(id => String(id))
          expertAgents = (agents || []).filter(agent => memberIds.includes(String(agent.id)))
        } else {
          // Fallback: use all agents in the space
          const { data: spaceAgentRows, error: spaceAgentsError } =
            await listSpaceAgents(selectedSpaceId)

          if (!spaceAgentsError) {
            const spaceAgentIds = (spaceAgentRows || []).map(item => String(item.agent_id))
            expertAgents = (agents || []).filter(agent => spaceAgentIds.includes(String(agent.id)))
          }
        }

        if (expertAgents.length >= 0) {
          // Allow 0 members if leader only (though UI usually forces team)
          const expertMessageLocalId = `expert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          appendAIPlaceholder(resolvedAgent, resolvedToggles, [], set)
          set(state => {
            const updated = [...state.messages]
            const lastMsgIndex = updated.length - 1
            if (lastMsgIndex >= 0 && updated[lastMsgIndex].role === 'ai') {
              updated[lastMsgIndex] = {
                ...updated[lastMsgIndex],
                localId: expertMessageLocalId,
                expertMode: true,
                expertPlanLoading: false,
                expertPlan: '',
                expertResponses: [],
                expertActiveAgentId: '',
              }
            }
            return { messages: updated }
          })

          const updateExpertMessage = updater => {
            set(state => {
              const updated = [...state.messages]
              const targetIndex = updated.findIndex(
                msg => msg.role === 'ai' && msg.localId === expertMessageLocalId,
              )
              if (targetIndex < 0) return { messages: updated }
              const current = { ...updated[targetIndex] }
              updated[targetIndex] = updater(current)
              return { messages: updated }
            })
          }

          const combinedContextAppend = [documentContextAppend].filter(Boolean).join('\n\n')
          const { payloadContent } = buildUserMessage(
            text,
            attachments,
            quoteContext,
            combinedContextAppend,
          )
          const userMessageForSend = { ...userMessage, content: payloadContent }
          const fallbackAgent = agents.find(agent => agent.isDefault)

          // Get leader agent from toggles.leaderAgentId (not resolvedAgent which may be wrong)
          const leaderAgent = resolvedToggles?.leaderAgentId
            ? (agents || []).find(a => String(a.id) === String(resolvedToggles.leaderAgentId))
            : null

          updateExpertMessage(current => ({
            ...current,
            expertActiveAgentId: leaderAgent?.id || resolvedAgent?.id || 'leader',
            expertResponses: [
              {
                agentId: leaderAgent?.id || resolvedAgent?.id || 'leader',
                agentName: leaderAgent?.name || resolvedAgent?.name || 'Team',
                agentEmoji: leaderAgent?.emoji || resolvedAgent?.emoji || '🤝',
                agentRole: 'leader',
                task: 'Leader Correlation',
                provider: leaderAgent?.provider || null,
                model: leaderAgent?.defaultModel || null,
                status: 'pending',
                content: '',
                thought: '',
                thoughtHistory: [],
                toolCallHistory: [],
                streamBlocks: [],
                searchBackend:
                  typeof resolvedToggles?.searchBackend === 'string'
                    ? resolvedToggles.searchBackend
                    : null,
                searchBackends: Array.isArray(resolvedToggles?.searchBackends)
                  ? resolvedToggles.searchBackends
                  : [],
                error: null,
              },
              ...expertAgents.map(agent => ({
                agentId: agent.id,
                agentName: agent.name || '',
                agentEmoji: agent.emoji || '',
                agentRole: 'member',
                task: 'Expert Task',
                provider: agent.provider || null,
                model: agent.defaultModel || null,
                status: 'pending',
                content: '',
                thought: '',
                thoughtHistory: [],
                toolCallHistory: [],
                streamBlocks: [],
                searchBackend:
                  typeof resolvedToggles?.searchBackend === 'string'
                    ? resolvedToggles.searchBackend
                    : null,
                searchBackends: Array.isArray(resolvedToggles?.searchBackends)
                  ? resolvedToggles.searchBackends
                  : [],
                error: null,
              })),
            ],
          }))

          const controller = new AbortController()
          set({ abortController: controller })

          // Initialize per-agent stream states
          const streamStates = new Map()
          const getAgentStreamState = agentId => {
            const key = agentId || 'leader'
            if (!streamStates.has(key)) {
              streamStates.set(key, {
                streamSeq: 0,
                thoughtStreamOrder: 0,
                toolStreamOrder: 0,
                toolStartedAt: new Map(),
                lastReasoningAtMs: null,
              })
            }
            return streamStates.get(key)
          }

          const extractChunkText = chunk => {
            if (typeof chunk === 'string') return chunk
            if (!chunk || typeof chunk !== 'object') return ''
            if (chunk.type === 'reasoning') return ''
            if (chunk.type === 'thought') return ''
            if (chunk.type === 'thinking') return ''
            if (chunk.type === 'tool_call' || chunk.type === 'tool_result') return ''
            if (chunk.type === 'research_step' || chunk.type === 'form_request') return ''
            if (chunk.type === 'text' && typeof chunk.content === 'string') return chunk.content
            if (chunk.type && chunk.type !== 'text') return ''
            if (typeof chunk.text === 'string') return chunk.text
            if (typeof chunk.delta === 'string') return chunk.delta
            if (typeof chunk.delta?.reasoning_content !== 'undefined') return ''
            if (typeof chunk.reasoning_content !== 'undefined') return ''
            if (typeof chunk.delta?.content === 'string') return chunk.delta.content
            if (typeof chunk.message?.content === 'string') return chunk.message.content
            if (typeof chunk.choices?.[0]?.delta?.content === 'string') {
              return chunk.choices[0].delta.content
            }
            return ''
          }

          const extractReasoningText = chunk => {
            if (!chunk || typeof chunk !== 'object') return ''
            if (
              chunk.type !== 'reasoning' &&
              chunk.type !== 'thought' &&
              chunk.type !== 'thinking'
            ) {
              return ''
            }
            if (typeof chunk.content === 'string') return chunk.content
            if (typeof chunk.text === 'string') return chunk.text
            if (typeof chunk.reasoning === 'string') return chunk.reasoning
            if (typeof chunk.reasoning_content !== 'undefined') {
              return readReasoningField(chunk.reasoning_content)
            }
            if (typeof chunk.delta === 'string') return chunk.delta
            if (typeof chunk.delta?.reasoning_content !== 'undefined') {
              return readReasoningField(chunk.delta.reasoning_content)
            }
            if (typeof chunk.delta?.content === 'string') return chunk.delta.content
            if (typeof chunk.choices?.[0]?.delta?.reasoning_content !== 'undefined') {
              return readReasoningField(chunk.choices[0].delta.reasoning_content)
            }
            return ''
          }

          let finalOverallResponses = []

          const modelConfig = getModelConfigForAgent(
            resolvedAgent,
            settings,
            'streamChatCompletion',
            fallbackAgent,
          )
          const provider = getProvider(modelConfig.provider)

          const runTeamTask = async () => {
            return new Promise(async (resolve, reject) => {
              const credentials = provider.getCredentials(settings)
              const searchProvider = settings.searchProvider || 'tavily'
              const searchBackends = Array.isArray(resolvedToggles?.searchBackends)
                ? resolvedToggles.searchBackends.map(item => String(item)).filter(Boolean)
                : typeof resolvedToggles?.searchBackend === 'string' &&
                    resolvedToggles.searchBackend
                  ? [String(resolvedToggles.searchBackend)]
                  : []
              const searchBackend = searchBackends[0] || null

              let activeUserTools = []
              try {
                const allUserTools = await getUserTools()
                const resolvedToolIds = (() => {
                  if (Array.isArray(resolvedAgent?.toolIds) && resolvedAgent.toolIds.length > 0)
                    return resolvedAgent.toolIds
                  if (Array.isArray(resolvedAgent?.tool_ids) && resolvedAgent.tool_ids.length > 0)
                    return resolvedAgent.tool_ids
                  return []
                })()
                if (Array.isArray(allUserTools) && resolvedToolIds.length > 0) {
                  activeUserTools = allUserTools
                    .filter(t => resolvedToolIds.includes(String(t.id)))
                    .filter(t => !t.config?.disabled)
                }
              } catch (e) {
                console.error('Failed to resolve user tools', e)
              }

              const conversationMessagesWithPlan = buildConversationMessages(
                historyForSend,
                userMessageForSend,
                resolvedAgent,
                settings,
              )

              try {
                await provider.streamChatCompletion({
                  ...credentials,
                  model: modelConfig.model,
                  messages: conversationMessagesWithPlan.map(m => {
                    const role = m.role === 'ai' ? 'assistant' : m.role
                    return {
                      role,
                      content: m.content,
                      ...(m.tool_calls && { tool_calls: m.tool_calls }),
                      ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
                      ...(m.name && { name: m.name }),
                    }
                  }),
                  tools: provider.getTools(
                    Boolean(resolvedToggles?.search),
                    resolvedToggles?.search ? resolvedToggles?.searchTool : [],
                    Boolean(settings.enableLongTermMemory),
                  ),
                  toolIds: resolvedAgent?.toolIds || resolvedAgent?.tool_ids || [],
                  userTools: activeUserTools,
                  enableLongTermMemory: Boolean(settings.enableLongTermMemory),
                  databaseProvider: settings.databaseProvider || '',
                  contextTurns: settings.contextTurns,
                  searchProvider,
                  searchBackend,
                  expertMode: true,
                  teamMode: resolvedToggles?.teamMode || 'route',
                  leaderAgentId: resolvedToggles?.leaderAgentId || null,
                  teamAgentIds: expertAgents.map(a => String(a.id)),
                  memoryProvider: modelConfig.provider,
                  memoryModel: modelConfig.model,
                  memoryApiKey: credentials.apiKey,
                  memoryBaseUrl: credentials.baseUrl,
                  thinking: provider.getThinking(
                    Boolean(resolvedToggles?.thinking),
                    modelConfig.model,
                  ),
                  signal: controller.signal,
                  onChunk: chunk => {
                    const chunkAgentId = chunk?.agentId || resolvedAgent?.id || 'leader'

                    // Always try to make the streaming agent active
                    if (chunkAgentId) {
                      updateExpertMessage(current => ({
                        ...current,
                        expertActiveAgentId: chunkAgentId,
                      }))
                    }

                    const st = getAgentStreamState(chunkAgentId)
                    const reasoningText = extractReasoningText(chunk)

                    // Handle Agent Status Event
                    if (chunk?.type === 'agent_status' && chunk?.status) {
                      const newStatus = chunk.status
                      const targetId = chunk.agentId || chunkAgentId
                      updateExpertMessage(current => ({
                        ...current,
                        expertResponses: (current.expertResponses || []).map(item =>
                          String(item.agentId) === String(targetId)
                            ? { ...item, status: newStatus }
                            : item,
                        ),
                      }))
                      return
                    }

                    // Update agent status from other events if provided
                    if (chunk?.agent_status) {
                      updateExpertMessage(current => ({
                        ...current,
                        expertResponses: (current.expertResponses || []).map(item =>
                          String(item.agentId) === String(chunkAgentId)
                            ? { ...item, status: chunk.agent_status }
                            : item,
                        ),
                      }))
                    }

                    if (reasoningText) {
                      const cleanThought = sanitizeExpertStreamChunk(reasoningText)
                      if (!cleanThought) return
                      const now = Date.now()
                      const durationMs =
                        typeof chunk?.duration_ms === 'number'
                          ? chunk.duration_ms
                          : st.lastReasoningAtMs
                            ? Math.max(0, now - st.lastReasoningAtMs)
                            : 0
                      st.lastReasoningAtMs = now

                      updateExpertMessage(current => {
                        return {
                          ...current,
                          expertActiveAgentId:
                            chunkAgentId === 'leader' ? current.expertActiveAgentId : chunkAgentId,
                          expertResponses: (current.expertResponses || []).map(item => {
                            if (String(item.agentId) !== String(chunkAgentId)) return item
                            const thoughtHistory = Array.isArray(item.thoughtHistory)
                              ? [...item.thoughtHistory]
                              : []
                            const existingIdx = thoughtHistory.findIndex(entry => entry.content)
                            if (existingIdx >= 0) {
                              thoughtHistory[thoughtHistory.length - 1].content += cleanThought
                              thoughtHistory[thoughtHistory.length - 1].durationMs = Math.max(
                                0,
                                (thoughtHistory[thoughtHistory.length - 1].durationMs || 0) +
                                  durationMs,
                              )
                            } else {
                              thoughtHistory.push({
                                blockId: 1,
                                textIndex: (item.content || '').length,
                                content: cleanThought,
                                streamOrder: ++st.thoughtStreamOrder,
                                durationMs,
                              })
                            }

                            const streamBlocks = Array.isArray(item.streamBlocks)
                              ? [...item.streamBlocks]
                              : []
                            streamBlocks.push({
                              seq: ++st.streamSeq,
                              type: 'reasoning',
                              content: cleanThought,
                              duration_ms: durationMs,
                            })

                            return {
                              ...item,
                              thoughtHistory,
                              streamBlocks,
                              thought: (item.thought || '') + cleanThought,
                            }
                          }),
                        }
                      })
                      return
                    }

                    if (
                      chunk &&
                      typeof chunk === 'object' &&
                      (chunk.type === 'tool_call' || chunk.type === 'tool_call_started')
                    ) {
                      updateExpertMessage(current => ({
                        ...current,
                        expertActiveAgentId:
                          chunkAgentId === 'leader' ? current.expertActiveAgentId : chunkAgentId,
                        expertResponses: (current.expertResponses || []).map(item => {
                          if (String(item.agentId) !== String(chunkAgentId)) return item
                          const nextToolId = chunk.id || `${chunk.name || 'tool'}-${Date.now()}`
                          const toolCallHistory = Array.isArray(item.toolCallHistory)
                            ? [...item.toolCallHistory]
                            : []
                          const toolName = chunk.name || 'tool'

                          toolCallHistory.push({
                            id: nextToolId,
                            name: toolName,
                            arguments: chunk.arguments || '',
                            status: 'calling',
                            durationMs: null,
                            textIndex: (item.content || '').length,
                            step: typeof chunk.step === 'number' ? chunk.step : undefined,
                            total: typeof chunk.total === 'number' ? chunk.total : undefined,
                            streamOrder: ++st.toolStreamOrder,
                          })
                          st.toolStartedAt.set(nextToolId, Date.now())
                          const streamBlocks = Array.isArray(item.streamBlocks)
                            ? [...item.streamBlocks]
                            : []
                          streamBlocks.push({
                            seq: ++st.streamSeq,
                            type: 'tool_call',
                            tool_call_id: nextToolId,
                            name: toolName,
                            arguments: chunk.arguments || '',
                            status: 'calling',
                          })
                          return { ...item, toolCallHistory, streamBlocks }
                        }),
                      }))
                      return
                    }

                    if (
                      chunk &&
                      typeof chunk === 'object' &&
                      (chunk.type === 'tool_result' || chunk.type === 'tool_call_completed')
                    ) {
                      updateExpertMessage(current => ({
                        ...current,
                        expertActiveAgentId:
                          chunkAgentId === 'leader' ? current.expertActiveAgentId : chunkAgentId,
                        expertResponses: (current.expertResponses || []).map(item => {
                          if (String(item.agentId) !== String(chunkAgentId)) return item
                          const toolCallHistory = Array.isArray(item.toolCallHistory)
                            ? [...item.toolCallHistory]
                            : []
                          const targetIndex = toolCallHistory.findIndex(entry =>
                            chunk.id ? entry.id === chunk.id : entry.name === chunk.name,
                          )
                          const resolveDuration = (startedAt, incoming) => {
                            if (typeof incoming === 'number') return incoming
                            if (typeof startedAt === 'number') return Date.now() - startedAt
                            return null
                          }
                          if (targetIndex >= 0) {
                            const targetId = toolCallHistory[targetIndex].id
                            const startedAt = st.toolStartedAt.get(targetId)
                            if (targetId) st.toolStartedAt.delete(targetId)
                            toolCallHistory[targetIndex] = {
                              ...toolCallHistory[targetIndex],
                              status: chunk.status || 'done',
                              error: chunk.error || null,
                              output:
                                typeof chunk.output !== 'undefined'
                                  ? chunk.output
                                  : toolCallHistory[targetIndex].output,
                              durationMs: resolveDuration(startedAt, chunk.duration_ms),
                              step:
                                typeof chunk.step === 'number'
                                  ? chunk.step
                                  : toolCallHistory[targetIndex].step,
                              total:
                                typeof chunk.total === 'number'
                                  ? chunk.total
                                  : toolCallHistory[targetIndex].total,
                            }
                          } else {
                            const newToolId = chunk.id || `${chunk.name || 'tool'}-${Date.now()}`
                            toolCallHistory.push({
                              id: newToolId,
                              name: chunk.name || 'tool',
                              arguments: '',
                              status: chunk.status || 'done',
                              error: chunk.error || null,
                              output: typeof chunk.output !== 'undefined' ? chunk.output : null,
                              durationMs:
                                typeof chunk.duration_ms === 'number' ? chunk.duration_ms : null,
                              textIndex: (item.content || '').length,
                              step: typeof chunk.step === 'number' ? chunk.step : undefined,
                              total: typeof chunk.total === 'number' ? chunk.total : undefined,
                              streamOrder: ++st.toolStreamOrder,
                            })
                          }
                          const streamBlocks = Array.isArray(item.streamBlocks)
                            ? [...item.streamBlocks]
                            : []
                          streamBlocks.push({
                            seq: ++st.streamSeq,
                            type: 'tool_result',
                            tool_call_id: chunk.id || null,
                            name: chunk.name || 'tool',
                            status: chunk.status || 'done',
                            output: typeof chunk.output !== 'undefined' ? chunk.output : null,
                            error: chunk.error || null,
                            duration_ms:
                              typeof chunk.duration_ms === 'number' ? chunk.duration_ms : null,
                          })
                          return { ...item, toolCallHistory, streamBlocks }
                        }),
                      }))
                      return
                    }

                    const chunkText = extractChunkText(chunk)
                    if (!chunkText) return
                    const cleanText = sanitizeExpertStreamChunk(chunkText)
                    if (!cleanText) return

                    updateExpertMessage(current => {
                      const updated = {
                        ...current,
                        expertActiveAgentId: chunkAgentId,
                        expertResponses: (current.expertResponses || []).map(item =>
                          String(item.agentId) === String(chunkAgentId)
                            ? {
                                ...item,
                                content: `${item.content || ''}${cleanText}`,
                                streamBlocks: Array.isArray(item.streamBlocks)
                                  ? [
                                      ...item.streamBlocks,
                                      { seq: ++st.streamSeq, type: 'text', content: cleanText },
                                    ]
                                  : [{ seq: ++st.streamSeq, type: 'text', content: cleanText }],
                              }
                            : item,
                        ),
                      }

                      if (
                        String(chunkAgentId) === String(resolvedAgent?.id) ||
                        chunkAgentId === 'leader'
                      ) {
                        updated.content = `${current.content || ''}${cleanText}`
                        updated.streamBlocks = [
                          ...(current.streamBlocks || []),
                          { seq: ++st.streamSeq, type: 'text', content: cleanText },
                        ]
                      }

                      return updated
                    })
                  },
                  onFinish: result => {
                    finalOverallResponses = result
                    resolve()
                  },
                  onError: error => {
                    reject(error)
                  },
                })
              } catch (error) {
                reject(error)
              }
            })
          }

          // Execute Team in backend
          await runTeamTask()

          const finalMessage = (get().messages || []).find(
            msg => msg.role === 'ai' && msg.localId === expertMessageLocalId,
          )
          const finalResponsesRaw = Array.isArray(finalMessage?.expertResponses)
            ? finalMessage.expertResponses
            : []
          const finalResponses = finalResponsesRaw.map(item => ({
            ...item,
            status: 'done',
            content:
              typeof item?.content === 'string'
                ? normalizeExpertBrokenTokenLines(item.content)
                : item?.content || '',
            thought:
              typeof item?.thought === 'string'
                ? normalizeExpertBrokenTokenLines(item.thought)
                : item?.thought || '',
          }))

          const fallbackText = normalizeExpertBrokenTokenLines(
            finalMessage?.content || 'All expert agents finished responding.',
          )
          const activeAgentId = String(finalResponses[0]?.agentId || expertAgents[0]?.id || '')

          updateExpertMessage(current => ({
            ...current,
            content: fallbackText,
            expertPlanLoading: false,
            expertActiveAgentId: 'leader',
            expertResponses: finalResponses.map(r => ({ ...r, status: 'idle' })),
          }))

          const expertThinkingPayload = JSON.stringify({
            expertMode: true,
            expertPlan: '',
            expertResponses: finalResponses,
            expertActiveAgentId: activeAgentId,
          })

          const databaseProviderKey = String(settings?.databaseProvider || '').toLowerCase()
          const shouldPersistStreamBlocks =
            databaseProviderKey.includes('sqlite') ||
            databaseProviderKey.includes('supabase') ||
            databaseProviderKey.includes('postgres')

          const aiPayload = {
            conversation_id: convId,
            role: 'assistant',
            provider: modelConfig?.provider || fallbackAgent?.provider || '',
            model:
              modelConfig?.defaultModel ||
              modelConfig?.default_model ||
              fallbackAgent?.defaultModel ||
              '',
            agent_id: resolvedAgent?.id || null,
            agent_name: resolvedAgent?.name || null,
            agent_emoji: resolvedAgent?.emoji || '',
            agent_is_default: !!resolvedAgent?.isDefault,
            content: sanitizeJson(fallbackText),
            thinking_process: expertThinkingPayload,
            tool_call_history: sanitizeJson([]),
            ...(shouldPersistStreamBlocks && {
              stream_blocks: sanitizeJson(finalMessage?.streamBlocks || []),
              stream_schema_version: 1,
            }),
            document_sources: sanitizeJson(null),
            created_at: new Date().toISOString(),
          }
          const { data: insertedAi } = await addMessage(aiPayload)

          if (insertedAi?.id) {
            updateExpertMessage(current => ({
              ...current,
              id: insertedAi.id,
              created_at: insertedAi.created_at,
            }))
          }

          if (convId) {
            try {
              const { data: updatedConversation, error: updateError } = await updateConversation(
                convId,
                {
                  space_id: resolvedSpaceInfo?.selectedSpace?.id || null,
                  api_provider: resolvedAgent?.provider || fallbackAgent?.provider || '',
                  last_agent_id: resolvedAgent?.id || null,
                  agent_selection_mode: isAgentAutoMode ? 'auto' : 'manual',
                },
              )
              if (updateError) throw updateError
              notifyConversationPatched(
                updatedConversation || {
                  id: convId,
                  space_id: resolvedSpaceInfo?.selectedSpace?.id || null,
                  api_provider: resolvedAgent?.provider || fallbackAgent?.provider || '',
                  last_agent_id: resolvedAgent?.id || null,
                  agent_selection_mode: isAgentAutoMode ? 'auto' : 'manual',
                },
              )
            } catch (error) {
              console.error('Failed to update conversation after expert mode:', error)
            }
          }

          set({ abortController: null, isLoading: false })
          return
        }
      } catch (error) {
        console.error('Expert mode execution failed:', error)
        const expertErrorMessage = error?.message || 'Expert mode execution failed.'
        set(state => {
          const updated = [...state.messages]
          const lastMsgIndex = updated.length - 1
          if (lastMsgIndex >= 0 && updated[lastMsgIndex].role === 'ai') {
            updated[lastMsgIndex] = {
              ...updated[lastMsgIndex],
              expertPlanLoading: false,
              expertPlan: expertErrorMessage,
              isError: true,
            }
          }
          return { messages: updated }
        })
        set({ abortController: null, isLoading: false })
        return
      }
    }

    const baseDocumentSources = Array.isArray(documentSources) ? documentSources : []
    const selectedDocuments = Array.isArray(documentSelection?.documents)
      ? documentSelection.documents
      : []
    const shouldRetrieveDocs =
      !documentSelection?.skipRetrieval && selectedDocuments.length > 0 && text.trim()
    // Step 8: Create AI Placeholder (shows immediately, then we run retrieval)
    const aiMessagePlaceholder = appendAIPlaceholder(
      resolvedAgent,
      resolvedToggles,
      baseDocumentSources,
      set,
    )

    // Ensure the placeholder shows the resolved agent's provider/model immediately (avoid flicker).
    const placeholderFallbackAgent = agents?.find(agent => agent.isDefault)
    const placeholderModelConfig = getModelConfigForAgent(
      resolvedAgent || placeholderFallbackAgent,
      settings,
      'streamChatCompletion',
      placeholderFallbackAgent,
    )
    if (placeholderModelConfig?.provider || placeholderModelConfig?.model) {
      set(state => {
        const updated = [...state.messages]
        const lastMsgIndex = updated.length - 1
        if (lastMsgIndex < 0 || updated[lastMsgIndex].role !== 'ai') {
          return { messages: updated }
        }
        const lastMsg = { ...updated[lastMsgIndex] }
        lastMsg.provider = placeholderModelConfig.provider || lastMsg.provider
        lastMsg.model = placeholderModelConfig.model || lastMsg.model
        updated[lastMsgIndex] = lastMsg
        return { messages: updated }
      })
    }

    let resolvedDocumentSources = baseDocumentSources
    let resolvedDocumentContextAppend = documentContextAppend

    if (shouldRetrieveDocs) {
      const toolCallId = `document-search-${Date.now()}`
      const toolStart = Date.now()

      set(state => {
        const updated = [...state.messages]
        const lastMsgIndex = updated.length - 1
        if (lastMsgIndex < 0 || updated[lastMsgIndex].role !== 'ai') {
          return { messages: updated }
        }
        const lastMsg = { ...updated[lastMsgIndex] }
        const history = Array.isArray(lastMsg.toolCallHistory) ? [...lastMsg.toolCallHistory] : []
        history.push({
          id: toolCallId,
          name: 'document_search',
          arguments: JSON.stringify({ query: '' }),
          status: 'calling',
          durationMs: null,
          textIndex: 0,
        })
        lastMsg.toolCallHistory = history
        updated[lastMsgIndex] = lastMsg
        return { messages: updated }
      })

      let queryText = ''
      let toolStatus = 'done'
      let toolError = null
      try {
        queryText = await selectDocumentQuery({
          question: text,
          historyForSend,
          documents: selectedDocuments,
          settings,
          selectedAgent: resolvedAgent,
          agents,
        })
      } catch (error) {
        console.error('Failed to select document query:', error)
        toolStatus = 'error'
        toolError = error?.message || 'Query selection failed'
      }

      if (queryText && toolStatus !== 'error') {
        try {
          const dynamicChunkLimit = Math.min(
            DOCUMENT_RETRIEVAL_CHUNK_LIMIT * Math.max(1, selectedDocuments.length),
            2000,
          )
          const retrieval = await fetchDocumentChunkContext({
            documents: selectedDocuments,
            queryText,
            chunkLimit: dynamicChunkLimit,
            topChunks: DOCUMENT_RETRIEVAL_TOP_CHUNKS,
          })
          if (retrieval?.sources?.length) {
            resolvedDocumentSources = retrieval.sources
            resolvedDocumentContextAppend = formatDocumentAppendText(retrieval.sources)
          }
        } catch (error) {
          console.error('Document retrieval failed:', error)
          toolStatus = 'error'
          toolError = error?.message || 'Document retrieval failed'
          resolvedDocumentSources = baseDocumentSources
          resolvedDocumentContextAppend = ''
        }
      } else if (!queryText) {
        resolvedDocumentSources = baseDocumentSources
        resolvedDocumentContextAppend = ''
      }

      set(state => {
        const updated = [...state.messages]
        const lastMsgIndex = updated.length - 1
        if (lastMsgIndex < 0 || updated[lastMsgIndex].role !== 'ai') {
          return { messages: updated }
        }
        const lastMsg = { ...updated[lastMsgIndex] }
        const history = Array.isArray(lastMsg.toolCallHistory) ? [...lastMsg.toolCallHistory] : []
        const targetIndex = history.findIndex(item => item.id === toolCallId)
        const durationMs = Date.now() - toolStart
        const toolOutput = {
          query: queryText,
          sources: resolvedDocumentSources.length,
          skipped: !queryText,
          error: toolError,
        }
        if (targetIndex >= 0) {
          history[targetIndex] = {
            ...history[targetIndex],
            arguments: JSON.stringify({ query: queryText }),
            status: toolStatus,
            error: toolError,
            output: toolOutput,
            durationMs,
          }
        }
        lastMsg.toolCallHistory = history
        lastMsg.documentSources = resolvedDocumentSources
        updated[lastMsgIndex] = lastMsg
        return { messages: updated }
      })
    }

    const combinedContextAppend = [resolvedDocumentContextAppend].filter(Boolean).join('\n\n')

    const { payloadContent } = buildUserMessage(
      text,
      attachments,
      quoteContext,
      combinedContextAppend,
    )
    const userMessageForSend = { ...userMessage, content: payloadContent }
    const conversationMessages = buildConversationMessages(
      historyForSend,
      userMessageForSend,
      resolvedAgent,
      settings,
    )

    // Resolve Session Summary Model (Lite Model)
    const fallbackAgent = agents.find(a => a.isDefault)
    const summaryModelConfig = getModelConfigForAgent(
      resolvedAgent,
      settings,
      'sessionContentSummary',
      fallbackAgent,
    )

    // Step 9: Call API & Stream
    await callAIAPI(
      conversationMessages,
      aiMessagePlaceholder,
      settings,
      resolvedToggles,
      callbacks,
      spaces,
      resolvedSpaceInfo,
      resolvedAgent,
      agents,
      preselectedTitle,
      preselectedEmojis,
      get,
      set,
      historyLengthBeforeSend,
      text,
      resolvedDocumentSources,
      isAgentAutoMode,
      researchType,
      summaryModelConfig, // New arg
      null, // hitlRunId
      null, // hitlFieldValues
      shouldGenerateTitleAsync,
      hasEditingInfo,
    )
  },

  /**
   * Stops the current AI generation
   */
  stopGeneration: () => {
    const { abortController, isLoading } = get()
    if (abortController) {
      console.log('[chatStore] Stopping generation by user request')
      abortController.abort()
    }

    // Update last message tool status if it's 'calling'
    set(state => {
      const messages = [...state.messages]
      const lastMsgIndex = messages.length - 1
      if (lastMsgIndex >= 0 && messages[lastMsgIndex].role === 'ai') {
        const lastMsg = { ...messages[lastMsgIndex] }
        if (Array.isArray(lastMsg.toolCallHistory)) {
          let hasUpdated = false
          const updatedHistory = lastMsg.toolCallHistory.map(tc => {
            if (tc.status === 'calling') {
              hasUpdated = true
              return { ...tc, status: 'error', error: 'Interrupted by user' }
            }
            return tc
          })

          if (hasUpdated) {
            lastMsg.toolCallHistory = updatedHistory
            messages[lastMsgIndex] = lastMsg
            return { messages, abortController: null, isLoading: false }
          }
        }
      }
      return { abortController: null, isLoading: false }
    })
  },
}))

export default useChatStore
