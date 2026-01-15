import React, { useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import useScrollLock from '../hooks/useScrollLock'

const MobileDrawer = ({ isOpen, onClose, title, icon: Icon, children }) => {
  useScrollLock(isOpen)
  const drawerRef = useRef(null)
  const previousActiveElement = useRef(null)

  // Focus trap and management
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement
      // Small delay to allow animation
      setTimeout(() => {
        drawerRef.current?.focus()
      }, 100)
    } else {
      previousActiveElement.current?.focus()
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = e => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity animate-in fade-in duration-300"
        onClick={event => {
          event.stopPropagation()
          onClose()
        }}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        className="relative w-full max-w-md bg-white dark:bg-[#1E1E1E] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85dvh] sm:max-h-[80vh] animate-in slide-in-from-bottom duration-300 sm:zoom-in-95 sm:slide-in-from-bottom-4"
      >
        {/* Handle indicator */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 bg-gray-300 dark:bg-zinc-700 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 py-3 flex items-center justify-between shrink-0 border-b border-gray-100 dark:border-zinc-800/50">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="flex items-center justify-center w-9 h-9 bg-primary-500/10 dark:bg-primary-500/20 rounded-xl text-primary-500">
                <Icon size={18} strokeWidth={2} />
              </div>
            )}
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-none">
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-xl transition-all duration-200 active:scale-95"
            aria-label="Close"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto min-h-0 p-3 pb-8 sm:pb-6">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export default MobileDrawer
