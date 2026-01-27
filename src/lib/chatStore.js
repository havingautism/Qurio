import { create } from 'zustand'
import {
  addConversationEvent,
  addMessage,
  createConversation,
  notifyConversationsChanged,
  updateConversation,
  updateMessageById,
} from '../lib/conversationsService'
import { getProvider, resolveThinkingToggleRule } from '../lib/providers'
import { getUserTools } from '../lib/userToolsService'
import { deleteMessageById } from '../lib/supabase'
import { buildResponseStylePromptFromAgent } from './settings'
import { listSpaceAgents } from './spacesService'
import { fetchDocumentChunkContext } from './documentRetrievalService'
import { formatDocumentAppendText } from './documentContextUtils'
import {
  formatMemorySummariesAppendText,
  getMemoryDomains,
  upsertMemoryDomainSummary,
} from './longTermMemoryService'

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
const buildUserMessage = (text, attachments, quoteContext, documentContextAppend = '') => {
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
  const textWithDocumentContext = documentContextAppend
    ? `${textWithPrefix}\n\n${documentContextAppend}`
    : textWithPrefix
  const payloadContent =
    attachments.length > 0
      ? buildContentArray(textWithDocumentContext, false)
      : textWithDocumentContext

  const userMessage = { role: 'user', content: displayContent, created_at: now }

  return { userMessage, payloadContent }
}

const DOCUMENT_RETRIEVAL_CHUNK_LIMIT = 250
const DOCUMENT_RETRIEVAL_TOP_CHUNKS = 5
const QUERY_CONTEXT_MAX_CHARS = 1200
const QUERY_HISTORY_MAX_MESSAGES = 6
const MEMORY_DOMAIN_PROMPT_LIMIT = 20

const extractJsonObject = content => {
  const str = String(content || '').trim()
  const start = str.indexOf('{')
  const end = str.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    return str.substring(start, end + 1)
  }
  return ''
}

const safeJsonParse = str => {
  let cleaned = String(str || '').trim()
  if (!cleaned) return null

  try {
    return JSON.parse(cleaned)
  } catch (e) {
    // If it fails, it might be using single quotes (common in some Lite models)
    try {
      // Heuristic: swap single quotes with double quotes
      // and handle common issues like trailing commas
      // Note: This is a simple heuristic and might fail on nested content with single quotes
      const normalized = cleaned
        .replace(/'/g, '"')
        .replace(/,\s*([\]}])/g, '$1') // remove trailing commas
        .replace(/True/g, 'true')
        .replace(/False/g, 'false')
        .replace(/None/g, 'null')
      return JSON.parse(normalized)
    } catch (e2) {
      console.warn('[Chat] Final JSON parse attempt failed:', e2)
      return null
    }
  }
}

const extractPlainText = content => {
  if (!content) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part
        if (part?.type === 'text' && part.text) return part.text
        if (part?.text) return part.text
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (content?.text) return String(content.text)
  return String(content)
}

const buildDocumentQueryPrompt = ({ question, historyForSend, documents }) => {
  const docTitles = (documents || [])
    .map(doc => (typeof doc?.name === 'string' ? doc.name.trim() : ''))
    .filter(Boolean)
  const recentHistory = (historyForSend || [])
    .slice(-QUERY_HISTORY_MAX_MESSAGES)
    .map(msg => {
      const role = msg.role === 'ai' ? 'assistant' : msg.role
      const text = extractPlainText(msg.content)
      return `${role}: ${text}`.trim()
    })
    .filter(Boolean)
    .join('\n')
    .slice(0, QUERY_CONTEXT_MAX_CHARS)

  const docSection = docTitles.length ? `Selected documents:\n- ${docTitles.join('\n- ')}` : ''
  const historySection = recentHistory ? `Recent conversation:\n${recentHistory}` : ''

  return [
    `You generate a single concise vector search query for document retrieval.`,
    `Use the same language as the user's question.`,
    `If no document retrieval is needed, return an empty string for "query".`,
    `Return JSON only: {"query": string}.`,
    '',
    `User question:\n${question}`,
    historySection,
    docSection,
  ]
    .filter(Boolean)
    .join('\n\n')
}

const parseDocumentQueryResponse = content => {
  const raw = extractJsonObject(content)
  if (!raw) return content.replace(/^"+|"+$/g, '').trim()
  const parsed = safeJsonParse(raw)
  if (!parsed) return content.replace(/^"+|"+$/g, '').trim()

  try {
    if (typeof parsed?.query === 'string') return parsed.query.trim()
    if (Array.isArray(parsed?.queries)) return parsed.queries.filter(Boolean).join(' ')
  } catch {
    return content.replace(/^"+|"+$/g, '').trim()
  }
  return content.replace(/^"+|"+$/g, '').trim()
}

