import { useMemo } from 'react'
import clsx from 'clsx'
import {
  Check,
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
    <div className="flex items-center gap-1 border-t border-gray-200/60 dark:border-zinc-800/50 pt-3 mt-2">
      <button
        className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-gray-500 dark:text-white hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all duration-200"
        onClick={onShare}
      >
        <Share2 size={16} strokeWidth={2} />
        <span className="hidden sm:block text-xs font-medium max-w-0 overflow-hidden opacity-0 whitespace-nowrap transition-all duration-300 ease-in-out group-hover:max-w-[60px] group-hover:opacity-100">
          {t('message.share')}
        </span>
      </button>
      <button
        className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-gray-500 dark:text-white hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all duration-200"
        onClick={onRegenerate}
      >
        <RefreshCw size={16} strokeWidth={2} />
        <span className="hidden sm:block text-xs font-medium max-w-0 overflow-hidden opacity-0 whitespace-nowrap transition-all duration-300 ease-in-out group-hover:max-w-[80px] group-hover:opacity-100">
          {t('message.regenerate')}
        </span>
      </button>
      <button
        className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-gray-500 dark:text-white hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all duration-200"
        onClick={onCopy}
      >
        {isCopied ? (
          <>
            <Check size={16} strokeWidth={2.5} className="text-emerald-500" />
            <span className="hidden sm:block text-xs font-medium text-emerald-500 max-w-0 overflow-hidden opacity-0 whitespace-nowrap transition-all duration-300 ease-in-out group-hover:max-w-[60px] group-hover:opacity-100">
              {t('message.copied')}
            </span>
          </>
        ) : (
          <>
            <Copy size={16} strokeWidth={2} />
            <span className="hidden sm:block text-xs font-medium max-w-0 overflow-hidden opacity-0 whitespace-nowrap transition-all duration-300 ease-in-out group-hover:max-w-[50px] group-hover:opacity-100">
              {t('message.copy')}
            </span>
          </>
        )}
      </button>
      {isDeepResearch && (
        <div className="relative" ref={downloadMenuRef}>
          <button
            className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-gray-500 dark:text-white hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all duration-200"
            onClick={() => setIsDownloadMenuOpen(prev => !prev)}
          >
            <Download size={16} strokeWidth={2} />
            <span className="hidden sm:block text-xs font-medium max-w-0 overflow-hidden opacity-0 whitespace-nowrap transition-all duration-300 ease-in-out group-hover:max-w-[80px] group-hover:opacity-100">
              {t('messageBubble.download')}
            </span>
            <ChevronDown size={14} strokeWidth={2} className="hidden sm:block transition-transform duration-200" />
          </button>
          {isDownloadMenuOpen && (
            <div
              className={clsx(
                'absolute left-0 w-48 bg-white dark:bg-[#1E1E1E] border border-gray-200/60 dark:border-zinc-700/60 rounded-2xl shadow-2xl z-30 overflow-hidden animate-in slide-in-from-top-2',
                isMobile ? 'bottom-full mb-2' : 'top-full mt-2',
              )}
            >
              <div className="p-2 flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => {
                    onDownloadPdf()
                    setIsDownloadMenuOpen(false)
                  }}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left text-sm text-gray-700 dark:text-white font-medium"
                >
                  <div className="p-1.5 bg-red-100 dark:bg-red-900/30 rounded-lg">
                    <FileText size={14} className="text-red-500" />
                  </div>
                  {t('messageBubble.downloadPdf')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDownloadWord()
                    setIsDownloadMenuOpen(false)
                  }}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left text-sm text-gray-700 dark:text-white font-medium"
                >
                  <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <FileText size={14} className="text-blue-500" />
                  </div>
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
            'group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all duration-200',
            isSourcesOpen
              ? 'text-primary-600 dark:text-primary-400 font-medium bg-primary-50 dark:bg-primary-900/20'
              : 'text-gray-500 dark:text-white hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800',
          )}
        >
          <Globe size={16} strokeWidth={2} />
          <span className="hidden sm:block text-xs font-medium max-w-0 overflow-hidden opacity-0 whitespace-nowrap transition-all duration-300 ease-in-out group-hover:max-w-[60px] group-hover:opacity-100">
            {t('sources.title')}
          </span>
          <span
            className={clsx(
              'flex items-center justify-center rounded-full text-[10px] font-semibold w-5 h-5 transition-colors',
              isSourcesOpen
                ? 'bg-primary-200 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                : 'bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-white',
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
            'group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all duration-200',
            isDocumentSourcesOpen
              ? 'text-primary-600 dark:text-primary-400 font-medium bg-primary-50 dark:bg-primary-900/20'
              : 'text-gray-500 dark:text-white hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800',
          )}
        >
          <FileText size={16} strokeWidth={2} />
          <span className="hidden sm:block text-xs font-medium max-w-0 overflow-hidden opacity-0 whitespace-nowrap transition-all duration-300 ease-in-out group-hover:max-w-[100px] group-hover:opacity-100">
            {t('sources.documentSources')}
          </span>
          <span
            className={clsx(
              'flex items-center justify-center rounded-full text-[10px] font-semibold w-5 h-5 transition-colors',
              isDocumentSourcesOpen
                ? 'bg-primary-200 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                : 'bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-white',
            )}
          >
            {uniqueDocumentSourcesCount}
          </span>
        </button>
      )}
      <button
        className="group flex items-center gap-1.5 ml-auto px-2.5 py-1.5 rounded-lg text-gray-500 dark:text-white hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200"
        onClick={onDelete}
      >
        <Trash2 size={16} strokeWidth={2} />
        <span className="hidden sm:block text-xs font-medium max-w-0 overflow-hidden opacity-0 whitespace-nowrap transition-all duration-300 ease-in-out group-hover:max-w-[60px] group-hover:opacity-100">
          {t('common.delete')}
        </span>
      </button>
    </div>
  )
}

export default MessageActionBar
