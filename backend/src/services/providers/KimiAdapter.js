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
   * Execute request
   * IMPORTANT: Kimi doesn't support streaming tool calls reliably
   * When tools are present and streaming is requested, we use non-streaming for tool calls
   */
  async execute(messages, params) {
    const { tools, stream } = params

    // ⚠️ Known limitation: Kimi's streaming tool_calls have incomplete arguments
    // Fallback to non-streaming when tools are present
    // ⚠️ Known limitation: Kimi's streaming tool_calls have incomplete arguments
    // Fallback to non-streaming when tools are present
    if (tools && tools.length > 0 && stream) {
      // 1. Probe with non-streaming (to detect tools)
      const execution = await this.executeNonStreamingForToolCalls(messages, params)

      // 2. If it's a tool call, return it as is
      if (execution.type === 'tool_calls') {
        return execution
      }

      // 3. If NO tool calls (final answer), switch to streaming
      // This ensures we get proper token streaming and thinking tag parsing
      const modelInstance = this.buildModel({
        ...params,
        tools,
        streaming: true,
      })

      return {
        type: 'stream',
        modelInstance,
        messages,
      }
    }

    // Regular streaming (no tools configured)
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