const formatMemoryDomainIndex = domains => {
  if (!Array.isArray(domains) || domains.length === 0) return ''
  // Deduplicate and aggregate aliases for clearer prompt presentation
  const lines = domains.slice(0, MEMORY_DOMAIN_PROMPT_LIMIT).map(domain => {
    const key = String(domain?.domain_key || '').trim()
    if (!key) return null
    const aliases = Array.isArray(domain?.aliases) ? domain.aliases.filter(Boolean) : []
    // Ensure key is treated as an alias too for matching purposes
    const allTags = [...new Set([key, ...aliases])].join(', ')
    const scope = typeof domain?.scope === 'string' ? domain.scope.trim() : ''
    return `ID: ${key} | Tags: [${allTags}] | Scope: ${scope}`
  })
  return lines.filter(Boolean).join('\n')
}

const buildMemoryDomainDecisionPrompt = ({ question, historyForSend, domains }) => {
  const recentHistory = (historyForSend || [])
    .slice(-QUERY_HISTORY_MAX_MESSAGES)
    .map(msg => {
      const role = msg.role === 'ai' ? 'assistant' : msg.role
      const text = extractPlainText(msg.content)
      return `${role}: ${text}`.trim()
    })
    .filter(Boolean)
    .join('\n')
    .slice(0, QUERY_CONTEXT_MAX_CHARS)

  const domainIndex = formatMemoryDomainIndex(domains)

  return [
    `Role: You are a semantic tag matcher.`,
    `Task: Analyze the User Question and determine if it relates to any of the available Memory IDs based on their Tags and Scope.`,
    `Reflect: Does the user's input imply a need to retrieve context about these specific topics?`,
    `Return JSON only: {"need_memory": boolean, "hit_domains": string[]}`,
    `- need_memory: true if ANY tag matches semantically.`,
    `- hit_domains: list of matched IDs (exact string match from list).`,
    '',
    `Available Memory IDs & Tags:\n${domainIndex}`,
    '',
    `User Question:\n${question}`,
    recentHistory ? `Recent Conversation:\n${recentHistory}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

const parseMemoryDomainDecisionResponse = content => {
  const raw = extractJsonObject(content)
  if (!raw) return { needMemory: false, hitDomains: [] }
  const parsed = safeJsonParse(raw)
  if (!parsed) return { needMemory: false, hitDomains: [] }

  try {
    const needMemory = Boolean(parsed?.need_memory ?? parsed?.needMemory)
    const hitDomainsRaw = Array.isArray(parsed?.hit_domains ?? parsed?.hitDomains)
      ? (parsed.hit_domains ?? parsed.hitDomains)
      : []
    const hitDomains = hitDomainsRaw.map(item => String(item || '').trim()).filter(Boolean)
    return { needMemory, hitDomains }
  } catch {
    return { needMemory: false, hitDomains: [] }
  }
}

const fallbackMemoryDecision = (question, domains) => {
  const trimmedQuestion = String(question || '').toLowerCase()
  if (!Array.isArray(domains) || domains.length === 0) {
    return { needMemory: false, hitDomains: [] }
  }
  const usePersonalContext = /(\bmy\b|\bmine\b|\bme\b|\bwe\b|\bi\b|我的|我们|我在|我想)/i.test(
    trimmedQuestion,
  )
  if (!usePersonalContext) {
    return { needMemory: false, hitDomains: [] }
  }

  const matched = domains
    .filter(domain => {
      const key = String(domain?.domain_key || '').toLowerCase()
      const aliases = Array.isArray(domain?.aliases)
        ? domain.aliases.map(item => String(item || '').toLowerCase())
        : []
      const tokens = [key, ...aliases].filter(Boolean)
      return tokens.some(token => token && trimmedQuestion.includes(token))
    })
    .map(domain => String(domain.domain_key || '').trim())
    .filter(Boolean)

  if (matched.length > 0) {
    return { needMemory: true, hitDomains: matched }
  }

  return {
    needMemory: false,
    hitDomains: [],
  }
}

const selectMemoryDomains = async ({
  question,
  historyForSend,
  domains,
  settings,
  selectedAgent,
  agents,
}) => {
  const fallbackAgent = agents?.find(agent => agent.isDefault)
  const agentForQuery = selectedAgent || fallbackAgent
  const modelConfig = getModelConfigForAgent(
    agentForQuery,
    settings,
    'generateMemoryQuery',
    fallbackAgent,
  )
  if (!modelConfig?.model || !modelConfig?.provider) {
    return fallbackMemoryDecision(question, domains)
  }
  const provider = getProvider(modelConfig.provider)
  if (!provider?.streamChatCompletion) {
    return fallbackMemoryDecision(question, domains)
  }
  const credentials = provider.getCredentials(settings)
  if (!credentials?.apiKey) {
    return fallbackMemoryDecision(question, domains)
  }

  const prompt = buildMemoryDomainDecisionPrompt({ question, historyForSend, domains })
  const messages = [
    {
      role: 'system',
      content:
        'You are a precise JSON extractor. Output ONLY valid JSON with DOUBLE QUOTES. Keys: need_memory (boolean), hit_domains (string[]).',
    },
    { role: 'user', content: prompt },
  ]

  let fullContent = ''
  try {
    await provider.streamChatCompletion({
      ...credentials,
      model: modelConfig.model,
      messages,
      temperature: 0.2,
      responseFormat: modelConfig.provider !== 'gemini' ? { type: 'json_object' } : undefined,
      onChunk: chunk => {
        if (typeof chunk === 'object' && chunk?.type === 'text' && chunk.content) {
          fullContent += chunk.content
        } else if (typeof chunk === 'string') {
          fullContent += chunk
        }
      },
      onFinish: result => {
        if (result?.content) fullContent = result.content
      },
    })
  } catch (error) {
    console.error('Lite model memory decision failed:', error)
    return fallbackMemoryDecision(question, domains)
  }

  return parseMemoryDomainDecisionResponse(fullContent)
}

const normalizeDomainKey = value =>
  String(value || '')
    .trim()
    .toLowerCase()

const resolveMemoryDomain = (domains, domainKey) => {
  const normalizedKey = normalizeDomainKey(domainKey)
  if (!normalizedKey) return null
  const directMatch = domains.find(
    domain => normalizeDomainKey(domain?.domain_key) === normalizedKey,
  )
  if (directMatch) return directMatch
  return domains.find(domain => {
    const aliases = Array.isArray(domain?.aliases) ? domain.aliases : []
    return aliases.some(alias => normalizeDomainKey(alias) === normalizedKey)
  })
}

const selectMemoryDomainsByKeys = (domains, keys, maxCount) => {
  const limit = Math.max(1, Number(maxCount) || 1)
  const selected = []
  const seen = new Set()
  const normalizedKeys = Array.isArray(keys) ? keys : []

  normalizedKeys.forEach(key => {
    const domain = resolveMemoryDomain(domains, key)
    if (!domain) return
    const canonical = normalizeDomainKey(domain.domain_key)
    if (!canonical || seen.has(canonical)) return
    selected.push(domain)
    seen.add(canonical)
  })

  if (selected.length >= limit) return selected.slice(0, limit)

  return selected
}

const selectDocumentQuery = async ({
  question,
  historyForSend,
  documents,
  settings,
  selectedAgent,
  agents,
}) => {
  const fallbackAgent = agents?.find(agent => agent.isDefault)
  const agentForQuery = selectedAgent || fallbackAgent
  const modelConfig = getModelConfigForAgent(
    agentForQuery,
    settings,
    'generateDocumentQuery',
    fallbackAgent,
  )
  if (!modelConfig?.model || !modelConfig?.provider) {
    return String(question || '').trim()
  }
  const provider = getProvider(modelConfig.provider)
  if (!provider?.streamChatCompletion) {
    return String(question || '').trim()
  }
  const credentials = provider.getCredentials(settings)
  if (!credentials?.apiKey) {
    return String(question || '').trim()
  }

  const prompt = buildDocumentQueryPrompt({ question, historyForSend, documents })
  const messages = [
    {
      role: 'system',
      content:
        'You are a retrieval query planner. Output only JSON with a "query" string. No markdown.',
    },
    { role: 'user', content: prompt },
  ]

  let fullContent = ''
  try {
    await provider.streamChatCompletion({
      ...credentials,
      model: modelConfig.model,
      messages,
      temperature: 0.2,
      responseFormat: modelConfig.provider !== 'gemini' ? { type: 'json_object' } : undefined,
      onChunk: chunk => {
        if (typeof chunk === 'object' && chunk?.type === 'text' && chunk.content) {
          fullContent += chunk.content
        } else if (typeof chunk === 'string') {
          fullContent += chunk
        }
      },
      onFinish: result => {
        if (result?.content) fullContent = result.content
      },
    })
  } catch (error) {
    console.error('Lite model document query selection failed:', error)
    return String(question || '').trim()
  }

  const resolved = parseDocumentQueryResponse(fullContent)
  return resolved || String(question || '').trim()
}

const buildConversationMessages = (historyForSend, userMessageForSend, selectedAgent, settings) => {
  const resolvedPrompt = buildAgentPrompt(selectedAgent, settings)
  const conversationMessagesBase = [
    ...(resolvedPrompt ? [{ role: 'system', content: resolvedPrompt }] : []),
    ...historyForSend,
  ]
  return [...conversationMessagesBase, userMessageForSend]
}

const appendAIPlaceholder = (selectedAgent, toggles, documentSources, set) => {
  const normalizedSearchBackends = Array.isArray(toggles?.searchBackends)
    ? toggles.searchBackends.map(item => String(item)).filter(Boolean)
    : typeof toggles?.searchBackend === 'string'
      ? [toggles.searchBackend]
      : []
  const aiMessagePlaceholder = {
    role: 'ai',
    content: '',
    created_at: new Date().toISOString(),
    thinkingEnabled: !!(toggles?.thinking || toggles?.deepResearch),
    deepResearch: !!toggles?.deepResearch,
    researchPlan: '',
    researchPlanLoading: !!toggles?.deepResearch,
    agentId: selectedAgent?.id || null,
    agentName: selectedAgent?.name || null,
    agentEmoji: selectedAgent?.emoji || '',
    agentIsDefault: !!selectedAgent?.isDefault,
    documentSources: documentSources || [],
    searchBackend: normalizedSearchBackends[0] || null,
    searchBackends: normalizedSearchBackends,
  }

  set(state => ({ messages: [...state.messages, aiMessagePlaceholder] }))
  return aiMessagePlaceholder
}

/**
 * Normalizes message content to be safe for provider payloads (strips custom types like quote)
 * while preserving attachments and text.
 */
const normalizeMessageForSend = message => {
  if (!message) return message
  const content = message.content
  const sanitizedMessage = { ...message }
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

    sanitizedMessage.content = normalizedContent
  } else {
    sanitizedMessage.content = content
  }

  // Avoid sending tool call history to providers that require paired tool responses.
  if (sanitizedMessage.role === 'ai' || sanitizedMessage.role === 'assistant') {
    delete sanitizedMessage.tool_calls
    delete sanitizedMessage.tool_call_id
  }

  return sanitizedMessage
}

const sanitizeJson = value => {
  if (value === undefined) return null
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (error) {
    if (typeof value === 'string') return value
    try {
      return String(value)
    } catch (stringError) {
      return null
    }
  }
}

const mapInterfaceLanguageToAnswerLanguage = language => {
  const normalized = String(language || '').toLowerCase()
  if (!normalized) return ''
  if (normalized.startsWith('zh')) return 'Chinese (Simplified)'
  if (normalized.startsWith('en')) return 'English'
  if (normalized.startsWith('ja')) return 'Japanese'
  if (normalized.startsWith('ko')) return 'Korean'
  if (normalized.startsWith('es')) return 'Spanish'
  if (normalized.startsWith('fr')) return 'French'
  if (normalized.startsWith('de')) return 'German'
  if (normalized.startsWith('pt')) return 'Portuguese'
  if (normalized.startsWith('it')) return 'Italian'
  return ''
}

const getLanguageInstruction = (agent, settings) => {
  if (settings?.followInterfaceLanguage) {
    const mapped = mapInterfaceLanguageToAnswerLanguage(settings.interfaceLanguage)
    return mapped ? `Reply in ${mapped}.` : ''
  }
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
  const allowedNames = new Set((spaceEntry?.agents || []).map(agent => agent.name).filter(Boolean))
  if (!allowedNames.has(normalizedName)) return null
  const lowerName = normalizedName.toLowerCase()
  return (agents || []).find(agent => (agent.name || '').trim().toLowerCase() === lowerName) || null
}

const getSpaceDefaultAgent = async (space, agents) => {
  if (!space?.id) return null
  try {
    const { data } = await listSpaceAgents(space.id)
    const primaryAgentId = data?.find(item => item.is_primary)?.agent_id || null
    if (!primaryAgentId) return null
    return (agents || []).find(agent => String(agent.id) === String(primaryAgentId)) || null
  } catch (error) {
    console.error('Failed to get space default agent:', error)
    return null
  }
}

const resolveFallbackAgent = async (space, agents) => {
  const spaceDefault = await getSpaceDefaultAgent(space, agents)
  if (spaceDefault) return spaceDefault
  return (agents || []).find(agent => agent.isDefault) || null
}

/**
 * Builds system prompt from Agent configuration
 * Combines agent prompt with personalization settings
 * @param {Object} agent - Agent object with prompt and personalization settings
 * @param {Object} settings - Global settings for fallback
 * @returns {string|null} Combined system prompt or null
 */
const buildAgentPrompt = (agent, settings) => {
  if (!agent) return null

  const parts = []

  // 1. Agent's base prompt
  const agentPrompt = typeof agent.prompt === 'string' ? agent.prompt.trim() : ''
  if (agentPrompt) {
    parts.push(`## Agent Prompt\n${agentPrompt}`)
  }

  // 2. Personalization settings (agent only)
  const stylePrompt = buildResponseStylePromptFromAgent(agent)
  if (stylePrompt) {
    parts.push(stylePrompt)
  }

  // 3. Language instruction (agent only)
  const languageInstruction = getLanguageInstruction(agent, settings)
  if (languageInstruction) parts.push(`## Language\n${languageInstruction}`)

  return parts.length > 0 ? parts.join('\n\n') : null
}

