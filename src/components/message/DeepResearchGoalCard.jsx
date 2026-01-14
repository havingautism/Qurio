import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import EmojiDisplay from '../EmojiDisplay'

const escapeLabel = label => label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')

const extractQuestion = (rawContent, t) => {
  // Define patterns for supported languages
  const patterns = [
    {
      lang: 'en',
      question: ['Research question', 'Research goal'],
      scope: ['Research scope'],
      output: ['Output requirements'],
    },
    {
      lang: 'zh',
      question: ['研究问题', '研究目标'],
      scope: ['研究范围'],
      output: ['输出要求'],
    },
    // Add patterns from translation files as a fallback
    {
      lang: 'local',
      question: [t('homeView.deepResearchQuestionLabel')],
      scope: [t('homeView.deepResearchScopeLabel')],
      output: [t('homeView.deepResearchOutputLabel')],
    },
  ]

  let bestMatchContent = rawContent
  let minCutIndex = rawContent.length

  // First, try to strip the question label if present at the start
  for (const pattern of patterns) {
    for (const qLabel of pattern.question) {
      if (!qLabel) continue
      const regex = new RegExp(`^\\s*${escapeLabel(qLabel)}\\s*:\\s*`, 'i')
      if (regex.test(bestMatchContent)) {
        bestMatchContent = bestMatchContent.replace(regex, '')
      }
      // Also check within text if not at start (for safety)
      const regexInline = new RegExp(`${escapeLabel(qLabel)}\\s*:\\s*`, 'i')
      bestMatchContent = bestMatchContent.replace(regexInline, '')
    }
  }

  // Now find the earliest occurrence of ANY next section label (scope or output)
  // regardless of language, to safely cut the content.
  for (const pattern of patterns) {
    const nextSectionLabels = [...pattern.scope, ...pattern.output]
    for (const label of nextSectionLabels) {
      if (!label) continue
      const regex = new RegExp(`\\n\\s*${escapeLabel(label)}\\s*:`, 'i')
      const index = bestMatchContent.search(regex)
      if (index >= 0 && index < minCutIndex) {
        minCutIndex = index
      }
    }
  }

  if (minCutIndex < bestMatchContent.length) {
    bestMatchContent = bestMatchContent.slice(0, minCutIndex)
  }

  return bestMatchContent.trim()
}

const DeepResearchGoalCard = ({ content }) => {
  const { t } = useTranslation()
  const displayContent = useMemo(() => {
    const rawContent = String(content || '').trim()
    if (!rawContent) return ''
    return extractQuestion(rawContent, t)
  }, [content, t])

  return (
    <div className="w-full bg-white dark:bg-[#18181b]/50 backdrop-blur-sm rounded-2xl p-3 sm:p-5 border border-gray-200 dark:border-zinc-800 shadow-sm mb-3 sm:mb-10 cursor-text select-text">
      <div className="flex flex-col gap-3 sm:gap-4">
        <div>
          <div className="text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <EmojiDisplay emoji="🎯" size="1.1em" />
            {t('messageBubble.researchGoalLabel')}
          </div>
          <div className="text-base font-medium text-gray-900 dark:text-gray-100 leading-relaxed font-sans">
            {displayContent}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mt-1">
          <div className="flex-1 bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-2.5 sm:p-3 border border-gray-100 dark:border-zinc-700/50">
            <div className="text-gray-400 dark:text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-1">
              {t('messageBubble.researchScopeLabel')}
            </div>
            <div className="text-gray-700 dark:text-gray-300 text-sm font-medium">Auto</div>
          </div>
          <div className="flex-1 bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-2.5 sm:p-3 border border-gray-100 dark:border-zinc-700/50">
            <div className="text-gray-400 dark:text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-1">
              {t('messageBubble.researchRequirementsLabel')}
            </div>
            <div className="text-gray-700 dark:text-gray-300 text-sm font-medium">Auto</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DeepResearchGoalCard
