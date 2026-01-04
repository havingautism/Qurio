import { useNavigate } from '@tanstack/react-router'
import clsx from 'clsx'
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Layers,
  LogOut,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../App'
import DropdownMenu from '../components/DropdownMenu'
import EmojiDisplay from '../components/EmojiDisplay'
import FancyLoader from '../components/FancyLoader'
import { useToast } from '../contexts/ToastContext'
import { listConversationsBySpace, toggleFavorite } from '../lib/conversationsService'
import { deleteConversation, removeConversationFromSpace } from '../lib/supabase'
import { spaceRoute } from '../router'

const SpaceView = () => {
  const { t, i18n } = useTranslation()
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
        sortBy: 'updated_at',
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
        toast.error(t('views.spaceView.failedToLoad'))
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
        title: t('confirmation.delete'),
        message: t('confirmation.deleteMessage', { title: conversation.title }),
        confirmText: t('confirmation.delete'),
        isDangerous: true,
        onConfirm: async () => {
          const { success, error } = await deleteConversation(conversation.id)

          if (success) {
            toast.success(t('views.spaceView.conversationDeleted'))
            setCurrentPage(1)
            // Notify Sidebar to refresh its conversation list
            window.dispatchEvent(new Event('conversations-changed'))
          } else {
            console.error('Failed to delete conversation:', error)
            toast.error(t('views.spaceView.failedToDelete'))
          }
        },
      })
    },
    [showConfirmation, toast, t],
  )

  const handleRemoveFromSpace = useCallback(
    async conversation => {
      const { data, error } = await removeConversationFromSpace(conversation.id)

      if (!error && data) {
        toast.success(t('views.spaceView.removedFromSpace'))
        setCurrentPage(1)
        // Notify Sidebar to refresh its conversation list
        window.dispatchEvent(new Event('conversations-changed'))
      } else {
        console.error('Failed to remove conversation from space:', error)
        toast.error(t('views.spaceView.failedToRemove'))
      }
    },
    [toast, t],
  )

  const handleToggleFavorite = useCallback(
    async conversation => {
      const newStatus = !conversation.is_favorited
      const { error } = await toggleFavorite(conversation.id, newStatus)

      if (error) {
        console.error('Failed to toggle favorite:', error)
        toast.error(t('sidebar.failedToUpdateFavorite'))
      } else {
        toast.success(newStatus ? t('views.addBookmark') : t('views.removeBookmark'))
        // Notify Sidebar to refresh its conversation list
        window.dispatchEvent(new Event('conversations-changed'))
      }
    },
    [toast, t],
  )

  if (!activeSpace) {
    return <div className="min-h-screen bg-background text-foreground" />
  }

  return (
    <div
      className={clsx(
        'flex flex-col items-center min-h-0 h-full overflow-y-auto p-6 pb-24 bg-background text-foreground transition-all duration-300',
        isSidebarPinned ? 'ml-0 sm:ml-72' : 'ml-0 sm:ml-16',
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
              title={t('views.editSpace')}
            >
              <Pencil size={16} />
            </button>
          </div>
        </div>

        {/* Section: My Topics */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-gray-900 dark:text-white font-medium">
            <Layers size={18} />
            <span>{t('views.spaceView.myTopics')}</span>
          </div>

          {/* Topics List */}
          <div className="relative flex flex-col gap-4">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center backdrop-blur-md bg-background/40 rounded-2xl">
                <FancyLoader />
              </div>
            )}
            {!loading && conversations.length === 0 && (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {t('views.spaceView.noThreadsFound')}
              </div>
            )}
            {!loading &&
              conversations.map((conv, i) => (
                <div
                  key={conv.id || i}
                  data-conversation-id={conv.id || i}
                  className="group relative py-3 sm:p-4 rounded-xl cursor-pointer transition-colors border-b border-gray-100 dark:border-zinc-800/50 last:border-0 hover:bg-primary-500/10 dark:hover:bg-primary-500/20 hover:border hover:border-primary-500/30 dark:hover:border-primary-500/40"
                  onClick={() => onOpenConversation && onOpenConversation(conv)}
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900 dark:text-gray-100 group-hover:text-primary-500 transition-colors flex items-center gap-2">
                        {conv.title || t('views.untitled')}
                        {conv.is_favorited && (
                          <Bookmark size={14} className="text-yellow-500 fill-current" />
                        )}
                      </h3>
                      <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                        <span>
                          {new Date(conv.updated_at || conv.created_at).toLocaleDateString(
                            i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US',
                            {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            },
                          )}
                        </span>
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
                            label: conv.is_favorited
                              ? t('views.removeBookmark')
                              : t('views.addBookmark'),
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
                            label: t('views.removeFromSpace'),
                            icon: <LogOut size={14} />,
                            onClick: () => handleRemoveFromSpace(conv),
                          },
                          {
                            label: t('views.deleteConversation'),
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
                title={t('views.previousPage')}
              >
                <ChevronLeft size={20} />
              </button>

              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {t('views.pageOf', { current: currentPage, total: totalPages })}
              </span>

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title={t('views.nextPage')}
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
