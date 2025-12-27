import { create } from 'zustand'
import { createConversation, addMessage, updateConversation } from '../lib/conversationsService'
import { deleteMessageById } from '../lib/supabase'
import { getProvider } from '../lib/providers'
import { getModelForTask } from '../lib/modelSelector.js'
import { loadSettings } from './settings'
import { listSpaceAgents } from './spacesService'

// Model separator used in encoded model IDs (e.g., "glm::glm-4.7")
const MODEL_SEPARATOR = '::'

/**
 * Decodes a model ID that was encoded with provider prefix
 * @param {string} encodedModel - Encoded model ID (e.g., "glm::glm-4.7")
 * @returns {string} Decoded model ID (e.g., "glm-4.7")
 */
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

// ================================================================================
// CHAT STORE HELPER FUNCTIONS
// These functions are organized by functionality to improve maintainability
// ================================================================================

// ========================================
// INPUT VALIDATION & MESSAGE CONSTRUCTION
// ========================================
/**
 * Validates user input before sending a message
 * @param {string} text - The message text
 * @param {Array} attachments - Array of file attachments
 * @param {boolean} isLoading - Whether another operation is in progress
 * @returns {Object} Validation result with isValid flag and optional reason
 */
const validateInput = (text, attachments, isLoading) => {
  // Check if input is valid (text is required)
  if (!text.trim()) {
    return { isValid: false, reason: 'empty_input' }
  }

  // Check if another operation is already in progress
  if (isLoading) {
    return { isValid: false, reason: 'already_loading' }
  }

  return { isValid: true }
}

/**
 * Builds a user message object with proper content structure
 * @param {string} text - The message text
 * @param {Array} attachments - Array of file attachments
 * @returns {Object} User message object with role, content, and timestamp
 */
const buildUserMessage = (text, attachments, quoteContext) => {
  const now = new Date().toISOString()
  const quoteText = quoteContext?.text?.trim()

  const buildContentArray = (textValue, includeQuote = false) => {
    const textPart = { type: 'text', text: textValue }
    const parts =
      includeQuote && quoteText ? [{ type: 'quote', text: quoteText }, textPart] : [textPart]
    return attachments.length > 0 ? [...parts, ...attachments] : parts
  }

  // Content used for UI + persistence (keeps quote separate for rendering)
  const displayContent =
    quoteText || attachments.length > 0 ? buildContentArray(text, !!quoteText) : text

  // Content sent to the model (include quote text + original source content if provided)
  const quoteSource = quoteContext?.sourceContent?.trim()
  // const composedQuote = [quoteText, quoteSource].filter(Boolean).join('\n\n')
  const textWithPrefix =
    quoteText && quoteSource && text
      ? `###User quoted these sentences from context:\n${quoteText}\n\n###User question:\n${text}\n\n ###User original context:\n${quoteSource}`
      : text
  const payloadContent =
    attachments.length > 0 ? buildContentArray(textWithPrefix, false) : textWithPrefix

  const userMessage = { role: 'user', content: displayContent, created_at: now }

  return { userMessage, payloadContent }
}

/**
 * Normalizes message content to be safe for provider payloads (strips custom types like quote)
 * while preserving attachments and text.
 */
const normalizeMessageForSend = message => {
  if (!message) return message
  const content = message.content
  if (Array.isArray(content)) {
    const attachments = content.filter(part => part?.type === 'image_url')
    const textValue = content
      .filter(part => part?.type !== 'image_url')
      .map(part => {
        if (typeof part === 'string') return part
        if (part?.text) return part.text
        return ''
      })
      .filter(Boolean)
      .join('\n\n')

    const normalizedContent =
      attachments.length > 0 ? [{ type: 'text', text: textValue }, ...attachments] : textValue

    return { ...message, content: normalizedContent }
  }

  return message
}

const getLanguageInstruction = agent => {
  const trimmedLanguage =
    typeof (agent?.response_language || agent?.responseLanguage) === 'string'
      ? (agent.response_language || agent.responseLanguage).trim()
      : ''
  return trimmedLanguage ? `Reply in ${trimmedLanguage}.` : ''
}

