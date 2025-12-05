import React, { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'

const DropdownMenu = ({ isOpen, onClose, items, anchorEl }) => {
  const menuRef = useRef(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (isOpen && anchorEl) {
      const rect = anchorEl.getBoundingClientRect()
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
      })
    }
  }, [isOpen, anchorEl])

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
        left: position.left,
      }}
      className={clsx(
        'fixed z-[9999] min-w-[160px] bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-lg p-1',
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
            'w-full px-4 py-2 text-left text-sm transition-colors flex items-center gap-2 rounded-lg',
            item.danger
              ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
              : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-700',
          )}
        >
          {item.icon && <span>{item.icon}</span>}
          <span className="font-medium text-xs">{item.label}</span>
        </button>
      ))}
    </div>
  )
}

export default DropdownMenu
