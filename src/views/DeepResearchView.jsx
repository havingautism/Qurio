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
  Microscope,
  Plus,
  Search,
  Trash2,
  X,
  Menu,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../App'
import EmojiDisplay from '../components/EmojiDisplay'
import FancyLoader from '../components/FancyLoader'
import { useToast } from '../contexts/ToastContext'
import {
  conversationEventHasScope,
  listConversationsBySpace,
  notifyConversationsChanged,
  toggleFavorite,
} from '../lib/conversationsService'
import { deleteConversation } from '../lib/supabase'
import { useDeepResearchGuide } from '../contexts/DeepResearchGuideContext'

// Sort option keys (constant for logic)
const SORT_OPTION_KEYS = [
  { key: 'newest', value: 'updated_at', ascending: false },
  { key: 'oldest', value: 'updated_at', ascending: true },
  { key: 'titleAZ', value: 'title', ascending: true },
  { key: 'titleZA', value: 'title', ascending: false },
]

const DeepResearchView = () => {
  const { t, i18n } = useTranslation()
  const { spaces, deepResearchSpace, isSidebarPinned, showConfirmation, toggleSidebar } =
    useAppContext()
  const { openDeepResearchGuide } = useDeepResearchGuide()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearchQuery, setActiveSearchQuery] = useState('')
  const [sortOption, setSortOption] = useState(SORT_OPTION_KEYS[0])
  const [isSortOpen, setIsSortOpen] = useState(false)
  const [expandedActionId, setExpandedActionId] = useState(null)
  const toast = useToast()

  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const limit = 10

  const deepResearchSpaceId = deepResearchSpace?.id ? String(deepResearchSpace.id) : null

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
    setCurrentPage(1)
  }, [sortOption, activeSearchQuery, deepResearchSpaceId])

  useEffect(() => {
    const fetchConversations = async () => {
      if (!deepResearchSpaceId) {
        setConversations([])
        setTotalCount(0)
        setLoading(false)
        return
      }
      setLoading(true)
      const { data, count, error } = await listConversationsBySpace(deepResearchSpaceId, {
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
        console.error('Failed to load deep research conversations:', error)
        toast.error('Failed to load conversations')
      }
      setLoading(false)
    }

    fetchConversations()

    const handleConversationsChanged = event => {
      if (!conversationEventHasScope(event, 'deepResearch')) return
      fetchConversations()
    }
    window.addEventListener('conversations-changed', handleConversationsChanged)
    return () => window.removeEventListener('conversations-changed', handleConversationsChanged)
  }, [currentPage, sortOption, activeSearchQuery, deepResearchSpaceId])

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

  const getSpaceInfo = spaceId => {
    if (!spaceId) return null
    return spaces.find(s => String(s.id) === String(spaceId))
  }

  const formatDate = dateString => {
    const date = new Date(dateString)
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

  const handleToggleFavorite = async conversation => {
    const newStatus = !conversation.is_favorited
    const { error } = await toggleFavorite(conversation.id, newStatus)

    if (error) {
      console.error('Failed to toggle favorite:', error)
      toast.error(t('errors.generic'))
    } else {
      toast.success(newStatus ? t('views.addBookmark') : t('views.removeBookmark'))
      notifyConversationsChanged({ scopes: ['deepResearch', 'bookmarks'] })
    }
    setExpandedActionId(null)
  }

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
          toast.success(t('views.deepResearchView.conversationDeleted'))
          notifyConversationsChanged({ scopes: ['deepResearch', 'bookmarks'] })
        } else {
          console.error('Failed to delete conversation:', error)
          toast.error(t('views.deepResearchView.failedToDelete'))
        }
      },
    })
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
    if (resolvedList.length === 0) return '🔬'
    return resolvedList[0]
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
            <Microscope size={32} className="text-primary-500" />
            <h1 className="text-2xl font-medium sm:text-3xl">
              {t('views.deepResearchView.title')}
            </h1>
          </div>
          <button
            onClick={openDeepResearchGuide}
            className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-200 sm:gap-2 sm:px-4 sm:py-2 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">{t('views.newResearch')}</span>
          </button>
        </div>

        {/* Search and Filters */}
        <div className="mb-5 space-y-3 sm:mb-8 sm:space-y-4">
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
              placeholder={t('views.deepResearchView.searchPlaceholder')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full rounded-xl border border-transparent bg-gray-100 py-2.5 pr-20 pl-10 text-sm placeholder-gray-500 transition-all outline-none focus:border-gray-300 sm:py-3 dark:bg-zinc-900 dark:focus:border-zinc-700"
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

          {/* Filter Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
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
        <div className="relative space-y-2.5 pb-20 sm:space-y-4 sm:pb-24">
          {loading ? (
            <div className="bg-background/40 absolute inset-0 flex items-center justify-center rounded-2xl backdrop-blur-md">
              <FancyLoader />
            </div>
          ) : conversations.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              {t('views.deepResearchView.noThreadsFound')}
            </div>
          ) : (
            conversations.map(conv => {
              const space = getSpaceInfo(conv.space_id)
              return (
                <div
                  key={conv.id}
                  data-conversation-id={conv.id}
                  onClick={() =>
                    navigate({
                      to: '/deepresearch/$conversationId',
                      params: { conversationId: conv.id },
                    })
                  }
                  className="group hover:bg-primary-500/10 dark:hover:bg-primary-500/20 hover:border-primary-500/30 dark:hover:border-primary-500/40 relative cursor-pointer rounded-xl border-b border-gray-100 p-1.5 transition-colors last:border-0 hover:border sm:p-2 dark:border-zinc-800/50"
                >
                  <div className="flex items-start justify-between gap-2.5 sm:gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 sm:h-12 sm:w-12 dark:bg-zinc-800">
                      <EmojiDisplay
                        emoji={resolveConversationEmoji(conv, space?.emoji)}
                        size="2rem"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      {/* Title */}
                      <h3 className="mb-0.5 flex items-center gap-1.5 truncate text-base font-medium text-gray-900 sm:mb-1 sm:gap-2 sm:text-lg dark:text-gray-100">
                        {conv.title || t('views.untitledThread')}
                        {conv.is_favorited && (
                          <Bookmark size={14} className="text-primary-500 shrink-0 fill-current" />
                        )}
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
                    <div className="animate-in fade-in slide-in-from-top-1 mt-1.5 flex flex-wrap gap-1.5 px-0.5 sm:mt-2 sm:gap-2 sm:px-1">
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
                          setExpandedActionId(null)
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
          <div className="mx-auto max-w-5xl px-3 sm:px-6">
            <div className="flex items-center justify-center gap-2 py-2.5 sm:gap-4 sm:py-4">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="rounded-lg p-1.5 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 sm:p-2 dark:hover:bg-zinc-800"
                title="Previous Page"
              >
                <ChevronLeft size={20} />
              </button>

              <span className="text-xs font-medium text-gray-600 sm:text-sm dark:text-gray-400">
                {t('views.pageOf', { current: currentPage, total: totalPages })}
              </span>

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="rounded-lg p-1.5 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 sm:p-2 dark:hover:bg-zinc-800"
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

export default DeepResearchView
