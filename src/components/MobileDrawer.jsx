import React, { useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import useScrollLock from '../hooks/useScrollLock'

const MobileDrawer = ({ isOpen, onClose, title, icon: Icon, children }) => {
  useScrollLock(isOpen)
  const drawerRef = useRef(null)

  // Close on click outside logic is handled by the backdrop overlay

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        onClick={event => {
          // No preventDefault here to allow click to work properly, but stop propagation
          event.stopPropagation()
          onClose()
        }}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="relative w-full max-w-md bg-white dark:bg-[#1E1E1E] rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh] animate-in slide-in-from-bottom duration-300"
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between shrink-0 border-b border-gray-100 dark:border-zinc-800/50">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="flex items-center justify-center w-10 h-10 bg-primary-500/10 rounded-full text-primary-500">
                <Icon size={20} />
              </div>
            )}
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 leading-none">
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto min-h-0 p-2 pb-8">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export default MobileDrawer
