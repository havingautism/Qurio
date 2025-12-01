import { create } from "zustand";
import {
  createConversation,
  addMessage,
  updateConversation,
} from "../lib/conversationsService";
import { deleteMessageById } from "../lib/supabase";
import { getProvider } from "../lib/providers";
import { loadSettings } from "../lib/settings";

const useChatStore = create((set, get) => ({
  // Core Data State
  messages: [],
  conversationId: null,
  conversationTitle: "",
  isLoading: false,

  // Actions
  setMessages: (messages) =>
    set((state) => ({
      messages:
        typeof messages === "function" ? messages(state.messages) : messages,
    })),
  setConversationId: (conversationId) => set({ conversationId }),
  setConversationTitle: (conversationTitle) => set({ conversationTitle }),
  setIsLoading: (isLoading) => set({ isLoading }),

  // Helper to reset conversation
  resetConversation: () =>
    set({
      messages: [],
      conversationId: null,
      conversationTitle: "",
      isLoading: false,
    }),

  // Core Logic: Send Message
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
    const { messages, conversationId, conversationTitle } = get();

    // 1. Validation
    if (!text.trim() && attachments.length === 0) return;
    if (get().isLoading) return;

    set({ isLoading: true });

    // 2. Construct User Message
    let content = text;
    if (attachments.length > 0) {
      content = [{ type: "text", text }, ...attachments];
    }

    const now = new Date().toISOString();
    const userMessage = { role: "user", content, created_at: now };

    // 3. Handle Editing & History
    // Base history for context: when editing, include only messages before the edited one
    const historyForSend =
      editingInfo?.index !== undefined && editingInfo.index !== null
        ? messages.slice(0, editingInfo.index)
        : messages;

    // UI state: remove the edited user message (and its paired AI answer if any), then append the new user message at the end
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

    set({ messages: newMessages });

    // 4. Ensure Conversation Exists
    let convId = conversationId;
    if (!convId) {
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
        convId = data.id;
        set({ conversationId: data.id });
        window.dispatchEvent(new Event("conversations-changed"));
      } else {
        console.error("Create conversation failed:", error);
        set({ isLoading: false });
        return;
      }
    }

    // 5. Persist User Message
    if (convId) {
      // If editing, delete old messages
      if (editingInfo?.index !== undefined && editingInfo.index !== null) {
        if (editingInfo.targetId) await deleteMessageById(editingInfo.targetId);
        if (editingInfo.partnerId)
          await deleteMessageById(editingInfo.partnerId);
      }

      const { data: insertedUser } = await addMessage({
        conversation_id: convId,
        role: "user",
        content,
        created_at: new Date().toISOString(),
      });

      if (insertedUser) {
        set((state) => {
          const updated = [...state.messages];
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
    }

    // 6. Prepare AI Placeholder
    const conversationMessagesBase = spaceInfo.selectedSpace?.prompt
      ? [
          { role: "system", content: spaceInfo.selectedSpace.prompt },
          ...historyForSend,
        ]
      : historyForSend;

    const conversationMessages = [...conversationMessagesBase, userMessage];

    const aiMessagePlaceholder = {
      role: "ai",
      content: "",
      created_at: new Date().toISOString(),
    };
    set((state) => ({ messages: [...state.messages, aiMessagePlaceholder] }));

    // 7. Call API & Stream
    try {
      const provider = getProvider(settings.apiProvider);
      const credentials = provider.getCredentials(settings);
      const model = "gemini-2.5-flash"; // Hardcoded in original, maybe should be dynamic?

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
          set((state) => {
            const updated = [...state.messages];
            const lastMsgIndex = updated.length - 1;
            const lastMsg = { ...updated[lastMsgIndex] };
            lastMsg.content += chunk;
            updated[lastMsgIndex] = lastMsg;
            return { messages: updated };
          });
        },
        onFinish: async (result) => {
          set({ isLoading: false });
          const currentStore = get(); // Get fresh state

          let resolvedTitle = currentStore.conversationTitle;
          let resolvedSpace = spaceInfo.selectedSpace;

          // Generate Title (and Space if auto)
          // Note: In original code, this check was `messages.length === 0`.
          // But here `messages` already has the new user message and AI placeholder.
          // The original check `messages.length === 0` was likely on the *previous* messages state before send.
          // However, since we are in `onFinish`, `messages` definitely has content.
          // The intention is likely "if this is the first turn".
          // We can check if `historyForSend` is empty.

          const isFirstTurn = historyForSend.length === 0;

          if (isFirstTurn) {
            if (spaceInfo.isManualSpaceSelection && spaceInfo.selectedSpace) {
              resolvedTitle = await provider.generateTitle(
                text,
                credentials.apiKey,
                credentials.baseUrl
              );
              set({ conversationTitle: resolvedTitle });
            } else {
              if (callbacks?.onTitleAndSpaceGenerated) {
                const { title, space } =
                  await callbacks.onTitleAndSpaceGenerated(
                    text,
                    credentials.apiKey,
                    credentials.baseUrl
                  );
                resolvedTitle = title;
                set({ conversationTitle: title });
                resolvedSpace = space || null;
                // Note: We can't update local state `selectedSpace` from here directly.
                // The component should listen to store changes or we return this info?
                // Actually, we update the conversation in DB, so next load will be correct.
                // But for immediate UI update, we might need to update store if we moved selectedSpace to store.
                // Since selectedSpace is LOCAL, we can't update it here easily.
                // This is a limitation of keeping selectedSpace local.
                // However, we can dispatch an event or rely on the component to refetch/update.
                // Or, better: `sendMessage` returns the resolved space?
              } else {
                const { title, space } = await provider.generateTitleAndSpace(
                  text,
                  spaces || [],
                  credentials.apiKey,
                  credentials.baseUrl
                );
                // Similar issue with spaces not being in store.
                // For now, let's assume we might skip auto-space if not passed, or we need to pass spaces to sendMessage.
                resolvedTitle = title;
                set({ conversationTitle: title });
                resolvedSpace = space || null;
              }
            }
          }

          // Generate Related Questions
          const sanitizedMessages = currentStore.messages.map((m) => ({
            role: m.role === "ai" ? "assistant" : m.role,
            content: m.content,
          }));

          const related = await provider.generateRelatedQuestions(
            [
              ...sanitizedMessages, // This includes the just-finished AI message
            ],
            credentials.apiKey,
            credentials.baseUrl
          );

          if (related && related.length > 0) {
            set((state) => {
              const updated = [...state.messages];
              const lastMsgIndex = updated.length - 1;
              const lastMsg = { ...updated[lastMsgIndex] };
              lastMsg.related = related;
              updated[lastMsgIndex] = lastMsg;
              return { messages: updated };
            });
          }

          // Persist Assistant Message
          if (convId) {
            const { data: insertedAi } = await addMessage({
              conversation_id: convId,
              role: "assistant",
              content: result.content,
              tool_calls: result.toolCalls || null,
              related_questions: related || null,
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

          // Update conversation title/space in DB
          if (convId && resolvedTitle) {
            await updateConversation(convId, {
              title: resolvedTitle,
              space_id: resolvedSpace ? resolvedSpace.id : null,
            });
            window.dispatchEvent(new Event("conversations-changed"));

            // If we resolved a space, we might want to return it so the component can update its local state
            if (callbacks?.onSpaceResolved) {
              callbacks.onSpaceResolved(resolvedSpace);
            }
          }
        },
        onError: (err) => {
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
  },
}));

export default useChatStore;
