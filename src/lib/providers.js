import * as openaiCompatibility from './openai_compatibility';
import * as gemini from './gemini';

/**
 * Provider Registry
 * 
 * Centralizes configuration and adaptation logic for different API providers.
 * Each provider implements a standard interface for credentials and capabilities.
 */
/**
 * Default message parser (handles <thought> tags)
 */
const defaultParseMessage = (input) => {
  // Handle message object input (structured thought)
  if (typeof input === 'object' && input !== null && input.thought) {
    const content =
      typeof input.content === 'string'
        ? input.content.replace(/<thought>[\s\S]*?(?:<\/thought>|$)/, '').trim()
        : input.content;
    return {
      thought: input.thought,
      content
    };
  }

  // Handle string input (or object without thought property, treating as content string if possible)
  const content = typeof input === 'string' ? input : (input.content || "");

  if (typeof content !== 'string') return { content, thought: null };
  const thoughtMatch = /<thought>([\s\S]*?)(?:<\/thought>|$)/.exec(content);
  if (thoughtMatch) {
    return {
      thought: thoughtMatch[1],
      content: content.replace(/<thought>[\s\S]*?(?:<\/thought>|$)/, '').trim()
    };
  }
  return { content, thought: null };
};

export const PROVIDERS = {
  openai_compatibility: {
    ...openaiCompatibility,
    id: 'openai_compatibility',
    name: 'OpenAI Compatible',
    getCredentials: (settings) => ({
      apiKey: settings.OpenAICompatibilityKey,
      baseUrl: settings.OpenAICompatibilityUrl,
    }),
    getTools: (isSearchActive) => isSearchActive ? [{ 
      type: 'function', 
      function: { 
        name: 'google_search', 
        description: 'Search the web', 
        parameters: { type: 'object', properties: { query: { type: 'string' } } } 
      } 
    }] : undefined,//abandoned
    getThinking: (isThinkingActive) => isThinkingActive ? {
      extra_body: {
        "google": {
          "thinking_config": {
            "thinking_budget": 1024,
            "include_thoughts": true
          }
        }
      }
    } : undefined,
    parseMessage: defaultParseMessage
  },
  gemini: {
    ...gemini,
    id: 'gemini',
    name: 'Google Gemini',
    getCredentials: (settings) => ({
      apiKey:
        settings.googleApiKey ||
        import.meta.env.PUBLIC_GOOGLE_API_KEY,
      baseUrl: undefined // Native SDK usually handles its own endpoints
    }),
    getTools: (isSearchActive) => isSearchActive ? [{ googleSearch: {} }] : undefined, // Native Gemini Google Search tool
    getThinking: (isThinkingActive, model) => {
      if (!isThinkingActive) return undefined;
      const isGemini3Preview = model === 'gemini-3-pro-preview';
      return {
        thinkingConfig: isGemini3Preview
          ? { includeThoughts: true, thinkingLevel: 'high' }
          : { includeThoughts: true, thinkingBudget: 1024 }
      };
    }, // Native Gemini thinking config
    parseMessage: defaultParseMessage
  }
};

/**
 * Get the provider adapter by name.
 * Defaults to 'gemini' if not found.
 * 
 * @param {string} providerName 
 * @returns {Object} Provider adapter
 */
export const getProvider = (providerName) => {
  return PROVIDERS[providerName] || PROVIDERS.gemini;
};
