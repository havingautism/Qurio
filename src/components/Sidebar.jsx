import React, { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Bookmark,
  LayoutGrid,
  Library,
  Globe,
  Map,
  BookOpen,
  Code,
  Film,
  Cpu,
  Wallet,
  ChevronRight,
  Settings,
  Sun,
  Moon,
  Laptop,
  Trash2,
  Star,
  MoreHorizontal,
  Divide,
  Pin,
} from "lucide-react";
import clsx from "clsx";
import FiloLogo from "./Logo";
import { listConversations, toggleFavorite } from "../lib/conversationsService";
import { deleteConversation } from "../lib/supabase";
import ConfirmationModal from "./ConfirmationModal";
import DropdownMenu from "./DropdownMenu";
import { useToast } from "../contexts/ToastContext";

const Sidebar = ({
  onOpenSettings,
  onNavigate,
  onNavigateToSpace,
  onCreateSpace,
  onEditSpace,
  onOpenConversation,
  spaces,
  spacesLoading = false,
  theme,
  onToggleTheme,
  activeConversationId,
  onPinChange,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(() => {
    const saved = localStorage.getItem("sidebar-pinned");
    return saved === "true";
  });
  const [activeTab, setActiveTab] = useState("library"); // 'library', 'discover', 'spaces'
  const [hoveredTab, setHoveredTab] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [isConversationsLoading, setIsConversationsLoading] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const toast = useToast();

  const displayTab = hoveredTab || activeTab;
  const isExpanded = isPinned || isHovered;

  // Persist pin state to localStorage and notify parent
  useEffect(() => {
    localStorage.setItem("sidebar-pinned", isPinned);
    if (onPinChange) {
      onPinChange(isPinned);
    }
  }, [isPinned, onPinChange]);

  useEffect(() => {
    const fetchData = async () => {
      setIsConversationsLoading(true);
      const { data, error } = await listConversations();
      if (!error && data) {
        setConversations(data);
      } else {
        console.error("Failed to load conversations:", error);
      }
      setIsConversationsLoading(false);
    };

    fetchData();

    const handleConversationsChanged = () => fetchData();
    window.addEventListener(
      "conversations-changed",
      handleConversationsChanged
    );
    return () => {
      window.removeEventListener(
        "conversations-changed",
        handleConversationsChanged
      );
    };
  }, []);

  // Close dropdown when sidebar collapses (mouse leaves)
  useEffect(() => {
    if (!isHovered) {
      setOpenMenuId(null);
      setMenuAnchorEl(null);
    }
  }, [isHovered]);

  const navItems = [
    { id: "library", icon: Library, label: "Library" },
    { id: "bookmarks", icon: Bookmark, label: "Bookmarks" },
    // { id: 'discover', icon: Compass, label: 'Discover' },
    { id: "spaces", icon: LayoutGrid, label: "Spaces" },
  ];

  const getThemeIcon = () => {
    switch (theme) {
      case "light":
        return <Sun size={20} />;
      case "dark":
        return <Moon size={20} />;
      case "system":
        return <Laptop size={20} />;
      default:
        return <Laptop size={20} />;
    }
  };

  const groupConversationsByDate = (items) => {
    const startOfDay = (date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const todayStart = startOfDay(new Date());
    const groups = {
      Today: [],
      Yesterday: [],
      "Previous 7 Days": [],
      Past: [],
    };

    items.forEach((conv) => {
      const convDate = startOfDay(conv.created_at);
      const diffDays = Math.floor(
        (todayStart - convDate) / (1000 * 60 * 60 * 24)
      );

      if (diffDays === 0) {
        groups.Today.push(conv);
      } else if (diffDays === 1) {
        groups.Yesterday.push(conv);
      } else if (diffDays <= 7) {
        groups["Previous 7 Days"].push(conv);
      } else {
        groups.Past.push(conv);
      }
    });

    return Object.keys(groups)
      .map((title) => ({ title, items: groups[title] }))
      .filter((section) => section.items.length > 0);
  };

  const handleDeleteConversation = async () => {
    if (!conversationToDelete) return;

    const { success, error } = await deleteConversation(
      conversationToDelete.id
    );

    if (success) {
      // Refresh list
      const { data } = await listConversations();
      if (data) setConversations(data);

      // Only navigate home if we deleted the currently active conversation
      if (conversationToDelete.id === activeConversationId) {
        onNavigate("home");
      }
    } else {
      console.error("Failed to delete conversation:", error);
      toast.error("Failed to delete conversation");
    }

    setConversationToDelete(null);
  };

  const handleToggleFavorite = async (conversation) => {
    const newStatus = !conversation.is_favorited;
    // Optimistic update
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversation.id ? { ...c, is_favorited: newStatus } : c
      )
    );

    const { error } = await toggleFavorite(conversation.id, newStatus);

    if (error) {
      console.error("Failed to toggle favorite:", error);
      toast.error("Failed to update favorite status");
      // Revert optimistic update
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversation.id ? { ...c, is_favorited: !newStatus } : c
        )
      );
    } else {
      toast.success(
        newStatus ? "Added to bookmarks" : "Removed from bookmarks"
      );
    }
  };

  const filteredConversations = useMemo(
    () =>
      displayTab === "bookmarks"
        ? conversations.filter((c) => c.is_favorited)
        : conversations,
    [conversations, displayTab]
  );

  const groupedConversations = useMemo(
    () => groupConversationsByDate(filteredConversations),
    [filteredConversations]
  );

  return (
    <div
      className="fixed left-0 top-0 h-full z-50 flex"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        if (!isPinned) {
          setIsHovered(false);
          setHoveredTab(null);
        }
      }}
    >
      {/* 1. Fixed Icon Strip */}
      <div className="w-18 h-full bg-sidebar  flex flex-col items-center py-4 z-20 relative">
        {/* Logo */}
        <div className="mb-6">
          <div className="w-8 h-8 flex items-center justify-center text-gray-900 dark:text-white font-bold text-xl">
            <FiloLogo size={24} />
          </div>
        </div>

        {/* New Thread Button (Icon Only) */}
        <div className="mb-6">
          <button
            onClick={() => onNavigate("home")}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[#9c9d8a29] dark:bg-zinc-800 text-gray-600 dark:text-gray-300 transition-transform duration-200 hover:scale-110 active:scale-95 cursor-pointer"
          >
            <Plus size={20} />
          </button>
        </div>

        {/* Nav Icons */}
        <div className="flex flex-col gap-4 w-full">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                // Navigate to library list view when clicking Library icon
                if (item.id === "library") {
                  onNavigate("library");
                }
                // Navigate to spaces list view when clicking Spaces icon
                if (item.id === "spaces") {
                  onNavigate("spaces");
                }
                // Navigate to bookmarks list view when clicking Bookmarks icon
                if (item.id === "bookmarks") {
                  onNavigate("bookmarks");
                }
              }}
              onMouseEnter={() => setHoveredTab(item.id)}
              className={clsx(
                "flex flex-col items-center justify-center gap-1 py-2 mx-2 rounded-xl transition-all duration-200 cursor-pointer",
                activeTab === item.id
                  ? "text-[#13343bbf] dark:text-white"
                  : "text-[#13343bbf] dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              )}
            >
              <div
                className={clsx(
                  "p-3 rounded-lg transition-all",
                  activeTab === item.id
                    ? "bg-[#9c9d8a29] dark:bg-zinc-700"
                    : "group-hover:bg-[#9c9d8a29] dark:group-hover:bg-zinc-800/50"
                )}
              >
                <item.icon size={20} />
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Theme Toggle Button */}
        <div className="mb-2">
          <button
            onClick={onToggleTheme}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[#9c9d8a29] dark:bg-zinc-800 text-gray-600 dark:text-gray-300 transition-transform duration-200 hover:scale-110 active:scale-95 cursor-pointer"
            //  title={`Current theme: ${theme}`}
          >
            {getThemeIcon()}
          </button>
        </div>

        {/* Settings Button (Icon Only) */}
        <div className="mb-2">
          <button
            onClick={onOpenSettings}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[#9c9d8a29] dark:bg-zinc-800 text-gray-600 dark:text-gray-300 transition-transform duration-200 hover:scale-110 active:scale-95 cursor-pointer"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* 2. Expanded Content Panel */}
      <div
        className={clsx(
          "h-full bg-sidebar  transition-all duration-300 ease-in-out overflow-hidden flex flex-col",
          isExpanded && displayTab !== "discover"
            ? "w-64 opacity-100 translate-x-0 shadow-2xl"
            : "w-0 opacity-0 -translate-x-4"
        )}
      >
        <div className="p-2 min-w-[256px]">
          {" "}
          {/* min-w ensures content doesn't squash during transition */}
          {/* Header based on Tab */}
          <div className="p-2 flex items-center justify-between">
            <h2 className="font-semibold text-lg text-foreground">
              {displayTab === "library"
                ? "Library"
                : displayTab === "bookmarks"
                ? "Bookmarks"
                : displayTab === "spaces"
                ? "Spaces"
                : ""}
            </h2>
            <button
              onClick={() => setIsPinned(!isPinned)}
              className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded transition-colors"
              title={isPinned ? "Unpin sidebar" : "Pin sidebar"}
            >
              <Pin
                size={16}
                className={clsx(
                  "transition-colors",
                  isPinned
                    ? "fill-current text-cyan-500"
                    : "text-gray-500 dark:text-gray-400"
                )}
              />
            </button>
          </div>
          <div className="h-px bg-gray-200 dark:bg-zinc-800 mb-2" />
          {/* CONVERSATION LIST (Library & Bookmarks) */}
          {(displayTab === "library" || displayTab === "bookmarks") && (
            <div className="flex flex-col gap-2 overflow-y-auto h-[calc(100vh-100px)] pr-2 scrollbar-thin">
              {isConversationsLoading && (
                <div className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1">
                  Loading conversations...
                </div>
              )}
              {!isConversationsLoading && conversations.length === 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1">
                  No conversations yet.
                </div>
              )}
              {!isConversationsLoading &&
                displayTab === "bookmarks" &&
                conversations.filter((c) => c.is_favorited).length === 0 && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1">
                    No bookmarked conversations.
                  </div>
                )}

              {groupedConversations.map((section) => (
                <div key={section.title} className="flex flex-col gap-1">
                  <div className="text-[10px] justify-center flex uppercase tracking-wide text-gray-400 px-2 mt-1">
                    {section.title}
                  </div>
                  {section.items.map((conv) => {
                    const isActive = conv.id === activeConversationId;
                    return (
                      <div
                        key={conv.id}
                        onClick={() =>
                          onOpenConversation && onOpenConversation(conv)
                        }
                        className={clsx(
                          "text-sm p-2 rounded cursor-pointer truncate transition-colors group relative",
                          isActive
                            ? "bg-cyan-500/10 dark:bg-cyan-500/20 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300"
                            : "text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-800"
                        )}
                        title={conv.title}
                      >
                        <div className="flex items-center justify-between w-full overflow-hidden">
                          <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="truncate font-medium">
                                {conv.title}
                              </span>
                              {conv.is_favorited && (
                                <Bookmark
                                  size={10}
                                  className=" flex-shrink-0"
                                />
                              )}
                            </div>
                            <span
                              className={clsx(
                                "text-[10px]",
                                isActive
                                  ? "text-cyan-600 dark:text-cyan-400"
                                  : "text-gray-400"
                              )}
                            >
                              {new Date(conv.created_at).toLocaleDateString()}
                            </span>
                          </div>

                          <div className="relative ml-2 shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(conv.id);
                                setMenuAnchorEl(e.currentTarget);
                              }}
                              className={clsx(
                                "p-1.5 rounded-md hover:bg-gray-300 dark:hover:bg-zinc-700 transition-all",
                                isActive
                                  ? "text-cyan-600 dark:text-cyan-400"
                                  : "text-gray-500 dark:text-gray-400",
                                openMenuId === conv.id
                                  ? "opacity-100"
                                  : "opacity-100 md:opacity-0 md:group-hover:opacity-100"
                              )}
                            >
                              <MoreHorizontal size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
          {/* SPACES TAB CONTENT */}
          {displayTab === "spaces" && (
            <div className="flex flex-col gap-2">
              {/* Create New Space */}
              <button
                onClick={onCreateSpace}
                className="flex items-center gap-3 p-2 rounded hover:bg-gray-200 dark:hover:bg-zinc-800 text-gray-700 dark:text-gray-300 transition-colors  w-full text-left cursor-pointer"
              >
                <div className="w-8 h-8 rounded bg-gray-200 dark:bg-zinc-700 flex items-center justify-center">
                  <Plus size={16} />
                </div>
                <span className="text-sm font-medium">Create New Space</span>
              </button>

              <div className="h-px bg-gray-200 dark:bg-zinc-800 mb-2" />

              {/* Spaces List */}
              {spacesLoading && (
                <div className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1">
                  Loading spaces...
                </div>
              )}
              {!spacesLoading && spaces.length === 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1">
                  No spaces yet.
                </div>
              )}
              {spaces.map((space) => (
                <div
                  key={space.id || space.label}
                  onClick={() => onNavigateToSpace(space)}
                  className="flex items-center justify-between p-2 rounded hover:bg-gray-200 dark:hover:bg-zinc-800 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-gray-100 dark:bg-zinc-800  flex items-center justify-center group-hover:border-gray-300 dark:group-hover:border-zinc-600 text-lg">
                      {space.emoji}
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {space.label}
                    </span>
                  </div>

                  {/* Edit Button (Visible on Hover) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditSpace(space);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-gray-300 dark:hover:bg-zinc-700 text-gray-500 dark:text-gray-400 transition-all"
                  >
                    <Settings size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Global Dropdown Menu */}
      <DropdownMenu
        isOpen={!!openMenuId && !!menuAnchorEl}
        anchorEl={menuAnchorEl}
        onClose={() => {
          setOpenMenuId(null);
          setMenuAnchorEl(null);
        }}
        items={(() => {
          const conv = conversations.find((c) => c.id === openMenuId);
          if (!conv) return [];
          return [
            {
              label: conv.is_favorited ? "Remove Bookmark" : "Add Bookmark",
              icon: (
                <Bookmark
                  size={14}
                  className={conv.is_favorited ? "fill-current" : ""}
                />
              ),
              onClick: () => handleToggleFavorite(conv),
              className: conv.is_favorited ? "text-yellow-500" : "",
            },
            {
              label: "Delete",
              icon: <Trash2 size={14} />,
              onClick: () => setConversationToDelete(conv),
              danger: true,
            },
          ];
        })()}
      />

      <ConfirmationModal
        isOpen={!!conversationToDelete}
        onClose={() => setConversationToDelete(null)}
        onConfirm={handleDeleteConversation}
        title="Delete"
        message={`Are you sure you want to delete "${conversationToDelete?.title}"? This action cannot be undone.`}
        confirmText="Delete"
        isDangerous={true}
      />
    </div>
  );
};

export default Sidebar;
