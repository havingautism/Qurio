/**
 * Google Gemini API Client (Native)
 * 
 * This module handles direct interaction with the Google GenAI SDK (@google/genai).
 * It mirrors the interface of openai.js for seamless switching.
 */

import { GoogleGenAI } from "@google/genai";
import { loadSettings } from "./settings";

/**
 * Resolve model based on provided override or persisted settings.
 * Pass "lite" to use the lite model fallback; otherwise the default model is used.
 */
const resolveModel = (model, variant = "default") => {
  if (model) return model;
  const settings = loadSettings();
  return variant === "lite" ? settings.liteModel : settings.defaultModel;
};

/**
 * Trim conversation history based on user-configured limit.
 * Keeps a leading system message intact if present.
 */
const applyContextLimit = (messages) => {
  const { contextMessageLimit } = loadSettings();
  const limit = parseInt(contextMessageLimit, 10);
  if (!Array.isArray(messages) || !limit || limit < 1) return messages;

  const systemMessages = messages.filter((m) => m?.role === "system");
  const nonSystemMessages = messages.filter((m) => m?.role !== "system");
  const trimmedNonSystem = nonSystemMessages.slice(-limit);

  return [...systemMessages, ...trimmedNonSystem];
};

/**
 * Convert a data URL (data:mime;base64,...) into Gemini inlineData format.
 * @param {string} dataUrl
 * @returns {{ inlineData: { mimeType: string, data: string } } | null}
 */
const dataUrlToInlineData = (dataUrl) => {
  if (typeof dataUrl !== "string") return null;
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!match) return null;
  const mimeType = match[1] || "image/png";
  const data = match[2];
  return { inlineData: { mimeType, data } };
};

/**
 * Normalize OpenAI-style content into Gemini parts.
 * Supports plain text and inline image data URLs (image_url.url).
 * @param {string|Array} content
 * @returns {Array<{text?: string, inlineData?: {mimeType: string, data: string}}>}
 */
const normalizeParts = (content) => {
  if (typeof content === "string") return [{ text: content }];
  if (!Array.isArray(content)) return [{ text: String(content ?? "") }];

  const parts = [];
  for (const part of content) {
    if (typeof part === "string") {
      parts.push({ text: part });
      continue;
    }
    if (part?.type === "text" && part.text) {
      parts.push({ text: part.text });
      continue;
    }
    if (part?.type === "image_url" && part.image_url?.url) {
      const inlineData = dataUrlToInlineData(part.image_url.url);
      if (inlineData) {
        parts.push(inlineData);
      } else {
        parts.push({ text: "[Image not supported]" });
      }
      continue;
    }
    if (part?.text) {
      parts.push({ text: part.text });
    }
  }

  return parts.length > 0 ? parts : [{ text: "" }];
};

/**
 * Map OpenAI-style role to Gemini role.
 * @param {string} role
 */
const mapRole = (role) => {
  if (role === "assistant" || role === "ai") return "model";
  if (role === "user") return "user";
  return "user";
};

/**
 * Normalize incoming tool definitions to Gemini format.
 * Supports Google Search toggle only for now.
 * @param {Array|undefined} tools
 * @returns {Array|undefined}
 */
const normalizeTools = (tools) => {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  // Currently we only support googleSearch tool for Gemini.
  return tools.map((tool) => {
    if (tool.googleSearch || tool.google_search) {
      return { googleSearch: tool.googleSearch || tool.google_search || {} };
    }
    return tool;
  });
};

/**
 * Convert OpenAI-style messages to Gemini history/systemInstruction + user prompt.
 * The last message is treated as the current user prompt; the rest form history.
 * @param {Array} messages
 */
const buildChatPayload = (messages) => {
  if (!messages || messages.length === 0) {
    return {
      history: [],
      systemInstruction: undefined,
      promptParts: [{ text: "" }],
    };
  }

  let systemInstruction;
  const working = [...messages];
  // Extract system instruction if present as the first message
  if (working[0]?.role === "system") {
    systemInstruction = extractText(working[0].content);
    working.shift();
  }

  const promptMessage = working.pop();
  const history = working.map((m) => ({
    role: mapRole(m.role),
    parts: normalizeParts(m.content),
  }));

  const promptParts = normalizeParts(promptMessage?.content || "");

  return { history, promptParts, systemInstruction };
};

