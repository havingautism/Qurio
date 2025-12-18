import React, { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Bookmark,
  LayoutGrid,
  Library,
  Settings,
  Sun,
  Moon,
  Laptop,
  Trash2,
  ChevronUp,
  Pin,
  ChevronDown,
  Coffee,
  SquareStack,
} from 'lucide-react'
import clsx from 'clsx'
import Logo from './Logo'
import DotLoader from './DotLoader'
import EmojiDisplay from './EmojiDisplay'
import {
  listConversations,
  listConversationsBySpace,
  toggleFavorite,
  listBookmarkedConversations,
} from '../lib/conversationsService'
import { deleteConversation } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useAppContext } from '../App'
import useScrollLock from '../hooks/useScrollLock'

const SIDEBAR_FETCH_LIMIT = 20

const Sidebar = ({
  isOpen = false, // Mobile state
  onClose, // Mobile state
  onOpenSettings,
  onNavigate,
  onNavigateToSpace,
  onCreateSpace,
  onEditSpace,
  onOpenConversation,
  spaces,
  spacesLoading = false,
  theme,
  onToggleTheme,
  activeConversationId,
  onPinChange,
}) => {
  useScrollLock(isOpen)

  const [isHovered, setIsHovered] = useState(false)
  const [isPinned, setIsPinned] = useState(() => {
    const saved = localStorage.getItem('sidebar-pinned')
    // Default to false on mobile if using simple logic, but here relying on isOpen for mobile
    return saved === 'true'
  })
  const [activeTab, setActiveTab] = useState('library') // 'library', 'discover', 'spaces'
  const [hoveredTab, setHoveredTab] = useState(null)
  const [conversations, setConversations] = useState([])
  const [nextCursor, setNextCursor] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [isConversationsLoading, setIsConversationsLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  // Dedicated Bookmarks State
  const [bookmarkedConversations, setBookmarkedConversations] = useState([])
  const [bookmarkNextCursor, setBookmarkNextCursor] = useState(null)
  const [bookmarkHasMore, setBookmarkHasMore] = useState(true)
  const [isBookmarksLoading, setIsBookmarksLoading] = useState(false)
  const [bookmarksLoadingMore, setBookmarksLoadingMore] = useState(false)
  const [expandedActionId, setExpandedActionId] = useState(null)

  // Spaces interaction state
  const [expandedSpaces, setExpandedSpaces] = useState(new Set())
  const [spaceConversations, setSpaceConversations] = useState({}) // { [spaceId]: { items: [], nextCursor: null, hasMore: true, loading: false } }
  const [spacesLimit, setSpacesLimit] = useState(SIDEBAR_FETCH_LIMIT)
  const [spacesLoadingMore, setSpacesLoadingMore] = useState(false)

  const toast = useToast()
  const { showConfirmation } = useAppContext()

  const spaceById = useMemo(() => {
    const map = new Map()
    for (const space of spaces || []) {
      if (space?.id != null) {
        map.set(String(space.id), space)
      }
    }
    return map
  }, [spaces])

  const getConversationSpace = conv => {
    const spaceId = conv?.space_id
    if (!spaceId) return null
    return spaceById.get(String(spaceId)) || null
  }

  const formatDateTime = value => {
    if (!value) return 'Recently'
    return new Date(value).toLocaleString(undefined, {
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
  const isExpanded = isOpen || isPinned || isHovered

  // Persist pin state to localStorage and notify parent
  useEffect(() => {
    localStorage.setItem('sidebar-pinned', isPinned)
    if (onPinChange) {
      onPinChange(isPinned)
    }
  }, [isPinned, onPinChange])

  const fetchConversations = async (isInitial = true) => {
    try {
      if (isInitial) {
        setIsConversationsLoading(true)
      } else {
        setLoadingMore(true)
      }

      const {
        data,
        error,
        nextCursor: newCursor,
        hasMore: moreAvailable,
      } = await listConversations({
        limit: SIDEBAR_FETCH_LIMIT,
        cursor: isInitial ? null : nextCursor,
      })

      if (!error && data) {
        if (isInitial) {
          setConversations(data)
        } else {
          setConversations(prev => [...prev, ...data])
        }
        setNextCursor(newCursor)
        setHasMore(moreAvailable)
      } else {
        console.error('Failed to load conversations:', error)
      }
    } catch (err) {
      console.error('Error loading conversations:', err)
    } finally {
      setIsConversationsLoading(false)
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

  useEffect(() => {
    fetchConversations(true)
    fetchBookmarkedConversations(true)

    const handleConversationsChanged = () => {
      fetchConversations(true)
      fetchBookmarkedConversations(true)
    }
    window.addEventListener('conversations-changed', handleConversationsChanged)
    return () => {
      window.removeEventListener('conversations-changed', handleConversationsChanged)
    }
  }, [])

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

  const navItems = [
    { id: 'library', icon: Library, label: 'Library' },
    { id: 'bookmarks', icon: Bookmark, label: 'Bookmarks' },
    // { id: 'discover', icon: Compass, label: 'Discover' },
    { id: 'spaces', icon: LayoutGrid, label: 'Spaces' },
  ]

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
      const convDate = startOfDay(conv.created_at)
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
      title: 'Delete',
      message: `Are you sure you want to delete "${conversation.title}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      isDangerous: true,
      onConfirm: async () => {
        const { success, error } = await deleteConversation(conversation.id)

        if (success) {
          // Refresh list
          fetchConversations(true)
          if (conversation.is_favorited) {
            fetchBookmarkedConversations(true)
          }

          // Only navigate home if we deleted the currently active conversation
          if (conversation.id === activeConversationId) {
            onNavigate('home')
          }
        } else {
          console.error('Failed to delete conversation:', error)
          toast.error('Failed to delete conversation')
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

    // Optimistically update bookmarks list
    // If we are adding to favorites
    if (newStatus) {
      // We can't easily add it to the correct sorted position without a refetch or guessing.
      // But simply prepending or checking sort might be enough for a quick UI response.
      // For simplicity and correctness with pagination, we might just want to refetch or prepend if it's 'created_at' desc.
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
      toast.error('Failed to update favorite status')
      // Revert optimistic update
      setConversations(prev =>
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
      toast.success(newStatus ? 'Added to bookmarks' : 'Removed from bookmarks')
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

  // Spaces list pagination inside sidebar
  const visibleSpaces = useMemo(() => {
    if (displayTab !== 'spaces') return []
    return spaces.slice(0, spacesLimit)
  }, [spaces, spacesLimit, displayTab])

  const spacesHasMore = useMemo(
    () => displayTab === 'spaces' && spaces.length > spacesLimit,
    [spaces.length, spacesLimit, displayTab],
  )

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={onClose}
        // onWheel={e => e.preventDefault()}
        // onTouchMove={e => e.preventDefault()}
        />
      )}

      <div
        className={clsx(
          'fixed left-0 top-0 h-full z-50 flex transition-transform duration-300 md:translate-x-0',
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
        <div className="w-18 h-full bg-sidebar  flex flex-col items-center py-4 z-20 relative">
          {/* Logo */}
          <div className="mb-6">
            <div className="w-full h-full flex items-center justify-center text-gray-900 dark:text-white font-bold text-xl">
              <Logo size={32} />
            </div>
          </div>

          {/* New Thread Button (Icon Only) */}
          <div className="mb-6">
            <button
              onClick={() => onNavigate('home')}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-user-bubble dark:bg-zinc-800 text-gray-600 dark:text-gray-300 transition-transform duration-200 hover:scale-110 active:scale-95 cursor-pointer"
            >
              <Plus size={20} />
            </button>
          </div>

          {/* Nav Icons */}
          <div className="flex flex-col gap-4 w-full">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id)
                  // On mobile (isOpen), only switch tab, don't navigate full page
                  if (!isOpen) {
                    if (item.id === 'library') onNavigate('library')
                    else if (item.id === 'spaces') onNavigate('spaces')
                    else if (item.id === 'bookmarks') onNavigate('bookmarks')
                  }
                }}
                onMouseEnter={() => setHoveredTab(item.id)}
                className={clsx(
                  'flex flex-col items-center justify-center py-2 mx-2 rounded-xl transition-all duration-200 cursor-pointer group',
                  activeTab === item.id
                    ? 'text-primary-500 dark:text-primary-400'
                    : 'text-[#13343bbf] dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
                )}
              >
                <div
                  className={clsx(
                    'p-3 rounded-lg transition-all',
                    activeTab === item.id
                      ? 'bg-user-bubble dark:bg-user-bubble/10'
                      : 'group-hover:bg-user-bubble dark:group-hover:bg-zinc-800/50',
                  )}
                >
                  <item.icon size={20} />
                </div>
                <span className="text-[11px] font-medium font-sans overflow-hidden transition-all duration-300 ease-in-out max-h-[20px] opacity-100 mt-1 md:max-h-0 md:opacity-0 md:mt-0 md:group-hover:max-h-[20px] md:group-hover:opacity-100 md:group-hover:mt-1">
                  {item.label}
                </span>
              </button>
            ))}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Theme Toggle Button */}
          <div className="mb-2">
            <button
              onClick={onToggleTheme}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-user-bubble dark:bg-zinc-800 text-gray-600 dark:text-gray-300 transition-transform duration-200 hover:scale-110 active:scale-95 cursor-pointer"
            //  title={`Current theme: ${theme}`}
            >
              {getThemeIcon()}
            </button>
          </div>

          {/* Settings Button (Icon Only) */}
          <div className="mb-2">
            <button
              onClick={onOpenSettings}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-user-bubble dark:bg-zinc-800 text-gray-600 dark:text-gray-300 transition-transform duration-200 hover:scale-110 active:scale-95 cursor-pointer"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>

        {/* 2. Expanded Content Panel */}
        <div
          className={clsx(
            'h-full bg-sidebar  transition-all duration-300 ease-in-out overflow-hidden flex flex-col',
            isExpanded && displayTab !== 'discover'
              ? 'w-64 opacity-100 translate-x-0 shadow-2xl'
              : 'w-0 opacity-0 -translate-x-4',
          )}
        >
          <div className="p-2 min-w-[256px]">
            {' '}
            {/* min-w ensures content doesn't squash during transition */}
            {/* Header based on Tab */}
            <div className="p-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-lg text-foreground">
                  {displayTab === 'library'
                    ? 'Library'
                    : displayTab === 'bookmarks'
                      ? 'Bookmarks'
                      : displayTab === 'spaces'
                        ? 'Spaces'
                        : ''}
                </h2>
                {/* View Full Page Button (Mobile Only, or always if useful) 
                    The user requested this specifically for the extension area.
                    We will show it always or check conditions, but it's safest to show it 
                    so users know they can go there. */}
                <button
                  onClick={() => onNavigate(displayTab)}
                  className="md:hidden px-2 py-1 text-xs font-medium rounded bg-user-bubble dark:bg-zinc-800 hover:bg-user-bubble/10 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-200 transition-colors"
                >
                  See all
                </button>
              </div>
              <button
                onClick={() => setIsPinned(!isPinned)}
                className="hidden md:block p-1.5 hover:bg-primary-50 dark:hover:bg-zinc-700 hover:text-primary-600 dark:hover:text-primary-400 rounded transition-colors"
                title={isPinned ? 'Unpin sidebar' : 'Pin sidebar'}
              >
                <Pin
                  size={16}
                  className={clsx(
                    'transition-colors',
                    isPinned ? 'fill-current text-primary-500' : 'text-gray-500 dark:text-gray-400',
                  )}
                />
              </button>
            </div>
            <div className="h-px bg-gray-200 dark:bg-zinc-800 mb-2" />
            {/* CONVERSATION LIST (Library & Bookmarks) */}
            {(displayTab === 'library' || displayTab === 'bookmarks') && (
              <div className="flex flex-col gap-2 overflow-y-auto overscroll-contain h-[calc(100vh-70px)] px-2 sidebar-scrollbar">
                {!isConversationsLoading &&
                  displayTab === 'library' &&
                  conversations.length === 0 && (
                    <div className="flex flex-col items-center gap-2 text-xs text-gray-500 dark:text-gray-400 px-2 py-3">
                      <Coffee size={24} className="text-black dark:text-white" />
                      <div>No conversations yet.</div>
                    </div>
                  )}
                {!isBookmarksLoading &&
                  displayTab === 'bookmarks' &&
                  displayConversations.length === 0 && (
                    <div className="flex flex-col items-center gap-2 text-xs text-gray-500 dark:text-gray-400 px-2 py-3">
                      <Coffee size={24} className="text-black dark:text-white" />
                      <div>No bookmarked conversations.</div>
                    </div>
                  )}

                {/* For library tab, use grouped conversations with limits */}
                {displayTab === 'library' &&
                  groupedConversations.map(section => (
                    <div key={section.title} className="flex flex-col gap-1">
                      <div className="text-[10px] justify-center flex uppercase tracking-wide text-gray-400 px-2 mt-1">
                        {section.title}
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
                                'text-sm p-2 rounded cursor-pointer truncate transition-colors group relative',
                                isActive
                                  ? 'bg-primary-500/10 dark:bg-primary-500/20 border border-primary-500/30 text-primary-700 dark:text-primary-300'
                                  : 'text-gray-700 dark:text-gray-300 hover:bg-primary-50 dark:hover:bg-zinc-800',
                                isExpanded &&
                                'bg-primary-50/70 dark:bg-primary-900/20  border-primary-200/60  dark:border-primary-800/60 ring-1 ring-primary-100/70 dark:ring-primary-800/60',
                              )}
                              title={conv.title}
                            >
                              <div className="flex items-center justify-between w-full overflow-hidden">
                                <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
                                  {space?.emoji && (
                                    <EmojiDisplay
                                      emoji={space.emoji}
                                      size="1.4em"
                                      className="shrink-0"
                                    />
                                  )}
                                  <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                                    <div className="flex items-center gap-1 min-w-0">
                                      <span className="truncate font-medium flex-1 min-w-0">
                                        {conv.title}
                                      </span>
                                      {conv.is_favorited && (
                                        <Bookmark
                                          size={12}
                                          className="text-primary-500 fill-current shrink-0"
                                        />
                                      )}
                                    </div>
                                    <span
                                      className={clsx(
                                        'text-[10px]',
                                        isActive
                                          ? 'text-primary-600 dark:text-primary-400'
                                          : 'text-gray-400',
                                      )}
                                    >
                                      {formatDateTime(conv.created_at)}
                                    </span>
                                  </div>
                                </div>

                                <div className="relative ml-2 shrink-0">
                                  <button
                                    onClick={e => {
                                      e.stopPropagation()
                                      setExpandedActionId(prev =>
                                        prev === conv.id ? null : conv.id,
                                      )
                                    }}
                                    className={clsx(
                                      'p-1.5 rounded-md hover:bg-gray-300 dark:hover:bg-zinc-700 transition-all',
                                      isActive
                                        ? 'text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/20'
                                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-zinc-700',
                                      'opacity-100',
                                      'md:opacity-0 md:group-hover:opacity-100',
                                      'min-w-[32px] min-h-[32px] flex items-center justify-center',
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
                              <div className="grid grid-cols-2 gap-2 mt-2 px-2 text-xs">
                                <button
                                  onClick={e => {
                                    e.stopPropagation()
                                    handleToggleFavorite(conv)
                                  }}
                                  className={clsx(
                                    'py-1.5 rounded-md transition-colors flex items-center justify-center gap-1.5 font-medium border border-transparent',
                                    conv.is_favorited
                                      ? 'bg-primary-50 text-primary-500 border-primary-50 dark:bg-primary-600/20 dark:text-primary-500 dark:border-primary-50/30'
                                      : 'text-gray-500 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-zinc-700 hover:text-primary-600 dark:hover:text-primary-400',
                                  )}
                                  title={conv.is_favorited ? 'Remove Bookmark' : 'Add Bookmark'}
                                >
                                  <Bookmark
                                    size={13}
                                    className={conv.is_favorited ? 'fill-current' : ''}
                                  />
                                  <span className="truncate">
                                    {conv.is_favorited ? 'Added' : 'Add'}
                                  </span>
                                </button>
                                <button
                                  onClick={e => {
                                    e.stopPropagation()
                                    handleDeleteConversation(conv)
                                  }}
                                  className="py-1.5 rounded-md transition-colors flex items-center justify-center gap-1.5 font-medium border border-transparent text-gray-500 dark:text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 hover:border-red-100 dark:hover:border-red-800/30"
                                >
                                  <Trash2 size={13} />
                                  <span>Delete</span>
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
                          fetchConversations(false)
                        }}
                        disabled={loadingMore}
                        className="w-full py-2 text-xs font-medium text-gray-700 dark:text-gray-200 bg-user-bubble dark:bg-zinc-800 hover:transform hover:translate-y-[-2px] rounded transition-colors flex items-center justify-center gap-2"
                      >
                        {loadingMore ? <DotLoader /> : 'Load more'}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 text-[10px] text-gray-400 py-2">
                        <span className="flex-1 h-px bg-gray-200 dark:bg-zinc-800" />
                        <span className="whitespace-nowrap">No more threads</span>
                        <span className="flex-1 h-px bg-gray-200 dark:bg-zinc-800" />
                      </div>
                    )}
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
                            'text-sm p-2 rounded cursor-pointer truncate transition-colors group relative',
                            isActive
                              ? 'bg-primary-500/10 dark:bg-primary-500/20 border border-primary-500/30 text-primary-700 dark:text-primary-300'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-primary-50 dark:hover:bg-zinc-800',
                            isExpanded &&
                            'bg-primary-50/70 dark:bg-primary-900/20 border border-primary-200/60 dark:border-primary-800/60 ring-1 ring-primary-100/70 dark:ring-primary-800/60',
                          )}
                          title={conv.title}
                        >
                          <div className="flex items-center justify-between w-full overflow-hidden">
                            <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
                              {space?.emoji && (
                                <EmojiDisplay
                                  emoji={space.emoji}
                                  size="1.4em"
                                  className="shrink-0"
                                />
                              )}
                              <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                                <div className="flex items-center gap-1 min-w-0">
                                  <span className="truncate font-medium flex-1 min-w-0">
                                    {conv.title}
                                  </span>
                                  <Bookmark
                                    size={12}
                                    className="text-primary-500 fill-current shrink-0"
                                  />
                                </div>
                                <span
                                  className={clsx(
                                    'text-[10px]',
                                    isActive
                                      ? 'text-primary-600 dark:text-primary-400'
                                      : 'text-gray-400',
                                  )}
                                >
                                  {formatDateTime(conv.created_at)}
                                </span>
                              </div>
                            </div>

                            <div className="relative ml-2 shrink-0">
                              <button
                                onClick={e => {
                                  e.stopPropagation()
                                  setExpandedActionId(prev => (prev === conv.id ? null : conv.id))
                                }}
                                className={clsx(
                                  'p-1.5 rounded-md hover:bg-gray-300 dark:hover:bg-zinc-700 transition-all',
                                  isActive
                                    ? 'text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/20'
                                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-zinc-700',
                                  'opacity-100',
                                  'md:opacity-0 md:group-hover:opacity-100',
                                  'min-w-[32px] min-h-[32px] flex items-center justify-center',
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
                          <div className="grid grid-cols-2 gap-2 mt-2 px-2 text-xs">
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                handleToggleFavorite(conv)
                              }}
                              className={clsx(
                                'py-1.5 rounded-md transition-colors flex items-center justify-center gap-1.5 font-medium border border-transparent',
                                conv.is_favorited
                                  ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-200 dark:border-yellow-800/30'
                                  : 'text-gray-500 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-zinc-700 hover:text-primary-600 dark:hover:text-primary-400',
                              )}
                              title={conv.is_favorited ? 'Remove Bookmark' : 'Add Bookmark'}
                            >
                              <Bookmark
                                size={13}
                                className={conv.is_favorited ? 'fill-current' : ''}
                              />
                              <span className="truncate">
                                {conv.is_favorited ? 'Saved' : 'Save'}
                              </span>
                            </button>
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                handleDeleteConversation(conv)
                              }}
                              className="py-1.5 rounded-md transition-colors flex items-center justify-center gap-1.5 font-medium border border-transparent text-gray-500 dark:text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 hover:border-red-100 dark:hover:border-red-800/30"
                            >
                              <Trash2 size={13} />
                              <span>Delete</span>
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
                        className="w-full py-2 text-xs font-medium text-gray-700 dark:text-gray-200 bg-user-bubble dark:bg-zinc-800 hover:bg-user-bubble/10 dark:hover:bg-zinc-700 rounded transition-colors flex items-center justify-center gap-2"
                      >
                        {bookmarksLoadingMore ? <DotLoader /> : 'Load more'}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 text-[10px] text-gray-400 py-2">
                        <span className="flex-1 h-px bg-gray-200 dark:bg-zinc-800" />
                        <span className="whitespace-nowrap">No more threads</span>
                        <span className="flex-1 h-px bg-gray-200 dark:bg-zinc-800" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* SPACES TAB CONTENT */}
            {displayTab === 'spaces' && (
              <div className="flex flex-col gap-2 overflow-y-auto overscroll-contain h-[calc(100vh-70px)] px-2 sidebar-scrollbar">
                {/* Create New Space */}
                <button
                  onClick={onCreateSpace}
                  className="flex items-center gap-3 bg-user-bubble hover:scale-105 dark:bg-zinc-800 transition-transform p-2 rounded-lg hover:bg-user-bubble dark:hover:bg-user-bubble/10  text-gray-6600 dark:text-gray-300  w-full text-left cursor-pointer "
                >
                  <div className="w-8 h-8 rounded  flex items-center justify-center text-gray-700 dark:text-gray-100">
                    <Plus size={16} />
                  </div>
                  <span className="text-sm font-medium">Create New Space</span>
                </button>

                <div className="h-px bg-gray-200 dark:bg-zinc-800 mb-2" />

                {/* Spaces List */}
                {spacesLoading && (
                  <div className="flex justify-center py-2">
                    <DotLoader />
                  </div>
                )}
                {!spacesLoading && spaces.length === 0 && (
                  <div className="flex flex-col items-center gap-2 text-xs text-gray-500 dark:text-gray-400 px-2 py-3">
                    <Coffee size={24} className="text-black dark:text-white" />
                    <div>No spaces yet.</div>
                  </div>
                )}
                {visibleSpaces.map(space => (
                  <React.Fragment key={space.id || space.label}>
                    <div
                      onClick={() => onNavigateToSpace(space)}
                      className="flex items-center justify-between p-2 rounded  cursor-pointer transition-colors group"
                    >
                      <div className="flex-1 min-w-0 flex items-center gap-1">
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            toggleSpace(space.id)
                          }}
                          className="p-1.5 rounded-md -ml-1 hover:bg-primary-50 dark:hover:bg-zinc-800 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors shrink-0"
                        >
                          <ChevronDown
                            size={16}
                            className={clsx(
                              'transition-transform duration-200',
                              expandedSpaces.has(space.id) ? '' : '-rotate-90',
                            )}
                          />
                        </button>
                        <div className="w-8 h-8 rounded bg-transparent flex items-center justify-center group-hover:border-gray-300 dark:group-hover:border-zinc-600 text-lg shrink-0">
                          <EmojiDisplay emoji={space.emoji} />
                        </div>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-gray-200 transition-colors truncate">
                          {space.label}
                        </span>
                      </div>

                      {/* Edit Button (Visible on Hover) */}
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          onEditSpace(space)
                        }}
                        className="p-1.5 rounded-md ml-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-primary-50 dark:hover:bg-zinc-800 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors shrink-0"
                      >
                        <Settings size={16} />
                      </button>
                    </div>

                    {/* Expandable Content for Space */}
                    {expandedSpaces.has(space.id) && (
                      <div className="ml-2 sm:ml-4 mr-2 flex flex-col gap-1 border-l border-gray-200 dark:border-zinc-800 pl-2 mb-2">
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
                              className={clsx(
                                'group relative flex items-center justify-between text-xs py-1.5 px-2 rounded cursor-pointer truncate transition-colors',
                                conv.id === activeConversationId
                                  ? 'bg-primary-500/10 text-primary-700 dark:text-primary-300 font-medium'
                                  : 'text-gray-600 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-zinc-800 hover:shadow-sm hover:ring-1 hover:ring-primary-200 dark:hover:ring-zinc-700 hover:z-10',
                              )}
                              onClick={() => onOpenConversation && onOpenConversation(conv)}
                              title={conv.title}
                            >
                              <div className="flex-1 truncate">{conv.title || 'Untitled'}</div>
                            </div>
                          </div>
                        ))}

                        {spaceConversations[space.id]?.items?.length > 0 &&
                          spaceConversations[space.id]?.hasMore && (
                            <div className="px-2 py-2">
                              {
                                <button
                                  onClick={e => {
                                    e.stopPropagation()
                                    fetchSpaceConversations(space.id, false)
                                  }}
                                  disabled={spaceConversations[space.id]?.loading}
                                  className="w-full py-2 text-xs font-medium text-gray-700 dark:text-gray-200 bg-user-bubble dark:bg-zinc-800 hover:bg-user-bubble/10 dark:hover:bg-zinc-700 rounded transition-colors flex items-center justify-center gap-2"
                                >
                                  {spaceConversations[space.id]?.loading ? (
                                    <DotLoader />
                                  ) : (
                                    'Load more'
                                  )}
                                </button>
                                // : (
                                //   <div className="hidden  items-center gap-2 text-[10px] text-gray-400 py-2">
                                //     <span className="flex-1 h-px bg-gray-200 dark:bg-zinc-800" />
                                //     <span className="whitespace-nowrap">No more threads</span>
                                //     <span className="flex-1 h-px bg-gray-200 dark:bg-zinc-800" />
                                //   </div>
                                // )
                              }
                            </div>
                          )}

                        {!spaceConversations[space.id]?.loading &&
                          spaceConversations[space.id]?.items?.length === 0 && (
                            <div className="flex flex-col items-center gap-1 text-[10px] text-gray-400 py-1 px-2">
                              <SquareStack size={18} className="text-black dark:text-white" />
                              <div>No history</div>
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
                        className="w-full py-2 text-xs font-medium text-gray-700 dark:text-gray-200 bg-user-bubble dark:bg-zinc-800 hover:bg-user-bubble/10 dark:hover:bg-zinc-700 rounded transition-colors flex items-center justify-center gap-2"
                      >
                        {spacesLoadingMore ? <DotLoader /> : 'Load more'}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 text-[10px] text-gray-400 py-2">
                        <span className="flex-1 h-px bg-gray-200 dark:bg-zinc-800" />
                        <span className="whitespace-nowrap">No more spaces</span>
                        <span className="flex-1 h-px bg-gray-200 dark:bg-zinc-800" />
                      </div>
                    )}
                  </div>
                )}

                {/* See All Button - only for spaces tab when there are more spaces */}
                {/* {displayTab === 'spaces' && spacesHasMore && (
                  <div className="flex flex-col gap-1 mt-2">
                    <button
                      onClick={() => {
                        setActiveTab('spaces')
                        onNavigate('spaces')
                      }}
                      className="flex items-center justify-center gap-2 p-2 text-sm text-gray-500 dark:text-gray-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors rounded hover:bg-primary-50 dark:hover:bg-zinc-800"
                    >
                      <span>See all</span>
                    </button>
                  </div>
                )} */}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default Sidebar
