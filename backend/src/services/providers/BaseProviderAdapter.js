/**
 * Base Provider Adapter
 * Abstract base class defining the interface for all provider adapters
 */

import { safeJsonParse, toLangChainMessages } from '../serviceUtils.js'

export class BaseProviderAdapter {
  constructor(providerName) {
    this.providerName = providerName
  }

  /**
   * Provider capabilities declaration
   * Each provider must override this to declare their capabilities
   */
  get capabilities() {
    throw new Error('Must override capabilities getter')
  }

  /**
   * Get provider configuration
   */
  get config() {
    throw new Error('Must override config getter')
  }

  /**
   * Build model instance
   * @param {Object} params - Model parameters
   * @returns {Object} LangChain model instance
   */
  buildModel(params) {
    throw new Error('Must implement buildModel()')
  }

  /**
   * Execute chat completion with tool calling support
   * @param {Array} messages - Message history
   * @param {Object} params - Request parameters
   * @returns {Object} Execution result with type and data
   */
  async execute(messages, params) {
    throw new Error('Must implement execute()')
  }

  /**
   * Handle streaming response
   * @param {Object} modelInstance - Model instance
   * @param {Array} messages - Message history
   * @param {Object} signal - AbortSignal
   * @returns {AsyncGenerator} Stream iterator
   */
  async createStreamIterator(modelInstance, messages, signal) {
    const langchainMessages = toLangChainMessages(messages)
    return await modelInstance.stream(langchainMessages, signal ? { signal } : undefined)
  }

  /**
   * Parse tool calls from response
   * @param {Object} response - Model response
   * @returns {Array|null} Tool calls array or null
   */
  parseToolCalls(response) {
    const raw = response?.additional_kwargs?.__raw_response
    const choice = raw?.choices?.[0]
    const message = choice?.message
    return (
      message?.tool_calls || response?.additional_kwargs?.tool_calls || response?.tool_calls || null
    )
  }

  /**
   * Get finish reason from response
   * @param {Object} response - Model response
   * @returns {string|null} Finish reason
   */
  getFinishReason(response) {
    const raw = response?.additional_kwargs?.__raw_response
    return raw?.choices?.[0]?.finish_reason || null
  }

  /**
   * Get response content
   * @param {Object} response - Model response
   * @returns {string} Response content
   */
  getResponseContent(response) {
    const raw = response?.additional_kwargs?.__raw_response
    const message = raw?.choices?.[0]?.message
    return message?.content ?? response?.content
  }

  /**
   * Extract thinking/reasoning content from streaming chunk
   * Default implementation checks common reasoning fields (GLM, Kimi, etc.)
   * Subclasses can override for provider-specific logic
   * @param {Object} messageChunk - Streaming message chunk
   * @returns {string|null} Thinking content or null
   */
  extractThinkingContent(messageChunk) {
    return (
      messageChunk?.additional_kwargs?.__raw_response?.choices?.[0]?.delta?.reasoning_content ||
      messageChunk?.additional_kwargs?.__raw_response?.choices?.[0]?.delta?.reasoning ||
      messageChunk?.additional_kwargs?.reasoning_content ||
      messageChunk?.additional_kwargs?.reasoning ||
      null
    )
  }

  /**
   * Execute non-streaming request for tool calls
   * Used when provider doesn't support streaming tool calls
   */
  async executeNonStreamingForToolCalls(messages, params) {
    const nonStreamingModel = this.buildModel({ ...params, streaming: false })
    const langchainMessages = toLangChainMessages(messages)
    const response = await nonStreamingModel.invoke(
      langchainMessages,
      params.signal ? { signal: params.signal } : undefined,
    )

    const finishReason = this.getFinishReason(response)
    const toolCalls = this.parseToolCalls(response)

    // Try to reuse extractThinkingContent but also check all possible locations for DeepSeek/SiliconFlow
    const rawResponse = response?.response_metadata || response?.additional_kwargs?.__raw_response
    const thought =
      this.extractThinkingContent(response) ||
      response?.additional_kwargs?.reasoning_content ||
      response?.additional_kwargs?.reasoning ||
      rawResponse?.reasoning_content ||
      rawResponse?.choices?.[0]?.message?.reasoning_content ||
      null

    // Fallback: Check content for <think> tags if no dedicated reasoning field
    if (!thought && typeof response?.content === 'string') {
      const match =
        response.content.match(/<think>(.*?)<\/think>/s) ||
        response.content.match(/<thought>(.*?)<\/thought>/s)
      if (match) {
        // Found thought in content
        // We usually don't want to mutate content here as it might break things,
        // but for tool calls context, content is often just the thought or empty.
        // Let's rely on this extracted thought.
        // Note: we don't return 'thought' variable assignment here because it's const.
        // We'll return it in the object below.
        return {
          type: 'tool_calls',
          toolCalls: this.normalizeToolCalls(toolCalls),
          thought: match[1],
        }
      }
    }

    if (finishReason === 'tool_calls' && Array.isArray(toolCalls) && toolCalls.length > 0) {
      return {
        type: 'tool_calls',
        toolCalls: this.normalizeToolCalls(toolCalls),
        thought, // Return extracted thought
      }
    }

    return {
      type: 'response', // Standardize on 'response' for non-streaming final answer
      response,
      thought, // Return extracted thought
    }
  }

  /**
   * Normalize tool calls to standard format
   * @param {Array} toolCalls - Raw tool calls from provider
   * @returns {Array} Normalized tool calls
   */
  normalizeToolCalls(toolCalls) {
    return toolCalls
      .map(toolCall => {
        const toolName = this.getToolCallName(toolCall)
        const toolArgs = this.getToolCallArguments(toolCall)
        return {
          id: toolCall.id,
          type: toolCall.type || 'function',
          function: toolName
            ? { name: toolName, arguments: this.formatToolArguments(toolArgs) }
            : undefined,
        }
      })
      .filter(toolCall => toolCall?.id && toolCall?.function?.name)
  }

  /**
   * Extract tool call name from various formats
   */
  getToolCallName(toolCall) {
    return (
      toolCall?.function?.name ||
      toolCall?.name ||
      toolCall?.tool?.name ||
      toolCall?.tool?.function?.name ||
      null
    )
  }

  /**
   * Extract tool call arguments from various formats
   */
  getToolCallArguments(toolCall) {
    return (
      toolCall?.function?.arguments ||
      toolCall?.arguments ||
      toolCall?.args ||
      toolCall?.tool?.function?.arguments ||
      toolCall?.tool?.arguments ||
      toolCall?.tool?.args ||
      null
    )
  }

  /**
   * Format tool arguments to JSON string
   */
  formatToolArguments(value) {
    if (!value) return ''
    if (typeof value === 'string') {
      const parsed = safeJsonParse(value)
      return parsed ? JSON.stringify(parsed) : value
    }
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }
}
