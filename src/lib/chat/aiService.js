import { getProvider, resolveThinkingToggleRule } from '../providers'
import { getUserTools } from '../userToolsService'
import {
  addMessage,
  updateConversation,
  notifyConversationsChanged,
  updateMessageById,
} from '../conversationsService'
import { upsertMemoryDomainSummary, getMemoryDomains, deleteMemoryDomain } from '../longTermMemoryService'
import { getModelConfigForAgent, resolveProviderConfigWithCredentials } from './modelConfig'
import { getLanguageInstruction, applyLanguageInstructionToText } from './prompts'
import { buildSpaceAgentOptions, resolveAgentForSpace } from './conversationSetup'
import { sanitizeJson } from './utils'

/**
 * Generates a deep research plan using a lite model
 */
export const generateDeepResearchPlan = async (
  userMessage,
  settings,
  selectedAgent,
  agents,
  fallbackAgent,
  callbacks = {},
  researchType = 'general',
) => {
  const agentForPlan = selectedAgent || fallbackAgent
  const modelConfig = getModelConfigForAgent(
    agentForPlan,
    settings,
    'generateResearchPlan',
    fallbackAgent,
  )
  const provider = getProvider(modelConfig.provider)
  if (!provider?.generateResearchPlan || !modelConfig.model) return ''
  const credentials = provider.getCredentials(settings)
  if (provider.streamResearchPlan) {
    let streamContent = ''
    await provider.streamResearchPlan(
      userMessage,
      credentials.apiKey,
      credentials.baseUrl,
      modelConfig.model,
      {
        onChunk: (delta, full) => {
          if (full) {
            streamContent = full
          } else if (delta) {
            streamContent += delta
          }
          callbacks.onChunk?.(streamContent)
        },
        onFinish: finalContent => {
          if (finalContent) streamContent = finalContent
          callbacks.onFinish?.(streamContent)
        },
        onError: callbacks.onError,
        researchType,
      },
    )
    return streamContent
  }

  const content = await provider.generateResearchPlan(
    userMessage,
    credentials.apiKey,
    credentials.baseUrl,
    modelConfig.model,
    researchType,
  )
  callbacks.onChunk?.(content)
  callbacks.onFinish?.(content)
  return content
}

/**
 * Main AI API call function that handles streaming and tool calls
 */
