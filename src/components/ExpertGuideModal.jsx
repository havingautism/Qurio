import clsx from 'clsx'
import { BrainCircuit, Check, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import EmojiDisplay from './EmojiDisplay'
import { getSpaceDisplayLabel } from '../lib/spaceDisplay'

const ExpertGuideModal = ({ isOpen, onClose, spaces = [], onStart, loading = false }) => {
  const { t } = useTranslation()
  const [question, setQuestion] = useState('')
  const [selectedSpaceId, setSelectedSpaceId] = useState('')

  const availableSpaces = useMemo(
    () =>
      (spaces || []).filter(
        space => !(space?.isDeepResearchSystem || space?.isDeepResearch || space?.is_deep_research),
      ),
    [spaces],
  )

  const canSubmit = question.trim().length > 0 && selectedSpaceId

  if (!isOpen) return null

  const handleSubmit = async () => {
    if (!canSubmit || loading) return
    const selectedSpace = availableSpaces.find(s => String(s.id) === String(selectedSpaceId)) || null
    if (!selectedSpace) return
    await onStart?.({ question: question.trim(), space: selectedSpace })
    setQuestion('')
    setSelectedSpaceId('')
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-gray-100 p-2 dark:bg-zinc-800">
              <BrainCircuit size={18} className="text-primary-500" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {t('homeView.expertModalTitle')}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('homeView.expertQuestionTitle')}
            </label>
            <textarea
              value={question}
              onChange={event => setQuestion(event.target.value)}
              placeholder={t('homeView.expertQuestionPlaceholder')}
              className="min-h-[110px] w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-200"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('homeView.expertSpaceTitle')}
            </label>
            <div className="max-h-52 space-y-2 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-zinc-700 dark:bg-zinc-800/40">
              {availableSpaces.length === 0 && (
                <div className="px-2 py-3 text-xs text-gray-500 dark:text-gray-400">
                  {t('homeView.expertNoSpace')}
                </div>
              )}
              {availableSpaces.map(space => {
                const isSelected = String(selectedSpaceId) === String(space.id)
                return (
                  <button
                    key={space.id}
                    type="button"
                    onClick={() => setSelectedSpaceId(String(space.id))}
                    className={clsx(
                      'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      isSelected
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                        : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-zinc-900 dark:text-gray-200 dark:hover:bg-zinc-700',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <EmojiDisplay emoji={space?.emoji} size="1rem" />
                      <span className="truncate">{getSpaceDisplayLabel(space, t)}</span>
                    </span>
                    {isSelected && <Check size={14} className="shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-800"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || loading}
            className="bg-primary-500 hover:bg-primary-600 disabled:hover:bg-primary-500 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('homeView.expertStart')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ExpertGuideModal
