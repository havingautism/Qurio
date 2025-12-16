import { useState, useMemo } from 'react'
import { useAppContext } from '../App'
import { useNavigate } from '@tanstack/react-router'
import { listBookmarkedConversations, toggleFavorite } from '../lib/conversationsService'
import { deleteConversation } from '../lib/supabase'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import {
  Search,
  Plus,
  Clock,
  ChevronDown,
  MoreHorizontal,
  Bookmark,
  Check,
  Trash2,
  Coffee,
} from 'lucide-react'
import clsx from 'clsx'
import FancyLoader from '../components/FancyLoader'
import DropdownMenu from '../components/DropdownMenu'
import { useToast } from '../contexts/ToastContext'
import EmojiDisplay from '../components/EmojiDisplay'

const SORT_OPTIONS = [
  { label: 'Newest', value: 'created_at', ascending: false },
  { label: 'Oldest', value: 'created_at', ascending: true },
  { label: 'Title (A-Z)', value: 'title', ascending: true },
  { label: 'Title (Z-A)', value: 'title', ascending: false },
]

const BookmarksView = () => {
  const { spaces, isSidebarPinned, showConfirmation } = useAppContext()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOption, setSortOption] = useState(SORT_OPTIONS[0])
  const [isSortOpen, setIsSortOpen] = useState(false)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuAnchorEl, setMenuAnchorEl] = useState(null)
  const toast = useToast()

  // Use infinite scroll hook
  const {
    data: conversations,
    loading,
    loadingMore,
    hasMore,
    loadMoreRef,
  } = useInfiniteScroll(
    async (cursor, limit) => {
      return await listBookmarkedConversations({
        sortBy: sortOption.value,
        ascending: sortOption.ascending,
        cursor,
        limit,
      })
    },
    {
      limit: 10,
      dependencies: [sortOption],
      rootMargin: '100px',
    },
  )

  // Filter conversations based on search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations
    return conversations.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
  }, [conversations, searchQuery])

  // Helper to get space info
  const getSpaceInfo = spaceId => {
    if (!spaceId) return null
    return spaces.find(s => String(s.id) === String(spaceId))
  }

  // Format date helper
  const formatDate = dateString => {
    const date = new Date(dateString)
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }

  // Handle toggle favorite
  const handleToggleFavorite = async conversation => {
    const newStatus = !conversation.is_favorited
    const { error } = await toggleFavorite(conversation.id, newStatus)

    if (error) {
      console.error('Failed to toggle favorite:', error)
      toast.error('Failed to update favorite status')
    } else {
      toast.success(newStatus ? 'Added to bookmarks' : 'Removed from bookmarks')
      // Refresh data
      window.dispatchEvent(new Event('conversations-changed'))
    }
    setOpenMenuId(null)
  }

  // Handle delete conversation
  const handleDeleteConversation = async conversation => {
    if (!conversation) return

    showConfirmation({
      title: 'Delete Conversation',
      message: `Are you sure you want to delete "${conversation.title}"? This action cannot be undone.`,
      confirmText: 'Delete',
      isDangerous: true,
      onConfirm: async () => {
        const { success, error } = await deleteConversation(conversation.id)

        if (success) {
          toast.success('Conversation deleted successfully')
          // Refresh data
          window.dispatchEvent(new Event('conversations-changed'))
        } else {
          console.error('Failed to delete conversation:', error)
          toast.error('Failed to delete conversation')
        }
      },
    })
  }

  return (
    <div
      className={clsx(
        'flex-1 min-h-screen bg-background text-foreground transition-all duration-300',
        isSidebarPinned ? 'ml-0 sm:ml-80' : 'ml-0 sm:ml-16',
      )}
    >
      <div className="w-full max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Bookmark size={32} className="text-primary-500 fill-current" />
            <h1 className="text-3xl font-medium">Bookmarks</h1>
          </div>
          <button
            onClick={() => navigate({ to: '/new_chat' })}
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search your Bookmarks..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
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
                  <div className="fixed inset-0 z-10" onClick={() => setIsSortOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-lg z-20 overflow-hidden py-1">
                    {SORT_OPTIONS.map(option => (
                      <button
                        key={option.label}
                        onClick={() => {
                          setSortOption(option)
                          setIsSortOpen(false)
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-zinc-800 flex items-center justify-between group"
                      >
                        <span
                          className={
                            sortOption.label === option.label
                              ? 'text-primary-500'
                              : 'text-gray-700 dark:text-gray-300'
                          }
                        >
                          {option.label}
                        </span>
                        {sortOption.label === option.label && (
                          <Check size={14} className="text-primary-500" />
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
        <div className="relative space-y-4">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center backdrop-blur-md bg-background/40 rounded-2xl">
              <FancyLoader />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-12 text-gray-500 flex flex-col items-center gap-3">
              <Coffee size={56} className="text-black dark:text-white" />
              <p className="text-sm">No bookmarks yet. Save one to see it here.</p>
              {/* <button
                onClick={() => navigate({ to: '/new_chat' })}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-white hover:bg-primary-600 transition-colors"
              >
                <Plus size={14} />
                Start a thread
              </button> */}
            </div>
          ) : (
            filteredConversations.map(conv => {
              const space = getSpaceInfo(conv.space_id)
              return (
                <div
                  key={conv.id}
                  data-conversation-id={conv.id}
                  onClick={() =>
                    navigate({
                      to: '/conversation/$conversationId',
                      params: { conversationId: conv.id },
                    })
                  }
                  className="group relative p-4 rounded-xl cursor-pointer transition-colors border-b border-gray-100 dark:border-zinc-800/50 last:border-0 hover:bg-primary-500/10 dark:hover:bg-primary-500/20 hover:border hover:border-primary-500/30 dark:hover:border-primary-500/40"
                >
                  <div className="flex justify-between items-start gap-4">
                    {space?.emoji && (
                      <div className="shrink-0 flex items-center justify-center bg-gray-100 dark:bg-zinc-800 rounded-lg w-12 h-12">
                        <EmojiDisplay emoji={space.emoji} size="2rem" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      {/* Title */}
                      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1 truncate">
                        {conv.title || 'Untitled Thread'}
                      </h3>

                      {/* Metadata */}
                      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                        <div className="flex items-center gap-1.5">
                          <Clock size={14} />
                          <span>{formatDate(conv.created_at)}</span>
                        </div>
                        {space && (
                          <div className="flex items-center gap-1.5">
                            <span>{space.label}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions (always visible on mobile, visible on hover on desktop) */}
                    <div className="relative">
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          setOpenMenuId(conv.id)
                          setMenuAnchorEl(e.currentTarget)
                        }}
                        className={clsx(
                          'p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-all rounded-full hover:bg-black/5 dark:hover:bg-white/10',
                          // Always visible on mobile
                          'opacity-100',
                          // Show on hover on desktop
                          'md:opacity-0 md:group-hover:opacity-100',
                          // Ensure button has minimum size for touch
                          'min-w-[44px] min-h-[44px] flex items-center justify-center',
                        )}
                      >
                        <MoreHorizontal size={18} strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}

          {/* Invisible Sentinel for Intersection Observer */}
          {!loading && hasMore && <div ref={loadMoreRef} className="h-1" />}

          {/* Loading More Indicator - Fixed at bottom of list */}
          {!loading && loadingMore && (
            <div className="flex flex-col items-center gap-3 py-8">
              <FancyLoader />
              <span className="text-sm text-gray-400">Loading more bookmarks...</span>
            </div>
          )}

          {/* No More Data Message */}
          {!loading && !hasMore && conversations.length > 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">No more bookmarks to load</div>
          )}
        </div>
      </div>

      {/* Global DropdownMenu */}
      <DropdownMenu
        isOpen={!!openMenuId}
        anchorEl={menuAnchorEl}
        onClose={() => {
          setOpenMenuId(null)
          setMenuAnchorEl(null)
        }}
        items={(() => {
          const activeConv = conversations.find(c => c.id === openMenuId)
          if (!activeConv) return []
          return [
            {
              label: activeConv.is_favorited ? 'Remove Bookmark' : 'Add Bookmark',
              icon: (
                <Bookmark size={14} className={activeConv.is_favorited ? 'fill-current' : ''} />
              ),
              onClick: () => handleToggleFavorite(activeConv),
              className: activeConv.is_favorited ? 'text-yellow-500' : '',
            },
            {
              label: 'Delete conversation',
              icon: <Trash2 size={14} />,
              danger: true,
              onClick: () => handleDeleteConversation(activeConv),
            },
          ]
        })()}
      />
    </div>
  )
}

export default BookmarksView