export const callAIAPI = async (
  conversationMessages,
  aiMessagePlaceholder,
  settings,
  toggles,
  callbacks,
  spaces,
  spaceInfo,
  selectedAgent,
  agents,
  preselectedTitle,
  preselectedEmojis,
  get,
  set,
  historyLengthBeforeSend,
  firstUserText,
  documentSources = [],
  isAgentAutoMode = false,
  researchType = 'general',
  hitlRunId = null,
  hitlFieldValues = null,
  summaryModelConfig = null,
  memoryDomainsPrefetch = [],
  deferTitleGeneration = false,
) => {
  let streamedThought = ''
  let pendingText = ''

  let pendingThought = ''
  let rafId = null

  // Create AbortController for this request
  const controller = new AbortController()
  set({ abortController: controller })

  const schedule = cb => {
    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      return window.requestAnimationFrame(cb)
    }
    return setTimeout(cb, 0)
  }

  const flushPending = () => {
    if (!pendingText && !pendingThought) {
      rafId = null
      return
    }

    set(state => {
      const updated = [...state.messages]
      const lastMsgIndex = updated.length - 1
      if (lastMsgIndex < 0) return { messages: updated }
      const lastMsg = { ...updated[lastMsgIndex] }

      if (pendingText) {
        lastMsg.content += pendingText
      }

      if (pendingThought) {
        streamedThought += pendingThought
        lastMsg.thought = (lastMsg.thought || '') + pendingThought
      }

      updated[lastMsgIndex] = lastMsg
      return { messages: updated }
    })

    pendingText = ''
    pendingThought = ''
    rafId = null
  }

  const queueFlush = () => {
    if (rafId !== null) return
    rafId = schedule(flushPending)
  }
  try {
    // Get model configuration: Agent priority, global fallback
    const fallbackAgent = agents?.find(agent => agent.isDefault)
    const modelConfig = getModelConfigForAgent(
      selectedAgent,
      settings,
      'streamChatCompletion',
      fallbackAgent,
    )
    const provider = getProvider(modelConfig.provider)
    const credentials = provider.getCredentials(settings)
    const thinkingRule = resolveThinkingToggleRule(modelConfig.provider, modelConfig.model)
    const thinkingActive =
      !!(toggles?.thinking || toggles?.deepResearch) ||
      (thinkingRule.isLocked && thinkingRule.isThinkingActive)
    let planContent = ''

    const updateResearchPlan = content => {
      set(state => {
        const updated = [...state.messages]
        const lastMsgIndex = updated.length - 1
        if (lastMsgIndex < 0) return { messages: updated }
        const lastMsg = { ...updated[lastMsgIndex] }
        if (lastMsg.role === 'ai') {
          lastMsg.researchPlan = content || ''
          lastMsg.researchPlanLoading = true
          updated[lastMsgIndex] = lastMsg
        }
        return { messages: updated }
      })
    }

    if (toggles?.deepResearch && firstUserText) {
      try {
        planContent = await generateDeepResearchPlan(
          firstUserText,
          settings,
          selectedAgent,
          agents,
          fallbackAgent,
          {
            onChunk: content => {
              planContent = content || ''
              updateResearchPlan(planContent)
            },
          },
          researchType,
        )
      } catch (planError) {
        console.error('Deep research plan generation failed:', planError)
      }
    }

    if (toggles?.deepResearch) {
      set(state => {
        const updated = [...state.messages]
        const lastMsgIndex = updated.length - 1
        if (lastMsgIndex < 0) return { messages: updated }
        const lastMsg = { ...updated[lastMsgIndex] }
        if (lastMsg.role === 'ai') {
          lastMsg.researchPlan = planContent || ''
          lastMsg.researchPlanLoading = false
          updated[lastMsgIndex] = lastMsg
        }
        return { messages: updated }
      })
    }

    const useDeepResearchAgent =
      !!toggles?.deepResearch && typeof provider.streamDeepResearch === 'function'
    const planMessage = planContent
      ? [
          {
            role: 'system',
            content: `## Deep Research Plan (from lite model)\n${planContent}`,
          },
        ]
      : []
    const conversationMessagesWithPlan =
      planMessage.length && !useDeepResearchAgent
        ? [...planMessage, ...conversationMessages]
        : conversationMessages

    // If no placeholder provided (e.g. form submission continuation), determine if we need a new one
    if (!aiMessagePlaceholder) {
      // ONLY create a new placeholder if we are NOT in a HITL continuation flow
      if (!hitlRunId) {
        set(state => {
          const newMessage = {
            role: 'ai',
            content: '',
            created_at: new Date().toISOString(),
            thinkingEnabled: thinkingActive,
            deepResearch: !!toggles?.deepResearch,
            provider: modelConfig.provider,
            model: modelConfig.model,
            agentId: selectedAgent?.id || null,
            agentName: selectedAgent?.name || null,
            agentEmoji: selectedAgent?.emoji || '',
          }
          return { messages: [...state.messages, newMessage] }
        })
      } else {
        // In HITL continuation, we expect the existing last message to be the one that triggered the form.
        // We ensure it has the correct model/thinking metadata for the continuation.
        set(state => {
          const updated = [...state.messages]
          const lastMsgIndex = updated.length - 1
          if (lastMsgIndex >= 0 && updated[lastMsgIndex].role === 'ai') {
            const lastMsg = { ...updated[lastMsgIndex] }
            lastMsg.provider = modelConfig.provider
            lastMsg.model = modelConfig.model
            lastMsg.thinkingEnabled = thinkingActive
            lastMsg.deepResearch = !!toggles?.deepResearch
            updated[lastMsgIndex] = lastMsg
          }
          return { messages: updated }
        })
      }
    } else {
      // Tag the placeholder with provider/model and thinking flag so UI can show it while streaming
      set(state => {
        const updated = [...state.messages]
        const lastMsgIndex = updated.length - 1
        if (lastMsgIndex < 0) return { messages: updated }
        const lastMsg = { ...updated[lastMsgIndex] }
        if (lastMsg.role === 'ai') {
          lastMsg.provider = modelConfig.provider
          lastMsg.model = modelConfig.model
          lastMsg.thinkingEnabled = thinkingActive
          lastMsg.deepResearch = !!toggles?.deepResearch
          updated[lastMsgIndex] = lastMsg
        }
        return { messages: updated }
      })
    }

    // Extract agent settings
    const agentTemperature = selectedAgent?.temperature
    const agentTopP = selectedAgent?.topP ?? selectedAgent?.top_p
    const agentFrequencyPenalty =
      selectedAgent?.frequencyPenalty ?? selectedAgent?.frequency_penalty
    const agentPresencePenalty = selectedAgent?.presencePenalty ?? selectedAgent?.presence_penalty

    // Prepare API parameters
    const defaultAgent = agents.find(a => a.isDefault)
    const resolvedAgent = selectedAgent || defaultAgent || null
    const resolvedToolIds = (() => {
      if (resolvedAgent?.toolIds?.length) return resolvedAgent.toolIds
      if (resolvedAgent?.tool_ids?.length) return resolvedAgent.tool_ids
      return []
    })()

    const searchProvider = settings.searchProvider || 'tavily'
    const tavilyApiKey = searchProvider === 'tavily' ? settings.tavilyApiKey : undefined
    const searchBackends = Array.isArray(toggles?.searchBackends)
      ? toggles.searchBackends.map(item => String(item)).filter(Boolean)
      : typeof toggles?.searchBackend === 'string'
        ? [toggles.searchBackend]
        : []
    const searchBackend = searchBackends[0] || null

    // Use Session Summary Model Config passed from chatStore
    const summaryProvider = getProvider(summaryModelConfig?.provider)
    const summaryCreds = summaryProvider?.getCredentials(settings) || {}

    // Fetch and filter user tools based on selected agent
    let activeUserTools = []
    try {
      const allUserTools = await getUserTools()
      if (Array.isArray(allUserTools) && resolvedToolIds.length > 0) {
        activeUserTools = allUserTools
          .filter(t => resolvedToolIds.includes(String(t.id)))
          .filter(t => !t.config?.disabled)
      }
    } catch (err) {
      console.error('Failed to fetch user tools for chat:', err)
    }

    const resolvedMemoryProvider = modelConfig.provider
    const resolvedMemoryModel = modelConfig.model
    const memoryApiKey = credentials.apiKey
    const memoryBaseUrl = credentials.baseUrl
    const selectedDatabaseProvider =
      settings.databaseProviderId || settings.databaseProvider || 'supabase'

    const params = {
      ...credentials,
      model: modelConfig.model,
      userTools: activeUserTools,
      temperature: agentTemperature ?? undefined,
      top_p: agentTopP ?? undefined,
      frequency_penalty: agentFrequencyPenalty ?? undefined,
      presence_penalty: agentPresencePenalty ?? undefined,
      contextTurns: settings.contextTurns,
      searchProvider,
      tavilyApiKey,
      searchBackend,
      // Pass session summary model config (resolved internaly)
      summaryProvider: summaryModelConfig?.provider,
      summaryModel: summaryModelConfig?.model,
      summaryApiKey: summaryCreds?.apiKey,
      summaryBaseUrl: summaryCreds?.baseUrl,

      // RESTORED: Pass memory model config for long term memory tasks (using main model or specific config)
      // This ensures Long Term Memory continues to work as it did before.
      memoryProvider: resolvedMemoryProvider,
      memoryModel: resolvedMemoryModel,
      memoryApiKey: memoryApiKey,
      memoryBaseUrl: memoryBaseUrl,
      memoryDomainsPrefetch: Array.isArray(memoryDomainsPrefetch) ? memoryDomainsPrefetch : [],

      userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      userLocale: navigator.language || 'en-US',
      runId: hitlRunId,
      fieldValues: hitlFieldValues,
      conversationId: get().conversationId,
      messages: (() => {
        return conversationMessagesWithPlan.map(m => {
          const role = m.role === 'ai' ? 'assistant' : m.role
          const baseMessage = {
            role,
            content: m.content,
            ...(m.tool_calls && { tool_calls: m.tool_calls }),
            ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
            ...(m.name && { name: m.name }),
          }

          // If it's an AI message, we also send toolCallHistory to help the agent
          // maintain state across turns if it's not using Agno-native HITL.
          // However, for Agno HITL, the session_id/run_id on the backend handles this.
          if (role === 'assistant' && Array.isArray(m.toolCallHistory)) {
            // Include normalized tool calls if they aren't already in baseMessage
            if (!baseMessage.tool_calls && m.tool_calls) {
              baseMessage.tool_calls = m.tool_calls
            }
          }

          return baseMessage
        })
      })(),
      tools: provider.getTools(toggles.search, toggles.searchTool, settings.enableLongTermMemory),
      toolIds: resolvedToolIds,
      enableLongTermMemory: Boolean(settings.enableLongTermMemory),
      databaseProvider: selectedDatabaseProvider,
      thinking: provider.getThinking(thinkingActive, modelConfig.model),
      signal: controller.signal,
      onChunk: chunk => {
        if (typeof chunk === 'object' && chunk !== null) {
          if (chunk.type === 'research_step') {
            set(state => {
              const updated = [...state.messages]
              const lastMsgIndex = updated.length - 1
              if (lastMsgIndex < 0 || updated[lastMsgIndex].role !== 'ai') {
                return { messages: updated }
              }
              const lastMsg = { ...updated[lastMsgIndex] }
              const steps = Array.isArray(lastMsg.researchSteps) ? [...lastMsg.researchSteps] : []
              const targetIndex = steps.findIndex(item => item.step === chunk.step)
              const stepEntry = {
                step: chunk.step,
                total: chunk.total,
                title: chunk.title || '',
                status: chunk.status || 'running',
                durationMs: typeof chunk.duration_ms === 'number' ? chunk.duration_ms : undefined,
                error: chunk.error || null,
              }
              if (targetIndex >= 0) {
                steps[targetIndex] = { ...steps[targetIndex], ...stepEntry }
              } else {
                steps.push(stepEntry)
              }
              lastMsg.researchSteps = steps
              updated[lastMsgIndex] = lastMsg
              return { messages: updated }
            })
            return
          }
          if (chunk.type === 'tool_call') {
            set(state => {
              const updated = [...state.messages]
              const lastMsgIndex = updated.length - 1
              if (lastMsgIndex < 0 || updated[lastMsgIndex].role !== 'ai')
                return { messages: updated }
              const lastMsg = { ...updated[lastMsgIndex] }
              const history = Array.isArray(lastMsg.toolCallHistory)
                ? [...lastMsg.toolCallHistory]
                : []
              const toolName = chunk.name || 'tool'
              const injectedArguments = (() => {
                if (toolName !== 'web_search' && toolName !== 'search_news')
                  return chunk.arguments || ''
                const selectedBackends = searchBackends
                if (selectedBackends.length === 0) return chunk.arguments || ''
                const primaryBackend = selectedBackends[0]
                if (!chunk.arguments) {
                  return JSON.stringify(
                    selectedBackends.length > 1
                      ? { backend: primaryBackend, backends: selectedBackends }
                      : { backend: primaryBackend },
                  )
                }
                if (typeof chunk.arguments === 'object') {
                  if (chunk.arguments.backend || chunk.arguments.backends) return chunk.arguments
                  return selectedBackends.length > 1
                    ? { ...chunk.arguments, backend: primaryBackend, backends: selectedBackends }
                    : { ...chunk.arguments, backend: primaryBackend }
                }
                if (typeof chunk.arguments !== 'string') return chunk.arguments || ''
                try {
                  const parsed = JSON.parse(chunk.arguments)
                  if (!parsed || typeof parsed !== 'object') return chunk.arguments
                  if (parsed.backend || parsed.backends) return chunk.arguments
                  return JSON.stringify(
                    selectedBackends.length > 1
                      ? { ...parsed, backend: primaryBackend, backends: selectedBackends }
                      : { ...parsed, backend: primaryBackend },
                  )
                } catch {
                  return chunk.arguments
                }
              })()
              const pendingThoughtLength = lastMsg.thinkingEnabled
                ? 0
                : (pendingThought || '').length
              const pendingTextLength = (pendingText || '').length
              const baseIndex =
                (lastMsg.content || '').length + pendingTextLength + pendingThoughtLength
              history.push({
                id: chunk.id || `${chunk.name || 'tool'}-${Date.now()}`,
                name: toolName,
                arguments: injectedArguments,
                status: 'calling',
                durationMs: null,
                step: typeof chunk.step === 'number' ? chunk.step : undefined,
                total: typeof chunk.total === 'number' ? chunk.total : undefined,
                textIndex: typeof chunk.textIndex === 'number' ? chunk.textIndex : baseIndex,
              })
              lastMsg.toolCallHistory = history
              updated[lastMsgIndex] = lastMsg
              return { messages: updated }
            })
            return
          }
          if (chunk.type === 'tool_result') {
            set(state => {
              const updated = [...state.messages]
              const lastMsgIndex = updated.length - 1
              if (lastMsgIndex < 0 || updated[lastMsgIndex].role !== 'ai')
                return { messages: updated }
              const lastMsg = { ...updated[lastMsgIndex] }
              const history = Array.isArray(lastMsg.toolCallHistory)
                ? [...lastMsg.toolCallHistory]
                : []
              const targetIndex = history.findIndex(item =>
                chunk.id ? item.id === chunk.id : item.name === chunk.name,
              )
              if (targetIndex >= 0) {
                history[targetIndex] = {
                  ...history[targetIndex],
                  status: chunk.status || 'done',
                  error: chunk.error || null,
                  output:
                    typeof chunk.output !== 'undefined'
                      ? chunk.output
                      : history[targetIndex].output,
                  durationMs:
                    typeof chunk.duration_ms === 'number'
                      ? chunk.duration_ms
                      : history[targetIndex].durationMs,
                  step: typeof chunk.step === 'number' ? chunk.step : history[targetIndex].step,
                  total: typeof chunk.total === 'number' ? chunk.total : history[targetIndex].total,
                }
              } else {
                const fallbackArguments = (() => {
                  if (chunk.name !== 'web_search' && chunk.name !== 'search_news') return ''
                  if (searchBackends.length === 0) return ''
                  const primaryBackend = searchBackends[0]
                  return JSON.stringify(
                    searchBackends.length > 1
                      ? { backend: primaryBackend, backends: searchBackends }
                      : { backend: primaryBackend },
                  )
                })()
                history.push({
                  id: chunk.id || `${chunk.name || 'tool'}-${Date.now()}`,
                  name: chunk.name || 'tool',
                  arguments: fallbackArguments,
                  status: chunk.status || 'done',
                  error: chunk.error || null,
                  output: typeof chunk.output !== 'undefined' ? chunk.output : null,
                  durationMs: typeof chunk.duration_ms === 'number' ? chunk.duration_ms : null,
                  step: typeof chunk.step === 'number' ? chunk.step : undefined,
                  total: typeof chunk.total === 'number' ? chunk.total : undefined,
                })
              }
              lastMsg.toolCallHistory = history
              updated[lastMsgIndex] = lastMsg
              return { messages: updated }
            })
            return
          }
          // Handle HITL form request event
          if (chunk.type === 'form_request') {
            set(state => {
              const updated = [...state.messages]
              const lastMsgIndex = updated.length - 1
              if (lastMsgIndex < 0 || updated[lastMsgIndex].role !== 'ai')
                return { messages: updated }
              const lastMsg = { ...updated[lastMsgIndex] }

              // Store HITL metadata for form submission resumption
              lastMsg.hitlRunId = chunk.run_id
              lastMsg.hitlFormId = chunk.form_id
              lastMsg.hitlFormTitle = chunk.title
              lastMsg.hitlFormFields = chunk.fields

              // Add form as a tool call to maintain UI consistency
              const history = Array.isArray(lastMsg.toolCallHistory)
                ? [...lastMsg.toolCallHistory]
                : []

              // Check if form already exists (avoid duplicates)
              const existingFormIndex = history.findIndex(
                t => t.name === 'interactive_form' && t.status !== 'done',
              )

              if (existingFormIndex === -1) {
                const pendingThoughtLength = lastMsg.thinkingEnabled
                  ? 0
                  : (pendingThought || '').length
                const pendingTextLength = (pendingText || '').length
                const baseIndex =
                  (lastMsg.content || '').length + pendingTextLength + pendingThoughtLength

                history.push({
                  id: chunk.form_id || `form-${Date.now()}`,
                  name: 'interactive_form',
                  runId: chunk.run_id,
                  arguments: JSON.stringify({
                    run_id: chunk.run_id,
                    id: chunk.form_id,
                    title: chunk.title,
                    fields: chunk.fields,
                  }),
                  status: 'calling', // Will be marked 'done' after submission
                  textIndex: baseIndex,
                  output: {
                    run_id: chunk.run_id,
                    id: chunk.form_id,
                    fields: chunk.fields,
                    title: chunk.title,
                  },
                })
              } else {
                // Ensure run_id is retained for persisted history (page refresh recovery)
                const existing = history[existingFormIndex]
                history[existingFormIndex] = {
                  ...existing,
                  runId: chunk.run_id,
                  arguments: JSON.stringify({
                    run_id: chunk.run_id,
                    id: chunk.form_id,
                    title: chunk.title,
                    fields: chunk.fields,
                  }),
                  output: {
                    ...(existing?.output && typeof existing.output === 'object'
                      ? existing.output
                      : {}),
                    run_id: chunk.run_id,
                    id: chunk.form_id,
                    title: chunk.title,
                    fields: chunk.fields,
                  },
                }
              }

              lastMsg.toolCallHistory = history
              updated[lastMsgIndex] = lastMsg
              return { messages: updated }
            })
            return
          }
          if (chunk.type === 'thought') {
            pendingThought += chunk.content
          } else if (chunk.type === 'text') {
            pendingText += chunk.content
          }
        } else {
          pendingText += chunk
        }

        queueFlush()
      },
      onFinish: async result => {
        const { abortController } = get()
        if (abortController === controller) {
          set({ abortController: null })
        }

        flushPending()
        set({ isLoading: false })
        const currentStore = get()
        await finalizeMessage(
          { ...result, thought: result.thought ?? streamedThought },
          currentStore,
          settings,
        callbacks,
        spaces,
        set,
        historyLengthBeforeSend === 0,
          firstUserText,
          spaceInfo,
          preselectedTitle,
          preselectedEmojis,
          toggles,
          documentSources,
          selectedAgent,
        agents,
        isAgentAutoMode,
        deferTitleGeneration,
      )
      },
      onError: err => {
        const { abortController } = get()
        if (abortController === controller) {
          set({ abortController: null })
        }

        if (err.name === 'AbortError') {
          console.log('Chat generation aborted')
          set({ isLoading: false })
          return
        }

        flushPending()
        console.error('Chat error:', err)
        set({ isLoading: false })
        set(state => {
          const updated = [...state.messages]
          const lastMsgIndex = updated.length - 1
          if (updated[lastMsgIndex].role === 'ai') {
            const lastMsg = { ...updated[lastMsgIndex] }
            lastMsg.content += `\n\n**Error:** ${err.message}`
            lastMsg.isError = true
            updated[lastMsgIndex] = lastMsg
            return { messages: updated }
          }
          return {
            messages: [...state.messages, { role: 'system', content: `Error: ${err.message}` }],
          }
        })
      },
    }

    if (useDeepResearchAgent) {
      const lastMessage = conversationMessages[conversationMessages.length - 1]
      const historyMessages =
        lastMessage?.role === 'user' ? conversationMessages.slice(0, -1) : conversationMessages
      await provider.streamDeepResearch({
        ...params,
        messages: historyMessages.map(m => ({
          role: m.role === 'ai' ? 'assistant' : m.role,
          content: m.content,
          ...(m.tool_calls && { tool_calls: m.tool_calls }),
          ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
          ...(m.name && { name: m.name }),
        })),
        plan: planContent,
        question: firstUserText || lastMessage?.content || '',
        researchType,
        concurrentExecution: toggles?.concurrentResearch || false,
      })
    } else {
      await provider.streamChatCompletion(params)
    }
  } catch (error) {
    flushPending()
    console.error('Setup error:', error)
    set({ isLoading: false })
  }
}

