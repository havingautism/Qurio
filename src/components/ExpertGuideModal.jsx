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
    <div className={clsx('flex min-h-0 flex-col', isMobile ? 'h-full' : '')}>
      <div className={clsx('flex items-start justify-between', isMobile ? 'mb-4' : 'mb-4')}>
        <div className="flex items-center gap-2">
          {!isMobile && (
            <div className="glass-elite-chip rounded-xl p-2">
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
          className="glass-elite-chip rounded-full p-2 text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-300 dark:hover:text-white"
        >
          <X size={20} />
        </button>
      </div>

      <div className={clsx('space-y-6', isMobile ? 'min-h-0 flex-1 overflow-y-auto pb-2' : '')}>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('homeView.expertQuestionTitle')}
          </label>
          <textarea
            value={question}
            onChange={event => setQuestion(event.target.value)}
            placeholder={t('homeView.expertQuestionPlaceholder')}
            autoFocus={!isMobile}
            className={clsx(
              'focus:ring-primary-500/30 focus:border-primary-500 min-h-[140px] w-full resize-none rounded-2xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm transition-all focus:ring-4 focus:outline-none dark:border-zinc-700/50 dark:bg-zinc-800/50 dark:placeholder-gray-500',
              isMobile ? 'text-base' : '',
            )}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('homeView.expertSpaceTitle')}
          </label>
          <div
            className={clsx(
              'grid grid-cols-1 gap-3 sm:grid-cols-2',
              isMobile ? 'overflow-y-auto p-1' : 'max-h-[320px] overflow-y-auto p-1',
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
                    'glass-elite-soft relative flex items-center gap-3 rounded-[24px] p-4 text-left transition-all',
                    isSelected
                      ? 'border-primary-300/35 dark:border-primary-500/35 bg-white/82 dark:bg-white/[0.12]'
                      : 'hover:border-white/26 hover:bg-white/18 dark:hover:border-white/10 dark:hover:bg-white/[0.05]',
                  )}
                >
                  <div className="glass-elite-chip flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                    <EmojiDisplay emoji={space?.emoji} size="1.5rem" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-gray-900 dark:text-gray-100">
                      {getSpaceDisplayLabel(space, t)}
                    </span>
                  </div>
                  <div
                    className={clsx(
                      'mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all',
                      isSelected
                        ? 'border-primary-500 bg-primary-500'
                        : 'border-slate-300 dark:border-zinc-600',
                    )}
                  />
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div
        className={clsx(
          'mt-5 flex gap-2',
          isMobile
            ? 'shrink-0 border-t border-white/18 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.25rem)] dark:border-white/8'
            : 'justify-end',
        )}
      >
        {!isMobile && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-800"
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
        <DrawerContent className="h-[92dvh] max-h-[92dvh] overflow-hidden">
          <div className="flex h-full min-h-0 flex-col px-4 pt-4 pb-3">{content}</div>
        </DrawerContent>
      </Drawer>
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
      <div className="glass-elite-panel w-full max-w-xl rounded-[28px] border-0 p-5 shadow-2xl">
        {content}
      </div>
    </div>
  )
}

export default ExpertGuideModal