const buildSpaceAgentOptions = async (spaces, agents) => {
  if (!Array.isArray(spaces) || spaces.length === 0) return []
  const agentMap = new Map((agents || []).map(agent => [String(agent.id), agent]))
  const results = await Promise.all(
    spaces.map(async space => {
      if (!space?.id) return null
      try {
        const { data } = await listSpaceAgents(space.id)
        const seen = new Set()
        const agentEntries = (data || [])
          .map(item => agentMap.get(String(item.agent_id)))
          .filter(Boolean)
          .filter(agent => {
            const key = String(agent.id)
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
          .map(agent => ({
            name: agent.name,
            description: typeof agent.description === 'string' ? agent.description.trim() : '',
          }))
        return {
          label: space.label,
          description: typeof space.description === 'string' ? space.description.trim() : '',
          agents: agentEntries,
        }
      } catch (error) {
        console.error('Failed to load space agents:', error)
        return {
          label: space.label,
          description: typeof space.description === 'string' ? space.description.trim() : '',
          agents: [],
        }
      }
    }),
  )
  return results.filter(Boolean)
}

const resolveAgentForSpace = (agentName, space, spaceAgents, agents) => {
  if (!space) return null
  const spaceEntry = (spaceAgents || []).find(item => {
    return item.label === space.label
  })
  if (!agentName) return null
  const normalizedName =
    typeof agentName === 'string' ? agentName.split(' - ')[0].trim() : agentName
  const allowedNames = new Set(
    (spaceEntry?.agents || []).map(agent => agent.name).filter(Boolean),
  )
  if (!allowedNames.has(normalizedName)) return null
  const lowerName = normalizedName.toLowerCase()
  return (
    (agents || []).find(agent => (agent.name || '').trim().toLowerCase() === lowerName) || null
  )
}

/**
 * Builds system prompt from Agent configuration
 * Combines agent prompt with personalization settings
 * @param {Object} agent - Agent object with prompt and personalization settings
 * @param {Object} settings - Global settings for fallback
 * @returns {string|null} Combined system prompt or null
 */
const buildAgentPrompt = agent => {
  if (!agent) return null

  const parts = []

  // 1. Agent's base prompt
  const agentPrompt = typeof agent.prompt === 'string' ? agent.prompt.trim() : ''
  if (agentPrompt) {
    parts.push(agentPrompt)
  }

  // 2. Personalization settings (agent only)
  // Support both snake_case (from DB) and camelCase (from mapAgent)
  const baseTone = agent.base_tone || agent.baseTone || ''
  const traits = agent.traits || ''
  const warmth = agent.warmth || ''
  const enthusiasm = agent.enthusiasm || ''
  const headings = agent.headings || ''
  const emojis = agent.emojis || ''
  const customInstruction = agent.custom_instruction || agent.customInstruction || ''

  // Build style prompt from personalization settings
  const styleParts = []
  if (baseTone) styleParts.push(`Base Tone: ${baseTone}`)
  if (traits) styleParts.push(`Traits: ${traits}`)
  if (warmth) styleParts.push(`Warmth: ${warmth}`)
  if (enthusiasm) styleParts.push(`Enthusiasm: ${enthusiasm}`)
  if (headings) styleParts.push(`Headings: ${headings}`)
  if (emojis) styleParts.push(`Emojis: ${emojis}`)
  if (customInstruction) styleParts.push(`Custom Instruction: ${customInstruction}`)

  if (styleParts.length > 0) {
    parts.push(`### Response Style Guidelines:\n${styleParts.join('\n')}`)
  }

  // 3. Language instruction (agent only)
  const languageInstruction = getLanguageInstruction(agent)
  if (languageInstruction) parts.push(languageInstruction)

  return parts.length > 0 ? parts.join('\n\n') : null
}

/**
 * Gets model configuration for a given agent
 * Falls back to global settings if agent doesn't have specific config
 * @param {Object} agent - Agent object with model settings
 * @param {Object} settings - Global settings for fallback
 * @param {string} task - Task type (streamChatCompletion, generateTitle, etc.)
 * @returns {Object} Model configuration { provider, model }
 */
const getModelConfigForAgent = (agent, settings, task = 'streamChatCompletion') => {
  // Check if agent exists and has valid config first
  if (agent && agent.provider) {
    // Support both snake_case (from DB) and camelCase (from mapAgent)
    // Use ?? to preserve empty strings (only null/undefined should trigger fallback)
    const defaultModel = agent.default_model ?? agent.defaultModel
    const liteModel = agent.lite_model ?? agent.liteModel

    // Check if agent has a valid (non-empty) model configured
    // Empty string means "not configured", so we should fall back to global settings
    if (defaultModel && defaultModel.trim() !== '') {
      // Decode model IDs (they may be encoded with provider prefix like "glm::glm-4.7")
      const decodedDefaultModel = decodeModelId(defaultModel)
      const decodedLiteModel = liteModel ? decodeModelId(liteModel) : ''
      const defaultProvider = getProviderFromEncodedModel(defaultModel)
      const liteProvider = getProviderFromEncodedModel(liteModel)
      const isLiteTask =
        task === 'generateTitle' ||
        task === 'generateTitleAndSpace' ||
        task === 'generateRelatedQuestions'

      // For lite tasks, use lite_model if available
      const model = isLiteTask ? decodedLiteModel || decodedDefaultModel : decodedDefaultModel
      const provider = isLiteTask
        ? liteProvider || defaultProvider || agent.provider
        : defaultProvider || agent.provider

      return {
        provider,
        model,
      }
    }
  }

  // Fallback to global settings
  return {
    provider: settings?.apiProvider,
    model: getModelForTask(task, settings),
  }
}

const applyLanguageInstructionToText = (text, instruction) => {
  if (!instruction) return text
  const baseText = typeof text === 'string' ? text.trim() : ''
  return baseText ? `${baseText}\n\n${instruction}` : instruction
}

// ========================================
// EDITING & HISTORY MANAGEMENT
// ========================================

/**
 * Handles message editing and history context preparation
 * Manages both UI state (what user sees) and API context (what gets sent to AI)
 * @param {Array} messages - Current message array
 * @param {Object} editingInfo - Information about the message being edited
 * @param {Object} userMessage - The new user message to insert
 * @returns {Object} Contains newMessages (for UI) and historyForSend (for API)
 */
const handleEditingAndHistory = (messages, editingInfo, userMessage, historyOverride = null) => {
  // Base history for context: when editing, include only messages before the edited one
  const baseHistory =
    editingInfo?.index !== undefined && editingInfo.index !== null
      ? messages.slice(0, editingInfo.index)
      : messages

  const historyForSend = historyOverride !== null ? historyOverride : baseHistory
  const safeHistoryForSend = (historyForSend || []).map(normalizeMessageForSend)

  // UI state: remove edited user message (and its paired AI answer if any), then append the new user message at the end
  let newMessages
  if (editingInfo?.index !== undefined && editingInfo.index !== null) {
    const nextMsg = messages[editingInfo.index + 1]
    const hasAiPartner = nextMsg && nextMsg.role === 'ai'
    const tailStart = editingInfo.index + 1 + (hasAiPartner ? 1 : 0)

    newMessages = [
      ...messages.slice(0, editingInfo.index),
      ...messages.slice(tailStart),
      userMessage,
    ]
  } else {
    newMessages = [...messages, userMessage]
  }

  return { newMessages, historyForSend: safeHistoryForSend }
}

// ========================================
// DATABASE OPERATIONS
// ========================================

/**
 * Preselects title, space, and agent for auto mode before the first request.
 * Uses AI to intelligently select the most appropriate title, space, and agent based on the user's message.
 * @param {string} firstMessage - Raw user text
 * @param {Object} settings - User settings and API configuration
 * @param {Array} spaces - Available spaces for auto-selection
 * @param {Array} agents - Available agents for auto-selection
 * @param {Object} selectedAgent - Currently selected agent (optional)
 * @returns {Promise<{ title: string, space: Object|null, agent: Object|null }>}
 */
const preselectTitleSpaceAndAgentForAuto = async (
  firstMessage,
  settings,
  spaces,
  agents,
  selectedAgent = null,
) => {
  // Use agent's model config if available, otherwise fall back to global settings
  const modelConfig = getModelConfigForAgent(selectedAgent, settings, 'generateTitleAndSpace')
  const provider = getProvider(modelConfig.provider)
  const credentials = provider.getCredentials(settings)
  const languageInstruction = getLanguageInstruction(selectedAgent)
  const promptText = applyLanguageInstructionToText(firstMessage, languageInstruction)
  const spaceAgents = await buildSpaceAgentOptions(spaces, agents)
  if (spaceAgents.length && provider.generateTitleSpaceAndAgent) {
    const { title, spaceLabel, agentName } = await provider.generateTitleSpaceAndAgent(
      promptText,
      spaceAgents,
      credentials.apiKey,
      credentials.baseUrl,
      modelConfig.model,
    )
    const normalizedSpaceLabel =
      typeof spaceLabel === 'string' ? spaceLabel.split(' - ')[0].trim() : spaceLabel
    const selectedSpace =
      (spaces || []).find(s => s.label === normalizedSpaceLabel) || null
    const agentCandidate =
      selectedSpace && agentName
        ? resolveAgentForSpace(agentName, selectedSpace, spaceAgents, agents)
        : null
    return { title, space: selectedSpace, agent: agentCandidate }
  }

  const { title, space } = await provider.generateTitleAndSpace(
    promptText,
    spaces || [],
    credentials.apiKey,
    credentials.baseUrl,
    modelConfig.model,
  )
  return { title, space: space || null, agent: null }
}

/**
 * Preselects a title for manual space before the first request.
 * @param {string} firstMessage - Raw user text
 * @param {Object} settings - User settings and API configuration
 * @param {Object} selectedAgent - Currently selected agent (optional)
 * @returns {Promise<string>}
 */
const preselectTitleForManual = async (firstMessage, settings, selectedAgent = null) => {
  // Use agent's model config if available, otherwise fall back to global settings
  const modelConfig = getModelConfigForAgent(selectedAgent, settings, 'generateTitle')
  const provider = getProvider(modelConfig.provider)
  const credentials = provider.getCredentials(settings)
  const languageInstruction = getLanguageInstruction(selectedAgent)
  const promptText = applyLanguageInstructionToText(firstMessage, languageInstruction)
  return provider.generateTitle(promptText, credentials.apiKey, credentials.baseUrl, modelConfig.model)
}

/**
 * Ensures a conversation exists in the database, creating one if necessary
 * @param {string|null} conversationId - Existing conversation ID or null
 * @param {Object} settings - User settings including API provider
 * @param {Object} toggles - Feature toggles (search, thinking)
 * @param {Object} spaceInfo - Space selection information
 * @param {Function} set - Zustand set function
 * @returns {{ id: string, data: object|null, isNew: boolean }} Conversation info
 * @throws {Error} If conversation creation fails
 */
const ensureConversationExists = async (conversationId, settings, toggles, spaceInfo, set) => {
  // If conversation already exists, return it
  if (conversationId) {
    return { id: conversationId, data: null, isNew: false }
  }

  // Create new conversation payload
  const creationPayload = {
    space_id: spaceInfo.selectedSpace ? spaceInfo.selectedSpace.id : null,
    title: 'New Conversation',
    api_provider: settings.apiProvider,
  }

  const { data, error } = await createConversation(creationPayload)
  if (!error && data) {
    // Update store with new conversation ID
    set({ conversationId: data.id })
    // Notify other components that conversations list changed
    window.dispatchEvent(new Event('conversations-changed'))
    return { id: data.id, data, isNew: true }
  } else {
    console.error('Create conversation failed:', error)
    // Reset loading state on error
    set({ isLoading: false })
    throw new Error('Failed to create conversation')
  }
}

/**
 * Persists user message to database and handles editing cleanup
 * @param {string} convId - Conversation ID
 * @param {Object|null} editingInfo - Information about message being edited
 * @param {string|Array} content - Message content (text or structured with attachments)
 * @param {Function} set - Zustand set function
 */
const persistUserMessage = async (convId, editingInfo, content, set) => {
  // Handle editing: delete old messages if editing
  if (editingInfo?.index !== undefined && editingInfo.index !== null) {
    if (editingInfo.targetId) await deleteMessageById(editingInfo.targetId)
    if (editingInfo.partnerId) await deleteMessageById(editingInfo.partnerId)
  }

  // Insert the new user message into database
  const { data: insertedUser } = await addMessage({
    conversation_id: convId,
    role: 'user',
    content,
    created_at: new Date().toISOString(),
  })

  // Update UI message with database ID and timestamp
  if (insertedUser) {
    set(state => {
      const updated = [...state.messages]
      // Find the last user message without ID and update it with database info
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].role === 'user' && !updated[i].id) {
          updated[i] = {
            ...updated[i],
            id: insertedUser.id,
            created_at: insertedUser.created_at,
          }
          break
        }
      }
      return { messages: updated }
    })
  }
}

