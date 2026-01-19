/**
 * NVIDIA NIM Provider Adapter
 * Handles NVIDIA NIM (OpenAI-compatible)
 */

import { ChatOpenAI } from '@langchain/openai'
import { BaseProviderAdapter } from './BaseProviderAdapter.js'
import { getProviderConfig } from './providerConfig.js'

export class NvidiaNimAdapter extends BaseProviderAdapter {
  constructor() {
    super('nvidia')
  }

  get capabilities() {
    return getProviderConfig('nvidia').capabilities
  }

  get config() {
    return getProviderConfig('nvidia')
  }

  /**
   * Build NVIDIA NIM model instance
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

    if (!apiKey) throw new Error('Missing API key for NVIDIA NIM')

    const resolvedBase = baseUrl || this.config.baseURL
    const modelKwargs = {}

    // Thinking mode support - pass as direct parameter for NVIDIA
    // const chat_template_kwargs = thinking ? { thinking: true } : undefined
    if(thinking){
      modelKwargs.chat_template_kwargs={thinking: true}
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
      // chat_template_kwargs,
      configuration: { baseURL: resolvedBase },
    })
  }

  /**
   * Execute request with streaming support
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

  /**
   * Extract thinking/reasoning content from streaming chunk
   * NVIDIA DeepSeek: chunk.choices[0].delta.reasoning_content
   */
  extractThinkingContent(messageChunk) {
    const baseContent = super.extractThinkingContent(messageChunk)
    if (baseContent) return baseContent

    return messageChunk?.choices?.[0]?.delta?.reasoning_content || null
  }
}
