/**
 * Daily Tip generation service
 */

import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import {
  normalizeGeminiMessages,
  normalizeTextContent,
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

/**
 * Generate a short, practical tip for today
 */
export const generateDailyTip = async (provider, language, category, apiKey, baseUrl, model) => {
  const languageBlock = language ? `\n\n## Language\nReply in ${language}.` : ''
  const categoryBlock = category ? `\n\n## Category\n${category}` : ''
  const promptMessages = [
    {
      role: 'system',
      content: `## Task
Generate a short, practical tip for today. Keep it to 1-2 sentences and avoid emojis.${categoryBlock}${languageBlock}

## Output
Return only the tip text.`,
    },
    { role: 'user', content: 'Daily tip.' },
  ]

  let content = undefined
  if (provider === 'gemini') {
    content = await requestGemini({ apiKey, model, messages: promptMessages })
  } else if (provider === 'siliconflow') {
    content = await requestSiliconFlow({
      apiKey,
      model,
      messages: promptMessages,
    })
  } else if (provider === 'glm') {
    content = await requestGLM({
      apiKey,
      model,
      messages: promptMessages,
    })
  } else if (provider === 'modelscope') {
    content = await requestModelScope({
      apiKey,
      model,
      messages: promptMessages,
    })
  } else if (provider === 'kimi') {
    content = await requestKimi({
      apiKey,
      model,
      messages: promptMessages,
    })
  } else {
    content = await requestOpenAICompat({
      provider,
      apiKey,
      baseUrl,
      model,
      messages: promptMessages,
    })
  }

  return (content && content.trim?.()) || ''
}
