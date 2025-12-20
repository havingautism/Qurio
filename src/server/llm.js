import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'

const OPENAI_DEFAULT_BASE = 'https://api.openai.com/v1'
const SILICONFLOW_BASE = 'https://api.siliconflow.cn/v1'

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

export const applyContextLimitRaw = (messages, limit) => {
  const numericLimit = parseInt(limit, 10)
  if (!Array.isArray(messages) || !numericLimit || numericLimit < 1) return messages

  const systemMessages = messages.filter(m => m?.role === 'system')
  const nonSystemMessages = messages.filter(m => m?.role !== 'system')
  const trimmedNonSystem = nonSystemMessages.slice(-numericLimit)

  return [...systemMessages, ...trimmedNonSystem]
}

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

const buildOpenAIModel = ({
  provider,
  apiKey,
  baseUrl,
  model,
  temperature,
  top_k,
  tools,
  toolChoice,
  responseFormat,
  thinking,
}) => {
  const resolvedKey = apiKey || process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY
  const resolvedBase =
    baseUrl ||
    process.env.OPENAI_BASE_URL ||
    process.env.NEXT_PUBLIC_OPENAI_BASE_URL ||
    OPENAI_DEFAULT_BASE

  const modelKwargs = {}
  if (provider === 'siliconflow') {
    if (!responseFormat) {
      modelKwargs.response_format = { type: 'text' }
    }
    if (thinking) {
      const budget = thinking.budget_tokens || thinking.budgetTokens || 1024
      modelKwargs.thinking_budget = budget
    }
    if (top_k !== undefined) {
      modelKwargs.top_k = top_k
    }
    // const enableThinkingModels = new Set([
    //   'zai-org/GLM-4.6',
    //   'Qwen/Qwen3-8B',
    //   'Qwen/Qwen3-14B',
    //   'Qwen/Qwen3-32B',
    //   'wen/Qwen3-30B-A3B',
    //   'Qwen/Qwen3-235B-A22B',
    //   'tencent/Hunyuan-A13B-Instruct',
    //   'zai-org/GLM-4.5V',
    //   'deepseek-ai/DeepSeek-V3.1-Terminus',
    //   'Pro/deepseek-ai/DeepSeek-V3.1-Terminus',
    //   'deepseek-ai/DeepSeek-V3.2',
    // ])
    // if (thinking && enableThinkingModels.has(model)) {
    //   modelKwargs.enable_thinking = true
    // }
    if (thinking) {
      modelKwargs.enable_thinking = true
    }
  }

  let modelInstance = new ChatOpenAI({
    openAIApiKey: resolvedKey,
    modelName: model,
    temperature,
    streaming: true,
    streamUsage: false,
    __includeRawResponse: true,
    modelKwargs,
    configuration: { baseURL: resolvedBase },
  })

  const debugParams = {
    provider,
    model,
    temperature,
    top_k,
    modelKwargs,
    bindParams: {},
  }

  const usesNonOpenAIModel = provider === 'siliconflow' || !model?.startsWith('gpt-')
  if (usesNonOpenAIModel) {
    modelInstance.getNumTokens = async content => {
      const text =
        typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? content
                .map(item => {
                  if (typeof item === 'string') return item
                  if (item?.type === 'text' && item.text) return item.text
                  return ''
                })
                .join('')
            : ''
      return Math.ceil(text.length / 4)
    }
  }

  const bindParams = {}
  if (tools && tools.length > 0) bindParams.tools = tools
  if (toolChoice) bindParams.tool_choice = toolChoice
  if (responseFormat && provider !== 'siliconflow') {
    bindParams.response_format = responseFormat
  }
  if (thinking?.extra_body) bindParams.extra_body = thinking.extra_body
  if (top_k !== undefined && provider !== 'siliconflow') {
    bindParams.extra_body = { ...(bindParams.extra_body || {}), top_k }
  }

  if (Object.keys(bindParams).length) {
    debugParams.bindParams = bindParams
    modelInstance = modelInstance.bind(bindParams)
    modelInstance.__debugParams = debugParams
    modelInstance.__includeRawResponse = true
  } else {
    modelInstance.__debugParams = debugParams
  }

  return modelInstance
}

const buildGeminiModel = ({ apiKey, model, temperature, top_k, tools, thinking }) => {
  const resolvedKey = apiKey || process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY

  let modelInstance = new ChatGoogleGenerativeAI({
    apiKey: resolvedKey,
    model: model,
    temperature,
    topK: top_k,
    streaming: true,
  })

  const bindParams = {}
  if (tools && tools.length > 0) bindParams.tools = tools
  if (thinking?.thinkingConfig) bindParams.thinkingConfig = thinking.thinkingConfig
  if (Object.keys(bindParams).length) {
    modelInstance = modelInstance.bind(bindParams)
  }

  return modelInstance
}

export const getModelForProvider = params => {
  const { provider, baseUrl } = params
  if (provider === 'gemini') {
    return buildGeminiModel(params)
  }

  const resolvedBase =
    provider === 'siliconflow' ? SILICONFLOW_BASE : baseUrl || OPENAI_DEFAULT_BASE

  return buildOpenAIModel({ ...params, provider, baseUrl: resolvedBase })
}

export const buildChatMessages = ({ messages, contextMessageLimit }) => {
  const trimmed = applyContextLimitRaw(messages, contextMessageLimit)
  return toLangChainMessages(trimmed)
}

export const extractChunkText = chunk => {
  if (!chunk) return ''
  if (typeof chunk === 'string') return chunk
  if (typeof chunk.text === 'string') return chunk.text
  if (chunk.message?.content) {
    const content = chunk.message.content
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
  }
  if (chunk.content) {
    const content = chunk.content
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
  }
  return ''
}
