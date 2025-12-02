import { create } from "zustand";
import {
  createConversation,
  addMessage,
  updateConversation,
} from "../lib/conversationsService";
import { deleteMessageById } from "../lib/supabase";
import { getProvider } from "../lib/providers";
import { getModelForTask } from "../lib/modelSelector.js";

// ================================================================================
// CHAT STORE HELPER FUNCTIONS
// These functions are organized by functionality to improve maintainability
// ================================================================================

// ========================================
// INPUT VALIDATION & MESSAGE CONSTRUCTION
// ========================================
/**
 * Validates user input before sending a message
 * @param {string} text - The message text
 * @param {Array} attachments - Array of file attachments
 * @param {boolean} isLoading - Whether another operation is in progress
 * @returns {Object} Validation result with isValid flag and optional reason
 */
const validateInput = (text, attachments, isLoading) => {
  // Check if input is valid (has text or attachments)
  if (!text.trim() && attachments.length === 0) {
    return { isValid: false, reason: "empty_input" };
  }

  // Check if another operation is already in progress
  if (isLoading) {
    return { isValid: false, reason: "already_loading" };
  }

  return { isValid: true };
};

/**
 * Builds a user message object with proper content structure
 * @param {string} text - The message text
 * @param {Array} attachments - Array of file attachments
 * @returns {Object} User message object with role, content, and timestamp
 */
const buildUserMessage = (text, attachments) => {
  // Build content with attachments if present
  let content = text;
  if (attachments.length > 0) {
    content = [{ type: "text", text }, ...attachments];
  }

  // Create user message object with timestamp
  const now = new Date().toISOString();
  const userMessage = { role: "user", content, created_at: now };

  return userMessage;
};

// ========================================
// EDITING & HISTORY MANAGEMENT
// ========================================

/**
 * Handles message editing and history context preparation
 * Manages both UI state (what user sees) and API context (what gets sent to AI)
 * @param {Array} messages - Current message array
 * @param {Object} editingInfo - Information about the message being edited
 * @param {Object} userMessage - The new user message to insert
 * @returns {Object} Contains newMessages (for UI) and historyForSend (for API)
 */
const handleEditingAndHistory = (messages, editingInfo, userMessage) => {
  // Base history for context: when editing, include only messages before the edited one
  const historyForSend =
    editingInfo?.index !== undefined && editingInfo.index !== null
      ? messages.slice(0, editingInfo.index)
      : messages;

  // UI state: remove edited user message (and its paired AI answer if any), then append the new user message at the end
  let newMessages;
  if (editingInfo?.index !== undefined && editingInfo.index !== null) {
    const nextMsg = messages[editingInfo.index + 1];
    const hasAiPartner = nextMsg && nextMsg.role === "ai";
    const tailStart = editingInfo.index + 1 + (hasAiPartner ? 1 : 0);

    newMessages = [
      ...messages.slice(0, editingInfo.index),
      ...messages.slice(tailStart),
      userMessage,
    ];
  } else {
    newMessages = [...messages, userMessage];
  }

  return { newMessages, historyForSend };
};

// ========================================
// DATABASE OPERATIONS
// ========================================

/**
 * Ensures a conversation exists in the database, creating one if necessary
 * @param {string|null} conversationId - Existing conversation ID or null
 * @param {Object} settings - User settings including API provider
 * @param {Object} toggles - Feature toggles (search, thinking)
 * @param {Object} spaceInfo - Space selection information
 * @param {Function} set - Zustand set function
 * @returns {string} Conversation ID (existing or newly created)
 * @throws {Error} If conversation creation fails
 */
const ensureConversationExists = async (
  conversationId,
  settings,
  toggles,
  spaceInfo,
  set
) => {
  // If conversation already exists, return it
  if (conversationId) {
    return conversationId;
  }

  // Create new conversation payload
  const creationPayload = {
    space_id:
      spaceInfo.isManualSpaceSelection && spaceInfo.selectedSpace
        ? spaceInfo.selectedSpace.id
        : null,
    title: "New Conversation",
    api_provider: settings.apiProvider,
    is_search_enabled: toggles.search,
    is_thinking_enabled: toggles.thinking,
  };

  const { data, error } = await createConversation(creationPayload);
  if (!error && data) {
    // Update store with new conversation ID
    set({ conversationId: data.id });
    // Notify other components that conversations list changed
    window.dispatchEvent(new Event("conversations-changed"));
    return data.id;
  } else {
    console.error("Create conversation failed:", error);
    // Reset loading state on error
    set({ isLoading: false });
    throw new Error("Failed to create conversation");
  }
};