// ========================================
// AI API INTEGRATION
// ========================================

/**
 * Prepares AI message placeholder and conversation context for API call
 * @param {Array} historyForSend - Message history to send to AI
 * @param {Object} userMessage - Current user message
 * @param {Object} spaceInfo - Space selection information
 * @param {Object} selectedAgent - Currently selected agent (optional)
 * @param {Object} settings - User settings
 * @param {Function} set - Zustand set function
 * @returns {Object} Contains conversationMessages (for API) and aiMessagePlaceholder (for UI)
 */
const prepareAIPlaceholder = (historyForSend, userMessageForSend, spaceInfo, selectedAgent, settings, set, toggles) => {
  const resolvedPrompt = buildAgentPrompt(selectedAgent)

  const conversationMessagesBase = [
    ...(resolvedPrompt ? [{ role: 'system', content: resolvedPrompt }] : []),
    ...historyForSend,
  ]

  // Combine base messages with user message
  const conversationMessages = [...conversationMessagesBase, userMessageForSend]

  // Create AI message placeholder for streaming updates
  const aiMessagePlaceholder = {
    role: 'ai',
    content: '',
    created_at: new Date().toISOString(),
    thinkingEnabled: !!toggles?.thinking,
    agentId: selectedAgent?.id || null,
    agentName: selectedAgent?.name || null,
    agentEmoji: selectedAgent?.emoji || '',
    agentIsDefault: !!selectedAgent?.isDefault,
  }

  // Add placeholder to UI
  set(state => ({ messages: [...state.messages, aiMessagePlaceholder] }))

  return { conversationMessages, aiMessagePlaceholder }
}

