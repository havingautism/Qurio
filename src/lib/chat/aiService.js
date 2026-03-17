import { getProvider, resolveThinkingToggleRule } from '../providers'
import { getUserTools } from '../userToolsService'
import {
  addMessage,
  updateConversation,
  notifyConversationPatched,
  updateMessageById,
} from '../conversationsService'
import { getModelConfigForAgent, resolveProviderConfigWithCredentials } from './modelConfig'
import { selectThinkingModeViaBackend } from '../backendClient'
import { getLanguageInstruction, applyLanguageInstructionToText } from './prompts'
import { buildSpaceAgentOptions, resolveAgentForSpace } from './conversationSetup'
import { buildMessagePipeline } from './pipelineViewModel'
import { sanitizeJson } from './utils'

const sanitizeModelOutputText = value => {
  if (typeof value !== 'string') return ''
  // Remove replacement/BOM artifacts caused by broken upstream decoding.
  return value
    .replace(/\uFFFD+/g, '')
    .replace(/\uFEFF/g, '')
    .replace(/ï¿½+/g, '')
    .replace(/ï»¿/g, '')
}

const sanitizeInternalToolTraceChunk = value => {
  if (typeof value !== 'string') return ''
  let cleaned = sanitizeModelOutputText(value)

  cleaned = cleaned.replace(/<\/?(?:think|thought)>/gi, '')
  cleaned = cleaned.replace(/<\|[^|>]*\|>/gi, '')
  cleaned = cleaned.replace(/<\/?(?:session_memory|today_local_time)>/gi, '')
  cleaned = cleaned.replace(/\[SYSTEM INJECTED CONTEXT\]/gi, '')
  return cleaned
}

const sanitizeInternalThoughtTrace = value => {
  if (typeof value !== 'string') return ''
  const cleaned = sanitizeInternalToolTraceChunk(value)
  return cleaned.trim()
}

const clampToUnicodeBoundary = (text, index) => {
  if (typeof text !== 'string' || text.length === 0) return 0
  let safeIndex = Math.max(0, Math.min(Number.isFinite(index) ? Number(index) : 0, text.length))
  if (safeIndex <= 0 || safeIndex >= text.length) return safeIndex
  const currentCode = text.charCodeAt(safeIndex)
  const prevCode = text.charCodeAt(safeIndex - 1)
  const isLowSurrogate = currentCode >= 0xdc00 && currentCode <= 0xdfff
  const prevIsHighSurrogate = prevCode >= 0xd800 && prevCode <= 0xdbff
  if (isLowSurrogate && prevIsHighSurrogate) {
    safeIndex -= 1
  }
  return safeIndex
}

const findParagraphEndIndex = (content, index) => {
  if (typeof content !== 'string' || content.length === 0) return 0
  const safeIndex = Math.max(
    0,
    Math.min(Number.isFinite(index) ? Number(index) : 0, content.length),
  )

  const nextDoubleBreak = content.indexOf('\n\n', safeIndex)
  if (nextDoubleBreak !== -1) return Math.min(content.length, nextDoubleBreak + 2)

  const nextSingleBreak = content.indexOf('\n', safeIndex)
  if (nextSingleBreak !== -1) return Math.min(content.length, nextSingleBreak + 1)

  return content.length
}

const buildStreamBlocks = ({ content = '', thoughtHistory = [], toolCallHistory = [] } = {}) => {
  const rawContent = typeof content === 'string' ? content : String(content || '')
  const events = []

  const normalizedThoughts = Array.isArray(thoughtHistory)
    ? thoughtHistory
        .map((item, index) => ({
          type: 'reasoning',
          textIndex: Number.isFinite(item?.textIndex) ? Number(item.textIndex) : 0,
          order: Number.isFinite(item?.streamOrder) ? Number(item.streamOrder) : index,
          content: String(item?.content || ''),
          duration_ms: Number.isFinite(item?.durationMs) ? Number(item.durationMs) : null,
        }))
        .filter(item => item.content.trim())
    : []

  const normalizedTools = Array.isArray(toolCallHistory)
    ? toolCallHistory
        .map((item, index) => ({
          type: 'tool',
          // Keep tool anchor stable at its original stream position.
          // Do not "push to paragraph end", otherwise location can drift as text keeps growing.
          textIndex: (() => {
            const rawIndex = Number.isFinite(item?.textIndex) ? Number(item.textIndex) : 0
            return Math.max(0, Math.min(rawIndex, rawContent.length))
          })(),
          order: Number.isFinite(item?.streamOrder) ? Number(item.streamOrder) : 100000 + index,
          tool_call_id: item?.id || `tool-${index}`,
          name: item?.name || '',
          status: item?.status || null,
          arguments: item?.arguments ?? null,
          output: item?.output ?? null,
          duration_ms: Number.isFinite(item?.durationMs) ? Number(item.durationMs) : null,
        }))
        .filter(item => item.tool_call_id)
    : []

  events.push(...normalizedThoughts, ...normalizedTools)
  events.sort((a, b) =>
    a.textIndex === b.textIndex ? a.order - b.order : a.textIndex - b.textIndex,
  )

  const blocks = []
  let seq = 1
  let lastIndex = 0
  for (const event of events) {
    const boundedEventIndex = Math.max(0, Math.min(event.textIndex, rawContent.length))
    const safeIndex = clampToUnicodeBoundary(rawContent, boundedEventIndex)
    if (safeIndex > lastIndex) {
      const textChunk = rawContent.slice(lastIndex, safeIndex)
      if (textChunk) {
        blocks.push({ seq: seq++, type: 'text', content: textChunk })
      }
      lastIndex = safeIndex
    }
    if (event.type === 'reasoning') {
      blocks.push({
        seq: seq++,
        type: 'reasoning',
        content: event.content,
        duration_ms: event.duration_ms,
      })
    } else {
      blocks.push({
        seq: seq++,
        type: 'tool',
        tool_call_id: event.tool_call_id,
        name: event.name,
        status: event.status,
        arguments: event.arguments,
        output: event.output,
        duration_ms: event.duration_ms,
      })
    }
  }

  if (lastIndex < rawContent.length) {
    const tail = rawContent.slice(lastIndex)
    if (tail) blocks.push({ seq: seq++, type: 'text', content: tail })
  }

  if (blocks.length === 0 && rawContent) {
    blocks.push({ seq: 1, type: 'text', content: rawContent })
  }
  return blocks
}