/**
 * Persists user message to database and handles editing cleanup
 * @param {string} convId - Conversation ID
 * @param {Object|null} editingInfo - Information about message being edited
 * @param {string|Array} content - Message content (text or structured with attachments)
 * @param {Function} set - Zustand set function
 */
const persistUserMessage = async (convId, editingInfo, content, set) => {
  // Handle editing: delete old messages if editing
  if (editingInfo?.index !== undefined && editingInfo.index !== null) {
    if (editingInfo.targetId) await deleteMessageById(editingInfo.targetId);
    if (editingInfo.partnerId) await deleteMessageById(editingInfo.partnerId);
  }

  // Insert the new user message into database
  const { data: insertedUser } = await addMessage({
    conversation_id: convId,
    role: "user",
    content,
    created_at: new Date().toISOString(),
  });

  // Update UI message with database ID and timestamp
  if (insertedUser) {
    set((state) => {
      const updated = [...state.messages];
      // Find the last user message without ID and update it with database info
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].role === "user" && !updated[i].id) {
          updated[i] = {
            ...updated[i],
            id: insertedUser.id,
            created_at: insertedUser.created_at,
          };
          break;
        }
      }
      return { messages: updated };
    });
  }
};

// ========================================
// AI API INTEGRATION
// ========================================

/**
 * Prepares AI message placeholder and conversation context for API call
 * @param {Array} historyForSend - Message history to send to AI
 * @param {Object} userMessage - Current user message
 * @param {Object} spaceInfo - Space selection and prompt information
 * @param {Function} set - Zustand set function
 * @returns {Object} Contains conversationMessages (for API) and aiMessagePlaceholder (for UI)
 */
const prepareAIPlaceholder = (historyForSend, userMessage, spaceInfo, set) => {
  // Build conversation base with system prompt if space is selected
  const conversationMessagesBase = spaceInfo.selectedSpace?.prompt
    ? [
        { role: "system", content: spaceInfo.selectedSpace.prompt },
        ...historyForSend,
      ]
    : historyForSend;

  // Combine base messages with user message
  const conversationMessages = [...conversationMessagesBase, userMessage];

  // Create AI message placeholder for streaming updates
  const aiMessagePlaceholder = {
    role: "ai",
    content: "",
    created_at: new Date().toISOString(),
  };

  // Add placeholder to UI
  set((state) => ({ messages: [...state.messages, aiMessagePlaceholder] }));

  return { conversationMessages, aiMessagePlaceholder };
};

/**
 * Calls AI provider API with streaming support
 * Handles chunk updates, completion, and error states
 * @param {Array} conversationMessages - Messages to send to AI
 * @param {Object} aiMessagePlaceholder - Placeholder message for streaming updates
 * @param {Object} settings - User settings and API configuration
 * @param {Object} toggles - Feature toggles (search, thinking)
 * @param {Object} callbacks - Optional callback functions for title/space generation
 * @param {Array} spaces - Available spaces for auto-generation
 * @param {Function} get - Zustand get function
 * @param {Function} set - Zustand set function
 * @param {number} historyForSendLength - Length of the history used for the API call
 * @param {string} firstUserText - Raw text of the current user message
 */
