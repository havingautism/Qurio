import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'

const DropdownMenu = ({ isOpen, onClose, items, anchorEl }) => {
  const menuRef = useRef(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [isMobile, setIsMobile] = useState(false)

  // Check if mobile view
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768) // md: breakpoint
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (isOpen && anchorEl) {
      if (isMobile) {
        // On mobile, position the menu to cover the full width below the conversation item
        const rect = anchorEl.getBoundingClientRect()
        const viewportHeight = window.innerHeight
        // Find the parent conversation element
        const conversationEl = anchorEl.closest('[data-conversation-id]') ||
                              anchorEl.closest('.group') ||
                              anchorEl.parentElement

        // Estimate menu height (items * 48px + padding)
        const estimatedMenuHeight = items.length * 48 + 16

        if (conversationEl) {
          const convRect = conversationEl.getBoundingClientRect()

          // Check if menu would overflow viewport
          let topPosition = convRect.bottom
          if (topPosition + estimatedMenuHeight > viewportHeight) {
            // Position above the conversation element
            topPosition = convRect.top - estimatedMenuHeight
            // If still overflowing, position at top of viewport
            if (topPosition < 8) {
              topPosition = 8
            }
          }

          setPosition({
            top: topPosition,
            left: 16, // 16px padding from left
            right: 16, // 16px padding from right
          })

          // Add highlight classes to the conversation element using Tailwind with !important
          conversationEl.classList.add(
            '!bg-cyan-500/10',
            '!border',
            '!border-cyan-500/30',
            'dark:!bg-cyan-500/20',
            'dark:!border-cyan-500/40',
            'transition-all',
            'duration-200'
          )
        } else {
          // Fallback: position below anchor but with padding
          let topPosition = rect.bottom + 4
          if (topPosition + estimatedMenuHeight > viewportHeight) {
            topPosition = Math.max(8, rect.top - estimatedMenuHeight)
          }
          setPosition({
            top: topPosition,
            left: 16,
            right: 16,
          })
        }
      } else {
        // On desktop, position relative to anchor
        const rect = anchorEl.getBoundingClientRect()
        const viewportHeight = window.innerHeight
        const estimatedMenuHeight = items.length * 32 + 8

        let topPosition = rect.bottom + 4
        if (topPosition + estimatedMenuHeight > viewportHeight) {
          // Position above the anchor
          topPosition = Math.max(8, rect.top - estimatedMenuHeight - 4)
        }

        setPosition({
          top: topPosition,
          left: rect.left,
        })

        // Also add highlight on desktop
        const conversationEl = anchorEl.closest('[data-conversation-id]') ||
                              anchorEl.closest('.group') ||
                              anchorEl.parentElement
        if (conversationEl) {
          conversationEl.classList.add(
            '!bg-cyan-500/10',
            '!border',
            '!border-cyan-500/30',
            'dark:!bg-cyan-500/20',
            'dark:!border-cyan-500/40',
            'transition-all',
            'duration-200'
          )
        }
      }
    }
  }, [isOpen, anchorEl, isMobile, items.length])

  // Remove highlight when menu closes
  useEffect(() => {
    if (!isOpen) {
      // Remove all highlight classes including !important variants
      document.querySelectorAll('[class*="bg-cyan-500"], [class*="!bg-cyan-500"]').forEach(el => {
        el.classList.remove(
          'bg-cyan-500/10',
          '!bg-cyan-500/10',
          'border',
          '!border',
          'border-cyan-500/30',
          '!border-cyan-500/30',
          'dark:bg-cyan-500/20',
          'dark:!bg-cyan-500/20',
          'dark:border-cyan-500/40',
          'dark:!border-cyan-500/40'
        )
      })
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = event => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        (!anchorEl || !anchorEl.contains(event.target))
      ) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [isOpen, onClose, anchorEl])

  if (!isOpen || !anchorEl) return null

  return (
    <div
      ref={menuRef}
      style={{
        top: position.top,
        left: isMobile ? (position.left || 16) : position.left,
        right: isMobile ? position.right : 'auto',
      }}
      className={clsx(
        'fixed z-[9999] bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 shadow-lg p-1',
        isMobile
          ? 'rounded-lg'
          : 'min-w-[160px] rounded-lg',
      )}
    >
      {items.map((item, index) => (
        <button
          key={index}
          onClick={e => {
            e.stopPropagation()
            item.onClick()
            onClose()
          }}
          className={clsx(
            'w-full text-left transition-colors flex items-center gap-2 rounded-lg',
            isMobile
              ? 'px-4 py-3 text-base'
              : 'px-4 py-2 text-sm',
            item.danger
              ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
              : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-700',
          )}
        >
          {item.icon && <span>{item.icon}</span>}
          <span className={clsx('font-medium', isMobile ? 'text-sm' : 'text-xs')}>
            {item.label}
          </span>
        </button>
      ))}
    </div>
  )
}

export default DropdownMenu
