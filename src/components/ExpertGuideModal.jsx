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
    const selectedSpace =
      availableSpaces.find(s => String(s.id) === String(selectedSpaceId)) || null
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

        <div className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('homeView.expertQuestionTitle')}
            </label>
            <textarea
              value={question}
              onChange={event => setQuestion(event.target.value)}
              placeholder={t('homeView.expertQuestionPlaceholder')}
              className="focus:ring-primary-500 dark:focus:ring-primary-500 min-h-[150px] w-full resize-y rounded-xl border-0 bg-gray-50 px-4 py-3 text-base text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-inset dark:bg-zinc-800/50 dark:text-gray-100 dark:ring-zinc-700 dark:placeholder:text-gray-500 dark:focus:bg-zinc-900"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('homeView.expertSpaceTitle')}
            </label>
            <div className="grid max-h-[320px] grid-cols-1 gap-3 overflow-y-auto p-1 sm:grid-cols-2">
              {availableSpaces.length === 0 && (
                <div className="col-span-full py-8 text-center text-sm text-gray-500 dark:text-gray-400">
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
                      'relative flex items-center gap-3 rounded-xl border p-4 text-left transition-all hover:shadow-md',
                      isSelected
                        ? 'border-primary-500 bg-primary-50/50 ring-primary-500 dark:border-primary-500 dark:bg-primary-900/20 ring-1'
                        : 'hover:border-primary-200 border-gray-200 bg-white hover:bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800',
                    )}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-gray-900/5 dark:bg-zinc-800 dark:ring-white/10">
                      <EmojiDisplay emoji={space?.emoji} size="1.5rem" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-gray-900 dark:text-gray-100">
                        {getSpaceDisplayLabel(space, t)}
                      </span>
                    </div>
                    {isSelected && (
                      <div className="bg-primary-500 absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full text-white">
                        <Check size={12} strokeWidth={3} />
                      </div>
                    )}
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