const callAIAPI = async (
  conversationMessages,
  aiMessagePlaceholder,
  settings,
  toggles,
  callbacks,
  spaces,
  get,
  set,
  historyForSendLength,
  firstUserText
) => {
  try {
    // Get AI provider and credentials
    const provider = getProvider(settings.apiProvider);
    const credentials = provider.getCredentials(settings);
    // Use dynamic model selection for main conversation
    const model = getModelForTask('streamChatCompletion', settings);

    // Prepare API parameters
    const params = {
      ...credentials,
      model,
      messages: conversationMessages.map((m) => ({
        role: m.role === "ai" ? "assistant" : m.role,
        content: m.content,
        ...(m.tool_calls && { tool_calls: m.tool_calls }),
        ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
        ...(m.name && { name: m.name }),
      })),
      tools: provider.getTools(toggles.search),
      thinking: provider.getThinking(toggles.thinking),
      onChunk: (chunk) => {
        // Handle streaming chunk updates
        set((state) => {
          const updated = [...state.messages];
          const lastMsgIndex = updated.length - 1;
          const lastMsg = { ...updated[lastMsgIndex] };

          if (typeof chunk === "object" && chunk !== null) {
            if (chunk.type === "thought") {
              lastMsg.thought = (lastMsg.thought || "") + chunk.content;
            } else if (chunk.type === "text") {
              lastMsg.content += chunk.content;
            }
          } else {
            // Fallback for string chunks
            lastMsg.content += chunk;
          }

          updated[lastMsgIndex] = lastMsg;
          return { messages: updated };
        });
      },
      onFinish: async (result) => {
        // Handle streaming completion and finalization
        set({ isLoading: false });
        const currentStore = get(); // Get fresh state
        await finalizeMessage(
          result,
          currentStore,
          settings,
          callbacks,
          spaces,
          set,
          historyForSendLength === 0,
          firstUserText
        );
      },
      onError: (err) => {
        // Handle streaming errors
        console.error("Chat error:", err);
        set({ isLoading: false });
        set((state) => {
          const updated = [...state.messages];
          const lastMsgIndex = updated.length - 1;
          if (updated[lastMsgIndex].role === "ai") {
            const lastMsg = { ...updated[lastMsgIndex] };
            lastMsg.content += `\n\n**Error:** ${err.message}`;
            lastMsg.isError = true;
            updated[lastMsgIndex] = lastMsg;
            return { messages: updated };
          }
          return {
            messages: [
              ...state.messages,
              { role: "system", content: `Error: ${err.message}` },
            ],
          };
        });
      },
    };

    await provider.streamChatCompletion(params);
  } catch (error) {
    console.error("Setup error:", error);
    set({ isLoading: false });
  }
};

/**
 * Finalizes AI message after streaming completion
 * Handles title/space generation, related questions, and database persistence
 * @param {Object} result - AI response result containing content and tool calls
 * @param {Object} currentStore - Current chat store state
 * @param {Object} settings - User settings and API configuration
 * @param {Object} callbacks - Optional callback functions for title/space generation
 * @param {Array} spaces - Available spaces for auto-generation
 * @param {Function} set - Zustand set function
 * @param {boolean} [isFirstTurnOverride] - Explicit flag indicating first turn
 * @param {string} [firstUserText] - Raw text of the initial user message
 */