const deriveThoughtHistoryFromStreamBlocks = streamBlocks => {
  if (!Array.isArray(streamBlocks) || streamBlocks.length === 0) return []
  let textOffset = 0
  let blockId = 0
  return streamBlocks
    .map((block, index) => {
      const type = String(block?.type || '')
      if (type === 'text') {
        textOffset += String(block?.content || '').length
        return null
      }
      if (type !== 'reasoning' && type !== 'thought') return null
      const content = String(block?.content || '')
      if (!content.trim()) return null
      blockId += 1
      return {
        blockId,
        textIndex: textOffset,
        content,
        streamOrder: Number.isFinite(block?.seq) ? Number(block.seq) : index + 1,
        durationMs: Number.isFinite(block?.duration_ms)
          ? Number(block.duration_ms)
          : Number.isFinite(block?.durationMs)
            ? Number(block.durationMs)
            : null,
      }
    })
    .filter(Boolean)
}

const getThoughtHistoryForRebuild = message => {
  const direct = Array.isArray(message?.thoughtHistory) ? message.thoughtHistory : []
  if (direct.length > 0) return direct
  return deriveThoughtHistoryFromStreamBlocks(message?.streamBlocks)
}

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
  if (!provider) {
    console.error('[generateDeepResearchPlan] Provider not found for:', modelConfig.provider)
    return ''
  }

  if (!provider.generateResearchPlan && !provider.streamResearchPlan) {
    console.error(
      '[generateDeepResearchPlan] Provider does not support research plan generation:',
      provider.id,
    )
    return ''
  }

  if (!modelConfig.model) {
    console.error('[generateDeepResearchPlan] Model not configured for research plan generation')
    return ''
  }

  const credentials = provider.getCredentials(settings)

  if (provider.streamResearchPlan) {
    let streamContent = ''
    try {
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
          onError: err => {
            console.error('[generateDeepResearchPlan] Stream error:', err)
            callbacks.onError?.(err)
          },
          researchType,
        },
      )
    } catch (e) {
      console.error('[generateDeepResearchPlan] Stream error caught:', e)
      throw e
    }
    return streamContent
  }

  try {
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
  } catch (e) {
    console.error('[generateDeepResearchPlan] Non-stream error caught:', e)
    throw e
  }
}

const normalizeThinkingMode = (mode, fallbackThinking = null) => {
  if (mode === 'smart' || mode === 'deep' || mode === 'fast') return mode
  if (typeof fallbackThinking === 'boolean') return fallbackThinking ? 'deep' : 'fast'
  return 'smart'
}

