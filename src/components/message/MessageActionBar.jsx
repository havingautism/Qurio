import clsx from 'clsx'
import {
  Check,
  Copy,
  Share2,
  ChevronDown,
  Download,
  RefreshCw,
  Trash2,
  FileText,
  GitBranch,
} from 'lucide-react'

const MessageActionBar = ({
  t,
  isDeepResearch,
  isMobile,
  onShare,
  onRegenerate,
  onCopy,
  isCopied,
  onDownloadPdf,
  onDownloadWord,
  isDownloadMenuOpen,
  setIsDownloadMenuOpen,
  downloadMenuRef,
  onOpenPipeline,
  onDelete,
}) => {
  return (
    <div className="mt-2 flex items-center gap-1 border-t border-gray-200/60 pt-3 dark:border-zinc-800/50">
      <button
        className="group flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-gray-500 transition-all duration-200 hover:bg-gray-100 hover:text-gray-700 dark:text-white dark:hover:bg-zinc-800 dark:hover:text-gray-200"
        onClick={onShare}
      >
        <Share2 size={16} strokeWidth={2} />
        <span className="hidden max-w-0 overflow-hidden text-xs font-medium whitespace-nowrap opacity-0 transition-all duration-300 ease-in-out group-hover:max-w-[60px] group-hover:opacity-100 sm:block">
          {t('message.share')}
        </span>
      </button>
      {onRegenerate && (
        <button
          className="group flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-gray-500 transition-all duration-200 hover:bg-gray-100 hover:text-gray-700 dark:text-white dark:hover:bg-zinc-800 dark:hover:text-gray-200"
          onClick={onRegenerate}
        >
          <RefreshCw size={16} strokeWidth={2} />
          <span className="hidden max-w-0 overflow-hidden text-xs font-medium whitespace-nowrap opacity-0 transition-all duration-300 ease-in-out group-hover:max-w-[80px] group-hover:opacity-100 sm:block">
            {t('message.regenerate')}
          </span>
        </button>
      )}
      <button
        className="group flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-gray-500 transition-all duration-200 hover:bg-gray-100 hover:text-gray-700 dark:text-white dark:hover:bg-zinc-800 dark:hover:text-gray-200"
        onClick={onCopy}
      >
        {isCopied ? (
          <>
            <Check size={16} strokeWidth={2.5} className="text-emerald-500" />
            <span className="hidden max-w-0 overflow-hidden text-xs font-medium whitespace-nowrap text-emerald-500 opacity-0 transition-all duration-300 ease-in-out group-hover:max-w-[60px] group-hover:opacity-100 sm:block">
              {t('message.copied')}
            </span>
          </>
        ) : (
          <>
            <Copy size={16} strokeWidth={2} />
            <span className="hidden max-w-0 overflow-hidden text-xs font-medium whitespace-nowrap opacity-0 transition-all duration-300 ease-in-out group-hover:max-w-[50px] group-hover:opacity-100 sm:block">
              {t('message.copy')}
            </span>
          </>
        )}
      </button>
      {onOpenPipeline && (
        <button
          className="group flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-gray-500 transition-all duration-200 hover:bg-gray-100 hover:text-gray-700 dark:text-white dark:hover:bg-zinc-800 dark:hover:text-gray-200"
          onClick={onOpenPipeline}
        >
          <GitBranch size={16} strokeWidth={2} />
          <span className="hidden max-w-0 overflow-hidden text-xs font-medium whitespace-nowrap opacity-0 transition-all duration-300 ease-in-out group-hover:max-w-[65px] group-hover:opacity-100 sm:block">
            {t('pipeline.title', 'Pipeline')}
          </span>
        </button>
      )}
      {isDeepResearch && (
        <div className="relative" ref={downloadMenuRef}>
          <button
            className="group flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-gray-500 transition-all duration-200 hover:bg-gray-100 hover:text-gray-700 dark:text-white dark:hover:bg-zinc-800 dark:hover:text-gray-200"
            onClick={() => setIsDownloadMenuOpen(prev => !prev)}
          >
            <Download size={16} strokeWidth={2} />
            <span className="hidden max-w-0 overflow-hidden text-xs font-medium whitespace-nowrap opacity-0 transition-all duration-300 ease-in-out group-hover:max-w-[80px] group-hover:opacity-100 sm:block">
              {t('messageBubble.download')}
            </span>
            <ChevronDown
              size={14}
              strokeWidth={2}
              className="hidden transition-transform duration-200 sm:block"
            />
          </button>
          {isDownloadMenuOpen && (
            <div
              className={clsx(
                'animate-in slide-in-from-top-2 absolute left-0 z-30 w-48 overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-2xl dark:border-zinc-700/60 dark:bg-[#1E1E1E]',
                isMobile ? 'bottom-full mb-2' : 'top-full mt-2',
              )}
            >
              <div className="flex flex-col gap-1 p-2">
                <button
                  type="button"
                  onClick={() => {
                    onDownloadPdf()
                    setIsDownloadMenuOpen(false)
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-white dark:hover:bg-zinc-700/50"
                >
                  <div className="rounded-lg bg-red-100 p-1.5 dark:bg-red-900/30">
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
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-white dark:hover:bg-zinc-700/50"
                >
                  <div className="rounded-lg bg-blue-100 p-1.5 dark:bg-blue-900/30">
                    <FileText size={14} className="text-blue-500" />
                  </div>
                  {t('messageBubble.downloadWord')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <button
        className="group ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-gray-500 transition-all duration-200 hover:bg-red-50 hover:text-red-600 dark:text-white dark:hover:bg-red-900/20 dark:hover:text-red-400"
        onClick={onDelete}
      >
        <Trash2 size={16} strokeWidth={2} />
        <span className="hidden max-w-0 overflow-hidden text-xs font-medium whitespace-nowrap opacity-0 transition-all duration-300 ease-in-out group-hover:max-w-[60px] group-hover:opacity-100 sm:block">
          {t('common.delete')}
        </span>
      </button>
    </div>
  )
}

export default MessageActionBar