/**
 * Extract plain text from content for utility prompts.
 * @param {string|Array} content
 */
const extractText = (content) => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part?.type === "text" && part.text) return part.text;
        if (part?.text) return part.text;
        return "";
      })
      .join("\n");
  }
  return "";
};

/**
 * Extract web sources from grounding metadata.
 * @param {object} groundingMetadata
 * @returns {Array<{title: string, domain: string, url: string}>}
 */
const extractSources = (groundingMetadata) => {
  const chunks = groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];

  const getDomain = (uri) => {
    try {
      const hostname = new URL(uri).hostname;
      return hostname.replace(/^www\./i, "");
    } catch {
      return uri;
    }
  };

  return chunks
    .map((chunk) => {
      const uri = chunk?.web?.uri || chunk?.uri;
      if (!uri) return null;
      const title = chunk?.web?.title || chunk?.title || uri;
      return {
        title,
        domain: getDomain(uri),
        url: uri,
      };
    })
    .filter(Boolean);
};

/**
 * Annotate content with grounding supports (e.g., append [1][2] markers).
 * @param {string} text
 * @param {Array} supports
 * @returns {string}
 */
const annotateGroundedText = (text, supports) => {
  if (!text || !Array.isArray(supports) || supports.length === 0) return text;

  let annotated = text;

  for (const support of supports) {
    const segText = support?.segment?.text;
    const indices = support?.groundingChunkIndices;
    if (!segText || !Array.isArray(indices) || indices.length === 0) continue;

    const markers = indices.map((i) => `[${i + 1}]`).join("");
    if (!markers) continue;

    // Flexible, whitespace-tolerant search
    const escaped = segText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped.replace(/\s+/g, "\\s+"), "i");
    const match = regex.exec(annotated);

    if (match && typeof match.index === "number") {
      const start = match.index;
      const end = start + match[0].length;
      annotated = `${annotated.slice(0, end)}${markers}${annotated.slice(end)}`;
      continue;
    }

    const strictIdx = annotated.indexOf(segText);
    if (strictIdx !== -1) {
      const end = strictIdx + segText.length;
      annotated = `${annotated.slice(0, end)}${markers}${annotated.slice(end)}`;
    }
  }

  return annotated;
};

/**
 * Stream chat completion using native Gemini API (@google/genai)
 * 
 * @param {Object} params
 * @param {string} params.apiKey
 * @param {string} params.model
 * @param {Array} params.messages
 * @param {Array} [params.tools]
 * @param {Object} [params.thinking]
 * @param {Function} params.onChunk
 * @param {Function} params.onFinish
 * @param {Function} params.onError
 * @param {AbortSignal} [params.signal]
 */