const safeParseJsonObject = value => {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return null
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {}
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    try {
      const parsed = JSON.parse(fenced[1].trim())
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {}
  }
  const objectMatch = text.match(/\{[\s\S]*\}/)
  if (objectMatch?.[0]) {
    try {
      const parsed = JSON.parse(objectMatch[0])
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {}
  }
  return null
}

const runLiteThinkingPlanner = async ({ question, selectedAgent, settings, agents }) => {
  const fallbackAgent = agents?.find(agent => agent.isDefault)
  const liteConfig = getModelConfigForAgent(selectedAgent, settings, 'lite', fallbackAgent)
  const liteProvider = getProvider(liteConfig.provider)
  if (!liteProvider || !liteConfig.model) return null

  const liteCreds = liteProvider.getCredentials(settings)
  if (!liteCreds?.apiKey) return null

  try {
    const result = await selectThinkingModeViaBackend(
      liteConfig.provider,
      String(question || '').trim(),
      liteCreds.apiKey,
      liteCreds.baseUrl,
      liteConfig.model,
    )
    return normalizeThinkingMode(result?.thinking_mode, false)
  } catch (error) {
    console.warn('[callAIAPI] lite thinking planner failed:', error)
    return null
  }
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
  summaryModelConfig = null,
  hitlRunId = null,
  hitlFieldValues = null,
  deferTitleGeneration = false,
  isEditing = false,
) => {
  let streamedThought = ''
  let pendingText = ''
  let pendingThoughtEntries = []
  const thoughtStreamStartAtMs = Date.now()
  let lastThoughtEventAtMs = null
  let thoughtBlockCounter = 0
  let streamEventOrder = 0
  let researchStepEventOrder = 0
  let hasNonThoughtEvent = true
  let rafId = null
  let streamTextIndexOffset = 0
  let maxObservedEventTextIndex = 0
  let finalAnswerStartedAtMs = null
  const toolStartedAtById = new Map()
  const toolStartedAtQueuesByName = new Map()

  // HITL continuation appends to an existing AI message. Keep ordering monotonic
  // so new tool/thought events never sort ahead of the old form/tool history.
  if (hitlRunId) {
    try {
      const currentMessages = get().messages || []
      const lastMsg = currentMessages[currentMessages.length - 1]
      if (lastMsg?.role === 'ai') {
        const existingTools = Array.isArray(lastMsg.toolCallHistory) ? lastMsg.toolCallHistory : []
        const existingThoughts = Array.isArray(lastMsg.thoughtHistory) ? lastMsg.thoughtHistory : []
        const maxToolOrder = existingTools.reduce(
          (acc, item) =>
            Number.isFinite(item?.streamOrder) ? Math.max(acc, Number(item.streamOrder)) : acc,
          0,
        )
        const maxThoughtOrder = existingThoughts.reduce(
          (acc, item) =>
            Number.isFinite(item?.streamOrder) ? Math.max(acc, Number(item.streamOrder)) : acc,
          0,
        )
        const maxBlockId = existingThoughts.reduce((acc, item) => {
          const n = Number(item?.blockId)
          return Number.isFinite(n) ? Math.max(acc, n) : acc
        }, 0)
        streamEventOrder = Math.max(maxToolOrder, maxThoughtOrder)
        thoughtBlockCounter = Math.max(thoughtBlockCounter, maxBlockId)
      }
    } catch {
      // Best effort only.
    }
  }

  const markToolStarted = (id, name, startedAt) => {
    if (id) toolStartedAtById.set(id, startedAt)
    if (!name) return
    const queue = toolStartedAtQueuesByName.get(name) || []
    queue.push(startedAt)
    toolStartedAtQueuesByName.set(name, queue)
  }

  const consumeToolStartedAt = (id, name) => {
    if (id && toolStartedAtById.has(id)) {
      const startedAt = toolStartedAtById.get(id)
      toolStartedAtById.delete(id)
      return startedAt
    }
    if (!name) return null
    const queue = toolStartedAtQueuesByName.get(name)
    if (!queue || queue.length === 0) return null
    const startedAt = queue.shift()
    if (queue.length === 0) {
      toolStartedAtQueuesByName.delete(name)
    } else {
      toolStartedAtQueuesByName.set(name, queue)
    }
    return startedAt ?? null
  }

  const resolveToolDurationMs = ({ incomingDurationMs, startedAtMs, existingDurationMs }) => {
    const backendDuration = Number.isFinite(incomingDurationMs) ? Number(incomingDurationMs) : null
    const localElapsed =
      Number.isFinite(startedAtMs) && startedAtMs > 0 ? Math.max(0, Date.now() - startedAtMs) : null

    if (backendDuration != null) {
      return Math.max(0, backendDuration)
    }

    if (localElapsed != null) {
      return localElapsed
    }

    return Number.isFinite(existingDurationMs) ? Math.max(0, Number(existingDurationMs)) : null
  }

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
    if (!pendingText && pendingThoughtEntries.length === 0) {
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

      if (pendingThoughtEntries.length > 0) {
        const thoughtHistory = Array.isArray(lastMsg.thoughtHistory)
          ? [...lastMsg.thoughtHistory]
          : []
        for (const entry of pendingThoughtEntries) {
          if (!entry?.content) continue
          const lastEntry = thoughtHistory[thoughtHistory.length - 1]
          if (lastEntry && lastEntry.blockId === entry.blockId) {
            lastEntry.content = `${lastEntry.content || ''}${entry.content}`
            // Keep the earliest anchor index for this thought block so interleaving stays stable.
            if (
              Number.isFinite(entry.textIndex) &&
              (!Number.isFinite(lastEntry.textIndex) || entry.textIndex < lastEntry.textIndex)
            ) {
              lastEntry.textIndex = Number(entry.textIndex)
            }
            const lastDuration = Number.isFinite(lastEntry.durationMs)
              ? Number(lastEntry.durationMs)
              : 0
            const nextDuration = Number.isFinite(entry.durationMs) ? Number(entry.durationMs) : 0
            lastEntry.durationMs = Math.max(0, lastDuration + nextDuration)
          } else {
            thoughtHistory.push({
              blockId: entry.blockId,
              textIndex: entry.textIndex,
              content: entry.content,
              streamOrder: entry.streamOrder,
              durationMs: Number.isFinite(entry.durationMs) ? Number(entry.durationMs) : null,
            })
          }
        }
        lastMsg.thoughtHistory = thoughtHistory
        streamedThought = thoughtHistory
          .map(item => String(item?.content || ''))
          .filter(Boolean)
          .join('\n\n')
        lastMsg.thought = streamedThought || undefined
      }

      // Keep streamBlocks live during streaming so UI can render thought/tool blocks incrementally.
      const thoughtHistoryForBlocks = getThoughtHistoryForRebuild(lastMsg)
      lastMsg.streamBlocks = buildStreamBlocks({
        content: lastMsg.content || '',
        thoughtHistory: thoughtHistoryForBlocks,
        toolCallHistory: Array.isArray(lastMsg.toolCallHistory) ? lastMsg.toolCallHistory : [],
      })

      updated[lastMsgIndex] = lastMsg
      return { messages: updated }
    })

    pendingText = ''
    pendingThoughtEntries = []
    rafId = null
  }

  const queueFlush = () => {
    if (rafId !== null) return
    rafId = schedule(flushPending)
  }

  const getCurrentStreamEndIndex = () => {
    const currentMessages = get().messages || []
    const lastStreamMsg = currentMessages[currentMessages.length - 1] || {}
    return Math.max(0, String(lastStreamMsg.content || '').length + (pendingText || '').length)
  }

  const normalizeStreamTextIndex = (rawIndex, fallbackIndex) => {
    const safeFallback = Math.max(
      0,
      Number.isFinite(fallbackIndex) ? Number(fallbackIndex) : getCurrentStreamEndIndex(),
    )
    if (!Number.isFinite(rawIndex)) {
      maxObservedEventTextIndex = Math.max(maxObservedEventTextIndex, safeFallback)
      return safeFallback
    }

    const safeRaw = Math.max(0, Number(rawIndex))
    const currentEnd = getCurrentStreamEndIndex()
    const highWater = Math.max(maxObservedEventTextIndex, currentEnd)
    let absolute = safeRaw + streamTextIndexOffset

    // HITL resume may restart textIndex from 0; if index jumps backwards, re-anchor to current tail.
    if (absolute + 8 < highWater && safeRaw < highWater) {
      streamTextIndexOffset = highWater
      absolute = safeRaw + streamTextIndexOffset
    }

    // Keep ordering monotonic to avoid mid-message insertions during streaming.
    if (absolute < highWater) {
      absolute = highWater
    }

    maxObservedEventTextIndex = Math.max(maxObservedEventTextIndex, absolute)
    return absolute
  }

  const resolveToolAnchorIndex = (content, index, toolName) => {
    const safeIndex = Math.max(
      0,
      Math.min(Number.isFinite(index) ? Number(index) : 0, content.length),
    )
    if (toolName === 'interactive_form') return safeIndex
    return findParagraphEndIndex(content, safeIndex)
  }

  const normalizeResearchStepNumber = value => {
    const num = Number(value)
    return Number.isFinite(num) ? num : null
  }

  const buildResearchStepKey = value => {
    const numericStep = normalizeResearchStepNumber(value)
    if (numericStep !== null) return `step:${numericStep}`
    if (typeof value === 'string' && value.trim()) return `step:${value.trim()}`
    return ''
  }

  const sortResearchSteps = steps => {
    const safeSteps = Array.isArray(steps) ? [...steps] : []
    safeSteps.sort((a, b) => {
      const aNum = normalizeResearchStepNumber(a?.step)
      const bNum = normalizeResearchStepNumber(b?.step)
      if (aNum !== null && bNum !== null) return aNum - bNum
      if (aNum !== null) return -1
      if (bNum !== null) return 1
      const aOrder = Number.isFinite(a?.streamOrder)
        ? Number(a.streamOrder)
        : Number.MAX_SAFE_INTEGER
      const bOrder = Number.isFinite(b?.streamOrder)
        ? Number(b.streamOrder)
        : Number.MAX_SAFE_INTEGER
      return aOrder - bOrder
    })
    return safeSteps
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
    const requestedThinkingMode = normalizeThinkingMode(toggles?.thinkingMode, toggles?.thinking)
    const liteThinkingMode =
      requestedThinkingMode === 'smart'
        ? await runLiteThinkingPlanner({
            question: firstUserText || '',
            selectedAgent,
            settings,
            agents,
          })
        : null
    const resolvedThinkingMode =
      requestedThinkingMode === 'smart'
        ? normalizeThinkingMode(liteThinkingMode, false)
        : requestedThinkingMode
    const thinkingActive = thinkingRule.isLocked
      ? thinkingRule.isThinkingActive
      : !!toggles?.deepResearch || resolvedThinkingMode === 'deep'
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

    const resolvedSkillIds = (() => {
      if (resolvedAgent?.skillIds?.length) return resolvedAgent.skillIds
      if (resolvedAgent?.skill_ids?.length) return resolvedAgent.skill_ids
      return []
    })()

    const searchProvider = settings.searchProvider || 'tavily'
    const tavilyApiKey = searchProvider === 'tavily' ? settings.tavilyApiKey : undefined
    const serpapiApiKey = settings.serpapiApiKey
    const exaApiKey = settings.exaApiKey
    const searchBackends = Array.isArray(toggles?.searchBackends)
      ? toggles.searchBackends.map(item => String(item)).filter(Boolean)
      : typeof toggles?.searchBackend === 'string'
        ? [toggles.searchBackend]
        : []
    const searchBackend = searchBackends[0] || null
    const exaSearchCategory =
      searchBackend === 'exa' && typeof toggles?.exaSearchCategory === 'string'
        ? toggles.exaSearchCategory
        : null

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
    const selectedDatabaseProvider = settings.databaseProvider || 'supabase'

    const modelThinkingParam = thinkingActive
      ? provider.getThinking(thinkingActive, modelConfig.model)
      : undefined
    const modelThinkingModeParam = thinkingActive ? resolvedThinkingMode : undefined

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
      serpapiApiKey,
      exaApiKey,
      exaSearchCategory,
      searchBackend,
      // Pass session summary model config (resolved internaly)
      summaryProvider: summaryModelConfig?.provider,
      summaryModel: summaryModelConfig?.model,
      summaryApiKey: summaryCreds?.apiKey,
      summaryBaseUrl: summaryCreds?.baseUrl,
      enableSessionSummary: toggles.deepResearch ? false : true,

      // RESTORED: Pass memory model config for long term memory tasks (using main model or specific config)
      // This ensures Long Term Memory continues to work as it did before.
      memoryProvider: resolvedMemoryProvider,
      memoryModel: resolvedMemoryModel,
      memoryApiKey: memoryApiKey,
      memoryBaseUrl: memoryBaseUrl,
      enableResponseCache: Boolean(settings.enableResponseCache),
      userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      userLocale: navigator.language || 'en-US',
      runId: hitlRunId,
      fieldValues: hitlFieldValues,
      isEditing: !!isEditing,
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
      tools: provider.getTools(
        toggles.search,
        toggles.searchTool,
        toggles.deepResearch ? false : settings.enableLongTermMemory,
      ),
      toolIds: resolvedToolIds,
      skillIds: resolvedSkillIds,
      deepResearch: !!toggles?.deepResearch,
      thinkingMode: modelThinkingModeParam,
      enableLongTermMemory: toggles.deepResearch ? false : Boolean(settings.enableLongTermMemory),
      databaseProvider: selectedDatabaseProvider,
      thinking: modelThinkingParam,
      signal: controller.signal,
      onChunk: chunk => {
        if (typeof chunk === 'object' && chunk !== null) {
          if (chunk.type === 'research_step') {
            hasNonThoughtEvent = true
            set(state => {
              const updated = [...state.messages]
              const lastMsgIndex = updated.length - 1
              if (lastMsgIndex < 0 || updated[lastMsgIndex].role !== 'ai') {
                return { messages: updated }
              }
              const lastMsg = { ...updated[lastMsgIndex] }
              const steps = Array.isArray(lastMsg.researchSteps) ? [...lastMsg.researchSteps] : []
              const stepKey = buildResearchStepKey(chunk.step)
              const targetIndex = steps.findIndex(item => {
                if (stepKey && item?.stepKey) return item.stepKey === stepKey
                if (stepKey) {
                  const itemKey = buildResearchStepKey(item?.step)
                  if (itemKey) return itemKey === stepKey
                }
                return false
              })
              const normalizedStep = normalizeResearchStepNumber(chunk.step)
              const stepEntry = {
                step: normalizedStep ?? chunk.step,
                stepKey: stepKey || undefined,
                total: chunk.total,
                title: chunk.title || '',
                status: chunk.status || 'running',
                durationMs: typeof chunk.duration_ms === 'number' ? chunk.duration_ms : undefined,
                error: chunk.error || null,
                streamOrder: ++researchStepEventOrder,
              }
              if (targetIndex >= 0) {
                steps[targetIndex] = {
                  ...steps[targetIndex],
                  ...stepEntry,
                  streamOrder: steps[targetIndex]?.streamOrder ?? stepEntry.streamOrder,
                }
              } else {
                steps.push(stepEntry)
              }
              lastMsg.researchSteps = sortResearchSteps(steps)
              updated[lastMsgIndex] = lastMsg
              return { messages: updated }
            })
            return
          }
          if (chunk.type === 'tool_call') {
            flushPending()
            hasNonThoughtEvent = true
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
              const pendingTextLength = (pendingText || '').length
              const baseIndex = (lastMsg.content || '').length + pendingTextLength
              const resolvedTextIndex = normalizeStreamTextIndex(chunk.textIndex, baseIndex)
              const contentSnapshot = `${lastMsg.content || ''}${pendingText || ''}`
              const anchoredTextIndex = resolveToolAnchorIndex(
                contentSnapshot,
                resolvedTextIndex,
                toolName,
              )
              const toolId = chunk.id || `${chunk.name || 'tool'}-${Date.now()}`
              const startedAt = Date.now()
              markToolStarted(toolId, toolName, startedAt)
              history.push({
                id: toolId,
                name: toolName,
                arguments: injectedArguments,
                status: 'calling',
                durationMs: null,
                step: typeof chunk.step === 'number' ? chunk.step : undefined,
                total: typeof chunk.total === 'number' ? chunk.total : undefined,
                textIndex: anchoredTextIndex,
                streamOrder: ++streamEventOrder,
              })
              lastMsg.toolCallHistory = history
              lastMsg.streamBlocks = buildStreamBlocks({
                content: lastMsg.content || '',
                thoughtHistory: getThoughtHistoryForRebuild(lastMsg),
                toolCallHistory: history,
              })
              updated[lastMsgIndex] = lastMsg
              return { messages: updated }
            })
            return
          }
          if (chunk.type === 'tool_result') {
            flushPending()
            hasNonThoughtEvent = true
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
                const startedAt = consumeToolStartedAt(
                  history[targetIndex]?.id,
                  history[targetIndex]?.name,
                )
                history[targetIndex] = {
                  ...history[targetIndex],
                  status: chunk.status || 'done',
                  error: chunk.error || null,
                  output:
                    typeof chunk.output !== 'undefined'
                      ? chunk.output
                      : history[targetIndex].output,
                  durationMs: resolveToolDurationMs({
                    incomingDurationMs: chunk.duration_ms,
                    startedAtMs: startedAt,
                    existingDurationMs: history[targetIndex].durationMs,
                  }),
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
                  durationMs: resolveToolDurationMs({
                    incomingDurationMs: chunk.duration_ms,
                    startedAtMs: consumeToolStartedAt(chunk.id, chunk.name),
                    existingDurationMs: null,
                  }),
                  textIndex: resolveToolAnchorIndex(
                    `${lastMsg.content || ''}${pendingText || ''}`,
                    normalizeStreamTextIndex(
                      chunk.textIndex,
                      (lastMsg.content || '').length + (pendingText || '').length,
                    ),
                    chunk.name || 'tool',
                  ),
                  step: typeof chunk.step === 'number' ? chunk.step : undefined,
                  total: typeof chunk.total === 'number' ? chunk.total : undefined,
                })
              }
              lastMsg.toolCallHistory = history
              lastMsg.streamBlocks = buildStreamBlocks({
                content: lastMsg.content || '',
                thoughtHistory: getThoughtHistoryForRebuild(lastMsg),
                toolCallHistory: history,
              })
              updated[lastMsgIndex] = lastMsg
              return { messages: updated }
            })
            return
          }
          // Handle HITL form request event
          if (chunk.type === 'form_request') {
            flushPending()
            hasNonThoughtEvent = true
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
                const pendingTextLength = (pendingText || '').length
                const baseIndex = (lastMsg.content || '').length + pendingTextLength
                const formTextIndex = normalizeStreamTextIndex(undefined, baseIndex)

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
                  textIndex: formTextIndex,
                  streamOrder: ++streamEventOrder,
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
              lastMsg.streamBlocks = buildStreamBlocks({
                content: lastMsg.content || '',
                thoughtHistory: getThoughtHistoryForRebuild(lastMsg),
                toolCallHistory: history,
              })
              updated[lastMsgIndex] = lastMsg
              return { messages: updated }
            })
            return
          }
          if (chunk.type === 'thought') {
            const rawThought = sanitizeInternalToolTraceChunk(String(chunk.content || ''))
            if (!rawThought) {
              queueFlush()
              return
            }
            const currentMessages = get().messages || []
            const lastStreamMsg = currentMessages[currentMessages.length - 1] || {}
            const fallbackIndex = (lastStreamMsg.content || '').length + (pendingText || '').length
            const thoughtIndex = normalizeStreamTextIndex(chunk.textIndex, fallbackIndex)
            const now = Date.now()
            const resolvedDurationMs = Number.isFinite(chunk.duration_ms)
              ? Number(chunk.duration_ms)
              : Number.isFinite(lastThoughtEventAtMs)
                ? Math.max(0, now - lastThoughtEventAtMs)
                : Math.max(0, now - thoughtStreamStartAtMs)
            lastThoughtEventAtMs = now
            if (hasNonThoughtEvent) {
              thoughtBlockCounter += 1
            }
            hasNonThoughtEvent = false
            pendingThoughtEntries.push({
              blockId: thoughtBlockCounter,
              textIndex: thoughtIndex,
              content: rawThought,
              streamOrder: ++streamEventOrder,
              durationMs: resolvedDurationMs,
            })
          } else if (chunk.type === 'text') {
            const cleanText = sanitizeInternalToolTraceChunk(String(chunk.content || ''))
            if (cleanText) {
              if (!Number.isFinite(finalAnswerStartedAtMs) && cleanText.trim()) {
                finalAnswerStartedAtMs = Date.now()
              }
              pendingText += cleanText
            }
            hasNonThoughtEvent = true
          } else {
            hasNonThoughtEvent = true
          }
        } else {
          const cleanChunkText = sanitizeInternalToolTraceChunk(String(chunk || ''))
          if (cleanChunkText) {
            if (!Number.isFinite(finalAnswerStartedAtMs) && cleanChunkText.trim()) {
              finalAnswerStartedAtMs = Date.now()
            }
            pendingText += cleanChunkText
          }
          hasNonThoughtEvent = true
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
        const finalThought = hitlRunId ? streamedThought : (result.thought ?? streamedThought)
        const finalAnswerDurationMs = Number.isFinite(finalAnswerStartedAtMs)
          ? Math.max(0, Date.now() - Number(finalAnswerStartedAtMs))
          : null
        await finalizeMessage(
          { ...result, thought: finalThought, finalAnswerDurationMs },
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
        concurrencyLimit: toggles?.concurrencyLimit || 3,
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
    if (Array.isArray(payload))
      return payload.filter(item => typeof item === 'string' && item.trim())
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

  const normalizedThought = sanitizeInternalThoughtTrace(result?.thought)
  const normalizeContent = content => {
    if (typeof content === 'string') return sanitizeModelOutputText(content)
    if (Array.isArray(content)) {
      return sanitizeModelOutputText(
        content
          .map(part => {
            if (typeof part === 'string') return part
            if (part?.type === 'text' && part.text) return part.text
            if (part?.text) return part.text
            return ''
          })
          .join(''),
      )
    }
    if (content && typeof content === 'object' && Array.isArray(content.parts)) {
      return sanitizeModelOutputText(
        content.parts.map(p => (typeof p === 'string' ? p : p?.text || '')).join(''),
      )
    }
    return content ? sanitizeModelOutputText(String(content)) : ''
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
        const hasStreamedContent = typeof lastMsg.content === 'string' && lastMsg.content.length > 0
        // Keep streamed content as source-of-truth to preserve tool/thought textIndex alignment.
        // In HITL continuation, the same message already contains interactive_form tool history.
        // If streaming text extraction misses content, we must still fall back to final result content.
        if (!hasStreamedContent || !hasFormInExisting) {
          lastMsg.content = normalizeContent(result.content)
        }
      }
      const thoughtToApply = normalizedThought || lastMsg.thought || ''
      lastMsg.thought = thoughtToApply ? thoughtToApply : undefined
      const toolCallsToProcess = result?.toolCalls || validToolCallHistory

      if (toolCallsToProcess && toolCallsToProcess.length > 0) {
        lastMsg.tool_calls = toolCallsToProcess
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
          const emojiResult =
            typeof provider.generateEmoji === 'function'
              ? await provider
                  .generateEmoji(
                    promptText,
                    credentials.apiKey,
                    credentials.baseUrl,
                    titleModelConfig.model,
                  )
                  .catch(() => ({ emojis: [] }))
              : { emojis: [] }
          resolvedTitle = titleResult?.title || 'New Conversation'
          resolvedTitleEmojis = Array.isArray(emojiResult?.emojis) ? emojiResult.emojis : []
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
      const plan = typeof latestAi?.researchPlan === 'string' ? latestAi.researchPlan : null
      return plan
    })()
    const toolCallHistoryForPersistence = (() => {
      return Array.isArray(latestAi?.toolCallHistory) ? latestAi.toolCallHistory : null
    })()
    const researchStepsForPersistence = (() => {
      return Array.isArray(latestAi?.researchSteps) ? latestAi.researchSteps : null
    })()
    const thoughtHistoryForPersistence = (() => {
      const direct = Array.isArray(latestAi?.thoughtHistory) ? latestAi.thoughtHistory : null
      if (direct && direct.length > 0) return direct
      const derived = deriveThoughtHistoryFromStreamBlocks(latestAi?.streamBlocks)
      return derived.length > 0 ? derived : null
    })()
    const finalAnswerDurationMsForPersistence = (() => {
      const direct = result?.finalAnswerDurationMs
      if (Number.isFinite(direct) && Number(direct) >= 0) return Number(direct)
      if (
        Number.isFinite(latestAi?.finalAnswerDurationMs) &&
        Number(latestAi.finalAnswerDurationMs) >= 0
      ) {
        return Number(latestAi.finalAnswerDurationMs)
      }
      return null
    })()
    const thoughtForPersistence = (() => {
      const payload = {}
      if (planForPersistence) payload.plan = planForPersistence
      if (baseThought) payload.thought = baseThought
      if (thoughtHistoryForPersistence && thoughtHistoryForPersistence.length > 0) {
        payload.thoughtHistory = thoughtHistoryForPersistence
      }
      if (Number.isFinite(finalAnswerDurationMsForPersistence)) {
        payload.finalAnswerDurationMs = Number(finalAnswerDurationMsForPersistence)
      }
      const result = Object.keys(payload).length > 0 ? JSON.stringify(payload) : baseThought
      return result
    })()
    const contentForPersistence = (() => {
      // Always prefer streamed store content to keep thought/tool positions stable after completion.
      if (typeof latestAi?.content === 'string' && latestAi.content.length > 0) {
        return sanitizeModelOutputText(latestAi.content)
      }
      return typeof result.content !== 'undefined'
        ? normalizeContent(result.content)
        : sanitizeModelOutputText(latestAi?.content ?? '')
    })()
    const databaseProviderKey = String(settings?.databaseProvider || '').toLowerCase()
    const streamBlocksForRuntime = buildStreamBlocks({
      content: contentForPersistence,
      thoughtHistory: thoughtHistoryForPersistence || [],
      toolCallHistory: toolCallHistoryForPersistence || [],
    })
    const pipelineForRuntime = buildMessagePipeline({
      ...latestAi,
      content: contentForPersistence,
      streamBlocks: streamBlocksForRuntime,
      expertMode: latestAi?.expertMode,
      expertResponses: latestAi?.expertResponses,
      researchPlan: planForPersistence,
      researchSteps: researchStepsForPersistence || [],
      sources:
        (latestAi?.sources && latestAi.sources.length > 0 ? latestAi.sources : null) ||
        result.sources ||
        null,
      documentSources: documentSources || latestAi?.documentSources || null,
      finalAnswerDurationMs: finalAnswerDurationMsForPersistence,
    })
    const shouldPersistStreamBlocks =
      databaseProviderKey.includes('sqlite') ||
      databaseProviderKey.includes('supabase') ||
      databaseProviderKey.includes('postgres')
    const streamBlocksForPersistence = shouldPersistStreamBlocks ? streamBlocksForRuntime : null

    // Keep runtime rendering order consistent with persisted stream_blocks,
    // so UI doesn't jump between two ordering strategies before page refresh.
    set(state => {
      const updated = [...state.messages]
      for (let i = updated.length - 1; i >= 0; i -= 1) {
        if (updated[i].role !== 'ai') continue
        updated[i] = {
          ...updated[i],
          streamBlocks: streamBlocksForRuntime,
          pipelineTrace: pipelineForRuntime,
          streamSchemaVersion: 1,
          ...(Number.isFinite(finalAnswerDurationMsForPersistence) && {
            finalAnswerDurationMs: Number(finalAnswerDurationMsForPersistence),
          }),
        }
        break
      }
      return { messages: updated }
    })

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
      pipeline_trace: sanitizeJson(pipelineForRuntime || null),
      ...(shouldPersistStreamBlocks && {
        stream_blocks: sanitizeJson(streamBlocksForPersistence || []),
        stream_schema_version: 1,
      }),
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
        const updatePayload = {
          title: resolvedTitle,
          title_emojis: resolvedTitleEmojis,
          space_id: resolvedSpace ? resolvedSpace.id : undefined,
          api_provider: resolvedAgent?.provider || safeAgent?.provider || '',
          last_agent_id: safeAgent?.id || undefined,
          agent_selection_mode: isAgentAutoMode ? 'auto' : 'manual',
        }
        const { data: updatedConversation, error: updateError } = await updateConversation(
          currentStore.conversationId,
          updatePayload,
        )
        if (updateError) throw updateError
        notifyConversationPatched(
          updatedConversation || {
            id: currentStore.conversationId,
            ...updatePayload,
          },
        )
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
        const agentPatch = {
          last_agent_id: safeAgent.id,
        }
        const { data: updatedConversation, error: updateError } = await updateConversation(
          currentStore.conversationId,
          agentPatch,
        )
        if (updateError) throw updateError
        notifyConversationPatched(
          updatedConversation || {
            id: currentStore.conversationId,
            ...agentPatch,
          },
        )
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
            languageInstruction || undefined,
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
