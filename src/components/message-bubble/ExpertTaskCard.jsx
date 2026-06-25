import React, { memo } from 'react'
import { Clock, User } from 'lucide-react'

const ExpertTaskCard = memo(function ExpertTaskCard({
  isExpertMessage,
  activeExpertTaskCard,
  expertTeamMode,
  t,
}) {
  if (!isExpertMessage || !activeExpertTaskCard) return null

  if (activeExpertTaskCard.kind === 'task') {
    return (
      <div className="border-primary-200/50 bg-primary-50/26 dark:border-primary-700/30 dark:bg-primary-900/12 mb-4 rounded-2xl border px-3.5 py-3 text-sm leading-relaxed text-gray-700 dark:text-gray-200">
        <div className="mb-2.5 flex items-center gap-2">
          <span className="bg-primary-500/12 text-primary-700 dark:bg-primary-500/18 dark:text-primary-300 inline-flex rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide">
            {t(activeExpertTaskCard.labelKey)}
          </span>
        </div>
        <div className="flex items-start gap-2.5">
          <span className="bg-primary-500 mt-2 h-1.5 w-1.5 shrink-0 rounded-full" />
          <span>{activeExpertTaskCard.task}</span>
        </div>
      </div>
    )
  }

  if (activeExpertTaskCard.kind === 'empty') {
    return (
      <div className="mb-4 rounded-2xl border border-gray-200/70 bg-white/62 px-3.5 py-3 text-sm text-gray-600 shadow-[0_6px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl dark:border-zinc-700/55 dark:bg-zinc-900/38 dark:text-gray-300">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-gray-200/70 bg-white/80 text-gray-500 dark:border-zinc-700/60 dark:bg-zinc-800/70 dark:text-zinc-400">
            {expertTeamMode === 'route' ? <User size={15} /> : <Clock size={15} />}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-gray-800 dark:text-gray-100">
              {t(activeExpertTaskCard.titleKey)}
            </div>
            <div className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              {t(activeExpertTaskCard.bodyKey)}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
})

ExpertTaskCard.displayName = 'ExpertTaskCard'

export default ExpertTaskCard
