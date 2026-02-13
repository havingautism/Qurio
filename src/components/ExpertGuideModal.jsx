import { Drawer, DrawerContent } from '@/components/ui/drawer'
import clsx from 'clsx'
import { BrainCircuit, Check, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useIsMobile from '../hooks/useIsMobile'
import { getSpaceDisplayLabel } from '../lib/spaceDisplay'
import EmojiDisplay from './EmojiDisplay'

const ExpertGuideModal = ({ isOpen, onClose, spaces = [], onStart, loading = false }) => {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
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

  const handleSubmit = async () => {
    if (!canSubmit || loading) return
    const selectedSpace =
      availableSpaces.find(s => String(s.id) === String(selectedSpaceId)) || null
    if (!selectedSpace) return
    await onStart?.({ question: question.trim(), space: selectedSpace })
    setQuestion('')
    setSelectedSpaceId('')
  }

  const content = (
    <div className={clsx('flex flex-col', isMobile ? 'h-full' : '')}>
      <div className={clsx('flex items-start justify-between', isMobile ? 'mb-4' : 'mb-4')}>
        <div className="flex items-center gap-2">
          {!isMobile && (
            <div className="rounded-lg bg-gray-100 p-2 dark:bg-zinc-800">
              <BrainCircuit size={18} className="text-primary-500" />
            </div>
          )}
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
              {t('homeView.expertModalTitle')}
            </h3>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800 dark:hover:text-gray-200"
        >
          <X size={20} />
        </button>
      </div>

      <div className={clsx('space-y-6', isMobile ? 'flex-1 overflow-y-auto' : '')}>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('homeView.expertQuestionTitle')}
          </label>
          <textarea
            value={question}
            onChange={event => setQuestion(event.target.value)}
            placeholder={t('homeView.expertQuestionPlaceholder')}
            autoFocus={!isMobile}
            className="focus:ring-primary-500/20 focus:border-primary-500 min-h-[120px] w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm placeholder-gray-400 transition-all outline-none focus:ring-2 dark:border-zinc-700/50 dark:bg-zinc-800/50 dark:placeholder-gray-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('homeView.expertSpaceTitle')}
          </label>
          <div
            className={clsx(
              'grid grid-cols-1 gap-3 sm:grid-cols-2',
              isMobile ? '' : 'max-h-[320px] overflow-y-auto p-1',
            )}
          >
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

      <div
        className={clsx(
          'mt-5 flex gap-2',
          isMobile ? 'border-t border-gray-100 pt-4 dark:border-zinc-800/50' : 'justify-end',
        )}
      >
        {!isMobile && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-800"
          >
            {t('common.cancel')}
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          className={clsx(
            'bg-primary-500 hover:bg-primary-600 disabled:hover:bg-primary-500 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50',
            isMobile ? 'w-full py-3 text-base' : '',
          )}
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              <span>{t('common.loading')}</span>
            </div>
          ) : (
            t('homeView.expertStart')
          )}
        </button>
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={open => !open && onClose()}>
        <DrawerContent className="max-h-[85vh] rounded-t-3xl border-t border-gray-200 bg-white dark:border-zinc-800 dark:bg-[#1E1E1E]">
          <div className="flex h-full flex-col p-5">
            {content}
            <div className="h-6 shrink-0" />
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        {content}
      </div>
    </div>
  )
}

export default ExpertGuideModal
