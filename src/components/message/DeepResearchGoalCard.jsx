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
    <div className="w-full max-w-7xl bg-white/80 dark:bg-[#18181b]/60 backdrop-blur-md rounded-2xl p-4 sm:p-6 border border-gray-200/50 dark:border-zinc-700/50 shadow-lg dark:shadow-zinc-900/20 mb-4 sm:mb-8 cursor-text select-text transition-all duration-300 hover:shadow-xl hover:border-gray-300/50 dark:hover:border-zinc-600/50 group">
      <div className="flex flex-col gap-4 sm:gap-6">
        <div>
          <div className="text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
            <span className="p-1 bg-blue-50 dark:bg-blue-900/20 rounded-md">
              <EmojiDisplay emoji="🎯" size="1.2em" />
            </span>
            {t('messageBubble.researchGoalLabel')}
          </div>
          <div className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-50 leading-relaxed font-sans tracking-tight">
            {displayContent}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-2">
          <div className="bg-gray-50/50 dark:bg-zinc-800/30 rounded-xl p-3 sm:p-4 border border-gray-100 dark:border-zinc-700/30 transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800/50">
            <div className="text-gray-400 dark:text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-indigo-500"></div>
              {t('messageBubble.researchScopeLabel')}
            </div>
            <div className="text-gray-600 dark:text-gray-300 text-sm font-medium pl-3 border-l-2 border-indigo-500/20">
              Auto
            </div>
          </div>
          <div className="bg-gray-50/50 dark:bg-zinc-800/30 rounded-xl p-3 sm:p-4 border border-gray-100 dark:border-zinc-700/30 transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800/50">
            <div className="text-gray-400 dark:text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-emerald-500"></div>
              {t('messageBubble.researchRequirementsLabel')}
            </div>
            <div className="text-gray-600 dark:text-gray-300 text-sm font-medium pl-3 border-l-2 border-emerald-500/20">
              Auto
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DeepResearchGoalCard
