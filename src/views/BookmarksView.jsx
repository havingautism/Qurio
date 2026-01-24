import { useNavigate } from '@tanstack/react-router'
import clsx from 'clsx'
import { Bookmark, Check, ChevronDown, Clock, Coffee, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../App'
import EmojiDisplay from '../components/EmojiDisplay'
import FancyLoader from '../components/FancyLoader'
import { useToast } from '../contexts/ToastContext'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import {
  listBookmarkedConversations,
  notifyConversationsChanged,
  toggleFavorite,
} from '../lib/conversationsService'
import { deleteConversation } from '../lib/supabase'

// Sort option keys (constant for logic)
const SORT_OPTION_KEYS = [
  { key: 'newest', value: 'updated_at', ascending: false },
  { key: 'oldest', value: 'updated_at', ascending: true },
  { key: 'titleAZ', value: 'title', ascending: true },
  { key: 'titleZA', value: 'title', ascending: false },
]

const BookmarksView = () => {
  const { t, i18n } = useTranslation()
  const { spaces, deepResearchSpace, isSidebarPinned, showConfirmation } = useAppContext()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOption, setSortOption] = useState(SORT_OPTION_KEYS[0])
  const [isSortOpen, setIsSortOpen] = useState(false)
  const [expandedActionId, setExpandedActionId] = useState(null)
  const toast = useToast()

  // Translated sort options for rendering
  const sortOptions = useMemo(
    () =>
      SORT_OPTION_KEYS.map(option => ({
        ...option,
        label: t(`views.${option.key}`),
      })),
    [t],
  )

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
    // Use current language for date formatting
    const locale = i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US'
    return date.toLocaleString(locale, {
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
      toast.error(t('sidebar.failedToUpdateFavorite'))
    } else {
      toast.success(newStatus ? t('views.addBookmark') : t('views.removeBookmark'))
      // Refresh data
      notifyConversationsChanged()
    }
    setExpandedActionId(null)
  }

  // Handle delete conversation
  const handleDeleteConversation = async conversation => {
    if (!conversation) return

    showConfirmation({
      title: t('confirmation.delete'),
      message: t('confirmation.deleteMessage', { title: conversation.title }),
      confirmText: t('confirmation.delete'),
      isDangerous: true,
      onConfirm: async () => {
        const { success, error } = await deleteConversation(conversation.id)

        if (success) {
          toast.success(t('views.libraryView.conversationDeleted'))
          // Refresh data
          notifyConversationsChanged()
        } else {
          console.error('Failed to delete conversation:', error)
          toast.error(t('views.libraryView.failedToDelete'))
        }
      },
    })
    setExpandedActionId(null)
  }

  return (
    <div
      className={clsx(
        'flex-1 h-full overflow-y-auto bg-background text-foreground transition-all duration-300',
        isSidebarPinned ? 'ml-0 sm:ml-72' : 'ml-0 sm:ml-16',
      )}
    >
      <div className="w-full max-w-5xl mx-auto sm:px-6 sm:py-8 px-3 py-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Bookmark size={32} className="text-primary-500 fill-current" />
            <h1 className="text-3xl font-medium">{t('views.bookmarksView.title')}</h1>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="mb-8 space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder={t('views.bookmarksView.searchPlaceholder')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-gray-100 dark:bg-zinc-900 border border-transparent focus:border-gray-300 dark:focus:border-zinc-700 rounded-xl py-3 pl-10 pr-4 outline-none transition-all placeholder-gray-500"
            />
          </div>

          {/* Filter Row */}
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
                <span>
                  {t('views.sort')}: {sortOptions.find(o => o.key === sortOption.key)?.label}
                </span>
                <ChevronDown size={12} />
              </button>

              {/* Sort Dropdown */}
              {isSortOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsSortOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-lg z-20 overflow-hidden py-1">
                    {sortOptions.map(option => (
                      <button
                        key={option.key}
                        onClick={() => {
                          setSortOption(SORT_OPTION_KEYS.find(o => o.key === option.key))
                          setIsSortOpen(false)
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-zinc-800 flex items-center justify-between group"
                      >
                        <span
                          className={
                            sortOption.key === option.key
                              ? 'text-primary-500'
                              : 'text-gray-700 dark:text-gray-300'
                          }
                        >
                          {option.label}
                        </span>
                        {sortOption.key === option.key && (
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
              <p className="text-sm">{t('views.bookmarksView.noBookmarks')}</p>
            </div>
          ) : (
            filteredConversations.map(conv => {
              const space = getSpaceInfo(conv.space_id)
              const isDeepResearchConversation =
                space?.isDeepResearchSystem ||
                (deepResearchSpace?.id && String(conv.space_id) === String(deepResearchSpace.id))
              return (
                <div
                  key={conv.id}
                  data-conversation-id={conv.id}
                  className="group relative py-3 sm:p-4 rounded-xl cursor-pointer transition-colors border-b border-gray-100 dark:border-zinc-800/50 last:border-0 hover:bg-primary-500/10 dark:hover:bg-primary-500/20 hover:border hover:border-primary-500/30 dark:hover:border-primary-500/40"
                  onClick={() =>
                    navigate({
                      to: isDeepResearchConversation
                        ? '/deepresearch/$conversationId'
                        : '/conversation/$conversationId',
                      params: { conversationId: conv.id },
                    })
                  }
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
                        {conv.title || t('views.untitledThread')}
                      </h3>

                      {/* Metadata */}
                      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                        <div className="flex items-center gap-1.5">
                          <Clock size={14} />
                          <span>{formatDate(conv.updated_at || conv.created_at)}</span>
                        </div>
                        {space && (
                          <div className="flex items-center gap-1.5">
                            <span>{space.label}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="relative">
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          setExpandedActionId(prev => (prev === conv.id ? null : conv.id))
                        }}
                        className={clsx(
                          'p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-all rounded-full hover:bg-black/5 dark:hover:bg-white/10',
                          'opacity-100',
                          'md:opacity-0 md:group-hover:opacity-100',
                          'min-w-[44px] min-h-[44px] flex items-center justify-center',
                        )}
                      >
                        <ChevronDown
                          size={18}
                          strokeWidth={2}
                          className={clsx(
                            'transition-transform duration-200',
                            expandedActionId === conv.id && 'rotate-180',
                          )}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Collapsible Actions Section */}
                  {expandedActionId === conv.id && (
                    <div className="flex flex-wrap gap-2 mt-3 px-1 animate-in fade-in slide-in-from-top-1">
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          handleToggleFavorite(conv)
                        }}
                        className={clsx(
                          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                          conv.is_favorited
                            ? 'bg-yellow-50 text-yellow-600 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800/30'
                            : 'bg-white dark:bg-zinc-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800',
                        )}
                      >
                        <Bookmark size={13} className={clsx(conv.is_favorited && 'fill-current')} />
                        <span>
                          {conv.is_favorited ? t('views.removeBookmark') : t('views.addBookmark')}
                        </span>
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          handleDeleteConversation(conv)
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-zinc-900 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <Trash2 size={13} />
                        <span>{t('views.deleteConversation')}</span>
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}

          {/* Invisible Sentinel for Infinite Scroll */}
          {!loading && hasMore && <div ref={loadMoreRef} className="h-1" />}

          {/* Loading More Indicator */}
          {!loading && loadingMore && (
            <div className="flex flex-col items-center gap-3 py-8">
              <FancyLoader />
              <span className="text-sm text-gray-400">{t('views.bookmarksView.loadingMore')}</span>
            </div>
          )}

          {/* No More Data Message */}
          {!loading && !hasMore && conversations.length > 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              {t('views.bookmarksView.noMoreToLoad')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default BookmarksView
