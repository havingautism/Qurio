import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { PanelRightClose, Clock, MessageSquare } from 'lucide-react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import useScrollLock from '../hooks/useScrollLock'

/**
 * A collapsible sidebar component that displays user questions as cards
 * with search functionality, sorting, and jump-to-position capability
 *
 * @param {Array} items - Array of question items with id, label, and timestamp
 * @param {Function} onJump - Function to handle jumping to a specific question
 * @param {String} activeId - ID of the currently active question
 * @param {Boolean} isOpen - Whether the sidebar is open
 * @param {Function} onToggle - Function to toggle sidebar open/closed
 * @param {String} className - Additional CSS class names
 */
const QuestionTimelineSidebar = ({
  items = [],
  onJump,
  activeId,
  isOpen = false,
  onToggle,
  className,
  messagesContainerRef,
}) => {
  const { i18n } = useTranslation()
  useScrollLock(isOpen)

  const [searchQuery, setSearchQuery] = useState('')
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isLargeScreen, setIsLargeScreen] = useState(false)
  const [sortOrder, setSortOrder] = useState('desc') // 'asc' for oldest first, 'desc' for newest first
  const [dragPreviewId, setDragPreviewId] = useState(null)
  const timelineRailRef = useRef(null)
  const overlayRef = useRef(null)
  const dragFrameRef = useRef(null)
  const lastTouchIndexRef = useRef(null)
  // const [activeIndicatorTop, setActiveIndicatorTop] = useState(null) // Removed unused state
  const [desktopTimelinePosition, setDesktopTimelinePosition] = useState({
    top: '50%',
    right: '32px',
  })

  // Check screen size
  useEffect(() => {
    const checkScreenSize = () => {
      setIsLargeScreen(window.innerWidth >= 1280) // xl breakpoint and above
    }

    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)
    return () => window.removeEventListener('resize', checkScreenSize)
  }, [])

  // Filter and sort items based on search query and sort order
  const filteredItems = useMemo(() => {
    let filtered = items

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = items.filter(
        item =>
          item.label?.toLowerCase().includes(query) ||
          (item.timestamp && item.timestamp.toLowerCase().includes(query)),
      )
    }

    // Apply sorting by timestamp
    const sorted = [...filtered].sort((a, b) => {
      // Handle items without timestamps
      if (!a.timestamp && !b.timestamp) return 0
      if (!a.timestamp) return 1 // Put items without timestamp at the end
      if (!b.timestamp) return -1 // Put items without timestamp at the end

      const dateA = new Date(a.timestamp).getTime()
      const dateB = new Date(b.timestamp).getTime()

      // Sort based on sortOrder: 'asc' for oldest first, 'desc' for newest first
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA
    })

    return sorted
  }, [items, searchQuery, sortOrder])

  // Group items by date while preserving the order from sorted filteredItems
  const groupedItems = useMemo(() => {
    const groups = {}

    filteredItems.forEach(item => {
      let groupKey = 'No Date'

      if (item.timestamp) {
        try {
          const date = new Date(item.timestamp)
          const today = new Date()
          const yesterday = new Date(today)
          yesterday.setDate(yesterday.getDate() - 1)
          const locale = i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US'

          if (date.toDateString() === today.toDateString()) {
            groupKey = 'Today'
          } else if (date.toDateString() === yesterday.toDateString()) {
            groupKey = 'Yesterday'
          } else {
            groupKey = date.toLocaleDateString(locale, {
              month: 'short',
              day: 'numeric',
              year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
            })
          }
        } catch (e) {
          console.warn('Invalid timestamp:', item.timestamp)
        }
      }

      if (!groups[groupKey]) {
        groups[groupKey] = []
      }
      groups[groupKey].push(item)
    })

    return groups
  }, [filteredItems, i18n.language])

  const timelineGroupedItems = useMemo(() => {
    const ascSorted = [...filteredItems].sort((a, b) => {
      if (!a.timestamp && !b.timestamp) return 0
      if (!a.timestamp) return 1
      if (!b.timestamp) return -1
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    })

    const groups = {}

    ascSorted.forEach(item => {
      let groupKey = 'No Date'

      if (item.timestamp) {
        try {
          const date = new Date(item.timestamp)
          const today = new Date()
          const yesterday = new Date(today)
          yesterday.setDate(yesterday.getDate() - 1)
          const locale = i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US'

          if (date.toDateString() === today.toDateString()) {
            groupKey = 'Today'
          } else if (date.toDateString() === yesterday.toDateString()) {
            groupKey = 'Yesterday'
          } else {
            groupKey = date.toLocaleDateString(locale, {
              month: 'short',
              day: 'numeric',
              year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
            })
          }
        } catch (e) {
          console.warn('Invalid timestamp:', item.timestamp)
        }
      }

      if (!groups[groupKey]) {
        groups[groupKey] = []
      }
      groups[groupKey].push(item)
    })

    return groups
  }, [filteredItems, i18n.language])

  const flatTimelineItems = useMemo(
    () => Object.values(timelineGroupedItems).flat(),
    [timelineGroupedItems],
  )

  const formatTime = timestamp => {
    if (!timestamp) return null

    try {
      const date = new Date(timestamp)
      const locale = i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US'
      const dateStr = date.toLocaleDateString(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
      const timeStr = date.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
      return `${dateStr} ${timeStr}`
    } catch (e) {
      return null
    }
  }

  const handleItemClick = item => {
    if (onJump) {
      onJump(item.id)
    }
  }

  const handleToggle = () => {
    if (onToggle) {
      setIsTransitioning(true)
      onToggle(!isOpen)
      // Wait for transition to complete
      setTimeout(() => {
        setIsTransitioning(false)
      }, 300) // Match the duration of the CSS transition
    }
  }

  useEffect(() => {
    return () => {
      if (dragFrameRef.current) {
        cancelAnimationFrame(dragFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (isLargeScreen) return
    const overlay = overlayRef.current
    if (!overlay) return

    const preventScroll = event => {
      event.preventDefault()
    }

    overlay.addEventListener('wheel', preventScroll, { passive: false })
    overlay.addEventListener('touchmove', preventScroll, { passive: false })
    return () => {
      overlay.removeEventListener('wheel', preventScroll)
      overlay.removeEventListener('touchmove', preventScroll)
    }
  }, [isLargeScreen, isOpen])

  // Removed unused activeIndicator logic
  const updateActiveIndicator = useCallback(() => {}, [])

  const getIndexFromTouch = useCallback(
    touch => {
      if (!timelineRailRef.current || flatTimelineItems.length === 0) return null
      const rect = timelineRailRef.current.getBoundingClientRect()
      if (rect.height <= 0) return null

      const clampedY = Math.min(Math.max(touch.clientY, rect.top), rect.bottom)
      const percent = (clampedY - rect.top) / rect.height
      const idx = Math.round(percent * (flatTimelineItems.length - 1))

      return Math.min(Math.max(idx, 0), flatTimelineItems.length - 1)
    },
    [flatTimelineItems.length],
  )

  const activateTimelineIndex = useCallback(
    idx => {
      const item = flatTimelineItems[idx]
      if (!item) return
      setDragPreviewId(item.id)
      if (onJump) onJump(item.id)
    },
    [flatTimelineItems, onJump],
  )

  const scheduleActivateIndex = useCallback(
    idx => {
      if (idx === null || idx === lastTouchIndexRef.current) return
      lastTouchIndexRef.current = idx
      if (dragFrameRef.current) {
        cancelAnimationFrame(dragFrameRef.current)
      }
      dragFrameRef.current = requestAnimationFrame(() => {
        activateTimelineIndex(idx)
      })
    },
    [activateTimelineIndex],
  )

  const handleTimelineTouchStart = useCallback(
    event => {
      if (!flatTimelineItems.length) return
      event.preventDefault()
      const idx = getIndexFromTouch(event.touches[0])
      scheduleActivateIndex(idx)
    },
    [flatTimelineItems.length, getIndexFromTouch, scheduleActivateIndex],
  )

  const handleTimelineTouchMove = useCallback(
    event => {
      if (!flatTimelineItems.length) return
      // optimization: prevent default to stop scrolling the page
      if (event.cancelable) event.preventDefault()

      const idx = getIndexFromTouch(event.touches[0])
      if (idx !== null && idx !== lastTouchIndexRef.current) {
        lastTouchIndexRef.current = idx
        // Only update visual preview, do NOT jump yet
        const item = flatTimelineItems[idx]
        if (item) setDragPreviewId(item.id)
      }
    },
    [flatTimelineItems, getIndexFromTouch],
  )

  const handleTimelineTouchEnd = useCallback(() => {
    // If we have a preview ID (meaning we were dragging), jump to it now
    if (dragPreviewId && onJump) {
      onJump(dragPreviewId)
    }

    setDragPreviewId(null)
    lastTouchIndexRef.current = null
    if (dragFrameRef.current) {
      cancelAnimationFrame(dragFrameRef.current)
      dragFrameRef.current = null
    }
  }, [dragPreviewId, onJump])

  useEffect(() => {
    if (isLargeScreen) return
    const rail = timelineRailRef.current
    if (!rail) return

    const onStart = event => handleTimelineTouchStart(event)
    const onMove = event => handleTimelineTouchMove(event)
    const onEnd = () => handleTimelineTouchEnd()

    rail.addEventListener('touchstart', onStart, { passive: false })
    rail.addEventListener('touchmove', onMove, { passive: false })
    rail.addEventListener('touchend', onEnd, { passive: true })
    rail.addEventListener('touchcancel', onEnd, { passive: true })

    return () => {
      rail.removeEventListener('touchstart', onStart)
      rail.removeEventListener('touchmove', onMove)
      rail.removeEventListener('touchend', onEnd)
      rail.removeEventListener('touchcancel', onEnd)
    }
  }, [
    handleTimelineTouchStart,
    handleTimelineTouchMove,
    handleTimelineTouchEnd,
    isLargeScreen,
    flatTimelineItems.length,
  ])

  const sidebarContent = (
    <>
      {/* Overlay when sidebar is open - only on smaller screens */}
      {isOpen && !isLargeScreen && (
        <div
          // className="fixed inset-0 blur-sm bg-black/30  z-40"
          className="fixed inset-0 z-40"
          ref={overlayRef}
          onClick={handleToggle}
        />
      )}

      {/* Sidebar */}
      <div
        data-sidebar="timeline"
        className={clsx(
          'flex flex-col transition-all duration-300 ease-in-out',
          isLargeScreen
            ? 'absolute top-0 left-full z-30 ml-16 h-full w-75 border-none bg-transparent shadow-none'
            : [
                'fixed top-0 right-0 h-dvh w-75', // Fixed width for mobile sidebar instead of variable
                'bg-background z-50',
                isOpen ? 'translate-x-0' : 'translate-x-full',
              ],
          className,
        )}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-4 py-3 xl:hidden">
          <div className="flex items-center gap-2 text-gray-900 dark:text-white">
            {/* <MessageSquare size={18} />
            <h2 className="text-base font-semibold">Question History</h2> */}
          </div>

          <div className="flex items-center gap-1">
            {/* Close button - only show on screens where sidebar can be toggled (xl and below) */}
            <button
              onClick={handleToggle}
              className="rounded-lg p-1.5 transition-colors hover:bg-gray-100 xl:hidden dark:hover:bg-zinc-800"
              title="Close timeline"
            >
              <PanelRightClose size={18} className="text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {!isLargeScreen && (
          <div className="flex flex-1 items-center justify-center px-6">
            {flatTimelineItems.length === 0 ? (
              <div className="py-6 text-center">
                <MessageSquare
                  size={40}
                  className="mx-auto mb-3 text-gray-300 dark:text-zinc-600"
                />
                <p className="text-sm text-gray-500 dark:text-gray-400">No questions yet</p>
              </div>
            ) : (
              <div ref={timelineRailRef} className="relative h-[55vh] w-full touch-none">
                {/* Visual Axis Container */}
                <div className="flex h-full flex-col items-end justify-center gap-3 py-1 pr-1">
                  {flatTimelineItems.map(item => {
                    const timeLabel = formatTime(item.timestamp)
                    const isPreview = dragPreviewId === item.id
                    const isActive = activeId === item.id
                    // Use preview ID for visual highlighting if dragging, otherwise use active ID
                    const isVisuallyActive = isPreview || (!dragPreviewId && isActive)

                    return (
                      <div
                        key={item.id}
                        className="group relative flex h-2 w-full items-center justify-end"
                      >
                        {/* Horizontal Line Indicator */}
                        <div
                          className={clsx(
                            'ease-spring h-[2px] rounded-full transition-all duration-300',
                            isVisuallyActive
                              ? 'bg-primary-500 w-8 shadow-[0_0_8px_rgba(var(--primary-500-rgb),0.5)]'
                              : 'w-2 bg-gray-300 dark:bg-zinc-600',
                          )}
                        />

                        {/* Tooltip Card (Left Side) - Show if isPreview or if it's the active item (and we aren't dragging something else) */}
                        <div
                          className={clsx(
                            'pointer-events-auto absolute top-1/2 right-8 z-50 -translate-y-1/2',
                            'transition-all duration-200',
                            isPreview || (isActive && !dragPreviewId)
                              ? 'translate-x-0 scale-100 opacity-100'
                              : 'pointer-events-none translate-x-4 scale-95 opacity-0',
                          )}
                        >
                          <div className="bg-user-bubble/95 w-auto max-w-[240px] min-w-[180px] rounded-2xl border border-gray-200/80 px-4 py-3 shadow-xl md:backdrop-blur-md dark:border-zinc-700/80 dark:bg-zinc-800/95">
                            {timeLabel && (
                              <div className="mb-0.5 text-[10px] font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
                                {timeLabel}
                              </div>
                            )}
                            <div className="text-sm wrap-break-word whitespace-normal text-gray-800 dark:text-gray-200">
                              {item.label}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating toggle button for desktop when sidebar is closed */}
      {/* {!isOpen && !isTransitioning && (
        <button
          onClick={handleToggle}
          className="hidden md:flex fixed right-6 top-6 p-2.5 bg-white dark:bg-[#202222] border border-gray-200 dark:border-zinc-700 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 z-50"
          title="Open question timeline"
        >
          <History size={20} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" />
        </button>
      )} */}
    </>
  )

  // Desktop Timeline Component
  const updateDesktopTimelinePosition = useCallback(() => {
    if (typeof window === 'undefined') return

    const container = messagesContainerRef?.current
    if (!container) {
      setDesktopTimelinePosition({
        top: '50%',
        right: '32px',
      })
      return
    }

    const rect = container.getBoundingClientRect()
    const marginRight = Math.max(0, window.innerWidth - rect.right)
    const desiredRight = Math.max(32, marginRight - 12)
    const clampedRight = Math.min(desiredRight, 320)
    const midY = rect.top + rect.height / 2

    setDesktopTimelinePosition({
      top: `${midY}px`,
      right: `${clampedRight}px`,
    })
  }, [messagesContainerRef])

  useEffect(() => {
    updateDesktopTimelinePosition()
    if (typeof window === 'undefined') return undefined

    window.addEventListener('resize', updateDesktopTimelinePosition)
    window.addEventListener('scroll', updateDesktopTimelinePosition, true)
    return () => {
      window.removeEventListener('resize', updateDesktopTimelinePosition)
      window.removeEventListener('scroll', updateDesktopTimelinePosition, true)
    }
  }, [updateDesktopTimelinePosition])

  const DesktopTimeline = () => {
    if (flatTimelineItems.length === 0) return null

    return (
      <div
        className="pointer-events-none fixed z-40 w-8"
        style={{
          top: desktopTimelinePosition.top,
          right: desktopTimelinePosition.right,
          transform: 'translateY(-50%)',
        }}
      >
        {/* The Rail Container */}
        <div className="relative flex flex-col items-end gap-1.5 py-4 pr-1">
          {/* Timeline Items */}
          {flatTimelineItems.map(item => {
            const isActive = activeId === item.id
            const timeLabel = formatTime(item.timestamp)

            return (
              <div
                key={item.id}
                data-item-id={item.id}
                className="group pointer-events-auto relative flex h-3 w-full cursor-pointer items-center justify-end"
                onClick={() => handleItemClick(item)}
              >
                {/* The Horizontal Line */}
                <div
                  className={clsx(
                    'ease-spring h-[2px] rounded-full transition-all duration-300',
                    isActive
                      ? 'bg-primary-500 w-5 shadow-[0_0_8px_rgba(var(--primary-500-rgb),0.4)]'
                      : 'group-hover:bg-primary-400 w-2 bg-gray-300 group-hover:w-4 dark:bg-zinc-600',
                  )}
                />

                {/* Tooltip Card (Left Side) - Only show on hover */}
                <div
                  className={clsx(
                    'pointer-events-auto absolute top-1/2 right-full mr-4 -translate-y-1/2',
                    'pointer-events-none translate-x-2 opacity-0',
                    'transition-all duration-200',
                    'group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100',
                  )}
                >
                  <div className="w-64 rounded-xl border border-gray-200/80 bg-white/90 p-3 shadow-xl md:backdrop-blur-sm dark:border-zinc-700/80 dark:bg-zinc-800/90">
                    {timeLabel && (
                      <div className="mb-0.5 text-[10px] font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
                        {timeLabel}
                      </div>
                    )}
                    <div className="text-sm wrap-break-word whitespace-normal text-gray-800 dark:text-gray-200">
                      {item.label}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Render Logic
  if (isLargeScreen) {
    return <DesktopTimeline />
  }

  return createPortal(sidebarContent, document.body)
}

/**
 * Individual question card component
 */
const QuestionCard = React.memo(({ item, isActive, onClick, time }) => {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'group cursor-pointer rounded-lg border border-gray-200 p-3 transition-all duration-200 dark:border-zinc-700',
        isActive
          ? 'bg-primary-50 dark:bg-primary-900/10 border-primary-500/50 dark:border-primary-900/50 text-primary-900 dark:text-primary-100'
          : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-zinc-800/50',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          <div
            className={clsx(
              'mt-1.5 h-2 w-2 rounded-full transition-colors',
              isActive
                ? 'bg-primary-500'
                : 'bg-transparent group-hover:bg-gray-300 dark:group-hover:bg-zinc-600',
            )}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p
            className={clsx(
              'text-sm leading-relaxed wrap-break-word',
              isActive ? 'font-medium' : '',
            )}
          >
            {item.label}
          </p>

          {time && (
            <div className="mt-2 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <Clock size={12} />
              <span>{time}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

QuestionCard.displayName = 'QuestionCard'

export default QuestionTimelineSidebar