/**
 * Gets model configuration for a given agent
 * Falls back to system default agent, then global settings if needed
 * @param {Object} agent - Agent object with model settings
 * @param {Object} settings - Global settings for fallback
 * @param {string} task - Task type (streamChatCompletion, generateTitle, etc.)
 * @param {Object} fallbackAgent - System default agent for fallback
 * @returns {Object} Model configuration { provider, model }
 */
const getModelConfigForAgent = (agent, settings, task = 'streamChatCompletion', fallbackAgent) => {
  const resolveFromAgent = candidate => {
    if (!candidate) return null

    const defaultModel = candidate.default_model ?? candidate.defaultModel
    const liteModel = candidate.lite_model ?? candidate.liteModel
    const defaultModelProvider =
      candidate.default_model_provider ?? candidate.defaultModelProvider ?? ''
    const liteModelProvider = candidate.lite_model_provider ?? candidate.liteModelProvider ?? ''
    const hasDefault = typeof defaultModel === 'string' && defaultModel.trim() !== ''
    const hasLite = typeof liteModel === 'string' && liteModel.trim() !== ''

    if (!hasDefault && !hasLite) return null

    const isLiteTask =
      task === 'generateTitle' ||
      task === 'generateTitleAndSpace' ||
      task === 'generateRelatedQuestions' ||
      task === 'generateResearchPlan' ||
      task === 'generateDocumentQuery' ||
      task === 'generateMemoryQuery'

    const model = isLiteTask ? liteModel || defaultModel : defaultModel || liteModel
    const provider = isLiteTask
      ? liteModelProvider || defaultModelProvider || candidate.provider
      : defaultModelProvider || liteModelProvider || candidate.provider

    if (!model || !provider) return null
    return { provider, model }
  }

  const primary = resolveFromAgent(agent)
  if (primary) return primary

  const fallback = resolveFromAgent(fallbackAgent)
  if (fallback) return fallback

  return {
    provider: fallbackAgent?.provider || '',
    model: '',
  }
}

