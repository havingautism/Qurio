import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, ExternalLink, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'

const DesktopSourcesSheet = ({ isOpen, onClose, sources = [], title }) => {
  const { t } = useTranslation()
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const getHostname = url => {
    try {
      const hostname = new URL(url).hostname
      return hostname.replace(/^www\./, '')
    } catch {
      return t('sources.source')
    }
  }
  const resolveUrl = source => source?.url || source?.uri || source?.link || source?.href || ''

  return (
    <Drawer open={isOpen} onOpenChange={onClose} direction="right">
      <DrawerContent className="w-full sm:max-w-md md:max-w-lg lg:max-w-xl">
        {/* Header */}
        <DrawerHeader className="shrink-0 border-b border-gray-100 px-6 py-5 text-left dark:border-zinc-800/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-primary-500 bg-primary-500/10 flex h-10 w-10 items-center justify-center rounded-full">
                <Globe size={20} />
              </div>
              <div className="flex flex-col">
                <DrawerTitle className="text-base leading-none font-bold text-gray-900 dark:text-gray-100">
                  {title || t('sources.title', '参考资料')}
                </DrawerTitle>
                <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  {t('sources.resultsFound', { count: sources.length })}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="-mr-2 rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800 dark:hover:text-gray-200"
            >
              <X size={20} />
            </button>
          </div>
        </DrawerHeader>

        {/* Content */}
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-2">
          {sources.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              {t('sources.noSources', 'No Sources')}
            </div>
          ) : (
            <div className="flex flex-col gap-2 pt-2 pb-4">
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
                      className="group flex flex-col gap-2 rounded-xl border border-gray-100 bg-gray-50 p-4 transition-all hover:border-gray-200 hover:bg-gray-100 hover:shadow-sm active:scale-[0.98] dark:border-zinc-800/50 dark:bg-zinc-800/30 dark:hover:border-zinc-700/50 dark:hover:bg-zinc-800"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-[10px] font-bold text-gray-500 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-400">
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
                            className="h-5 w-5 rounded-full border border-white/80 bg-white object-cover shadow-sm transition-opacity group-hover:opacity-100 dark:border-zinc-800"
                          />
                        )}
                        <h4 className="mb-0 line-clamp-1 flex-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {source.title || getHostname(url)}
                        </h4>
                        <ExternalLink
                          size={16}
                          className="shrink-0 text-gray-300 transition-colors group-hover:text-gray-500 dark:text-zinc-600 dark:group-hover:text-gray-400"
                        />
                      </div>
                      <div className="pl-[2.25rem] text-xs text-gray-500 dark:text-gray-400">
                        {source.media || url}
                      </div>
                    </a>
                  )
                })}
            </div>
          )}
        </div>

        {/* Pagination Footer */}
        {Math.ceil(sources.length / itemsPerPage) > 1 && (
          <div className="shrink-0 border-t border-gray-100 bg-gray-50/50 p-4 dark:border-zinc-800/50 dark:bg-zinc-900/50">
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-full bg-white p-2 text-gray-600 shadow-sm transition-colors hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-white dark:bg-zinc-800 dark:text-gray-400 dark:hover:bg-zinc-700 dark:disabled:hover:bg-zinc-800"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {currentPage} / {Math.ceil(sources.length / itemsPerPage)}
              </span>
              <button
                onClick={() =>
                  setCurrentPage(p => Math.min(Math.ceil(sources.length / itemsPerPage), p + 1))
                }
                disabled={currentPage === Math.ceil(sources.length / itemsPerPage)}
                className="rounded-full bg-white p-2 text-gray-600 shadow-sm transition-colors hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-white dark:bg-zinc-800 dark:text-gray-400 dark:hover:bg-zinc-700 dark:disabled:hover:bg-zinc-800"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}

export default DesktopSourcesSheet
