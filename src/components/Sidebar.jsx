import clsx from 'clsx'
import {
  Blocks,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Coffee,
  Laptop,
  LayoutGrid,
  Library,
  Microscope,
  Moon,
  Pin,
  Plus,
  Settings,
  Smile,
  SquareStack,
  Sun,
  Trash2,
} from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../App'
import { useToast } from '../contexts/ToastContext'
import useScrollLock from '../hooks/useScrollLock'
import { getAgentDisplayDescription, getAgentDisplayName } from '../lib/agentDisplay'
import {
  listBookmarkedConversations,
  listConversations,
  listConversationsBySpace,
  notifyConversationsChanged,
  toggleFavorite,
} from '../lib/conversationsService'
import { getSpaceDisplayLabel } from '../lib/spaceDisplay'
import { deleteConversation } from '../lib/supabase'
import DotLoader from './DotLoader'
import EmojiDisplay from './EmojiDisplay'
import Logo from './Logo'
import { useDeepResearchGuide } from '../contexts/DeepResearchGuideContext'

const SIDEBAR_FETCH_LIMIT = 20

const Sidebar = ({
  isOpen = false, // Mobile state
  onClose, // Mobile state
  onOpenSettings,
  onOpenTools,
  onNavigate,
  onNavigateToSpace,
  onCreateSpace,
  onEditSpace,
  onOpenConversation,
  spaces,
  spacesLoading = false,
  agents = [],
  agentsLoading = false,
  onCreateAgent,
  onEditAgent,
  theme,
  onToggleTheme,
  activeConversationId,
  onPinChange,
}) => {
  const { openDeepResearchGuide } = useDeepResearchGuide()
  const { t, i18n } = useTranslation()
  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)')?.matches ||
      window.matchMedia?.('(display-mode: minimal-ui)')?.matches ||
      window.matchMedia?.('(display-mode: fullscreen)')?.matches ||
      window.navigator?.standalone === true)
  useScrollLock(isOpen && !isStandalone)

  const [isHovered, setIsHovered] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isPinned, setIsPinned] = useState(() => {
    const saved = localStorage.getItem('sidebar-pinned')
    // Default to false on mobile if using simple logic, but here relying on isOpen for mobile
    return saved === 'true'
  })
  const [activeTab, setActiveTab] = useState('library') // 'library', 'deepResearch', 'discover', 'spaces'
  const [hoveredTab, setHoveredTab] = useState(null)
  const [conversations, setConversations] = useState([])
  const [nextCursor, setNextCursor] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  // const [emojiTick, setEmojiTick] = useState(0)

  // Dedicated Bookmarks State
  const [bookmarkedConversations, setBookmarkedConversations] = useState([])
  const [bookmarkNextCursor, setBookmarkNextCursor] = useState(null)
  const [bookmarkHasMore, setBookmarkHasMore] = useState(true)
  const [isBookmarksLoading, setIsBookmarksLoading] = useState(false)
  const [bookmarksLoadingMore, setBookmarksLoadingMore] = useState(false)
  const [expandedActionId, setExpandedActionId] = useState(null)

  // Deep Research conversations
  const [deepResearchConversations, setDeepResearchConversations] = useState([])
  const [deepResearchNextCursor, setDeepResearchNextCursor] = useState(null)
  const [deepResearchHasMore, setDeepResearchHasMore] = useState(true)
  const [isDeepResearchLoading, setIsDeepResearchLoading] = useState(false)
  const [deepResearchLoadingMore, setDeepResearchLoadingMore] = useState(false)

  // Spaces interaction state
  const [expandedSpaces, setExpandedSpaces] = useState(new Set())
  const [spaceConversations, setSpaceConversations] = useState({}) // { [spaceId]: { items: [], nextCursor: null, hasMore: true, loading: false } }
  const [spacesLimit, setSpacesLimit] = useState(SIDEBAR_FETCH_LIMIT)
  const [spacesLoadingMore, setSpacesLoadingMore] = useState(false)

  const toast = useToast()
  const {
    showConfirmation,
    deepResearchSpace,
    conversationStatuses,
    conversations: appConversations,
    conversationsLoading,
  } = useAppContext()
  const isConversationsLoading = conversationsLoading && conversations.length === 0

  const getConversationStatusMeta = status => {
    if (status === 'loading') {
      return {
        colorClass: 'bg-amber-500 border-amber-300 dark:border-amber-400',
        label: t('sidebar.status.streaming'),
      }
    }
    if (status === 'done') {
      return {
        colorClass: 'bg-emerald-500 border-emerald-300 dark:border-emerald-400',
        label: t('sidebar.status.complete'),
      }
    }
    return null
  }

  const renderConversationStatusDot = status => {
    const meta = getConversationStatusMeta(status)
    if (!meta) return null
    return (
      <span className="flex items-center gap-1">
        <span
          aria-hidden="true"
          className={clsx('h-2 w-2 rounded-full border transition-colors', meta.colorClass)}
        />
        <span className="sr-only">{meta.label}</span>
      </span>
    )
  }

  const spaceById = useMemo(() => {
    const map = new Map()
    for (const space of spaces || []) {
      if (space?.id != null) {
        map.set(String(space.id), space)
      }
    }
    return map
  }, [spaces])

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
  const deepResearchSpaceId = deepResearchSpaceIds[0] || null

  const getConversationSpace = conv => {
    const spaceId = conv?.space_id
    if (!spaceId) return null
    return spaceById.get(String(spaceId)) || null
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

  const formatDateTime = value => {
    if (!value) return t('sidebar.recently')
    // Use current language for date formatting
    const locale = i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US'
    return new Date(value).toLocaleString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }

  const closeActions = () => setExpandedActionId(null)

  const displayTab = hoveredTab || activeTab
  const isMobileFastSidebar = isMobile

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mediaQuery = window.matchMedia('(max-width: 768px)')
    const update = () => setIsMobile(mediaQuery.matches)
    update()
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', update)
      return () => mediaQuery.removeEventListener('change', update)
    }
    mediaQuery.addListener(update)
    return () => mediaQuery.removeListener(update)
  }, [])
  const isExpanded = isOpen || isPinned || isHovered

  // Persist pin state to localStorage and notify parent
  useEffect(() => {
    localStorage.setItem('sidebar-pinned', isPinned)
    if (onPinChange) {
      onPinChange(isPinned)
    }
  }, [isPinned, onPinChange])

  // useEffect(() => {
  //   const intervalId = setInterval(() => {
  //     setEmojiTick(prev => prev + 1)
  //   }, 2000)
  //   return () => clearInterval(intervalId)
  // }, [])

  const fetchMoreConversations = async () => {
    try {
      setLoadingMore(true)

      const {
        data,
        error,
        nextCursor: newCursor,
        hasMore: moreAvailable,
      } = await listConversations({
        limit: SIDEBAR_FETCH_LIMIT,
        cursor: nextCursor,
        excludeSpaceIds: deepResearchSpaceIds,
      })

      if (!error && data) {
        setConversations(prev => [...prev, ...data])
        setNextCursor(newCursor)
        setHasMore(moreAvailable)
      } else {
        console.error('Failed to load conversations:', error)
      }
    } catch (err) {
      console.error('Error loading conversations:', err)
    } finally {
      setLoadingMore(false)
    }
  }

  const fetchBookmarkedConversations = async (isInitial = true) => {
    try {
      if (isInitial) {
        setIsBookmarksLoading(true)
      } else {
        setBookmarksLoadingMore(true)
      }

      const {
        data,
        error,
        nextCursor: newCursor,
        hasMore: moreAvailable,
      } = await listBookmarkedConversations({
        limit: SIDEBAR_FETCH_LIMIT,
        cursor: isInitial ? null : bookmarkNextCursor,
      })

      if (!error && data) {
        if (isInitial) {
          setBookmarkedConversations(data)
        } else {
          setBookmarkedConversations(prev => [...prev, ...data])
        }
        setBookmarkNextCursor(newCursor)
        setBookmarkHasMore(moreAvailable)
      } else {
        console.error('Failed to load bookmarked conversations:', error)
      }
    } catch (err) {
      console.error('Error loading bookmarked conversations:', err)
    } finally {
      setIsBookmarksLoading(false)
      setBookmarksLoadingMore(false)
    }
  }

  const fetchDeepResearchConversations = async (isInitial = true) => {
    if (!deepResearchSpaceId) {
      setDeepResearchConversations([])
      setDeepResearchNextCursor(null)
      setDeepResearchHasMore(false)
      setIsDeepResearchLoading(false)
      setDeepResearchLoadingMore(false)
      return
    }

    try {
      if (isInitial) {
        setIsDeepResearchLoading(true)
      } else {
        setDeepResearchLoadingMore(true)
      }

      const {
        data,
        error,
        nextCursor: newCursor,
        hasMore: moreAvailable,
      } = await listConversationsBySpace(deepResearchSpaceId, {
        limit: SIDEBAR_FETCH_LIMIT,
        cursor: isInitial ? null : deepResearchNextCursor,
      })

      if (!error && data) {
        if (isInitial) {
          setDeepResearchConversations(data)
        } else {
          setDeepResearchConversations(prev => [...prev, ...data])
        }
        setDeepResearchNextCursor(newCursor)
        setDeepResearchHasMore(moreAvailable)
      } else {
        console.error('Failed to load deep research conversations:', error)
      }
    } catch (err) {
      console.error('Error loading deep research conversations:', err)
    } finally {
      setIsDeepResearchLoading(false)
      setDeepResearchLoadingMore(false)
    }
  }

  useEffect(() => {
    const filtered = (appConversations || []).filter(
      conv => !deepResearchSpaceIds.includes(String(conv.space_id)),
    )
    setConversations(filtered)
    setNextCursor(filtered.length > 0 ? filtered[filtered.length - 1].updated_at : null)
    setHasMore(filtered.length >= SIDEBAR_FETCH_LIMIT)
    setLoadingMore(false)
  }, [appConversations, deepResearchSpaceIds])

  useEffect(() => {
    fetchBookmarkedConversations(true)
    fetchDeepResearchConversations(true)

    const handleConversationsChanged = () => {
      fetchBookmarkedConversations(true)
      fetchDeepResearchConversations(true)
    }
    window.addEventListener('conversations-changed', handleConversationsChanged)
    return () => window.removeEventListener('conversations-changed', handleConversationsChanged)
  }, [deepResearchSpaceId])

  // Close dropdown when sidebar collapses (mouse leaves)
  useEffect(() => {
    if (!isHovered) {
      closeActions()
    }
  }, [isHovered])

  // Reset visible spaces count when switching back to the Spaces tab
  useEffect(() => {
    if (activeTab === 'spaces') {
      setSpacesLimit(SIDEBAR_FETCH_LIMIT)
    }
  }, [activeTab])

  // Nav items - use constant keys for logic, translate labels for display
  const NAV_ITEM_KEYS = [
    { id: 'library', icon: Library },
    { id: 'deepResearch', icon: Microscope },

    { id: 'spaces', icon: LayoutGrid },
    { id: 'agents', icon: Smile },
    { id: 'bookmarks', icon: Bookmark },
  ]

  const navItems = useMemo(
    () => NAV_ITEM_KEYS.map(item => ({ ...item, label: t(`sidebar.${item.id}`) })),
    [t],
  )

  const getThemeIcon = () => {
    switch (theme) {
      case 'light':
        return <Sun size={20} />
      case 'dark':
        return <Moon size={20} />
      case 'system':
        return <Laptop size={20} />
      default:
        return <Laptop size={20} />
    }
  }

  const groupConversationsByDate = items => {
    const startOfDay = date => {
      const d = new Date(date)
      d.setHours(0, 0, 0, 0)
      return d
    }

    const todayStart = startOfDay(new Date())
    const groups = {
      Today: [],
      Yesterday: [],
      'Previous 7 Days': [],
      Past: [],
    }

    items.forEach(conv => {
      const convDate = startOfDay(conv.updated_at || conv.created_at)
      const diffDays = Math.floor((todayStart - convDate) / (1000 * 60 * 60 * 24))

      if (diffDays === 0) {
        groups.Today.push(conv)
      } else if (diffDays === 1) {
        groups.Yesterday.push(conv)
      } else if (diffDays <= 7) {
        groups['Previous 7 Days'].push(conv)
      } else {
        groups.Past.push(conv)
      }
    })

    return Object.keys(groups)
      .map(title => ({ title, items: groups[title] }))
      .filter(section => section.items.length > 0)
  }

  const handleDeleteConversation = async conversation => {
    if (!conversation) return

    showConfirmation({
      title: t('confirmation.delete'),
      message: t('confirmation.deleteMessage', { title: conversation.title }),
      confirmText: t('confirmation.delete'),
      cancelText: t('confirmation.cancel'),
      isDangerous: true,
      onConfirm: async () => {
        const { success, error } = await deleteConversation(conversation.id)

        if (success) {
          closeActions()
          notifyConversationsChanged()
          if (activeTab === 'deepResearch' && deepResearchSpaceId) {
            fetchDeepResearchConversations(true)
          }
          if (activeTab === 'bookmarks' || conversation.is_favorited) {
            fetchBookmarkedConversations(true)
          }

          // Only navigate home if we deleted the currently active conversation
          if (conversation.id === activeConversationId) {
            onNavigate('home')
          }
        } else {
          console.error('Failed to delete conversation:', error)
          toast.error(t('sidebar.deleteFailed') || 'Failed to delete conversation')
        }
      },
    })
  }

  const handleToggleFavorite = async conversation => {
    const newStatus = !conversation.is_favorited
    // Optimistic update
    setConversations(prev =>
      prev.map(c => (c.id === conversation.id ? { ...c, is_favorited: newStatus } : c)),
    )
    setDeepResearchConversations(prev =>
      prev.map(c => (c.id === conversation.id ? { ...c, is_favorited: newStatus } : c)),
    )

    // Optimistically update bookmarks list
    // If we are adding to favorites
    if (newStatus) {
      // We can't easily add it to the correct sorted position without a refetch or guessing.
      // But simply prepending or checking sort might be enough for a quick UI response.
      // For simplicity and correctness with pagination, we might just want to refetch or prepend if it's 'updated_at' desc.
      // Let's try to just prepend it to bookmarks list if it doesn't exist.
      setBookmarkedConversations(prev => {
        if (prev.find(c => c.id === conversation.id)) return prev
        return [{ ...conversation, is_favorited: true }, ...prev]
      })
    } else {
      // Removing from favorites
      setBookmarkedConversations(prev => prev.filter(c => c.id !== conversation.id))
    }

    const { error } = await toggleFavorite(conversation.id, newStatus)
    if (error) {
      console.error('Failed to toggle favorite:', error)
      toast.error(t('sidebar.failedToUpdateFavorite'))
      // Revert optimistic update
      setConversations(prev =>
        prev.map(c => (c.id === conversation.id ? { ...c, is_favorited: !newStatus } : c)),
      )
      setDeepResearchConversations(prev =>
        prev.map(c => (c.id === conversation.id ? { ...c, is_favorited: !newStatus } : c)),
      )
      // Revert bookmarks list changes
      if (newStatus) {
        // We added it, so remove it
        setBookmarkedConversations(prev => prev.filter(c => c.id !== conversation.id))
      } else {
        // We removed it, so add it back
        setBookmarkedConversations(prev => [{ ...conversation, is_favorited: true }, ...prev])
      }
    } else {
      toast.success(newStatus ? t('sidebar.addedToBookmarks') : t('sidebar.removedFromBookmarks'))
      notifyConversationsChanged()
    }
  }

  const toggleSpace = async spaceId => {
    // Toggle expansion state
    const newExpanded = new Set(expandedSpaces)
    const isExpanding = !newExpanded.has(spaceId)

    if (isExpanding) {
      newExpanded.add(spaceId)
      // Fetch initial data if not already present
      if (!spaceConversations[spaceId]) {
        fetchSpaceConversations(spaceId, true)
      }
    } else {
      newExpanded.delete(spaceId)
    }
    setExpandedSpaces(newExpanded)
  }

  const fetchSpaceConversations = async (spaceId, isInitial = true) => {
    // Set loading state
    setSpaceConversations(prev => ({
      ...prev,
      [spaceId]: {
        ...(prev[spaceId] || { items: [], nextCursor: null, hasMore: true }),
        loading: true,
      },
    }))

    try {
      const currentData = spaceConversations[spaceId]
      const cursor = isInitial ? null : currentData?.nextCursor

      const { data, nextCursor, hasMore } = await listConversationsBySpace(spaceId, {
        limit: SIDEBAR_FETCH_LIMIT,
        cursor,
      })

      setSpaceConversations(prev => ({
        ...prev,
        [spaceId]: {
          items: isInitial ? data || [] : [...(prev[spaceId]?.items || []), ...(data || [])],
          nextCursor,
          hasMore,
          loading: false,
        },
      }))
    } catch (error) {
      console.error('Failed to load space conversations:', error)
      toast.error('Failed to load space history')
      setSpaceConversations(prev => ({
        ...prev,
        [spaceId]: { ...prev[spaceId], loading: false },
      }))
    }
  }

  // Limit conversations per section for display
  const MAX_CONVERSATIONS_PER_SECTION = 1000 // Effectively no limit, showing all fetched

  // Helper function to translate date group titles
  const translateDateTitle = title => {
    const keyMap = {
      Today: 'today',
      Yesterday: 'yesterday',
      'Previous 7 Days': 'previous7Days',
      Past: 'past',
    }
    return t(`sidebar.${keyMap[title] || 'past'}`)
  }

  // No longer needed to filter client side for bookmarks tab display
  // But we still might want filteredConversations for logic if used elsewhere?
  // Actually, we should just use bookmarkedConversations for the bookmarks tab.
  const displayConversations = displayTab === 'bookmarks' ? bookmarkedConversations : conversations

  // Check if we should show "See All" button for library (unused now)
  // const shouldShowSeeAllForLibrary = ...

  // Group conversations by date (for library)
  const groupedConversations = useMemo(() => {
    const groups = groupConversationsByDate(conversations)
    // Limit conversations per section and track if there are more
    return groups.map(section => ({
      ...section,
      items: section.items.slice(0, MAX_CONVERSATIONS_PER_SECTION),
      hasMore: section.items.length > MAX_CONVERSATIONS_PER_SECTION,
      totalCount: section.items.length,
    }))
  }, [conversations])

  const groupedDeepResearchConversations = useMemo(() => {
    const groups = groupConversationsByDate(deepResearchConversations)
    return groups.map(section => ({
      ...section,
      items: section.items.slice(0, MAX_CONVERSATIONS_PER_SECTION),
      hasMore: section.items.length > MAX_CONVERSATIONS_PER_SECTION,
      totalCount: section.items.length,
    }))
  }, [deepResearchConversations])

  // Spaces list pagination inside sidebar
  const visibleSpaces = useMemo(() => {
    if (displayTab !== 'spaces') return []
    const hiddenSpaceIds = new Set(deepResearchSpaceIds)
    const filteredSpaces = (spaces || []).filter(space => !hiddenSpaceIds.has(String(space.id)))
    return filteredSpaces.slice(0, spacesLimit)
  }, [spaces, spacesLimit, displayTab, deepResearchSpaceIds])

  const spacesHasMore = useMemo(() => {
    if (displayTab !== 'spaces') return false
    const hiddenSpaceIds = new Set(deepResearchSpaceIds)
    const filteredCount = (spaces || []).filter(
      space => !hiddenSpaceIds.has(String(space.id)),
    ).length
    return filteredCount > spacesLimit
  }, [spaces, spacesLimit, displayTab, deepResearchSpaceIds])

  return (
    <>
      {/* Mobile Overlay */}
      <div
        className={clsx(
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 md:hidden',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={isOpen ? onClose : undefined}
        // onWheel={e => e.preventDefault()}
        // onTouchMove={e => e.preventDefault()}
      />

      <div
        className={clsx(
          'fixed top-0 left-0 z-90 flex h-dvh transition-transform md:translate-x-0',
          isMobileFastSidebar ? 'duration-0' : 'duration-300',
          // On mobile, control via isOpen. On desktop, always visible (handled by layout margin)
          // Actually, fixed sidebar on desktop is always visible (icon strip).
          // Mobile: hidden by default (-translate-x-full), shown if isOpen
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          if (!isPinned) {
            setIsHovered(false)
            setHoveredTab(null)
          }
        }}
      >
        {/* 1. Fixed Icon Strip */}
        <div className="bg-sidebar no-scrollbar relative z-20 flex h-full w-18 flex-col items-center overflow-y-auto py-4">
          {/* Logo */}
          <div className="mb-6">
            <div className="flex h-full w-full items-center justify-center text-xl font-bold text-gray-900 dark:text-white">
              <Logo size={32} priority />
            </div>
          </div>

          {/* New Thread Button (Icon Only) */}
          <div className="mb-6">
            <button
              onClick={() => onNavigate('home')}
              className="bg-user-bubble hover:bg-primary-500 flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-gray-600 transition-all duration-300 hover:scale-110 hover:text-white active:scale-95 dark:bg-zinc-800 dark:text-gray-300"
              title={t('sidebar.newChat')}
            >
              <Plus size={20} />
            </button>
          </div>

          {/* Nav Icons */}
          <div className="flex w-full flex-col gap-3 px-1">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id)
                  // On mobile (isOpen), only switch tab, don't navigate full page
                  if (!isOpen) {
                    if (item.id === 'library') onNavigate('library')
                    else if (item.id === 'deepResearch') onNavigate('deepResearch')
                    else if (item.id === 'spaces') onNavigate('spaces')
                    else if (item.id === 'bookmarks') onNavigate('bookmarks')
                    else if (item.id === 'agents') onNavigate('agents')
                  }
                }}
                onMouseEnter={() => {
                  if (!isMobile) setHoveredTab(item.id)
                }}
                className={clsx(
                  'group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl px-0 py-2.5 transition-all duration-300',
                  activeTab === item.id
                    ? 'text-primary-500 dark:text-primary-400'
                    : 'text-[#13343bbf] hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
                )}
              >
                {/* Active indicator bar - removed */}
                {/* Hover background effect */}
                <div
                  className={clsx(
                    'absolute inset-0 rounded-xl transition-opacity duration-200',
                    activeTab === item.id
                      ? 'bg-primary-500/10 dark:bg-primary-500/20'
                      : 'bg-gray-100 opacity-0 group-hover:opacity-100 dark:bg-zinc-800/50',
                  )}
                />
                <div className="relative z-10 flex flex-col items-center gap-0.5">
                  <div className="rounded-xl p-1.5 transition-all duration-300">
                    <item.icon size={20} strokeWidth={activeTab === item.id ? 2.5 : 2} />
                  </div>
                  <span
                    className={clsx(
                      'overflow-hidden font-sans text-[10px] font-semibold transition-all duration-300',
                      activeTab === item.id
                        ? 'max-h-[14px] opacity-100'
                        : 'max-h-0 md:max-h-[14px] md:opacity-0 md:group-hover:max-h-[14px] md:group-hover:opacity-100',
                    )}
                  >
                    {item.label}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Bottom Action Buttons */}
          <div className="flex flex-col items-center gap-2 pb-2">
            <button
              onClick={onToggleTheme}
              className="bg-user-bubble flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-gray-600 transition-all duration-300 hover:scale-105 hover:bg-gray-100 active:scale-95 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700"
              title={`Current theme: ${theme}`}
            >
              {getThemeIcon()}
            </button>

            <button
              onClick={onOpenTools}
              className="bg-user-bubble flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-gray-600 transition-all duration-300 hover:scale-105 hover:bg-gray-100 active:scale-95 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700"
              title={t('sidebar.tools')}
            >
              <Blocks size={20} />
            </button>

            <button
              onClick={onOpenSettings}
              className="bg-user-bubble flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-gray-600 transition-all duration-300 hover:scale-105 hover:bg-gray-100 active:scale-95 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700"
              title={t('sidebar.settings')}
            >
              <Settings size={20} />
            </button>
          </div>
        </div>

        {/* 2. Expanded Content Panel */}
        <div
          className={clsx(
            'bg-sidebar flex h-full flex-col overflow-hidden',
            isMobileFastSidebar
              ? 'transition-none'
              : 'transition-all duration-300 ease-in-out',
            isExpanded && displayTab !== 'discover'
              ? 'w-64 translate-x-0 opacity-100 shadow-2xl'
              : 'w-0 -translate-x-4 opacity-0',
          )}
        >
          <div
            className={clsx(
              'flex h-full min-w-[256px] flex-col p-2',
              isMobileFastSidebar
                ? isOpen
                  ? 'opacity-100 transition-opacity duration-120 ease-out'
                  : 'opacity-0 transition-none'
                : '',
            )}
          >
            {/* min-w ensures content doesn't squash during transition */}
            {/* Header based on Tab */}
            <div className="mb-2 flex shrink-0 items-center justify-between border-b border-gray-200 p-2 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <h2 className="text-foreground text-lg font-semibold">
                  {displayTab === 'library'
                    ? t('sidebar.library')
                    : displayTab === 'deepResearch'
                      ? t('sidebar.deepResearch')
                      : displayTab === 'bookmarks'
                        ? t('sidebar.bookmarks')
                        : displayTab === 'spaces'
                          ? t('sidebar.spaces')
                          : displayTab === 'agents'
                            ? t('sidebar.agents')
                            : ''}
                </h2>
                {/* View Full Page Button (Mobile Only, or always if useful)
                    The user requested this specifically for the extension area.
                    We will show it always or check conditions, but it's safest to show it
                    so users know they can go there. */}
                <button
                  onClick={() => onNavigate(displayTab)}
                  className="bg-user-bubble hover:bg-user-bubble/10 rounded-md px-2 py-1 text-xs font-medium text-gray-700 transition-colors md:hidden dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700"
                >
                  {t('sidebar.seeAll')}
                </button>
              </div>
              <button
                onClick={() => setIsPinned(!isPinned)}
                className="hover:bg-primary-50 hover:text-primary-600 dark:hover:text-primary-400 hidden rounded p-1.5 transition-colors md:block dark:hover:bg-zinc-700"
                title={isPinned ? t('sidebar.unpin') : t('sidebar.pin')}
              >
                <Pin
                  size={16}
                  className={clsx(
                    'transition-colors',
                    isPinned ? 'text-primary-500 fill-current' : 'text-gray-500 dark:text-gray-400',
                  )}
                />
              </button>
            </div>
            {/* <div className="h-px bg-gray-200 dark:bg-zinc-800 mb-2 shrink-0" /> */}
            {/* CONVERSATION LIST (Library & Bookmarks) */}
            {(displayTab === 'library' ||
              displayTab === 'bookmarks' ||
              displayTab === 'deepResearch') && (
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-2">
                {!isConversationsLoading &&
                  displayTab === 'library' &&
                  conversations.length === 0 && (
                    <div className="flex flex-col items-center gap-2 px-2 py-3 text-xs text-gray-500 dark:text-gray-400">
                      <Coffee size={24} className="text-black dark:text-white" />
                      <div>{t('sidebar.noConversations')}</div>
                    </div>
                  )}
                {!isBookmarksLoading &&
                  displayTab === 'bookmarks' &&
                  displayConversations.length === 0 && (
                    <div className="flex flex-col items-center gap-2 px-2 py-3 text-xs text-gray-500 dark:text-gray-400">
                      <Coffee size={24} className="text-black dark:text-white" />
                      <div>{t('sidebar.noBookmarks')}</div>
                    </div>
                  )}

                {/* For library tab, use grouped conversations with limits */}
                {displayTab === 'library' &&
                  groupedConversations.map(section => (
                    <div key={section.title} className="flex flex-col gap-1">
                      <div className="mt-1 flex justify-center px-2 text-[10px] tracking-wide text-gray-400 uppercase">
                        {translateDateTitle(section.title)}
                      </div>
                      {section.items.map(conv => {
                        const isActive = conv.id === activeConversationId
                        const isExpanded = expandedActionId === conv.id
                        const space = getConversationSpace(conv)
                        return (
                          <div key={conv.id} className="flex flex-col">
                            <div
                              data-conversation-id={conv.id}
                              onClick={() => {
                                if (expandedActionId) {
                                  closeActions()
                                  return
                                }
                                onOpenConversation && onOpenConversation(conv)
                              }}
                              className={clsx(
                                'group relative cursor-pointer truncate overflow-hidden rounded-xl px-1 py-2.5 text-sm md:p-2.5',
                                isMobileFastSidebar
                                  ? 'transition-colors duration-120 ease-out'
                                  : 'transition-all duration-200',
                                isActive
                                  ? 'bg-primary-500/10 dark:bg-primary-500/20 text-primary-500 dark:text-primary-400'
                                  : 'hover:bg-primary-50 text-gray-700 dark:text-gray-300 dark:hover:bg-zinc-800',
                                isExpanded &&
                                  'bg-primary-50/70 dark:bg-primary-900/20 border-primary-200/60 dark:border-primary-800/60 ring-primary-100/70 dark:ring-primary-800/60 ring-1',
                              )}
                              title={conv.title}
                            >
                              {/* Hover shine effect removed */}
                              <div className="relative z-10 flex w-full items-center justify-between overflow-hidden">
                                <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
                                  <div className="bg-primary-100 dark:bg-primary-900/30 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base">
                                    <EmojiDisplay
                                      emoji={resolveConversationEmoji(conv, space?.emoji)}
                                      size="1.3em"
                                      className="shrink-0"
                                    />
                                  </div>
                                  <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                                    <div className="flex min-w-0 items-center gap-1.5">
                                      <span className="min-w-0 flex-1 truncate font-medium">
                                        {conv.title}
                                      </span>
                                      {conv.is_favorited && (
                                        <Bookmark
                                          size={13}
                                          className="text-primary-500 shrink-0 fill-current"
                                        />
                                      )}
                                      {renderConversationStatusDot(conversationStatuses[conv.id])}
                                    </div>
                                    <span
                                      className={clsx(
                                        'mt-0.5 text-[11px]',
                                        isActive
                                          ? 'text-primary-600 dark:text-primary-400'
                                          : 'text-gray-400',
                                      )}
                                    >
                                      {formatDateTime(conv.updated_at || conv.created_at)}
                                    </span>
                                  </div>
                                </div>

                                <div className="relative ml-1 shrink-0">
                                  <button
                                    onClick={e => {
                                      e.stopPropagation()
                                      setExpandedActionId(prev =>
                                        prev === conv.id ? null : conv.id,
                                      )
                                    }}
                                    className={clsx(
                                      'rounded-lg p-1 transition-all duration-200',
                                      isActive
                                        ? 'text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/30'
                                        : 'text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-zinc-700 dark:hover:text-gray-300',
                                      'opacity-100',
                                      'md:opacity-0 md:group-hover:opacity-100',
                                      'flex min-h-[28px] min-w-[28px] items-center justify-center',
                                    )}
                                  >
                                    {isExpanded ? (
                                      <ChevronUp size={16} strokeWidth={2.5} />
                                    ) : (
                                      <ChevronDown size={16} strokeWidth={2.5} />
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                            {isExpanded && (
                              <div className="mt-2 grid grid-cols-2 gap-2 px-2 pb-1">
                                <button
                                  onClick={e => {
                                    e.stopPropagation()
                                    handleToggleFavorite(conv)
                                    closeActions()
                                  }}
                                  className={clsx(
                                    'flex items-center justify-center gap-1.5 rounded-lg border py-2 font-medium transition-all duration-200',
                                    conv.is_favorited
                                      ? 'border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-800/30 dark:bg-amber-900/20 dark:text-amber-400'
                                      : 'hover:bg-primary-50 hover:text-primary-600 dark:hover:text-primary-400 hover:border-primary-200 dark:hover:border-primary-800/30 border-transparent text-gray-500 dark:text-gray-400 dark:hover:bg-zinc-700',
                                  )}
                                  title={
                                    conv.is_favorited
                                      ? t('sidebar.removeBookmark')
                                      : t('sidebar.addBookmark')
                                  }
                                >
                                  <Bookmark
                                    size={14}
                                    className={conv.is_favorited ? 'fill-current' : ''}
                                  />
                                  <span className="text-xs">
                                    {conv.is_favorited ? t('sidebar.saved') : t('sidebar.save')}
                                  </span>
                                </button>
                                <button
                                  onClick={e => {
                                    e.stopPropagation()
                                    handleDeleteConversation(conv)
                                  }}
                                  className="flex items-center justify-center gap-1.5 rounded-lg border border-transparent py-2 font-medium text-gray-500 transition-all duration-200 hover:border-red-100 hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:border-red-800/30 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                                >
                                  <Trash2 size={14} />
                                  <span className="text-xs">{t('sidebar.delete')}</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}

                {/* Load More Button */}
                {displayTab === 'library' && conversations.length > 0 && (
                  <div className="px-2 py-2">
                    {hasMore ? (
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          fetchMoreConversations()
                        }}
                        disabled={loadingMore}
                        className="bg-user-bubble flex w-full items-center justify-center gap-2 rounded-xl py-2 text-xs font-medium text-gray-700 transition-colors hover:translate-y-[-2px] hover:transform dark:bg-zinc-800 dark:text-gray-200"
                      >
                        {loadingMore ? <DotLoader /> : t('sidebar.loadMore')}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 py-2 text-[10px] text-gray-400">
                        <span className="h-px flex-1 bg-gray-200 dark:bg-zinc-800" />
                        <span className="whitespace-nowrap">{t('sidebar.noMoreThreads')}</span>
                        <span className="h-px flex-1 bg-gray-200 dark:bg-zinc-800" />
                      </div>
                    )}
                  </div>
                )}

                {displayTab === 'deepResearch' && (
                  <div className="flex h-full min-h-0 flex-col">
                    {/* Create New Deep Research - Fixed Header */}
                    <div className="shrink-0 px-2 pb-2">
                      <button
                        onClick={() => {
                          openDeepResearchGuide()
                          if (onClose) onClose()
                        }}
                        className="bg-user-bubble/50 hover:bg-user-bubble dark:hover:bg-user-bubble/10 relative flex w-full cursor-pointer items-center gap-3 rounded-xl p-2.5 text-left text-gray-600 transition-transform hover:scale-105 dark:bg-zinc-800 dark:text-gray-300"
                      >
                        <div className="bg-primary-100/70 dark:bg-primary-900/30 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base text-gray-700 dark:text-gray-100">
                          <Plus size={16} />
                        </div>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {t('sidebar.createNewDeepResearch')}
                        </span>
                      </button>
                      <div className="mt-2 h-px bg-gray-200 dark:bg-zinc-800" />
                    </div>

                    {/* Deep Research List - Scrollable Area */}
                    <div className="no-scrollbar flex flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-2">
                      {!isDeepResearchLoading && deepResearchConversations.length === 0 && (
                        <div className="flex flex-col items-center gap-2 px-2 py-3 text-xs text-gray-500 dark:text-gray-400">
                          <Coffee size={24} className="text-black dark:text-white" />
                          <div>{t('sidebar.noDeepResearchConversations')}</div>
                        </div>
                      )}

                      {groupedDeepResearchConversations.map(section => (
                        <div key={section.title} className="flex flex-col gap-1">
                          <div className="mt-1 flex justify-center px-2 text-[10px] tracking-wide text-gray-400 uppercase">
                            {translateDateTitle(section.title)}
                          </div>
                          {section.items.map(conv => {
                            const isActive = conv.id === activeConversationId
                            const isExpanded = expandedActionId === conv.id
                            const space = getConversationSpace(conv)
                            return (
                              <div key={conv.id} className="flex flex-col">
                                <div
                                  data-conversation-id={conv.id}
                                  onClick={() => {
                                    if (expandedActionId) {
                                      closeActions()
                                      return
                                    }
                                    onOpenConversation && onOpenConversation(conv)
                                  }}
                                  className={clsx(
                                    'group relative cursor-pointer truncate rounded-xl px-1 py-2.5 text-sm transition-all duration-200 md:p-2.5',
                                    isActive
                                      ? 'bg-primary-500/10 dark:bg-primary-500/20 text-primary-500 dark:text-primary-400'
                                      : 'hover:bg-primary-50 text-gray-700 dark:text-gray-300 dark:hover:bg-zinc-800',
                                    isExpanded &&
                                      'bg-primary-50/70 dark:bg-primary-900/20 border-primary-200/60 dark:border-primary-800/60 ring-primary-100/70 dark:ring-primary-800/60 ring-1',
                                  )}
                                  title={conv.title}
                                >
                                  <div className="relative z-10 flex w-full items-center justify-between overflow-hidden">
                                    <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
                                      <div className="bg-primary-100 dark:bg-primary-900/30 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base">
                                        <EmojiDisplay
                                          emoji={resolveConversationEmoji(conv, space?.emoji)}
                                          size="1.4em"
                                          className="shrink-0"
                                        />
                                      </div>
                                      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                                        <div className="flex min-w-0 items-center gap-1">
                                          <span className="min-w-0 flex-1 truncate font-medium">
                                            {conv.title}
                                          </span>
                                          {conv.is_favorited && (
                                            <Bookmark
                                              size={12}
                                              className="text-primary-500 shrink-0 fill-current"
                                            />
                                          )}
                                          {renderConversationStatusDot(
                                            conversationStatuses[conv.id],
                                          )}
                                        </div>
                                        <span
                                          className={clsx(
                                            'text-xs',
                                            isActive
                                              ? 'text-primary-600 dark:text-primary-400'
                                              : 'text-gray-400',
                                          )}
                                        >
                                          {formatDateTime(conv.updated_at || conv.created_at)}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="relative ml-1 shrink-0">
                                      <button
                                        onClick={e => {
                                          e.stopPropagation()
                                          setExpandedActionId(prev =>
                                            prev === conv.id ? null : conv.id,
                                          )
                                        }}
                                        className={clsx(
                                          'rounded-md p-1 transition-all hover:bg-gray-300 dark:hover:bg-zinc-700',
                                          isActive
                                            ? 'text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/20'
                                            : 'text-gray-500 hover:bg-gray-300 dark:text-gray-400 dark:hover:bg-zinc-700',
                                          'opacity-100',
                                          'md:opacity-0 md:group-hover:opacity-100',
                                          'flex min-h-[28px] min-w-[28px] items-center justify-center',
                                        )}
                                      >
                                        {isExpanded ? (
                                          <ChevronUp size={16} strokeWidth={2.5} />
                                        ) : (
                                          <ChevronDown size={16} strokeWidth={2.5} />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                                {isExpanded && (
                                  <div className="mt-2 grid grid-cols-2 gap-2 px-2 text-xs">
                                    <button
                                      onClick={e => {
                                        e.stopPropagation()
                                        handleToggleFavorite(conv)
                                        closeActions()
                                      }}
                                      className={clsx(
                                        'flex items-center justify-center gap-1.5 rounded-md py-1.5 font-medium transition-colors',
                                        conv.is_favorited
                                          ? 'bg-primary-50 text-primary-500 dark:bg-primary-600/20 dark:text-primary-500'
                                          : 'hover:bg-primary-50 hover:text-primary-600 dark:hover:text-primary-400 text-gray-500 dark:text-gray-400 dark:hover:bg-zinc-700',
                                      )}
                                      title={
                                        conv.is_favorited
                                          ? t('sidebar.removeBookmark')
                                          : t('sidebar.addBookmark')
                                      }
                                    >
                                      <Bookmark
                                        size={13}
                                        className={conv.is_favorited ? 'fill-current' : ''}
                                      />
                                      <span className="truncate">
                                        {conv.is_favorited ? t('sidebar.added') : t('sidebar.add')}
                                      </span>
                                    </button>
                                    <button
                                      onClick={e => {
                                        e.stopPropagation()
                                        handleDeleteConversation(conv)
                                      }}
                                      className="flex items-center justify-center gap-1.5 rounded-md border border-transparent py-1.5 font-medium text-gray-500 transition-colors hover:border-red-100 hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:border-red-800/30 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                                    >
                                      <Trash2 size={13} />
                                      <span>{t('sidebar.delete')}</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ))}

                      {deepResearchConversations.length > 0 && (
                        <div className="px-2 py-2">
                          {deepResearchHasMore ? (
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                fetchDeepResearchConversations(false)
                              }}
                              disabled={deepResearchLoadingMore}
                              className="bg-user-bubble flex w-full items-center justify-center gap-2 rounded-xl py-2 text-xs font-medium text-gray-700 transition-colors hover:translate-y-[-2px] hover:transform dark:bg-zinc-800 dark:text-gray-200"
                            >
                              {deepResearchLoadingMore ? <DotLoader /> : t('sidebar.loadMore')}
                            </button>
                          ) : (
                            <div className="flex items-center gap-2 py-2 text-[10px] text-gray-400">
                              <span className="h-px flex-1 bg-gray-200 dark:bg-zinc-800" />
                              <span className="whitespace-nowrap">
                                {t('sidebar.noMoreThreads')}
                              </span>
                              <span className="h-px flex-1 bg-gray-200 dark:bg-zinc-800" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* For bookmarks tab, match library interaction */}
                {displayTab === 'bookmarks' &&
                  displayConversations.map(conv => {
                    const isActive = conv.id === activeConversationId
                    const isExpanded = expandedActionId === conv.id
                    const space = getConversationSpace(conv)
                    return (
                      <div key={conv.id} className="flex flex-col">
                        <div
                          data-conversation-id={conv.id}
                          onClick={() => {
                            if (expandedActionId) {
                              closeActions()
                              return
                            }
                            onOpenConversation && onOpenConversation(conv)
                          }}
                          className={clsx(
                            'group relative cursor-pointer truncate rounded-xl px-1 py-2.5 text-sm transition-all duration-200 md:p-2.5',
                            isActive
                              ? 'bg-primary-500/10 dark:bg-primary-500/20 text-primary-500 dark:text-primary-400'
                              : 'hover:bg-primary-50 text-gray-700 dark:text-gray-300 dark:hover:bg-zinc-800',
                            isExpanded &&
                              'bg-primary-50/70 dark:bg-primary-900/20 border-primary-200/60 dark:border-primary-800/60 ring-primary-100/70 dark:ring-primary-800/60 border ring-1',
                          )}
                          title={conv.title}
                        >
                          <div className="relative z-10 flex w-full items-center justify-between overflow-hidden">
                            <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
                              <div className="bg-primary-100 dark:bg-primary-900/30 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base">
                                <EmojiDisplay
                                  emoji={resolveConversationEmoji(conv, space?.emoji)}
                                  size="1.4em"
                                  className="shrink-0"
                                />
                              </div>
                              <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                                <div className="flex min-w-0 items-center gap-1">
                                  <span className="min-w-0 flex-1 truncate font-medium">
                                    {conv.title}
                                  </span>
                                  <Bookmark
                                    size={12}
                                    className="text-primary-500 shrink-0 fill-current"
                                  />
                                  {renderConversationStatusDot(conversationStatuses[conv.id])}
                                </div>
                                <span
                                  className={clsx(
                                    'text-xs',
                                    isActive
                                      ? 'text-primary-600 dark:text-primary-400'
                                      : 'text-gray-400',
                                  )}
                                >
                                  {formatDateTime(conv.updated_at || conv.created_at)}
                                </span>
                              </div>
                            </div>

                            <div className="relative ml-1 shrink-0">
                              <button
                                onClick={e => {
                                  e.stopPropagation()
                                  setExpandedActionId(prev => (prev === conv.id ? null : conv.id))
                                }}
                                className={clsx(
                                  'rounded-md p-1 transition-all hover:bg-gray-300 dark:hover:bg-zinc-700',
                                  isActive
                                    ? 'text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/20'
                                    : 'text-gray-500 hover:bg-gray-300 dark:text-gray-400 dark:hover:bg-zinc-700',
                                  'opacity-100',
                                  'md:opacity-0 md:group-hover:opacity-100',
                                  'flex min-h-[28px] min-w-[28px] items-center justify-center',
                                )}
                              >
                                {isExpanded ? (
                                  <ChevronUp size={16} strokeWidth={2.5} />
                                ) : (
                                  <ChevronDown size={16} strokeWidth={2.5} />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="mt-2 grid grid-cols-2 gap-2 px-2 text-xs">
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                handleToggleFavorite(conv)
                                closeActions()
                              }}
                              className={clsx(
                                'flex items-center justify-center gap-1.5 rounded-md border border-transparent py-1.5 font-medium transition-colors',
                                conv.is_favorited
                                  ? 'bg-primary-50 text-primary-500 dark:bg-primary-600/20 dark:text-primary-500'
                                  : 'hover:bg-primary-50 hover:text-primary-600 dark:hover:text-primary-400 text-gray-500 dark:text-gray-400 dark:hover:bg-zinc-700',
                              )}
                              title={
                                conv.is_favorited
                                  ? t('sidebar.removeBookmark')
                                  : t('sidebar.addBookmark')
                              }
                            >
                              <Bookmark
                                size={13}
                                className={conv.is_favorited ? 'fill-current' : ''}
                              />
                              <span className="truncate">
                                {conv.is_favorited ? t('sidebar.added') : t('sidebar.add')}
                              </span>
                            </button>
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                handleDeleteConversation(conv)
                              }}
                              className="flex items-center justify-center gap-1.5 rounded-md border border-transparent py-1.5 font-medium text-gray-500 transition-colors hover:border-red-100 hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:border-red-800/30 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                            >
                              <Trash2 size={13} />
                              <span>{t('sidebar.delete')}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                {/* Loading indicator for bookmarks initial fetch */}
                {displayTab === 'bookmarks' &&
                  isBookmarksLoading &&
                  displayConversations.length === 0 && (
                    <div className="flex justify-center py-2">
                      <DotLoader />
                    </div>
                  )}

                {displayTab === 'bookmarks' && displayConversations.length > 0 && (
                  <div className="px-2 py-2">
                    {bookmarkHasMore ? (
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          fetchBookmarkedConversations(false)
                        }}
                        disabled={bookmarksLoadingMore}
                        className="bg-user-bubble hover:bg-user-bubble/10 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-xs font-medium text-gray-700 transition-colors dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700"
                      >
                        {bookmarksLoadingMore ? <DotLoader /> : t('sidebar.loadMore')}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 py-2 text-[10px] text-gray-400">
                        <span className="h-px flex-1 bg-gray-200 dark:bg-zinc-800" />
                        <span className="whitespace-nowrap">{t('sidebar.noMoreThreads')}</span>
                        <span className="h-px flex-1 bg-gray-200 dark:bg-zinc-800" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* SPACES TAB CONTENT */}
            {displayTab === 'spaces' && (
              <div className="flex h-full min-h-0 flex-col">
                {/* Create New Space - Fixed Header */}
                <div className="shrink-0 px-2 pb-2">
                  <button
                    onClick={onCreateSpace}
                    className="bg-user-bubble/50 hover:bg-user-bubble dark:hover:bg-user-bubble/10 relative flex w-full cursor-pointer items-center gap-3 rounded-xl p-2.5 text-left text-gray-600 transition-transform hover:scale-105 dark:bg-zinc-800 dark:text-gray-300"
                  >
                    <div className="bg-primary-100/70 dark:bg-primary-900/30 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base text-gray-700 dark:text-gray-100">
                      <Plus size={16} />
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('sidebar.createNewSpace')}
                    </span>
                  </button>
                  <div className="mt-2 h-px bg-gray-200 dark:bg-zinc-800" />
                </div>

                {/* Spaces List - Scrollable Area */}
                <div className="no-scrollbar flex flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-2">
                  {/* Spaces List */}
                  {spacesLoading && (
                    <div className="flex justify-center py-2">
                      <DotLoader />
                    </div>
                  )}
                  {!spacesLoading && spaces.length === 0 && (
                    <div className="flex flex-col items-center gap-2 px-2 py-3 text-xs text-gray-500 dark:text-gray-400">
                      <Coffee size={24} className="text-black dark:text-white" />
                      <div>{t('sidebar.noSpacesYet')}</div>
                    </div>
                  )}
                  {visibleSpaces.map(space => (
                    <React.Fragment key={space.id || space.label}>
                      <div className="group relative mb-0.5 flex items-center">
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            toggleSpace(space.id)
                          }}
                          className="hover:bg-primary-50 hover:text-primary-600 dark:hover:text-primary-400 z-10 shrink-0 rounded-md p-1.5 text-gray-400 transition-all dark:hover:bg-zinc-800/50"
                        >
                          <ChevronDown
                            size={14}
                            className={clsx(
                              'transition-transform duration-200',
                              expandedSpaces.has(space.id) ? '' : '-rotate-90',
                            )}
                          />
                        </button>

                        <div
                          onClick={() => onNavigateToSpace(space)}
                          className="hover:bg-primary-50 group/content flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg p-1.5 transition-colors dark:hover:bg-zinc-800"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-transparent text-base">
                            <EmojiDisplay emoji={space.emoji} size="1.4em" />
                          </div>
                          <span className="group-hover/content:text-primary-600 truncate text-sm font-medium text-gray-700 transition-colors dark:text-gray-300 dark:group-hover/content:text-gray-200">
                            {getSpaceDisplayLabel(space, t)}
                          </span>
                        </div>

                        {/* Edit Button (Visible on Hover) */}
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            onEditSpace(space)
                          }}
                          className="hover:bg-primary-50 hover:text-primary-600 dark:hover:text-primary-400 ml-1 shrink-0 rounded-md p-1.5 text-gray-400 opacity-0 transition-all group-hover:opacity-100 dark:hover:bg-zinc-800"
                        >
                          <Settings size={14} />
                        </button>
                      </div>

                      {/* Expandable Content for Space */}
                      {expandedSpaces.has(space.id) && (
                        <div className="mr-2 mb-2 ml-2 flex flex-col gap-1 border-l border-gray-200 pl-2 sm:ml-4 dark:border-zinc-800">
                          {spaceConversations[space.id]?.loading &&
                            spaceConversations[space.id]?.items?.length === 0 && (
                              <div className="px-2">
                                <DotLoader />
                              </div>
                            )}

                          {spaceConversations[space.id]?.items?.map(conv => (
                            <div key={conv.id} className="flex flex-col">
                              <div
                                data-conversation-id={conv.id}
                                onClick={() => {
                                  if (expandedActionId) {
                                    closeActions()
                                    return
                                  }
                                  onOpenConversation && onOpenConversation(conv)
                                }}
                                className={clsx(
                                  'group relative cursor-pointer truncate rounded-xl p-2.5 text-sm transition-all duration-200',
                                  conv.id === activeConversationId
                                    ? 'bg-primary-500/10 dark:bg-primary-500/20 text-primary-500 dark:text-primary-400'
                                    : 'hover:bg-primary-50 text-gray-600 dark:text-gray-400 dark:hover:bg-zinc-800',
                                )}
                                title={conv.title}
                              >
                                <div className="relative z-10 flex w-full items-center justify-between overflow-hidden">
                                  <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
                                    <div className="bg-primary-100 dark:bg-primary-900/30 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base">
                                      <EmojiDisplay
                                        emoji={resolveConversationEmoji(conv, space?.emoji)}
                                        size="1.4em"
                                        className="shrink-0"
                                      />
                                    </div>
                                    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                                      <div className="flex min-w-0 items-center gap-1.5">
                                        <span className="min-w-0 flex-1 truncate font-medium">
                                          {conv.title || t('sidebar.untitled')}
                                        </span>
                                        {conv.is_favorited && (
                                          <Bookmark
                                            size={13}
                                            className="text-primary-500 shrink-0 fill-current"
                                          />
                                        )}
                                      </div>
                                      <span
                                        className={clsx(
                                          'mt-0.5 text-xs',
                                          conv.id === activeConversationId
                                            ? 'text-primary-600 dark:text-primary-400'
                                            : 'text-gray-400',
                                        )}
                                      >
                                        {formatDateTime(conv.updated_at || conv.created_at)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}

                          {spaceConversations[space.id]?.items?.length > 0 &&
                            spaceConversations[space.id]?.hasMore && (
                              <div className="px-2 py-2">
                                <button
                                  onClick={e => {
                                    e.stopPropagation()
                                    fetchSpaceConversations(space.id, false)
                                  }}
                                  disabled={spaceConversations[space.id]?.loading}
                                  className="bg-user-bubble hover:bg-user-bubble/10 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-xs font-medium text-gray-700 transition-colors dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700"
                                >
                                  {spaceConversations[space.id]?.loading ? (
                                    <DotLoader />
                                  ) : (
                                    t('sidebar.loadMore')
                                  )}
                                </button>
                              </div>
                            )}

                          {!spaceConversations[space.id]?.loading &&
                            spaceConversations[space.id]?.items?.length === 0 && (
                              <div className="flex flex-col items-center gap-1 px-2 py-1 text-[10px] text-gray-400">
                                <SquareStack size={18} className="text-black dark:text-white" />
                                <div>{t('sidebar.noHistory')}</div>
                              </div>
                            )}
                        </div>
                      )}
                    </React.Fragment>
                  ))}

                  {/* Spaces Load More */}
                  {!spacesLoading && spaces.length > 0 && (
                    <div className="px-2 py-2">
                      {spacesHasMore ? (
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            setSpacesLoadingMore(true)
                            setTimeout(() => {
                              setSpacesLimit(prev => prev + SIDEBAR_FETCH_LIMIT)
                              setSpacesLoadingMore(false)
                            }, 150)
                          }}
                          disabled={spacesLoadingMore}
                          className="bg-user-bubble hover:bg-user-bubble/10 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-xs font-medium text-gray-700 transition-colors dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700"
                        >
                          {spacesLoadingMore ? <DotLoader /> : t('sidebar.loadMore')}
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 py-2 text-[10px] text-gray-400">
                          <span className="h-px flex-1 bg-gray-200 dark:bg-zinc-800" />
                          <span className="whitespace-nowrap">{t('sidebar.noMoreSpaces')}</span>
                          <span className="h-px flex-1 bg-gray-200 dark:bg-zinc-800" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* AGENTS TAB CONTENT */}
            {displayTab === 'agents' && (
              <div className="flex h-full min-h-0 flex-col">
                {/* Create New Agent - Fixed Header */}
                <div className="shrink-0 px-2 pb-2">
                  <button
                    onClick={onCreateAgent}
                    className="bg-user-bubble/50 hover:bg-user-bubble dark:hover:bg-user-bubble/10 relative flex w-full cursor-pointer items-center gap-3 rounded-xl p-2.5 text-left text-gray-600 transition-transform hover:scale-105 dark:bg-zinc-800 dark:text-gray-300"
                  >
                    <div className="bg-primary-100/70 dark:bg-primary-900/30 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base text-gray-700 dark:text-gray-100">
                      <Plus size={16} />
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('sidebar.createNewAgent')}
                    </span>
                  </button>
                  <div className="mt-2 h-px bg-gray-200 dark:bg-zinc-800" />
                </div>

                {/* Agents List - Scrollable Area */}
                <div className="no-scrollbar flex flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-2">
                  {/* Agents List */}
                  {agentsLoading && (
                    <div className="flex justify-center py-2">
                      <DotLoader />
                    </div>
                  )}
                  {!agentsLoading && agents.length === 0 && (
                    <div className="flex flex-col items-center gap-2 px-2 py-3 text-xs text-gray-500 dark:text-gray-400">
                      <Smile size={24} className="text-black dark:text-white" />
                      <div>{t('sidebar.noAgentsYet')}</div>
                    </div>
                  )}
                  {[...agents]
                    .sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)))
                    .map(agent => (
                      <div
                        key={agent.id}
                        onClick={() => onEditAgent && onEditAgent(agent)}
                        className="group hover:bg-primary-50 relative flex cursor-pointer items-center justify-between rounded-xl p-2.5 transition-all duration-200 dark:hover:bg-zinc-800"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="bg-primary-100 dark:bg-primary-900/30 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base">
                            <EmojiDisplay emoji={agent.emoji} size="1.4em" className="shrink-0" />
                          </div>
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate text-sm font-medium text-gray-700 dark:text-gray-300">
                              {getAgentDisplayName(agent, t)}
                            </span>
                            {getAgentDisplayDescription(agent, t) && (
                              <span className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                                {getAgentDisplayDescription(agent, t)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Edit Button (Visible on Hover) */}
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            onEditAgent && onEditAgent(agent)
                          }}
                          className="ml-2 shrink-0 rounded-lg p-2 text-gray-400 opacity-100 transition-all hover:bg-gray-200 hover:text-gray-600 sm:opacity-0 sm:group-hover:opacity-100 dark:hover:bg-zinc-700 dark:hover:text-gray-200"
                        >
                          <Settings size={16} />
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default Sidebar
