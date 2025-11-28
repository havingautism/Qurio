import OpenAI from 'openai';

/**
 * Create an OpenAI client instance.
 * @param {Object} config
 * @param {string} config.apiKey
 * @param {string} config.baseUrl
 * @returns {OpenAI}
 */
export const createOpenAIClient = ({ apiKey, baseUrl }) => {
  return new OpenAI({
    apiKey,
    baseURL: baseUrl,
    dangerouslyAllowBrowser: true, // Required for client-side usage
    defaultHeaders: {
      'x-stainless-arch': null,
      'x-stainless-lang': null,
      'x-stainless-os': null,
      'x-stainless-package-version': null,
      'x-stainless-retry-count': null,
      'x-stainless-runtime': null,
      'x-stainless-runtime-version': null,
      'x-stainless-timeout': null,
    }
  });
};

/**
 * Stream chat completion with support for advanced features.
 * 
 * Features supported:
 * - Streaming
 * - Function Calling (Tools)
 * - Image Understanding (Multimodal input via messages)
 * - Structured Output (JSON mode/schema)
 * - Thinking (via model selection or specific params)
 * 
 * @param {Object} params
 * @param {string} params.apiKey - API Key
 * @param {string} params.baseUrl - Base URL
 * @param {string} params.model - Model ID
 * @param {Array} params.messages - Conversation history (can include images)
 * @param {Array} [params.tools] - List of tools for function calling
 * @param {string|Object} [params.toolChoice] - Tool choice strategy
 * @param {Object} [params.responseFormat] - Structured output format (e.g. { type: "json_object" })
 * @param {Object} [params.thinking] - Thinking configuration (e.g. { budget_tokens: 1024 }) - mostly for reasoning models
 * @param {Function} params.onChunk - Callback for content chunks
 * @param {Function} params.onFinish - Callback on completion
 * @param {Function} params.onError - Callback on error
 * @param {AbortSignal} [params.signal] - Abort signal
 */
export const streamChatCompletion = async ({
  apiKey,
  baseUrl,
  model,
  messages,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  onChunk,
  onFinish,
  onError,
  signal
}) => {
  try {
    const client = createOpenAIClient({ apiKey, baseUrl})

    // Construct the request options
    const options = {
      model,
      messages,
      stream: true,
    };

    // Optional splicing of features
    if (tools && tools.length > 0) {
      options.tools = tools;
      // options.tool_choice = 'auto'; 
    }

    if (responseFormat) {
      options.response_format = responseFormat;
    }

    // Handle "Thinking" or Reasoning parameters if applicable
    if (thinking) {
       // If specific thinking params are needed, add them here.
      //  if (thinking.budget_tokens) {
      //    options.max_completion_tokens = thinking.budget_tokens;
      //  }
       // Support for Google's extra_body structure
       if (thinking.extra_body) {
         options.extra_body = thinking.extra_body;
       }
    }

    console.log('Starting stream with options:', { ...options, apiKey: '***' });

    const stream = await client.chat.completions.create(options, { signal });

    let fullContent = '';
    let toolCallsMap = new Map();

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      const delta = choice?.delta;

      if (!delta) continue;

      // Handle Content
      if (delta.content) {
        fullContent += delta.content;
        onChunk(delta.content);
      }

      // Handle Tool Calls (Streaming)
      if (delta.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          const index = toolCall.index;
          if (!toolCallsMap.has(index)) {
            toolCallsMap.set(index, {
              id: toolCall.id,
              type: toolCall.type,
              function: { name: '', arguments: '' }
            });
          }
          
          const currentToolCall = toolCallsMap.get(index);
          
          if (toolCall.id) currentToolCall.id = toolCall.id;
          if (toolCall.type) currentToolCall.type = toolCall.type;
          if (toolCall.function?.name) currentToolCall.function.name += toolCall.function.name;
          if (toolCall.function?.arguments) currentToolCall.function.arguments += toolCall.function.arguments;
        }
      }
    }

    // Process final tool calls if any
    const finalToolCalls = Array.from(toolCallsMap.values());
    
    onFinish({
      content: fullContent,
      toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined
    });

  } catch (error) {
    console.error('Stream error:', error);
    onError(error);
  }
};

/**
 * Generate a title for the conversation.
 * @param {string} firstMessage
 * @param {string} apiKey
 * @param {string} baseUrl
 * @returns {Promise<string>}
 */
export const generateTitle = async (firstMessage, apiKey, baseUrl) => {
  try {
    const client = createOpenAIClient({ apiKey, baseUrl });
    const response = await client.chat.completions.create({
      model: "gemini-1.5-flash", // Use a fast model
      messages: [
        { role: "system", content: "Generate a short, concise title (max 5 words) for this conversation based on the user's first message. Do not use quotes." },
        { role: "user", content: firstMessage }
      ],
      max_tokens: 15
    });
    return response.choices[0]?.message?.content?.trim() || "New Conversation";
  } catch (error) {
    console.error("Error generating title:", error);
    return "New Conversation";
  }
};

/**
 * Generate a title and suggest a space for the conversation.
 * @param {string} firstMessage
 * @param {Array} spaces - List of available spaces { label, emoji }
 * @param {string} apiKey
 * @param {string} baseUrl
 * @returns {Promise<{title: string, space: Object|null}>}
 */
export const generateTitleAndSpace = async (firstMessage, spaces, apiKey, baseUrl) => {
  try {
    const client = createOpenAIClient({ apiKey, baseUrl });
    const spaceLabels = spaces.map(s => s.label).join(", ");
    
    const response = await client.chat.completions.create({
      model: "gemini-2.5-flash",
      messages: [
        { 
          role: "system", 
          content: `You are a helpful assistant. 
          1. Generate a short, concise title (max 5 words) for this conversation based on the user's first message.
          2. Select the most appropriate space from the following list: [${spaceLabels}]. If none fit well, return null.
          Return the result as a JSON object with keys "title" and "spaceLabel".` 
        },
        { role: "user", content: firstMessage }
      ],
      response_format: { type: "json_object" }
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) return { title: "New Conversation", space: null };
    
    const parsed = JSON.parse(content);
    const title = parsed.title || "New Conversation";
    const spaceLabel = parsed.spaceLabel;
    
    const selectedSpace = spaces.find(s => s.label === spaceLabel) || null;
    
    return { title, space: selectedSpace };
  } catch (error) {
    console.error("Error generating title and space:", error);
    return { title: "New Conversation", space: null };
  }
};

/**
 * Generate related questions based on the conversation history.
 * @param {Array} messages
 * @param {string} apiKey
 * @param {string} baseUrl
 * @returns {Promise<Array<string>>}
 */
export const generateRelatedQuestions = async (messages, apiKey, baseUrl) => {
  try {
    const client = createOpenAIClient({ apiKey, baseUrl });
    const response = await client.chat.completions.create({
      model: "gemini-2.5-flash",
      messages: [
        ...messages,
        { role: "user", content: "Based on our conversation, suggest 3 short, relevant follow-up questions I might ask. Return them as a JSON array of strings. Example: [\"Question 1?\", \"Question 2?\"]" }
      ],
      response_format: { type: "json_object" }
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) return [];
    
    // Attempt to parse JSON
    try {
      const parsed = JSON.parse(content);
      // Handle various potential JSON structures (array directly, or object with key)
      if (Array.isArray(parsed)) return parsed;
      if (parsed.questions && Array.isArray(parsed.questions)) return parsed.questions;
      return [];
    } catch (e) {
      console.error("Failed to parse related questions JSON:", e);
      return [];
    }
  } catch (error) {
    console.error("Error generating related questions:", error);
    return [];
  }
};
