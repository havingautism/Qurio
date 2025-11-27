/**
 * OpenAI Service Stub
 * 
 * This file will handle all interactions with OpenAI-compatible APIs.
 * It should support:
 * 1. Custom Base URL
 * 2. Custom API Key
 * 3. Model Selection
 * 4. Streaming Responses
 */

/**
 * Stream chat completion from an OpenAI-compatible API.
 * 
 * @param {Object} params - The parameters for the API call.
 * @param {string} params.apiKey - The API key provided by the user.
 * @param {string} params.baseUrl - The base URL provided by the user.
 * @param {string} params.model - The model ID selected by the user.
 * @param {Array} params.messages - The conversation history.
 * @param {boolean} params.useSearch - Whether to use online search (if supported by model/provider).
 * @param {boolean} params.useReasoning - Whether to use reasoning mode (if supported).
 * @param {Function} onChunk - Callback function called when a chunk of data is received.
 * @param {Function} onFinish - Callback function called when the stream is finished.
 * @param {Function} onError - Callback function called when an error occurs.
 */
export const streamChatCompletion = async ({
  apiKey,
  baseUrl,
  model,
  messages,
  useSearch,
  useReasoning,
  onChunk,
  onFinish,
  onError
}) => {
  // TODO: Implement actual API call using fetch or openai-node SDK (browser compatible)
  
  console.log('Starting stream with:', { apiKey, baseUrl, model, useSearch, useReasoning });

  // Pseudo-code for streaming:
  /*
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: true,
        // Add search/reasoning parameters if specific provider supports them
      })
    });

    if (!response.ok) throw new Error('API request failed');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      // Parse SSE (Server-Sent Events) format
      // Call onChunk(parsedContent)
    }

    onFinish();
  } catch (error) {
    onError(error);
  }
  */
};

/**
 * Generate a title for the conversation based on the first message.
 * 
 * @param {string} firstMessage - The first message content.
 * @returns {Promise<string>} The generated title.
 */
export const generateTitle = async (firstMessage) => {
  // TODO: Call a small model or use a heuristic to generate a title
  return "New Conversation"; 
};
