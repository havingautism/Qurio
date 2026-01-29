import { create } from 'zustand'
import {
  addMessage,
  notifyConversationsChanged,
  updateConversation,
  updateMessageById,
} from './conversationsService'
import { getProvider, resolveThinkingToggleRule } from './providers'
import { getUserTools } from './userToolsService'

import {
  buildSpaceAgentOptions,
  resolveAgentForSpace,
  resolveFallbackAgent,
  preselectTitleSpaceAndAgentForAuto,
  preselectTitleForManual,
  preselectTitleForDeepResearch,
} from './chat/conversationSetup'
import { callAIAPI, finalizeMessage, generateDeepResearchPlan } from './chat/aiService'
import {
  ensureConversationExists,
  persistUserMessage,
  appendAIPlaceholder,
  handleEditingAndHistory,
} from './chat/chatDataService'
import { selectDocumentQuery, selectMemoryDomains } from './chat/contextService'
import { fetchDocumentChunkContext } from './documentRetrievalService'
import { formatDocumentAppendText } from './documentContextUtils'
import {
  formatMemorySummariesAppendText,
  getMemoryDomains,
  upsertMemoryDomainSummary,
} from './longTermMemoryService'
import { getModelConfigForAgent, resolveProviderConfigWithCredentials } from './chat/modelConfig'