const resolveProviderConfigWithCredentials = (agent, settings, task, fallbackAgent) => {
  const primaryConfig = getModelConfigForAgent(agent, settings, task, fallbackAgent)
  const primaryProvider = getProvider(primaryConfig.provider)
  const primaryCredentials = primaryProvider.getCredentials(settings)

  if (primaryCredentials?.apiKey) {
    return {
      modelConfig: primaryConfig,
      provider: primaryProvider,
      credentials: primaryCredentials,
    }
  }

  const fallbackConfig = getModelConfigForAgent(
    agent,
    settings,
    'streamChatCompletion',
    fallbackAgent,
  )
  const fallbackProvider = getProvider(fallbackConfig.provider)
  const fallbackCredentials = fallbackProvider.getCredentials(settings)

  return {
    modelConfig: fallbackConfig,
    provider: fallbackProvider,
    credentials: fallbackCredentials,
  }
}

const applyLanguageInstructionToText = (text, instruction) => {
  if (!instruction) return text
  const baseText = typeof text === 'string' ? text.trim() : ''
  return baseText ? `${baseText}\n\n${instruction}` : instruction
}

const generateDeepResearchPlan = async (
  userMessage,
  settings,
  selectedAgent,
  agents,
  fallbackAgent,
  callbacks = {},
  researchType = 'general', // Add researchType parameter
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
        researchType, // Pass researchType to streaming provider
      },
    )
    return streamContent
  }

  const content = await provider.generateResearchPlan(
    userMessage,
    credentials.apiKey,
    credentials.baseUrl,
    modelConfig.model,
    researchType, // Pass researchType to provider
  )
  callbacks.onChunk?.(content)
  callbacks.onFinish?.(content)
  return content
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
    const partnerIds = new Set(
      Array.isArray(editingInfo.partnerIds) ? editingInfo.partnerIds.filter(Boolean) : [],
    )
    // Remove the edited user message and any specified partner messages by id
    const filtered = messages.filter((msg, idx) => {
      if (idx === editingInfo.index) return false
      if (partnerIds.has(msg.id)) return false
      // Also drop immediate partnerId if provided separately
      if (editingInfo.partnerId && msg.id === editingInfo.partnerId) return false
      return true
    })

    // Reinsert the new user message
    // Default to moveToEnd: true so that edited messages jump to the bottom
    // unless explicitly told not to (though currently we always want this behavior)
    const shouldMoveToEnd = editingInfo.moveToEnd !== false

    if (shouldMoveToEnd) {
      newMessages = [...filtered, userMessage]
    } else {
      newMessages = [
        ...filtered.slice(0, editingInfo.index),
        userMessage,
        ...filtered.slice(editingInfo.index),
      ]
    }
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
 * @returns {Promise<{ title: string, space: Object|null, agent: Object|null, emojis: string[] }>}
 */
