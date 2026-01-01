/**
 * Agent for Auto mode generation service
 */

import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatOpenAI } from '@langchain/openai'

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
 * Safely parse JSON from string
 */
const safeJsonParse = text => {
  if (!text || typeof text !== 'string') return null
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

/**
 * Normalize text content to string
 */
const normalizeTextContent = content => {
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
  return content ? String(content) : ''
}

/**
 * Normalize message content parts
 */
const normalizeParts = content => {
  if (!Array.isArray(content)) return content

  const parts = content
    .map(part => {
      if (typeof part === 'string') return { type: 'text', text: part }
      if (part?.type === 'text' && part.text) return { type: 'text', text: part.text }
      if (part?.type === 'quote' && part.text) return { type: 'text', text: part.text }
      if (part?.type === 'image_url') {
        const url = part.image_url?.url || part.url
        if (!url) return null
        return { type: 'image_url', image_url: { url } }
      }
      if (part?.text) return { type: 'text', text: part.text }
      return null
    })
    .filter(Boolean)

  if (parts.length === 1 && parts[0].type === 'text') {
    return parts[0].text
  }
  return parts
}

/**
 * Convert message format to LangChain messages
 */
const toLangChainMessages = messages => {
  return (messages || []).map(message => {
    const role = message.role === 'ai' ? 'assistant' : message.role
    const content = normalizeParts(message.content)

    if (role === 'system') return new SystemMessage(content)
    if (role === 'assistant') {
      const additional_kwargs = message.tool_calls ? { tool_calls: message.tool_calls } : undefined
      return new AIMessage({ content, additional_kwargs })
    }
    if (role === 'tool') {
      return new ToolMessage({ content, tool_call_id: message.tool_call_id })
    }
    return new HumanMessage(content)
  })
}

/**
 * Normalize Gemini messages - system messages first
 */
const normalizeGeminiMessages = messages => {
  if (!Array.isArray(messages) || messages.length === 0) return messages
  const systemMessages = messages.filter(m => m?.role === 'system')
  const nonSystemMessages = messages.filter(m => m?.role !== 'system')
  if (systemMessages.length === 0) return messages
  return [...systemMessages, ...nonSystemMessages]
}

// ============================================================================
// Model builders
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
// Request functions
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
    thinking: { type: 'disabled' },
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
    thinking: { type: 'disabled' },
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

/**
 * Generate agent for auto mode
 */
export const generateAgentForAuto = async (
  provider,
  userMessage,
  currentSpace,
  apiKey,
  baseUrl,
  model,
) => {
  const sanitizeOptionText = text =>
    String(text || '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/[{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

  const agentEntries = (currentSpace?.agents || []).map(agent => {
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
    .join('\n')

  const promptMessages = [
    {
      role: 'system',
      content: `You are a helpful assistant.
## Task
Select the best matching agent for the user's message from the "${currentSpace?.label || 'Default'}" space. Consider the agent's name and description to determine which one is most appropriate. If no agent is a good match, return null.

## Output
Return the result as JSON with key "agentName" (agent name only, or null if no match).`,
    },
    {
      role: 'user',
      content: `${userMessage}\n\nAvailable agents in ${currentSpace?.label || 'this space'}:\n${agentTokens}`,
    },
  ]

  const responseFormat = provider !== 'gemini' ? { type: 'json_object' } : undefined
  let content = undefined
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
  return parsed.agentName || null
}
