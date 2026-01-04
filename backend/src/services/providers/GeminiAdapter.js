/**
 * Gemini Provider Adapter
 * Handles Google's Gemini models
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { BaseProviderAdapter } from './BaseProviderAdapter.js'
import { getProviderConfig } from './providerConfig.js'

export class GeminiAdapter extends BaseProviderAdapter {
  constructor() {
    super('gemini')
  }

  get capabilities() {
    return getProviderConfig('gemini').capabilities
  }

  get config() {
    return getProviderConfig('gemini')
  }

  /**
   * Build Gemini model instance
   * Note: Gemini uses ChatGoogleGenerativeAI, not ChatOpenAI
   */
  buildModel(params) {
    const { apiKey, model, temperature, top_k, top_p, tools, streaming } = params

    if (!apiKey) throw new Error('Missing API key for Gemini')

    // TODO: Gemini thinking mode requires further investigation
    // Frontend passes: { thinkingConfig: { includeThoughts: true, thinkingBudget: 1024 } }
    // but ChatGoogleGenerativeAI doesn't accept these params directly or via modelKwargs
    // Need to research LangChain's ChatGoogleGenerativeAI API documentation

    return new ChatGoogleGenerativeAI({
      apiKey,
      model: model || this.config.defaultModel,
      temperature,
      topK: top_k,
      ...(top_p !== undefined ? { topP: top_p } : {}),
      streaming,
    })
  }

  /**
   * Execute request with streaming support
   * Gemini supports streaming tool calls natively
   */
  async execute(messages, params) {
    const { tools, stream } = params

    // Gemini supports streaming tool calls natively ✅
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

  /**
   * Extract thinking content from Gemini's response format
   * Gemini returns content as parts array with { thought: true, text: "..." }
   * @override
   */
  extractThinkingContent(messageChunk) {
    const contentValue = messageChunk?.content ?? messageChunk?.message?.content

    // Gemini returns content as array of parts
    if (Array.isArray(contentValue)) {
      let thinkingText = ''
      for (const part of contentValue) {
        // Check if this part is marked as thought
        if (part?.thought && typeof part?.text === 'string') {
          thinkingText += part.text
        }
      }
      return thinkingText || null
    }

    // Fallback to default reasoning_content extraction
    return super.extractThinkingContent(messageChunk)
  }

  /**
   * Override parseToolCalls for Gemini-specific format
   * Gemini may have different tool_calls structure
   */
  parseToolCalls(response) {
    // First try standard extraction
    const standardToolCalls = super.parseToolCalls(response)
    if (standardToolCalls) return standardToolCalls

    // Gemini-specific fallback if needed
    // (Currently Gemini uses standard format via LangChain wrapper)
    return null
  }
}