// Import constants
import { DOCUMENT_RETRIEVAL_CHUNK_LIMIT, DOCUMENT_RETRIEVAL_TOP_CHUNKS } from './chat/constants'
import { validateInput, sanitizeJson } from './chat/utils'
import { buildUserMessage, normalizeMessageForSend } from './chat/formatters'
import {
  buildConversationMessages,
  getLanguageInstruction,
  applyLanguageInstructionToText,
} from './chat/prompts'

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
   * Submits an interactive form and continues AI response in the same message
   *
   * @param {Object} params - Submission parameters
   * @param {Object} params.formData - Form data with values
   * @param {Object} params.settings - User settings
   * @param {Object} params.toggles - Feature toggles
   * @param {Object} params.selectedAgent - Current agent
   * @param {Array} params.agents - Available agents
   * @param {Object} params.spaceInfo - Space information
   * @param {boolean} params.isAgentAutoMode - Agent auto mode flag
   */
  submitInteractiveForm: async ({
    formData,
    settings,
    toggles,
    selectedAgent,
    agents,
    spaceInfo,
    isAgentAutoMode,
  }) => {
    const { conversationId, messages } = get()
    if (!conversationId) return

    // 1. Construct form submission message
    const formattedValues = Object.entries(formData.values)
      .map(([key, value]) =>
        Array.isArray(value) ? `${key}: ${value.join(', ')}` : `${key}: ${value}`,
      )
      .join('\n')
    const formContent = `[Form Submission]
${formattedValues}

[INSTRUCTION]
Analyze the submitted data. If critical information is still missing or if the request requires further refinement, you may present another 'interactive_form'. However, if the data is sufficient, proceed with providing the final answer directly. Keep the interaction efficient.`

    const hiddenUserMessage = {
      role: 'user',
      content: formContent,
      conversation_id: conversationId,
      created_at: new Date().toISOString(),
    }

    // 2. Persist to DB and add to STATE to maintain context
    // We must add it to state so the UI (MessageBubble) knows the form is submitted
    const { data: insertedMsg } = await addMessage(hiddenUserMessage)

    // Store raw form values in state message for API swap logic (User -> Tool)
    // CRITICAL: Ensure we use the ID from the database, otherwise this message CANNOT be deleted later
    const stateMessage = {
      ...hiddenUserMessage,
      id: insertedMsg?.id,
      formValues: formData.values,
    }

    set(state => {
      const updated = [...state.messages, stateMessage]
      return { messages: updated }
    })

    // Mark the form tool as done to transition the UI badge to "Submitted"
    set(state => {
      const updated = [...state.messages]
      // The AI message is before the hidden user message (which was just added)
      // So index is length - 2
      const lastMsgIndex = updated.length - 2
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
          tools[formToolIndex] = { ...tools[formToolIndex], status: 'done' }
          updated[lastMsgIndex] = { ...updated[lastMsgIndex], toolCallHistory: tools }
        }
      }
      return { messages: updated }
    })

    // 3. Stream Response (Append to last message)
    // We include the hidden message in the context sent to AI
    const lastAiMsg = messages[messages.length - 1]

    // Find the original agent that triggered the form to ensure continuity
    // This prevents auto-mode from switching providers mid-interaction (e.g. GLM -> SiliconFlow)
    let formAgent = null
    if (lastAiMsg?.agentId) {
      formAgent = agents?.find(a => a.id === lastAiMsg.agentId)
    }
    const fallbackAgent = agents?.find(agent => agent.isDefault)
    const effectiveAgent = formAgent || selectedAgent || fallbackAgent

    // No manual tool messages insertion.
    // We rely on callAIAPI's swap logic to transform the User message into a Tool message.
    const contextMessages = [...messages, hiddenUserMessage]

    // Create AI placeholder for the response
    const aiMessagePlaceholder = {
      role: 'ai',
      content: '',
      created_at: new Date().toISOString(),
      thinkingEnabled: !!(toggles?.thinking || toggles?.deepResearch),
      deepResearch: !!toggles?.deepResearch,
      researchPlan: '',
      researchPlanLoading: !!toggles?.deepResearch,
      agentId: effectiveAgent?.id || null,
      agentName: effectiveAgent?.name || null,
      agentEmoji: effectiveAgent?.emoji || '',
      agentIsDefault: !!effectiveAgent?.isDefault,
    }

    set(state => ({
      isLoading: true,
      messages: [...state.messages, aiMessagePlaceholder],
    }))

    try {
      await callAIAPI(
        contextMessages,
        aiMessagePlaceholder, // Pass the placeholder
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
        messages.length + 1, // CORRECT INDEX: Target the new placeholder (Index N+1), not the hidden user msg (Index N)
        '', // firstUserText
        [], // documentSources,
        false, // FORCE DISABLE AUTO MODE for form submission to maintain context
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
    const isEditingExisting = editingInfo?.index !== undefined && editingInfo?.index !== null
    const historyLengthBeforeSend = isEditingExisting ? editingInfo.index : messages.length

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
    const isFirstTurn = historyLengthBeforeSend === 0 && !isEditingExisting
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
    const shouldPreselectAgent = isAgentAutoMode && text.trim() && !isDeepResearchMode
    const shouldPreselectDeepResearchTitle = isFirstTurn && isDeepResearchMode && text.trim()

    // Preselect space & title with loading indicator (only on first turn)
    if (
      shouldPreselectSpaceTitle ||
      shouldPreselectTitleForManual ||
      shouldPreselectDeepResearchTitle
    ) {
      set({ isMetaLoading: true })
      try {
        if (shouldPreselectDeepResearchTitle) {
          const { title, emojis } = await preselectTitleForDeepResearch(
            text,
            settings,
            selectedAgent,
            agents,
          )
          if (title) {
            preselectedTitle = title
            preselectedEmojis = emojis || []
            set({ conversationTitle: title, conversationTitleEmojis: emojis || [] })
          }
        } else if (shouldPreselectSpaceTitle) {
          const selectableSpaces = toggles?.deepResearch
            ? spaces
            : (spaces || []).filter(
                space =>
                  !(
                    space?.isDeepResearchSystem ||
                    space?.isDeepResearch ||
                    space?.is_deep_research
                  ),
              )
          const { title, space, agent, emojis } = await preselectTitleSpaceAndAgentForAuto(
            text,
            settings,
            selectableSpaces,
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
          if (title) {
            preselectedTitle = title
            preselectedEmojis = emojis || []
            set({ conversationTitle: title, conversationTitleEmojis: emojis || [] })
          }

          // Fallback: use space default agent, then global default agent
          if (!resolvedAgent) {
            const fallbackAgent = await resolveFallbackAgent(space, agents)
            if (fallbackAgent) {
              resolvedAgent = fallbackAgent
              callbacks?.onAgentResolved?.(fallbackAgent)
            }
          }
        } else if (shouldPreselectTitleForManual) {
          const { title, emojis } = await preselectTitleForManual(
            text,
            settings,
            selectedAgent,
            agents,
          )
          if (title) {
            preselectedTitle = title
            preselectedEmojis = emojis || []
            set({ conversationTitle: title, conversationTitleEmojis: emojis || [] })
          }

          // For manual space selection, fallback to space default agent, then global default
          if (!resolvedAgent) {
            const fallbackAgent = await resolveFallbackAgent(spaceInfo?.selectedSpace, agents)
            if (fallbackAgent) {
              resolvedAgent = fallbackAgent
              callbacks?.onAgentResolved?.(fallbackAgent)
            }
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

          if (provider.generateAgentForAuto) {
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
      const toolCallId = `document-embedding-${Date.now()}`
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
          name: 'document_embedding',
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

    // ========================================
    // MEMORY RETRIEVAL (Lite Model)
    // ========================================
    let memoryContextAppend = ''
    if (settings.enableLongTermMemory) {
      const toolCallId = `memory-check-${Date.now()}`
      const toolStart = Date.now()

      let allDomains = []
      try {
        allDomains = await getMemoryDomains()
      } catch (e) {
        console.error('Failed to get domains:', e)
      }

      // 1. Initial "Calling" State
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
          name: 'memory_check',
          arguments: JSON.stringify({
            query: text,
            available_tags: allDomains.flatMap(d => [d.domain_key, ...(d.aliases || [])]),
          }),
          status: 'calling',
          durationMs: null,
          textIndex: 0,
        })
        lastMsg.toolCallHistory = history
        updated[lastMsgIndex] = lastMsg
        return { messages: updated }
      })

      let hitDomainKeys = []
      let memStatus = 'done'
      let memError = null

      try {
        // Only proceed if we have memorable domains
        if (allDomains.length > 0) {
          const memResult = await selectMemoryDomains({
            question: text,
            historyForSend,
            domains: allDomains,
            settings,
            selectedAgent: resolvedAgent,
            agents,
          })

          if (memResult?.needMemory && Array.isArray(memResult.hitDomains)) {
            const relevantDomains = allDomains.filter(d =>
              memResult.hitDomains.includes(d.domain_key),
            )

            if (relevantDomains.length > 0) {
              hitDomainKeys = relevantDomains.map(d => d.domain_key)
              memoryContextAppend = formatMemorySummariesAppendText(relevantDomains)
            }
          }
        }
      } catch (err) {
        console.error('Memory check failed:', err)
        memStatus = 'error'
        memError = err?.message || 'Memory check failed'
      }

      // 2. Final "Done" State
      set(state => {
        const updated = [...state.messages]
        const lastMsgIndex = updated.length - 1
        if (lastMsgIndex < 0 || updated[lastMsgIndex].role !== 'ai') {
          return { messages: updated }
        }
        const lastMsg = { ...updated[lastMsgIndex] }
        const history = Array.isArray(lastMsg.toolCallHistory) ? [...lastMsg.toolCallHistory] : []
        const targetIndex = history.findIndex(item => item.id === toolCallId)

        if (targetIndex >= 0) {
          history[targetIndex] = {
            ...history[targetIndex],
            status: memStatus,
            error: memError,
            output: {
              domains: hitDomainKeys,
              found: hitDomainKeys.length > 0,
            },
            durationMs: Date.now() - toolStart,
          }
        }
        lastMsg.toolCallHistory = history
        updated[lastMsgIndex] = lastMsg
        return { messages: updated }
      })
    }

    const combinedContextAppend = [resolvedDocumentContextAppend, memoryContextAppend]
      .filter(Boolean)
      .join('\n\n')

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
