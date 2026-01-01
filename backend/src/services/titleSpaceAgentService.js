/**
 * Generate Title, Space, and Agent Service
 * Direct port from frontend backendProvider.js - generateTitleSpaceAndAgent
 */

import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import {
  normalizeGeminiMessages,
  normalizeTextContent,
  safeJsonParse,
  toLangChainMessages,
} from './serviceUtils.js'

// Default base URLs
const OPENAI_DEFAULT_BASE = 'https://api.openai.com/v1'
const SILICONFLOW_BASE = 'https://api.siliconflow.cn/v1'
const GLM_BASE = 'https://open.bigmodel.cn/api/paas/v4'
const MODELSCOPE_BASE = 'https://api-inference.modelscope.cn/v1'
const KIMI_BASE = 'https://api.moonshot.cn/v1'

// Default models
const DEFAULT_MODELS = {
  gemini: 'gemini-2.0-flash-exp',
  openai: 'gpt-4o-mini',
  siliconflow: 'Qwen/Qwen2.5-7B-Instruct',
  glm: 'glm-4-flash',
  modelscope: 'AI-ModelScope/glm-4-9b-chat',
  kimi: 'moonshot-v1-8k',
}


/**
 * Sanitize option text for prompt
 */
const sanitizeOptionText = text =>
  String(text || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

 

// ============================================================================
// Model builders (from frontend buildXXXModel functions)
// ============================================================================

const buildGeminiModel = ({
  apiKey,
  model,
  temperature,
  top_k,
  top_p,
  tools,
  thinking,
  streaming,
}) => {
  if (!apiKey) throw new Error('Missing API key')

  return new ChatGoogleGenerativeAI({
    apiKey,
    model: model || DEFAULT_MODELS.gemini,
    temperature,
    topK: top_k,
    ...(top_p !== undefined ? { topP: top_p } : {}),
    streaming,
  })
}

const buildSiliconFlowModel = ({
  apiKey,
  model,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  streaming,
}) => {
  if (!apiKey) throw new Error('Missing API key')

  const modelKwargs = {}
  modelKwargs.response_format = responseFormat || { type: 'text' }
  if (top_k !== undefined) modelKwargs.top_k = top_k
  if (top_p !== undefined) modelKwargs.top_p = top_p
  if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
  if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty

  return new ChatOpenAI({
    apiKey,
    modelName: model || DEFAULT_MODELS.siliconflow,
    temperature,
    streaming,
    modelKwargs,
    configuration: { baseURL: SILICONFLOW_BASE },
  })
}

const buildGLMModel = ({
  apiKey,
  model,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  streaming,
}) => {
  if (!apiKey) throw new Error('Missing API key')

  const modelKwargs = {}
  if (responseFormat) modelKwargs.response_format = responseFormat
  modelKwargs.thinking = { type: thinking?.type || 'disabled' }
  if (top_k !== undefined) modelKwargs.top_k = top_k
  if (top_p !== undefined) modelKwargs.top_p = top_p
  if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
  if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty

  return new ChatOpenAI({
    apiKey,
    modelName: model || DEFAULT_MODELS.glm,
    temperature,
    streaming,
    modelKwargs,
    configuration: { baseURL: GLM_BASE },
  })
}

const buildModelScopeModel = ({
  apiKey,
  model,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  streaming,
}) => {
  if (!apiKey) throw new Error('Missing API key')

  const modelKwargs = {}
  if (responseFormat) modelKwargs.response_format = responseFormat
  modelKwargs.thinking = { type: thinking?.type || 'disabled' }
  if (top_k !== undefined) modelKwargs.top_k = top_k
  if (top_p !== undefined) modelKwargs.top_p = top_p
  if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
  if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty

  return new ChatOpenAI({
    apiKey,
    modelName: model || DEFAULT_MODELS.modelscope,
    temperature,
    streaming,
    modelKwargs,
    configuration: { baseURL: MODELSCOPE_BASE },
  })
}

const buildKimiModel = ({
  apiKey,
  model,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  streaming,
}) => {
  if (!apiKey) throw new Error('Missing API key')

  const modelKwargs = {}
  if (responseFormat) modelKwargs.response_format = responseFormat
  if (top_k !== undefined) modelKwargs.top_k = top_k
  if (top_p !== undefined) modelKwargs.top_p = top_p
  if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
  if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty

  return new ChatOpenAI({
    apiKey,
    modelName: model || DEFAULT_MODELS.kimi,
    temperature,
    streaming,
    modelKwargs,
    configuration: { baseURL: KIMI_BASE },
  })
}

const buildOpenAIModel = ({
  provider,
  apiKey,
  baseUrl,
  model,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  streaming,
}) => {
  if (!apiKey) throw new Error('Missing API key')

  const resolvedBase = baseUrl || OPENAI_DEFAULT_BASE

  const modelKwargs = {}
  if (tools && tools.length > 0) modelKwargs.tools = tools
  if (toolChoice) modelKwargs.tool_choice = toolChoice
  if (responseFormat) modelKwargs.response_format = responseFormat
  if (top_k !== undefined) modelKwargs.top_k = top_k
  if (top_p !== undefined) modelKwargs.top_p = top_p
  if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
  if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty

  return new ChatOpenAI({
    apiKey,
    modelName: model || DEFAULT_MODELS.openai,
    temperature,
    streaming,
    modelKwargs,
    configuration: { baseURL: resolvedBase },
  })
}

// ============================================================================
// Request functions (from frontend requestXXX functions)
// ============================================================================

const requestGemini = async ({ apiKey, model, messages, temperature, top_k, top_p, signal }) => {
  const modelInstance = buildGeminiModel({
    apiKey,
    model,
    temperature,
    top_k,
    top_p,
    tools: [],
    thinking: false,
    streaming: false,
  })

  const orderedMessages = normalizeGeminiMessages(messages || [])
  const langchainMessages = toLangChainMessages(orderedMessages)
  const response = await modelInstance.invoke(langchainMessages, { signal })

  return typeof response.content === 'string'
    ? response.content
    : normalizeTextContent(response.content)
}

const requestSiliconFlow = async ({
  apiKey,
  model,
  messages,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  signal,
}) => {
  const modelInstance = buildSiliconFlowModel({
    apiKey,
    model,
    temperature,
    top_k,
    top_p,
    frequency_penalty,
    presence_penalty,
    tools: [],
    toolChoice,
    responseFormat,
    thinking,
    streaming: false,
  })

  const langchainMessages = toLangChainMessages(messages || [])
  const response = await modelInstance.invoke(langchainMessages, { signal })

  return typeof response.content === 'string'
    ? response.content
    : normalizeTextContent(response.content)
}

const requestGLM = async ({
  apiKey,
  model,
  messages,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  signal,
}) => {
  const modelInstance = buildGLMModel({
    apiKey,
    model,
    temperature,
    top_k,
    top_p,
    frequency_penalty,
    presence_penalty,
    tools: [],
    toolChoice,
    responseFormat,
    thinking: {
      type: 'disabled',
    },
    streaming: false,
  })

  const langchainMessages = toLangChainMessages(messages || [])
  const response = await modelInstance.invoke(langchainMessages, { signal })

  return typeof response.content === 'string'
    ? response.content
    : normalizeTextContent(response.content)
}

const requestModelScope = async ({
  apiKey,
  model,
  messages,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  signal,
}) => {
  const modelInstance = buildModelScopeModel({
    apiKey,
    model,
    temperature,
    top_k,
    top_p,
    frequency_penalty,
    presence_penalty,
    tools: [],
    toolChoice,
    responseFormat,
    thinking: {
      type: 'disabled',
    },
    streaming: false,
  })

  const langchainMessages = toLangChainMessages(messages || [])
  const response = await modelInstance.invoke(langchainMessages, { signal })

  return typeof response.content === 'string'
    ? response.content
    : normalizeTextContent(response.content)
}

const requestKimi = async ({
  apiKey,
  model,
  messages,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  signal,
}) => {
  const modelInstance = buildKimiModel({
    apiKey,
    model,
    temperature,
    top_k,
    top_p,
    frequency_penalty,
    presence_penalty,
    tools: [],
    toolChoice,
    responseFormat,
    thinking: undefined,
    streaming: false,
  })

  const langchainMessages = toLangChainMessages(messages || [])
  const response = await modelInstance.invoke(langchainMessages, { signal })

  return typeof response.content === 'string'
    ? response.content
    : normalizeTextContent(response.content)
}

const requestOpenAICompat = async ({
  provider,
  apiKey,
  baseUrl,
  model,
  messages,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  signal,
}) => {
  const modelInstance = buildOpenAIModel({
    provider,
    apiKey,
    baseUrl,
    model,
    temperature,
    top_k,
    top_p,
    frequency_penalty,
    presence_penalty,
    tools: [],
    toolChoice,
    responseFormat,
    thinking,
    streaming: false,
  })

  const langchainMessages = toLangChainMessages(messages || [])
  const response = await modelInstance.invoke(langchainMessages, { signal })

  return typeof response.content === 'string'
    ? response.content
    : normalizeTextContent(response.content)
}

// ============================================================================
// Main function - generateTitleSpaceAndAgent
// ============================================================================

/**
 * Generate title, select space, and optionally select agent
 * Direct port from frontend generateTitleSpaceAndAgent
 */
export const generateTitleSpaceAndAgent = async (
  provider,
  firstMessage,
  spacesWithAgents,
  apiKey,
  baseUrl,
  model,
) => {
  const spaceLines = (spacesWithAgents || []).map(space => {
    const agentEntries = (space.agents || []).map(agent => {
      if (typeof agent === 'string') {
        return { name: agent }
      }
      return {
        name: typeof agent?.name === 'string' ? agent.name : '',
        description: agent?.description ?? '',
      }
    })
    const agentTokens = agentEntries
      .map(agent => {
        const name = sanitizeOptionText(agent.name)
        const description = sanitizeOptionText(agent.description)
        if (name && description) return `${name} - ${description}`
        if (name) return name
        return ''
      })
      .filter(Boolean)
      .join(',')
    const spaceLabel = sanitizeOptionText(space.label)
    const spaceDescription = sanitizeOptionText(space.description)
    const spaceToken = spaceDescription ? `${spaceLabel} - ${spaceDescription}` : spaceLabel
    return `${spaceToken}:{${agentTokens}}`
  })

  const promptMessages = [
    {
      role: 'system',
      content: `You are a helpful assistant.
## Task
1. Generate a short, concise title (max 5 words) for this conversation based on the user's first message.
2. Select the most appropriate space from the list below and return its spaceLabel (the space name only, without the description).
3. If the chosen space has agents, select the best matching agent by agentName (agent name only). Otherwise return null.

## Output
Return the result as JSON with keys "title", "spaceLabel", and "agentName".`,
    },
    {
      role: 'user',
      content: `${firstMessage}\n\nSpaces and agents:\n${spaceLines.join('\n')}`,
    },
  ]

  const responseFormat = provider !== 'gemini' ? { type: 'json_object' } : undefined

  let content
  if (provider === 'gemini') {
    content = await requestGemini({ apiKey, model, messages: promptMessages })
  } else if (provider === 'siliconflow') {
    content = await requestSiliconFlow({
      apiKey,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else if (provider === 'glm') {
    content = await requestGLM({
      apiKey,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else if (provider === 'modelscope') {
    content = await requestModelScope({
      apiKey,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else if (provider === 'kimi') {
    content = await requestKimi({
      apiKey,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else {
    content = await requestOpenAICompat({
      provider,
      apiKey,
      baseUrl,
      model,
      messages: promptMessages,
      responseFormat,
    })
  }

  const parsed = safeJsonParse(content) || {}

  return {
    title: parsed.title || 'New Conversation',
    spaceLabel: parsed.spaceLabel || null,
    agentName: parsed.agentName || null,
  }
}
