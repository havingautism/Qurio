import { useNavigate } from '@tanstack/react-router'
import clsx from 'clsx'
import { Bookmark, Check, ChevronDown, Clock, Coffee, Search, Trash2, Menu } from 'lucide-react'
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
  const { spaces, deepResearchSpace, isSidebarPinned, showConfirmation, toggleSidebar } =
    useAppContext()
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
      eventScope: 'bookmarks',
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
      notifyConversationsChanged({
        scopes: ['bookmarks', 'library', 'deepResearch', 'expert'],
      })
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
          notifyConversationsChanged({
            scopes: ['bookmarks', 'library', 'deepResearch', 'expert'],
          })
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
        'bg-background text-foreground h-full flex-1 overflow-y-auto transition-all duration-300',
        isSidebarPinned ? 'ml-0 sm:ml-72' : 'ml-0 sm:ml-16',
      )}
    >
      <div className="mx-auto w-full max-w-5xl px-3 py-3.5 sm:px-6 sm:py-8">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between sm:mb-8">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <button
              onClick={() => toggleSidebar()}
              aria-label="Open sidebar"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200/50 bg-white/90 p-0 leading-none text-gray-600 shadow-sm backdrop-blur-xl transition-all hover:bg-white hover:shadow-md md:hidden dark:border-zinc-800/50 dark:bg-zinc-900/90 dark:text-gray-300 dark:hover:bg-zinc-900"
            >
              <Menu size={20} strokeWidth={2} />
            </button>
            <Bookmark size={32} className="text-primary-500 fill-current" />
            <h1 className="text-2xl font-medium sm:text-3xl">{t('views.bookmarksView.title')}</h1>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="mb-5 space-y-3 sm:mb-8 sm:space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder={t('views.bookmarksView.searchPlaceholder')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-transparent bg-gray-100 py-2.5 pr-4 pl-10 text-sm placeholder-gray-500 transition-all outline-none focus:border-gray-300 sm:py-3 dark:bg-zinc-900 dark:focus:border-zinc-700"
            />
          </div>

          {/* Filter Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:bg-gray-200 sm:px-3 sm:text-xs dark:bg-zinc-800 dark:hover:bg-zinc-700">
                Select
              </button>
              <button className="flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:bg-gray-200 sm:px-3 sm:text-xs dark:bg-zinc-800 dark:hover:bg-zinc-700">
                <span>Type</span>
                <ChevronDown size={12} />
              </button>
            </div>
            <div className="relative">
              <button
                onClick={() => setIsSortOpen(!isSortOpen)}
                className="flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:bg-gray-200 sm:px-3 sm:text-xs dark:bg-zinc-800 dark:hover:bg-zinc-700"
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
                  <div className="absolute top-full right-0 z-20 mt-2 w-40 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
                    {sortOptions.map(option => (
                      <button
                        key={option.key}
                        onClick={() => {
                          setSortOption(SORT_OPTION_KEYS.find(o => o.key === option.key))
                          setIsSortOpen(false)
                        }}
                        className="group flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-zinc-800"
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
        <div className="relative space-y-2.5 sm:space-y-4">
          {loading ? (
            <div className="bg-background/40 absolute inset-0 flex items-center justify-center rounded-2xl backdrop-blur-md">
              <FancyLoader />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center text-gray-500">
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
                  className="group hover:bg-primary-500/10 dark:hover:bg-primary-500/20 hover:border-primary-500/30 dark:hover:border-primary-500/40 relative cursor-pointer rounded-xl border-b border-gray-100 p-1.5 transition-colors last:border-0 hover:border sm:p-4 dark:border-zinc-800/50"
                  onClick={() =>
                    navigate({
                      to: isDeepResearchConversation
                        ? '/deepresearch/$conversationId'
                        : '/conversation/$conversationId',
                      params: { conversationId: conv.id },
                    })
                  }
                >
                  <div className="flex items-start justify-between gap-2.5 sm:gap-4">
                    {space?.emoji && (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 sm:h-12 sm:w-12 dark:bg-zinc-800">
                        <EmojiDisplay emoji={space.emoji} size="2rem" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      {/* Title */}
                      <h3 className="mb-0.5 truncate text-base font-medium text-gray-900 sm:mb-1 sm:text-lg dark:text-gray-100">
                        {conv.title || t('views.untitledThread')}
                      </h3>

                      {/* Metadata */}
                      <div className="flex min-w-0 items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Clock size={14} />
                          <span className="whitespace-nowrap">
                            {formatDate(conv.updated_at || conv.created_at)}
                          </span>
                        </div>
                        {space && (
                          <div
                            className="flex min-w-0 items-center gap-1"
                            title={space.label || ''}
                          >
                            {space?.emoji && <EmojiDisplay emoji={space.emoji} size="0.95rem" />}
                            <span className="max-w-[8.5rem] truncate sm:max-w-[12rem]">
                              {space.label}
                            </span>
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
                          'rounded-full p-1.5 text-gray-400 transition-all hover:bg-black/5 hover:text-gray-600 sm:p-2 dark:hover:bg-white/10 dark:hover:text-gray-200',
                          'opacity-100',
                          'md:opacity-0 md:group-hover:opacity-100',
                          'flex min-h-[40px] min-w-[40px] items-center justify-center sm:min-h-[44px] sm:min-w-[44px]',
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
                    <div className="animate-in fade-in slide-in-from-top-1 mt-1.5 flex flex-wrap gap-1.5 px-0.5 sm:mt-3 sm:gap-2 sm:px-1">
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          handleToggleFavorite(conv)
                        }}
                        className={clsx(
                          'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors sm:gap-2 sm:px-3 sm:text-xs',
                          conv.is_favorited
                            ? 'border-yellow-200 bg-yellow-50 text-yellow-600 dark:border-yellow-800/30 dark:bg-yellow-900/20 dark:text-yellow-400'
                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-gray-400 dark:hover:bg-zinc-800',
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
                        className="flex items-center gap-1.5 rounded-lg border border-red-100 bg-white px-2.5 py-1.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50 sm:gap-2 sm:px-3 sm:text-xs dark:border-red-900/30 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-900/20"
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
            <div className="py-8 text-center text-sm text-gray-400">
              {t('views.bookmarksView.noMoreToLoad')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default BookmarksView
