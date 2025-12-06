import { useState, useEffect } from 'react'
import { useAppContext } from '../App'
import { useNavigate } from '@tanstack/react-router'
import { listConversations, toggleFavorite } from '../lib/conversationsService'
import { deleteConversation } from '../lib/supabase'
import {
  Search,
  Plus,
  Clock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Library as LibraryIcon,
  Check,
  Bookmark,
  Trash2,
  X,
  ArrowRight,
} from 'lucide-react'
import clsx from 'clsx'
import FancyLoader from '../components/FancyLoader'
import DropdownMenu from '../components/DropdownMenu'
import ConfirmationModal from '../components/ConfirmationModal'
import { useToast } from '../contexts/ToastContext'
import TwemojiDisplay from '../components/TwemojiDisplay'

const SORT_OPTIONS = [
  { label: 'Newest', value: 'created_at', ascending: false },
  { label: 'Oldest', value: 'created_at', ascending: true },
  { label: 'Title (A-Z)', value: 'title', ascending: true },
  { label: 'Title (Z-A)', value: 'title', ascending: false },
]

const LibraryView = () => {
  const { spaces, isSidebarPinned } = useAppContext()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearchQuery, setActiveSearchQuery] = useState('') // Query actually sent to server
  const [sortOption, setSortOption] = useState(SORT_OPTIONS[0])
  const [isSortOpen, setIsSortOpen] = useState(false)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuAnchorEl, setMenuAnchorEl] = useState(null)
  const [conversationToDelete, setConversationToDelete] = useState(null)
  const toast = useToast()

  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const limit = 10

  useEffect(() => {
    // Reset to page 1 when sort or active search changes
    setCurrentPage(1)
  }, [sortOption, activeSearchQuery])

  useEffect(() => {
    const fetchConversations = async () => {
      setLoading(true)
      const { data, count, error } = await listConversations({
        sortBy: sortOption.value,
        ascending: sortOption.ascending,
        page: currentPage,
        limit,
        search: activeSearchQuery,
      })

      if (!error) {
        setConversations(data || [])
        if (count !== undefined) setTotalCount(count)
      } else {
        console.error('Failed to load conversations:', error)
        toast.error('Failed to load conversations')
      }
      setLoading(false)
    }

    fetchConversations()

    const handleConversationsChanged = () => fetchConversations()
    window.addEventListener('conversations-changed', handleConversationsChanged)
    return () => window.removeEventListener('conversations-changed', handleConversationsChanged)
  }, [currentPage, sortOption, activeSearchQuery])

  const handleSearch = () => {
    if (searchQuery.trim() !== activeSearchQuery) {
      setActiveSearchQuery(searchQuery.trim())
    }
  }

  const handleKeyDown = e => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const handleClearSearch = () => {
    setSearchQuery('')
    setActiveSearchQuery('')
  }

  const totalPages = Math.ceil(totalCount / limit)

  const handlePageChange = newPage => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage)
    }
  }

  // Filter conversations based on search query - Removed as we now do server-side search
  const filteredConversations = conversations

  // Helper to get space info
  const getSpaceInfo = spaceId => {
    if (!spaceId) return null
    return spaces.find(s => String(s.id) === String(spaceId))
  }

  // Format date helper
  const formatDate = dateString => {
    const date = new Date(dateString)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
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
  const handleDeleteConversation = async () => {
    if (!conversationToDelete) return

    const { success, error } = await deleteConversation(conversationToDelete.id)

    if (success) {
      toast.success('Conversation deleted successfully')
      // Refresh data
      window.dispatchEvent(new Event('conversations-changed'))
    } else {
      console.error('Failed to delete conversation:', error)
      toast.error('Failed to delete conversation')
    }

    setConversationToDelete(null)
  }

  return (
    <div
      className={clsx(
        'flex-1 min-h-screen bg-background text-foreground transition-all duration-300',
        isSidebarPinned ? 'ml-80' : 'ml-16',
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
            <button
              onClick={handleSearch}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-pointer"
            >
              <Search size={20} />
            </button>
            <input
              type="text"
              placeholder="Search your Threads..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full bg-gray-100 dark:bg-zinc-900 border border-transparent focus:border-gray-300 dark:focus:border-zinc-700 rounded-xl py-3 pl-10 pr-20 outline-none transition-all placeholder-gray-500"
            />
            {searchQuery && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  onClick={handleClearSearch}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1"
                  title="Clear"
                >
                  <X size={16} />
                </button>
                <div className="w-px h-4 bg-gray-300 dark:bg-zinc-700 mx-1" />
                <button
                  onClick={handleSearch}
                  className="bg-cyan-500 hover:bg-cyan-600 text-white rounded-md p-1 transition-colors"
                  title="Search"
                >
                  <ArrowRight size={16} />
                </button>
              </div>
            )}
            {!searchQuery && (
              <button
                onClick={handleSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1"
                title="Search"
              >
                <ArrowRight size={16} />
              </button>
            )}
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
                              ? 'text-cyan-500'
                              : 'text-gray-700 dark:text-gray-300'
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
        <div className="relative space-y-4 pb-24">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center backdrop-blur-md bg-background/40 rounded-2xl">
              <FancyLoader />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No threads found matching your search.
            </div>
          ) : (
            filteredConversations.map(conv => {
              const space = getSpaceInfo(conv.space_id)
              return (
                <div
                  key={conv.id}
                  onClick={() =>
                    navigate({
                      to: '/conversation/$conversationId',
                      params: { conversationId: conv.id },
                    })
                  }
                  className="group relative p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-900/50 cursor-pointer transition-colors border-b border-gray-100 dark:border-zinc-800/50 last:border-0"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Title */}
                      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-3 truncate flex items-center gap-2">
                        {conv.title || 'Untitled Thread'}
                        {conv.is_favorited && (
                          <Bookmark size={14} className="text-yellow-500 fill-current shrink-0" />
                        )}
                      </h3>

                      {/* Metadata */}
                      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                        <div className="flex items-center gap-1.5">
                          <Clock size={14} />
                          <span>{formatDate(conv.created_at)}</span>
                        </div>
                        {space && (
                          <div className="flex items-center gap-1.5">
                            <TwemojiDisplay emoji={space.emoji} size="1rem" />
                            <span>{space.label}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions (visible on hover) */}
                    <div className="relative">
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          setOpenMenuId(conv.id)
                          setMenuAnchorEl(e.currentTarget)
                        }}
                        className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreHorizontal size={18} />
                      </button>
                      <DropdownMenu
                        isOpen={openMenuId === conv.id}
                        anchorEl={openMenuId === conv.id ? menuAnchorEl : null}
                        onClose={() => {
                          setOpenMenuId(null)
                          setMenuAnchorEl(null)
                        }}
                        items={[
                          {
                            label: conv.is_favorited ? 'Remove Bookmark' : 'Add Bookmark',
                            icon: (
                              <Bookmark
                                size={14}
                                className={conv.is_favorited ? 'fill-current' : ''}
                              />
                            ),
                            onClick: () => handleToggleFavorite(conv),
                            className: conv.is_favorited ? 'text-yellow-500' : '',
                          },
                          {
                            label: 'Delete conversation',
                            icon: <Trash2 size={14} />,
                            danger: true,
                            onClick: () => setConversationToDelete(conv),
                          },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Fixed Pagination Controls */}
      {!loading && totalPages > 1 && (
        <div
          className={clsx(
            'fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-gray-200 dark:border-zinc-800',
            isSidebarPinned ? 'pl-80' : 'pl-16',
          )}
        >
          <div className="max-w-5xl mx-auto px-6">
            <div className="flex items-center justify-center gap-4 py-4">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Previous Page"
              >
                <ChevronLeft size={20} />
              </button>

              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Page {currentPage} of {totalPages}
              </span>

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Next Page"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={!!conversationToDelete}
        onClose={() => setConversationToDelete(null)}
        onConfirm={handleDeleteConversation}
        title="Delete Conversation"
        message={`Are you sure you want to delete "${conversationToDelete?.title}"? This action cannot be undone.`}
        confirmText="Delete"
        isDangerous={true}
      />
    </div>
  )
}

export default LibraryView