const preselectTitleSpaceAndAgentForAuto = async (
  firstMessage,
  settings,
  spaces,
  agents,
  selectedAgent = null,
) => {
  // Use selected agent if available, otherwise use global default agent for preselection
  // Global default agent always exists (cannot be deleted)
  const fallbackAgent = agents?.find(agent => agent.isDefault)
  const agentForPreselection = selectedAgent || fallbackAgent
  const { modelConfig, provider, credentials } = resolveProviderConfigWithCredentials(
    agentForPreselection,
    settings,
    'generateTitleAndSpace',
    fallbackAgent,
  )
  const languageInstruction = getLanguageInstruction(agentForPreselection, settings)
  const promptText = applyLanguageInstructionToText(firstMessage, languageInstruction)
  const spaceAgents = await buildSpaceAgentOptions(spaces, agents)
  if (spaceAgents.length && provider.generateTitleSpaceAndAgent) {
    const { title, spaceLabel, agentName, emojis } = await provider.generateTitleSpaceAndAgent(
      promptText,
      spaceAgents,
      credentials.apiKey,
      credentials.baseUrl,
      modelConfig.model,
    )
    const normalizedSpaceLabel =
      typeof spaceLabel === 'string' ? spaceLabel.split(' - ')[0].trim() : spaceLabel
    const selectedSpace = (spaces || []).find(s => s.label === normalizedSpaceLabel) || null
    const agentCandidate =
      selectedSpace && agentName
        ? resolveAgentForSpace(agentName, selectedSpace, spaceAgents, agents)
        : null
    return { title, space: selectedSpace, agent: agentCandidate, emojis: emojis || [] }
  }

  const { title, space, emojis } = await provider.generateTitleAndSpace(
    promptText,
    spaces || [],
    credentials.apiKey,
    credentials.baseUrl,
    modelConfig.model,
  )
  return { title, space: space || null, agent: null, emojis: emojis || [] }
}