/**
 * Finalizes AI message after streaming completion
 */
export const finalizeMessage = async (
  result,
  currentStore,
  settings,
  callbacks,
  spaces,
  set,
  isFirstTurnOverride,
  firstUserText,
  spaceInfo,
  preselectedTitle,
  preselectedEmojis,
  toggles = {},
  documentSources = [],
  selectedAgent = null,
  agents = [],
  isAgentAutoMode = false,
  deferTitleGeneration = false,
) => {
  const normalizeRelatedQuestions = payload => {
    if (Array.isArray(payload)) return payload.filter(item => typeof item === 'string' && item.trim())
    if (payload && typeof payload === 'object') {
      if (Array.isArray(payload.questions)) {
        return payload.questions.filter(item => typeof item === 'string' && item.trim())
      }
      if (Array.isArray(payload.relatedQuestions)) {
        return payload.relatedQuestions.filter(item => typeof item === 'string' && item.trim())
      }
      if (Array.isArray(payload.related_questions)) {
        return payload.related_questions.filter(item => typeof item === 'string' && item.trim())
      }
      return []
    }
    if (typeof payload === 'string') {
      try {
        const parsed = JSON.parse(payload)
        return normalizeRelatedQuestions(parsed)
      } catch {
        return []
      }
    }
    return []
  }
  const fallbackAgent = agents?.find(agent => agent.isDefault)
  const safeAgent = selectedAgent || fallbackAgent

  const normalizedThought = typeof result?.thought === 'string' ? result.thought.trim() : ''
  const normalizeContent = content => {
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content
        .map(part => {
          if (typeof part === 'string') return part
          if (part?.type === 'text' && part.text) return part.text
          if (part?.text) return part.text
          return ''
        })
        .join('')
    }
    if (content && typeof content === 'object' && Array.isArray(content.parts)) {
      return content.parts.map(p => (typeof p === 'string' ? p : p?.text || '')).join('')
    }
    return content ? String(content) : ''
  }

  const modelConfig = getModelConfigForAgent(
    safeAgent,
    settings,
    'streamChatCompletion',
    fallbackAgent,
  )

  set(state => {
    const updated = [...state.messages]
    const lastMsgIndex = updated.length - 1
    if (lastMsgIndex >= 0 && updated[lastMsgIndex].role === 'ai') {
      const lastMsg = { ...updated[lastMsgIndex] }
      const validToolCallHistory = Array.isArray(lastMsg.toolCallHistory)
        ? lastMsg.toolCallHistory
        : []

      if (typeof result?.content !== 'undefined') {
        const hasFormInExisting = validToolCallHistory.some(tc => tc.name === 'interactive_form')
        if (!hasFormInExisting) {
          lastMsg.content = normalizeContent(result.content)
        }
      }
      const thoughtToApply = normalizedThought || lastMsg.thought || ''
      lastMsg.thought = thoughtToApply ? thoughtToApply : undefined
      const toolCallsToProcess = result?.toolCalls || validToolCallHistory

      if (toolCallsToProcess && toolCallsToProcess.length > 0) {
        lastMsg.tool_calls = toolCallsToProcess

        if (settings.enableLongTermMemory) {
          toolCallsToProcess.forEach(tc => {
            const toolName = tc.name || tc.function?.name
            if (toolName === 'memory_update') {
              try {
                const rawArgs =
                  typeof tc.arguments !== 'undefined' ? tc.arguments : tc.function?.arguments
                const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs
                const operation = String(args?.operation || 'upsert').toLowerCase()
                const domainKeyRaw = args?.domain_key
                const domainKey = String(domainKeyRaw || '').trim().toLowerCase()
                const memoryProvider = String(
                  args?.database_provider ||
                    args?.databaseProvider ||
                    settings.databaseProviderId ||
                    settings.databaseProvider ||
                    '',
                ).trim()
                if (!domainKey) return

                if (operation === 'delete') {
                  deleteMemoryDomain(domainKey, { databaseProvider: memoryProvider }).catch(err => {
                    console.error(`[Memory] Background delete failed: ${domainKey}`, err)
                  })
                  return
                }

                if (!args?.summary) return

                if (operation === 'upsert') {
                  ;(async () => {
                    try {
                      const domains =
                        (await getMemoryDomains({ databaseProvider: memoryProvider })) || []
                      const existingDomain = domains.find(
                        domain =>
                          String(domain?.domain_key || '')
                            .trim()
                            .toLowerCase() === domainKey,
                      )
                      const existingSummary = String(
                        existingDomain?.latest_summary?.summary || existingDomain?.summary || '',
                      ).trim()
                      const basedOnExisting = args?.based_on_existing === true

                      if (existingSummary && !basedOnExisting) {
                        console.warn(
                          `[Memory] Skipping unsafe upsert without based_on_existing=true for existing domain: ${domainKey}`,
                        )
                        return
                      }

                      upsertMemoryDomainSummary({
                        domainKey,
                        summary: args.summary,
                        aliases: args.aliases || [],
                        scope: args.scope || '',
                        append: false,
                        databaseProvider: memoryProvider,
                      })
                        .then(result => {
                          if (!result?.updated) {
                            console.error(
                              `[Memory] Background auto-update rejected: ${domainKey}`,
                              result,
                            )
                            return
                          }
                          getMemoryDomains({ databaseProvider: memoryProvider })
                        })
                        .catch(err => {
                          console.error(`[Memory] Background auto-update failed: ${domainKey}`, err)
                        })
                    } catch (err) {
                      console.error(`[Memory] Failed to validate upsert safety: ${domainKey}`, err)
                    }
                  })()
                  return
                }

                upsertMemoryDomainSummary({
                  domainKey,
                  summary: args.summary,
                  aliases: args.aliases || [],
                  scope: args.scope || '',
                  // add = append; upsert = overwrite
                  append: operation === 'add',
                  databaseProvider: memoryProvider,
                })
                  .then(result => {
                    if (!result?.updated) {
                      console.error(`[Memory] Background auto-update rejected: ${domainKey}`, result)
                      return
                    }
                    getMemoryDomains({ databaseProvider: memoryProvider })
                  })
                  .catch(err => {
                    console.error(`[Memory] Background auto-update failed: ${domainKey}`, err)
                  })
              } catch (e) {
                console.error('[Memory] Failed to parse memory_update arguments:', e)
              }
            }
          })
        }
      }
      lastMsg.provider = modelConfig.provider
      lastMsg.model = modelConfig.model
      lastMsg.documentSources = documentSources || []
      updated[lastMsgIndex] = lastMsg
    }
    return { messages: updated }
  })

  let resolvedTitle = currentStore.conversationTitle
  let resolvedTitleEmojis =
    Array.isArray(preselectedEmojis) && preselectedEmojis.length > 0
      ? preselectedEmojis
      : Array.isArray(currentStore.conversationTitleEmojis)
        ? currentStore.conversationTitleEmojis
        : []
  let resolvedSpace = spaceInfo?.selectedSpace || null
  let resolvedAgent = safeAgent || null

  const isFirstTurn =
    typeof isFirstTurnOverride === 'boolean'
      ? isFirstTurnOverride
      : currentStore.historyForSend?.length === 0

  const fallbackFirstUserText = (() => {
    const firstUser = currentStore?.messages?.find(m => m.role === 'user')
    if (!firstUser) return ''
    if (typeof firstUser.content === 'string') return firstUser.content
    if (Array.isArray(firstUser.content)) {
      const textPart = firstUser.content.find(c => c.type === 'text')
      return textPart?.text || ''
    }
    return ''
  })()

  const firstMessageText = firstUserText || fallbackFirstUserText

  const withTimeout = (promise, ms, label) =>
    Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
    ])

  if (isFirstTurn && !deferTitleGeneration) {
    try {
      const hasResolvedTitle =
        typeof resolvedTitle === 'string' &&
        resolvedTitle.trim() &&
        resolvedTitle !== 'New Conversation'
      if (!hasResolvedTitle) {
        if (typeof preselectedTitle === 'string' && preselectedTitle.trim()) {
          resolvedTitle = preselectedTitle.trim()
          resolvedTitleEmojis = Array.isArray(preselectedEmojis) ? preselectedEmojis : []
          set({ conversationTitle: resolvedTitle, conversationTitleEmojis: resolvedTitleEmojis })
        } else if (spaceInfo?.isManualSpaceSelection && spaceInfo?.selectedSpace) {
          const {
            modelConfig: titleModelConfig,
            provider,
            credentials,
          } = resolveProviderConfigWithCredentials(
            safeAgent,
            settings,
            'generateTitle',
            fallbackAgent,
          )
          const languageInstruction = getLanguageInstruction(safeAgent, settings)
          const promptText = applyLanguageInstructionToText(firstMessageText, languageInstruction)
          const titleResult = await provider.generateTitle(
            promptText,
            credentials.apiKey,
            credentials.baseUrl,
            titleModelConfig.model,
          )
          resolvedTitle = titleResult?.title || 'New Conversation'
          resolvedTitleEmojis = Array.isArray(titleResult?.emojis) ? titleResult.emojis : []
          set({ conversationTitle: resolvedTitle, conversationTitleEmojis: resolvedTitleEmojis })
        } else if (callbacks?.onTitleAndSpaceGenerated) {
          const {
            modelConfig: titleModelConfig,
            provider,
            credentials,
          } = resolveProviderConfigWithCredentials(
            safeAgent,
            settings,
            'generateTitleAndSpace',
            fallbackAgent,
          )
          const languageInstruction = getLanguageInstruction(safeAgent, settings)
          const promptText = applyLanguageInstructionToText(firstMessageText, languageInstruction)
          const { title, space, emojis } = await callbacks.onTitleAndSpaceGenerated(
            promptText,
            credentials.apiKey,
            credentials.baseUrl,
          )
          resolvedTitle = title
          resolvedTitleEmojis = Array.isArray(emojis) ? emojis : []
          set({ conversationTitle: title, conversationTitleEmojis: resolvedTitleEmojis })
          resolvedSpace = space || null
        } else {
          const {
            modelConfig: titleModelConfig,
            provider,
            credentials,
          } = resolveProviderConfigWithCredentials(
            safeAgent,
            settings,
            'generateTitleAndSpace',
            fallbackAgent,
          )
          const languageInstruction = getLanguageInstruction(safeAgent, settings)
          const promptText = applyLanguageInstructionToText(firstMessageText, languageInstruction)
          if (!resolvedAgent && provider.generateTitleSpaceAndAgent) {
            const spaceAgents = await buildSpaceAgentOptions(spaces, agents)
            if (spaceAgents.length) {
              const { title, spaceLabel, agentName, emojis } =
                await provider.generateTitleSpaceAndAgent(
                  promptText,
                  spaceAgents,
                  credentials.apiKey,
                  credentials.baseUrl,
                  titleModelConfig.model,
                )
              resolvedTitle = title
              resolvedTitleEmojis = Array.isArray(emojis) ? emojis : []
              set({ conversationTitle: title, conversationTitleEmojis: resolvedTitleEmojis })
              const normalizedSpaceLabel =
                typeof spaceLabel === 'string' ? spaceLabel.split(' - ')[0].trim() : spaceLabel
              resolvedSpace = (spaces || []).find(s => s.label === normalizedSpaceLabel) || null
              if (resolvedSpace && agentName) {
                resolvedAgent = resolveAgentForSpace(agentName, resolvedSpace, spaceAgents, agents)
                if (resolvedAgent) {
                  callbacks?.onAgentResolved?.(resolvedAgent)
                }
              }
            }
          }
          if (!resolvedTitle || resolvedTitle === 'New Conversation') {
            const { title, space, emojis } = await provider.generateTitleAndSpace(
              promptText,
              spaces || [],
              credentials.apiKey,
              credentials.baseUrl,
              titleModelConfig.model,
            )
            resolvedTitle = title
            resolvedTitleEmojis = Array.isArray(emojis) ? emojis : []
            set({ conversationTitle: title, conversationTitleEmojis: resolvedTitleEmojis })
            resolvedSpace = space || resolvedSpace || null
          }
        }
      }
    } catch (error) {
      console.error(
        'Failed to generate title/space/agent metadata (non-fatal, continuing to save message):',
        error,
      )
      // Ensure defaults if generation failed
      if (!resolvedTitle || resolvedTitle === 'New Conversation') {
        resolvedTitle = 'New Conversation'
      }
    }
  }

  let insertedAiId = null

  if (result.sources && result.sources.length > 0) {
    set(state => {
      const updated = [...state.messages]
      const lastMsgIndex = updated.length - 1
      if (lastMsgIndex >= 0 && updated[lastMsgIndex].role === 'ai') {
        updated[lastMsgIndex] = {
          ...updated[lastMsgIndex],
          sources: result.sources,
        }
      }
      return { messages: updated }
    })
  }

  if (result.groundingSupports && result.groundingSupports.length > 0) {
    set(state => {
      const updated = [...state.messages]
      const lastMsgIndex = updated.length - 1
      if (lastMsgIndex >= 0 && updated[lastMsgIndex].role === 'ai') {
        updated[lastMsgIndex] = {
          ...updated[lastMsgIndex],
          groundingSupports: result.groundingSupports,
        }
      }
      return { messages: updated }
    })
  }

  if (currentStore.conversationId) {
    const aiMessages = (currentStore.messages || []).filter(m => m.role === 'ai')
    const latestAi = aiMessages[aiMessages.length - 1]

    const fallbackThoughtFromState = (() => {
      const thoughtValue = latestAi?.thought
      return typeof thoughtValue === 'string' ? thoughtValue.trim() : ''
    })()

    const baseThought = normalizedThought || fallbackThoughtFromState || null
    const planForPersistence = (() => {
      return typeof latestAi?.researchPlan === 'string' ? latestAi.researchPlan : null
    })()
    const toolCallHistoryForPersistence = (() => {
      return Array.isArray(latestAi?.toolCallHistory) ? latestAi.toolCallHistory : null
    })()
    const researchStepsForPersistence = (() => {
      return Array.isArray(latestAi?.researchSteps) ? latestAi.researchSteps : null
    })()
    const thoughtForPersistence =
      toggles?.deepResearch && planForPersistence
        ? JSON.stringify({ plan: planForPersistence, thought: baseThought })
        : baseThought
    const contentForPersistence = (() => {
      // If we already have a message ID (HITL resumption), the store's content (latestAi.content)
      // is already cumulative (contains both old and new streamed text).
      // We should use that instead of result.content which only contains the delta for this run.
      if (latestAi?.id) {
        return latestAi.content || ''
      }
      return typeof result.content !== 'undefined'
        ? normalizeContent(result.content)
        : (latestAi?.content ?? '')
    })()

    const aiPayload = {
      conversation_id: currentStore.conversationId,
      role: 'assistant',
      provider: modelConfig.provider,
      model: modelConfig.model,
      agent_id: safeAgent?.id || null,
      agent_name: safeAgent?.name || null,
      agent_emoji: safeAgent?.emoji || '',
      agent_is_default: !!safeAgent?.isDefault,
      content: sanitizeJson(contentForPersistence),
      thinking_process: thoughtForPersistence,
      tool_calls: sanitizeJson(
        (() => {
          // Priority 1: Current message's tool_calls (already cumulative in store if we handled it in onChunk)
          if (latestAi?.tool_calls && latestAi.tool_calls.length > 0) return latestAi.tool_calls

          // Priority 2: Result's toolCalls (from the stream result)
          const newToolCalls = result.toolCalls || []

          // Priority 3: Derived from toolCallHistory
          const derivedToolCalls =
            toolCallHistoryForPersistence && toolCallHistoryForPersistence.length > 0
              ? toolCallHistoryForPersistence.map(tc => ({
                  id: tc.id,
                  type: 'function',
                  function: {
                    name: tc.name,
                    arguments: tc.arguments,
                  },
                  textIndex: tc.textIndex,
                }))
              : []

          return newToolCalls.length > 0 ? newToolCalls : derivedToolCalls
        })(),
      ),
      tool_call_history: sanitizeJson(toolCallHistoryForPersistence || []),
      research_step_history: sanitizeJson(researchStepsForPersistence || []),
      related_questions: null,
      sources: sanitizeJson(
        (latestAi?.sources && latestAi.sources.length > 0 ? latestAi.sources : null) ||
          result.sources ||
          null,
      ),
      document_sources: sanitizeJson(documentSources || null),
      grounding_supports: sanitizeJson(result.groundingSupports || null),
      created_at: new Date().toISOString(),
    }

    let insertedAi = null
    // If the message already has an ID (HITL resumption), update it instead of adding new
    if (latestAi?.id) {
      const { data: updatedAiRow, error: updateAiError } = await updateMessageById(
        latestAi.id,
        aiPayload,
      )
      insertedAi = updatedAiRow || null
      if (updateAiError) {
        console.error('Failed to update HITL AI message:', updateAiError)
      }
    } else {
      const { data: insertedAiRow, error: insertAiError } = await addMessage(aiPayload)
      if (insertAiError) {
        const { data: retryAiRow } = await addMessage({
          conversation_id: aiPayload.conversation_id,
          role: aiPayload.role,
          provider: aiPayload.provider,
          model: aiPayload.model,
          agent_id: aiPayload.agent_id,
          agent_name: aiPayload.agent_name,
          agent_emoji: aiPayload.agent_emoji,
          agent_is_default: aiPayload.agent_is_default,
          content: aiPayload.content,
          thinking_process: aiPayload.thinking_process,
          document_sources: aiPayload.document_sources,
          created_at: aiPayload.created_at,
        })
        insertedAi = retryAiRow || null
      } else {
        insertedAi = insertedAiRow || null
      }
    }

    insertedAiId = insertedAi?.id || null
    if (insertedAi) {
      set(state => {
        const updated = [...state.messages]
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].role === 'ai' && !updated[i].id) {
            updated[i] = {
              ...updated[i],
              id: insertedAi.id,
              created_at: insertedAi.created_at,
            }
            break
          }
        }
        return { messages: updated }
      })
    }
  }

  if (currentStore.conversationId) {
    try {
      if (isFirstTurn) {
        await updateConversation(currentStore.conversationId, {
          title: resolvedTitle,
          title_emojis: resolvedTitleEmojis,
          space_id: resolvedSpace ? resolvedSpace.id : null,
          api_provider: resolvedAgent?.provider || safeAgent?.provider || '',
          last_agent_id: safeAgent?.id || null,
          agent_selection_mode: isAgentAutoMode ? 'auto' : 'manual',
        })
        notifyConversationsChanged()
        window.dispatchEvent(
          new CustomEvent('conversation-space-updated', {
            detail: {
              conversationId: currentStore.conversationId,
              space: resolvedSpace,
            },
          }),
        )
        if (callbacks?.onSpaceResolved && resolvedSpace) {
          callbacks.onSpaceResolved(resolvedSpace)
        }
      } else if (safeAgent?.id) {
        await updateConversation(currentStore.conversationId, {
          last_agent_id: safeAgent.id,
        })
      }
    } catch (error) {
      console.error('Failed to update conversation:', error)
    }
  }

  const lastToolHistory =
    currentStore.messages?.[currentStore.messages.length - 1]?.toolCallHistory || []
  const isInteractiveForm = lastToolHistory.some(
    tc => (tc.name || tc.function?.name) === 'interactive_form' && tc.status !== 'done',
  )

  if (toggles?.related && !isInteractiveForm) {
    ;(async () => {
      set(state => {
        const updated = [...state.messages]
        let targetIndex = -1
        if (insertedAiId) {
          targetIndex = updated.findIndex(m => m.id === insertedAiId)
        }
        if (targetIndex === -1) {
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].role === 'ai') {
              targetIndex = i
              break
            }
          }
        }

        if (targetIndex >= 0) {
          updated[targetIndex] = {
            ...updated[targetIndex],
            relatedLoading: true,
          }
        }
        return { messages: updated }
      })

      let related = []
      try {
        const sanitizedMessages = currentStore.messages.map(m => ({
          role: m.role === 'ai' ? 'assistant' : m.role,
          content: normalizeContent(m.content),
        }))
        const languageInstruction = getLanguageInstruction(safeAgent, settings)
        const relatedMessages = sanitizedMessages.slice(-2)
        if (languageInstruction) {
          relatedMessages.unshift({ role: 'system', content: languageInstruction })
        }

        const { modelConfig, provider, credentials } = resolveProviderConfigWithCredentials(
          safeAgent,
          settings,
          'generateRelatedQuestions',
          fallbackAgent,
        )

        const rawRelated = await withTimeout(
          provider.generateRelatedQuestions(
            relatedMessages,
            credentials.apiKey,
            credentials.baseUrl,
            modelConfig.model,
          ),
          20000,
          'Related questions',
        )
        related = normalizeRelatedQuestions(rawRelated)
      } catch (error) {
        console.error('[chatStore] Failed to generate related questions:', error)
      } finally {
        set(state => {
          const updated = [...state.messages]
          let targetIndex = -1
          if (insertedAiId) {
            targetIndex = updated.findIndex(m => m.id === insertedAiId)
          }
          if (targetIndex === -1) {
            for (let i = updated.length - 1; i >= 0; i--) {
              if (updated[i].role === 'ai') {
                targetIndex = i
                break
              }
            }
          }
          if (targetIndex >= 0) {
            updated[targetIndex] = {
              ...updated[targetIndex],
              relatedLoading: false,
            }
          }
          return { messages: updated }
        })
      }

      if (related && related.length > 0) {
        set(state => {
          const updated = [...state.messages]
          let targetIndex = -1
          if (insertedAiId) {
            targetIndex = updated.findIndex(m => m.id === insertedAiId)
          }
          if (targetIndex === -1) {
            for (let i = updated.length - 1; i >= 0; i--) {
              if (updated[i].role === 'ai') {
                targetIndex = i
                break
              }
            }
          }

          if (targetIndex >= 0) {
            const lastMsg = { ...updated[targetIndex] }
            lastMsg.related = related
            lastMsg.related_questions = related
            if (result.sources && result.sources.length > 0) {
              lastMsg.sources = result.sources
            }
            if (result.groundingSupports && result.groundingSupports.length > 0) {
              lastMsg.groundingSupports = result.groundingSupports
            }
            updated[targetIndex] = lastMsg
          }
          return { messages: updated }
        })
      }

      if (insertedAiId && related && related.length > 0) {
        try {
          await updateMessageById(insertedAiId, {
            related_questions: related,
          })
        } catch (error) {
          console.error('Failed to persist related questions:', error)
        }
      }
    })()
  }
}
