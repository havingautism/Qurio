import { Globe, Plus, Settings, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  deleteHomeShortcut,
  fetchHomeShortcuts,
  getDirectFaviconUrl,
  getFaviconFallbackUrl,
  reorderHomeShortcuts,
  upsertHomeShortcut,
} from '../../../lib/homeWidgetsService'
import ShortcutModal from './ShortcutModal'
import WidgetCard from './WidgetCard'

// ============================================================================
// Constants
// ============================================================================

const ITEMS_PER_PAGE = 8
const LONG_PRESS_DELAY = 500
const EDGE_SCROLL_ZONE = 50 // px
const EDGE_SCROLL_DELAY = 1000 // ms

// ============================================================================
// Icon Component
// ============================================================================

const ShortcutIcon = ({ shortcut, size = 24 }) => {
  const [useFallback, setUseFallback] = useState(false)

  if (shortcut.icon_type === 'emoji') {
    return <span style={{ fontSize: size }}>{shortcut.icon_name || '😀'}</span>
  }

  if (shortcut.icon_type === 'favicon') {
    return useFallback ? (
      <img
        src={getFaviconFallbackUrl(shortcut.url)}
        alt=""
        width={size}
        height={size}
        className="object-contain"
        onError={e => {
          e.target.style.display = 'none'
        }}
      />
    ) : (
      <>
        <img
          src={getDirectFaviconUrl(shortcut.url)}
          alt=""
          width={size}
          height={size}
          className="object-contain"
          onError={() => setUseFallback(true)}
        />
      </>
    )
  }

  if (shortcut.icon_type === 'custom') {
    return shortcut.icon_url ? (
      <img
        src={shortcut.icon_url}
        alt=""
        width={size}
        height={size}
        className="object-contain"
        onError={e => (e.target.style.display = 'none')}
      />
    ) : (
      <Globe size={size} className="text-gray-500" />
    )
  }

  return <Globe size={size} className="text-gray-500" />
}

// ============================================================================
// Main Component
// ============================================================================

