/**
 * OpenAI Provider Adapter
 * Handles OpenAI and OpenAI-compatible providers
 */

import { ChatOpenAI } from '@langchain/openai'
import { BaseProviderAdapter } from './BaseProviderAdapter.js'
import { getProviderConfig } from './providerConfig.js'

export class OpenAIAdapter extends BaseProviderAdapter {
  constructor() {
    super('openai')
  }

  get capabilities() {
    return getProviderConfig('openai').capabilities
  }

  get config() {
    return getProviderConfig('openai')
  }

  /**
   * Build OpenAI model instance
   */
  buildModel(params) {
    const {
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
    } = params

    if (!apiKey) throw new Error('Missing API key for OpenAI')

    const resolvedBase = baseUrl || this.config.baseURL
    const modelKwargs = {}

    if (tools && tools.length > 0) modelKwargs.tools = tools
    if (toolChoice) modelKwargs.tool_choice = toolChoice
    if (responseFormat) modelKwargs.response_format = responseFormat
    if (top_k !== undefined) modelKwargs.top_k = top_k
    if (top_p !== undefined) modelKwargs.top_p = top_p
    if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
    if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty
    if (streaming) {
      modelKwargs.stream_options = { include_usage: false }
    }

    return new ChatOpenAI({
      apiKey,
      modelName: model || this.config.defaultModel,
      temperature,
      streaming,
      __includeRawResponse: true,
      modelKwargs,
      configuration: { baseURL: resolvedBase },
    })
  }

  /**
   * Execute request with streaming support
   */
  async execute(messages, params) {
    const { tools, stream } = params

    // OpenAI supports streaming tool calls natively
    const modelInstance = this.buildModel({
      ...params,
      tools,
      streaming: stream,
    })

    if (stream) {
      return {
        type: 'stream',
        modelInstance,
        messages,
      }
    }

    // Non-streaming fallback
    return this.executeNonStreamingForToolCalls(messages, params)
  }
}