/**
 * Calls AI provider API with streaming support
 * Handles chunk updates, completion, and error states
 * @param {Array} conversationMessages - Messages to send to AI
 * @param {Object} aiMessagePlaceholder - Placeholder message for streaming updates
 * @param {Object} settings - User settings and API configuration
 * @param {Object} toggles - Feature toggles (search, thinking)
 * @param {Object} callbacks - Optional callback functions for title/space generation
 * @param {Array} spaces - Available spaces for auto-generation
 * @param {Object} spaceInfo - Space selection information
 * @param {Object} selectedAgent - Currently selected agent (optional)
 * @param {Array} agents - Available agents (optional)
 * @param {string|null} preselectedTitle - Preselected title for auto mode (optional)
 * @param {Function} get - Zustand get function
 * @param {Function} set - Zustand set function
 * @param {number} historyLengthBeforeSend - Length of the conversation before the current user turn (for metadata)
 * @param {string} firstUserText - Raw text of the current user message
 */
const callAIAPI = async (
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
  get,
  set,
  historyLengthBeforeSend,
  firstUserText,
  isAgentAutoMode = false,
) => {
  let streamedThought = ''
  let pendingText = ''
  let pendingThought = ''
  let rafId = null

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
    const modelConfig = getModelConfigForAgent(selectedAgent, settings, 'streamChatCompletion')
    const provider = getProvider(modelConfig.provider)
    const credentials = provider.getCredentials(settings)

    // Tag the placeholder with provider/model so UI can show it while streaming
    set(state => {
      const updated = [...state.messages]
      const lastMsgIndex = updated.length - 1
      if (lastMsgIndex < 0) return { messages: updated }
      const lastMsg = { ...updated[lastMsgIndex] }
      if (lastMsg.role === 'ai') {
        lastMsg.provider = modelConfig.provider
        lastMsg.model = modelConfig.model
        updated[lastMsgIndex] = lastMsg
      }
      return { messages: updated }
    })

    // Extract agent settings
    const agentTemperature = selectedAgent?.temperature
    const agentTopP = selectedAgent?.topP ?? selectedAgent?.top_p
    const agentFrequencyPenalty =
      selectedAgent?.frequencyPenalty ?? selectedAgent?.frequency_penalty
    const agentPresencePenalty =
      selectedAgent?.presencePenalty ?? selectedAgent?.presence_penalty

    // Prepare API parameters
    const params = {
      ...credentials,
      model: modelConfig.model,
      temperature: agentTemperature ?? undefined,
      top_p: agentTopP ?? undefined,
      frequency_penalty: agentFrequencyPenalty ?? undefined,
      presence_penalty: agentPresencePenalty ?? undefined,
      contextMessageLimit: settings.contextMessageLimit,
      messages: conversationMessages.map(m => ({
        role: m.role === 'ai' ? 'assistant' : m.role,
        content: m.content,
        ...(m.tool_calls && { tool_calls: m.tool_calls }),
        ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
        ...(m.name && { name: m.name }),
      })),
      tools: provider.getTools(toggles.search),
      thinking: provider.getThinking(toggles.thinking, modelConfig.model),
      onChunk: chunk => {
        if (typeof chunk === 'object' && chunk !== null) {
          if (chunk.type === 'thought') {
            pendingThought += chunk.content
          } else if (chunk.type === 'text') {
            pendingText += chunk.content
          }
        } else {
          // Fallback for string chunks
          pendingText += chunk
        }

        queueFlush()
      },
      onFinish: async result => {
        // Handle streaming completion and finalization
        flushPending()
        set({ isLoading: false })
        const currentStore = get() // Get fresh state
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
          toggles,
          selectedAgent,
          agents,
          isAgentAutoMode,
        )
      },
      onError: err => {
        // Handle streaming errors
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

    await provider.streamChatCompletion(params)
  } catch (error) {
    flushPending()
    console.error('Setup error:', error)
    set({ isLoading: false })
  }
}

