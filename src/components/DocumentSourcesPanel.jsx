import { useMemo } from 'react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { FileText, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import useIsMobile from '../hooks/useIsMobile'

const SourcesModal = ({ isOpen, onClose, sources }) => {
  const { t } = useTranslation()
  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
      <div
        className="w-full h-[85vh] sm:h-auto sm:max-h-[80vh] sm:max-w-2xl bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl shadow-xl flex flex-col animate-in slide-in-from-bottom duration-300"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-zinc-800">
          <div className="font-semibold text-lg text-gray-900 dark:text-gray-100">
            {t('sources.documentSources')} ({sources.length})
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {sources.map((source, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl bg-gray-50 dark:bg-zinc-800/50 border border-gray-100 dark:border-zinc-700/50"
            >
              <div className="flex items-start gap-3 mb-2">
                <div className="p-2 rounded-lg bg-white dark:bg-zinc-700 shadow-sm text-sky-500">
                  <FileText size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {source.title}
                  </div>
                  {source.fileType && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 uppercase tracking-wider font-medium">
                      {source.fileType}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed pl-1 border-l-2 border-gray-200 dark:border-zinc-700 ml-1">
                {source.fullSnippet}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

const DocumentSourcesPanel = ({ sources = [], isOpen, onClose }) => {
  // const { t } = useTranslation() // Unused in parent now
  const isMobile = useIsMobile()
  // const [isModalOpen, setIsModalOpen] = useState(false) // Unused state

  // Deduplicate sources by documentId (or title if id missing)
  // We want to group chunks from the same doc
  const uniqueSources = useMemo(() => {
    if (!sources || !sources.length) return []

    const map = new Map()
    sources.forEach(source => {
      const key = source.documentId || source.title
      if (!map.has(key)) {
        map.set(key, {
          ...source,
          // Keep the first chunk snippet, or maybe join top 2?
          // For now, let's just use the first chunk's text but truncated more aggressively for card
          snippet: source.snippet?.slice(0, 150),
          fullSnippet: source.snippet, // Keep full logic for modal
        })
      }
    })
    return Array.from(map.values())
  }, [sources])

  if (!uniqueSources.length) return null

  // Mobile View: Directly open Modal when toggled
  if (isMobile) {
    return <SourcesModal isOpen={isOpen} onClose={onClose} sources={uniqueSources} />
  }

  // Desktop View: Grid (Existing logic but with deduplication)
  return (
    <div
      className={clsx(
        'grid transition-all duration-300 ease-spring overflow-hidden w-full',
        isOpen ? 'grid-rows-[1fr] opacity-100 mt-3 pb-2' : 'grid-rows-[0fr] opacity-0 mt-0',
      )}
    >
      <div className="min-h-0 w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {uniqueSources.map((source, idx) => (
            <div
              key={source.id || idx}
              className="p-3 rounded-2xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/50 shadow-sm hover:shadow-md transition-shadow cursor-default group"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1 rounded bg-white dark:bg-zinc-800 shadow-sm text-gray-500">
                    <FileText size={12} />
                  </div>
                  <div className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                    {source.title}
                  </div>
                </div>
                {source.fileType && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium">
                    {source.fileType}
                  </span>
                )}
              </div>

              <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                {source.snippet}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default DocumentSourcesPanel
