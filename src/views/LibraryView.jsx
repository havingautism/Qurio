import React, { useState, useMemo, useEffect } from "react";
import { useAppContext } from "../App";
import { useNavigate } from "@tanstack/react-router";
import { listConversations } from "../lib/conversationsService";
import {
  Search,
  Plus,
  Clock,
  LayoutGrid,
  ChevronDown,
  MoreHorizontal,
  ArrowUpDown,
  Library as LibraryIcon,
  Check,
} from "lucide-react";
import clsx from "clsx";
import FancyLoader from "../components/FancyLoader";

const SORT_OPTIONS = [
  { label: "Newest", value: "created_at", ascending: false },
  { label: "Oldest", value: "created_at", ascending: true },
  { label: "Title (A-Z)", value: "title", ascending: true },
  { label: "Title (Z-A)", value: "title", ascending: false },
];

const LibraryView = () => {
  const { spaces, isSidebarPinned } = useAppContext();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortOption, setSortOption] = useState(SORT_OPTIONS[0]);
  const [isSortOpen, setIsSortOpen] = useState(false);

  // Fetch conversations when sort option changes
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const { data, error } = await listConversations({
          sortBy: sortOption.value,
          ascending: sortOption.ascending,
        });
        if (data) {
          setConversations(data);
        }
      } catch (error) {
        console.error("Failed to fetch conversations:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [sortOption]);

  // Filter conversations based on search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    return conversations.filter((c) =>
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
            <LibraryIcon size={32} className="text-cyan-500" />
            <h1 className="text-3xl font-medium">Library</h1>
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
              placeholder="Search your Threads..."
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
              <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-xs font-medium transition-colors">
                <span>Temporary Threads: Show</span>
                <ChevronDown size={12} />
              </button>
            </div>
            <div className="relative">
              <button
                onClick={() => setIsSortOpen(!isSortOpen)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-xs font-medium transition-colors"
              >
                <span>Sort: {sortOption.label}</span>
                <ChevronDown size={12} />
              </button>

              {/* Sort Dropdown */}
              {isSortOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsSortOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-lg z-20 overflow-hidden py-1">
                    {SORT_OPTIONS.map((option) => (
                      <button
                        key={option.label}
                        onClick={() => {
                          setSortOption(option);
                          setIsSortOpen(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-zinc-800 flex items-center justify-between group"
                      >
                        <span
                          className={
                            sortOption.label === option.label
                              ? "text-cyan-500"
                              : "text-gray-700 dark:text-gray-300"
                          }
                        >
                          {option.label}
                        </span>
                        {sortOption.label === option.label && (
                          <Check size={14} className="text-cyan-500" />
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Thread List */}
        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <FancyLoader />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No threads found matching your search.
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

export default LibraryView;