const finalizeMessage = async (
  result,
  currentStore,
  settings,
  callbacks,
  spaces,
  set,
  isFirstTurnOverride,
  firstUserText
) => {
  // Generate title and space if this is the first turn
  let resolvedTitle = currentStore.conversationTitle;
  let resolvedSpace = currentStore.spaceInfo?.selectedSpace || null;

  const isFirstTurn =
    typeof isFirstTurnOverride === "boolean"
      ? isFirstTurnOverride
      : currentStore.historyForSend?.length === 0;

  const fallbackFirstUserText = (() => {
    const firstUser = currentStore?.messages?.find((m) => m.role === "user");
    if (!firstUser) return "";
    if (typeof firstUser.content === "string") return firstUser.content;
    if (Array.isArray(firstUser.content)) {
      const textPart = firstUser.content.find((c) => c.type === "text");
      return textPart?.text || "";
    }
    return "";
  })();

  const firstMessageText = firstUserText ?? fallbackFirstUserText;

  if (isFirstTurn) {
    if (
      currentStore.spaceInfo?.isManualSpaceSelection &&
      currentStore.spaceInfo?.selectedSpace
    ) {
      // Generate title only when space is manually selected
      const provider = getProvider(settings.apiProvider);
      const credentials = provider.getCredentials(settings);
      resolvedTitle = await provider.generateTitle(
        firstMessageText,
        credentials.apiKey,
        credentials.baseUrl,
        getModelForTask('generateTitle', settings)
      );
      set({ conversationTitle: resolvedTitle });
    } else if (callbacks?.onTitleAndSpaceGenerated) {
      // Use callback to generate both title and space
      const provider = getProvider(settings.apiProvider);
      const credentials = provider.getCredentials(settings);
      const { title, space } = await callbacks.onTitleAndSpaceGenerated(
        firstMessageText,
        credentials.apiKey,
        credentials.baseUrl
      );
      resolvedTitle = title;
      set({ conversationTitle: title });
      resolvedSpace = space || null;
    } else {
      // Generate both title and space automatically
      const provider = getProvider(settings.apiProvider);
      const credentials = provider.getCredentials(settings);
      const { title, space } = await provider.generateTitleAndSpace(
        firstMessageText,
        spaces || [],
        credentials.apiKey,
        credentials.baseUrl,
        getModelForTask('generateTitleAndSpace', settings) // Use the appropriate model for this task
      );
      resolvedTitle = title;
      set({ conversationTitle: title });
      resolvedSpace = space || null;
    }
  }

  // Generate related questions
  const sanitizedMessages = currentStore.messages.map((m) => ({
    role: m.role === "ai" ? "assistant" : m.role,
    content: m.content,
  }));

  const provider = getProvider(settings.apiProvider);
  const credentials = provider.getCredentials(settings);
  // Get the appropriate model for related questions task
  const model = getModelForTask('generateRelatedQuestions', settings);
  const related = await provider.generateRelatedQuestions(
    sanitizedMessages.slice(-2), // Only use the last 2 messages (User + AI) for context
    credentials.apiKey,
    credentials.baseUrl,
    model // Pass the selected model for this task
  );

  // Attach sources to the last AI message (for Gemini search)
  if (result.sources && result.sources.length > 0) {
    set((state) => {
      const updated = [...state.messages];
      const lastMsgIndex = updated.length - 1;
      if (lastMsgIndex >= 0 && updated[lastMsgIndex].role === "ai") {
        updated[lastMsgIndex] = {
          ...updated[lastMsgIndex],
          sources: result.sources,
        };
      }
      return { messages: updated };
    });
  }

  if (related && related.length > 0) {
    set((state) => {
      const updated = [...state.messages];
      const lastMsgIndex = updated.length - 1;
      const lastMsg = { ...updated[lastMsgIndex] };
      lastMsg.related = related;
      if (result.sources && result.sources.length > 0) {
        lastMsg.sources = result.sources;
      }
      if (result.groundingSupports && result.groundingSupports.length > 0) {
        lastMsg.groundingSupports = result.groundingSupports;
      }
      updated[lastMsgIndex] = lastMsg;
      return { messages: updated };
    });
  }

  // Persist AI message in database
  if (currentStore.conversationId) {
    const { data: insertedAi } = await addMessage({
      conversation_id: currentStore.conversationId,
      role: "assistant",
      content: result.content,
      tool_calls: result.toolCalls || null,
      related_questions: related || null,
      sources: result.sources || null,
      grounding_supports: result.groundingSupports || null,
      created_at: new Date().toISOString(),
    });

    if (insertedAi) {
      set((state) => {
        const updated = [...state.messages];
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].role === "ai" && !updated[i].id) {
            updated[i] = {
              ...updated[i],
              id: insertedAi.id,
              created_at: insertedAi.created_at,
            };
            break;
          }
        }
        return { messages: updated };
      });
    }
  }

  // Update conversation in database (only on first turn to set title/space)
  if (isFirstTurn && currentStore.conversationId && resolvedTitle) {
    await updateConversation(currentStore.conversationId, {
      title: resolvedTitle,
      space_id: resolvedSpace ? resolvedSpace.id : null,
    });
    window.dispatchEvent(new Event("conversations-changed"));
  }

  // Notify callback if space was resolved
  if (callbacks?.onSpaceResolved && resolvedSpace) {
    callbacks.onSpaceResolved(resolvedSpace);
  }
};

// ================================================================================
// ZUSTAND CHAT STORE
// Main store for managing chat state and message operations
// ================================================================================

