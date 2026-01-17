/**
 * Provider Adapter Factory
 * Creates the appropriate adapter based on provider name
 */

import { GeminiAdapter } from './GeminiAdapter.js'
import { GLMAdapter } from './GLMAdapter.js'
import { KimiAdapter } from './KimiAdapter.js'
import { ModelScopeAdapter } from './ModelScopeAdapter.js'
import { OpenAIAdapter } from './OpenAIAdapter.js'
import { SiliconFlowAdapter } from './SiliconFlowAdapter.js'
import { NvidiaNimAdapter } from './NvidiaNimAdapter.js'
import { MinimaxAdapter } from './MinimaxAdapter.js'

// Cache adapter instances for reuse
const adapterCache = new Map()

/**
 * Get provider adapter instance
 * @param {string} provider - Provider name
 * @returns {BaseProviderAdapter} Provider adapter instance
 */
export function getProviderAdapter(provider) {
  // Return cached instance if available
  if (adapterCache.has(provider)) {
    return adapterCache.get(provider)
  }

  // Create new adapter instance
  let adapter

  switch (provider) {
    case 'openai':
    case 'openai_compatibility':
      adapter = new OpenAIAdapter()
      break
    case 'siliconflow':
      adapter = new SiliconFlowAdapter()
      break
    case 'kimi':
      adapter = new KimiAdapter()
      break
    case 'glm':
      adapter = new GLMAdapter()
      break
    case 'modelscope':
      adapter = new ModelScopeAdapter()
      break
    case 'gemini':
      adapter = new GeminiAdapter()
      break
    case 'nvidia':
      adapter = new NvidiaNimAdapter()
      break
    case 'minimax':
      // MiniMax has its own dedicated adapter
      adapter = new MinimaxAdapter()
      break
    default:
      // Fallback to OpenAI adapter for unknown providers
      // (assumes OpenAI-compatible API)
      console.warn(`Unknown provider: ${provider}, using OpenAI adapter as fallback`)
      adapter = new OpenAIAdapter()
  }

  // Cache for future use
  adapterCache.set(provider, adapter)
  return adapter
}

/**
 * Check if provider is supported
 * @param {string} provider - Provider name
 * @returns {boolean} Whether provider is supported
 */
export function isProviderSupported(provider) {
  return [
    'openai',
    'openai_compatibility',
    'siliconflow',
    'kimi',
    'glm',
    'modelscope',
    'gemini',
    'nvidia',
    'minimax',
  ].includes(provider)
}
