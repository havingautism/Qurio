import React, { useState, useRef, useEffect } from "react";
import {
  Search,
  Paperclip,
  ArrowRight,
  Clock,
  Cloud,
  Github,
  Youtube,
  Coffee,
  Globe,
  Layers,
  X,
  Check,
  ChevronDown,
  LayoutGrid,
} from "lucide-react";
import ChatInterface from "./ChatInterface";
import SpaceView from "./SpaceView";
import { loadSettings } from "../lib/settings";
import { listConversationsBySpace } from "../lib/conversationsService";

const MainContent = ({
  currentView,
  activeSpace,
  activeConversation,
  spaces,
  spacesLoading = false,
  onChatStart,
  onEditSpace,
  onOpenConversation,
}) => {
  const [activeView, setActiveView] = useState(currentView); // Local state to manage view transition
  const [initialMessage, setInitialMessage] = useState("");
  const [initialAttachments, setInitialAttachments] = useState([]);
  const [initialToggles, setInitialToggles] = useState({
    search: false,
    thinking: false,
  });
  const [initialSpaceSelection, setInitialSpaceSelection] = useState({
    mode: "auto",
    space: null,
  });
  const [settings, setSettings] = useState(loadSettings());
  const fileInputRef = useRef(null);

  // Sync prop change to local state if needed (e.g. sidebar navigation)
  useEffect(() => {
    setActiveView(currentView);
  }, [currentView]);

  useEffect(() => {
    const handleSettingsChange = () => {
      setSettings(loadSettings());
      if (settings.apiProvider === "openai_compatibility") {
        setIsHomeSearchActive(false);
      }
    };

    window.addEventListener("settings-changed", handleSettingsChange);
    return () =>
      window.removeEventListener("settings-changed", handleSettingsChange);
  }, []);

  // ... (rest of the component)

  const suggestions = [
    { icon: Clock, title: "Time in Tokyo", subtitle: "Current local time" },
    { icon: Cloud, title: "Weather", subtitle: "San Francisco, CA" },
    { icon: Github, title: "GitHub Trends", subtitle: "Latest popular repos" },
    { icon: Youtube, title: "YouTube", subtitle: "Trending videos" },
    {
      icon: Coffee,
      title: "Espresso vs Ristretto",
      subtitle: "What is the difference?",
    },
    { icon: Search, title: "History of AI", subtitle: "Brief overview" },
  ];

  // Homepage Input State
  const [homeInput, setHomeInput] = useState("");
  const [isHomeSearchActive, setIsHomeSearchActive] = useState(false);
  const [isHomeThinkingActive, setIsHomeThinkingActive] = useState(false);
  const [homeAttachments, setHomeAttachments] = useState([]);
  const [homeSelectedSpace, setHomeSelectedSpace] = useState(null);
  const homeSpaceSelectorRef = useRef(null);
  const [isHomeSpaceSelectorOpen, setIsHomeSpaceSelectorOpen] = useState(false);
  const isHomeSpaceAuto = !homeSelectedSpace;
  const [spaceConversations, setSpaceConversations] = useState([]);
  const [spaceConversationsLoading, setSpaceConversationsLoading] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        homeSpaceSelectorRef.current &&
        !homeSpaceSelectorRef.current.contains(event.target)
      ) {
        setIsHomeSpaceSelectorOpen(false);
      }
    };

    if (isHomeSpaceSelectorOpen) {
      document.addEventListener("click", handleClickOutside);
    }

    return () => document.removeEventListener("click", handleClickOutside);
  }, [isHomeSpaceSelectorOpen]);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    files.forEach((file) => {
      if (!file.type.startsWith("image/")) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        setHomeAttachments((prev) => [
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

  const handleHomeFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleSelectHomeSpace = (space) => {
    setHomeSelectedSpace(space);
    setIsHomeSpaceSelectorOpen(false);
  };

  const handleSelectHomeSpaceAuto = () => {
    setHomeSelectedSpace(null);
    setIsHomeSpaceSelectorOpen(false);
  };

  const handleStartChat = async () => {
    if (!homeInput.trim() && homeAttachments.length === 0) return;

    // Set initial state for ChatInterface
    setInitialMessage(homeInput);
    setInitialAttachments(homeAttachments);
    setInitialToggles({
      search: isHomeSearchActive,
      thinking: isHomeThinkingActive,
    });
    const isManualSpaceSelection = !!homeSelectedSpace;
    setInitialSpaceSelection({
      mode: isManualSpaceSelection ? "manual" : "auto",
      space: isManualSpaceSelection ? homeSelectedSpace : null,
    });

    // Switch to chat view
    setActiveView("chat");
    if (onChatStart) onChatStart();

    // Reset home input
    setHomeInput("");
    setHomeAttachments([]);
    setIsHomeSearchActive(false);
    setIsHomeThinkingActive(false);
  };

  useEffect(() => {
    const fetchSpaceConversations = async () => {
      if (!activeSpace?.id) {
        setSpaceConversations([]);
        return;
      }
      setSpaceConversationsLoading(true);
      const { data, error } = await listConversationsBySpace(activeSpace.id);
      if (!error && data) {
        setSpaceConversations(data);
      } else {
        console.error("Failed to load space conversations:", error);
        setSpaceConversations([]);
      }
      setSpaceConversationsLoading(false);
    };
    fetchSpaceConversations();
  }, [activeSpace]);

  return (
    <div className="flex-1 min-h-screen bg-background text-foreground transition-colors duration-300 relative">
      {activeView === "chat" ? (
        <ChatInterface
          spaces={spaces}
          initialMessage={initialMessage}
          initialAttachments={initialAttachments}
          initialToggles={initialToggles}
          initialSpaceSelection={initialSpaceSelection}
          activeConversation={activeConversation}
        />
      ) : activeView === "space" && activeSpace ? (
        <SpaceView
          space={activeSpace}
          conversations={spaceConversations}
          conversationsLoading={spaceConversationsLoading}
          onEditSpace={onEditSpace}
          onOpenConversation={onOpenConversation}
        />
      ) : (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 ml-16">
          {/* Main Container */}
          <div className="w-full max-w-3xl flex flex-col items-center gap-8">
            {/* Title */}
            <h1 className="text-4xl md:text-5xl !font-serif font-medium text-center mb-8 text-[#1f2937] dark:text-white">
              Where knowledge begins
            </h1>

            {/* Search Box */}
            <div className="w-full relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-4">
                {homeAttachments.length > 0 && (
                  <div className="flex gap-2 mb-3 px-1 overflow-x-auto py-1">
                    {homeAttachments.map((att, idx) => (
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
                            setHomeAttachments(
                              homeAttachments.filter((_, i) => i !== idx)
                            )
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
                  value={homeInput}
                  onChange={(e) => setHomeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleStartChat();
                    }
                  }}
                  placeholder="Ask anything..."
                  className="w-full bg-transparent border-none outline-none resize-none text-lg placeholder-gray-400 dark:placeholder-gray-500 min-h-[60px]"
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
                      onClick={handleHomeFileUpload}
                      className={`p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${
                        homeAttachments.length > 0
                          ? "text-cyan-500"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      <Paperclip size={18} />
                    </button>
                    <button
                      disabled={settings.apiProvider === "openai_compatibility"}
                      value={isHomeSearchActive}
                      onClick={() => setIsHomeSearchActive(!isHomeSearchActive)}
                      className={`p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${
                        isHomeSearchActive
                          ? "text-cyan-500 bg-gray-100 dark:bg-zinc-800"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      <Globe size={18} />
                      <span>Search</span>
                    </button>
                    <button
                      onClick={() =>
                        setIsHomeThinkingActive(!isHomeThinkingActive)
                      }
                      className={`p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${
                        isHomeThinkingActive
                          ? "text-cyan-500 bg-gray-100 dark:bg-zinc-800"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      <Layers size={18} />
                      <span>Think</span>
                    </button>
                    <div className="relative" ref={homeSpaceSelectorRef}>
                      <button
                        onClick={() =>
                          setIsHomeSpaceSelectorOpen(!isHomeSpaceSelectorOpen)
                        }
                        className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${
                          isHomeSpaceAuto
                            ? "text-gray-500 dark:text-gray-400"
                            : "text-cyan-500 bg-gray-100 dark:bg-zinc-800"
                        }`}
                      >
                        <LayoutGrid size={18} />
                        <span>
                          {isHomeSpaceAuto || !homeSelectedSpace
                            ? "Spaces: Auto"
                            : `Spaces: ${homeSelectedSpace.label}`}
                        </span>
                        <ChevronDown size={14} />
                      </button>
                      {isHomeSpaceSelectorOpen && (
                        <div className="absolute top-full left-0 mt-2 w-60 bg-white dark:bg-[#202222] border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl z-30">
                          <div className="p-2 flex flex-col gap-1">
                            <button
                              onClick={handleSelectHomeSpaceAuto}
                              className={`flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left ${
                                isHomeSpaceAuto
                                  ? "text-cyan-500"
                                  : "text-gray-700 dark:text-gray-200"
                              }`}
                            >
                              <span className="text-sm font-medium">Auto</span>
                              {isHomeSpaceAuto && (
                                <Check size={14} className="text-cyan-500" />
                              )}
                            </button>
                            {spaces.length > 0 && (
                              <div className="h-px bg-gray-100 dark:bg-zinc-800 my-1" />
                            )}
                            {spaces.map((space, idx) => {
                              const isSelected =
                                homeSelectedSpace?.label === space.label;
                              return (
                                <button
                                  key={idx}
                                  onClick={() => handleSelectHomeSpace(space)}
                                  className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="text-lg">
                                      {space.emoji}
                                    </span>
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                      {space.label}
                                    </span>
                                  </div>
                                  {isSelected && (
                                    <Check
                                      size={14}
                                      className="text-cyan-500"
                                    />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleStartChat}
                      disabled={
                        !homeInput.trim() && homeAttachments.length === 0
                      }
                      className="p-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-full transition-colors disabled:opacity-50"
                    >
                      <ArrowRight size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Suggestions Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full mt-8">
              {suggestions.map((item, index) => (
                <div
                  key={index}
                  onClick={() => {
                    setHomeInput(item.title);
                    // Optional: auto-submit or just set input
                  }}
                  className="p-4 rounded-xl bg-gray-50 dark:bg-zinc-800/50 hover:bg-gray-100 dark:hover:bg-zinc-800 border border-transparent hover:border-gray-200 dark:hover:border-zinc-700 cursor-pointer transition-all duration-200 flex flex-col gap-2"
                >
                  <div className="p-2 bg-white dark:bg-zinc-900 w-fit rounded-lg shadow-sm text-cyan-600 dark:text-cyan-400">
                    <item.icon size={20} />
                  </div>
                  <div>
                    <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100 line-clamp-1">
                      {item.title}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                      {item.subtitle}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="absolute bottom-4 text-xs text-gray-400 dark:text-gray-600 flex gap-4">
            <a href="#" className="hover:underline">
              Pro
            </a>
            <a href="#" className="hover:underline">
              Enterprise
            </a>
            <a href="#" className="hover:underline">
              Store
            </a>
            <a href="#" className="hover:underline">
              Blog
            </a>
            <a href="#" className="hover:underline">
              Careers
            </a>
            <a href="#" className="hover:underline">
              English (English)
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainContent;
