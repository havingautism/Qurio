import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import EmojiDisplay from '../EmojiDisplay'

const escapeLabel = label => label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')

const extractQuestion = (rawContent, t) => {
  const questionLabel = t('homeView.deepResearchQuestionLabel')
  const scopeLabel = t('homeView.deepResearchScopeLabel')
  const outputLabel = t('homeView.deepResearchOutputLabel')
  const lines = rawContent.split(/\r?\n/).map(line => line.trim())
  const questionPattern = new RegExp(`^\\s*${escapeLabel(questionLabel)}\\s*:\\s*(.+)$`)
  const matchLine = lines.find(line => questionPattern.test(line))
  if (matchLine) {
    const match = matchLine.match(questionPattern)
    return match?.[1]?.trim() || ''
  }

  let cleaned = rawContent
    .replace(new RegExp(`${escapeLabel(questionLabel)}\\s*:\\s*`, 'i'), '')
    .replace(/Research question:\s*/i, '')
  const scopeIndex = cleaned.search(new RegExp(`\\n\\s*${escapeLabel(scopeLabel)}\\s*:`, 'i'))
  const outputIndex = cleaned.search(new RegExp(`\\n\\s*${escapeLabel(outputLabel)}\\s*:`, 'i'))
  const engScopeIndex = cleaned.search(/\n\s*Research scope\s*:/i)
  const engOutputIndex = cleaned.search(/\n\s*Output requirements\s*:/i)
  const cutIndex = [scopeIndex, outputIndex, engScopeIndex, engOutputIndex]
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0]
  if (cutIndex !== undefined) {
    cleaned = cleaned.slice(0, cutIndex)
  }
  return cleaned.trim()
}

const DeepResearchGoalCard = ({ content }) => {
  const { t } = useTranslation()
  const displayContent = useMemo(() => {
    const rawContent = String(content || '').trim()
    if (!rawContent) return ''
    return extractQuestion(rawContent, t)
  }, [content, t])

  return (
    <div className="w-full max-w-2xl bg-white dark:bg-[#18181b]/50 backdrop-blur-sm rounded-2xl p-5 border border-gray-200 dark:border-zinc-800 shadow-sm mb-6 sm:mb-10 cursor-text select-text">
      <div className="flex flex-col gap-4">
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
          <div className="flex-1 bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-3 border border-gray-100 dark:border-zinc-700/50">
            <div className="text-gray-400 dark:text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-1">
              {t('messageBubble.researchScopeLabel')}
            </div>
            <div className="text-gray-700 dark:text-gray-300 text-sm font-medium">Auto</div>
          </div>
          <div className="flex-1 bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-3 border border-gray-100 dark:border-zinc-700/50">
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
