import { useMemo } from 'react'
import clsx from 'clsx'
import {
  Copy,
  Share2,
  ChevronDown,
  Download,
  RefreshCw,
  Globe,
  Trash2,
  FileText,
} from 'lucide-react'

const MessageActionBar = ({
  t,
  isDeepResearch,
  isMobile,
  message,
  isSourcesOpen,
  onToggleSources,
  documentSources,
  isDocumentSourcesOpen,
  onToggleDocumentSources,
  onOpenMobileSources,
  onShare,
  onRegenerate,
  onCopy,
  isCopied,
  onDownloadPdf,
  onDownloadWord,
  isDownloadMenuOpen,
  setIsDownloadMenuOpen,
  downloadMenuRef,
  onDelete,
}) => {
  const uniqueDocumentSourcesCount = useMemo(() => {
    if (!documentSources || !documentSources.length) return 0
    return documentSources.length
  }, [documentSources])

  return (
    <div className="flex items-center gap-4  border-t border-gray-200 dark:border-zinc-800 pt-4">
      <button
        className="group flex items-center font-mono text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        onClick={onShare}
      >
        <Share2 size={16} />
        <span className="hidden sm:block max-w-0 overflow-hidden opacity-0 whitespace-nowrap transition-all duration-300 ease-in-out group-hover:max-w-xs group-hover:opacity-100 group-hover:ml-2">
          {t('message.share')}
        </span>
      </button>
      <button
        className="group flex items-center text-sm font-mono text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        onClick={onRegenerate}
      >
        <RefreshCw size={16} />
        <span className="hidden sm:block max-w-0 overflow-hidden opacity-0 whitespace-nowrap transition-all duration-300 ease-in-out group-hover:max-w-xs group-hover:opacity-100 group-hover:ml-2">
          {t('message.regenerate')}
        </span>
      </button>
      <button
        className="group flex items-center text-sm font-mono text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        onClick={onCopy}
      >
        {isCopied ? (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-green-600 dark:text-green-400"
            >
              <polyline points="20,6 9,17 4,12"></polyline>
            </svg>
            <span className="text-green-600 dark:text-green-400 hidden sm:block max-w-0 overflow-hidden opacity-0 whitespace-nowrap transition-all duration-300 ease-in-out group-hover:max-w-xs group-hover:opacity-100 group-hover:ml-2">
              {t('message.copied')}
            </span>
          </>
        ) : (
          <>
            <Copy size={16} />
            <span className="hidden sm:block max-w-0 overflow-hidden opacity-0 whitespace-nowrap transition-all duration-300 ease-in-out group-hover:max-w-xs group-hover:opacity-100 group-hover:ml-2">
              {t('message.copy')}
            </span>
          </>
        )}
      </button>
      {isDeepResearch && (
        <div className="relative" ref={downloadMenuRef}>
          <button
            className="group flex items-center text-sm font-mono text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            onClick={() => setIsDownloadMenuOpen(prev => !prev)}
          >
            <Download size={16} />
            <span className="hidden sm:block max-w-0 overflow-hidden opacity-0 whitespace-nowrap transition-all duration-300 ease-in-out group-hover:max-w-xs group-hover:opacity-100 group-hover:ml-2">
              {t('messageBubble.download')}
            </span>
            <div className="hidden sm:block max-w-0 overflow-hidden opacity-0 whitespace-nowrap transition-all duration-300 ease-in-out group-hover:max-w-xs group-hover:opacity-100 group-hover:ml-1">
              <ChevronDown size={14} />
            </div>
          </button>
          {isDownloadMenuOpen && (
            <div
              className={clsx(
                'absolute left-0 w-44 bg-white dark:bg-[#202222] border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl z-30 overflow-hidden',
                isMobile ? 'bottom-full mb-2' : 'mt-2',
              )}
            >
              <div className="p-2 flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => {
                    onDownloadPdf()
                    setIsDownloadMenuOpen(false)
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left text-sm text-gray-700 dark:text-gray-200"
                >
                  {t('messageBubble.downloadPdf')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDownloadWord()
                    setIsDownloadMenuOpen(false)
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left text-sm text-gray-700 dark:text-gray-200"
                >
                  {t('messageBubble.downloadWord')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {message.sources && message.sources.length > 0 && (
        <button
          onClick={() => {
            if (isMobile) {
              onOpenMobileSources()
            } else {
              onToggleSources()
            }
          }}
          className={clsx(
            'group flex items-center text-sm transition-colors',
            isSourcesOpen
              ? 'text-primary-600 dark:text-primary-400 font-medium bg-primary-50 dark:bg-primary-900/20 px-2 py-1 rounded-lg'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
          )}
        >
          <Globe size={16} />
          <span className="hidden sm:block max-w-0 overflow-hidden opacity-0 whitespace-nowrap transition-all duration-300 ease-in-out group-hover:max-w-xs group-hover:opacity-100 group-hover:ml-2">
            {t('sources.title')}
          </span>
          <span
            className={clsx(
              'flex items-center justify-center rounded-full text-[10px] w-5 h-5 transition-colors ml-2',
              isSourcesOpen
                ? 'bg-primary-200 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                : 'bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-300',
            )}
          >
            {message.sources.length}
          </span>
        </button>
      )}
      {documentSources && documentSources.length > 0 && (
        <button
          type="button"
          onClick={onToggleDocumentSources}
          className={clsx(
            'group flex items-center text-sm transition-colors',
            isDocumentSourcesOpen
              ? 'text-primary-600 dark:text-primary-400 font-medium bg-primary-50 dark:bg-primary-900/20 px-2 py-1 rounded-lg'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
          )}
        >
          <FileText size={16} />
          <span className="hidden sm:block max-w-0 overflow-hidden opacity-0 whitespace-nowrap transition-all duration-300 ease-in-out group-hover:max-w-xs group-hover:opacity-100 group-hover:ml-2">
            {t('sources.documentSources')}
          </span>
          <span
            className={clsx(
              'flex items-center justify-center rounded-full text-[10px] w-5 h-5 transition-colors ml-2',
              isDocumentSourcesOpen
                ? 'bg-primary-200 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                : 'bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-300',
            )}
          >
            {uniqueDocumentSourcesCount}
          </span>
        </button>
      )}
      <button
        className="group flex items-center text-sm font-mono text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors ml-auto"
        onClick={onDelete}
      >
        <Trash2 size={16} />
        <span className="hidden sm:block max-w-0 overflow-hidden opacity-0 whitespace-nowrap transition-all duration-300 ease-in-out group-hover:max-w-xs group-hover:opacity-100 group-hover:ml-2">
          {t('common.delete')}
        </span>
      </button>
    </div>
  )
}

export default MessageActionBar
