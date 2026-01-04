/**
 * SiliconFlow Provider Adapter
 * Handles SiliconFlow API (DeepSeek and other models)
 */

import { ChatOpenAI } from '@langchain/openai'
import { BaseProviderAdapter } from './BaseProviderAdapter.js'
import { getProviderConfig } from './providerConfig.js'

export class SiliconFlowAdapter extends BaseProviderAdapter {
  constructor() {
    super('siliconflow')
  }

  get capabilities() {
    return getProviderConfig('siliconflow').capabilities
  }

  get config() {
    return getProviderConfig('siliconflow')
  }

  /**
   * Build SiliconFlow model instance
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

    if (!apiKey) throw new Error('Missing API key for SiliconFlow')

    const modelKwargs = {}
    modelKwargs.response_format = responseFormat || { type: 'text' }

    // Thinking mode support (DeepSeek models)
    if (thinking) {
      const budget = thinking.budget_tokens || thinking.budgetTokens || 1024
      modelKwargs.extra_body = { thinking_budget: budget }
      modelKwargs.enable_thinking = true
      modelKwargs.thinking_budget = budget
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
   * Execute request with streaming support
   */
  async execute(messages, params) {
    const { tools, stream } = params

    // Check if we can use streaming (respect capability flags)
    // If tools are present and provider doesn't support streaming tools, force non-streaming
    const canStream = stream && (!tools?.length || this.capabilities.supportsStreamingToolCalls)

    if (canStream) {
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

    // For SiliconFlow/DeepSeek, we use a "Probe-and-Stream" pattern if tools are present
    // because streaming tool calls are unreliable, but we WANT streaming for the final answer.
    if (!canStream) {
      // 1. Probe with non-streaming (to detect tools)
      const execution = await this.executeNonStreamingForToolCalls(messages, params)

      // 2. If it's a tool call, return it as is (will be handled by non-streaming loop in service)
      if (execution.type === 'tool_calls') {
        return execution
      }

      // 3. If NO tool calls (final answer), DISCARD the non-streaming response.
      // Instead, return a fresh STREAMING request.
      // This ensures we get the proper thinking/reasoning events via the streaming path,
      // which handles them much better than non-streaming extraction.
      const modelInstance = this.buildModel({
        ...params,
        tools, // Keep tools in the context even if we know they weren't called this time
        streaming: true,
      })

      return {
        type: 'stream',
        modelInstance,
        messages,
      }
    }

    return this.executeNonStreamingForToolCalls(messages, params)
  }
}
