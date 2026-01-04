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
    modelKwargs.response_format = responseFormat || { type: 'text' }

    // Thinking mode configuration
    if (thinking && streaming) {
      const budget = thinking.budget_tokens || thinking.budgetTokens || 1024
      modelKwargs.extra_body = {
        enable_thinking: true,
        thinking_budget: budget,
      }
      modelKwargs.enable_thinking = true
      modelKwargs.thinking_budget = budget
    } else if (!streaming) {
      modelKwargs.extra_body = {
        ...(modelKwargs.extra_body || {}),
        enable_thinking: false,
      }
      modelKwargs.enable_thinking = false
    }

    if (top_k !== undefined) modelKwargs.top_k = top_k
    if (top_p !== undefined) modelKwargs.top_p = top_p
    if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
    if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty
    if (tools && tools.length > 0) modelKwargs.tools = tools
    if (toolChoice) modelKwargs.tool_choice = toolChoice
    // if (streaming) {
    //   modelKwargs.stream_options = { include_usage: false }
    // }

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

    // For ModelScope, use the same "Probe-and-Stream" pattern as SiliconFlow
    if (!canStream) {
      const execution = await this.executeNonStreamingForToolCalls(messages, params)
      if (execution.type === 'tool_calls') {
        return execution
      }

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

    return this.executeNonStreamingForToolCalls(messages, params)
  }
}
