/**
 * useMessageSelection Hook
 * Manages text selection menu positioning and state
 */

import { useState, useEffect, useCallback } from 'react'
import useIsMobile from '../../hooks/useIsMobile'
import { isNodeInAnswerScope, calculateMenuPosition } from '../../components/messageBubble/messageUtils.js'
import { MENU_POSITIONING, MOBILE_SELECTION_DELAY } from '../../components/messageBubble/messageConstants.js'

export function useMessageSelection(containerRef) {
  const [selectionMenu, setSelectionMenu] = useState(null)
  const isMobile = useIsMobile()

  const updateSelectionMenuFromSelection = useCallback(() => {
    const selection = window.getSelection()
    const text = selection?.toString().trim()

    if (!text) {
      setSelectionMenu(null)
      return false
    }

    const container = containerRef.current
    if (!container || !container.contains(selection.anchorNode)) {
      setSelectionMenu(null)
      return false
    }

    if (!isNodeInAnswerScope(selection.anchorNode) || !isNodeInAnswerScope(selection.focusNode)) {
      setSelectionMenu(null)
      return false
    }

    if (!selection.rangeCount) return false
    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()

    if (!rect || rect.width === 0 || rect.height === 0) {
      setSelectionMenu(null)
      return false
    }

    const position = calculateMenuPosition(rect, isMobile, MENU_POSITIONING)

    setSelectionMenu({
      x: position.x,
      y: position.y,
      text,
    })
    return true
  }, [containerRef])

  const handleMouseUp = useCallback(
    e => {
      if (isMobile) return
      if (e.target.closest('.selection-menu')) return
      if (!updateSelectionMenuFromSelection()) {
        setSelectionMenu(null)
      }
    },
    [isMobile, updateSelectionMenuFromSelection],
  )

  const handleTouchEnd = useCallback(() => {
    if (!isMobile) return

    setTimeout(() => {
      if (!updateSelectionMenuFromSelection()) {
        setSelectionMenu(null)
      }
    }, MOBILE_SELECTION_DELAY)
  }, [isMobile, updateSelectionMenuFromSelection])

  const handleContextMenu = useCallback(
    e => {
      if (isMobile && e.target.closest('.message-content')) {
        e.preventDefault()
      }
    },
    [isMobile],
  )

  // Clear menu on click/touch outside
  useEffect(() => {
    const handleDocumentInteraction = e => {
      if (selectionMenu && !e.target.closest('.selection-menu')) {
        setSelectionMenu(null)
      }
    }

    const eventType = isMobile ? 'touchstart' : 'mousedown'
    document.addEventListener(eventType, handleDocumentInteraction)

    return () => document.removeEventListener(eventType, handleDocumentInteraction)
  }, [selectionMenu, isMobile])

  // Handle selection changes for mobile
  useEffect(() => {
    if (!isMobile) return

    const handleSelectionChange = () => {
      const selection = window.getSelection()
      const text = selection.toString().trim()

      if (!text) {
        setSelectionMenu(null)
        return
      }

      updateSelectionMenuFromSelection()
    }

    document.addEventListener('selectionchange', handleSelectionChange)

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [isMobile, updateSelectionMenuFromSelection])

  return {
    selectionMenu,
    setSelectionMenu,
    handleMouseUp,
    handleTouchEnd,
    handleContextMenu,
  }
}