export const streamChatCompletion = async ({
  apiKey,
  model,
  messages,
  tools,
  thinking,
  onChunk,
  onFinish,
  onError,
  signal,
}) => {
  try {
    const resolvedModel = resolveModel(model, "default");
    const ai = new GoogleGenAI({ apiKey });

    const trimmedMessages = applyContextLimit(messages);
    const { history, promptParts, systemInstruction } = buildChatPayload(trimmedMessages);
    const geminiTools = normalizeTools(tools);

    // Combine history and current prompt for generateContent
    const contents = [
      ...history,
      { role: "user", parts: promptParts }
    ];

    const config = {
      systemInstruction,
      tools: geminiTools,
      ...(thinking || {}), // spreads { thinkingConfig: ... }
    };

    const result = await ai.models.generateContentStream({
      model: resolvedModel,
      contents,
      config,
    }, { signal });

    let fullContent = "";
    let inThought = false;
    let lastGroundingMetadata = null;
    
    for await (const chunk of result) {
      const parts = chunk.candidates?.[0]?.content?.parts || [];
      if (chunk.candidates?.[0]?.groundingMetadata) {
        lastGroundingMetadata = chunk.candidates[0].groundingMetadata;
      }
      
      for (const part of parts) {
        if (part.thought) {
          // Handle thought start
          if (!inThought) {
            fullContent += "<thought>";
            inThought = true;
          }
          
          // Emit structured chunk for UI
          onChunk({ type: 'thought', content: part.text });
          fullContent += part.text;
          
        } else if (part.text) {
          // Handle thought end
          if (inThought) {
            fullContent += "</thought>\n";
            inThought = false;
          }
          
          // Emit structured chunk for UI
          onChunk({ type: 'text', content: part.text });
          fullContent += part.text;
        }
      }
    }

    // Close thought tag if still open
    if (inThought) {
      fullContent += "</thought>";
    }

    const sources = extractSources(lastGroundingMetadata);
    const groundedContent = annotateGroundedText(
      fullContent,
      lastGroundingMetadata?.groundingSupports
    );

    onFinish({
      content: groundedContent,
      sources: sources.length ? sources : undefined,
      groundingSupports: lastGroundingMetadata?.groundingSupports || undefined
    });

  } catch (error) {
    console.error("Gemini Stream Error:", error);
    onError(error);
  }
};

/**
 * Generate title using native Gemini API
 */
export const generateTitle = async (firstMessage, apiKey, baseUrl, model) => {
  try {
    const resolvedModel = resolveModel(model, "lite");
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: resolvedModel, // Use dynamic model parameter
      config: {
        systemInstruction: "Generate a concise chat title (max 5 words). Do not use quotation marks.",
      },
      contents: [{ role: "user", parts: [{ text: firstMessage }]}],
    });

    const text = (typeof response?.text === 'function' ? response.text() : response?.text)?.trim();
    return text || "New Conversation";
  } catch (error) {
    console.error("Gemini title generation error:", error);
    return "New Conversation";
  }
};

/**
 * Generate related questions using native Gemini API
 */
export const generateRelatedQuestions = async (messages, apiKey, baseUrl, model) => {
  try {
    const resolvedModel = resolveModel(model, "lite");
    const conversationText = (messages || [])
      .map((m) => `${m.role}: ${extractText(m.content)}`)
      .join("\n");

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: resolvedModel, // Use dynamic model parameter
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Conversation so far:\n${conversationText}\n\nSuggest 3 short, relevant follow-up questions. Return ONLY a JSON array of strings.`,
            },
          ],
        },
      ],
      config: { responseMimeType: "application/json" },
    });

    const text = typeof response?.text === 'function' ? response.text() : response?.text;
    if (!text) return [];

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
      if (parsed.questions && Array.isArray(parsed.questions)) return parsed.questions;
      return [];
    } catch (err) {
      console.error("Failed to parse related questions JSON:", err);
      return [];
    }
  } catch (error) {
    console.error("Gemini related questions error:", error);
    return [];
  }
};

/**
 * Generate title and space using native Gemini API
 */
export const generateTitleAndSpace = async (firstMessage, spaces, apiKey, baseUrl, model) => {
  try {
    const resolvedModel = resolveModel(model, "lite");
    const spaceLabels = spaces.map((s) => s.label).join(", ");

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: resolvedModel, // Use dynamic model parameter
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `User message: "${firstMessage}"\n\n1) Propose a concise title (max 5 words).\n2) Choose the best matching space from [${spaceLabels}] or return null if none fit.\nReturn JSON with keys "title" and "spaceLabel".`,
            },
          ],
        },
      ],
      config: { responseMimeType: "application/json" },
    });

    const text = typeof response?.text === 'function' ? response.text() : response?.text;
    if (!text) return { title: "New Conversation", space: null };

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      console.error("Gemini title/space JSON parse error:", err);
      return { title: "New Conversation", space: null };
    }

    const title = parsed.title || "New Conversation";
    const spaceLabel = parsed.spaceLabel;
    const space = spaces.find((s) => s.label === spaceLabel) || null;

    return { title, space };
  } catch (error) {
    console.error("Gemini title and space error:", error);
    return { title: "New Conversation", space: null };
  }
};
