import { useNavigate } from '@tanstack/react-router'
import clsx from 'clsx'
import { Bookmark, Check, ChevronDown, Coffee, Search, X, Menu } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../App'
import FancyLoader from '../components/FancyLoader'
import { useToast } from '../contexts/ToastContext'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import {
  listBookmarkedConversations,
  notifyConversationsChanged,
  toggleFavorite,
} from '../lib/conversationsService'
import { deleteConversation } from '../lib/supabase'
import ColorBendsBackground from '../components/ui/ColorBendsBackground'
import ConversationCard from '../components/ConversationCard'

// Sort option keys (constant for logic)
const SORT_OPTION_KEYS = [
  { key: 'newest', value: 'updated_at', ascending: false },
  { key: 'oldest', value: 'updated_at', ascending: true },
  { key: 'titleAZ', value: 'title', ascending: true },
  { key: 'titleZA', value: 'title', ascending: false },
]

const BookmarksView = () => {
  const { t } = useTranslation()
  const { spaces, deepResearchSpace, isSidebarPinned, showConfirmation, toggleSidebar } =
    useAppContext()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOption, setSortOption] = useState(SORT_OPTION_KEYS[0])
  const [isSortOpen, setIsSortOpen] = useState(false)
  const [isDeletingId, setIsDeletingId] = useState(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
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
      limit: 12, // Increased for grid
      dependencies: [sortOption],
      rootMargin: '100px',
      eventScope: 'bookmarks',
    },
  )

  // Filter conversations based on search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations
    const q = searchQuery.toLowerCase()
    return conversations.filter(c => (c.title || '').toLowerCase().includes(q))
  }, [conversations, searchQuery])

  // Helper to get space info
  const getSpaceInfo = spaceId => {
    if (!spaceId) return null
    return spaces.find(s => String(s.id) === String(spaceId))
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
      notifyConversationsChanged({
        scopes: ['bookmarks', 'library', 'deepResearch', 'expert'],
      })
    }
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
        setIsDeletingId(conversation.id)
        const { success, error } = await deleteConversation(conversation.id)

        if (success) {
          toast.success(t('views.libraryView.conversationDeleted'))
          notifyConversationsChanged({
            scopes: ['bookmarks', 'library', 'deepResearch', 'expert'],
          })
        } else {
          console.error('Failed to delete conversation:', error)
          toast.error(t('views.libraryView.failedToDelete'))
          setIsDeletingId(null)
        }
      },
    })
  }

  return (
    <div
      className={clsx(
        'relative flex h-full flex-1 flex-col overflow-hidden bg-[#f4f4f4] transition-all duration-300 dark:bg-black',
        isSidebarPinned ? 'ml-0 sm:ml-72' : 'ml-0 sm:ml-16',
      )}
    >
      <div className="pointer-events-none absolute inset-0 z-0 opacity-40 dark:opacity-20">
        <ColorBendsBackground />
      </div>
      <div className="relative z-10 flex h-full flex-col">
        {/* Fixed Header */}
        <div className="mx-auto w-full max-w-[1400px] shrink-0 px-4 pt-4 pb-2 sm:px-8 sm:pt-8 sm:pb-4">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between sm:mb-10">
            <div className="flex items-center gap-3">
              <button
                onClick={() => toggleSidebar()}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200/50 bg-white/90 p-0 text-gray-600 shadow-sm backdrop-blur-xl transition-all hover:bg-white sm:hidden dark:border-zinc-800/50 dark:bg-zinc-900/90 dark:text-gray-300"
              >
                <Menu size={20} strokeWidth={2} />
              </button>
              <div className="flex items-center gap-3">
                <Bookmark size={32} className="text-primary-500 fill-current" />
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  {t('views.bookmarksView.title')}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                className={clsx(
                  'flex h-10 w-10 items-center justify-center rounded-full transition-all hover:bg-white dark:hover:bg-zinc-800',
                  isSearchOpen ? 'text-primary-500' : 'text-gray-600 dark:text-gray-400',
                )}
              >
                <Search size={22} strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {/* Expandable Search Bar */}
          {isSearchOpen && (
            <div className="animate-in fade-in slide-in-from-top-2 mb-4 duration-200">
              <div className="relative">
                <Search
                  size={18}
                  className="absolute top-1/2 left-4 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  placeholder={t('views.bookmarksView.searchPlaceholder')}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  autoFocus
                  className="focus:ring-primary-500/20 w-full rounded-2xl border-none bg-white py-3 pr-12 pl-12 text-sm text-gray-900 shadow-sm transition-all outline-none focus:ring-2 sm:py-3.5 dark:bg-zinc-900 dark:text-white"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute top-1/2 right-3 -translate-y-1/2 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Filters Area */}
          <div className="mb-2 space-y-4 sm:mb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1.5 rounded-full bg-white/60 px-4 py-1.5 text-xs font-semibold text-gray-600 shadow-sm backdrop-blur-md transition-all hover:bg-white dark:bg-zinc-900/40 dark:text-gray-400 dark:hover:bg-zinc-900">
                  <span>Type</span>
                  <ChevronDown size={14} />
                </button>
              </div>
              <div className="relative">
                <button
                  onClick={() => setIsSortOpen(!isSortOpen)}
                  className="flex items-center gap-1.5 rounded-full bg-white/60 px-4 py-1.5 text-xs font-semibold text-gray-600 shadow-sm backdrop-blur-md transition-all hover:bg-white dark:bg-zinc-900/40 dark:text-gray-400 dark:hover:bg-zinc-900"
                >
                  <span>
                    {t('views.sort')}: {sortOptions.find(o => o.key === sortOption.key)?.label}
                  </span>
                  <ChevronDown size={14} />
                </button>
                {isSortOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setIsSortOpen(false)} />
                    <div className="absolute top-full right-0 z-30 mt-2 w-44 overflow-hidden rounded-2xl bg-white/95 p-1.5 shadow-xl backdrop-blur-xl dark:bg-zinc-900/95">
                      {sortOptions.map(option => (
                        <button
                          key={option.key}
                          onClick={() => {
                            setSortOption(SORT_OPTION_KEYS.find(o => o.key === option.key))
                            setIsSortOpen(false)
                          }}
                          className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800"
                        >
                          <span
                            className={
                              sortOption.key === option.key
                                ? 'text-primary-500 font-bold'
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
        </div>

        {/* Scrollable Container */}
        <div className="no-scrollbar sm:scrollbar-default relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] px-4 pb-4 sm:px-8 sm:pb-8">
            {/* Grid Content */}
            <div className="relative pb-32">
              {loading ? (
                <div className="flex h-64 items-center justify-center">
                  <FancyLoader />
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-zinc-900">
                    <Coffee size={28} className="text-gray-300" />
                  </div>
                  <p className="text-sm font-medium text-gray-500">
                    {t('views.bookmarksView.noBookmarks')}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredConversations.map(conv => {
                    const space = getSpaceInfo(conv.space_id)
                    const isDeepResearch =
                      space?.isDeepResearchSystem ||
                      (deepResearchSpace?.id &&
                        String(conv.space_id) === String(deepResearchSpace.id))
                    return (
                      <ConversationCard
                        key={conv.id}
                        conversation={conv}
                        space={space}
                        isDeepResearch={isDeepResearch}
                        onToggleFavorite={handleToggleFavorite}
                        onDelete={handleDeleteConversation}
                        isDeleting={isDeletingId === conv.id}
                      />
                    )
                  })}
                </div>
              )}

              {/* Infinite Scroll Sentinel & Loaders */}
              {!loading && hasMore && <div ref={loadMoreRef} className="h-20" />}

              {!loading && loadingMore && (
                <div className="mt-8 flex flex-col items-center gap-3">
                  <FancyLoader />
                  <span className="text-xs font-bold tracking-widest text-gray-400 uppercase sm:text-sm">
                    {t('views.bookmarksView.loadingMore')}
                  </span>
                </div>
              )}

              {!loading && !hasMore && filteredConversations.length > 0 && (
                <div className="mt-12 text-center text-xs font-bold tracking-widest text-gray-300 uppercase sm:text-sm">
                  {t('views.bookmarksView.noMoreToLoad')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BookmarksView
