import { useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X, Globe, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react'
import useScrollLock from '../hooks/useScrollLock'

const MobileSourcesDrawer = ({ isOpen, onClose, sources = [], title }) => {
  const { t } = useTranslation()
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const getHostname = url => {
    try {
      const hostname = new URL(url).hostname
      return hostname.replace(/^www\./, '')
    } catch (e) {
      return t('sources.source')
    }
  }
  const resolveUrl = source => source?.url || source?.uri || source?.link || source?.href || ''

  useScrollLock(isOpen)
  const drawerRef = useRef(null)

  // Reset page on open/sources change
  useEffect(() => {
    if (isOpen) {
      // Logic for resetting could go here, but avoiding setState in render
    }
  }, [isOpen, sources])

  // Close on click outside logic is handled by the backdrop overlay

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={event => {
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }}
        onMouseDown={event => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onTouchStart={event => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onTouchEnd={event => {
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="relative w-full max-w-md bg-white dark:bg-[#1E1E1E] rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh] animate-slide-up"
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between shrink-0 border-b border-gray-100 dark:border-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 bg-primary-500/10 rounded-full text-primary-500">
              <Globe size={20} />
            </div>
            <div className="flex flex-col">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 leading-none mb-1">
                {title || t('sources.title')}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                {t('sources.resultsFound', { count: sources.length })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto min-h-0 py-2">
          {sources.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              {t('sources.noSources')}
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-zinc-800/50">
              {sources
                .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                .map((source, idx) => {
                  const url = resolveUrl(source)
                  const absoluteIndex = (currentPage - 1) * itemsPerPage + idx
                  return (
                    <a
                      key={url || absoluteIndex}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors group active:bg-gray-100 dark:active:bg-zinc-800"
                    >
                      <div className="shrink-0 w-6 h-6 rounded-full bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 flex items-center justify-center text-[10px] font-bold text-gray-500 dark:text-gray-400">
                        {source.originalIndex !== undefined
                          ? source.originalIndex + 1
                          : absoluteIndex + 1}
                      </div>
                      {(source.icon || url) && (
                        <img
                          src={
                            source.icon ||
                            `https://www.google.com/s2/favicons?domain=${getHostname(url)}&sz=128`
                          }
                          alt=""
                          className="w-5 h-5 rounded-full opacity-70 group-hover:opacity-100 transition-opacity"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight mb-0.5 truncate">
                          {source.title || url}
                        </h4>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {source.media || getHostname(url)}
                        </div>
                      </div>
                      <ExternalLink
                        size={16}
                        className="shrink-0 text-gray-300 dark:text-zinc-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors"
                      />
                    </a>
                  )
                })}
            </div>
          )}
        </div>

        {/* Pagination Footer */}
        {Math.ceil(sources.length / itemsPerPage) > 1 && (
          <div className="border-t border-gray-100 dark:border-zinc-800/50 p-4 shrink-0">
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-gray-600 dark:text-gray-400"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {currentPage} / {Math.ceil(sources.length / itemsPerPage)}
              </span>
              <button
                onClick={() =>
                  setCurrentPage(p => Math.min(Math.ceil(sources.length / itemsPerPage), p + 1))
                }
                disabled={currentPage === Math.ceil(sources.length / itemsPerPage)}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-gray-600 dark:text-gray-400"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}

        {/* Bottom Safe Area Spacer */}
        {/* <div className="h-6 shrink-0" /> */}
      </div>
    </div>,
    document.body,
  )
}

export default MobileSourcesDrawer
