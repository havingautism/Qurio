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
    <div className="mb-4 w-full max-w-7xl cursor-text rounded-2xl border border-gray-200/50 bg-white/80 p-4 backdrop-blur-md transition-all duration-300 select-text sm:mb-8 sm:p-6 dark:border-zinc-700/50 dark:bg-[#18181b]/60">
      <div className="flex flex-col gap-4 sm:gap-6">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold tracking-widest text-blue-600 uppercase dark:text-blue-400">
            <span className="rounded-md bg-blue-50 p-1 dark:bg-blue-900/20">
              <EmojiDisplay emoji="🎯" size="1.2em" />
            </span>
            {t('messageBubble.researchGoalLabel')}
          </div>
          <div className="font-sans text-lg leading-relaxed font-semibold tracking-tight text-gray-900 sm:text-xl dark:text-gray-50">
            {displayContent}
          </div>
        </div>

        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 transition-colors hover:bg-gray-50 sm:p-4 dark:border-zinc-700/30 dark:bg-zinc-800/40 dark:hover:bg-zinc-800/50">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-wider text-gray-400 uppercase dark:text-gray-500">
              <div className="h-1 w-1 rounded-full bg-indigo-500"></div>
              {t('messageBubble.researchScopeLabel')}
            </div>
            <div className="border-l-2 border-indigo-500/20 pl-3 text-sm font-medium text-gray-600 dark:text-gray-300">
              Auto
            </div>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 transition-colors hover:bg-gray-50 sm:p-4 dark:border-zinc-700/30 dark:bg-zinc-800/40 dark:hover:bg-zinc-800/50">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-wider text-gray-400 uppercase dark:text-gray-500">
              <div className="h-1 w-1 rounded-full bg-emerald-500"></div>
              {t('messageBubble.researchRequirementsLabel')}
            </div>
            <div className="border-l-2 border-emerald-500/20 pl-3 text-sm font-medium text-gray-600 dark:text-gray-300">
              Auto
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DeepResearchGoalCard
