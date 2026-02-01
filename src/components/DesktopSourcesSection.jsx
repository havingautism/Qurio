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
      className={`ease-spring grid w-full overflow-hidden transition-all duration-300 ${
        isOpen ? 'mt-3 grid-rows-[1fr] pb-2 opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="min-h-0 w-full">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
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
                className="group flex items-start gap-2.5 rounded-xl border border-gray-200 bg-gray-50 p-2.5 transition-colors hover:bg-gray-100 dark:border-zinc-700/50 dark:bg-zinc-800/50 dark:hover:bg-zinc-800"
              >
                <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-gray-200 bg-white text-[9px] font-medium text-gray-500 shadow-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-gray-400">
                  {absoluteIndex + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="group-hover:text-primary-600 dark:group-hover:text-primary-400 mb-0.5 line-clamp-2 text-xs leading-snug font-semibold text-gray-800 transition-colors dark:text-gray-200">
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
                        className="h-3 w-3 rounded-full opacity-60 transition-all group-hover:opacity-100"
                      />
                    )}
                    <div className="truncate text-[10px] text-gray-400 dark:text-gray-500">
                      {source.media || getHostname(url)}
                    </div>
                  </div>
                </div>
              </a>
            )
          })}
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-4 py-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-full p-1 text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent dark:text-gray-400 dark:hover:bg-zinc-800"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-full p-1 text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent dark:text-gray-400 dark:hover:bg-zinc-800"
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
