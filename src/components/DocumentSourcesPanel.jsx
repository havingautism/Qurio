import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

const DocumentSourcesPanel = ({ sources = [], isOpen }) => {
  const { t } = useTranslation()

  if (!sources || sources.length === 0) return null

  return (
    <div
      className={clsx(
        'grid transition-all duration-300 ease-spring overflow-hidden w-full',
        isOpen ? 'grid-rows-[1fr] opacity-100 mt-3 pb-2' : 'grid-rows-[0fr] opacity-0 mt-0',
      )}
    >
      <div className="min-h-0 w-full">
        <div className="grid grid-cols-1 gap-3">
          {sources.map((source, idx) => (
            <div
              key={source.id || idx}
              className="p-3 rounded-2xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/50 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {t('sources.documentSources')}
                </div>
                {source.fileType && (
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {source.fileType}
                  </span>
                )}
              </div>
              <div className="text-sm font-semibold text-gray-900 dark:text-white truncate mt-1">
                {source.title}
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 line-clamp-4">
                {source.snippet}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default DocumentSourcesPanel
