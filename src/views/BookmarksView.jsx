import React, { useState, useMemo } from "react";
import { useAppContext } from "../App";
import { useNavigate } from "@tanstack/react-router";
import {
  Search,
  Plus,
  Clock,
  LayoutGrid,
  ChevronDown,
  MoreHorizontal,
  Bookmark,
} from "lucide-react";
import clsx from "clsx";

const BookmarksView = () => {
  const { conversations, spaces, isSidebarPinned } = useAppContext();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  // Filter conversations based on search query and favorite status
  const filteredConversations = useMemo(() => {
    const bookmarked = conversations.filter((c) => c.is_favorited);
    if (!searchQuery.trim()) return bookmarked;
    return bookmarked.filter((c) =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [conversations, searchQuery]);

  // Helper to get space info
  const getSpaceInfo = (spaceId) => {
    if (!spaceId) return null;
    return spaces.find((s) => String(s.id) === String(spaceId));
  };

  // Format date helper
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
  };

  return (
    <div
      className={clsx(
        "flex-1 min-h-screen bg-background text-foreground transition-all duration-300",
        isSidebarPinned ? "ml-80" : "ml-16"
      )}
    >
      <div className="w-full max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Bookmark size={32} className="text-cyan-500 fill-current" />
            <h1 className="text-3xl font-medium">Bookmarks</h1>
          </div>
          <button
            onClick={() => navigate({ to: "/new_chat" })}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            <span>New Thread</span>
          </button>
        </div>

        {/* Search and Filters */}
        <div className="mb-8 space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={20}
            />
            <input
              type="text"
              placeholder="Search your Bookmarks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-100 dark:bg-zinc-900 border border-transparent focus:border-gray-300 dark:focus:border-zinc-700 rounded-xl py-3 pl-10 pr-4 outline-none transition-all placeholder-gray-500"
            />
          </div>

          {/* Filter Row (Visual only for now) */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-xs font-medium transition-colors">
                Select
              </button>
              <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-xs font-medium transition-colors">
                <span>Type</span>
                <ChevronDown size={12} />
              </button>
            </div>
            <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-xs font-medium transition-colors">
              <span>Sort: Newest</span>
              <ChevronDown size={12} />
            </button>
          </div>
        </div>

        {/* Thread List */}
        <div className="space-y-4">
          {filteredConversations.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No bookmarks found matching your search.
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const space = getSpaceInfo(conv.space_id);
              return (
                <div
                  key={conv.id}
                  onClick={() =>
                    navigate({
                      to: "/conversation/$conversationId",
                      params: { conversationId: conv.id },
                    })
                  }
                  className="group relative p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-900/50 cursor-pointer transition-colors border-b border-gray-100 dark:border-zinc-800/50 last:border-0"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Title */}
                      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-3 truncate">
                        {conv.title || "Untitled Thread"}
                      </h3>

                      {/* Metadata */}
                      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                        <div className="flex items-center gap-1.5">
                          <Clock size={14} />
                          <span>{formatDate(conv.created_at)}</span>
                        </div>
                        {space && (
                          <div className="flex items-center gap-1.5">
                            <span>{space.emoji}</span>
                            <span>{space.label}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions (visible on hover) */}
                    <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal size={18} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default BookmarksView;
