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
        <DrawerHeader className="shrink-0 border-b border-white/18 px-6 py-5 text-left dark:border-white/8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="glass-elite-chip text-primary-500 flex h-10 w-10 items-center justify-center rounded-full">
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
              className="glass-elite-chip -mr-2 rounded-full p-2 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-200"
            >
              <X size={20} />
            </button>
          </div>
        </DrawerHeader>

        {/* Content */}
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-2">
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
                      className="glass-elite-soft group flex flex-col gap-2 rounded-[28px] p-4 transition-all hover:border-white/28 hover:bg-white/18 active:scale-[0.98] dark:hover:border-white/12 dark:hover:bg-white/[0.04]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="glass-elite-chip flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-gray-500 dark:text-gray-400">
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
                            className="h-5 w-5 rounded-full border border-white/70 bg-white/90 object-cover shadow-sm transition-opacity group-hover:opacity-100 dark:border-white/10 dark:bg-white/10"
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
          <div className="shrink-0 border-t border-white/18 p-4 dark:border-white/8">
            <div className="glass-elite-soft mx-auto flex w-fit items-center justify-center gap-6 rounded-full px-4 py-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="glass-elite-chip rounded-full p-2 text-gray-600 transition-colors disabled:opacity-30 dark:text-gray-400"
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
                className="glass-elite-chip rounded-full p-2 text-gray-600 transition-colors disabled:opacity-30 dark:text-gray-400"
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
