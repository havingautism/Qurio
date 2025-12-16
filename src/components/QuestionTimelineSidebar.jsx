import React, { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, Clock, MessageSquare } from 'lucide-react'
import clsx from 'clsx'
import useScrollLock from '../hooks/useScrollLock'

/**
 * A collapsible sidebar component that displays user questions as cards
 * with search functionality and jump-to-position capability
 *
 * @param {Array} items - Array of question items with id, label, and timestamp
 * @param {Function} onJump - Function to handle jumping to a specific question
 * @param {String} activeId - ID of the currently active question
 * @param {Boolean} isOpen - Whether the sidebar is open
 * @param {Function} onToggle - Function to toggle sidebar open/closed
 */
const QuestionTimelineSidebar = ({
  items = [],
  onJump,
  activeId,
  isOpen = false,
  onToggle,
  className,
}) => {
  useScrollLock(isOpen)

  const [searchQuery, setSearchQuery] = useState('')
  const [isTransitioning, setIsTransitioning] = useState(false)

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items

    const query = searchQuery.toLowerCase()
    return items.filter(
      item =>
        item.label?.toLowerCase().includes(query) ||
        (item.timestamp && item.timestamp.toLowerCase().includes(query)),
    )
  }, [items, searchQuery])

  // Group items by date if timestamps are available
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

          if (date.toDateString() === today.toDateString()) {
            groupKey = 'Today'
          } else if (date.toDateString() === yesterday.toDateString()) {
            groupKey = 'Yesterday'
          } else {
            groupKey = date.toLocaleDateString('en-US', {
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
  }, [filteredItems])

  const formatTime = timestamp => {
    if (!timestamp) return null

    try {
      const date = new Date(timestamp)
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      })
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

  const sidebarContent = (
    <>
      {/* Overlay when sidebar is open */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
          onClick={handleToggle}
          onWheel={e => e.preventDefault()}
          onTouchMove={e => e.preventDefault()}
        />
      )}

      {/* Sidebar */}
      <div
        className={clsx(
          'top-0 bg-white dark:bg-[#202222] border-l border-gray-200 dark:border-zinc-700 shadow-2xl z-50 transform transition-all duration-300 ease-in-out flex flex-col overflow-hidden',
          // Always positioned on the right
          'fixed right-0',
          // Different widths for different screen sizes
          'w-3/4 md:w-96',
          // Mobile animation
          isOpen ? 'translate-x-0' : 'translate-x-full',
          className,
        )}
        style={{ height: '100dvh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-zinc-700 shrink-0">
          <div className="flex items-center gap-2 text-gray-900 dark:text-white">
            <MessageSquare size={20} />
            <h2 className="text-lg font-semibold">Question History</h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Desktop close button */}
            <button
              onClick={handleToggle}
              className="hidden md:flex p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
              title="Close timeline"
            >
              <X size={20} className="text-gray-500 dark:text-gray-400" />
            </button>

            {/* Mobile close button */}
            <button
              onClick={handleToggle}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X size={20} className="text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-gray-200 dark:border-zinc-700 shrink-0">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search questions..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-zinc-800 border border-transparent rounded-lg focus:outline-none focus:border-primary-500 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4 min-h-0">
          {filteredItems.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare size={48} className="mx-auto text-gray-300 dark:text-zinc-600 mb-4" />
              <p className="text-gray-500 dark:text-gray-400">
                {searchQuery ? 'No questions found' : 'No questions yet'}
              </p>
            </div>
          ) : (
            Object.entries(groupedItems).map(([groupKey, groupItems]) => (
              <div key={groupKey} className="space-y-2">
                {/* Group Header */}
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider py-2">
                  {groupKey}
                </div>

                {/* Question Cards */}
                {groupItems.map((item, index) => (
                  <QuestionCard
                    key={item.id}
                    item={item}
                    isActive={activeId === item.id}
                    onClick={() => handleItemClick(item)}
                    time={formatTime(item.timestamp)}
                  />
                ))}
              </div>
            ))
          )}
        </div>

        {/* Footer with question count */}
        {filteredItems.length > 0 && (
          <div className="p-4 border-t border-gray-200 dark:border-zinc-700 shrink-0">
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
              <span>
                {items.length} {items.length === 1 ? 'question' : 'questions'}
              </span>
              {searchQuery && <span>{filteredItems.length} found</span>}
            </div>
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

  // Always render portal to allow smooth animations
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
        'p-3 rounded-lg border cursor-pointer transition-all duration-200',
        'hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600',
        isActive
          ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-600 shadow-sm'
          : 'bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-zinc-700',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <div
            className={clsx(
              'w-2 h-2 rounded-full',
              isActive ? 'bg-primary-500' : 'bg-gray-300 dark:bg-zinc-600',
            )}
          />
        </div>

        <div className="flex-1 min-w-0">
          <p
            className={clsx(
              'text-sm leading-relaxed break-words',
              isActive
                ? 'text-primary-900 dark:text-primary-100 font-medium'
                : 'text-gray-700 dark:text-gray-300',
            )}
          >
            {item.label}
          </p>

          {time && (
            <div className="flex items-center gap-1 mt-2 text-xs text-gray-500 dark:text-gray-400">
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
