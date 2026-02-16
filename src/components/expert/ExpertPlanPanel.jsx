import { BrainCircuit, ChevronDown } from 'lucide-react'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

const formatPlanText = raw => {
  const text = String(raw || '').trim()
  if (!text) return ''

  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.plan === 'string' && parsed.plan.trim()) {
        return parsed.plan.trim()
      }
      return JSON.stringify(parsed, null, 2)
    }
  } catch {
    // Keep raw text if not JSON.
  }

  return text
}

const ExpertPlanPanel = ({ planText = '' }) => {
  const { t } = useTranslation()
  const content = useMemo(() => formatPlanText(planText), [planText])
  if (!content) return null

  return (
    <details className="group mb-4" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-1 text-gray-600 select-none hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100">
        <div className="flex items-center gap-2">
          <BrainCircuit size={15} className="text-primary-500/80 dark:text-primary-300/75" />
          <span className="text-sm font-medium tracking-tight">
            {t('messageBubble.expertPlan')}
          </span>
          <span className="rounded-full bg-gray-100/80 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-zinc-800/80 dark:text-gray-300">
            1
          </span>
        </div>
        <ChevronDown size={15} className="opacity-60 transition-transform group-open:rotate-180" />
      </summary>
      <div className="always-visible-scrollbar mt-1 max-h-[220px] overflow-y-auto border-l border-gray-300/80 pr-2 pl-4 text-sm leading-relaxed whitespace-pre-wrap text-gray-600 dark:border-zinc-700/80 dark:text-gray-300">
        {content}
      </div>
    </details>
  )
}

export default React.memo(ExpertPlanPanel)
