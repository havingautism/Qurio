import { useState } from 'react'
import clsx from 'clsx'
import { ChevronDown, ChevronRight, LibraryBig, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import DesktopSourcesSection from '../DesktopSourcesSection'

const DeepResearchSourcesCard = ({ sources = [], title, countLabel }) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)

  if (!Array.isArray(sources) || sources.length === 0) return null

  return (
    <details
      className="group mt-0.5 mb-3.5"
      open={isOpen}
      onToggle={event => setIsOpen(event.currentTarget.open)}
    >
      <summary className="list-none">
        <div className="relative overflow-hidden rounded-2xl border border-gray-200/70 bg-white/70 px-4 py-3 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.5)] backdrop-blur-md transition-colors duration-300 hover:border-gray-300 hover:bg-white/85 dark:border-zinc-700/60 dark:bg-zinc-900/60 dark:hover:border-zinc-600 dark:hover:bg-zinc-900/75">
          <div className="relative flex cursor-pointer items-center justify-between gap-4 select-none">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200/80 bg-gray-100/90 text-gray-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-300">
                  <LibraryBig size={15} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
                    {t('messageBubble.researchAppendix')}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-gray-100">
                      {title}
                    </h3>
                    <div className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                      <Sparkles size={12} className="text-primary-500 dark:text-primary-400" />
                      <span>{countLabel}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div
              className={clsx(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200/80 bg-white/90 text-gray-500 transition-transform duration-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-300',
                isOpen ? 'rotate-180' : 'rotate-0',
              )}
            >
              {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </div>
          </div>
        </div>
      </summary>
      <DesktopSourcesSection sources={sources} isOpen={isOpen} variant="compact" />
    </details>
  )
}

export default DeepResearchSourcesCard
