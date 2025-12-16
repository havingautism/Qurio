import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { spaceRoute } from '../router'
import { useAppContext } from '../App'
import {
  Layers,
  MoreHorizontal,
  Pencil,
  Trash2,
  LogOut,
  Bookmark,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import clsx from 'clsx'
import DropdownMenu from '../components/DropdownMenu'
import { deleteConversation, removeConversationFromSpace } from '../lib/supabase'
import { toggleFavorite, listConversationsBySpace } from '../lib/conversationsService'
import { useToast } from '../contexts/ToastContext'
import FancyLoader from '../components/FancyLoader'
import EmojiDisplay from '../components/EmojiDisplay'

const SpaceView = () => {
  const { spaceId } = spaceRoute.useParams()
  const navigate = useNavigate()
  const { spaces, isSidebarPinned, onEditSpace, onOpenConversation, showConfirmation } =
    useAppContext()

  const activeSpace = spaces?.find(s => String(s.id) === String(spaceId)) || null

  // State for conversations
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const limit = 10

  // State for dropdown menu
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuAnchorEl, setMenuAnchorEl] = useState(null)

  const toast = useToast()

  // Reset pagination when space changes
  useEffect(() => {
    setCurrentPage(1)
  }, [spaceId])

  // Fetch conversations for this space
  useEffect(() => {
    const fetchConversations = async () => {
      if (!activeSpace?.id) {
        setConversations([])
        setTotalCount(0)
        return
      }

      setLoading(true)
      const { data, count, error } = await listConversationsBySpace(activeSpace.id, {
        page: currentPage,
        limit,
        sortBy: 'created_at',
        ascending: false,
      })

      if (!error) {
        setConversations(data || [])
        if (count !== undefined) {
          setTotalCount(count)
          const totalPages = Math.ceil(count / limit)
          if (currentPage > totalPages && totalPages > 0) {
            setCurrentPage(totalPages)
          }
        }
      } else {
        console.error('Failed to load conversations by space:', error)
        toast.error('Failed to load conversations')
      }
      setLoading(false)
    }

    fetchConversations()
  }, [activeSpace?.id, currentPage, toast])

  const totalPages = Math.ceil(totalCount / limit) || 1

  const handlePageChange = useCallback(
    newPage => {
      if (newPage >= 1 && newPage <= totalPages) {
        setCurrentPage(newPage)
      }
    },
    [totalPages],
  )

  const handleDeleteConversation = useCallback(
    async conversation => {
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
            setCurrentPage(1)
            // Notify Sidebar to refresh its conversation list
            window.dispatchEvent(new Event('conversations-changed'))
          } else {
            console.error('Failed to delete conversation:', error)
            toast.error('Failed to delete conversation')
          }
        },
      })
    },
    [showConfirmation, toast],
  )

  const handleRemoveFromSpace = useCallback(
    async conversation => {
      const { data, error } = await removeConversationFromSpace(conversation.id)

      if (!error && data) {
        toast.success('Conversation removed from space')
        setCurrentPage(1)
        // Notify Sidebar to refresh its conversation list
        window.dispatchEvent(new Event('conversations-changed'))
      } else {
        console.error('Failed to remove conversation from space:', error)
        toast.error('Failed to remove conversation from space')
      }
    },
    [toast],
  )

  const handleToggleFavorite = useCallback(
    async conversation => {
      const newStatus = !conversation.is_favorited
      const { error } = await toggleFavorite(conversation.id, newStatus)

      if (error) {
        console.error('Failed to toggle favorite:', error)
        toast.error('Failed to update favorite status')
      } else {
        toast.success(newStatus ? 'Added to bookmarks' : 'Removed from bookmarks')
        // Notify Sidebar to refresh its conversation list
        window.dispatchEvent(new Event('conversations-changed'))
      }
    },
    [toast],
  )

  if (!activeSpace) {
    return <div className="min-h-screen bg-background text-foreground" />
  }

  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center min-h-screen p-6 pb-24 bg-background text-foreground transition-all duration-300',
        isSidebarPinned ? 'ml-0 sm:ml-80' : 'ml-0 sm:ml-16',
      )}
    >
      <div className="w-full max-w-3xl flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-4xl">
              <EmojiDisplay emoji={activeSpace.emoji} size="2.25rem" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
                {activeSpace.label}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {activeSpace.description || `${activeSpace.label} search records`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onEditSpace && onEditSpace(activeSpace)}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-user-bubble dark:bg-zinc-800 text-gray-600 dark:text-gray-300 transition-transform duration-200 hover:scale-110 active:scale-95 cursor-pointer"
              title="Edit space"
            >
              <Pencil size={16} />
            </button>
          </div>
        </div>

        {activeSpace.prompt && (
          <div className="w-full bg-user-bubble/50 dark:bg-zinc-900 border border-dashed border-gray-300 dark:border-zinc-700 rounded-xl p-4">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Space Prompt
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-line">
              {activeSpace.prompt}
            </p>
          </div>
        )}

        {/* Section: My Topics */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-gray-900 dark:text-white font-medium">
            <Layers size={18} />
            <span>My Topics</span>
          </div>

          {/* Topics List */}
          <div className="relative flex flex-col gap-4">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center backdrop-blur-md bg-background/40 rounded-2xl">
                <FancyLoader />
              </div>
            )}
            {!loading && conversations.length === 0 && (
              <div className="text-sm text-gray-500 dark:text-gray-400">No conversations yet.</div>
            )}
            {!loading &&
              conversations.map((conv, i) => (
                <div
                  key={conv.id || i}
                  data-conversation-id={conv.id || i}
                  className="group relative p-4 rounded-xl cursor-pointer transition-colors border-b border-gray-100 dark:border-zinc-800/50 last:border-0 hover:bg-primary-500/10 dark:hover:bg-primary-500/20 hover:border hover:border-primary-500/30 dark:hover:border-primary-500/40"
                  onClick={() => onOpenConversation && onOpenConversation(conv)}
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900 dark:text-gray-100 group-hover:text-primary-500 transition-colors flex items-center gap-2">
                        {conv.title || 'Untitled'}
                        {conv.is_favorited && (
                          <Bookmark size={14} className="text-yellow-500 fill-current" />
                        )}
                      </h3>
                      <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                        <span>{new Date(conv.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="relative">
                      <button
                        className={clsx(
                          'p-1 hover:bg-primary-500/10 dark:hover:bg-primary-500/20 rounded text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-all',
                          'opacity-100',
                          'md:opacity-0 md:group-hover:opacity-100',
                          'min-w-[44px] min-h-[44px] flex items-center justify-center',
                        )}
                        onClick={e => {
                          e.stopPropagation()
                          setOpenMenuId(conv.id)
                          setMenuAnchorEl(e.currentTarget)
                        }}
                      >
                        <MoreHorizontal size={16} strokeWidth={2} />
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
                            label: 'Remove from space',
                            icon: <LogOut size={14} />,
                            onClick: () => handleRemoveFromSpace(conv),
                          },
                          {
                            label: 'Delete conversation',
                            icon: <Trash2 size={14} />,
                            danger: true,
                            onClick: () => handleDeleteConversation(conv),
                          },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Pagination Controls */}
      {!loading && totalPages > 1 && (
        <div
          className={clsx(
            'fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-gray-200 dark:border-zinc-800',
            isSidebarPinned ? 'pl-0 sm:pl-80' : 'pl-0 sm:pl-16',
          )}
        >
          <div className="max-w-3xl mx-auto px-4">
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
    </div>
  )
}

export default SpaceView
