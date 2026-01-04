/**
 * Provider Configuration
 * Centralized configuration for all AI providers
 */

// Base URLs
export const PROVIDER_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  siliconflow: 'https://api.siliconflow.cn/v1',
  glm: 'https://open.bigmodel.cn/api/paas/v4',
  modelscope: 'https://api-inference.modelscope.cn/v1',
  kimi: 'https://api.moonshot.cn/v1',
}

// Default models
export const DEFAULT_MODELS = {
  gemini: 'gemini-2.0-flash-exp',
  openai: 'gpt-4o-mini',
  siliconflow: 'Qwen/Qwen2.5-7B-Instruct',
  glm: 'glm-4-flash',
  modelscope: 'AI-ModelScope/glm-4-9b-chat',
  kimi: 'moonshot-v1-8k',
}

// Provider capabilities matrix
export const PROVIDER_CAPABILITIES = {
  openai: {
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsStreamingToolCalls: true,
    supportsJsonSchema: true,
    supportsThinking: false,
    supportsVision: true,
  },
  siliconflow: {
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsStreamingToolCalls: false, // ⚠️ Legacy code forced non-streaming for tools
    supportsJsonSchema: true,
    supportsThinking: true, // DeepSeek models
    supportsVision: false,
  },
  glm: {
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsStreamingToolCalls: false, // Use non-streaming for tool calls (legacy behavior)
    supportsJsonSchema: true,
    supportsThinking: true,
    supportsVision: false,
  },
  modelscope: {
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsStreamingToolCalls: false, // ⚠️ API limitation: tools + stream not supported together
    supportsJsonSchema: true,
    supportsThinking: true,
    supportsVision: false,
  },
  kimi: {
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsStreamingToolCalls: false, // ⚠️ Known issue: streaming returns incomplete tool_calls
    supportsJsonSchema: true,
    supportsThinking: false,
    supportsVision: false,
  },
  gemini: {
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsStreamingToolCalls: true,
    supportsJsonSchema: false, // Uses different format
    supportsThinking: true,
    supportsVision: true,
  },
}

/**
 * Get provider configuration
 * @param {string} provider - Provider name
 * @returns {Object} Provider configuration
 */
export function getProviderConfig(provider) {
  return {
    baseURL: PROVIDER_BASE_URLS[provider],
    defaultModel: DEFAULT_MODELS[provider],
    capabilities: PROVIDER_CAPABILITIES[provider] || {},
  }
}

/**
 * Check if provider supports a specific capability
 * @param {string} provider - Provider name
 * @param {string} capability - Capability to check
 * @returns {boolean} Whether capability is supported
 */
export function supportsCapability(provider, capability) {
  return PROVIDER_CAPABILITIES[provider]?.[capability] ?? false
}