/**
 * Preselects a title for manual space before the first request.
 * @param {string} firstMessage - Raw user text
 * @param {Object} settings - User settings and API configuration
 * @param {Object} selectedAgent - Currently selected agent (optional)
 * @returns {Promise<{title: string, emojis: string[]}>}
 */
const preselectTitleForManual = async (
  firstMessage,
  settings,
  selectedAgent = null,
  agents = [],
) => {
  // Use selected agent if available, otherwise use global default agent for title generation
  // Global default agent always exists (cannot be deleted)
  const fallbackAgent = agents?.find(agent => agent.isDefault)
  const agentForTitle = selectedAgent || fallbackAgent
  const { modelConfig, provider, credentials } = resolveProviderConfigWithCredentials(
    agentForTitle,
    settings,
    'generateTitle',
    fallbackAgent,
  )
  const languageInstruction = getLanguageInstruction(agentForTitle, settings)
  const promptText = applyLanguageInstructionToText(firstMessage, languageInstruction)
  const result = await provider.generateTitle(
    promptText,
    credentials.apiKey,
    credentials.baseUrl,
    modelConfig.model,
  )
  return {
    title: result?.title || 'New Conversation',
    emojis: Array.isArray(result?.emojis) ? result.emojis : [],
  }
}

const normalizeDeepResearchTitle = (title, settings) => {
  const raw = typeof title === 'string' ? title.trim() : ''
  const cleaned = raw.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim()
  const languageHint = String(settings?.llmAnswerLanguage || '').toLowerCase()
  const isChinese =
    settings?.interfaceLanguage === 'zh' ||
    languageHint.includes('chinese') ||
    languageHint.includes('中文') ||
    /[\u4e00-\u9fff]/.test(cleaned)

  if (!cleaned) {
    return isChinese ? '深入研究报告' : 'Deep Research Report'
  }

  if (isChinese) {
    return cleaned.endsWith('报告') ? cleaned : `${cleaned}报告`
  }

  return /report$/i.test(cleaned) ? cleaned : `${cleaned} Report`
}

