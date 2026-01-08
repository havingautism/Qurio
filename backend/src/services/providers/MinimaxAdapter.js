/**
 * MiniMax Provider Adapter
 * Handles MiniMax AI models (OpenAI-compatible)
 */

import { ChatOpenAI } from '@langchain/openai'
import { BaseProviderAdapter } from './BaseProviderAdapter.js'
import { getProviderConfig } from './providerConfig.js'

export class MinimaxAdapter extends BaseProviderAdapter {
  constructor() {
    super('minimax')
  }

  get capabilities() {
    return getProviderConfig('minimax').capabilities
  }

  get config() {
    return getProviderConfig('minimax')
  }

  /**
   * Build MiniMax model instance
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
      streaming,
    } = params

    if (!apiKey) throw new Error('Missing API key for MiniMax')

    const modelKwargs = {}

    // MiniMax Thinking mode configuration
    // Use reasoning_split=true to separate thinking content into reasoning_details field
    if (params.thinking?.type && params.thinking.type !== 'disabled') {
      modelKwargs.extra_body = { reasoning_split: true }
    }

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
      configuration: { baseURL: this.config.baseURL },
    })
  }

  /**
   * Execute request with streaming support
   * MiniMax supports streaming tool calls (OpenAI-compatible)
   */
  async execute(messages, params) {
    const { tools, stream } = params

    // MiniMax supports streaming tool calls natively
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