const useChatStore = create((set, get) => ({
  // ========================================
  // CORE STATE
  // ========================================
  /** Array of chat messages (user + AI) */
  messages: [],
  /** Current conversation ID from database */
  conversationId: null,
  /** Title of the current conversation */
  conversationTitle: "",
  /** Loading state for ongoing operations */
  isLoading: false,

  // ========================================
  // STATE SETTERS
  // ========================================
  /** Sets messages array (supports function for updates) */
  setMessages: (messages) =>
    set((state) => ({
      messages:
        typeof messages === "function" ? messages(state.messages) : messages,
    })),
  /** Sets current conversation ID */
  setConversationId: (conversationId) => set({ conversationId }),
  /** Sets current conversation title */
  setConversationTitle: (conversationTitle) => set({ conversationTitle }),
  /** Sets loading state */
  setIsLoading: (isLoading) => set({ isLoading }),

  /** Resets conversation to initial state */
  resetConversation: () =>
    set({
      messages: [],
      conversationId: null,
      conversationTitle: "",
      isLoading: false,
    }),

  // ========================================
  // CORE CHAT OPERATIONS
  // ========================================

  /**
   * Sends a message to AI and handles the complete chat flow
   *
   * @param {Object} params - Message parameters
   * @param {string} params.text - The message text to send
   * @param {Array} params.attachments - File attachments (optional)
   * @param {Object} params.toggles - Feature toggles { search, thinking }
   * @param {Object} params.settings - User settings and API configuration
   * @param {Object} params.spaceInfo - Space selection information { selectedSpace, isManualSpaceSelection }
   * @param {Object|null} params.editingInfo - Information about message being edited { index, targetId, partnerId }
   * @param {Object|null} params.callbacks - Callback functions for title/space generation { onTitleAndSpaceGenerated, onSpaceResolved }
   * @param {Array} params.spaces - Available spaces for auto-generation (optional)
   *
   * @returns {Promise<void>}
   *
   * Process:
   * 1. Validates input and checks for ongoing operations
   * 2. Constructs user message with attachments
   * 3. Handles message editing and history context
   * 4. Ensures conversation exists in database
   * 5. Persists user message
   * 6. Prepares AI message placeholder for streaming
   * 7. Calls AI API with streaming support
   * 8. Handles response finalization (title, space, related questions)
   */
  sendMessage: async ({
    text,
    attachments,
    toggles, // { search, thinking }
    settings, // passed from component to ensure freshness
    spaceInfo, // { selectedSpace, isManualSpaceSelection }
    editingInfo, // { index, targetId, partnerId } (optional)
    callbacks, // { onTitleAndSpaceGenerated, onSpaceResolved } (optional)
    spaces = [], // passed from component
  }) => {
    const { messages, conversationId, isLoading } = get();

    // ========================================
    // MESSAGE SENDING PIPELINE
    // ========================================

    // Step 1: Input Validation
    const validation = validateInput(text, attachments, isLoading);
    if (!validation.isValid) {
      return; // Exit early if validation fails
    }

    set({ isLoading: true });

    // Step 2: Construct User Message
    const userMessage = buildUserMessage(text, attachments);

    // Step 3: Handle Editing & History
    const { newMessages, historyForSend } = handleEditingAndHistory(
      messages,
      editingInfo,
      userMessage
    );
    set({ messages: newMessages });

    // Step 4: Ensure Conversation Exists
    let convId;
    try {
      convId = await ensureConversationExists(
        conversationId,
        settings,
        toggles,
        spaceInfo,
        set
      );
    } catch (convError) {
      return; // Early return on conversation creation failure
    }

    // Step 5: Persist User Message
    if (convId) {
      await persistUserMessage(convId, editingInfo, userMessage.content, set);
    }

    // Step 6: Prepare AI Placeholder
    const { conversationMessages, aiMessagePlaceholder } = prepareAIPlaceholder(
      historyForSend,
      userMessage,
      spaceInfo,
      set
    );

    // Step 7: Call API & Stream
    await callAIAPI(
      conversationMessages,
      aiMessagePlaceholder,
      settings,
      toggles,
      callbacks,
      spaces,
      get,
      set,
      historyForSend.length,
      text
    );
  },
}));

export default useChatStore;
