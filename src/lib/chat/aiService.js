import { getProvider, resolveThinkingToggleRule } from '../providers'
import { getUserTools } from '../userToolsService'
import {
  addMessage,
  updateConversation,
  notifyConversationsChanged,
  updateMessageById,
} from '../conversationsService'
import { upsertMemoryDomainSummary, getMemoryDomains } from '../longTermMemoryService'
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
        if (lastMsg.thinkingEnabled) {
          streamedThought += pendingThought
          lastMsg.thought = (lastMsg.thought || '') + pendingThought
        } else {
          lastMsg.content += pendingThought
        }
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

    // If no placeholder provided (e.g. form submission continuation), create one
    if (!aiMessagePlaceholder) {
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

    const params = {
      ...credentials,
      model: modelConfig.model,
      userTools: activeUserTools,
      temperature: agentTemperature ?? undefined,
      top_p: agentTopP ?? undefined,
      frequency_penalty: agentFrequencyPenalty ?? undefined,
      presence_penalty: agentPresencePenalty ?? undefined,
      contextMessageLimit: settings.contextMessageLimit,
      searchProvider,
      tavilyApiKey,
      searchBackend,
      userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      userLocale: navigator.language || 'en-US',
      messages: (() => {
        return conversationMessagesWithPlan.flatMap((m, i, arr) => {
          if (m.role === 'ai') {
            let formCallId = null

            const normalizedToolCalls = m.tool_calls?.map(tc => {
              if ((tc.function?.name || tc.name) === 'interactive_form') {
                formCallId = tc.id
              }
              return {
                id: tc.id,
                type: tc.type || 'function',
                function: {
                  name: tc.function?.name || tc.name,
                  arguments:
                    typeof tc.function?.arguments === 'object'
                      ? JSON.stringify(tc.function.arguments)
                      : tc.function?.arguments ||
                        (typeof tc.arguments === 'object'
                          ? JSON.stringify(tc.arguments)
                          : tc.arguments),
                },
              }
            })

            const baseMessage = {
              role: 'assistant',
              content: m.content,
              ...(normalizedToolCalls && { tool_calls: normalizedToolCalls }),
              ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
              ...(m.name && { name: m.name }),
            }

            const restoredToolMessages = []
            if (Array.isArray(m.toolCallHistory)) {
              m.toolCallHistory.forEach(tc => {
                const isForm = (tc.function?.name || tc.name) === 'interactive_form'
                if (!isForm && tc.status === 'done' && tc.output !== undefined) {
                  restoredToolMessages.push({
                    role: 'tool',
                    tool_call_id: tc.id,
                    content: typeof tc.output === 'string' ? tc.output : JSON.stringify(tc.output),
                    name: tc.name,
                  })
                }
              })
            }

            const nextMsg = arr[i + 1]
            const nextIsSubmission =
              nextMsg &&
              nextMsg.role === 'user' &&
              (nextMsg.formValues ||
                (typeof nextMsg.content === 'string' &&
                  nextMsg.content.startsWith('[Form Submission]')))

            if (formCallId && nextIsSubmission) {
              const pendingToolMsg = {
                role: 'tool',
                tool_call_id: formCallId,
                content: 'pending',
                name: 'interactive_form',
              }
              const dummyAssistantMsg = {
                role: 'assistant',
                content: 'Please proceed with the form submission.',
              }
              return [baseMessage, ...restoredToolMessages, pendingToolMsg, dummyAssistantMsg]
            }

            return [baseMessage, ...restoredToolMessages]
          }

          return [
            {
              role: m.role === 'ai' ? 'assistant' : m.role,
              content: m.content,
              ...(m.tool_calls && { tool_calls: m.tool_calls }),
              ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
              ...(m.name && { name: m.name }),
            },
          ]
        })
      })(),
      tools: provider.getTools(toggles.search, toggles.searchTool, settings.enableLongTermMemory),
      toolIds: resolvedToolIds,
      memoryProvider: resolvedMemoryProvider,
      memoryModel: resolvedMemoryModel,
      memoryApiKey,
      memoryBaseUrl,
      enableLongTermMemory: Boolean(settings.enableLongTermMemory),
      databaseProvider: settings.databaseProvider || 'supabase',
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
) => {
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
                const args =
                  typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments
                if (args?.domain_key && args?.summary) {
                  upsertMemoryDomainSummary({
                    domainKey: args.domain_key,
                    summary: args.summary,
                    aliases: args.aliases || [],
                    scope: args.scope || '',
                    append: true,
                  })
                    .then(() => {
                      getMemoryDomains()
                    })
                    .catch(err => {
                      console.error(
                        `[Memory] Background auto-update failed: ${args.domain_key}`,
                        err,
                      )
                    })
                }
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

  if (isFirstTurn) {
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
    const contentForPersistence =
      typeof result.content !== 'undefined'
        ? result.content
        : (currentStore.messages?.[currentStore.messages.length - 1]?.content ?? '')

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
        (latestAi?.tool_calls && latestAi.tool_calls.length > 0 ? latestAi.tool_calls : null) ||
          result.toolCalls ||
          (toolCallHistoryForPersistence && toolCallHistoryForPersistence.length > 0
            ? toolCallHistoryForPersistence.map(tc => ({
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.name,
                  arguments: tc.arguments,
                },
                textIndex: tc.textIndex,
              }))
            : null),
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

  const isInteractiveForm =
    result?.toolCalls?.some(tc => (tc.name || tc.function?.name) === 'interactive_form') ||
    (currentStore.messages?.[currentStore.messages.length - 1]?.toolCallHistory || []).some(
      tc => (tc.name || tc.function?.name) === 'interactive_form',
    )

  let related = []
  if (toggles?.related && !isInteractiveForm) {
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

      related = await withTimeout(
        provider.generateRelatedQuestions(
          relatedMessages,
          credentials.apiKey,
          credentials.baseUrl,
          modelConfig.model,
        ),
        20000,
        'Related questions',
      )
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
}
