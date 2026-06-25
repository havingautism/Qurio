import React, { memo } from 'react'
import { BrainCircuit } from 'lucide-react'
import remarkGfm from 'remark-gfm'
import { Streamdown } from 'streamdown'

const ExpertPlanPanel = memo(function ExpertPlanPanel({
  isExpertMessage,
  expertPlanBlock,
  t,
  mermaidOptions,
  markdownComponents,
  sanitizeDisplayText,
}) {
  if (!isExpertMessage || !expertPlanBlock) return null

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-2 text-gray-600 dark:text-gray-300">
        <BrainCircuit size={15} className="text-primary-500/80 dark:text-primary-300/75" />
        <span className="text-sm font-medium tracking-tight">{t('messageBubble.expertPlan')}</span>
      </div>
      <div className="border-primary-200/45 bg-primary-50/30 dark:border-primary-700/25 dark:bg-primary-900/12 rounded-xl border px-3.5 py-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        <Streamdown
          mermaid={mermaidOptions}
          remarkPlugins={[remarkGfm]}
          components={markdownComponents}
        >
          {sanitizeDisplayText(expertPlanBlock.content)}
        </Streamdown>
      </div>
    </div>
  )
})

ExpertPlanPanel.displayName = 'ExpertPlanPanel'

export default ExpertPlanPanel
