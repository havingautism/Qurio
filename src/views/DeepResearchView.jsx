import { useNavigate } from '@tanstack/react-router'
import clsx from 'clsx'
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  X,
  Menu,
} from 'lucide-react'
import { Flask as FlaskIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../App'
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
import ColorBendsBackground from '../components/ui/ColorBendsBackground'
import ConversationCard from '../components/ConversationCard'

// Sort option keys (constant for logic)
const SORT_OPTION_KEYS = [
  { key: 'newest', value: 'updated_at', ascending: false },
  { key: 'oldest', value: 'updated_at', ascending: true },
  { key: 'titleAZ', value: 'title', ascending: true },
  { key: 'titleZA', value: 'title', ascending: false },
]

const DeepResearchView = () => {
  const { t } = useTranslation()
  const { spaces, deepResearchSpace, isSidebarPinned, showConfirmation, toggleSidebar } =
    useAppContext()
  const { openDeepResearchGuide } = useDeepResearchGuide()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearchQuery, setActiveSearchQuery] = useState('')
  const [sortOption, setSortOption] = useState(SORT_OPTION_KEYS[0])
  const [isSortOpen, setIsSortOpen] = useState(false)
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [isDeletingId, setIsDeletingId] = useState(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const limit = 12
  const toast = useToast()

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
  }

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
          toast.success(t('views.deepResearchView.conversationDeleted'))
          notifyConversationsChanged({ scopes: ['deepResearch', 'bookmarks'] })
        } else {
          console.error('Failed to delete conversation:', error)
          toast.error(t('views.deepResearchView.failedToDelete'))
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
                <FlaskIcon size={32} weight="duotone" className="text-primary-500" />
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  {t('views.deepResearchView.title')}
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
              <button
                onClick={openDeepResearchGuide}
                className="flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-bold text-gray-900 shadow-sm transition-all hover:scale-105 hover:shadow-md active:scale-95 dark:bg-zinc-800 dark:text-white"
              >
                <Plus size={18} />
                <span className="hidden sm:inline">{t('views.newResearch')}</span>
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
                  placeholder={t('views.deepResearchView.searchPlaceholder')}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  className="focus:ring-primary-500/20 w-full rounded-2xl border-none bg-white py-3 pr-24 pl-12 text-sm text-gray-900 shadow-sm transition-all outline-none focus:ring-2 sm:py-3.5 dark:bg-zinc-900 dark:text-white"
                />
                <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-1">
                  {searchQuery && (
                    <button
                      onClick={handleClearSearch}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
                    >
                      <X size={16} />
                    </button>
                  )}
                  <button
                    onClick={handleSearch}
                    className="bg-primary-500 hover:bg-primary-600 flex h-8 w-8 items-center justify-center rounded-xl text-white transition-all active:scale-90"
                  >
                    <ArrowRight size={18} />
                  </button>
                </div>
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
          <div className="mx-auto w-full max-w-[1400px] px-4 pt-2 pb-4 sm:px-8 sm:pt-2 sm:pb-8">
            {/* Grid Content */}
            <div className="relative pb-32">
              {loading ? (
                <div className="flex h-64 items-center justify-center">
                  <FancyLoader />
                </div>
              ) : conversations.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-zinc-900">
                    <FlaskIcon size={28} weight="regular" className="text-gray-300" />
                  </div>
                  <p className="text-sm font-medium text-gray-500">
                    {t('views.deepResearchView.noThreadsFound')}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
                  {conversations.map(conv => {
                    const space = getSpaceInfo(conv.space_id)
                    return (
                      <ConversationCard
                        key={conv.id}
                        conversation={conv}
                        space={space}
                        isDeepResearch={true}
                        onToggleFavorite={handleToggleFavorite}
                        onDelete={handleDeleteConversation}
                        isDeleting={isDeletingId === conv.id}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Floating Pagination Controls */}
        {!loading && totalPages > 1 && (
          <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-40 flex justify-center pb-8 sm:pb-10">
            <div className="pointer-events-auto flex items-center gap-2 rounded-3xl bg-white/80 p-1.5 shadow-2xl backdrop-blur-2xl transition-all sm:gap-3 dark:bg-zinc-900/80">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-gray-600 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700"
              >
                <ChevronLeft size={20} />
              </button>

              <div className="px-3 text-xs font-bold tracking-widest text-gray-500 uppercase sm:text-sm">
                {currentPage} <span className="mx-1 text-gray-300">/</span> {totalPages}
              </div>

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-gray-600 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default DeepResearchView
