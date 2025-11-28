import React, { useState, useRef, useEffect } from 'react';
import MessageList from './MessageList';
import { Paperclip, ArrowRight, Mic, Globe, Layers, ChevronDown, Check } from 'lucide-react';
import { streamChatCompletion } from '../lib/openai';

const ChatInterface = ({ spaces = [], initialMessage = '', initialAttachments = [], initialToggles = {}, onTitleAndSpaceGenerated }) => {
  const [input, setInput] = useState('');
  const [selectedSpaces, setSelectedSpaces] = useState([]);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const selectorRef = useRef(null);

  // New state for toggles and attachments
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isThinkingActive, setIsThinkingActive] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationTitle, setConversationTitle] = useState('');

  // Effect to handle initial message from homepage
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!hasInitialized.current && (initialMessage || initialAttachments.length > 0)) {
      hasInitialized.current = true;
      // Set initial state
      if (initialToggles.search) setIsSearchActive(true);
      if (initialToggles.thinking) setIsThinkingActive(true);

      // Trigger send immediately
      handleSendMessage(initialMessage, initialAttachments, initialToggles);
    }
  }, [initialMessage, initialAttachments, initialToggles]);

  // Initialize selectedSpaces with the first space if available, or none
  useEffect(() => {
    if (spaces.length > 0 && selectedSpaces.length === 0) {
      // Optional: Default to first space or keep empty
      // setSelectedSpaces([spaces[0]]); 
    }
  }, [spaces]);

  // Handle click outside to close selector
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (selectorRef.current && !selectorRef.current.contains(event.target)) {
        setIsSelectorOpen(false);
      }
    };

    if (isSelectorOpen) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isSelectorOpen]);

  const toggleSpaceSelection = (space) => {
    if (selectedSpaces.find(s => s.label === space.label)) {
      setSelectedSpaces(selectedSpaces.filter(s => s.label !== space.label));
    } else {
      setSelectedSpaces([...selectedSpaces, space]);
    }
  };

  const handleFileUpload = () => {
    const url = prompt("Enter image URL for testing:");
    if (url) {
      setAttachments(prev => [...prev, { type: 'image_url', image_url: { url } }]);
    }
  };

  const handleSendMessage = async (msgOverride = null, attOverride = null, togglesOverride = null) => {
    const textToSend = msgOverride !== null ? msgOverride : input;
    const attToSend = attOverride !== null ? attOverride : attachments;
    const searchActive = togglesOverride ? togglesOverride.search : isSearchActive;
    const thinkingActive = togglesOverride ? togglesOverride.thinking : isThinkingActive;

    if (!textToSend.trim() && attToSend.length === 0) return;
    if (isLoading) return;

    setIsLoading(true);

    // Clear input immediately if manual send
    if (msgOverride === null) {
      setInput('');
      setAttachments([]);
    }

    // 1. Construct User Message
    let content = textToSend;
    if (attToSend.length > 0) {
      content = [
        { type: 'text', text: textToSend },
        ...attToSend
      ];
    }

    const userMessage = { role: 'user', content };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);

    // 2. Prepare AI Placeholder
    const aiMessagePlaceholder = { role: 'ai', content: '' };
    setMessages(prev => [...prev, aiMessagePlaceholder]);

    try {
      const apiKey = localStorage.getItem('openai_api_key') || import.meta.env.VITE_OPENAI_API_KEY || '';
      // FORCE PROXY: Use absolute local URL to satisfy OpenAI SDK validation
      const baseUrl = `${window.location.origin}/api/gemini/`;
      const model = 'gemini-2.5-flash'; // Reverting to known working model, user had 2.5 which might be invalid

      await streamChatCompletion({
        apiKey,
        baseUrl,
        model: model,
        messages: newMessages.map(m => ({
          role: m.role === 'ai' ? 'assistant' : m.role,
          content: m.content,
          // Only include standard OpenAI fields
          ...(m.tool_calls && { tool_calls: m.tool_calls }),
          ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
          ...(m.name && { name: m.name })
        })),
        tools: searchActive ? [{ type: 'function', function: { name: 'google_search', description: 'Search the web', parameters: { type: 'object', properties: { query: { type: 'string' } } } } }] : undefined,
        thinking: thinkingActive ? {
          extra_body: {
            "google": {
              "thinking_config": {
                "thinking_budget": 1024, // Using standard token count field
                "include_thoughts": true
              }
            }
          }
        } : undefined,
        onChunk: (chunk) => {
          setMessages(prev => {
            const updated = [...prev];
            const lastMsgIndex = updated.length - 1;
            const lastMsg = { ...updated[lastMsgIndex] };
            lastMsg.content += chunk;
            updated[lastMsgIndex] = lastMsg;
            return updated;
          });
        },
        onFinish: async (result) => {
          setIsLoading(false);

          // Generate Title and Space if first message
          if (messages.length === 0) {
            if (onTitleAndSpaceGenerated) {
              const { title, space } = await onTitleAndSpaceGenerated(textToSend, apiKey, baseUrl);
              setConversationTitle(title);
              if (space) {
                setSelectedSpaces([space]);
              }
            } else {
              // Fallback if prop not provided
              import('../lib/openai').then(async ({ generateTitle }) => {
                const title = await generateTitle(textToSend, apiKey, baseUrl);
                setConversationTitle(title);
              });
            }
          }

          // Generate Related Questions
          import('../lib/openai').then(async ({ generateRelatedQuestions }) => {
            const sanitizedMessages = newMessages.map(m => ({
              role: m.role === 'ai' ? 'assistant' : m.role,
              content: m.content
            }));
            const related = await generateRelatedQuestions([...sanitizedMessages, { role: 'assistant', content: result.content }], apiKey, baseUrl);
            if (related && related.length > 0) {
              setMessages(prev => {
                const updated = [...prev];
                const lastMsgIndex = updated.length - 1;
                const lastMsg = { ...updated[lastMsgIndex] };
                lastMsg.related = related;
                updated[lastMsgIndex] = lastMsg;
                return updated;
              });
            }
          });
        },
        onError: (err) => {
          console.error("Chat error:", err);
          setIsLoading(false);
          setMessages(prev => {
            const updated = [...prev];
            const lastMsgIndex = updated.length - 1;
            // Check if the last message is the AI placeholder (empty or partial)
            if (updated[lastMsgIndex].role === 'ai') {
              const lastMsg = { ...updated[lastMsgIndex] };
              lastMsg.content += `\n\n**Error:** ${err.message}`;
              lastMsg.isError = true;
              updated[lastMsgIndex] = lastMsg;
              return updated;
            }
            // Fallback if something weird happened
            return [...prev, { role: 'system', content: `Error: ${err.message}` }];
          });
        }
      });
    } catch (error) {
      console.error("Setup error:", error);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 min-h-screen bg-background text-foreground flex flex-col items-center relative p-4 ml-16">

      {/* Title Bar */}
      <div className="sticky top-0 z-20 w-full max-w-3xl bg-background/80 backdrop-blur-md py-4 mb-4 border-b border-transparent transition-all flex items-center gap-4">

        {/* Space Selector */}
        <div className="relative" ref={selectorRef}>
          <button
            onClick={() => setIsSelectorOpen(!isSelectorOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {selectedSpaces.length > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-lg">{selectedSpaces[0].emoji}</span>
                <span className="truncate max-w-[100px]">{selectedSpaces[0].label}</span>
                {selectedSpaces.length > 1 && (
                  <span className="text-xs text-gray-500">+{selectedSpaces.length - 1}</span>
                )}
              </div>
            ) : (
              <span className="text-gray-500">Select Space</span>
            )}
            <ChevronDown size={14} className="text-gray-400" />
          </button>

          {/* Dropdown */}
          {isSelectorOpen && (
            <div className="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-[#202222] border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl z-30 overflow-hidden">
              <div className="p-2 flex flex-col gap-1">
                {spaces.map((space, idx) => {
                  const isSelected = selectedSpaces.some(s => s.label === space.label);
                  return (
                    <button
                      key={idx}
                      onClick={() => toggleSpaceSelection(space)}
                      className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{space.emoji}</span>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{space.label}</span>
                      </div>
                      {isSelected && <Check size={14} className="text-cyan-500" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <h1 className="text-xl font-medium text-gray-800 dark:text-gray-100 truncate flex-1">
          {conversationTitle || 'New Conversation'}
        </h1>
      </div>

      {/* Messages Area */}
      <div className="w-full max-w-3xl flex-1 pb-32">
        <MessageList messages={messages} />
      </div>

      {/* Sticky Input Area */}
      <div className="fixed bottom-0 left-16 right-0 bg-gradient-to-t from-background via-background to-transparent pb-6 pt-10 px-4 flex justify-center z-10">
        <div className="w-full max-w-3xl relative">
          <div className="relative bg-gray-100 dark:bg-zinc-800 border border-transparent focus-within:border-gray-300 dark:focus-within:border-zinc-600 rounded-xl transition-all duration-300 p-3">
            {attachments.length > 0 && (
              <div className="flex gap-2 mb-2 overflow-x-auto">
                {attachments.map((att, idx) => (
                  <div key={idx} className="relative w-16 h-16 rounded overflow-hidden border border-gray-300">
                    <img src={att.image_url.url} alt="attachment" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
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
                <button
                  onClick={handleFileUpload}
                  className={`p-2 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${attachments.length > 0 ? 'text-cyan-500' : 'text-gray-500 dark:text-gray-400'}`}
                >
                  <Paperclip size={18} />
                </button>
                <button
                  onClick={() => setIsSearchActive(!isSearchActive)}
                  className={`p-2 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${isSearchActive ? 'text-cyan-500 bg-gray-200 dark:bg-zinc-700' : 'text-gray-500 dark:text-gray-400'}`}
                >
                  <Globe size={18} />
                  <span>Search</span>
                </button>
                <button
                  onClick={() => setIsThinkingActive(!isThinkingActive)}
                  className={`p-2 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${isThinkingActive ? 'text-cyan-500 bg-gray-200 dark:bg-zinc-700' : 'text-gray-500 dark:text-gray-400'}`}
                >
                  <Layers size={18} />
                  <span>Think</span>
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleSendMessage()}
                  disabled={isLoading || (!input.trim() && attachments.length === 0)}
                  className="p-2 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 text-gray-500 dark:text-gray-300 rounded-full transition-colors disabled:opacity-50"
                >
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          </div>
          <div className="text-center mt-2 text-xs text-gray-400 dark:text-gray-500">
            Perplexity can make mistakes. Please use with caution.
          </div>
        </div>
      </div>

    </div>
  );
};

export default ChatInterface;