const preselectTitleForDeepResearch = async (
  firstMessage,
  settings,
  selectedAgent = null,
  agents = [],
) => {
  const fallbackAgent = agents?.find(agent => agent.isDefault)
  const agentForTitle = selectedAgent || fallbackAgent
  const { modelConfig, provider, credentials } = resolveProviderConfigWithCredentials(
    agentForTitle,
    settings,
    'generateTitle',
    fallbackAgent,
  )
  const languageInstruction = getLanguageInstruction(agentForTitle, settings)
  const promptText = applyLanguageInstructionToText(firstMessage, languageInstruction)
  const result = await provider.generateTitle(
    promptText,
    credentials.apiKey,
    credentials.baseUrl,
    modelConfig.model,
  )
  return {
    title: normalizeDeepResearchTitle(result?.title || '', settings),
    emojis: Array.isArray(result?.emojis) ? result.emojis : [],
  }
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
const ensureConversationExists = async (
  conversationId,
  settings,
  toggles,
  spaceInfo,
  set,
  providerOverride,
  selectedAgent,
) => {
  // If conversation already exists, return it
  if (conversationId) {
    return { id: conversationId, data: null, isNew: false }
  }

  // Create new conversation payload
  const creationPayload = {
    space_id: spaceInfo.selectedSpace ? spaceInfo.selectedSpace.id : null,
    title: 'New Conversation',
    api_provider: providerOverride || '',
    agent_selection_mode: toggles?.deepResearch ? 'manual' : 'auto',
    last_agent_id: toggles?.deepResearch ? selectedAgent?.id || null : null,
  }

  const { data, error } = await createConversation(creationPayload)
  if (!error && data) {
    // Update store with new conversation ID
    set({ conversationId: data.id })
    // Notify other components that conversations list changed
    notifyConversationsChanged()
    if (toggles?.deepResearch) {
      addConversationEvent(data.id, 'deep_research', { enabled: true }).catch(err =>
        console.error('Failed to record deep research event:', err),
      )
    }
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
    content: sanitizeJson(content),
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
 * @param {Array} preselectedEmojis - Preselected emojis for the title (optional)
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
  preselectedEmojis,
  get,
  set,
  historyLengthBeforeSend,
  firstUserText,
  documentSources = [],
  isAgentAutoMode = false,
  researchType = 'general', // Add researchType parameter
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
          researchType, // Pass researchType to plan generation
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
        // resolvedToolIds contains strings (custom) and maybe numbers (system)
        // Ensure comparison is robust
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
      userTools: activeUserTools, // Pass selected user tools to provider
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
      messages: conversationMessagesWithPlan.map(m => ({
        role: m.role === 'ai' ? 'assistant' : m.role,
        content: m.content,
        ...(m.tool_calls && { tool_calls: m.tool_calls }),
        ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
        ...(m.name && { name: m.name }),
      })),
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
          // Fallback for string chunks
          pendingText += chunk
        }

        queueFlush()
      },
      onFinish: async result => {
        // Handle streaming completion and finalization
        const { abortController } = get()
        if (abortController === controller) {
          set({ abortController: null })
        }

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
          preselectedEmojis,
          toggles,
          documentSources,
          selectedAgent,
          agents,
          isAgentAutoMode,
        )
      },
      onError: err => {
        // Handle streaming errors
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
        researchType, // Pass researchType to deep research execution
        concurrentExecution: toggles?.concurrentResearch || false, // Pass concurrent execution flag
      })
      // Debug: Log toggles
      console.log(
        '[ChatStore] toggles.concurrentResearch:',
        toggles?.concurrentResearch,
        '| Full toggles:',
        toggles,
      )
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
 * @param {Array} preselectedEmojis - Preselected emojis for the title (optional)
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
  preselectedEmojis,
  toggles = {},
  documentSources = [],
  selectedAgent = null,
  agents = [],
  isAgentAutoMode = false,
) => {
  // Ensure we always have an agent (use global default as last resort)
  // Global default agent always exists (cannot be deleted)
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

  // Get model configuration: Agent priority, system default agent fallback
  const modelConfig = getModelConfigForAgent(
    safeAgent,
    settings,
    'streamChatCompletion',
    fallbackAgent,
  )

  // Replace streamed placeholder with finalized content (e.g., with citations/grounding)
  set(state => {
    const updated = [...state.messages]
    const lastMsgIndex = updated.length - 1
    if (lastMsgIndex >= 0 && updated[lastMsgIndex].role === 'ai') {
      const lastMsg = { ...updated[lastMsgIndex] }
      const validToolCallHistory = Array.isArray(lastMsg.toolCallHistory)
        ? lastMsg.toolCallHistory
        : []

      if (typeof result?.content !== 'undefined') {
        // Check if existing content has a form (continuation scenario)
        const hasFormInExisting = validToolCallHistory.some(tc => tc.name === 'interactive_form')

        if (!hasFormInExisting) {
          // Normal case: replace with finalized content (may include citations/grounding)
          lastMsg.content = normalizeContent(result.content)
        }
        // If form continuation: skip update, streaming already appended correctly
      }
      const thoughtToApply = normalizedThought || lastMsg.thought || ''
      lastMsg.thought = thoughtToApply ? thoughtToApply : undefined
      const toolCallsToProcess = result?.toolCalls || validToolCallHistory

      if (toolCallsToProcess && toolCallsToProcess.length > 0) {
        lastMsg.tool_calls = toolCallsToProcess

        // Background memory updates if long-term memory is enabled
        if (settings.enableLongTermMemory) {
          console.log('[Memory] Checking for auto-updates in background...', {
            toolCalls: toolCallsToProcess.length,
          })
          toolCallsToProcess.forEach(tc => {
            const toolName = tc.name || tc.function?.name
            if (toolName === 'memory_update') {
              try {
                const args =
                  typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments
                if (args?.domain_key && args?.summary) {
                  console.log(`[Memory] Background auto-update triggered for: ${args.domain_key}`, {
                    domain: args.domain_key,
                    summary: args.summary,
                  })
                  // Fire and forget
                  upsertMemoryDomainSummary({
                    domainKey: args.domain_key,
                    summary: args.summary,
                    aliases: args.aliases || [],
                    scope: args.scope || '',
                    append: true,
                  })
                    .then(() => {
                      console.log(`[Memory] Background auto-update successful: ${args.domain_key}`)
                      getMemoryDomains() // Refresh cache
                    })
                    .catch(err => {
                      console.error(
                        `[Memory] Background auto-update failed: ${args.domain_key}`,
                        err,
                      )
                    })
                } else {
                  console.warn('[Memory] Skipping auto-update: Missing domain_key or summary', args)
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

  // Generate title and space if this is the first turn
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

  const firstMessageText = firstUserText ?? fallbackFirstUserText

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
        // Generate title only when space is manually selected
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
        // Use callback to generate both title and space
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
        // Generate both title and space automatically
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

  // Persist AI message in database before related questions
  if (currentStore.conversationId) {
    // Define latestAi in scope for reuse
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
      console.error('Failed to persist AI message:', insertAiError)
      const { data: retryAiRow, error: retryAiError } = await addMessage({
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
      if (retryAiError) {
        console.error('Failed to persist AI message (retry):', retryAiError)
      } else {
        insertedAi = retryAiRow || null
      }
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

  // Update conversation in database
  if (currentStore.conversationId) {
    try {
      if (isFirstTurn) {
        // First turn: update title, space, agent_selection_mode, and last_agent_id
        console.log('[chatStore] Updating conversation with emojis:', resolvedTitleEmojis)
        await updateConversation(currentStore.conversationId, {
          title: resolvedTitle,
          title_emojis: resolvedTitleEmojis,
          space_id: resolvedSpace ? resolvedSpace.id : null,
          api_provider: resolvedAgent?.provider || safeAgent?.provider || '',
          last_agent_id: safeAgent?.id || null,
          agent_selection_mode: isAgentAutoMode ? 'auto' : 'manual',
        })
        notifyConversationsChanged()

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
      } else if (safeAgent?.id) {
        // Subsequent turns: only update last_agent_id
        await updateConversation(currentStore.conversationId, {
          last_agent_id: safeAgent.id,
        })
      }
    } catch (error) {
      console.error('Failed to update conversation:', error)
    }
  }

  // Check if content is a form to pause flow
  const normalizedAiContent = normalizeContent(
    typeof result?.content !== 'undefined'
      ? result.content
      : (currentStore.messages?.[currentStore.messages.length - 1]?.content ?? ''),
  )
  const isInteractiveForm =
    result?.toolCalls?.some(tc => tc.name === 'interactive_form') ||
    (currentStore.messages?.[currentStore.messages.length - 1]?.toolCallHistory || []).some(
      tc => tc.name === 'interactive_form',
    )

  // Generate related questions (only if enabled and NOT a form)
  let related = []
  console.log(
    '[chatStore] Finalizing. Related enabled:',
    toggles?.related,
    'isInteractiveForm:',
    isInteractiveForm,
  )
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

      // Use agent's model config if available, otherwise fall back to global settings
      const { modelConfig, provider, credentials } = resolveProviderConfigWithCredentials(
        safeAgent,
        settings,
        'generateRelatedQuestions',
        fallbackAgent,
      )
      related = await withTimeout(
        provider.generateRelatedQuestions(
          relatedMessages, // Only use the last 2 messages (User + AI) for context
          credentials.apiKey,
          credentials.baseUrl,
          modelConfig.model, // Use the configured model for this task
        ),
        20000,
        'Related questions',
      )
    } catch (error) {
      console.error('[chatStore] Failed to generate related questions:', error)
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
    await addMessage(hiddenUserMessage)

    set(state => {
      const updated = [...state.messages, hiddenUserMessage]
      return { messages: updated }
    })

    // Append newline to last AI message to separate form from new content
    set(state => {
      const updated = [...state.messages]
      const lastMsgIndex = updated.length - 2 // The AI message is now second to last
      if (lastMsgIndex >= 0 && updated[lastMsgIndex].role === 'ai') {
        updated[lastMsgIndex] = {
          ...updated[lastMsgIndex],
          content: updated[lastMsgIndex].content + '\n\n',
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

    const toolMessages = []

    if (
      lastAiMsg &&
      lastAiMsg.role === 'ai' &&
      Array.isArray(lastAiMsg.toolCallHistory) &&
      lastAiMsg.toolCallHistory.length > 0
    ) {
      lastAiMsg.toolCallHistory.forEach(tc => {
        // For interactive_form, use the submitted form data as result
        if (tc.name === 'interactive_form') {
          toolMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(formData.values),
            created_at: new Date().toISOString(),
          })
        }
        // For other tools (like memory_check) that are already done, use their output
        else if (tc.output !== undefined) {
          toolMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: typeof tc.output === 'string' ? tc.output : JSON.stringify(tc.output),
            created_at: new Date().toISOString(),
          })
        }
      })
    }

    // Insert tool messages between AI message and User Form Submission message
    const contextMessages = [...messages, ...toolMessages, hiddenUserMessage]

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
        messages.length,
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
    const { newMessages, historyForSend } = handleEditingAndHistory(
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
      await persistUserMessage(convId, editingInfo, userMessage.content, set)
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