const ShortcutsWidget = () => {
  const { t } = useTranslation()
  const [shortcuts, setShortcuts] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingShortcut, setEditingShortcut] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  // Pagination
  const [currentPage, setCurrentPage] = useState(0)

  // Edit & Drag Mode
  const [isEditMode, setIsEditMode] = useState(false)
  const [dragState, setDragState] = useState({
    isActive: false,
    item: null,
    initialX: 0,
    initialY: 0,
    currentX: 0,
    currentY: 0,
    offsetX: 0,
    offsetY: 0,
  })

  // Refs
  const containerRef = useRef(null)
  const longPressTimerRef = useRef(null)
  const pageFlipTimerRef = useRef(null)
  const shortcutsRef = useRef(shortcuts) // ref to keep track of latest state in event handlers
  const dragStateRef = useRef({ item: null, isActive: false, hasMoved: false })
  const preventNextClickRef = useRef(false)

  // Update ref when state changes
  useEffect(() => {
    shortcutsRef.current = shortcuts
  }, [shortcuts])

  // Load shortcuts
  const loadShortcuts = useCallback(async () => {
    setIsLoading(true)
    const { data } = await fetchHomeShortcuts()
    if (data) {
      setShortcuts(data)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    loadShortcuts()
  }, [loadShortcuts])

  // ============================================================================
  // Helpers
  // ============================================================================

  const totalPages = Math.ceil((shortcuts.length || 1) / ITEMS_PER_PAGE)

  const goToPage = page => {
    if (page >= 0 && page < totalPages) {
      setCurrentPage(page)
    }
  }

  const getPageShortcuts = pageIndex => {
    // If we are dragging, we should show the live updated list (which includes the moved item)
    // The dragged item acts as a placeholder in the grid
    return shortcuts.slice(pageIndex * ITEMS_PER_PAGE, (pageIndex + 1) * ITEMS_PER_PAGE)
  }

  const moveItem = targetIndex => {
    setShortcuts(prev => {
      const draggedItem = dragStateRef.current.item
      if (!draggedItem) return prev

      const currentIndex = prev.findIndex(i => i.id === draggedItem.id)
      if (currentIndex === -1 || currentIndex === targetIndex) return prev

      const newList = [...prev]
      newList.splice(currentIndex, 1)
      newList.splice(targetIndex, 0, draggedItem)

      shortcutsRef.current = newList
      return newList
    })
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  const updateSortOrder = useCallback((x, y) => {
    const list = shortcutsRef.current
    if (!list.length) return

    // Find the item currently under the cursor (or closest to it)
    const elements = Array.from(document.querySelectorAll('[data-shortcut-index]'))
    let closestIndex = -1
    let minDistance = Infinity

    elements.forEach(el => {
      const rect = el.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const dist = Math.hypot(x - centerX, y - centerY)

      // Only consider relatively close items (within 100px) to prevent jumping when far away
      if (dist < minDistance && dist < 150) {
        minDistance = dist
        closestIndex = parseInt(el.getAttribute('data-shortcut-index'), 10)
      }
    })

    if (closestIndex !== -1) {
      moveItem(closestIndex)
    }
  }, [])

  const checkPageFlip = useCallback(clientX => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    // Left edge
    if (clientX < rect.left + EDGE_SCROLL_ZONE) {
      if (!pageFlipTimerRef.current) {
        pageFlipTimerRef.current = setTimeout(() => {
          setCurrentPage(p => Math.max(0, p - 1))
          pageFlipTimerRef.current = null
        }, EDGE_SCROLL_DELAY)
      }
    }
    // Right edge
    else if (clientX > rect.right - EDGE_SCROLL_ZONE) {
      if (!pageFlipTimerRef.current) {
        pageFlipTimerRef.current = setTimeout(() => {
          setCurrentPage(prev => {
            const max = Math.ceil(shortcutsRef.current.length / ITEMS_PER_PAGE)
            return prev < max - 1 ? prev + 1 : prev
          })
          pageFlipTimerRef.current = null
        }, EDGE_SCROLL_DELAY)
      }
    } else {
      if (pageFlipTimerRef.current) {
        clearTimeout(pageFlipTimerRef.current)
        pageFlipTimerRef.current = null
      }
    }
  }, [])

  const onPointerMove = useCallback(
    e => {
      // If nothing is active or pending, ignore
      if (!dragStateRef.current.isActive && !dragStateRef.current.isPending) return

      e.preventDefault()
      const { clientX, clientY } = e

      // Check threshold if pending
      if (dragStateRef.current.isPending) {
        const dist = Math.hypot(
          clientX - dragStateRef.current.startX,
          clientY - dragStateRef.current.startY,
        )
        if (dist < 10) return // Ignore small movements (jitters/taps)

        // Threshold passed -> Start actual drag
        dragStateRef.current.isPending = false
        dragStateRef.current.isActive = true

        // Trigger visual state update
        setDragState({
          isActive: true,
          item: dragStateRef.current.item,
          currentX: clientX,
          currentY: clientY,
          offsetX: dragStateRef.current.offsetX,
          offsetY: dragStateRef.current.offsetY,
        })
      }

      // Logic for active drag
      if (dragStateRef.current.isActive) {
        // Update visual state
        setDragState(prev => ({ ...prev, currentX: clientX, currentY: clientY }))

        checkPageFlip(clientX)
        updateSortOrder(clientX, clientY)
      }
    },
    [checkPageFlip, updateSortOrder],
  )

  const onPointerUp = useCallback(async () => {
    // If we were dragging (active), prevent the next click
    if (dragStateRef.current.isActive) {
      preventNextClickRef.current = true
    }

    // Capture state before cleanup
    const wasActive = dragStateRef.current.isActive

    // Cleanup Ref state
    dragStateRef.current = { item: null, isActive: false, isPending: false }

    // Cleanup UI state if it was active
    if (wasActive) {
      setDragState(prev => ({ ...prev, isActive: false, item: null }))
    }

    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)

    if (pageFlipTimerRef.current) {
      clearTimeout(pageFlipTimerRef.current)
      pageFlipTimerRef.current = null
    }

    // Only save if we actually dragged
    if (wasActive) {
      await reorderHomeShortcuts(shortcutsRef.current)
    }

    // Cleanup any lingering timers
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [onPointerMove, checkPageFlip, updateSortOrder])

  // Bind the global listeners in startDrag
  // Correctly handling listeners lifecycle
  useEffect(() => {
    // Just for cleanup on unmount
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
      if (pageFlipTimerRef.current) clearTimeout(pageFlipTimerRef.current)
    }
  }, [onPointerMove, onPointerUp])

  const handleStartDrag = (shortcut, clientX, clientY, currentTarget) => {
    const rect = currentTarget.getBoundingClientRect()
    const offsetX = clientX - rect.left
    const offsetY = clientY - rect.top

    // Init Pending State (Do NOT setDragState yet)
    dragStateRef.current = {
      item: shortcut,
      isActive: false,
      isPending: true,
      startX: clientX,
      startY: clientY,
      offsetX,
      offsetY,
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
  }

  const handleItemPointerDown = (e, shortcut) => {
    // Ignore right click
    if (e.button !== 0 && e.button !== undefined) return

    preventNextClickRef.current = false
    const clientX = e.clientX
    const clientY = e.clientY
    const currentTarget = e.currentTarget

    // If edit mode, drag immediately
    if (isEditMode) {
      // e.preventDefault() // Removed to allow 'click' event to fire on touch devices
      handleStartDrag(shortcut, clientX, clientY, currentTarget)
    } else {
      // Wait for long press
      longPressTimerRef.current = setTimeout(() => {
        setIsEditMode(true)
        preventNextClickRef.current = true // Prevent click if long press triggered
        handleStartDrag(shortcut, clientX, clientY, currentTarget)
      }, LONG_PRESS_DELAY)

      // Allow click cancel
      const cancelLongPress = () => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current)
          longPressTimerRef.current = null
        }
        currentTarget.removeEventListener('pointerup', cancelLongPress)
        currentTarget.removeEventListener('pointermove', checkMove)
        currentTarget.removeEventListener('pointerleave', cancelLongPress)
      }

      const checkMove = moveEvent => {
        if (
          Math.abs(moveEvent.clientX - clientX) > 10 ||
          Math.abs(moveEvent.clientY - clientY) > 10
        ) {
          cancelLongPress()
        }
      }

      currentTarget.addEventListener('pointerup', cancelLongPress)
      currentTarget.addEventListener('pointermove', checkMove)
      currentTarget.addEventListener('pointerleave', cancelLongPress)
    }
  }

  // Swipe tracking
  const swipeStartRef = useRef(null)

  const handleContainerPointerDown = e => {
    // If dragging an item, ignore container swipe
    if (dragStateRef.current.isActive) return
    // If clicking a button/icon, let it bubble (but record start for potential swipe)

    swipeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
    }
  }

  const handleContainerPointerUp = e => {
    if (!swipeStartRef.current || dragStateRef.current.isActive) return

    const deltaX = e.clientX - swipeStartRef.current.x
    const deltaY = e.clientY - swipeStartRef.current.y
    const deltaTime = Date.now() - swipeStartRef.current.time

    // Reset
    swipeStartRef.current = null

    // Check for horizontal swipe
    // Threshold: > 50px distance, < 1500ms duration (relaxed for desktop dragging), and horizontal movement dominates
    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) && deltaTime < 1500) {
      if (deltaX > 0) {
        // Swipe Right -> Prev Page
        goToPage(Math.max(0, currentPage - 1))
      } else {
        // Swipe Left -> Next Page
        goToPage(Math.min(totalPages - 1, currentPage + 1))
      }
    }
  }

  // ============================================================================
  // Rendering
  // ============================================================================

  return (
    <>
      <WidgetCard
        title={t('views.widgets.shortcutsTitle')}
        action={
          <div className="flex items-center gap-1">
            {isEditMode ? (
              <button
                onClick={() => setIsEditMode(false)}
                className="px-3 py-1 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-full transition-colors"
                title={t('common.done', 'Done')}
              >
                {t('common.done', 'Done')}
              </button>
            ) : (
              <>
                {shortcuts.length > 0 && (
                  <button
                    onClick={() => setIsEditMode(true)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800"
                    title={t('views.widgets.editShortcuts', 'Edit Shortcuts')}
                  >
                    <Settings size={16} />
                  </button>
                )}
                <button
                  onClick={() => {
                    setEditingShortcut(null)
                    setIsModalOpen(true)
                  }}
                  className="bg-primary-500 hover:bg-primary-600 text-white p-1.5 rounded-full shadow-lg transition-transform hover:scale-105"
                  title={t('views.widgets.addShortcut', 'Add Shortcut')}
                >
                  <Plus size={16} />
                </button>
              </>
            )}
          </div>
        }
        className="h-full min-h-[320px]"
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400 text-sm">{t('common.loading', 'Loading...')}</div>
          </div>
        ) : shortcuts.length === 0 ? (
          <div
            onClick={() => {
              setEditingShortcut(null)
              setIsModalOpen(true)
            }}
            className="flex flex-col items-center justify-center h-full cursor-pointer text-gray-400 hover:text-primary-500 transition-colors"
          >
            <Plus size={32} className="mb-2 opacity-50" />
            <span className="text-sm font-medium">
              {t('views.widgets.addFirstShortcut', 'Add Shortcut')}
            </span>
          </div>
        ) : (
          <div
            className="flex flex-col h-full select-none"
            ref={containerRef}
            style={{ touchAction: isEditMode ? 'none' : 'pan-y' }}
            onPointerDown={handleContainerPointerDown}
            onPointerUp={handleContainerPointerUp}
            onDragStart={e => e.preventDefault()}
          >
            {/* Carousel Rendering */}
            <div className="relative w-full h-full overflow-hidden rounded-2xl">
              <div
                className="flex h-full transition-transform duration-500 cubic-bezier(0.32, 0.72, 0, 1)"
                style={{ transform: `translateX(-${currentPage * 100}%)` }}
              >
                {Array.from({ length: Math.max(1, totalPages) }).map((_, pageIndex) => (
                  <div key={pageIndex} className="relative w-full h-full flex-shrink-0 p-2">
                    {shortcuts.length > 0 &&
                      getPageShortcuts(pageIndex).map((shortcut, idx) => {
                        // Calculate absolute position
                        const row = Math.floor(idx / 4)
                        const col = idx % 4
                        // Use slightly constrained percentages to create "gaps"
                        const topPercent = row * 50 + 2 // Start at 2% or 52%
                        const leftPercent = col * 25 // 0, 25, 50, 75

                        // Calculate global index
                        const globalIndex = pageIndex * ITEMS_PER_PAGE + idx
                        // Check if this is the item being dragged
                        const isBeingDragged =
                          dragState.isActive && dragState.item && dragState.item.id === shortcut.id

                        return (
                          <div
                            key={shortcut.id}
                            data-shortcut-index={globalIndex}
                            style={{
                              position: 'absolute',
                              top: `${topPercent}%`,
                              left: `${leftPercent}%`,
                              width: '25%',
                              height: '46%', // Leave 4% gap vertically
                              transition: isBeingDragged
                                ? 'none'
                                : 'all 0.4s cubic-bezier(0.2, 0, 0.2, 1)',
                              zIndex: isBeingDragged ? 0 : 1,
                              WebkitTouchCallout: 'none',
                            }}
                            className={`flex flex-col items-center justify-center p-2
                                    ${isEditMode && !isBeingDragged ? 'animate-shake' : ''}
                                    ${isBeingDragged ? 'opacity-0' : 'opacity-100'} 
                                `}
                            onDragStart={e => e.preventDefault()}
                            onContextMenu={e => e.preventDefault()}
                            onPointerDown={e => handleItemPointerDown(e, shortcut)}
                          >
                            <div className="relative">
                              <div
                                onClick={e => {
                                  e.stopPropagation()
                                  if (preventNextClickRef.current) {
                                    preventNextClickRef.current = false
                                    return
                                  }

                                  if (isEditMode) {
                                    setEditingShortcut(shortcut)
                                    setIsModalOpen(true)
                                  } else {
                                    window.open(shortcut.url, '_blank', 'noopener,noreferrer')
                                  }
                                }}
                                className={`w-14 h-14 flex items-center justify-center rounded-2xl bg-gray-100 dark:bg-white/10 transition-all duration-300 shadow-sm cursor-pointer
                                  ${!isEditMode && 'hover:bg-gray-200 dark:hover:bg-white/20 hover:scale-105'}
                                  ${isEditMode && 'cursor-grab group'}
                                `}
                              >
                                <ShortcutIcon shortcut={shortcut} size={28} />

                                {/* Edit Hint Overlay */}
                                {isEditMode && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 dark:bg-black/40 rounded-2xl opacity-40 hover:opacity-100 transition-opacity">
                                    <Settings size={20} className="text-white drop-shadow-md" />
                                  </div>
                                )}
                              </div>

                              {/* Delete button relative to icon */}
                              {isEditMode && !isBeingDragged && (
                                <button
                                  className="absolute -top-2 -right-2 w-5 h-5 bg-gray-500/80 hover:bg-red-500 text-white rounded-full flex items-center justify-center shadow-md z-10 hover:scale-110 transition-transform backdrop-blur-sm"
                                  onPointerDown={e => e.stopPropagation()}
                                  onClick={e => {
                                    e.stopPropagation()
                                    deleteHomeShortcut(shortcut.id).then(() => loadShortcuts())
                                  }}
                                >
                                  <X size={12} />
                                </button>
                              )}
                            </div>

                            <span className="text-xs mt-2 truncate max-w-full w-full text-center text-gray-600 dark:text-gray-300 pointer-events-none select-none px-1">
                              {shortcut.title}
                            </span>
                          </div>
                        )
                      })}
                  </div>
                ))}
              </div>
            </div>

            {/* Pagination Dots */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 py-2">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goToPage(i)}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                      i === currentPage ? 'bg-primary-500 w-4' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </WidgetCard>

      {/* Ghost Element Layer */}
      {dragState.isActive &&
        dragState.item &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              left: dragState.currentX - dragState.offsetX,
              top: dragState.currentY - dragState.offsetY,
              width: 64, // roughly w-16
              height: 64,
              pointerEvents: 'none',
              zIndex: 9999,
              transform: `rotate(5deg) scale(1.1)`,
              opacity: 0.9,
              touchAction: 'none',
            }}
            className="flex flex-col items-center justify-center p-2"
          >
            <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-white/10 shadow-2xl ring-2 ring-primary-500">
              <ShortcutIcon shortcut={dragState.item} />
            </div>
            <span className="text-xs mt-1 truncate max-w-full text-center text-gray-600 dark:text-gray-300 font-bold">
              {dragState.item.title}
            </span>
          </div>,
          document.body,
        )}

      <ShortcutModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        shortcut={editingShortcut}
        onSave={async val => {
          const { error } = await upsertHomeShortcut(val)
          if (!error) {
            loadShortcuts()
            setIsModalOpen(false)
          }
        }}
        onDelete={async id => {
          const { error } = await deleteHomeShortcut(id)
          if (!error) {
            loadShortcuts()
            setIsModalOpen(false)
          }
        }}
        currentPosition={shortcuts.length} // Append to end
      />

      {/* Global styles for shake animation */}
      <style>{`
        @keyframes shake {
          0% { transform: rotate(0deg); }
          25% { transform: rotate(1deg); }
          50% { transform: rotate(0deg); }
          75% { transform: rotate(-1deg); }
          100% { transform: rotate(0deg); }
        }
        .animate-shake {
          animation: shake 0.3s infinite ease-in-out;
        }
      `}</style>
    </>
  )
}

export default ShortcutsWidget
