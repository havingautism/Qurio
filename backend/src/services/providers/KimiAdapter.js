/**
 * Kimi Provider Adapter
 * Handles Moonshot AI's Kimi models
 */

import { ChatOpenAI } from '@langchain/openai'
import { BaseProviderAdapter } from './BaseProviderAdapter.js'
import { getProviderConfig } from './providerConfig.js'

export class KimiAdapter extends BaseProviderAdapter {
  constructor() {
    super('kimi')
  }

  get capabilities() {
    return getProviderConfig('kimi').capabilities
  }

  get config() {
    return getProviderConfig('kimi')
  }

  /**
   * Build Kimi model instance
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

    if (!apiKey) throw new Error('Missing API key for Kimi')

    const modelKwargs = {}
    if (responseFormat) modelKwargs.response_format = responseFormat
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
   * Execute request with streaming support
   * Kimi supports streaming tool calls natively with proper argument accumulation
   */
  async execute(messages, params) {
    const { tools, stream } = params

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
