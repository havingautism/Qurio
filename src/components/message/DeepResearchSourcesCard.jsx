import { useState } from 'react'
import clsx from 'clsx'
import { ChevronDown, ChevronRight, LibraryBig, Sparkles } from 'lucide-react'
import DesktopSourcesSection from '../DesktopSourcesSection'

const DeepResearchSourcesCard = ({ sources = [], title, countLabel }) => {
  const [isOpen, setIsOpen] = useState(false)

  if (!Array.isArray(sources) || sources.length === 0) return null

  return (
    <details
      className="group mt-3 mb-4"
      open={isOpen}
      onToggle={event => setIsOpen(event.currentTarget.open)}
    >
      <summary className="list-none">
        <div className="glass-elite-soft relative overflow-hidden rounded-[22px] border border-white/16 bg-gradient-to-r from-white/[0.08] via-white/[0.04] to-transparent px-4 py-3 transition-all duration-300 hover:border-white/24 dark:border-white/10 dark:from-white/[0.05] dark:via-white/[0.025]">
          <div className="bg-primary-500/12 absolute inset-x-0 top-0 h-px" />
          <div className="bg-primary-500/10 absolute top-2 right-6 h-10 w-10 rounded-full blur-2xl" />
          <div className="relative flex cursor-pointer items-center justify-between gap-4 select-none">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <div className="bg-primary-500/12 text-primary-600 dark:text-primary-300 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/16 dark:border-white/10">
                  <LibraryBig size={15} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
                    Research Appendix
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
                'bg-primary-500/12 text-primary-600 dark:text-primary-300 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/14 transition-transform duration-300 dark:border-white/10',
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
