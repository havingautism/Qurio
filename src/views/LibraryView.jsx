import { useNavigate } from '@tanstack/react-router'
import clsx from 'clsx'
import {
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Library as LibraryIcon,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../App'
import EmojiDisplay from '../components/EmojiDisplay'
import FancyLoader from '../components/FancyLoader'
import { useToast } from '../contexts/ToastContext'
import {
  listConversations,
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

const LibraryView = () => {
  const { t, i18n } = useTranslation()
  const { spaces, deepResearchSpace, isSidebarPinned, showConfirmation } = useAppContext()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearchQuery, setActiveSearchQuery] = useState('') // Query actually sent to server
  const [sortOption, setSortOption] = useState(SORT_OPTION_KEYS[0])
  const [isSortOpen, setIsSortOpen] = useState(false)
  const [expandedActionId, setExpandedActionId] = useState(null)
  const toast = useToast()

  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  // const [emojiTick, setEmojiTick] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const limit = 10
  const deepResearchSpaceIds = useMemo(() => {
    const ids = new Set()
    if (deepResearchSpace?.id) ids.add(String(deepResearchSpace.id))
    ;(spaces || []).forEach(space => {
      if (space?.isDeepResearchSystem || space?.isDeepResearch || space?.is_deep_research) {
        ids.add(String(space.id))
      }
    })
    return Array.from(ids)
  }, [deepResearchSpace?.id, spaces])

  // Translated sort options for rendering
  const sortOptions = useMemo(
    () =>
      SORT_OPTION_KEYS.map(option => ({
        ...option,
        label: t(`views.${option.key}`),
      })),
    [t],
  )

  useEffect(() => {
    // Reset to page 1 when sort or active search changes
    setCurrentPage(1)
  }, [sortOption, activeSearchQuery, deepResearchSpaceIds])

  useEffect(() => {
    const fetchConversations = async () => {
      setLoading(true)
      const { data, count, error } = await listConversations({
        sortBy: sortOption.value,
        ascending: sortOption.ascending,
        page: currentPage,
        limit,
        search: activeSearchQuery,
        excludeSpaceIds: deepResearchSpaceIds,
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
  }, [currentPage, sortOption, activeSearchQuery, deepResearchSpaceIds])

  // useEffect(() => {
  //   const intervalId = setInterval(() => {
  //     setEmojiTick(prev => prev + 1)
  //   }, 2000)
  //   return () => clearInterval(intervalId)
  // }, [])

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

  const normalizeTitleEmojis = value => {
    if (Array.isArray(value)) {
      return value
        .map(item => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 1)
    }
    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) {
          return parsed
            .map(item => String(item || '').trim())
            .filter(Boolean)
            .slice(0, 1)
        }
      } catch {
        return []
      }
    }
    return []
  }

  const resolveConversationEmoji = (conv, fallbackEmoji) => {
    const emojiList = normalizeTitleEmojis(conv?.title_emojis ?? conv?.titleEmojis)
    const resolvedList = emojiList.length > 0 ? emojiList : fallbackEmoji ? [fallbackEmoji] : []
    if (resolvedList.length === 0) return '💬'
    return resolvedList[0]
    // const idText = String(conv?.id || '')
    // let hash = 0
    // for (let i = 0; i < idText.length; i += 1) {
    //   hash = (hash + idText.charCodeAt(i)) % resolvedList.length
    // }
    // const index = (hash + emojiTick) % resolvedList.length
    // return resolvedList[index]
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
      toast.error(t('errors.generic'))
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
  }

  return (
    <div
      className={clsx(
        'bg-background text-foreground h-full flex-1 overflow-y-auto transition-all duration-300',
        isSidebarPinned ? 'ml-0 sm:ml-72' : 'ml-0 sm:ml-16',
      )}
    >
      <div className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-6 sm:py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LibraryIcon size={32} className="text-primary-500" />
            <h1 className="text-3xl font-medium">{t('views.libraryView.title')}</h1>
          </div>
          <button
            onClick={() => navigate({ to: '/new_chat' })}
            className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            <Plus size={16} />
            <span>{t('views.newThread')}</span>
          </button>
        </div>

        {/* Search and Filters */}
        <div className="mb-8 space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <button
              onClick={handleSearch}
              className="absolute top-1/2 left-3 -translate-y-1/2 cursor-pointer text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-200"
            >
              <Search size={20} />
            </button>
            <input
              type="text"
              placeholder={t('views.libraryView.searchPlaceholder')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full rounded-xl border border-transparent bg-gray-100 py-3 pr-20 pl-10 placeholder-gray-500 transition-all outline-none focus:border-gray-300 dark:bg-zinc-900 dark:focus:border-zinc-700"
            />
            {searchQuery && (
              <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-1">
                <button
                  onClick={handleClearSearch}
                  className="p-1 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-200"
                  title="Clear"
                >
                  <X size={16} />
                </button>
                <div className="mx-1 h-4 w-px bg-gray-300 dark:bg-zinc-700" />
                <button
                  onClick={handleSearch}
                  className="bg-primary-500 hover:bg-primary-600 rounded-md p-1 text-white transition-colors"
                  title="Search"
                >
                  <ArrowRight size={16} />
                </button>
              </div>
            )}
            {!searchQuery && (
              <button
                onClick={handleSearch}
                className="absolute top-1/2 right-3 -translate-y-1/2 p-1 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-200"
                title="Search"
              >
                <ArrowRight size={16} />
              </button>
            )}
          </div>

          {/* Filter Row (Visual only for now) */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* <button className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-xs font-medium transition-colors">
                Select
              </button> */}
              <button className="flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700">
                <span>Type</span>
                <ChevronDown size={12} />
              </button>
              {/* <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-xs font-medium transition-colors">
                <span>Temporary Threads: Show</span>
                <ChevronDown size={12} />
              </button> */}
            </div>
            <div className="relative">
              <button
                onClick={() => setIsSortOpen(!isSortOpen)}
                className="flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
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
        <div className="relative space-y-4 pb-24">
          {loading ? (
            <div className="bg-background/40 absolute inset-0 flex items-center justify-center rounded-2xl md:backdrop-blur-md">
              <FancyLoader />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              {t('views.libraryView.noThreadsFound')}
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
                  onClick={() =>
                    navigate({
                      to: isDeepResearchConversation
                        ? '/deepresearch/$conversationId'
                        : '/conversation/$conversationId',
                      params: { conversationId: conv.id },
                    })
                  }
                  className="group hover:bg-primary-500/10 dark:hover:bg-primary-500/20 hover:border-primary-500/30 dark:hover:border-primary-500/40 relative cursor-pointer rounded-xl border-b border-gray-100 p-2 transition-colors last:border-0 hover:border dark:border-zinc-800/50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-zinc-800">
                      <EmojiDisplay
                        emoji={resolveConversationEmoji(conv, space?.emoji)}
                        size="2rem"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      {/* Title */}
                      <h3 className="mb-1 flex items-center gap-2 truncate text-lg font-medium text-gray-900 dark:text-gray-100">
                        {conv.title || t('views.untitledThread')}
                        {conv.is_favorited && (
                          <Bookmark size={14} className="text-primary-500 shrink-0 fill-current" />
                        )}
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
                          'rounded-full p-2 text-gray-400 transition-all hover:bg-black/5 hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-200',
                          'opacity-100',
                          'md:opacity-0 md:group-hover:opacity-100',
                          'flex min-h-[44px] min-w-[44px] items-center justify-center',
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
                    <div className="animate-in fade-in slide-in-from-top-1 mt-2 flex flex-wrap gap-2 px-1">
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          handleToggleFavorite(conv)
                        }}
                        className={clsx(
                          'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
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
                          setExpandedActionId(null)
                        }}
                        className="flex items-center gap-2 rounded-lg border border-red-100 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/30 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-900/20"
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
        </div>
      </div>

      {/* Fixed Pagination Controls */}
      {!loading && totalPages > 1 && (
        <div
          className={clsx(
            'bg-background/95 fixed right-0 bottom-0 left-0 border-t border-gray-200 backdrop-blur dark:border-zinc-800',
            isSidebarPinned ? 'pl-0 sm:pl-80' : 'pl-0 sm:pl-16',
          )}
        >
          <div className="mx-auto max-w-5xl px-6">
            <div className="flex items-center justify-center gap-4 py-4">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="rounded-lg p-2 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-800"
                title="Previous Page"
              >
                <ChevronLeft size={20} />
              </button>

              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {t('views.pageOf', { current: currentPage, total: totalPages })}
              </span>

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="rounded-lg p-2 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-800"
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

export default LibraryView
