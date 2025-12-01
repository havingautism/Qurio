import React, { useState, useRef, useEffect, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import useChatStore from "../lib/chatStore";
import MessageList from "./MessageList";
import QuestionNavigator from "./QuestionNavigator";
import {
  Paperclip,
  ArrowRight,
  Globe,
  Layers,
  ChevronDown,
  Check,
  X,
  LayoutGrid,
} from "lucide-react";

import { loadSettings } from "../lib/settings";
import { listMessages } from "../lib/conversationsService";

const ChatInterface = ({
  spaces = [],
  activeConversation = null,
  initialMessage = "",
  initialAttachments = [],
  initialToggles = {},
  initialSpaceSelection = { mode: "auto", space: null },
  onTitleAndSpaceGenerated,
}) => {
  const {
    messages,
    setMessages,
    conversationId,
    setConversationId,
    conversationTitle,
    setConversationTitle,
    isLoading,
    setIsLoading,
    sendMessage,
  } = useChatStore(
    useShallow((state) => ({
      messages: state.messages,
      setMessages: state.setMessages,
      conversationId: state.conversationId,
      setConversationId: state.setConversationId,
      conversationTitle: state.conversationTitle,
      setConversationTitle: state.setConversationTitle,
      isLoading: state.isLoading,
      setIsLoading: state.setIsLoading,
      sendMessage: state.sendMessage,
    }))
  );

  const [input, setInput] = useState("");

  // New state for toggles and attachments
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isThinkingActive, setIsThinkingActive] = useState(false);
  const [attachments, setAttachments] = useState([]);

  const inputRef = useRef("");
  const attachmentsRef = useRef([]);

  // Sync refs with state
  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  const [selectedSpace, setSelectedSpace] = useState(
    initialSpaceSelection.mode === "manual" ? initialSpaceSelection.space : null
  );
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const selectorRef = useRef(null);
  const [isManualSpaceSelection, setIsManualSpaceSelection] = useState(
    initialSpaceSelection.mode === "manual" && !!initialSpaceSelection.space
  );

  const [settings, setSettings] = useState(loadSettings());
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const hasPushedConversation = useRef(false);
  const messageRefs = useRef({});
  const conversationSpace = React.useMemo(() => {
    if (!activeConversation?.space_id) return null;
    const sid = String(activeConversation.space_id);
    return spaces.find((s) => String(s.id) === sid) || null;
  }, [activeConversation?.space_id, spaces]);

  // If user has manually selected a space (or None), use that; otherwise use conversation's space
  const displaySpace = isManualSpaceSelection
    ? selectedSpace
    : selectedSpace || conversationSpace || null;

  // Effect to handle initial message from homepage
  const hasInitialized = useRef(false);
  const isProcessingInitial = useRef(false);

  useEffect(() => {
    const handleSettingsChange = () => {
      setSettings(loadSettings());
      if (settings.apiProvider === "openai_compatibility") {
        setIsSearchActive(false);
      }
    };

    window.addEventListener("settings-changed", handleSettingsChange);
    return () =>
      window.removeEventListener("settings-changed", handleSettingsChange);
  }, []);

  useEffect(() => {
    const processInitialMessage = async () => {
      // Prevent multiple initializations and ensure we have content to process
      if (
        hasInitialized.current ||
        isProcessingInitial.current ||
        (!initialMessage && initialAttachments.length === 0) ||
        conversationId || // Already have a conversation, don't create new one
        activeConversation?.id // If an existing conversation is provided, skip auto-send
      ) {
        return;
      }

      isProcessingInitial.current = true;
      hasInitialized.current = true;

      // Set initial state
      // Set initial state
      if (initialToggles.search) setIsSearchActive(true);
      if (initialToggles.thinking) setIsThinkingActive(true);

      // Trigger send immediately
      await handleSendMessage(
        initialMessage,
        initialAttachments,
        initialToggles
      );
      isProcessingInitial.current = false;
    };

    processInitialMessage();
  }, [
    initialMessage,
    initialAttachments,
    initialToggles,
    conversationId,
    activeConversation?.id,
  ]);

  // Load existing conversation messages when switching conversations
  useEffect(() => {
    const loadHistory = async () => {
      if (!activeConversation?.id) {
        // If we're in a brand new chat kicked off from the home input, avoid clearing the
        // just-added first message bubble.
        if (
          hasInitialized.current ||
          initialMessage ||
          initialAttachments.length > 0
        ) {
          return;
        }
        setConversationId(null);
        setConversationTitle("");
        setMessages([]);
        setSelectedSpace(null);
        setIsManualSpaceSelection(false);
        return;
      }

      // Reset hasInitialized when loading an existing conversation
      hasInitialized.current = false;

      setIsLoadingHistory(true);
      setConversationId(activeConversation.id);
      setConversationTitle(activeConversation.title || "New Conversation");
      setSelectedSpace(conversationSpace);
      setIsManualSpaceSelection(!!conversationSpace);
      const { data, error } = await listMessages(activeConversation.id);
      if (!error && data) {
        const mapped = data.map((m) => ({
          id: m.id,
          created_at: m.created_at,
          role: m.role === "assistant" ? "ai" : m.role,
          content: m.content,
          related: m.related_questions || undefined,
          tool_calls: m.tool_calls || undefined,
        }));
        setMessages(mapped);
      } else {
        console.error("Failed to load conversation messages:", error);
        setMessages([]);
      }
      setIsLoadingHistory(false);
    };
    loadHistory();
  }, [activeConversation, conversationSpace]);

  useEffect(() => {
    if (
      conversationId &&
      !activeConversation?.id &&
      !hasPushedConversation.current
    ) {
      window.history.pushState(null, "", `/conversation/${conversationId}`);
      hasPushedConversation.current = true;
    }
  }, [conversationId, activeConversation]);

  useEffect(() => {
    if (
      initialSpaceSelection?.mode === "manual" &&
      initialSpaceSelection.space
    ) {
      setSelectedSpace(initialSpaceSelection.space);
      setIsManualSpaceSelection(true);
    } else if (initialSpaceSelection?.mode === "auto") {
      setSelectedSpace(null);
      setIsManualSpaceSelection(false);
    }
  }, [initialSpaceSelection]);

  // Handle click outside to close selector
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (selectorRef.current && !selectorRef.current.contains(event.target)) {
        setIsSelectorOpen(false);
      }
    };

    if (isSelectorOpen) {
      document.addEventListener("click", handleClickOutside);
    }

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [isSelectorOpen]);

  const handleSelectSpace = (space) => {
    setSelectedSpace(space);
    setIsManualSpaceSelection(true);
    setIsSelectorOpen(false);
    if (conversationId || activeConversation?.id) {
      updateConversation(conversationId || activeConversation.id, {
        space_id: space?.id || null,
      })
        .then(() => {
          // Trigger event to refresh sidebar
          window.dispatchEvent(new Event("conversations-changed"));
        })
        .catch((err) =>
          console.error("Failed to update conversation space:", err)
        );
    }
  };

  const handleClearSpaceSelection = () => {
    setSelectedSpace(null);
    setIsManualSpaceSelection(true); // Keep as true because selecting "None" is a manual action
    setIsSelectorOpen(false);
    if (conversationId || activeConversation?.id) {
      updateConversation(conversationId || activeConversation.id, {
        space_id: null,
      })
        .then(() => {
          // Trigger event to refresh sidebar
          window.dispatchEvent(new Event("conversations-changed"));
        })
        .catch((err) =>
          console.error("Failed to clear conversation space:", err)
        );
    }
  };

  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    files.forEach((file) => {
      if (!file.type.startsWith("image/")) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        setAttachments((prev) => [
          ...prev,
          {
            type: "image_url",
            image_url: { url: e.target.result },
          },
        ]);
      };
      reader.readAsDataURL(file);
    });

    // Reset input
    e.target.value = "";
  };

  const handleFileUpload = () => {
    fileInputRef.current?.click();
  };

  const registerMessageRef = useCallback((id, msg, el) => {
    if (el) {
      messageRefs.current[id] = el;
    } else {
      delete messageRefs.current[id];
    }
  }, []);

  const jumpToMessage = (id) => {
    const node = messageRefs.current[id];
    if (!node) return;

    // Calculate position with offset for sticky header
    const yOffset = -100; // Adjust based on your header height
    const y = node.getBoundingClientRect().top + window.pageYOffset + yOffset;

    window.scrollTo({ top: y, behavior: "smooth" });
  };

  const extractUserQuestion = (msg) => {
    if (!msg) return "";
    if (typeof msg.content === "string") return msg.content;
    if (Array.isArray(msg.content)) {
      const textPart = msg.content.find((c) => c.type === "text");
      return textPart?.text || "";
    }
    return "";
  };

  const [activeQuestionId, setActiveQuestionId] = useState(null);

  useEffect(() => {
    const observerCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.1) {
          // When a message comes into view, check if it's a user message (question)
          // or if it belongs to a question block.
          // Since we want to highlight the question even when reading the answer,
          // we need to find the closest preceding question.

          const id = entry.target.id; // message-0, message-1, etc.
          if (!id) return;

          const index = parseInt(id.replace("message-", ""), 10);
          if (isNaN(index)) return;

          // Find the question for this message
          // If this message is a user message, it IS the question.
          // If it's an AI message, the question is likely index - 1.
          const message = messages[index];
          if (!message) return;

          let targetQuestionId = null;
          if (message.role === "user") {
            targetQuestionId = id;
          } else if (index > 0 && messages[index - 1].role === "user") {
            targetQuestionId = `message-${index - 1}`;
          }

          if (targetQuestionId) {
            setActiveQuestionId(targetQuestionId);
          }
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, {
      root: null,
      rootMargin: "-10% 0px -60% 0px", // Trigger when element is near the top
      threshold: [0.1],
    });

    Object.values(messageRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [messages]);

  const questionNavItems = React.useMemo(
    () =>
      messages
        .map((msg, idx) => {
          if (msg.role !== "user") return null;
          const text = extractUserQuestion(msg).trim();
          if (!text) return null;
          return {
            id: `message-${idx}`,
            index: idx + 1,
            label: text.length > 120 ? `${text.slice(0, 117)}...` : text,
          };
        })
        .filter(Boolean),
    [messages]
  );

  // State to track if we are editing a message
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingTargetTimestamp, setEditingTargetTimestamp] = useState(null);
  const [editingPartnerTimestamp, setEditingPartnerTimestamp] = useState(null);
  const [editingTargetId, setEditingTargetId] = useState(null);
  const [editingPartnerId, setEditingPartnerId] = useState(null);
  const textareaRef = useRef(null);

  const handleEdit = useCallback(
    (index) => {
      const msg = messages[index];
      if (!msg) return;

      // Extract content and attachments
      const text = extractUserQuestion(msg);

      let msgAttachments = [];
      if (Array.isArray(msg.content)) {
        msgAttachments = msg.content.filter((c) => c.type === "image_url");
      }

      setInput(text);
      setAttachments(msgAttachments);
      setEditingIndex(index);
      setEditingTargetTimestamp(msg.created_at || null);
      setEditingTargetId(msg.id || null);
      const nextMsg = messages[index + 1];
      const hasPartner = nextMsg && nextMsg.role === "ai";
      setEditingPartnerTimestamp(
        hasPartner ? nextMsg.created_at || null : null
      );
      setEditingPartnerId(hasPartner ? nextMsg.id || null : null);

      // Focus input
      if (textareaRef.current) textareaRef.current.focus();
    },
    [messages]
  );

  const handleSendMessage = useCallback(
    async (
      msgOverride = null,
      attOverride = null,
      togglesOverride = null,
      { skipMeta = false } = {}
    ) => {
      const textToSend = msgOverride !== null ? msgOverride : inputRef.current;
      const attToSend =
        attOverride !== null ? attOverride : attachmentsRef.current;
      const searchActive = togglesOverride
        ? togglesOverride.search
        : isSearchActive;
      const thinkingActive = togglesOverride
        ? togglesOverride.thinking
        : isThinkingActive;

      if (!textToSend.trim() && attToSend.length === 0) return;
      if (isLoading) return;

      // Clear input immediately if manual send
      if (msgOverride === null) {
        setInput("");
        setAttachments([]);
      }

      const editingInfo =
        editingIndex !== null
          ? {
              index: editingIndex,
              targetId: editingTargetId,
              partnerId: editingPartnerId,
            }
          : null;

      // Reset editing state
      setEditingIndex(null);
      setEditingTargetTimestamp(null);
      setEditingPartnerTimestamp(null);
      setEditingTargetId(null);
      setEditingPartnerId(null);

      await sendMessage({
        text: textToSend,
        attachments: attToSend,
        toggles: { search: searchActive, thinking: thinkingActive },
        settings,
        spaceInfo: { selectedSpace, isManualSpaceSelection },
        editingInfo,
        callbacks: {
          onTitleAndSpaceGenerated,
          onSpaceResolved: (space) => {
            setSelectedSpace(space);
            setIsManualSpaceSelection(false);
          },
        },
        spaces,
      });
    },
    [
      isSearchActive,
      isThinkingActive,
      isLoading,
      editingIndex,
      editingTargetId,
      editingPartnerId,
      sendMessage,
      settings,
      selectedSpace,
      isManualSpaceSelection,
      onTitleAndSpaceGenerated,
      spaces,
    ]
  );

  const handleRelatedClick = useCallback(
    (q) => handleSendMessage(q, null, null, { skipMeta: true }),
    [handleSendMessage]
  );

  return (
    <div className="flex-1 min-h-screen bg-background text-foreground relative p-4 ml-16">
      <div className="w-full max-w-6xl mx-auto flex flex-col xl:flex-row gap-6 xl:gap-8 items-start">
        <div className="flex-1 min-w-0 flex flex-col items-center">
          {/* Title Bar */}
          <div className="sticky top-0 z-20 w-full max-w-3xl bg-background/80 backdrop-blur-md py-4 mb-4 border-b border-transparent transition-all flex items-center gap-4">
            {/* Space Selector */}
            <div className="relative" ref={selectorRef}>
              <button
                onClick={() => setIsSelectorOpen(!isSelectorOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <LayoutGrid size={16} className="text-gray-400" />
                {displaySpace ? (
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{displaySpace.emoji}</span>
                    <span className="truncate max-w-[120px]">
                      {displaySpace.label}
                    </span>
                  </div>
                ) : (
                  <span className="text-gray-500">Spaces: None</span>
                )}
                <ChevronDown size={14} className="text-gray-400" />
              </button>

              {/* Dropdown */}
              {isSelectorOpen && (
                <div className="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-[#202222] border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl z-30 overflow-hidden">
                  <div className="p-2 flex flex-col gap-1">
                    <button
                      onClick={handleClearSpaceSelection}
                      className={`flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left ${
                        !displaySpace
                          ? "text-cyan-500"
                          : "text-gray-700 dark:text-gray-200"
                      }`}
                    >
                      <span className="text-sm font-medium">None</span>
                      {!displaySpace && (
                        <Check size={14} className="text-cyan-500" />
                      )}
                    </button>
                    <div className="h-px bg-gray-100 dark:bg-zinc-800 my-1" />
                    {spaces.map((space, idx) => {
                      const isSelected = selectedSpace?.label === space.label;
                      return (
                        <button
                          key={idx}
                          onClick={() => handleSelectSpace(space)}
                          className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg">{space.emoji}</span>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                              {space.label}
                            </span>
                          </div>
                          {isSelected && (
                            <Check size={14} className="text-cyan-500" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <h1 className="text-xl font-medium text-gray-800 dark:text-gray-100 truncate flex-1">
              {conversationTitle || "New Conversation"}
            </h1>
          </div>

          {/* Messages Area */}
          <div className="w-full max-w-3xl flex-1 pb-32 relative">
            <MessageList
              messages={messages}
              apiProvider={settings.apiProvider}
              onRelatedClick={handleRelatedClick}
              onMessageRef={registerMessageRef}
              onEdit={handleEdit}
            />

            {/* Absolute positioned navigator */}
            <div className="absolute top-0 left-full h-full">
              <QuestionNavigator
                items={questionNavItems}
                onJump={jumpToMessage}
                activeId={activeQuestionId}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Input Area */}
      <div className="fixed bottom-0 left-16 right-0 bg-gradient-to-t from-background via-background to-transparent pb-6 pt-10 px-4 flex justify-center z-10">
        <div className="w-full max-w-3xl relative group">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 via-blue-500/15 to-purple-500/20 rounded-xl blur-2xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-500 pointer-events-none" />
          <div className="relative bg-gray-100 dark:bg-zinc-800 border border-transparent focus-within:border-gray-300 dark:focus-within:border-zinc-600 rounded-xl transition-all duration-300 p-3 shadow-sm hover:shadow-lg group-hover:shadow-lg focus-within:shadow-xl">
            {/* Edit Context Banner */}
            {editingIndex !== null && messages[editingIndex] && (
              <div className="flex items-center justify-between bg-gray-200 dark:bg-zinc-700/50 rounded-lg px-3 py-2 mb-2 ">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wide">
                      Editing
                    </span>
                    <span className="text-sm text-gray-600 dark:text-gray-300 truncate max-w-[200px] md:max-w-md">
                      {extractUserQuestion(messages[editingIndex])}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setEditingIndex(null)}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors rounded-full hover:bg-gray-300 dark:hover:bg-zinc-600"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {attachments.length > 0 && (
              <div className="flex gap-2 mb-3 px-1 overflow-x-auto py-1">
                {attachments.map((att, idx) => (
                  <div key={idx} className="relative group shrink-0">
                    <div className="w-16 h-16 rounded-xl overflow-hidden border border-gray-200 dark:border-zinc-700 shadow-sm">
                      <img
                        src={att.image_url.url}
                        alt="attachment"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <button
                      onClick={() =>
                        setAttachments(attachments.filter((_, i) => i !== idx))
                      }
                      className="absolute -top-1.5 -right-1.5 bg-gray-900 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              value={input}
              ref={textareaRef}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Ask follow-up..."
              className="w-full bg-transparent border-none outline-none resize-none text-base placeholder-gray-500 dark:placeholder-gray-400 min-h-[44px] max-h-[200px] py-2"
              rows={1}
            />

            <div className="flex justify-between items-center mt-2">
              <div className="flex gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  multiple
                  className="hidden"
                />
                <button
                  onClick={handleFileUpload}
                  className={`p-2 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${
                    attachments.length > 0
                      ? "text-cyan-500"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  <Paperclip size={18} />
                </button>
                <button
                  disabled={settings.apiProvider === "openai_compatibility"}
                  onClick={() => setIsSearchActive(!isSearchActive)}
                  className={`p-2 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${
                    isSearchActive
                      ? "text-cyan-500 bg-gray-200 dark:bg-zinc-700"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  <Globe size={18} />
                  <span>Search</span>
                </button>
                <button
                  onClick={() => setIsThinkingActive(!isThinkingActive)}
                  className={`p-2 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${
                    isThinkingActive
                      ? "text-cyan-500 bg-gray-200 dark:bg-zinc-700"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  <Layers size={18} />
                  <span>Think</span>
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleSendMessage()}
                  disabled={
                    isLoading || (!input.trim() && attachments.length === 0)
                  }
                  className="p-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-full transition-colors disabled:opacity-50  disabled:hover:bg-cyan-500"
                >
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          </div>
          <div className="text-center mt-2 text-xs text-gray-400 dark:text-gray-500">
            Limpidity can make mistakes. Please use with caution.
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
