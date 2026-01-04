import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const DesktopSourcesSection = ({ sources = [], isOpen }) => {
  const { t } = useTranslation()
  const [currentPage, setCurrentPage] = useState(1)

  const itemsPerPage = 9
  const totalPages = Math.ceil(sources.length / itemsPerPage)

  const currentSources = sources.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const getHostname = url => {
    try {
      const hostname = new URL(url).hostname
      return hostname.replace(/^www\./, '')
    } catch (e) {
      return t('sources.source')
    }
  }
  const resolveUrl = source => source?.url || source?.uri || source?.link || source?.href || ''

  return (
    <div
      className={`grid transition-all duration-300 ease-spring overflow-hidden w-full ${
        isOpen ? 'grid-rows-[1fr] opacity-100 mt-3 pb-2' : 'grid-rows-[0fr] opacity-0 mt-0'
      }`}
    >
      <div className="min-h-0 w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {currentSources.map((source, idx) => {
            const url = resolveUrl(source)
            // Calculate absolute index for formatting
            const absoluteIndex = (currentPage - 1) * itemsPerPage + idx
            return (
              <a
                key={url || absoluteIndex}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2.5 p-2.5 rounded-xl bg-gray-50 dark:bg-zinc-800/50 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors group border border-gray-200 dark:border-zinc-700/50"
              >
                <div className="mt-0.5 shrink-0 w-4 h-4 rounded text-[9px] font-medium bg-white dark:bg-zinc-700 text-gray-500 dark:text-gray-400 flex items-center justify-center border border-gray-200 dark:border-zinc-600 shadow-sm">
                  {absoluteIndex + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 line-clamp-2 leading-snug mb-0.5 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                    {source.title || url}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(source.icon || url) && (
                      <img
                        src={
                          source.icon ||
                          `https://www.google.com/s2/favicons?domain=${getHostname(url)}&sz=128`
                        }
                        alt=""
                        className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-all rounded-full"
                      />
                    )}
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                      {source.media || getHostname(url)}
                    </div>
                  </div>
                </div>
              </a>
            )
          })}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-4 py-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-gray-600 dark:text-gray-400"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-gray-600 dark:text-gray-400"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default DesktopSourcesSection