/**
 * Finalizes AI message after streaming completion
 * Handles title/space generation, related questions, and database persistence
 * @param {Object} result - AI response result containing content and tool calls
 * @param {Object} currentStore - Current chat store state
 * @param {Object} settings - User settings and API configuration
 * @param {Object} callbacks - Optional callback functions for title/space generation
 * @param {Array} spaces - Available spaces for auto-generation
 * @param {Function} set - Zustand set function
 * @param {boolean} [isFirstTurnOverride] - Explicit flag indicating first turn
 * @param {string} [firstUserText] - Raw text of the initial user message
 * @param {Object} spaceInfo - Space selection information
 * @param {string|null} preselectedTitle - Preselected title for auto mode (optional)
 * @param {Object} toggles - Feature toggles (search, thinking, related)
 * @param {Object} selectedAgent - Currently selected agent (optional)
 * @param {Array} agents - Available agents list for resolving defaults
 * @param {boolean} [isAgentAutoMode] - Whether agent selection is in auto mode
 */
const finalizeMessage = async (
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
  toggles = {},
  selectedAgent = null,
  agents = [],
  isAgentAutoMode = false,
) => {
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

  // Get model configuration: Agent priority, global fallback
  const modelConfig = getModelConfigForAgent(selectedAgent, settings, 'streamChatCompletion')

  // Replace streamed placeholder with finalized content (e.g., with citations/grounding)
  set(state => {
    const updated = [...state.messages]
    const lastMsgIndex = updated.length - 1
    if (lastMsgIndex >= 0 && updated[lastMsgIndex].role === 'ai') {
      const lastMsg = { ...updated[lastMsgIndex] }
      if (typeof result?.content !== 'undefined') {
        lastMsg.content = normalizeContent(result.content)
      }
      const thoughtToApply = normalizedThought || lastMsg.thought || ''
      lastMsg.thought = thoughtToApply ? thoughtToApply : undefined
      if (result?.toolCalls) {
        lastMsg.tool_calls = result.toolCalls
      }
      lastMsg.provider = modelConfig.provider
      lastMsg.model = modelConfig.model
      updated[lastMsgIndex] = lastMsg
    }
    return { messages: updated }
  })

  // Generate title and space if this is the first turn
  let resolvedTitle = currentStore.conversationTitle
  let resolvedSpace = spaceInfo?.selectedSpace || null
  let resolvedAgent = selectedAgent || null

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

  const firstMessageText = firstUserText ?? fallbackFirstUserText

  if (isFirstTurn) {
    if (typeof preselectedTitle === 'string' && preselectedTitle.trim()) {
      resolvedTitle = preselectedTitle.trim()
      set({ conversationTitle: resolvedTitle })
    } else if (spaceInfo?.isManualSpaceSelection && spaceInfo?.selectedSpace) {
      // Generate title only when space is manually selected
      const titleModelConfig = getModelConfigForAgent(selectedAgent, settings, 'generateTitle')
      const provider = getProvider(titleModelConfig.provider)
      const credentials = provider.getCredentials(settings)
      const languageInstruction = getLanguageInstruction(selectedAgent)
      const promptText = applyLanguageInstructionToText(firstMessageText, languageInstruction)
      resolvedTitle = await provider.generateTitle(
        promptText,
        credentials.apiKey,
        credentials.baseUrl,
        titleModelConfig.model,
      )
      set({ conversationTitle: resolvedTitle })
    } else if (callbacks?.onTitleAndSpaceGenerated) {
      // Use callback to generate both title and space
      const titleModelConfig = getModelConfigForAgent(selectedAgent, settings, 'generateTitleAndSpace')
      const provider = getProvider(titleModelConfig.provider)
      const credentials = provider.getCredentials(settings)
      const languageInstruction = getLanguageInstruction(selectedAgent)
      const promptText = applyLanguageInstructionToText(firstMessageText, languageInstruction)
      const { title, space } = await callbacks.onTitleAndSpaceGenerated(
        promptText,
        credentials.apiKey,
        credentials.baseUrl,
      )
      resolvedTitle = title
      set({ conversationTitle: title })
      resolvedSpace = space || null
    } else {
      // Generate both title and space automatically
      const titleModelConfig = getModelConfigForAgent(selectedAgent, settings, 'generateTitleAndSpace')
      const provider = getProvider(titleModelConfig.provider)
      const credentials = provider.getCredentials(settings)
      const languageInstruction = getLanguageInstruction(selectedAgent)
      const promptText = applyLanguageInstructionToText(firstMessageText, languageInstruction)
      if (!resolvedAgent && provider.generateTitleSpaceAndAgent) {
        const spaceAgents = await buildSpaceAgentOptions(spaces, agents)
        if (spaceAgents.length) {
          const { title, spaceLabel, agentName } = await provider.generateTitleSpaceAndAgent(
              promptText,
              spaceAgents,
              credentials.apiKey,
              credentials.baseUrl,
              titleModelConfig.model,
            )
          resolvedTitle = title
          set({ conversationTitle: title })
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
        const { title, space } = await provider.generateTitleAndSpace(
          promptText,
          spaces || [],
          credentials.apiKey,
          credentials.baseUrl,
          titleModelConfig.model,
        )
        resolvedTitle = title
        set({ conversationTitle: title })
        resolvedSpace = space || resolvedSpace || null
      }
    }
  }

  // Generate related questions (only if enabled)
  let related = []
  if (toggles?.related) {
    set(state => {
      const updated = [...state.messages]
      const lastMsgIndex = updated.length - 1
      if (lastMsgIndex >= 0 && updated[lastMsgIndex].role === 'ai') {
        updated[lastMsgIndex] = {
          ...updated[lastMsgIndex],
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
      const languageInstruction = getLanguageInstruction(selectedAgent)
      const relatedMessages = sanitizedMessages.slice(-2)
      if (languageInstruction) {
        relatedMessages.unshift({ role: 'system', content: languageInstruction })
      }

      // Use agent's model config if available, otherwise fall back to global settings
      const modelConfig = getModelConfigForAgent(selectedAgent, settings, 'generateRelatedQuestions')
      const provider = getProvider(modelConfig.provider)
      const credentials = provider.getCredentials(settings)
      related = await provider.generateRelatedQuestions(
        relatedMessages, // Only use the last 2 messages (User + AI) for context
        credentials.apiKey,
        credentials.baseUrl,
        modelConfig.model, // Use the configured model for this task
      )
    } catch (error) {
      console.error('Failed to generate related questions:', error)
    } finally {
      set(state => {
        const updated = [...state.messages]
        const lastMsgIndex = updated.length - 1
        if (lastMsgIndex >= 0 && updated[lastMsgIndex].role === 'ai') {
          updated[lastMsgIndex] = {
            ...updated[lastMsgIndex],
            relatedLoading: false,
          }
        }
        return { messages: updated }
      })
    }
  }

  // Attach sources to the last AI message (for Gemini search)
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

  if (related && related.length > 0) {
    set(state => {
      const updated = [...state.messages]
      const lastMsgIndex = updated.length - 1
      const lastMsg = { ...updated[lastMsgIndex] }
      lastMsg.related = related
      if (result.sources && result.sources.length > 0) {
        lastMsg.sources = result.sources
      }
      if (result.groundingSupports && result.groundingSupports.length > 0) {
        lastMsg.groundingSupports = result.groundingSupports
      }
      updated[lastMsgIndex] = lastMsg
      return { messages: updated }
    })
  }

  // Persist AI message in database
  if (currentStore.conversationId) {
    const fallbackThoughtFromState = (() => {
      const aiMessages = (currentStore.messages || []).filter(m => m.role === 'ai')
      const latestAi = aiMessages[aiMessages.length - 1]
      const thoughtValue = latestAi?.thought
      return typeof thoughtValue === 'string' ? thoughtValue.trim() : ''
    })()

    const thoughtForPersistence = normalizedThought || fallbackThoughtFromState || null
    const contentForPersistence =
      typeof result.content !== 'undefined'
        ? result.content
        : (currentStore.messages?.[currentStore.messages.length - 1]?.content ?? '')

    const { data: insertedAi } = await addMessage({
      conversation_id: currentStore.conversationId,
      role: 'assistant',
      provider: modelConfig.provider,
      model: modelConfig.model,
      agent_id: selectedAgent?.id || null,
      agent_name: selectedAgent?.name || null,
      agent_emoji: selectedAgent?.emoji || '',
      agent_is_default: !!selectedAgent?.isDefault,
      content: contentForPersistence,
      thinking_process: thoughtForPersistence,
      tool_calls: result.toolCalls || null,
      related_questions: related || null,
      sources: result.sources || null,
      grounding_supports: result.groundingSupports || null,
      created_at: new Date().toISOString(),
    })

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

  // Update conversation in database
  if (currentStore.conversationId) {
    try {
      if (isFirstTurn) {
        // First turn: update title, space, agent_selection_mode, and last_agent_id
        await updateConversation(currentStore.conversationId, {
          title: resolvedTitle,
          space_id: resolvedSpace ? resolvedSpace.id : null,
          last_agent_id: selectedAgent?.id || null,
          agent_selection_mode: isAgentAutoMode ? 'auto' : 'manual',
        })
        window.dispatchEvent(new Event('conversations-changed'))

        // Dispatch a specific event for conversation update
        window.dispatchEvent(
          new CustomEvent('conversation-space-updated', {
            detail: {
              conversationId: currentStore.conversationId,
              space: resolvedSpace,
            },
          }),
        )

        // Notify callback if space was resolved (only on first turn or when space changed)
        if (callbacks?.onSpaceResolved && resolvedSpace) {
          callbacks.onSpaceResolved(resolvedSpace)
        }
      } else if (selectedAgent?.id) {
        // Subsequent turns: only update last_agent_id
        await updateConversation(currentStore.conversationId, {
          last_agent_id: selectedAgent.id,
        })
      }
    } catch (error) {
      console.error('Failed to update conversation:', error)
    }
  }
}

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
  /** Loading state for ongoing operations */
  isLoading: false,
  /** Loading state for preselecting space/title in auto mode */
  isMetaLoading: false,
  /** Loading state for preselecting agent in auto mode */
  isAgentPreselecting: false,

  // ========================================
  // STATE SETTERS
  // ========================================
  /** Sets messages array (supports function for updates) */
  setMessages: messages =>
    set(state => ({
      messages: typeof messages === 'function' ? messages(state.messages) : messages,
    })),
  /** Sets current conversation ID */
  setConversationId: conversationId => set({ conversationId }),
  /** Sets current conversation title */
  setConversationTitle: conversationTitle => set({ conversationTitle }),
  /** Sets loading state */
  setIsLoading: isLoading => set({ isLoading }),
  /** Sets meta loading state */
  setIsMetaLoading: isMetaLoading => set({ isMetaLoading }),
  /** Sets agent preselecting loading state */
  setIsAgentPreselecting: isAgentPreselecting => set({ isAgentPreselecting }),

  /** Resets conversation to initial state */
  resetConversation: () =>
    set({
      messages: [],
      conversationId: null,
      conversationTitle: '',
      isLoading: false,
      isMetaLoading: false,
      isAgentPreselecting: false,
    }),

  // ========================================
  // CORE CHAT OPERATIONS
  // ========================================

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
    attachments,
    toggles, // { search, thinking }
    settings, // passed from component to ensure freshness
    spaceInfo, // { selectedSpace, isManualSpaceSelection }
    selectedAgent = null, // Currently selected agent (optional)
    isAgentAutoMode = false, // Whether agent selection is in auto mode
    agents = [], // available agents list for resolving defaults
    editingInfo, // { index, targetId, partnerId } (optional)
    callbacks, // { onTitleAndSpaceGenerated, onSpaceResolved } (optional)
    spaces = [], // passed from component
    quoteContext = null, // { text, sourceContent, sourceRole }
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

    // Step 2: Construct User Message
    const { userMessage, payloadContent } = buildUserMessage(text, attachments, quoteContext)
    const userMessageForSend = { ...userMessage, content: payloadContent }

    // When quoting, the original answer has already been embedded into textWithPrefix,
    // so we don't need to resend it as separate context.
    const historyOverride = quoteContext ? [] : null

    // Step 3: Handle Editing & History
    const { newMessages, historyForSend } = handleEditingAndHistory(
      messages,
      editingInfo,
      userMessage,
      historyOverride,
    )
    set({ messages: newMessages })
    const historyLengthBeforeSend =
      editingInfo?.index !== undefined && editingInfo?.index !== null
        ? editingInfo.index
        : messages.length

    // Step 4: Preselect space/agent/title
    // - Space & Title: only on first turn (isFirstTurn = true)
    // - Agent: every message when isAgentAutoMode = true, otherwise uses selectedAgent
    let resolvedSpaceInfo = spaceInfo
    // Only use selectedAgent if user manually selected one (not auto mode)
    // In auto mode, let AI choose or fallback to space default/global default
    let resolvedAgent = isAgentAutoMode ? null : selectedAgent
    let preselectedTitle = null
    const isFirstTurn = historyLengthBeforeSend === 0
    // Only preselect space/title on first turn, never reload in existing conversations
    const shouldPreselectSpaceTitle =
      isFirstTurn && !spaceInfo?.isManualSpaceSelection && !spaceInfo?.selectedSpace && text.trim()
    const shouldPreselectTitleForManual =
      isFirstTurn && spaceInfo?.isManualSpaceSelection && spaceInfo?.selectedSpace
    // In auto mode, always preselect agent (including first turn)
    const shouldPreselectAgent = isAgentAutoMode && text.trim()

    // Preselect space & title with loading indicator (only on first turn)
    if (shouldPreselectSpaceTitle || shouldPreselectTitleForManual) {
      set({ isMetaLoading: true })
      try {
        if (shouldPreselectSpaceTitle) {
          const { title, space, agent } = await preselectTitleSpaceAndAgentForAuto(
            text,
            settings,
            spaces,
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
            set({ conversationTitle: title })
          }

          // Fallback: if AI didn't return an agent but returned a space, use space's default agent
          if (!agent && space) {
            try {
              const { data: spaceAgentData } = await listSpaceAgents(space.id)
              const primaryAgentId = spaceAgentData?.find(item => item.is_primary)?.agent_id || null
              if (primaryAgentId) {
                const matchedAgent = (agents || []).find(
                  agent => String(agent.id) === String(primaryAgentId),
                )
                if (matchedAgent) {
                  resolvedAgent = matchedAgent
                  callbacks?.onAgentResolved?.(matchedAgent)
                }
              }
            } catch (error) {
              console.error('Failed to get space default agent:', error)
            }
          }

          // Final fallback: if still no agent and no space was selected, use global default agent
          if (!resolvedAgent && !space) {
            const globalDefaultAgent = agents?.find(agent => agent.isDefault)
            if (globalDefaultAgent) {
              resolvedAgent = globalDefaultAgent
              callbacks?.onAgentResolved?.(globalDefaultAgent)
            }
          }
        } else if (shouldPreselectTitleForManual) {
          const title = await preselectTitleForManual(text, settings, selectedAgent)
          if (title) {
            preselectedTitle = title
            set({ conversationTitle: title })
          }

          // For manual space selection, if no agent is selected yet, use space's default agent
          const currentSpace = spaceInfo?.selectedSpace
          if (!resolvedAgent && currentSpace) {
            try {
              const { data: spaceAgentData } = await listSpaceAgents(currentSpace.id)
              const primaryAgentId = spaceAgentData?.find(item => item.is_primary)?.agent_id || null
              if (primaryAgentId) {
                const matchedAgent = (agents || []).find(
                  agent => String(agent.id) === String(primaryAgentId),
                )
                if (matchedAgent) {
                  resolvedAgent = matchedAgent
                  callbacks?.onAgentResolved?.(matchedAgent)
                }
              }
            } catch (error) {
              console.error('Failed to get space default agent:', error)
            }
          }

          // Final fallback: if still no agent, use global default agent
          if (!resolvedAgent) {
            const globalDefaultAgent = agents?.find(agent => agent.isDefault)
            if (globalDefaultAgent) {
              resolvedAgent = globalDefaultAgent
              callbacks?.onAgentResolved?.(globalDefaultAgent)
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

          const modelConfig = getModelConfigForAgent(selectedAgent, settings, 'generateTitleAndSpace')
          const provider = getProvider(modelConfig.provider)
          const credentials = provider.getCredentials(settings)
          const languageInstruction = getLanguageInstruction(selectedAgent)
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
                const agentNameForMatch = typeof agentCandidate === 'string' ? agentCandidate : agentCandidate?.name
                const matchedAgent = (agents || []).find(a => String(a.name) === String(agentNameForMatch))
                if (matchedAgent) {
                  resolvedAgent = matchedAgent
                  agentPreselected = true
                  callbacks?.onAgentResolved?.(matchedAgent)
                }
              }
            }
          }
        }

        // Fallback: if AI didn't return an agent, use space's default agent or global default agent
        if (!agentPreselected && !resolvedAgent) {
          if (currentSpaceForAgent) {
            // Try to use the space's default agent (is_primary)
            try {
              const { data: spaceAgentData } = await listSpaceAgents(currentSpaceForAgent.id)
              const primaryAgentId = spaceAgentData?.find(item => item.is_primary)?.agent_id || null
              if (primaryAgentId) {
                const matchedAgent = (agents || []).find(
                  agent => String(agent.id) === String(primaryAgentId),
                )
                if (matchedAgent) {
                  resolvedAgent = matchedAgent
                  callbacks?.onAgentResolved?.(matchedAgent)
                }
              }
            } catch (error) {
              console.error('Failed to get space default agent:', error)
            }
          }

          // If still no agent and no space, use global default agent as final fallback
          if (!resolvedAgent && !currentSpaceForAgent) {
            const globalDefaultAgent = agents?.find(agent => agent.isDefault)
            if (globalDefaultAgent) {
              resolvedAgent = globalDefaultAgent
              callbacks?.onAgentResolved?.(globalDefaultAgent)
            }
          }
        }
      } catch (error) {
        console.error('Agent preselection failed:', error)
      } finally {
        set({ isAgentPreselecting: false })
      }
    }

    // Step 5: Final fallback for agent (defensive)
    // This should rarely be needed since we've already handled fallback in previous steps,
    // but it serves as a safety net for edge cases.
    if (
      !spaceInfo?.isManualSpaceSelection &&
      !resolvedAgent &&
      resolvedSpaceInfo?.selectedSpace?.id
    ) {
      try {
        const { data } = await listSpaceAgents(resolvedSpaceInfo.selectedSpace.id)
        const primaryAgentId = data?.find(item => item.is_primary)?.agent_id || null
        if (primaryAgentId) {
          const matchedAgent = (agents || []).find(
            agent => String(agent.id) === String(primaryAgentId),
          )
          if (matchedAgent) {
            resolvedAgent = matchedAgent
            callbacks?.onAgentResolved?.(matchedAgent)
          }
        }
      } catch (error) {
        console.error('Failed to resolve default agent:', error)
      }
    }

    // Step 6: Ensure Conversation Exists
    let convInfo
    try {
      convInfo = await ensureConversationExists(
        conversationId,
        settings,
        toggles,
        resolvedSpaceInfo,
        set,
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
          space_id: resolvedSpaceInfo?.selectedSpace?.id || null,
          api_provider: settings.apiProvider,
        },
      )
    }

    // Step 6: Persist User Message
    if (convId) {
      await persistUserMessage(convId, editingInfo, userMessage.content, set)
    }

    // Step 7: Prepare AI Placeholder
    const { conversationMessages, aiMessagePlaceholder } = prepareAIPlaceholder(
      historyForSend,
      userMessageForSend,
      resolvedSpaceInfo,
      resolvedAgent,
      settings,
      set,
      toggles,
    )

    // Step 8: Call API & Stream
    await callAIAPI(
      conversationMessages,
      aiMessagePlaceholder,
      settings,
      toggles,
      callbacks,
      spaces,
      resolvedSpaceInfo,
      resolvedAgent,
      agents,
      preselectedTitle,
      get,
      set,
      historyLengthBeforeSend,
      text,
      isAgentAutoMode,
    )
  },
}))

export default useChatStore
