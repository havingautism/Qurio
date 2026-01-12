/**
 * GLM Provider Adapter
 * Handles Zhipu AI's GLM models
 */

import { ChatOpenAI } from '@langchain/openai'
import { BaseProviderAdapter } from './BaseProviderAdapter.js'
import { getProviderConfig } from './providerConfig.js'


/**
 * Check if model supports GLM tool streaming (glm-4.6+)
 * @param {string} model - Model name
 * @returns {boolean} True if model supports tool streaming
 */
const isToolStreamingSupported = (model) => {
  if (!model) return false
  const modelName = model.toLowerCase()
  return modelName.includes('glm-4.6') || modelName.includes('glm-4.7')
}

export class GLMAdapter extends BaseProviderAdapter {
  constructor() {
    super('glm')
  }

  get capabilities() {
    return getProviderConfig('glm').capabilities
  }

  get config() {
    return getProviderConfig('glm')
  }

  /**
   * Build GLM model instance
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

    if (!apiKey) throw new Error('Missing API key for GLM')

    const modelKwargs = {}
    if (responseFormat) modelKwargs.response_format = responseFormat

    // Thinking mode configuration - only set if explicitly provided
    // Don't set to 'disabled' by default, as it prevents reasoning_content in tool_stream
    if (thinking?.type) {
      modelKwargs.thinking = { type: thinking.type }
      modelKwargs.extra_body = {
        ...modelKwargs.extra_body,
        thinking: { type: thinking.type },
      }
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

    // Enable tool streaming for glm-4.6/4.7 when using tools
    const actualModel = model || this.config.defaultModel
    if (
      streaming &&
      tools &&
      tools.length > 0 &&
      isToolStreamingSupported(actualModel)
    ) {
      // Put tool_stream at top level of modelKwargs (not in extra_body)
      modelKwargs.tool_stream = true
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
   * Note: GLM tool calls are unreliable in streaming for some models.
   */
  async execute(messages, params) {
    const { tools, stream } = params

    const canStream = stream && (!tools?.length || this.capabilities.supportsStreamingToolCalls)

    if (!stream) {
      return this.executeNonStreamingForToolCalls(messages, params)
    }

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

    const execution = await this.executeNonStreamingForToolCalls(messages, params)

    if (execution.type === 'tool_calls') {
      return execution
    }

    const responseContent = this.getResponseContent(execution.response)
    if (responseContent) {
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
}
