/**
 * FormStatusBadge Component
 * Displays status badge for interactive forms (waiting or submitted)
 */

import { useTranslation } from 'react-i18next'
import { Check, Clock } from 'lucide-react'
import clsx from 'clsx'

export default function FormStatusBadge({ waiting }) {
  const { t } = useTranslation()

  const statusLabel = waiting
    ? t('messageBubble.formStatus.waiting')
    : t('messageBubble.formStatus.submitted')

  const statusIcon = waiting ? (
    <Clock size={14} strokeWidth={2.5} />
  ) : (
    <Check size={14} strokeWidth={3} />
  )

  const lineColorClass = waiting
    ? 'from-sky-200/50 via-sky-300/50 to-transparent dark:from-sky-800/30 dark:via-sky-700/30'
    : 'from-emerald-200/50 via-emerald-300/50 to-transparent dark:from-emerald-800/30 dark:via-emerald-700/30'

  const badgeClass = waiting
    ? 'bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800/50'
    : 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/50'

  return (
    <div className="flex w-full items-center gap-3 my-4 opacity-90">
      <div className={clsx('h-px flex-1 bg-gradient-to-r', lineColorClass)} />

      <div
        className={clsx(
          'flex items-center gap-1.5 px-3 py-1 rounded-full border shadow-sm transition-all duration-300',
          'text-[11px] font-bold tracking-wider uppercase',
          badgeClass,
        )}
      >
        {statusIcon}
        <span>{statusLabel}</span>
      </div>

      <div className={clsx('h-px flex-1 bg-gradient-to-l', lineColorClass)} />
    </div>
  )
}
