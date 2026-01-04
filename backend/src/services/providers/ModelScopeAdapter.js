/**
 * ModelScope Provider Adapter
 * Handles ModelScope API
 */

import { ChatOpenAI } from '@langchain/openai'
import { BaseProviderAdapter } from './BaseProviderAdapter.js'
import { getProviderConfig } from './providerConfig.js'

export class ModelScopeAdapter extends BaseProviderAdapter {
  constructor() {
    super('modelscope')
  }

  get capabilities() {
    return getProviderConfig('modelscope').capabilities
  }

  get config() {
    return getProviderConfig('modelscope')
  }

  /**
   * Build ModelScope model instance
   */
  buildModel(params) {
    const {
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
    } = params

    if (!apiKey) throw new Error('Missing API key for ModelScope')

    const modelKwargs = {}
    if (responseFormat) modelKwargs.response_format = responseFormat

    // Thinking mode configuration
    const thinkingType = thinking?.type || 'disabled'
    modelKwargs.thinking = { type: thinkingType }
    if (thinking?.type) {
      modelKwargs.extra_body = { thinking: { type: thinkingType } }
    }

    if (top_k !== undefined) modelKwargs.top_k = top_k
    if (top_p !== undefined) modelKwargs.top_p = top_p
    if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
    if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty
    if (tools && tools.length > 0) modelKwargs.tools = tools
    if (toolChoice) modelKwargs.tool_choice = toolChoice
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
      configuration: { baseURL: this.config.baseURL },
    })
  }

  /**
   * Execute request
   * IMPORTANT: ModelScope API doesn't support tools + stream together
   */
  async execute(messages, params) {
    const { tools, stream } = params

    // ⚠️ API limitation: Cannot use tools and streaming together
    // Fallback to non-streaming when tools are present
    if (tools && tools.length > 0 && stream) {
      return this.executeNonStreamingForToolCalls(messages, params)
    }

    // Regular streaming (no tools)
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

    return this.executeNonStreamingForToolCalls(messages, params)
  }
}
